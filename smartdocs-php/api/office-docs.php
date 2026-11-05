<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/auth/document-access.php';
require_once __DIR__ . '/office-documents-table.php';

header('Content-Type: application/json');
adtraqsEnsureOfficeDocumentTables($pdo);

function respondOfficeDocs(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

$sessionUser = adtraqsGetSessionUser($pdo);
if (!$sessionUser) {
    respondOfficeDocs(401, ['success' => false, 'message' => 'Sign in before managing office documents.']);
}
$assignedOfficeCode = adtraqsNormalizeTrackingOffice($pdo, (string) $sessionUser['office']);
$method = $_SERVER['REQUEST_METHOD'];
if ($assignedOfficeCode === null ||
    ($assignedOfficeCode === 'CA' && ($method !== 'PUT' || strtolower((string) $sessionUser['role']) !== 'staff'))) {
    respondOfficeDocs(403, ['success' => false, 'message' => 'Only assigned office staff can manage office documents.']);
}

$data = json_decode(file_get_contents('php://input'), true) ?? [];

if ($method === 'POST') {
    $type = trim((string) ($data['type'] ?? ''));
    $isCorrespondence = adtraqsIsOfficeCorrespondenceType($type);
    $required = ['date_entered', 'type'];
    $required = array_merge($required, $isCorrespondence
        ? ['title', 'recipient', 'sender', 'subject']
        : ['payroll_voucher', 'particulars', 'fund', 'amount']);
    foreach ($required as $field) {
        if (!isset($data[$field]) || $data[$field] === '') {
            respondOfficeDocs(400, ['success' => false, 'message' => "Missing required field: {$field}"]);
        }
    }
    $dateEntered = (string) $data['date_entered'];
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateEntered) || date('Y-m-d', strtotime($dateEntered)) !== $dateEntered) {
        respondOfficeDocs(400, ['success' => false, 'message' => 'Enter a valid document date.']);
    }

    $lockName = 'adtraqs_office_document_id';
    try {
        $lockStmt = $pdo->prepare('SELECT GET_LOCK(?, 10)');
        $lockStmt->execute([$lockName]);
        if ((int) $lockStmt->fetchColumn() !== 1) {
            respondOfficeDocs(503, ['success' => false, 'message' => 'Could not reserve an office document ID. Please try again.']);
        }

        $pdo->beginTransaction();
        $sequenceStmt = $pdo->prepare(
            'SELECT GREATEST(
                COALESCE((SELECT MAX(office_sequence) FROM office_documents WHERE LOWER(TRIM(office_code)) = LOWER(TRIM(?))), 0),
                COALESCE((SELECT MAX(office_sequence) FROM office_correspondence_documents WHERE LOWER(TRIM(office_code)) = LOWER(TRIM(?))), 0)
             ) + 1'
        );
        $sequenceStmt->execute([$assignedOfficeCode, $assignedOfficeCode]);
        $sequence = (int) $sequenceStmt->fetchColumn();
        $docId = adtraqsOfficeDocumentPrefix((string) $sessionUser['office']) . '-' . $sequence;
        $userStmt = $pdo->prepare('SELECT full_name FROM users WHERE id = ? LIMIT 1');
        $userStmt->execute([(int) $sessionUser['id']]);
        $actor = (string) ($userStmt->fetchColumn() ?: 'Office Staff');

        if ($isCorrespondence) {
            $insertStmt = $pdo->prepare(
                "INSERT INTO office_correspondence_documents (
                    doc_id, office_sequence, office_code, office_name, type, title, recipient, sender,
                    date_entered, subject_line, status, created_by, created_office
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'For Signature', ?, ?)"
            );
            $insertStmt->execute([
                $docId, $sequence, $assignedOfficeCode, (string) $sessionUser['office'], $type,
                trim((string) $data['title']), trim((string) $data['recipient']), trim((string) $data['sender']),
                $dateEntered, trim((string) $data['subject']), (int) $sessionUser['id'], (string) $sessionUser['office'],
            ]);
        } else {
            $insertStmt = $pdo->prepare(
                "INSERT INTO office_documents (
                    doc_id, office_sequence, office_code, office_name, date_entered, type, sub_type,
                    payroll_voucher, particulars, fund, amount, signature, status, cheque_no, pr_number,
                    created_by, created_office
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'For Signature', ?, ?, ?, ?)"
            );
            $insertStmt->execute([
                $docId, $sequence, $assignedOfficeCode, (string) $sessionUser['office'], $dateEntered,
                $type, $data['sub_type'] ?? null, (string) $data['payroll_voucher'], (string) $data['particulars'],
                (string) $data['fund'], (float) $data['amount'], $data['cheque_no'] ?? null,
                $data['pr_number'] ?? null, (int) $sessionUser['id'], (string) $sessionUser['office'],
            ]);
        }

        $trackingStmt = $pdo->prepare(
            'INSERT INTO office_tracking_records (office_document_id, office_correspondence_id, initiated_at)
             VALUES (?, ?, NOW())'
        );
        $trackingStmt->execute([$isCorrespondence ? null : $docId, $isCorrespondence ? $docId : null]);
        $trackingId = (int) $pdo->lastInsertId();
        $stepStmt = $pdo->prepare(
            'INSERT INTO office_tracking_steps (tracking_id, office_code, received_at, received_by)
             VALUES (?, ?, NOW(), ?)'
        );
        $stepStmt->execute([$trackingId, $assignedOfficeCode, $actor]);

        $documentTable = $isCorrespondence ? 'office_correspondence_documents' : 'office_documents';
        $createdAtStmt = $pdo->prepare("SELECT created_at FROM {$documentTable} WHERE doc_id = ?");
        $createdAtStmt->execute([$docId]);
        $createdAt = $createdAtStmt->fetchColumn();
        $nextDocId = adtraqsOfficeDocumentPrefix((string) $sessionUser['office']) . '-' . ($sequence + 1);
        $pdo->commit();
        $releaseStmt = $pdo->prepare('SELECT RELEASE_LOCK(?)');
        $releaseStmt->execute([$lockName]);

        respondOfficeDocs(201, [
            'success' => true,
            'message' => 'Office document added successfully.',
            'doc_id' => $docId,
            'office_sequence' => $sequence,
            'next_office_doc_id' => $nextDocId,
            'created_at' => $createdAt,
        ]);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if (isset($lockName)) {
            $releaseStmt = $pdo->prepare('SELECT RELEASE_LOCK(?)');
            $releaseStmt->execute([$lockName]);
        }
        error_log('Unable to create office document: ' . $error->getMessage());
        respondOfficeDocs(500, ['success' => false, 'message' => 'Unable to save the office document. Please try again.']);
    }
}

