<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/auth/document-access.php';
require_once __DIR__ . '/office-documents-table.php';

try { $pdo->exec("ALTER TABLE tracking_records ADD COLUMN completed_at DATETIME NULL, ADD COLUMN completed_by VARCHAR(150) NULL"); } catch (Throwable $ignored) {}
adtraqsEnsureOfficeDocumentTables($pdo);

$accessUser = adtraqsGetDocumentAccessUser($pdo);
if (!$accessUser) {
    http_response_code(401);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => 'Sign in to view document tracking.']);
    exit;
}
$sql = 'SELECT d.id AS document_id, d.control_no, d.particulars, d.type, d.status,
            origin_user.office AS origin_office, t.id AS tracking_id,
            t.completed_at, t.completed_by, COALESCE(t.initiated_at, d.date_forwarded) AS initiated_at
      FROM tracking_records t
      INNER JOIN documents d ON d.id = t.document_id
      INNER JOIN users origin_user ON origin_user.id = d.created_by
      WHERE (EXISTS (SELECT 1 FROM tracking_steps ts WHERE ts.tracking_id = t.id)
          OR t.completed_at IS NOT NULL
      )';
$params = [];
if ($accessUser) {
    $sql .= ' AND ' . adtraqsDocumentVisibilitySql('d');
    $params = adtraqsDocumentVisibilityParams($accessUser);
    if ($accessUser['officeCode'] !== 'CA') {
        $sql .= " AND (
            EXISTS (
                SELECT 1
                FROM users origin_user
                WHERE origin_user.id = d.created_by
                  AND LOWER(TRIM(origin_user.office)) = LOWER(TRIM(?))
            )
            OR (
                t.completed_at IS NULL
                AND EXISTS (
                    SELECT 1
                    FROM tracking_steps office_ts
                    WHERE office_ts.id = (
                        SELECT latest_office_ts.id
                        FROM tracking_steps latest_office_ts
                        WHERE latest_office_ts.tracking_id = t.id
                        ORDER BY latest_office_ts.id DESC
                        LIMIT 1
                    )
                      AND (
                          (office_ts.forwarded_at IS NOT NULL AND office_ts.forwarded_to = ?)
                          OR (office_ts.forwarded_at IS NULL AND office_ts.office_code = ?)
                      )
                )
            ))";
        $params[] = $accessUser['officeName'];
        $params[] = $accessUser['officeCode'];
        $params[] = $accessUser['officeCode'];
    }
}
$sql .= ' ORDER BY initiated_at DESC';
$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll();

$tracking = [];
foreach ($rows as $row) {
    $trackingId = (int) $row['tracking_id'];
    $stepRows = [];
    if ($trackingId > 0) {
        $stepStmt = $pdo->prepare('SELECT office_code, received_at, received_by, for_sig_at, forwarded_at, forwarded_to, forwarded_by FROM tracking_steps WHERE tracking_id = ? ORDER BY id ASC');
        $stepStmt->execute([$trackingId]);
        $stepRows = $stepStmt->fetchAll();
    }

    $byOffice = [];
    $visits = [];
    foreach ($stepRows as $step) {
        $code = $step['office_code'];
        $visit = [
            'office' => $code,
            'received' => $step['received_at'],
            'receivedBy' => $step['received_by'],
            'forSig' => $step['for_sig_at'],
            'forwarded' => $step['forwarded_at'],
            'forwardedTo' => $step['forwarded_to'],
            'forwardedBy' => $step['forwarded_by'],
        ];
        if ($code === 'CA_RETURN') $visit['office'] = 'CA';
        $visits[] = $visit;
        $byOffice[$code] = $visit;
    }

    $caReturn = null;
    if (!empty($byOffice['CA_RETURN'])) {
        $caReturn = [
            'received' => $byOffice['CA_RETURN']['received'],
            'receivedBy' => $byOffice['CA_RETURN']['receivedBy'],
        ];
    }

    $tracking[] = [
        'id' => $trackingId > 0 ? 'T' . str_pad((string) $trackingId, 3, '0', STR_PAD_LEFT) : 'D' . $row['document_id'],
        'controlNo' => (string) $row['control_no'],
        'source' => 'city-admin',
        'originOffice' => (string) $row['origin_office'],
        'particulars' => $row['particulars'],
        'type' => $row['type'],
        'initiatedAt' => $row['initiated_at'],
        'completedAt' => $row['completed_at'],
        'completedBy' => $row['completed_by'],
        'cto' => $byOffice['CTO'] ?? null,
        'cbo' => $byOffice['CBO'] ?? null,
        'cao' => $byOffice['CAO'] ?? null,
        'caReturn' => $caReturn,
        'visits' => $visits,
    ];
}

