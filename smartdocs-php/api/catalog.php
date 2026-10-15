<?php
require_once __DIR__ . '/../config/database.php';

header('Content-Type: application/json');

function respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

$tables = [
    'offices' => 'offices',
    'funds' => 'funds',
    'types' => 'document_types',
    'signatures' => 'signatures',
];
$type = strtolower(trim((string)($_GET['type'] ?? '')));
if (!isset($tables[$type])) {
    respond(422, ['success' => false, 'message' => 'Invalid catalog type.']);
}
$table = $tables[$type];
$method = $_SERVER['REQUEST_METHOD'];
$definitions = [
    'offices' => 'CREATE TABLE IF NOT EXISTS offices (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE, is_active TINYINT(1) NOT NULL DEFAULT 1)',
    'funds' => 'CREATE TABLE IF NOT EXISTS funds (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE, is_active TINYINT(1) NOT NULL DEFAULT 1)',
    'types' => 'CREATE TABLE IF NOT EXISTS document_types (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(30) NOT NULL UNIQUE, is_active TINYINT(1) NOT NULL DEFAULT 1)',
    'signatures' => 'CREATE TABLE IF NOT EXISTS signatures (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(150) NOT NULL UNIQUE, is_active TINYINT(1) NOT NULL DEFAULT 1)',
];

try {
    $pdo->exec($definitions[$type]);
    if ($method === 'GET') {
        $stmt = $pdo->query("SELECT id, name FROM {$table} WHERE is_active = 1 ORDER BY name ASC");
        respond(200, ['success' => true, 'items' => array_map(static fn(array $row): array => [
            'id' => (int)$row['id'],
            'name' => $row['name'],
        ], $stmt->fetchAll())]);
    }

    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $name = trim((string)($body['name'] ?? ''));
    $id = (int)($body['id'] ?? 0);
    $oldName = trim((string)($body['old_name'] ?? ''));

    if ($method === 'POST') {
        if ($name === '') respond(400, ['success' => false, 'message' => 'Name is required.']);
        $stmt = $pdo->prepare("INSERT INTO {$table} (name) VALUES (?)");
        $stmt->execute([$name]);
        respond(201, ['success' => true, 'id' => (int)$pdo->lastInsertId(), 'name' => $name]);
    }

    if ($method === 'PUT') {
        if ((!$id && $oldName === '') || $name === '') respond(400, ['success' => false, 'message' => 'Item and name are required.']);
        if ($oldName !== '') {
            if ($type === 'signatures') {
                $pdo->beginTransaction();
                $find = $pdo->prepare("SELECT id FROM {$table} WHERE name = ? AND is_active = 1 FOR UPDATE");
                $find->execute([$oldName]);
                if (!$find->fetchColumn()) {
                    $pdo->rollBack();
                    respond(404, ['success' => false, 'message' => 'Signature was not found.']);
                }
            }
            $stmt = $pdo->prepare("UPDATE {$table} SET name = ? WHERE name = ? AND is_active = 1");
            $stmt->execute([$name, $oldName]);
            if ($type === 'signatures') {
                $documents = $pdo->prepare('UPDATE documents SET signature = ? WHERE signature = ?');
                $documents->execute([$name, $oldName]);
                $pdo->commit();
            }
        } else {
            $stmt = $pdo->prepare("UPDATE {$table} SET name = ? WHERE id = ? AND is_active = 1");
            $stmt->execute([$name, $id]);
        }
        respond(200, ['success' => true]);
    }

    if ($method === 'DELETE') {
        if (!$id && $oldName === '') respond(400, ['success' => false, 'message' => 'Item is required.']);
        if ($oldName !== '') {
            $stmt = $pdo->prepare("DELETE FROM {$table} WHERE name = ?");
            $stmt->execute([$oldName]);
        } else {
            $stmt = $pdo->prepare("DELETE FROM {$table} WHERE id = ?");
            $stmt->execute([$id]);
        }
        if ($stmt->rowCount() === 0) respond(404, ['success' => false, 'message' => 'Item was not found.']);
        respond(200, ['success' => true]);
    }

    respond(405, ['success' => false, 'message' => 'Method not allowed.']);
} catch (PDOException $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    respond(409, ['success' => false, 'message' => 'That item already exists or could not be saved.']);
}
