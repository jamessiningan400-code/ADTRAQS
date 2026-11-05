<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/auth/document-access.php';
require_once __DIR__ . '/office-documents-table.php';

adtraqsEnsureOfficeDocumentTables($pdo);

$accessUser = adtraqsGetDocumentAccessUser($pdo);
if (!$accessUser) {
    http_response_code(401);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => 'Sign in to view documents.']);
    exit;
}
$sql = "SELECT d.*, document_owner.office AS document_owner_office,
            CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM tracking_records tr
                    INNER JOIN tracking_steps ts ON ts.tracking_id = tr.id
                    WHERE tr.document_id = d.id
                      AND ts.office_code = 'CA'
                      AND ts.forwarded_at IS NOT NULL
                      AND ts.forwarded_to IN ('CTO', 'CBO', 'CAO')
                ) OR (
                    d.date_forwarded IS NOT NULL
                    AND d.date_forwarded <> '0000-00-00 00:00:00'
                ) THEN 'Completed'
                WHEN d.status = 'Flagged' THEN COALESCE(d.previous_status, 'For Signature')
                ELSE d.status
            END AS effective_status
     FROM documents d
     INNER JOIN users document_owner ON document_owner.id = d.created_by
     ";
$params = [];
if ($accessUser['officeCode'] === 'CA') {
    $sql .= 'WHERE ' . adtraqsDocumentVisibilitySql('d') . ' ';
    $params = adtraqsDocumentVisibilityParams($accessUser);
} else {
    $sql .= 'WHERE d.created_by = ? ';
    $params = [$accessUser['id']];
}
$sql .= 'ORDER BY d.created_at DESC';
$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll();

$officeSequenceByDocumentId = [];
$officeSequenceNames = [];
foreach ($rows as $row) {
    $creatorOffice = trim((string) $row['document_owner_office']);
    if ($creatorOffice !== '' && !adtraqsIsCityAdminOfficeName($creatorOffice)) {
        $officeSequenceNames[strtolower($creatorOffice)] = $creatorOffice;
    }
}
if ($officeSequenceNames) {
    $sequenceStmt = $pdo->prepare(
        'SELECT d.id
         FROM documents d
         INNER JOIN users sequence_owner ON sequence_owner.id = d.created_by
         WHERE LOWER(TRIM(sequence_owner.office)) = LOWER(TRIM(?))
         ORDER BY d.created_at ASC, d.id ASC'
    );
    foreach ($officeSequenceNames as $officeName) {
        $sequenceStmt->execute([$officeName]);
        $sequence = 0;
        foreach ($sequenceStmt->fetchAll(PDO::FETCH_COLUMN) as $documentId) {
            $officeSequenceByDocumentId[(int) $documentId] = ++$sequence;
        }
    }
}

$docs = array_map(function ($row) use ($officeSequenceByDocumentId) {
    return [
        'id' => (string) $row['control_no'],
        'source' => 'city-admin',
        'officeSequence' => $officeSequenceByDocumentId[(int) $row['id']] ?? null,
        'date' => $row['date_entered'],
        'createdAt' => $row['created_at'],
        'type' => $row['type'],
        'office' => $row['office'],
        'payrollVoucher' => $row['payroll_voucher'],
        'particulars' => $row['particulars'],
        'fund' => $row['fund'],
        'amount' => (float) $row['amount'],
        'signature' => $row['signature'] ?? '',
        'dateForwarded' => $row['date_forwarded'],
        'status' => $row['effective_status'],
        'chequeNo' => $row['cheque_no'],
        'dateReturned' => $row['date_returned'],
        'prNumber' => $row['pr_number'],
        'subType' => $row['sub_type'],
        'qrGenerated' => (bool) $row['qr_generated'],
    ];
}, $rows);

