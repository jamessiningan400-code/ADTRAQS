<?php
require_once __DIR__ . '/../config/database.php';

header('Content-Type: application/json');

function respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$staffOffices = ['City Administrative Office', 'City Treasurer Office', 'City Budget Office', 'City Accounting Office'];
$adminOffice = 'City Administrative Office';

try { $pdo->exec('ALTER TABLE users ADD COLUMN contact_number VARCHAR(20) NULL'); } catch (Throwable $ignored) {}
$pdo->exec('CREATE TABLE IF NOT EXISTS office_staff (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    contact_number VARCHAR(20) NOT NULL,
    office VARCHAR(80) NOT NULL,
    status ENUM("active", "inactive") NOT NULL DEFAULT "active",
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)');

if ($method === 'GET') {
    $stmt = $pdo->prepare('SELECT id, full_name, email, role, office, status, last_login, contact_number FROM users WHERE office = ? OR role = "admin" ORDER BY full_name ASC');
    $stmt->execute([$adminOffice]);
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
    $staffStmt = $pdo->query('SELECT id, full_name, contact_number, office, status FROM office_staff ORDER BY office, full_name');
    $officeStaff = array_map(static function (array $member): array {
        return [
            'id' => (int) $member['id'],
            'fullName' => $member['full_name'],
            'contactNumber' => $member['contact_number'],
            'office' => $member['office'],
            'status' => ucfirst($member['status']),
        ];
    }, $staffStmt->fetchAll());
    respond(200, ['success' => true, 'users' => $users, 'officeStaff' => $officeStaff]);
}

$data = json_decode(file_get_contents('php://input'), true) ?? [];

if ($method === 'POST') {
    $fullName = trim((string) ($data['full_name'] ?? ''));
    $email = strtolower(trim((string) ($data['email'] ?? '')));
    $password = (string) ($data['password'] ?? '');
    $role = strtolower(trim((string) ($data['role'] ?? 'staff')));
    $office = trim((string) ($data['office'] ?? ''));
    $contactNumber = preg_replace('/\D+/', '', (string) ($data['contact_number'] ?? ''));

    if ($office !== $adminOffice) {
        if (!in_array($office, $staffOffices, true)) {
            respond(400, ['success' => false, 'message' => 'Select a valid office.']);
        }
        if ($fullName === '') {
            respond(400, ['success' => false, 'message' => 'First name and last name are required.']);
        }
        if (!preg_match('/^\d{11}$/', $contactNumber)) {
            respond(400, ['success' => false, 'message' => 'Contact number must be exactly 11 digits only.']);
        }
        $stmt = $pdo->prepare('INSERT INTO office_staff (full_name, contact_number, office) VALUES (?, ?, ?)');
        $stmt->execute([$fullName, $contactNumber, $office]);
        respond(201, ['success' => true, 'message' => 'Office staff contact saved.']);
    }

    if ($fullName === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 4 || !preg_match('/^\d{11}$/', $contactNumber)) {
        respond(400, ['success' => false, 'message' => 'Enter a name, valid email, and password of at least 4 characters.']);
    }
    if (!in_array($role, ['admin', 'staff'], true)) {
        respond(400, ['success' => false, 'message' => 'Invalid role.']);
    }
    if ($role === 'admin') {
        $office = $adminOffice;
        $check = $pdo->prepare("SELECT COUNT(*) FROM users WHERE role = 'admin' AND office = ?");
        $check->execute([$adminOffice]);
        if ((int) $check->fetchColumn() >= 2) {
            respond(400, ['success' => false, 'message' => 'The City Administrative Office can only have two administrative users.']);
        }
    } elseif ($office !== $adminOffice && !in_array($office, $staffOffices, true)) {
        respond(400, ['success' => false, 'message' => 'Select a valid staff office.']);
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
    $contactId = (int) ($data['contact_id'] ?? 0);
    if ($contactId) {
        $fullName = trim((string) ($data['full_name'] ?? ''));
        $contactNumber = preg_replace('/\D+/', '', (string) ($data['contact_number'] ?? ''));
        $office = trim((string) ($data['office'] ?? ''));
        $status = strtolower(trim((string) ($data['status'] ?? 'active')));

        if ($fullName === '' || !preg_match('/^\d{11}$/', $contactNumber)) {
            respond(400, ['success' => false, 'message' => 'Name and an 11-digit contact number are required.']);
        }
        if (!in_array($office, $staffOffices, true)) {
            respond(400, ['success' => false, 'message' => 'Select a valid office.']);
        }
        if (!in_array($status, ['active', 'inactive'], true)) {
            respond(400, ['success' => false, 'message' => 'Select a valid status.']);
        }

        $stmt = $pdo->prepare('UPDATE office_staff SET full_name = ?, contact_number = ?, office = ?, status = ? WHERE id = ?');
        $stmt->execute([$fullName, $contactNumber, $office, $status, $contactId]);
        if ($stmt->rowCount() === 0) {
            $exists = $pdo->prepare('SELECT 1 FROM office_staff WHERE id = ?');
            $exists->execute([$contactId]);
            if (!$exists->fetchColumn()) {
                respond(404, ['success' => false, 'message' => 'Office staff record was not found.']);
            }
        }
        respond(200, ['success' => true, 'message' => 'Office staff details updated.']);
    }

    $id = (int) ($data['id'] ?? 0);
    $currentPassword = (string) ($data['current_password'] ?? '');
    $newPassword = (string) ($data['new_password'] ?? '');
    if (!$id) {
        respond(400, ['success' => false, 'message' => 'User id is required.']);
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
    if ($fullName === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || $username === '' || !preg_match('/^\d{11}$/', $contactNumber)) {
        respond(400, ['success' => false, 'message' => 'Name, email, and username are required.']);
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
    $contactId = (int) ($data['contact_id'] ?? 0);
    if ($contactId) {
        $stmt = $pdo->prepare('DELETE FROM office_staff WHERE id = ?');
        $stmt->execute([$contactId]);
        respond(200, ['success' => true]);
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