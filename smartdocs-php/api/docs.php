<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/group-tables.php';
require_once __DIR__ . '/processors-table.php';

ensureProcessorTable($pdo);

$stmt = $pdo->query(
    "SELECT d.*, p.full_name AS registered_processor_name,
            p.contact_number AS registered_processor_contact_number,
            CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM tracking_records tr
                    INNER JOIN tracking_steps ts ON ts.tracking_id = tr.id
                    WHERE tr.document_id = d.id
                      AND ts.office_code = 'CA'
                      AND ts.forwarded_at IS NOT NULL
                      AND ts.forwarded_to IN ('CTO', 'CBO', 'CAO')
                ) OR EXISTS (
                    SELECT 1
                    FROM document_group_documents gd
                    INNER JOIN group_tracking_records gtr ON gtr.group_id = gd.group_id
                    INNER JOIN group_tracking_steps gts ON gts.tracking_id = gtr.id
                    WHERE gd.document_id = d.id
                      AND gts.office_code = 'CA'
                      AND gts.forwarded_at IS NOT NULL
                      AND gts.forwarded_to IN ('CTO', 'CBO', 'CAO')
                ) OR (
                    d.date_forwarded IS NOT NULL
                    AND d.date_forwarded <> '0000-00-00 00:00:00'
                ) THEN 'Completed'
                WHEN d.status = 'Flagged' THEN COALESCE(d.previous_status, 'For Signature')
                ELSE d.status
            END AS effective_status
     FROM documents d
     LEFT JOIN processors p ON p.id = d.processor_id
     ORDER BY d.created_at DESC"
);
$rows = $stmt->fetchAll();

$docs = array_map(function ($row) {
    return [
        'id' => (string) $row['control_no'],
        'date' => $row['date_entered'],
        'createdAt' => $row['created_at'],
        'type' => $row['type'],
        'office' => $row['office'],
        'payrollVoucher' => $row['payroll_voucher'],
        'particulars' => $row['particulars'],
        'fund' => $row['fund'],
        'amount' => (float) $row['amount'],
        'signature' => $row['signature'],
        'dateForwarded' => $row['date_forwarded'],
        'status' => $row['effective_status'],
        'chequeNo' => $row['cheque_no'],
        'dateReturned' => $row['date_returned'],
        'prNumber' => $row['pr_number'],
        'subType' => $row['sub_type'],
        'qrGenerated' => (bool) $row['qr_generated'],
        'processorName' => $row['registered_processor_name'] ?? $row['processor_name'],
        'processorContactNumber' => $row['registered_processor_contact_number'] ?? $row['processor_contact_number'],
    ];
}, $rows);

header('Content-Type: application/json');
echo json_encode(['success' => true, 'docs' => $docs]);
