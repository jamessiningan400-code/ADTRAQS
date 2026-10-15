<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/group-tables.php';

header('Content-Type: application/json');

$groupsStmt = $pdo->query(
    'SELECT g.id AS group_id, g.control_range, g.start_control_no, g.end_control_no,
            t.id AS tracking_id, t.initiated_at, t.completed_at, t.completed_by
     FROM document_groups g
     INNER JOIN group_tracking_records t ON t.group_id = g.id
     ORDER BY t.initiated_at DESC'
);
$groups = [];

foreach ($groupsStmt->fetchAll() as $group) {
    $trackingId = (int) $group['tracking_id'];
    $stepsStmt = $pdo->prepare(
        'SELECT office_code, received_at, received_by, for_sig_at, forwarded_at, forwarded_to, forwarded_by
         FROM group_tracking_steps WHERE tracking_id = ? ORDER BY id ASC'
    );
    $stepsStmt->execute([$trackingId]);
    $visits = [];
    $byOffice = [];
    foreach ($stepsStmt->fetchAll() as $step) {
        $visit = [
            'office' => $step['office_code'],
            'received' => $step['received_at'],
            'receivedBy' => $step['received_by'],
            'forSig' => $step['for_sig_at'],
            'forwarded' => $step['forwarded_at'],
            'forwardedTo' => $step['forwarded_to'],
            'forwardedBy' => $step['forwarded_by'],
        ];
        $visits[] = $visit;
        $byOffice[$step['office_code']] = $visit;
    }

    $membersStmt = $pdo->prepare(
        'SELECT d.control_no AS id, d.date_entered AS date, d.type, d.office, d.payroll_voucher AS payrollVoucher,
                d.particulars, d.fund, d.amount, d.signature, d.status, d.sub_type AS subType,
                d.pr_number AS prNumber
         FROM document_group_documents gd
         INNER JOIN documents d ON d.id = gd.document_id
         WHERE gd.group_id = ? ORDER BY d.control_no ASC'
    );
    $membersStmt->execute([(int) $group['group_id']]);
    $members = array_map(static function (array $document): array {
        return [
            'id' => (string) $document['id'],
            'date' => $document['date'],
            'type' => $document['type'],
            'office' => $document['office'],
            'payrollVoucher' => $document['payrollVoucher'],
            'particulars' => $document['particulars'],
            'fund' => $document['fund'],
            'amount' => (float) $document['amount'],
            'signature' => $document['signature'],
            'status' => $document['status'] === 'Completed' ? 'Completed' : 'For Signature',
            'subType' => $document['subType'],
            'prNumber' => $document['prNumber'],
        ];
    }, $membersStmt->fetchAll());

    $groups[] = [
        'id' => 'G' . str_pad((string) $group['group_id'], 3, '0', STR_PAD_LEFT),
        'groupId' => (int) $group['group_id'],
        'controlNo' => (string) $group['control_range'],
        'startControlNo' => (string) $group['start_control_no'],
        'endControlNo' => (string) $group['end_control_no'],
        'particulars' => count($members) === 1 ? $members[0]['particulars'] : count($members) . ' grouped documents',
        'type' => count($members) === 1 ? $members[0]['type'] : 'GROUP',
        'initiatedAt' => $group['initiated_at'],
        'completedAt' => $group['completed_at'],
        'completedBy' => $group['completed_by'],
        'cto' => $byOffice['CTO'] ?? null,
        'cbo' => $byOffice['CBO'] ?? null,
        'cao' => $byOffice['CAO'] ?? null,
        'caReturn' => $byOffice['CA'] ?? null,
        'visits' => $visits,
        'documents' => $members,
    ];
}

echo json_encode(['success' => true, 'groups' => $groups]);