if ($accessUser && $accessUser['officeCode'] === 'CA') {
    $cityAdminCorrespondenceStmt = $pdo->query(
        'SELECT d.*, created_user.full_name AS created_by_name, updated_user.full_name AS updated_by_name
         FROM city_admin_correspondence_documents d
         INNER JOIN users created_user ON created_user.id = d.created_by
         LEFT JOIN users updated_user ON updated_user.id = d.updated_by
         ORDER BY d.created_at DESC, CAST(d.control_no AS UNSIGNED) DESC'
    );
    $cityAdminCorrespondenceDocs = array_map(static function (array $row): array {
        return [
            'id' => (string) $row['control_no'],
            'source' => 'city-admin-correspondence',
            'officeSequence' => null,
            'date' => $row['date_entered'],
            'createdAt' => $row['created_at'],
            'type' => $row['type'],
            'office' => $row['office'],
            'title' => $row['title'],
            'to' => $row['recipient'],
            'from' => $row['sender'],
            'subject' => $row['subject_line'],
            'payrollVoucher' => '',
            'particulars' => $row['subject_line'],
            'fund' => '',
            'amount' => 0,
            'signature' => $row['signature'],
            'dateForwarded' => $row['date_forwarded'] ?? '',
            'status' => $row['status'] === 'Flagged' ? ($row['previous_status'] ?? 'For Signature') : $row['status'],
            'chequeNo' => '',
            'dateReturned' => '',
            'prNumber' => '',
            'subType' => '',
            'qrGenerated' => false,
            'createdBy' => (int) $row['created_by'],
            'createdByName' => $row['created_by_name'],
            'createdOffice' => $row['created_office'],
            'updatedBy' => $row['updated_by'] !== null ? (int) $row['updated_by'] : null,
            'updatedByName' => $row['updated_by_name'],
            'updatedOffice' => $row['updated_office'],
        ];
    }, $cityAdminCorrespondenceStmt->fetchAll());
    $docs = array_merge($docs, $cityAdminCorrespondenceDocs);
}

