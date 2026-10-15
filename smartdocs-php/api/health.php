<?php
header('Content-Type: application/json');

echo json_encode([
    'success' => true,
    'status' => 'healthy',
    'database' => 'smartdocs_db',
    'environment' => 'xampp-mysql',
]);
