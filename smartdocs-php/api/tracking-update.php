<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/group-tables.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'POST required']);
    exit;
}

$body = json_decode(file_get_contents('php://input'), true) ?: [];
$controlNo = trim((string)($body['controlNo'] ?? ''));
$office = strtoupper(trim((string)($body['office'] ?? '')));
$action = trim((string)($body['action'] ?? ''));
$forwardedTo = strtoupper(trim((string)($body['forwardedTo'] ?? '')));
$forwardedTo = in_array($forwardedTo, ['PROCESSOR', 'PROCESSORS'], true) ? 'PRC' : $forwardedTo;
$actor = trim((string)($body['actor'] ?? 'Staff Member')) ?: 'Staff Member';
$allowedOffices = ['CA', 'CTO', 'CBO', 'CAO'];
$caDestinations = ['CTO', 'CBO', 'CAO'];
$dispatchDestinations = ['CTO', 'CBO', 'CAO', 'PRC'];

if (!$controlNo || !in_array($office, $allowedOffices, true) || !in_array($action, ['receive', 'forSig', 'forward', 'complete', 'dispatch'], true)) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Invalid tracking update']);
    exit;
}
if (($action === 'forward' && (!$forwardedTo || !in_array($forwardedTo, $allowedOffices, true) || $forwardedTo === $office)) ||
    ($action === 'dispatch' && ($office !== 'CA' || !in_array($forwardedTo, $dispatchDestinations, true)))) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'A different destination office is required']);
    exit;
}

