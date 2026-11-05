<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/auth/document-access.php';
require_once __DIR__ . '/office-documents-table.php';

header('Content-Type: application/json');

adtraqsEnsureOfficeDocumentTables($pdo);

try {
    $forwardedColumn = $pdo->query("SHOW COLUMNS FROM documents LIKE 'date_forwarded'")->fetch();
    if ($forwardedColumn && $forwardedColumn['Null'] !== 'YES') {
        $pdo->exec('ALTER TABLE documents MODIFY date_forwarded DATETIME NULL');
    }
} catch (Throwable $ignored) {}

$data = json_decode(file_get_contents('php://input'), true) ?? [];
$method = $_SERVER['REQUEST_METHOD'];
$sessionUser = adtraqsGetSessionUser($pdo);
$assignedOfficeCode = $sessionUser
    ? adtraqsNormalizeTrackingOffice($pdo, (string) ($sessionUser['office'] ?? ''))
    : null;

function respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if ($method === 'POST') {
    if (!$sessionUser) {
        respond(401, ['success' => false, 'message' => 'Sign in before creating documents.']);
    }

    $required = [
        'date_entered', 'type', 'office', 'payroll_voucher',
        'particulars', 'fund', 'amount', 'signature',
    ];

    foreach ($required as $field) {
        if (!isset($data[$field]) || $data[$field] === '') {
            respond(400, ['success' => false, 'message' => "Missing required field: {$field}"]);
        }
    }
    if ($assignedOfficeCode === null) {
        respond(403, ['success' => false, 'message' => 'Your account must be assigned to an active office before creating documents.']);
    }
    $documentOffice = $assignedOfficeCode === 'CA'
        ? (string) $data['office']
        : (string) $sessionUser['office'];

    try {
        $lockName = 'adtraqs_document_control_number';
        $lockStmt = $pdo->prepare('SELECT GET_LOCK(?, 10)');
        $lockStmt->execute([$lockName]);
        if ((int) $lockStmt->fetchColumn() !== 1) {
            respond(503, ['success' => false, 'message' => 'Could not reserve a document control number. Please try again.']);
        }

        $pdo->beginTransaction();
        $nextNumber = (int) $pdo->query(
            'SELECT GREATEST(
                COALESCE((SELECT MAX(CAST(control_no AS UNSIGNED)) FROM documents), 0),
                COALESCE((SELECT MAX(CAST(control_no AS UNSIGNED)) FROM city_admin_correspondence_documents), 0),
                COALESCE((SELECT MAX(CAST(city_admin_control_no AS UNSIGNED)) FROM office_documents), 0),
                COALESCE((SELECT MAX(CAST(city_admin_control_no AS UNSIGNED)) FROM office_correspondence_documents), 0)
             ) + 1'
        )->fetchColumn();
        $controlNo = str_pad((string) $nextNumber, 7, '0', STR_PAD_LEFT);
        $officeSequence = null;
        $nextOfficeSequence = null;
        if ($assignedOfficeCode !== 'CA') {
            $officeSequenceStmt = $pdo->prepare(
                'SELECT COUNT(*) + 1
                 FROM documents d
                 INNER JOIN users document_owner ON document_owner.id = d.created_by
                 WHERE LOWER(TRIM(document_owner.office)) = LOWER(TRIM(?))'
            );
            $officeSequenceStmt->execute([(string) $sessionUser['office']]);
            $officeSequence = (int) $officeSequenceStmt->fetchColumn();
            $nextOfficeSequence = $officeSequence + 1;
        }
        $stmt = $pdo->prepare(
            'INSERT INTO documents (
                control_no, date_entered, type, sub_type, office, payroll_voucher,
                particulars, fund, amount, signature, date_forwarded, status,
                cheque_no, date_returned, pr_number, qr_generated, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $controlNo,
            (string) $data['date_entered'],
            (string) $data['type'],
            $data['sub_type'] ?? null,
            $documentOffice,
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
            (int) $sessionUser['id'],
        ]);

        $documentId = (int) $pdo->lastInsertId();
        $createdAtStmt = $pdo->prepare('SELECT created_at FROM documents WHERE control_no = ?');
        $createdAtStmt->execute([$controlNo]);
        $createdAt = $createdAtStmt->fetchColumn();
        $nextControlNo = str_pad((string) ($nextNumber + 1), 7, '0', STR_PAD_LEFT);
        $pdo->commit();
        $releaseLock = $pdo->prepare('SELECT RELEASE_LOCK(?)');
        $releaseLock->execute([$lockName]);

        respond(201, [
            'success' => true,
            'message' => 'Document added successfully.',
            'id' => $documentId,
            'control_no' => $controlNo,
            'next_control_no' => $nextControlNo,
            'office_sequence' => $officeSequence,
            'next_office_sequence' => $nextOfficeSequence,
            'created_at' => $createdAt,
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if (isset($lockName)) {
            $releaseLock = $pdo->prepare('SELECT RELEASE_LOCK(?)');
            $releaseLock->execute([$lockName]);
        }
        if (!$e instanceof PDOException) {
            respond(500, ['success' => false, 'message' => 'Unable to save the document. Please try again.']);
        }
        respond(400, ['success' => false, 'message' => $e->getMessage()]);
    }
}

if ($method === 'PUT') {
    if (!$sessionUser) {
        respond(401, ['success' => false, 'message' => 'Sign in before updating documents.']);
    }
    if (!isset($data['id']) || $data['id'] === '') {
        respond(400, ['success' => false, 'message' => 'Document id is required.']);
    }

    try {
        $documentStmt = $pdo->prepare(
            'SELECT id, control_no, created_by
             FROM documents
             WHERE control_no = ?
             LIMIT 1'
        );
        $documentStmt->execute([(string) $data['id']]);
        $document = $documentStmt->fetch();
        if (!$document) {
            respond(404, ['success' => false, 'message' => 'Document not found.']);
        }
        if ((int) $document['created_by'] !== (int) $sessionUser['id']) {
            respond(403, ['success' => false, 'message' => 'You can only edit documents created by your account.']);
        }
        if ($assignedOfficeCode === null) {
            respond(403, ['success' => false, 'message' => 'Your account must be assigned to an active office before editing documents.']);
        }
        $documentOffice = $assignedOfficeCode === 'CA'
            ? (string) ($data['office'] ?? '')
            : (string) $sessionUser['office'];
        $pdo->beginTransaction();
        $returned = $data['date_returned'] ?? null;
        $stmt = $pdo->prepare(
            'UPDATE documents
             SET type = ?, sub_type = ?, office = ?, payroll_voucher = ?,
                 signature = ?, particulars = ?, fund = ?, amount = ?, cheque_no = ?,
                 pr_number = ?,
                  qr_generated = CASE WHEN ? = 1 THEN 1 ELSE qr_generated END,
                  date_returned = COALESCE(NULLIF(date_returned, \'0000-00-00 00:00:00\'), ?),
                  updated_by = ?, updated_at = NOW()
             WHERE control_no = ?'
        );
        $stmt->execute([
            (string) ($data['type'] ?? 'DV'),
            $data['sub_type'] ?? null,
            $documentOffice,
            (string) ($data['payroll_voucher'] ?? ''),
            (string) ($data['signature'] ?? ''),
            (string) ($data['particulars'] ?? ''),
            (string) ($data['fund'] ?? ''),
            (float) ($data['amount'] ?? 0),
            $data['cheque_no'] ?? null,
            $data['pr_number'] ?? null,
            !empty($data['qr_generated']) ? 1 : 0,
            $returned,
            (int) $sessionUser['id'],
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
