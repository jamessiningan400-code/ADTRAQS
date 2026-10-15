<?php
require_once __DIR__ . '/../../config/database.php';

$data = json_decode(file_get_contents('php://input'), true) ?? [];
$fullName = trim((string)($data['full_name'] ?? ''));
$email = strtolower(trim((string)($data['email'] ?? '')));
$username = strtolower(trim((string)($data['username'] ?? '')));
$password = (string)($data['password'] ?? '');
$office = trim((string)($data['office'] ?? ''));
$position = trim((string)($data['position'] ?? ''));

if ($fullName === '' || $email === '' || $username === '' || $password === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Please complete all required fields.']);
    exit;
}

if (strlen($password) < 6) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Password must be at least 6 characters.']);
    exit;
}

$check = $pdo->prepare('SELECT id FROM users WHERE email = ? OR username = ? LIMIT 1');
$check->execute([$email, $username]);
if ($check->fetch()) {
    http_response_code(409);
    echo json_encode(['success' => false, 'message' => 'Email or username already exists.']);
    exit;
}

$hash = password_hash($password, PASSWORD_BCRYPT);
$stmt = $pdo->prepare('INSERT INTO users (full_name, email, username, password, role, office, position, status) VALUES (?, ?, ?, ?, ?, ?, ?, "pending")');
$stmt->execute([$fullName, $email, $username, $hash, 'staff', $office, $position]);

http_response_code(201);
echo json_encode([
    'success' => true,
    'message' => 'Registration submitted. Please wait for admin approval.',
]);
