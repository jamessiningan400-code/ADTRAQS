<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/processors-table.php';

header('Content-Type: application/json');

ensureProcessorTable($pdo);

try {
    $forwardedColumn = $pdo->query("SHOW COLUMNS FROM documents LIKE 'date_forwarded'")->fetch();
    if ($forwardedColumn && $forwardedColumn['Null'] !== 'YES') {
        $pdo->exec('ALTER TABLE documents MODIFY date_forwarded DATETIME NULL');
    }
} catch (Throwable $ignored) {}

$data = json_decode(file_get_contents('php://input'), true) ?? [];
$method = $_SERVER['REQUEST_METHOD'];

function respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if ($method === 'POST') {
    $required = [
        'control_no', 'date_entered', 'type', 'office', 'payroll_voucher',
        'particulars', 'fund', 'amount', 'signature', 'user_id',
    ];

    foreach ($required as $field) {
        if (!isset($data[$field]) || $data[$field] === '') {
            respond(400, ['success' => false, 'message' => "Missing required field: {$field}"]);
        }
    }

    try {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare(
            'INSERT INTO documents (
                control_no, date_entered, type, sub_type, office, payroll_voucher,
                particulars, fund, amount, signature, date_forwarded, status,
                cheque_no, date_returned, pr_number, qr_generated, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            (string) $data['control_no'],
            (string) $data['date_entered'],
            (string) $data['type'],
            $data['sub_type'] ?? null,
            (string) $data['office'],
            (string) $data['payroll_voucher'],
            (string) $data['particulars'],
            (string) $data['fund'],
            (float) $data['amount'],
            (string) $data['signature'],
            $data['date_forwarded'] ?? null,
            $data['status'] ?? 'For Signature',
            $data['cheque_no'] ?? null,
            $data['date_returned'] ?? null,
            $data['pr_number'] ?? null,
            !empty($data['qr_generated']) ? 1 : 0,
            (int) $data['user_id'],
        ]);

        $documentId = (int) $pdo->lastInsertId();
        $createdAtStmt = $pdo->prepare('SELECT created_at FROM documents WHERE control_no = ?');
        $createdAtStmt->execute([(string) $data['control_no']]);
        $createdAt = $createdAtStmt->fetchColumn();
        $pdo->commit();

        respond(201, [
            'success' => true,
            'message' => 'Document added successfully.',
            'id' => $documentId,
            'created_at' => $createdAt,
        ]);
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        respond(400, ['success' => false, 'message' => $e->getMessage()]);
    }
}

if ($method === 'PUT') {
    if (!isset($data['id']) || $data['id'] === '') {
        respond(400, ['success' => false, 'message' => 'Document id is required.']);
    }

    try {
        $documentStmt = $pdo->prepare(
            'SELECT id, control_no
             FROM documents
             WHERE control_no = ?
             LIMIT 1'
        );
        $documentStmt->execute([(string) $data['id']]);
        $document = $documentStmt->fetch();
        if (!$document) {
            respond(404, ['success' => false, 'message' => 'Document not found.']);
        }
        $forwardToProcessors = !empty($data['forward_to_processors']);
        if ($forwardToProcessors) {
            $processorName = trim((string) ($data['processor_name'] ?? ''));
            $processorContact = trim((string) ($data['processor_contact_number'] ?? ''));
            if ($processorName === '' || !preg_match('/^\d{11}$/', $processorContact)) {
                respond(422, ['success' => false, 'message' => 'Processor name and an 11-digit contact number are required.']);
            }
            $groupStmt = $pdo->prepare(
                'SELECT 1 FROM document_group_documents WHERE document_id = ? LIMIT 1'
            );
            $groupStmt->execute([$document['id']]);
            if ($groupStmt->fetchColumn()) {
                respond(422, ['success' => false, 'message' => 'Processor forwarding is available for individual documents only.']);
            }
        }
        $pdo->beginTransaction();
        $processorId = null;
        if ($forwardToProcessors) {
            $processorStmt = $pdo->prepare(
                'INSERT INTO processors (full_name, contact_number) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)'
            );
            $processorStmt->execute([$processorName, $processorContact]);
            $processorId = (int) $pdo->lastInsertId();
        }
        $returned = $data['date_returned'] ?? null;
        $stmt = $pdo->prepare(
            'UPDATE documents
             SET type = ?, sub_type = ?, office = ?, payroll_voucher = ?,
                 signature = ?, particulars = ?, fund = ?, amount = ?, cheque_no = ?,
                  pr_number = ?, processor_name = ?, processor_contact_number = ?,
                  processor_id = COALESCE(?, processor_id),
                  qr_generated = CASE WHEN ? = 1 THEN 1 ELSE qr_generated END,
                  date_forwarded = CASE WHEN ? = 1
                    THEN COALESCE(NULLIF(date_forwarded, \'0000-00-00 00:00:00\'), NOW())
                    ELSE date_forwarded END,
                  date_returned = COALESCE(NULLIF(date_returned, \'0000-00-00 00:00:00\'), ?),
                  updated_by = ?, updated_at = NOW()
             WHERE control_no = ?'
        );
        $stmt->execute([
            (string) ($data['type'] ?? 'DV'),
            $data['sub_type'] ?? null,
            (string) ($data['office'] ?? ''),
            (string) ($data['payroll_voucher'] ?? ''),
            (string) ($data['signature'] ?? ''),
            (string) ($data['particulars'] ?? ''),
            (string) ($data['fund'] ?? ''),
            (float) ($data['amount'] ?? 0),
            $data['cheque_no'] ?? null,
            $data['pr_number'] ?? null,
            trim((string) ($data['processor_name'] ?? '')) ?: null,
            trim((string) ($data['processor_contact_number'] ?? '')) ?: null,
            $processorId,
            !empty($data['qr_generated']) ? 1 : 0,
            $forwardToProcessors ? 1 : 0,
            $returned,
            isset($data['user_id']) && (int) $data['user_id'] > 0 ? (int) $data['user_id'] : null,
            (string) $data['id'],
        ]);
        $pdo->commit();

        $forwardedStmt = $pdo->prepare('SELECT date_forwarded FROM documents WHERE control_no = ? LIMIT 1');
        $forwardedStmt->execute([(string) $data['id']]);
        respond(200, [
            'success' => true,
            'message' => 'Document updated successfully.',
            'dateForwarded' => $forwardedStmt->fetchColumn() ?: null,
        ]);
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        respond(400, ['success' => false, 'message' => $e->getMessage()]);
    }
}

respond(405, ['success' => false, 'message' => 'Method not allowed.']);
