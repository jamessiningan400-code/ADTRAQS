<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/auth/session.php';

header('Content-Type: application/json');

function respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$adminOffice = 'City Administrative Office';
$sessionUser = adtraqsGetSessionUser($pdo);

try { $pdo->exec('ALTER TABLE users ADD COLUMN contact_number VARCHAR(20) NULL'); } catch (Throwable $ignored) {}
$pdo->exec('CREATE TABLE IF NOT EXISTS offices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    is_active TINYINT(1) NOT NULL DEFAULT 1
)');

if ($method === 'GET') {
    if (!$sessionUser) {
        respond(401, ['success' => false, 'message' => 'Sign in before viewing users.']);
    }
    if ($sessionUser['role'] === 'admin') {
        $stmt = $pdo->query('SELECT id, full_name, email, role, office, status, last_login, contact_number FROM users ORDER BY office, full_name ASC');
    } else {
        $stmt = $pdo->prepare('SELECT id, full_name, email, role, office, status, last_login, contact_number FROM users WHERE id = ?');
        $stmt->execute([(int) $sessionUser['id']]);
    }
    $users = array_map(function (array $user): array {
        return [
            'id' => (int) $user['id'],
            'name' => $user['full_name'],
            'email' => $user['email'],
            'role' => ucfirst($user['role']),
            'office' => $user['office'],
            'status' => ucfirst($user['status']),
            'lastLogin' => $user['last_login'] ?: '—',
            'contactNumber' => $user['contact_number'] ?: '',
        ];
    }, $stmt->fetchAll());
    respond(200, ['success' => true, 'users' => $users]);
}

$data = json_decode(file_get_contents('php://input'), true) ?? [];

if ($method === 'POST') {
    if (!$sessionUser) {
        respond(401, ['success' => false, 'message' => 'Sign in before managing users.']);
    }
    if ($sessionUser['role'] !== 'admin') {
        respond(403, ['success' => false, 'message' => 'Only administrators can add users.']);
    }

    $fullName = trim((string) ($data['full_name'] ?? ''));
    $email = strtolower(trim((string) ($data['email'] ?? '')));
    $password = (string) ($data['password'] ?? '');
    $role = strtolower(trim((string) ($data['role'] ?? 'staff')));
    $office = trim((string) ($data['office'] ?? ''));
    $contactNumber = preg_replace('/\D+/', '', (string) ($data['contact_number'] ?? ''));

    if ($office !== '' && strcasecmp($office, $adminOffice) === 0) {
        $office = $adminOffice;
    }

    if ($office === '' || strlen($office) > 80) {
        respond(400, ['success' => false, 'message' => 'Enter an office name of 80 characters or fewer.']);
    }

    if ($fullName === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 4 || !preg_match('/^09\d{9}$/', $contactNumber)) {
        respond(400, ['success' => false, 'message' => 'Enter a name, valid email, contact number starting with 09 and exactly 11 digits, and password of at least 4 characters.']);
    }
    if (strcasecmp($office, $adminOffice) === 0) {
        $configuredOffice = $adminOffice;
    } else {
        $officeStmt = $pdo->prepare('SELECT name FROM offices WHERE name = ? AND is_active = 1 LIMIT 1');
        $officeStmt->execute([$office]);
        $configuredOffice = $officeStmt->fetchColumn();
    }
    if (!$configuredOffice) {
        respond(400, ['success' => false, 'message' => 'Select an active office from Settings.']);
    }
    $office = (string) $configuredOffice;
    if (!in_array($role, ['admin', 'staff'], true)) {
        respond(400, ['success' => false, 'message' => 'Invalid role.']);
    }
    if ($role === 'admin') {
        if ($office !== $adminOffice) {
            respond(400, ['success' => false, 'message' => 'Only City Administrative Office accounts can be administrators.']);
        }
        $check = $pdo->prepare("SELECT COUNT(*) FROM users WHERE role = 'admin' AND office = ?");
        $check->execute([$adminOffice]);
        if ((int) $check->fetchColumn() >= 2) {
            respond(400, ['success' => false, 'message' => 'The City Administrative Office can only have two administrative users.']);
        }
    }

    try {
        $username = strstr($email, '@', true);
        $stmt = $pdo->prepare('INSERT INTO users (full_name, email, username, password, role, office, position, status, contact_number) VALUES (?, ?, ?, ?, ?, ?, ?, "active", ?)');
        $stmt->execute([$fullName, $email, $username, password_hash($password, PASSWORD_BCRYPT), $role, $office, ucfirst($role), $contactNumber]);
        respond(201, ['success' => true, 'message' => 'User created successfully.']);
    } catch (PDOException $e) {
        respond(409, ['success' => false, 'message' => 'Email or username already exists.']);
    }
}

