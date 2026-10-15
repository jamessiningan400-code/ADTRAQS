<?php

function ensureProcessorTable(PDO $pdo): void
{
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS processors (
            id INT AUTO_INCREMENT PRIMARY KEY,
            full_name VARCHAR(150) NOT NULL,
            contact_number VARCHAR(20) NOT NULL,
            UNIQUE KEY uq_processors_identity (full_name, contact_number)
        )"
    );

    foreach ([
        'processor_name' => 'VARCHAR(150) NULL',
        'processor_contact_number' => 'VARCHAR(20) NULL',
        'processor_id' => 'INT NULL',
    ] as $column => $definition) {
        if (!$pdo->query("SHOW COLUMNS FROM documents LIKE '{$column}'")->fetch()) {
            $pdo->exec("ALTER TABLE documents ADD COLUMN {$column} {$definition}");
        }
    }

    $pdo->exec(
        "INSERT IGNORE INTO processors (full_name, contact_number)
         SELECT DISTINCT TRIM(processor_name), TRIM(processor_contact_number)
         FROM documents
         WHERE processor_name IS NOT NULL
           AND TRIM(processor_name) <> ''
           AND processor_contact_number IS NOT NULL
           AND TRIM(processor_contact_number) <> ''"
    );
    $pdo->exec(
        "UPDATE documents d
         INNER JOIN processors p
           ON p.full_name = TRIM(d.processor_name)
          AND p.contact_number = TRIM(d.processor_contact_number)
         SET d.processor_id = p.id
         WHERE d.processor_id IS NULL"
    );
}