if ($method === 'PUT') {
    $docId = trim((string) ($data['id'] ?? ''));
    if ($docId === '') {
        respondOfficeDocs(400, ['success' => false, 'message' => 'Document ID is required.']);
    }

    $documentStmt = $pdo->prepare(
        'SELECT d.doc_id, d.date_entered, d.type, t.id AS tracking_id,
                step.office_code, step.received_at, step.forwarded_at, step.forwarded_to
         FROM office_correspondence_documents d
         INNER JOIN office_tracking_records t ON t.office_correspondence_id = d.doc_id
         LEFT JOIN office_tracking_steps step ON step.id = (
             SELECT latest.id FROM office_tracking_steps latest
             WHERE latest.tracking_id = t.id
             ORDER BY latest.id DESC LIMIT 1
         )
         WHERE d.doc_id = ? LIMIT 1'
    );
    $documentStmt->execute([$docId]);
    $document = $documentStmt->fetch();
    $isCorrespondenceTable = (bool) $document;
    if (!$document) {
        $documentStmt = $pdo->prepare(
            'SELECT d.doc_id, d.date_entered, d.type, t.id AS tracking_id,
                    step.office_code, step.received_at, step.forwarded_at, step.forwarded_to
             FROM office_documents d
             INNER JOIN office_tracking_records t ON t.office_document_id = d.doc_id
             LEFT JOIN office_tracking_steps step ON step.id = (
                 SELECT latest.id FROM office_tracking_steps latest
                 WHERE latest.tracking_id = t.id
                 ORDER BY latest.id DESC LIMIT 1
             )
             WHERE d.doc_id = ? LIMIT 1'
        );
        $documentStmt->execute([$docId]);
        $document = $documentStmt->fetch();
    }
    if (!$document) {
        respondOfficeDocs(404, ['success' => false, 'message' => 'Office document not found.']);
    }
    $isAssignedAtDocument = $document['office_code'] === $assignedOfficeCode &&
        !empty($document['received_at']) && empty($document['forwarded_at']);
    if (!$isAssignedAtDocument) {
        respondOfficeDocs(403, ['success' => false, 'message' => 'This document is not assigned to your office.']);
    }

    $type = trim((string) ($data['type'] ?? ''));
    $isCorrespondence = adtraqsIsOfficeCorrespondenceType($type);
    if (adtraqsIsOfficeCorrespondenceType((string) $document['type']) !== $isCorrespondence) {
        respondOfficeDocs(422, ['success' => false, 'message' => 'A document cannot be changed between correspondence and financial document types.']);
    }
    $required = array_merge(['type'], $isCorrespondence
        ? ['date_entered', 'title', 'recipient', 'sender', 'subject']
        : ['payroll_voucher', 'particulars', 'fund', 'amount']);
    foreach ($required as $field) {
        if (!isset($data[$field]) || $data[$field] === '') {
            respondOfficeDocs(400, ['success' => false, 'message' => "Missing required field: {$field}"]);
        }
    }
    $dateEntered = (string) ($data['date_entered'] ?? $document['date_entered']);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateEntered) ||
        date('Y-m-d', strtotime($dateEntered)) !== $dateEntered) {
        respondOfficeDocs(400, ['success' => false, 'message' => 'Enter a valid document date.']);
    }
    if ($isCorrespondenceTable) {
        $updateStmt = $pdo->prepare(
            'UPDATE office_correspondence_documents
             SET date_entered = ?, title = ?, recipient = ?, sender = ?, subject_line = ?, type = ?,
                 signature = ?, updated_by = ?, updated_office = ?, updated_at = NOW()
             WHERE doc_id = ?'
        );
        $updateStmt->execute([
            $dateEntered, trim((string) $data['title']), trim((string) $data['recipient']),
            trim((string) $data['sender']), trim((string) $data['subject']), $type,
            trim((string) ($data['signature'] ?? '')) ?: null,
            (int) $sessionUser['id'], (string) $sessionUser['office'], $docId,
        ]);
    } else {
        $isLegacyCorrespondence = adtraqsIsOfficeCorrespondenceType((string) $document['type']);
        $updateStmt = $pdo->prepare(
            'UPDATE office_documents
             SET date_entered = ?, title = ?, recipient = ?, sender = ?, subject_line = ?, type = ?, sub_type = ?,
                 payroll_voucher = ?, particulars = ?, fund = ?, amount = ?,
                 signature = CASE WHEN ? = 1 THEN ? ELSE signature END, cheque_no = ?, pr_number = ?,
                 updated_by = ?, updated_office = ?, updated_at = NOW()
             WHERE doc_id = ?'
        );
        $updateStmt->execute([
            $dateEntered,
            $isLegacyCorrespondence ? trim((string) $data['title']) : null,
            $isLegacyCorrespondence ? trim((string) $data['recipient']) : null,
            $isLegacyCorrespondence ? trim((string) $data['sender']) : null,
            $isLegacyCorrespondence ? trim((string) $data['subject']) : null,
            $type, $data['sub_type'] ?? null,
            $isLegacyCorrespondence ? '' : (string) $data['payroll_voucher'],
            $isLegacyCorrespondence ? trim((string) $data['subject']) : (string) $data['particulars'],
            $isLegacyCorrespondence ? '' : (string) $data['fund'],
            $isLegacyCorrespondence ? 0 : (float) $data['amount'],
            $assignedOfficeCode === 'CA' && !$isCorrespondence ? 1 : 0,
            trim((string) ($data['signature'] ?? '')) ?: null,
            $data['cheque_no'] ?? null, $data['pr_number'] ?? null,
            (int) $sessionUser['id'], (string) $sessionUser['office'], $docId,
        ]);
    }
    respondOfficeDocs(200, ['success' => true, 'message' => 'Office document updated successfully.']);
}

respondOfficeDocs(405, ['success' => false, 'message' => 'Method not allowed.']);
