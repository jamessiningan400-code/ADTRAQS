<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/auth/document-access.php';
require_once __DIR__ . '/office-documents-table.php';

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
adtraqsEnsureOfficeDocumentTables($pdo);
$accessUser = adtraqsGetDocumentAccessUser($pdo);
$controlNo = trim((string)($body['controlNo'] ?? ''));
$office = adtraqsNormalizeTrackingOffice($pdo, (string)($body['office'] ?? ''));
$action = trim((string)($body['action'] ?? ''));
$forwardedTo = adtraqsNormalizeTrackingOffice($pdo, (string)($body['forwardedTo'] ?? ''));
$actor = trim((string)($body['actor'] ?? 'Staff Member')) ?: 'Staff Member';
$configuredOfficeStmt = $pdo->query('SELECT name FROM offices WHERE is_active = 1');
$configuredOfficeCodes = array_values(array_unique(array_merge(['CTO', 'CBO', 'CAO'], array_filter(array_map(
    fn(array $row): ?string => adtraqsNormalizeTrackingOffice($pdo, (string) $row['name']),
    $configuredOfficeStmt->fetchAll()
), static fn(?string $code): bool => $code !== null && $code !== 'PRC'))));
$caDestinations = array_values(array_filter($configuredOfficeCodes, static fn(string $code): bool => $code !== 'CA'));
$allowedOffices = array_values(array_unique(array_merge(['CA'], $configuredOfficeCodes)));
$dispatchDestinations = array_merge($caDestinations, $office === 'CA' ? [] : ['CA']);
$controlNumberLockAcquired = false;

if (!$controlNo || $office === null || !in_array($office, $allowedOffices, true) ||
    !in_array($action, ['receive', 'forSig', 'forward', 'complete', 'dispatch'], true)) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Invalid tracking update']);
    exit;
}
if (($action === 'forward' && ($forwardedTo === null || !in_array($forwardedTo, $allowedOffices, true) || $forwardedTo === $office)) ||
    ($action === 'dispatch' && (
        !in_array($forwardedTo, $dispatchDestinations, true) ||
        $forwardedTo === $office
    ))) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'A different destination office is required']);
    exit;
}
if ($accessUser && $accessUser['officeCode'] !== $office) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'You can only update tracking for your assigned office.']);
    exit;
}

