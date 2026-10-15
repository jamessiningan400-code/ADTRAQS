<?php
require_once __DIR__ . '/../config/database.php';

try { $pdo->exec("ALTER TABLE tracking_records ADD COLUMN completed_at DATETIME NULL, ADD COLUMN completed_by VARCHAR(150) NULL"); } catch (Throwable $ignored) {}

$stmt = $pdo->query(
        'SELECT d.id AS document_id, d.control_no, d.particulars, d.type, d.status, t.id AS tracking_id,
            t.completed_at, t.completed_by, COALESCE(t.initiated_at, d.date_forwarded) AS initiated_at
      FROM tracking_records t
      INNER JOIN documents d ON d.id = t.document_id
      WHERE EXISTS (SELECT 1 FROM tracking_steps ts WHERE ts.tracking_id = t.id)
          OR t.completed_at IS NOT NULL
     ORDER BY initiated_at DESC'
);
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

header('Content-Type: application/json');
echo json_encode(['success' => true, 'tracking' => $tracking]);
