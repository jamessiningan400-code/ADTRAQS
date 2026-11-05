<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/auth/document-access.php';
require_once __DIR__ . '/office-documents-table.php';

header('Content-Type: application/json');
adtraqsEnsureOfficeDocumentTables($pdo);

function respondCityAdminCorrespondence(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

$sessionUser = adtraqsGetSessionUser($pdo);
if (!$sessionUser) {
    respondCityAdminCorrespondence(401, ['success' => false, 'message' => 'Sign in before managing City Admin correspondence.']);
}
$assignedOfficeCode = adtraqsNormalizeTrackingOffice($pdo, (string) $sessionUser['office']);
if ($assignedOfficeCode !== 'CA') {
    respondCityAdminCorrespondence(403, ['success' => false, 'message' => 'Only City Admin staff can manage these documents.']);
}

$data = json_decode(file_get_contents('php://input'), true) ?? [];
$method = $_SERVER['REQUEST_METHOD'];
$type = trim((string) ($data['type'] ?? ''));
if ($type !== '' && !adtraqsIsOfficeCorrespondenceType($type)) {
    respondCityAdminCorrespondence(422, ['success' => false, 'message' => 'Only memorandum and letter documents are supported.']);
}

$validateRequired = static function (array $fields) use ($data): void {
    foreach ($fields as $field) {
        if (!isset($data[$field]) || trim((string) $data[$field]) === '') {
            respondCityAdminCorrespondence(400, ['success' => false, 'message' => "Missing required field: {$field}"]);
        }
    }
};
$validateDate = static function (string $date): bool {
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) === 1 && date('Y-m-d', strtotime($date)) === $date;
};

if ($method === 'POST') {
    $validateRequired(['type', 'office', 'title', 'recipient', 'sender', 'date_entered', 'subject', 'signature']);
    $dateEntered = (string) $data['date_entered'];
    if (!$validateDate($dateEntered)) {
        respondCityAdminCorrespondence(400, ['success' => false, 'message' => 'Enter a valid document date.']);
    }

    $lockName = 'adtraqs_document_control_number';
    try {
        $lockStmt = $pdo->prepare('SELECT GET_LOCK(?, 10)');
        $lockStmt->execute([$lockName]);
        if ((int) $lockStmt->fetchColumn() !== 1) {
            respondCityAdminCorrespondence(503, ['success' => false, 'message' => 'Could not reserve a document control number. Please try again.']);
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
        $insertStmt = $pdo->prepare(
            "INSERT INTO city_admin_correspondence_documents (
                control_no, type, office, title, recipient, sender, date_entered, subject_line,
                signature, status, created_by, created_office
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'For Signature', ?, ?)"
        );
        $insertStmt->execute([
            $controlNo, $type, trim((string) $data['office']), trim((string) $data['title']),
            trim((string) $data['recipient']), trim((string) $data['sender']), $dateEntered,
            trim((string) $data['subject']), trim((string) $data['signature']),
            (int) $sessionUser['id'], (string) $sessionUser['office'],
        ]);
        $createdAtStmt = $pdo->prepare('SELECT created_at FROM city_admin_correspondence_documents WHERE control_no = ?');
        $createdAtStmt->execute([$controlNo]);
        $createdAt = $createdAtStmt->fetchColumn();
        $nextControlNo = str_pad((string) ($nextNumber + 1), 7, '0', STR_PAD_LEFT);
        $pdo->commit();
        $releaseStmt = $pdo->prepare('SELECT RELEASE_LOCK(?)');
        $releaseStmt->execute([$lockName]);

        respondCityAdminCorrespondence(201, [
            'success' => true,
            'message' => 'Correspondence document added successfully.',
            'control_no' => $controlNo,
            'next_control_no' => $nextControlNo,
            'created_at' => $createdAt,
        ]);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        $releaseStmt = $pdo->prepare('SELECT RELEASE_LOCK(?)');
        $releaseStmt->execute([$lockName]);
        error_log('Unable to create City Admin correspondence: ' . $error->getMessage());
        respondCityAdminCorrespondence(500, ['success' => false, 'message' => 'Unable to save the correspondence document. Please try again.']);
    }
}

if ($method === 'PUT') {
    $validateRequired(['id', 'type', 'office', 'title', 'recipient', 'sender', 'date_entered', 'subject', 'signature']);
    $dateEntered = (string) $data['date_entered'];
    if (!$validateDate($dateEntered)) {
        respondCityAdminCorrespondence(400, ['success' => false, 'message' => 'Enter a valid document date.']);
    }

    $documentStmt = $pdo->prepare(
        'SELECT created_by FROM city_admin_correspondence_documents WHERE control_no = ? LIMIT 1'
    );
    $documentStmt->execute([(string) $data['id']]);
    $createdBy = $documentStmt->fetchColumn();
    if ($createdBy === false) {
        respondCityAdminCorrespondence(404, ['success' => false, 'message' => 'Correspondence document not found.']);
    }
    if ((int) $createdBy !== (int) $sessionUser['id']) {
        respondCityAdminCorrespondence(403, ['success' => false, 'message' => 'You can only edit documents created by your account.']);
    }

    $updateStmt = $pdo->prepare(
        'UPDATE city_admin_correspondence_documents
         SET type = ?, office = ?, title = ?, recipient = ?, sender = ?, date_entered = ?,
             subject_line = ?, signature = ?, updated_by = ?, updated_office = ?, updated_at = NOW()
         WHERE control_no = ?'
    );
    $updateStmt->execute([
        $type, trim((string) $data['office']), trim((string) $data['title']),
        trim((string) $data['recipient']), trim((string) $data['sender']), $dateEntered,
        trim((string) $data['subject']), trim((string) $data['signature']),
        (int) $sessionUser['id'], (string) $sessionUser['office'], (string) $data['id'],
    ]);
    respondCityAdminCorrespondence(200, ['success' => true, 'message' => 'Correspondence document updated successfully.']);
}

respondCityAdminCorrespondence(405, ['success' => false, 'message' => 'Method not allowed.']);