if ($method === 'PUT') {
    $id = (int) ($data['id'] ?? 0);
    $currentPassword = (string) ($data['current_password'] ?? '');
    $newPassword = (string) ($data['new_password'] ?? '');
    if (!$sessionUser) {
        respond(401, ['success' => false, 'message' => 'Sign in before updating your profile.']);
    }
    if (!$id) {
        respond(400, ['success' => false, 'message' => 'User id is required.']);
    }
    if ((int) $sessionUser['id'] !== $id) {
        respond(403, ['success' => false, 'message' => 'You can only update your own profile.']);
    }
    $userStmt = $pdo->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
    $userStmt->execute([$id]);
    $user = $userStmt->fetch();
    if (!$user || !password_verify($currentPassword, $user['password'])) {
        respond(403, ['success' => false, 'message' => 'Current password is incorrect.']);
    }
    $fullName = trim((string) ($data['full_name'] ?? $user['full_name']));
    $email = strtolower(trim((string) ($data['email'] ?? $user['email'])));
    $username = strtolower(trim((string) ($data['username'] ?? $user['username'])));
    $contactNumber = preg_replace('/\D+/', '', (string) ($data['contact_number'] ?? $user['contact_number'] ?? ''));
    if ($fullName === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || $username === '' || !preg_match('/^09\d{9}$/', $contactNumber)) {
        respond(400, ['success' => false, 'message' => 'Name, email, username, and a contact number starting with 09 and exactly 11 digits are required.']);
    }
    try {
        if ($newPassword !== '' && strlen($newPassword) < 4) {
            respond(400, ['success' => false, 'message' => 'New password must be at least 4 characters.']);
        }
        $password = $newPassword !== '' ? password_hash($newPassword, PASSWORD_BCRYPT) : $user['password'];
        $stmt = $pdo->prepare('UPDATE users SET full_name = ?, email = ?, username = ?, password = ?, contact_number = ? WHERE id = ?');
        $stmt->execute([$fullName, $email, $username, $password, $contactNumber, $id]);
        respond(200, ['success' => true, 'message' => 'Profile updated successfully.']);
    } catch (PDOException $e) {
        respond(409, ['success' => false, 'message' => 'Email or username already exists.']);
    }
}

if ($method === 'PATCH') {
    if (!$sessionUser) {
        respond(401, ['success' => false, 'message' => 'Sign in before managing users.']);
    }
    if ($sessionUser['role'] !== 'admin') {
        respond(403, ['success' => false, 'message' => 'Only administrators can manage users.']);
    }

    $id = (int) ($data['id'] ?? 0);
    $status = strtolower(trim((string) ($data['status'] ?? '')));
    $role = strtolower(trim((string) ($data['role'] ?? '')));
    if (!$id || ($status !== ''&&!in_array($status, ['active', 'inactive'], true)) || ($role !== ''&&!in_array($role, ['admin', 'staff'], true)) || ($status === ''&&$role === '')) {
        respond(400, ['success' => false, 'message' => 'Invalid user status update.']);
    }
    if ($role === 'admin') {
        $accountStmt = $pdo->prepare('SELECT office, role FROM users WHERE id = ? LIMIT 1');
        $accountStmt->execute([$id]);
        $account = $accountStmt->fetch();
        if (!$account || $account['office'] !== $adminOffice) {
            respond(400, ['success' => false, 'message' => 'Only City Administrative Office accounts can be administrators.']);
        }
        $adminCount = $pdo->prepare("SELECT COUNT(*) FROM users WHERE role = 'admin' AND office = ?");
        $adminCount->execute([$adminOffice]);
        if ($account['role'] !== 'admin' && (int) $adminCount->fetchColumn() >= 2) {
            respond(400, ['success' => false, 'message' => 'The City Administrative Office can only have two administrative users.']);
        }
    }
    $updates = [];
    $params = [];
    if ($status !== '') { $updates[] = 'status = ?'; $params[] = $status; }
    if ($role !== '') { $updates[] = 'role = ?'; $params[] = $role; }
    $params[] = $id;
    $stmt = $pdo->prepare('UPDATE users SET ' . implode(', ', $updates) . ' WHERE id = ?');
    $stmt->execute($params);
    respond(200, ['success' => true]);
}

if ($method === 'DELETE') {
    if (!$sessionUser) {
        respond(401, ['success' => false, 'message' => 'Sign in before managing users.']);
    }
    if ($sessionUser['role'] !== 'admin') {
        respond(403, ['success' => false, 'message' => 'Only administrators can manage users.']);
    }

    $id = (int) ($data['id'] ?? 0);
    if (!$id) {
        respond(400, ['success' => false, 'message' => 'User id is required.']);
    }
    $stmt = $pdo->prepare('DELETE FROM users WHERE id = ?');
    $stmt->execute([$id]);
    respond(200, ['success' => true]);
}

respond(405, ['success' => false, 'message' => 'Method not allowed.']);