if ($accessUser) {
    $officeDocumentVisibility = static function (string $trackingDocumentColumn): string {
        return "WHERE EXISTS (
               SELECT 1
               FROM office_tracking_records route_record
               INNER JOIN office_tracking_steps route_step ON route_step.tracking_id = route_record.id
               WHERE route_record.{$trackingDocumentColumn} = d.doc_id
                 AND route_step.office_code = 'CA'
                 AND route_step.received_at IS NOT NULL
           )";
    };
    $officeDocsVisibility = $accessUser['officeCode'] === 'CA'
        ? $officeDocumentVisibility('office_document_id')
        : 'WHERE d.created_by = ?';
    $officeCorrespondenceVisibility = $accessUser['officeCode'] === 'CA'
        ? $officeDocumentVisibility('office_correspondence_id')
        : 'WHERE d.created_by = ?';
    $officeDocsParams = $accessUser['officeCode'] === 'CA' ? [] : [$accessUser['id']];
    $officeDocsStmt = $pdo->prepare(
        'SELECT d.*, created_user.full_name AS created_by_name, updated_user.full_name AS updated_by_name
         FROM office_documents d
         INNER JOIN users created_user ON created_user.id = d.created_by
         LEFT JOIN users updated_user ON updated_user.id = d.updated_by
         ' . $officeDocsVisibility . '
         ORDER BY d.created_at DESC, d.office_sequence DESC'
    );
    $officeDocsStmt->execute($officeDocsParams);
    $officeDocRows = $officeDocsStmt->fetchAll();
    if ($accessUser['officeCode'] === 'CA' &&
        array_filter($officeDocRows, static fn(array $row): bool => empty($row['city_admin_control_no']))) {
        adtraqsAcquireCityAdminControlNumberLock($pdo);
        try {
            foreach ($officeDocRows as &$row) {
                if (empty($row['city_admin_control_no'])) {
                    $row['city_admin_control_no'] = adtraqsAssignCityAdminControlNumber($pdo, 'office_documents', (string) $row['doc_id']);
                }
            }
            unset($row);
        } finally {
            adtraqsReleaseCityAdminControlNumberLock($pdo);
        }
    }
    $officeDocs = array_map(static function (array $row): array {
        return [
            'id' => (string) $row['doc_id'],
            'source' => 'office',
            'cityAdminControlNo' => $row['city_admin_control_no'] ?? null,
            'officeSequence' => (int) $row['office_sequence'],
            'date' => $row['date_entered'],
            'createdAt' => $row['created_at'],
            'type' => $row['type'],
            'office' => $row['office_name'],
            'title' => $row['title'] ?? '',
            'to' => $row['recipient'] ?? '',
            'from' => $row['sender'] ?? '',
            'subject' => $row['subject_line'] ?? '',
            'payrollVoucher' => $row['payroll_voucher'],
            'particulars' => $row['subject_line'] ?: $row['particulars'],
            'fund' => $row['fund'],
            'amount' => (float) $row['amount'],
            'signature' => $row['signature'] ?? '',
            'dateForwarded' => '',
            'status' => $row['status'] === 'Completed' ? 'Completed' : 'For Signature',
            'chequeNo' => $row['cheque_no'],
            'prNumber' => $row['pr_number'],
            'subType' => $row['sub_type'],
            'createdBy' => (int) $row['created_by'],
            'createdByName' => $row['created_by_name'],
            'createdOffice' => $row['created_office'],
            'updatedBy' => $row['updated_by'] !== null ? (int) $row['updated_by'] : null,
            'updatedByName' => $row['updated_by_name'],
            'updatedOffice' => $row['updated_office'],
        ];
    }, $officeDocRows);
    $docs = array_merge($docs, $officeDocs);

    $correspondenceStmt = $pdo->prepare(
        'SELECT d.*, created_user.full_name AS created_by_name, updated_user.full_name AS updated_by_name
         FROM office_correspondence_documents d
         INNER JOIN users created_user ON created_user.id = d.created_by
         LEFT JOIN users updated_user ON updated_user.id = d.updated_by
         ' . $officeCorrespondenceVisibility . '
         ORDER BY d.created_at DESC, d.office_sequence DESC'
    );
    $correspondenceStmt->execute($officeDocsParams);
    $correspondenceRows = $correspondenceStmt->fetchAll();
    if ($accessUser['officeCode'] === 'CA' &&
        array_filter($correspondenceRows, static fn(array $row): bool => empty($row['city_admin_control_no']))) {
        adtraqsAcquireCityAdminControlNumberLock($pdo);
        try {
            foreach ($correspondenceRows as &$row) {
                if (empty($row['city_admin_control_no'])) {
                    $row['city_admin_control_no'] = adtraqsAssignCityAdminControlNumber(
                        $pdo,
                        'office_correspondence_documents',
                        (string) $row['doc_id']
                    );
                }
            }
            unset($row);
        } finally {
            adtraqsReleaseCityAdminControlNumberLock($pdo);
        }
    }
    $correspondenceDocs = array_map(static function (array $row): array {
        return [
            'id' => (string) $row['doc_id'],
            'source' => 'office',
            'cityAdminControlNo' => $row['city_admin_control_no'] ?? null,
            'officeSequence' => (int) $row['office_sequence'],
            'date' => $row['date_entered'],
            'createdAt' => $row['created_at'],
            'type' => $row['type'],
            'office' => $row['office_name'],
            'title' => $row['title'],
            'to' => $row['recipient'],
            'from' => $row['sender'],
            'subject' => $row['subject_line'],
            'payrollVoucher' => '',
            'particulars' => $row['subject_line'],
            'fund' => '',
            'amount' => 0,
            'signature' => $row['signature'] ?? '',
            'dateForwarded' => $row['date_forwarded'] ?? '',
            'status' => $row['status'] === 'Completed' ? 'Completed' : 'For Signature',
            'chequeNo' => '',
            'prNumber' => '',
            'subType' => '',
            'createdBy' => (int) $row['created_by'],
            'createdByName' => $row['created_by_name'],
            'createdOffice' => $row['created_office'],
            'updatedBy' => $row['updated_by'] !== null ? (int) $row['updated_by'] : null,
            'updatedByName' => $row['updated_by_name'],
            'updatedOffice' => $row['updated_office'],
        ];
    }, $correspondenceRows);
    $docs = array_merge($docs, $correspondenceDocs);
}

header('Content-Type: application/json');
echo json_encode(['success' => true, 'docs' => $docs]);
