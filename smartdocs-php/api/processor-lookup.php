<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/office-documents-table.php';

header('Content-Type: application/json');
adtraqsEnsureOfficeDocumentTables($pdo);

$controlNo = trim((string) ($_GET['control_no'] ?? ''));
if (preg_match('/^\d{1,7}$/', $controlNo)) {
    $controlNo = str_pad($controlNo, 7, '0', STR_PAD_LEFT);
}
if (!preg_match('/^(?:\d{1,20}|[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+)$/', $controlNo)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Enter a valid document ID or control number.']);
    exit;
}

$officeStmt = $pdo->prepare(
    'SELECT COALESCE(d.doc_id, c.doc_id) AS doc_id,
            COALESCE(d.office_name, c.office_name) AS origin_office,
            t.completed_at, s.office_code, s.received_at, s.for_sig_at,
            s.forwarded_at, s.forwarded_to
     FROM office_tracking_records t
     LEFT JOIN office_documents d ON d.doc_id = t.office_document_id
     LEFT JOIN office_correspondence_documents c ON c.doc_id = t.office_correspondence_id
     LEFT JOIN office_tracking_steps s ON s.id = (
         SELECT latest_step.id
         FROM office_tracking_steps latest_step
         WHERE latest_step.tracking_id = t.id
         ORDER BY latest_step.id DESC
         LIMIT 1
     )
     WHERE d.doc_id = ? OR c.doc_id = ?
     LIMIT 1'
);
$officeStmt->execute([$controlNo, $controlNo]);
$officeRecord = $officeStmt->fetch();
if ($officeRecord) {
    $office = (string) $officeRecord['origin_office'];
    $status = 'Not yet received';
    if ($officeRecord['completed_at']) {
        $office = 'Tracking Complete';
        $status = 'Tracking Complete';
    } elseif ($officeRecord['forwarded_at']) {
        $office = (string) ($officeRecord['forwarded_to'] ?: $officeRecord['office_code']);
        $status = 'Forwarded';
    } elseif ($officeRecord['for_sig_at']) {
        $office = (string) $officeRecord['office_code'];
        $status = 'For Signature';
    } elseif ($officeRecord['received_at']) {
        $office = (string) $officeRecord['office_code'];
        $status = 'Received';
    } elseif ($officeRecord['office_code']) {
        $office = (string) $officeRecord['office_code'];
        $status = 'Awaiting Receipt';
    }
    $office = [
        'CA' => 'City Administrative Office',
        'CTO' => "City Treasurer's Office",
        'CBO' => 'City Budget Office',
        'CAO' => 'City Accounting Office',
        'PRC' => 'Processors',
        'Complete' => 'Tracking Complete',
    ][$office] ?? $office;

    echo json_encode([
        'success' => true,
        'document' => [
            'controlNo' => (string) $officeRecord['doc_id'],
            'currentOffice' => $office,
            'status' => $status,
        ],
    ]);
    exit;
}

$correspondenceStmt = $pdo->prepare(
    'SELECT control_no, office, date_forwarded, status
     FROM city_admin_correspondence_documents
     WHERE control_no = ?
     LIMIT 1'
);
$correspondenceStmt->execute([$controlNo]);
$correspondence = $correspondenceStmt->fetch();
if ($correspondence) {
    $status = $correspondence['status'] === 'Completed'
        ? 'Tracking Complete'
        : ($correspondence['date_forwarded'] ? 'Forwarded' : 'Not yet received');
    $office = $status === 'Tracking Complete' ? $status : (string) $correspondence['office'];
    echo json_encode([
        'success' => true,
        'document' => [
            'controlNo' => (string) $correspondence['control_no'],
            'currentOffice' => $office,
            'status' => $status,
        ],
    ]);
    exit;
}

$stmt = $pdo->prepare(
    'SELECT d.control_no, t.completed_at,
            s.office_code, s.received_at, s.for_sig_at, s.forwarded_at, s.forwarded_to
     FROM documents d
     LEFT JOIN tracking_records t ON t.document_id = d.id
     LEFT JOIN tracking_steps s ON s.id = (
         SELECT latest_step.id
         FROM tracking_steps latest_step
         WHERE latest_step.tracking_id = t.id
         ORDER BY latest_step.id DESC
         LIMIT 1
     )
     WHERE d.control_no = ?
     ORDER BY t.id DESC
     LIMIT 1'
);
$stmt->execute([$controlNo]);
$record = $stmt->fetch();
if (!$record) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'Document not found.']);
    exit;
}

$office = 'City Administrative Office';
$status = 'Not yet received';
if ($record['completed_at']) {
    $office = 'Tracking Complete';
    $status = 'Tracking Complete';
} elseif ($record['forwarded_at']) {
    $office = (string) ($record['forwarded_to'] ?: $record['office_code']);
    $office = $office === 'PRC' ? 'Processors' : $office;
    $status = 'Forwarded';
} elseif ($record['for_sig_at']) {
    $office = (string) $record['office_code'];
    $status = 'For Signature';
} elseif ($record['received_at']) {
    $office = (string) $record['office_code'];
    $status = 'Received';
} elseif ($record['office_code']) {
    $office = (string) $record['office_code'];
    $status = 'Awaiting Receipt';
}
$office = [
    'CA' => 'City Administrative Office',
    'CTO' => "City Treasurer's Office",
    'CBO' => 'City Budget Office',
    'CAO' => 'City Accounting Office',
    'PRC' => 'Processors',
    'Complete' => 'Tracking Complete',
][$office] ?? $office;

echo json_encode([
    'success' => true,
    'document' => [
        'controlNo' => (string) $record['control_no'],
        'currentOffice' => $office,
        'status' => $status,
    ],
]);