try {
    // Existing installations may still have the old unique office constraint.
    try { $pdo->exec("ALTER TABLE tracking_steps MODIFY office_code VARCHAR(100) NOT NULL, MODIFY forwarded_to VARCHAR(100) NULL"); } catch (Throwable $ignored) {}
    try { $pdo->exec("ALTER TABLE tracking_steps DROP INDEX uq_tracking_office"); } catch (Throwable $ignored) {}
    try { $pdo->exec("ALTER TABLE tracking_records ADD COLUMN completed_at DATETIME NULL, ADD COLUMN completed_by VARCHAR(150) NULL"); } catch (Throwable $ignored) {}

    $documentSql = 'SELECT d.id, d.control_no, d.particulars, d.type, d.date_forwarded, d.status
                    FROM documents d WHERE d.control_no = ?';
    $documentParams = [$controlNo];
    if ($accessUser) {
        $documentSql .= ' AND ' . adtraqsDocumentVisibilitySql('d');
        $documentParams = array_merge($documentParams, adtraqsDocumentVisibilityParams($accessUser));
    }
    $documentSql .= ' LIMIT 1';
    $documentStmt = $pdo->prepare($documentSql);
    $documentStmt->execute($documentParams);
    $document = $documentStmt->fetch();
    $isOfficeDocument = false;
    $officeDocumentTable = 'office_documents';
    $officeTrackingDocumentColumn = 'office_document_id';
    if (!$document) {
        if (!$accessUser) {
            throw new RuntimeException('Document not found');
        }
        $officeDocumentStmt = $pdo->prepare(
            'SELECT doc_id AS control_no, doc_id AS id, particulars, type, status, city_admin_control_no,
                    NULL AS date_forwarded
             FROM office_documents WHERE doc_id = ? LIMIT 1'
        );
        $officeDocumentStmt->execute([$controlNo]);
        $document = $officeDocumentStmt->fetch();
        $isOfficeDocument = (bool) $document;
        if (!$document) {
            $officeDocumentStmt = $pdo->prepare(
                'SELECT doc_id AS control_no, doc_id AS id, subject_line AS particulars, type, status, city_admin_control_no,
                        NULL AS date_forwarded
                 FROM office_correspondence_documents WHERE doc_id = ? LIMIT 1'
            );
            $officeDocumentStmt->execute([$controlNo]);
            $document = $officeDocumentStmt->fetch();
            if ($document) {
                $isOfficeDocument = true;
                $officeDocumentTable = 'office_correspondence_documents';
                $officeTrackingDocumentColumn = 'office_correspondence_id';
            }
        }
    }
    if (!$document) throw new RuntimeException('Document not found');
    $trackingTable = $isOfficeDocument ? 'office_tracking_records' : 'tracking_records';
    $stepsTable = $isOfficeDocument ? 'office_tracking_steps' : 'tracking_steps';
    $trackingDocumentColumn = $isOfficeDocument ? $officeTrackingDocumentColumn : 'document_id';
    $documentId = $isOfficeDocument ? $document['control_no'] : $document['id'];
    $trackingStmt = $pdo->prepare("SELECT id FROM {$trackingTable} WHERE {$trackingDocumentColumn} = ? LIMIT 1");
    $trackingStmt->execute([$documentId]);
    $trackingId = $trackingStmt->fetchColumn();
    if ($isOfficeDocument && $office === 'CA' && !$trackingId) {
        throw new RuntimeException('This office document is not assigned to City Admin.');
    }
    if (!$trackingId) {
        $insertTracking = $pdo->prepare(
            "INSERT INTO {$trackingTable} ({$trackingDocumentColumn}, initiated_at)
             VALUES (?, COALESCE(?, NOW()))"
        );
        $insertTracking->execute([$documentId, $document['date_forwarded'] ?? null]);
        $trackingId = $pdo->lastInsertId();
    }

    $pdo->beginTransaction();
    $completionStmt = $pdo->prepare("SELECT completed_at FROM {$trackingTable} WHERE id = ? FOR UPDATE");
    $completionStmt->execute([$trackingId]);
    $completedAt = $completionStmt->fetchColumn();
    if ($completedAt) {
        throw new RuntimeException('Document tracking is already complete and cannot be changed or forwarded again.');
    }

    $latestStmt = $pdo->prepare("SELECT id, office_code, received_at, for_sig_at, forwarded_at, forwarded_to FROM {$stepsTable} WHERE tracking_id = ? ORDER BY id DESC LIMIT 1");
    $latestStmt->execute([$trackingId]);
    $latest = $latestStmt->fetch();
    if ($isOfficeDocument && $office === 'CA' &&
        (!$latest || (
            !($latest['office_code'] === 'CA' && empty($latest['forwarded_at'])) &&
            !($latest['forwarded_at'] && $latest['forwarded_to'] === 'CA')
        ))) {
        throw new RuntimeException('This office document is not assigned to City Admin.');
    }
    if ($action === 'dispatch' && $forwardedTo === 'CA' && $isOfficeDocument &&
        empty($document['city_admin_control_no'])) {
        adtraqsAcquireCityAdminControlNumberLock($pdo);
        $controlNumberLockAcquired = true;
        adtraqsAssignCityAdminControlNumber($pdo, $officeDocumentTable, (string) $documentId);
    }
    $now = date('Y-m-d H:i:s');

    if ($action === 'dispatch' && $latest && $latest['office_code'] === $office &&
        !empty($latest['forwarded_at']) && $latest['forwarded_to'] === $forwardedTo) {
        $repairStatusStmt = $isOfficeDocument
            ? ($officeDocumentTable === 'office_correspondence_documents'
                ? $pdo->prepare("UPDATE {$officeDocumentTable}
                                 SET date_forwarded = COALESCE(date_forwarded, ?), status = 'Completed'
                                 WHERE doc_id = ?")
                : $pdo->prepare("UPDATE {$officeDocumentTable} SET status = 'Completed' WHERE doc_id = ?"))
            : $pdo->prepare(
                "UPDATE documents
                 SET date_forwarded = COALESCE(NULLIF(date_forwarded, '0000-00-00 00:00:00'), ?),
                     status = 'Completed'
                 WHERE id = ?"
            );
        $repairStatusStmt->execute($isOfficeDocument
            ? ($officeDocumentTable === 'office_correspondence_documents'
                ? [$latest['forwarded_at'], $documentId]
                : [$documentId])
            : [$latest['forwarded_at'], $documentId]);
        $pdo->commit();
        if ($controlNumberLockAcquired) {
            adtraqsReleaseCityAdminControlNumberLock($pdo);
            $controlNumberLockAcquired = false;
        }
        echo json_encode(['success' => true, 'updatedAt' => $latest['forwarded_at'], 'idempotent' => true]);
        exit;
    }

    if ($action === 'dispatch') {
        if ($latest && ($latest['office_code'] !== $office || empty($latest['received_at']) || !empty($latest['forwarded_at']))) {
            throw new RuntimeException('Receive the document at your assigned office before forwarding it.');
        }
        if ($latest) {
            $stmt = $pdo->prepare("UPDATE {$stepsTable} SET forwarded_at = ?, forwarded_to = ?, forwarded_by = ? WHERE id = ?");
            $stmt->execute([$now, $forwardedTo, $actor, $latest['id']]);
        } else {
            $stmt = $pdo->prepare("INSERT INTO {$stepsTable} (tracking_id, office_code, forwarded_at, forwarded_to, forwarded_by) VALUES (?, ?, ?, ?, ?)");
            $stmt->execute([$trackingId, $office, $now, $forwardedTo, $actor]);
        }
        $dispatchStatus = 'Completed';
        if ($isOfficeDocument) {
            $docStmt = $officeDocumentTable === 'office_correspondence_documents'
                ? $pdo->prepare("UPDATE {$officeDocumentTable}
                                 SET date_forwarded = COALESCE(date_forwarded, ?), status = ?
                                 WHERE doc_id = ?")
                : $pdo->prepare("UPDATE {$officeDocumentTable} SET status = ? WHERE doc_id = ?");
            $docStmt->execute($officeDocumentTable === 'office_correspondence_documents'
                ? [$now, $dispatchStatus, $documentId]
                : [$dispatchStatus, $documentId]);
        } else {
            $docStmt = $pdo->prepare("UPDATE documents SET date_forwarded = COALESCE(NULLIF(date_forwarded, '0000-00-00 00:00:00'), ?), status = ? WHERE id = ?");
            $docStmt->execute([$now, $dispatchStatus, $documentId]);
        }
    } elseif ($action === 'complete') {
        if (!$latest || $latest['office_code'] !== $office || empty($latest['received_at']) ||
            !empty($latest['forwarded_at'])) {
            throw new RuntimeException('Receive the document at its destination before completing its tracking.');
        }
        $stmt = $pdo->prepare("UPDATE {$trackingTable} SET completed_at = ?, completed_by = ? WHERE id = ?");
        $stmt->execute([$now, $actor, $trackingId]);
    } elseif ($action === 'receive') {
        if ($latest && $latest['office_code'] === $office && empty($latest['received_at']) && empty($latest['forwarded_at'])) {
            $stmt = $pdo->prepare("UPDATE {$stepsTable} SET received_at = ?, received_by = ? WHERE id = ?");
            $stmt->execute([$now, $actor, $latest['id']]);
        } elseif (!$latest || ($latest['forwarded_at'] && $latest['forwarded_to'] === $office) ||
            ($latest['forwarded_at'] && $latest['forwarded_to'] === 'PRC' && in_array($office, $caDestinations, true))) {
            $stmt = $pdo->prepare("INSERT INTO {$stepsTable} (tracking_id, office_code, received_at, received_by) VALUES (?, ?, ?, ?)");
            $stmt->execute([$trackingId, $office, $now, $actor]);
            if (!$isOfficeDocument && $office === 'CA' && $latest && $latest['forwarded_to'] === 'CA') {
                $returnStmt = $pdo->prepare("UPDATE documents SET date_returned = COALESCE(NULLIF(date_returned, '0000-00-00 00:00:00'), ?) WHERE id = ?");
                $returnStmt->execute([$now, $documentId]);
            }
        } else {
            throw new RuntimeException('This document is assigned to ' . $latest['office_code'] . ' or is awaiting its forwarded destination');
        }
    } elseif ($action === 'forSig') {
        if (!$latest || $latest['office_code'] !== $office || empty($latest['received_at']) || !empty($latest['forwarded_at'])) {
            throw new RuntimeException('Receive the document before processing it');
        }
        $stmt = $pdo->prepare("UPDATE {$stepsTable} SET for_sig_at = ? WHERE id = ?");
        $stmt->execute([$now, $latest['id']]);
    } else {
        if (!$latest || $latest['office_code'] !== $office || empty($latest['received_at']) || empty($latest['for_sig_at']) || !empty($latest['forwarded_at'])) {
            throw new RuntimeException('Complete receipt and signature processing before forwarding it');
        }
        $stmt = $pdo->prepare("UPDATE {$stepsTable} SET forwarded_at = ?, forwarded_to = ?, forwarded_by = ? WHERE id = ?");
        $stmt->execute([$now, $forwardedTo, $actor, $latest['id']]);
        if (!$isOfficeDocument && $office === 'CA' && $forwardedTo !== 'CA') {
            $docStmt = $pdo->prepare(
                "UPDATE documents
                 SET date_forwarded = COALESCE(NULLIF(date_forwarded, '0000-00-00 00:00:00'), ?),
                     status = 'Completed'
                 WHERE id = ?"
            );
            $docStmt->execute([$now, $documentId]);
        }
    }

    if ($isOfficeDocument && $accessUser && $accessUser['id'] > 0) {
        $auditStmt = $pdo->prepare(
            "UPDATE {$officeDocumentTable}
             SET updated_by = ?, updated_office = ?, updated_at = NOW()
             WHERE doc_id = ?"
        );
        $auditStmt->execute([$accessUser['id'], $accessUser['officeName'], $documentId]);
    }

    $pdo->commit();
    if ($controlNumberLockAcquired) {
        adtraqsReleaseCityAdminControlNumberLock($pdo);
        $controlNumberLockAcquired = false;
    }
    echo json_encode(['success' => true, 'updatedAt' => $now]);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    if ($controlNumberLockAcquired) {
        adtraqsReleaseCityAdminControlNumberLock($pdo);
    }
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $error->getMessage()]);
}