if ($accessUser) {
    $officeTrackingStmt = $pdo->prepare(
        "SELECT COALESCE(d.doc_id, c.doc_id) AS doc_id,
                d.doc_id AS office_document_id, c.doc_id AS correspondence_document_id,
                COALESCE(d.office_code, c.office_code) AS origin_office,
                COALESCE(NULLIF(c.subject_line, ''), NULLIF(d.subject_line, ''), d.particulars) AS particulars,
                COALESCE(c.type, d.type) AS type,
                COALESCE(d.city_admin_control_no, c.city_admin_control_no) AS city_admin_control_no,
                COALESCE(c.title, d.title) AS title,
                COALESCE(c.recipient, d.recipient) AS recipient,
                COALESCE(c.sender, d.sender) AS sender,
                COALESCE(c.subject_line, d.subject_line) AS subject_line,
                COALESCE(c.date_entered, d.date_entered) AS date_entered,
                d.payroll_voucher, d.fund, d.amount,
                t.id AS tracking_id,
                t.initiated_at, t.completed_at, t.completed_by
         FROM office_tracking_records t
         LEFT JOIN office_documents d ON d.doc_id = t.office_document_id
         LEFT JOIN office_correspondence_documents c ON c.doc_id = t.office_correspondence_id
         WHERE (d.doc_id IS NOT NULL OR c.doc_id IS NOT NULL)
           AND (
               d.office_code = ? OR c.office_code = ? OR EXISTS (
               SELECT 1
               FROM office_tracking_steps latest_step
               WHERE latest_step.id = (
                   SELECT newest_step.id
                   FROM office_tracking_steps newest_step
                   WHERE newest_step.tracking_id = t.id
                   ORDER BY newest_step.id DESC
                   LIMIT 1
               )
                 AND (
                     (latest_step.forwarded_at IS NOT NULL AND latest_step.forwarded_to = ?)
                     OR (latest_step.forwarded_at IS NULL AND latest_step.office_code = ?)
                 )
               )
               OR (
                 ? = 'CA' AND EXISTS (
                     SELECT 1
                     FROM office_tracking_steps city_admin_step
                     WHERE city_admin_step.tracking_id = t.id
                       AND (city_admin_step.office_code = 'CA' OR city_admin_step.forwarded_to = 'CA')
                 )
               )
               )
         ORDER BY t.initiated_at DESC"
    );
    $officeTrackingStmt->execute([
        $accessUser['officeCode'],
        $accessUser['officeCode'],
        $accessUser['officeCode'],
        $accessUser['officeCode'],
        $accessUser['officeCode'],
    ]);
    foreach ($officeTrackingStmt->fetchAll() as $row) {
        $trackingId = (int) $row['tracking_id'];
        $stepStmt = $pdo->prepare(
            'SELECT office_code, received_at, received_by, for_sig_at, forwarded_at, forwarded_to, forwarded_by
             FROM office_tracking_steps WHERE tracking_id = ? ORDER BY id ASC'
        );
        $stepStmt->execute([$trackingId]);
        $byOffice = [];
        $visits = [];
        $officeSteps = $stepStmt->fetchAll();
        foreach ($officeSteps as $step) {
            $code = $step['office_code'];
            $visit = [
                'office' => $code === 'CA_RETURN' ? 'CA' : $code,
                'received' => $step['received_at'],
                'receivedBy' => $step['received_by'],
                'forSig' => $step['for_sig_at'],
                'forwarded' => $step['forwarded_at'],
                'forwardedTo' => $step['forwarded_to'],
                'forwardedBy' => $step['forwarded_by'],
            ];
            $visits[] = $visit;
            $byOffice[$code] = $visit;
        }
        if ($accessUser['officeCode'] === 'CA' && empty($row['city_admin_control_no'])) {
            adtraqsAcquireCityAdminControlNumberLock($pdo);
            try {
                $documentTable = $row['office_document_id'] !== null
                    ? 'office_documents'
                    : 'office_correspondence_documents';
                $row['city_admin_control_no'] = adtraqsAssignCityAdminControlNumber(
                    $pdo,
                    $documentTable,
                    (string) $row['doc_id']
                );
            } finally {
                adtraqsReleaseCityAdminControlNumberLock($pdo);
            }
        }
        $caReturn = isset($byOffice['CA_RETURN']) ? [
            'received' => $byOffice['CA_RETURN']['received'],
            'receivedBy' => $byOffice['CA_RETURN']['receivedBy'],
        ] : null;
        $tracking[] = [
            'id' => 'OT' . str_pad((string) $trackingId, 3, '0', STR_PAD_LEFT),
            'controlNo' => (string) $row['doc_id'],
            'source' => 'office',
            'originOffice' => (string) $row['origin_office'],
            'cityAdminControlNo' => $row['city_admin_control_no'] ?? null,
            'title' => $row['title'] ?? '',
            'to' => $row['recipient'] ?? '',
            'from' => $row['sender'] ?? '',
            'subject' => $row['subject_line'] ?? '',
            'date' => $row['date_entered'] ?? '',
            'payrollVoucher' => $row['payroll_voucher'] ?? '',
            'fund' => $row['fund'] ?? '',
            'amount' => $row['amount'] !== null ? (float) $row['amount'] : null,
            'particulars' => $row['particulars'],
            'type' => $row['type'],
            'initiatedAt' => $row['initiated_at'],
            'completedAt' => $row['completed_at'],
            'completedBy' => $row['completed_by'],
            'cto' => $byOffice['CTO'] ?? null,
            'cbo' => $byOffice['CBO'] ?? null,
            'cao' => $byOffice['CAO'] ?? null,
            'caReturn' => $caReturn,
            'visits' => $visits,
        ];
    }
}

header('Content-Type: application/json');
echo json_encode(['success' => true, 'tracking' => $tracking]);
