<?php
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/session.php';

$data = json_decode(file_get_contents('php://input'), true) ?? [];
$email = strtolower(trim((string)($data['email'] ?? '')));
$password = (string)($data['password'] ?? '');

try { $pdo->exec('ALTER TABLE users ADD COLUMN contact_number VARCHAR(20) NULL'); } catch (Throwable $ignored) {}

if ($email === '' || $password === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Email and password are required.']);
    exit;
}

$stmt = $pdo->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
$stmt->execute([$email]);
$user = $stmt->fetch();

if (!$user || !password_verify($password, $user['password'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Invalid credentials.']);
    exit;
}

if ($user['status'] !== 'active') {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Account is not active yet.']);
    exit;
}

$stmt = $pdo->prepare('UPDATE users SET last_login = NOW() WHERE id = ?');
$stmt->execute([$user['id']]);
$sessionToken = adtraqsSetSessionUser((int) $user['id']);

echo json_encode([
    'success' => true,
    'session_token' => $sessionToken,
    'user' => [
        'id' => (int)$user['id'],
        'full_name' => $user['full_name'],
        'email' => $user['email'],
        'username' => $user['username'],
        'role' => $user['role'],
        'office' => $user['office'],
        'position' => $user['position'],
        'status' => $user['status'],
        'contact_number' => $user['contact_number'] ?? '',
    ],
]);
