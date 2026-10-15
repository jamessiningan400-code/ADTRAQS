<?php
require_once __DIR__ . '/../config/database.php';

header('Content-Type: application/json');

echo json_encode([
    'success' => true,
    'status' => 'healthy',
    'database' => $db,
    'environment' => 'mysql',
]);
