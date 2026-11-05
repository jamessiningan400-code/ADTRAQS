<?php

function adtraqsStartSession(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    $sessionToken = $_SERVER['HTTP_X_ADTRAQS_SESSION'] ?? '';
    if ($sessionToken !== '') {
        if (!preg_match('/^[A-Za-z0-9,-]{16,128}$/D', $sessionToken)) {
            $sessionToken = bin2hex(random_bytes(32));
        }
        session_id($sessionToken);
    }

    $secure = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    session_set_cookie_params([
        'httponly' => true,
        'secure' => $secure,
        'samesite' => 'Lax',
        'path' => '/',
    ]);
    session_start();
}

function adtraqsSetSessionUser(int $userId): string
{
    adtraqsStartSession();
    session_regenerate_id(true);
    $_SESSION['user_id'] = $userId;
    return session_id();
}

function adtraqsGetSessionUser(PDO $pdo): ?array
{
    adtraqsStartSession();
    $userId = (int) ($_SESSION['user_id'] ?? 0);
    if ($userId < 1) {
        return null;
    }

    $stmt = $pdo->prepare('SELECT id, role, office, status FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    if (!$user || strtolower((string) $user['status']) !== 'active') {
        return null;
    }

    return $user;
}

function adtraqsClearSession(): void
{
    adtraqsStartSession();
    $_SESSION = [];
    if (empty($_SERVER['HTTP_X_ADTRAQS_SESSION']) && ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $params['path'],
            'domain' => $params['domain'],
            'secure' => $params['secure'],
            'httponly' => $params['httponly'],
            'samesite' => $params['samesite'] ?? 'Lax',
        ]);
    }
    session_destroy();
}