try {
    // Existing installations may still have the old unique office constraint.
    try { $pdo->exec("ALTER TABLE tracking_steps MODIFY office_code VARCHAR(30) NOT NULL"); } catch (Throwable $ignored) {}
    try { $pdo->exec("ALTER TABLE tracking_steps DROP INDEX uq_tracking_office"); } catch (Throwable $ignored) {}
    try { $pdo->exec("ALTER TABLE tracking_records ADD COLUMN completed_at DATETIME NULL, ADD COLUMN completed_by VARCHAR(150) NULL"); } catch (Throwable $ignored) {}

    $documentStmt = $pdo->prepare('SELECT id, particulars, type, date_forwarded, status FROM documents WHERE control_no = ? LIMIT 1');
    $documentStmt->execute([$controlNo]);
    $document = $documentStmt->fetch();
    if (!$document) throw new RuntimeException('Document not found');
    if ($action === 'dispatch' && $forwardedTo === 'PRC') {
        $groupMembershipStmt = $pdo->prepare(
            'SELECT 1 FROM document_group_documents WHERE document_id = ? LIMIT 1'
        );
        $groupMembershipStmt->execute([$document['id']]);
        if ($groupMembershipStmt->fetchColumn()) {
            throw new RuntimeException('Processor forwarding is available for individual documents only.');
        }
    }

    $trackingStmt = $pdo->prepare('SELECT id FROM tracking_records WHERE document_id = ? LIMIT 1');
    $trackingStmt->execute([$document['id']]);
    $trackingId = $trackingStmt->fetchColumn();
    if (!$trackingId) {
        $insertTracking = $pdo->prepare('INSERT INTO tracking_records (document_id, initiated_at) VALUES (?, COALESCE(?, NOW()))');
        $insertTracking->execute([$document['id'], $document['date_forwarded']]);
        $trackingId = $pdo->lastInsertId();
    }

    $pdo->beginTransaction();
    $completionStmt = $pdo->prepare('SELECT completed_at FROM tracking_records WHERE id = ? FOR UPDATE');
    $completionStmt->execute([$trackingId]);
    $completedAt = $completionStmt->fetchColumn();
    if ($completedAt) {
        throw new RuntimeException('Document tracking is already complete and cannot be changed or forwarded again.');
    }

    $latestStmt = $pdo->prepare('SELECT id, office_code, received_at, for_sig_at, forwarded_at, forwarded_to FROM tracking_steps WHERE tracking_id = ? ORDER BY id DESC LIMIT 1');
    $latestStmt->execute([$trackingId]);
    $latest = $latestStmt->fetch();
    $now = date('Y-m-d H:i:s');

    if ($action === 'dispatch' && $latest && $latest['office_code'] === 'CA' &&
        !empty($latest['forwarded_at']) && $latest['forwarded_to'] === $forwardedTo) {
        $repairStatusStmt = $pdo->prepare(
            "UPDATE documents
             SET date_forwarded = COALESCE(NULLIF(date_forwarded, '0000-00-00 00:00:00'), ?),
                 status = 'Completed'
             WHERE id = ?"
        );
        $repairStatusStmt->execute([$latest['forwarded_at'], $document['id']]);
        $pdo->commit();
        echo json_encode(['success' => true, 'updatedAt' => $latest['forwarded_at'], 'idempotent' => true]);
        exit;
    }

    if ($action === 'dispatch') {
        if ($latest && ($latest['office_code'] !== 'CA' || empty($latest['received_at']) || !empty($latest['forwarded_at']))) {
            throw new RuntimeException('City Admin must receive the document before forwarding it again');
        }
        if ($latest) {
            $stmt = $pdo->prepare('UPDATE tracking_steps SET forwarded_at = ?, forwarded_to = ?, forwarded_by = ? WHERE id = ?');
            $stmt->execute([$now, $forwardedTo, $actor, $latest['id']]);
        } else {
            $stmt = $pdo->prepare('INSERT INTO tracking_steps (tracking_id, office_code, forwarded_at, forwarded_to, forwarded_by) VALUES (?, ?, ?, ?, ?)');
            $stmt->execute([$trackingId, 'CA', $now, $forwardedTo, $actor]);
        }
        $dispatchStatus = 'Completed';
        $docStmt = $pdo->prepare("UPDATE documents SET date_forwarded = COALESCE((SELECT MIN(forwarded_at) FROM tracking_steps WHERE tracking_id = ? AND office_code = 'CA' AND forwarded_to IN ('CTO', 'CBO', 'CAO', 'PRC') AND forwarded_at IS NOT NULL), date_forwarded), status = ? WHERE id = ?");
        $docStmt->execute([$trackingId, $dispatchStatus, $document['id']]);
    } elseif ($action === 'complete') {
        if (!$latest || $latest['office_code'] !== $office || empty($latest['received_at']) ||
            !empty($latest['forwarded_at'])) {
            throw new RuntimeException('Receive the document at its destination before completing its tracking.');
        }
        $stmt = $pdo->prepare('UPDATE tracking_records SET completed_at = ?, completed_by = ? WHERE id = ?');
        $stmt->execute([$now, $actor, $trackingId]);
    } elseif ($action === 'receive') {
        if ($latest && $latest['office_code'] === $office && empty($latest['received_at']) && empty($latest['forwarded_at'])) {
            $stmt = $pdo->prepare('UPDATE tracking_steps SET received_at = ?, received_by = ? WHERE id = ?');
            $stmt->execute([$now, $actor, $latest['id']]);
        } elseif (!$latest || ($latest['forwarded_at'] && $latest['forwarded_to'] === $office) ||
            ($latest['forwarded_at'] && $latest['forwarded_to'] === 'PRC' && in_array($office, $caDestinations, true))) {
            $stmt = $pdo->prepare('INSERT INTO tracking_steps (tracking_id, office_code, received_at, received_by) VALUES (?, ?, ?, ?)');
            $stmt->execute([$trackingId, $office, $now, $actor]);
            if ($office === 'CA' && $latest && $latest['forwarded_to'] === 'CA') {
                $returnStmt = $pdo->prepare("UPDATE documents SET date_returned = COALESCE(NULLIF(date_returned, '0000-00-00 00:00:00'), ?) WHERE id = ?");
                $returnStmt->execute([$now, $document['id']]);
            }
        } else {
            throw new RuntimeException('This document is assigned to ' . $latest['office_code'] . ' or is awaiting its forwarded destination');
        }
    } elseif ($action === 'forSig') {
        if (!$latest || $latest['office_code'] !== $office || empty($latest['received_at']) || !empty($latest['forwarded_at'])) {
            throw new RuntimeException('Receive the document before processing it');
        }
        $stmt = $pdo->prepare('UPDATE tracking_steps SET for_sig_at = ? WHERE id = ?');
        $stmt->execute([$now, $latest['id']]);
    } else {
        if (!$latest || $latest['office_code'] !== $office || empty($latest['received_at']) || empty($latest['for_sig_at']) || !empty($latest['forwarded_at'])) {
            throw new RuntimeException('Complete receipt and signature processing before forwarding it');
        }
        $stmt = $pdo->prepare('UPDATE tracking_steps SET forwarded_at = ?, forwarded_to = ?, forwarded_by = ? WHERE id = ?');
        $stmt->execute([$now, $forwardedTo, $actor, $latest['id']]);
        if ($office === 'CA' && in_array($forwardedTo, $caDestinations, true)) {
            $docStmt = $pdo->prepare(
                "UPDATE documents
                 SET date_forwarded = COALESCE(NULLIF(date_forwarded, '0000-00-00 00:00:00'), ?),
                     status = 'Completed'
                 WHERE id = ?"
            );
            $docStmt->execute([$now, $document['id']]);
        }
    }

    $pdo->commit();
    echo json_encode(['success' => true, 'updatedAt' => $now]);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $error->getMessage()]);
}
