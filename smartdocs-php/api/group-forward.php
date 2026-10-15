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

$body = json_decode(file_get_contents('php://input'), true);
$rawControlNos = is_array($body['controlNos'] ?? null) ? $body['controlNos'] : [];
$controlNos = [];
foreach ($rawControlNos as $value) {
    if (!is_string($value) && !is_int($value)) {
        respond(422, ['success' => false, 'message' => 'Each selected control number must be text or a number.']);
    }
    $controlNos[] = trim((string) $value);
}
$destination = strtoupper(trim((string) ($body['forwardedTo'] ?? '')));
$actorId = (int) ($body['userId'] ?? 0);
$actor = trim((string) ($body['actor'] ?? ''));

if (!$controlNos || !$actorId || !in_array($destination, ['CTO', 'CBO', 'CAO'], true) || $actor === '') {
    respond(422, ['success' => false, 'message' => 'Select documents, a destination office, and a valid forwarding staff member.']);
}
if (count(array_unique($controlNos)) !== count($controlNos)) {
    respond(422, ['success' => false, 'message' => 'The selected control numbers must be unique.']);
}

foreach ($controlNos as $controlNo) {
    if (!preg_match('/^\d{7}$/', $controlNo)) {
        respond(422, ['success' => false, 'message' => 'Control numbers must contain exactly seven digits.']);
    }
}

sort($controlNos, SORT_STRING);
$numbers = array_map('intval', $controlNos);
for ($index = 1; $index < count($numbers); $index++) {
    if ($numbers[$index] !== $numbers[$index - 1] + 1) {
        respond(422, ['success' => false, 'message' => 'Select consecutive control numbers to create an exact group range.']);
    }
}

$start = $controlNos[0];
$end = $controlNos[count($controlNos) - 1];
$controlRange = $start === $end ? $start : "{$start}-{$end}";

try {
    $pdo->beginTransaction();
    $placeholders = implode(',', array_fill(0, count($controlNos), '?'));
    $documentStmt = $pdo->prepare("SELECT id, control_no FROM documents WHERE control_no IN ({$placeholders}) ORDER BY control_no");
    $documentStmt->execute($controlNos);
    $documents = $documentStmt->fetchAll();
    if (count($documents) !== count($controlNos)) {
        throw new RuntimeException('One or more selected documents no longer exist. Refresh and try again.');
    }

    $completedTrackingStmt = $pdo->prepare(
        "SELECT COUNT(*) FROM tracking_records tr
         INNER JOIN documents d ON d.id = tr.document_id
         WHERE d.control_no IN ({$placeholders}) AND tr.completed_at IS NOT NULL"
    );
    $completedTrackingStmt->execute($controlNos);
    if ((int) $completedTrackingStmt->fetchColumn() > 0) {
        throw new RuntimeException('One or more selected documents have completed tracking and cannot be forwarded again.');
    }

    $membershipCheck = $pdo->prepare(
        "SELECT COUNT(*) FROM document_group_documents gd
         INNER JOIN documents d ON d.id = gd.document_id
         WHERE d.control_no IN ({$placeholders})"
    );
    $membershipCheck->execute($controlNos);
    if ((int) $membershipCheck->fetchColumn() > 0) {
        throw new RuntimeException('One or more selected documents already belong to a group. Continue routing that group from Tracking Monitoring -> Docs by group.');
    }

    $existingGroupStmt = $pdo->prepare('SELECT id FROM document_groups WHERE control_range = ? LIMIT 1');
    $existingGroupStmt->execute([$controlRange]);
    if ($existingGroupStmt->fetchColumn()) {
        throw new RuntimeException('This control-number range already has a group tracking record. Continue routing it from Tracking Monitoring -> Docs by group.');
    }

    $now = date('Y-m-d H:i:s');
    $groupStmt = $pdo->prepare(
        'INSERT INTO document_groups (control_range, start_control_no, end_control_no, created_by) VALUES (?, ?, ?, ?)'
    );
    $groupStmt->execute([$controlRange, $start, $end, $actorId]);
    $groupId = (int) $pdo->lastInsertId();

    $membershipStmt = $pdo->prepare('INSERT INTO document_group_documents (group_id, document_id) VALUES (?, ?)');
    foreach ($documents as $document) {
        $membershipStmt->execute([$groupId, $document['id']]);
    }

    $trackingStmt = $pdo->prepare('INSERT INTO group_tracking_records (group_id, initiated_at) VALUES (?, ?)');
    $trackingStmt->execute([$groupId, $now]);
    $trackingId = (int) $pdo->lastInsertId();
    $stepStmt = $pdo->prepare(
        'INSERT INTO group_tracking_steps (tracking_id, office_code, forwarded_at, forwarded_to, forwarded_by) VALUES (?, ?, ?, ?, ?)'
    );
    $stepStmt->execute([$trackingId, 'CA', $now, $destination, $actor]);

    $dateStmt = $pdo->prepare(
        "UPDATE documents
         SET date_forwarded = COALESCE(NULLIF(date_forwarded, '0000-00-00 00:00:00'), ?), status = ?
         WHERE id = ?"
    );
    foreach ($documents as $document) {
        $dateStmt->execute([$now, 'Completed', $document['id']]);
    }

    $pdo->commit();
    respond(201, [
        'success' => true,
        'groupId' => $groupId,
        'controlRange' => $controlRange,
        'forwardedTo' => $destination,
        'forwardedAt' => $now,
    ]);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    $status = $error instanceof PDOException ? 409 : 422;
    respond($status, ['success' => false, 'message' => $error->getMessage()]);
}
