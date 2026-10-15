<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/group-tables.php';

header('Content-Type: application/json');

function respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['success' => false, 'message' => 'POST required']);
}

$body = json_decode(file_get_contents('php://input'), true) ?? [];
$groupId = (int) ($body['groupId'] ?? 0);
$office = strtoupper(trim((string) ($body['office'] ?? '')));
$action = trim((string) ($body['action'] ?? ''));
$forwardedTo = strtoupper(trim((string) ($body['forwardedTo'] ?? '')));
$actor = trim((string) ($body['actor'] ?? ''));
$validOffices = ['CA', 'CTO', 'CBO', 'CAO'];

if (!$groupId || !in_array($office, $validOffices, true) ||
    !in_array($action, ['receive', 'forSig', 'forward', 'dispatch', 'complete'], true) || $actor === '') {
    respond(422, ['success' => false, 'message' => 'Invalid group tracking update.']);
}
if (in_array($action, ['forward', 'dispatch'], true) &&
    (!in_array($forwardedTo, $validOffices, true) || $forwardedTo === $office ||
     ($action === 'dispatch' && ($office !== 'CA' || !in_array($forwardedTo, ['CTO', 'CBO', 'CAO'], true))))) {
    respond(422, ['success' => false, 'message' => 'A different destination office is required.']);
}

try {
    $pdo->beginTransaction();
    $trackingStmt = $pdo->prepare(
        'SELECT t.id, t.completed_at FROM group_tracking_records t
         WHERE t.group_id = ? FOR UPDATE'
    );
    $trackingStmt->execute([$groupId]);
    $tracking = $trackingStmt->fetch();
    $trackingId = (int) ($tracking['id'] ?? 0);
    if (!$trackingId) {
        throw new RuntimeException('Grouped document tracking record not found.');
    }
    if (!empty($tracking['completed_at'])) {
        throw new RuntimeException('Group tracking is already complete and cannot be changed or forwarded again.');
    }

    $latestStmt = $pdo->prepare(
        'SELECT id, office_code, received_at, for_sig_at, forwarded_at, forwarded_to
         FROM group_tracking_steps WHERE tracking_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE'
    );
    $latestStmt->execute([$trackingId]);
    $latest = $latestStmt->fetch();
    $now = date('Y-m-d H:i:s');

    if ($action === 'receive') {
        if ($latest && $latest['office_code'] === $office && empty($latest['received_at']) && empty($latest['forwarded_at'])) {
            $stmt = $pdo->prepare('UPDATE group_tracking_steps SET received_at = ?, received_by = ? WHERE id = ?');
            $stmt->execute([$now, $actor, $latest['id']]);
        } elseif ($latest && !empty($latest['forwarded_at']) && $latest['forwarded_to'] === $office) {
            $stmt = $pdo->prepare('INSERT INTO group_tracking_steps (tracking_id, office_code, received_at, received_by) VALUES (?, ?, ?, ?)');
            $stmt->execute([$trackingId, $office, $now, $actor]);
            if ($office === 'CA') {
                $returnStmt = $pdo->prepare(
                    'UPDATE documents d INNER JOIN document_group_documents gd ON gd.document_id = d.id
                     SET d.date_returned = COALESCE(NULLIF(d.date_returned, \'0000-00-00 00:00:00\'), ?) WHERE gd.group_id = ?'
                );
                $returnStmt->execute([$now, $groupId]);
            }
        } else {
            throw new RuntimeException('This group is not awaiting receipt at ' . $office . '.');
        }
    } elseif ($action === 'forSig') {
        if (!$latest || $latest['office_code'] !== $office || empty($latest['received_at']) || !empty($latest['forwarded_at'])) {
            throw new RuntimeException('Receive the grouped documents before processing them.');
        }
        $stmt = $pdo->prepare('UPDATE group_tracking_steps SET for_sig_at = ? WHERE id = ?');
        $stmt->execute([$now, $latest['id']]);
    } elseif ($action === 'forward') {
        if (!$latest || $latest['office_code'] !== $office || empty($latest['received_at']) ||
            empty($latest['for_sig_at']) || !empty($latest['forwarded_at'])) {
            throw new RuntimeException('Complete receipt and signature processing before forwarding the grouped documents.');
        }
        $stmt = $pdo->prepare('UPDATE group_tracking_steps SET forwarded_at = ?, forwarded_to = ?, forwarded_by = ? WHERE id = ?');
        $stmt->execute([$now, $forwardedTo, $actor, $latest['id']]);
        if ($office === 'CA' && in_array($forwardedTo, ['CTO', 'CBO', 'CAO'], true)) {
            $docsStmt = $pdo->prepare(
                'UPDATE documents d INNER JOIN document_group_documents gd ON gd.document_id = d.id
                 SET d.date_forwarded = COALESCE(NULLIF(d.date_forwarded, \'0000-00-00 00:00:00\'), ?),
                     d.status = \'Completed\'
                 WHERE gd.group_id = ?'
            );
            $docsStmt->execute([$now, $groupId]);
        }
    } elseif ($action === 'dispatch') {
        if (!$latest || $latest['office_code'] !== 'CA' || empty($latest['received_at']) || !empty($latest['forwarded_at'])) {
            throw new RuntimeException('City Admin must receive the group before forwarding it again.');
        }
        $stmt = $pdo->prepare('UPDATE group_tracking_steps SET forwarded_at = ?, forwarded_to = ?, forwarded_by = ? WHERE id = ?');
        $stmt->execute([$now, $forwardedTo, $actor, $latest['id']]);
        $docsStmt = $pdo->prepare(
            'UPDATE documents d INNER JOIN document_group_documents gd ON gd.document_id = d.id
             SET d.date_forwarded = COALESCE(NULLIF(d.date_forwarded, \'0000-00-00 00:00:00\'), ?), d.status = \'Completed\'
             WHERE gd.group_id = ?'
        );
        $docsStmt->execute([$now, $groupId]);
    } else {
        if (!$latest || $latest['office_code'] !== $office || empty($latest['received_at']) ||
            !empty($latest['forwarded_at'])) {
            throw new RuntimeException('Receive the group at its destination before completing its tracking.');
        }
        $stmt = $pdo->prepare('UPDATE group_tracking_records SET completed_at = ?, completed_by = ? WHERE id = ?');
        $stmt->execute([$now, $actor, $trackingId]);
    }

    $pdo->commit();
    respond(200, ['success' => true, 'updatedAt' => $now]);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    respond(422, ['success' => false, 'message' => $error->getMessage()]);
}
