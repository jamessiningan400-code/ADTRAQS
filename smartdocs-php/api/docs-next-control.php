<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/auth/document-access.php';
require_once __DIR__ . '/office-documents-table.php';

header('Content-Type: application/json');

$sessionUser = adtraqsGetSessionUser($pdo);
if (!$sessionUser) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Sign in to get the next document control number.']);
    exit;
}

$assignedOfficeCode = adtraqsNormalizeTrackingOffice($pdo, (string) $sessionUser['office']);
if ($assignedOfficeCode === null) {
    http_response_code(403);
    echo json_encode([
        'success' => false,
        'message' => 'Your account must be assigned to an active office before creating documents.',
    ]);
    exit;
}

adtraqsEnsureOfficeDocumentTables($pdo);
$nextNumberSql = $assignedOfficeCode === 'CA'
    ? 'SELECT GREATEST(
          COALESCE((SELECT MAX(CAST(control_no AS UNSIGNED)) FROM documents), 0),
          COALESCE((SELECT MAX(CAST(control_no AS UNSIGNED)) FROM city_admin_correspondence_documents), 0),
          COALESCE((SELECT MAX(CAST(city_admin_control_no AS UNSIGNED)) FROM office_documents), 0),
          COALESCE((SELECT MAX(CAST(city_admin_control_no AS UNSIGNED)) FROM office_correspondence_documents), 0)
       ) + 1'
    : 'SELECT COALESCE(MAX(CAST(control_no AS UNSIGNED)), 0) + 1 FROM documents';
$nextNumber = (int) $pdo->query($nextNumberSql)->fetchColumn();
$nextOfficeSequence = null;
$nextOfficeDocId = null;
if ($assignedOfficeCode !== 'CA') {
    $officeSequenceStmt = $pdo->prepare(
        'SELECT GREATEST(
            COALESCE((SELECT MAX(office_sequence) FROM office_documents WHERE LOWER(TRIM(office_code)) = LOWER(TRIM(?))), 0),
            COALESCE((SELECT MAX(office_sequence) FROM office_correspondence_documents WHERE LOWER(TRIM(office_code)) = LOWER(TRIM(?))), 0)
         ) + 1'
    );
    $officeSequenceStmt->execute([$assignedOfficeCode, $assignedOfficeCode]);
    $nextOfficeSequence = (int) $officeSequenceStmt->fetchColumn();
    $nextOfficeDocId = adtraqsOfficeDocumentPrefix((string) $sessionUser['office']) . '-' . $nextOfficeSequence;
}

echo json_encode([
    'success' => true,
    'next_control_no' => str_pad((string) $nextNumber, 7, '0', STR_PAD_LEFT),
    'next_office_sequence' => $nextOfficeSequence,
    'next_office_doc_id' => $nextOfficeDocId,
]);
