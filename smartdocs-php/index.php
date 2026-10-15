<?php
require_once __DIR__ . '/config/database.php';

$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
$path = parse_url($requestUri, PHP_URL_PATH);

$routes = [
    '/smartdocs/api/auth/login' => __DIR__ . '/api/auth/login.php',
    '/smartdocs/api/auth/signup' => __DIR__ . '/api/auth/signup.php',
    '/smartdocs/api/users' => __DIR__ . '/api/users.php',
];

if (isset($routes[$path])) {
    require_once $routes[$path];
    exit;
}

http_response_code(404);
echo json_encode(['success' => false, 'message' => 'Endpoint not found']);
