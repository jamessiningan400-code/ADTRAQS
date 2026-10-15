<?php
date_default_timezone_set('Asia/Manila');

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$localConfigPath = __DIR__ . '/database.local.php';
$localConfig = is_file($localConfigPath) ? require $localConfigPath : [];
if (!is_array($localConfig)) {
    throw new RuntimeException('Database local config must return an array.');
}

$host = getenv('SMARTDOCS_DB_HOST') ?: ($localConfig['host'] ?? '127.0.0.1');
$db = getenv('SMARTDOCS_DB_NAME') ?: ($localConfig['database'] ?? 'adtraqs');
$user = getenv('SMARTDOCS_DB_USER') ?: ($localConfig['username'] ?? 'root');
$environmentPassword = getenv('SMARTDOCS_DB_PASSWORD');
$pass = $environmentPassword === false
    ? ($localConfig['password'] ?? '')
    : $environmentPassword;
$charset = 'utf8mb4';

$dsn = "mysql:host={$host};dbname={$db};charset={$charset}";
$options = [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
];

try {
    $pdo = new PDO($dsn, $user, $pass, $options);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Database connection failed',
        'error' => $e->getMessage(),
    ]);
    exit;
}
