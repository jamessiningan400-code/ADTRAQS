<?php
require_once __DIR__ . '/../../config/database.php';

$data = json_decode(file_get_contents('php://input'), true) ?? [];
$email = strtolower(trim((string)($data['email'] ?? '')));
$password = (string)($data['password'] ?? '');
$office = trim((string)($data['office'] ?? ''));

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

if ($office !== '' && strcasecmp($office, 'City Administrative Office') !== 0) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Office staff contacts do not use login credentials.']);
    exit;
}

if ($office !== '' && $user['office'] !== $office) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'This account is not assigned to this office.']);
    exit;
}

if ($office === '' && $user['role'] !== 'admin' &&
    !($user['role'] === 'staff' && strcasecmp(trim((string)($user['office'] ?? '')), 'City Administrative Office') === 0)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'This account is not assigned to the main ADTRAQS system. Use your office login.']);
    exit;
}

$stmt = $pdo->prepare('UPDATE users SET last_login = NOW() WHERE id = ?');
$stmt->execute([$user['id']]);

echo json_encode([
    'success' => true,
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
