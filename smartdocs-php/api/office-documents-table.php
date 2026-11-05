<?php

function adtraqsEnsureOfficeDocumentTables(PDO $pdo): void
{
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS office_documents (
            doc_id VARCHAR(80) NOT NULL PRIMARY KEY,
            office_sequence INT NOT NULL,
            office_code VARCHAR(100) NOT NULL,
            office_name VARCHAR(100) NOT NULL,
            date_entered DATE NOT NULL,
            city_admin_control_no VARCHAR(20) NULL,
            title VARCHAR(200) NULL,
            recipient VARCHAR(200) NULL,
            sender VARCHAR(200) NULL,
            subject_line VARCHAR(500) NULL,
            type VARCHAR(30) NOT NULL,
            sub_type VARCHAR(80) NULL,
            payroll_voucher VARCHAR(200) NOT NULL,
            particulars VARCHAR(300) NOT NULL,
            fund VARCHAR(100) NOT NULL,
            amount DECIMAL(15,2) NOT NULL DEFAULT 0,
            signature VARCHAR(150) NULL,
            status ENUM('For Signature','Completed','Flagged') NOT NULL DEFAULT 'For Signature',
            previous_status ENUM('For Signature','Completed') NULL,
            cheque_no VARCHAR(50) NULL,
            pr_number VARCHAR(100) NULL,
            created_by INT NOT NULL,
            created_office VARCHAR(100) NOT NULL,
            updated_by INT NULL,
            updated_office VARCHAR(100) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_office_documents_sequence (office_code, office_sequence),
            UNIQUE KEY uq_office_documents_city_admin_control_no (city_admin_control_no),
            CONSTRAINT fk_office_documents_created_by FOREIGN KEY (created_by) REFERENCES users(id),
            CONSTRAINT fk_office_documents_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
        ) ENGINE=InnoDB"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS office_correspondence_documents (
            doc_id VARCHAR(80) NOT NULL PRIMARY KEY,
            office_sequence INT NOT NULL,
            office_code VARCHAR(100) NOT NULL,
            office_name VARCHAR(100) NOT NULL,
            city_admin_control_no VARCHAR(20) NULL,
            type VARCHAR(30) NOT NULL,
            title VARCHAR(200) NOT NULL,
            recipient VARCHAR(200) NOT NULL,
            sender VARCHAR(200) NOT NULL,
            date_entered DATE NOT NULL,
            subject_line VARCHAR(500) NOT NULL,
            signature VARCHAR(150) NULL,
            date_forwarded DATETIME NULL,
            status ENUM('For Signature','Completed','Flagged') NOT NULL DEFAULT 'For Signature',
            previous_status ENUM('For Signature','Completed') NULL,
            created_by INT NOT NULL,
            created_office VARCHAR(100) NOT NULL,
            updated_by INT NULL,
            updated_office VARCHAR(100) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_office_correspondence_sequence (office_code, office_sequence),
            UNIQUE KEY uq_office_correspondence_city_admin_control_no (city_admin_control_no),
            CONSTRAINT fk_office_correspondence_created_by FOREIGN KEY (created_by) REFERENCES users(id),
            CONSTRAINT fk_office_correspondence_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
        ) ENGINE=InnoDB"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS city_admin_correspondence_documents (
            control_no VARCHAR(20) NOT NULL PRIMARY KEY,
            type VARCHAR(30) NOT NULL,
            office VARCHAR(100) NOT NULL,
            title VARCHAR(200) NOT NULL,
            recipient VARCHAR(200) NOT NULL,
            sender VARCHAR(200) NOT NULL,
            date_entered DATE NOT NULL,
            subject_line VARCHAR(500) NOT NULL,
            signature VARCHAR(150) NOT NULL,
            date_forwarded DATETIME NULL,
            status ENUM('For Signature','Completed','Flagged') NOT NULL DEFAULT 'For Signature',
            previous_status ENUM('For Signature','Completed') NULL,
            created_by INT NOT NULL,
            created_office VARCHAR(100) NOT NULL,
            updated_by INT NULL,
            updated_office VARCHAR(100) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_city_admin_correspondence_created_by FOREIGN KEY (created_by) REFERENCES users(id),
            CONSTRAINT fk_city_admin_correspondence_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
        ) ENGINE=InnoDB"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS office_tracking_records (
            id INT AUTO_INCREMENT PRIMARY KEY,
            office_document_id VARCHAR(80) NULL UNIQUE,
            office_correspondence_id VARCHAR(80) NULL UNIQUE,
            initiated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME NULL,
            completed_by VARCHAR(150) NULL,
            CONSTRAINT fk_office_tracking_document FOREIGN KEY (office_document_id)
                REFERENCES office_documents(doc_id) ON DELETE CASCADE
        ) ENGINE=InnoDB"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS office_tracking_steps (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tracking_id INT NOT NULL,
            office_code VARCHAR(100) NOT NULL,
            received_at DATETIME NULL,
            received_by VARCHAR(150) NULL,
            for_sig_at DATETIME NULL,
            forwarded_at DATETIME NULL,
            forwarded_to VARCHAR(100) NULL,
            forwarded_by VARCHAR(150) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_office_steps_tracking FOREIGN KEY (tracking_id)
                REFERENCES office_tracking_records(id) ON DELETE CASCADE,
            KEY idx_office_steps_tracking_id (tracking_id, id)
        ) ENGINE=InnoDB"
    );
    $trackingDocumentColumn = $pdo->query("SHOW COLUMNS FROM office_tracking_records LIKE 'office_document_id'")->fetch(PDO::FETCH_ASSOC);
    if ($trackingDocumentColumn && $trackingDocumentColumn['Null'] === 'NO') {
        $constraintStmt = $pdo->prepare(
            "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'office_tracking_records'
               AND COLUMN_NAME = 'office_document_id' AND REFERENCED_TABLE_NAME IS NOT NULL"
        );
        $constraintStmt->execute();
        foreach ($constraintStmt->fetchAll(PDO::FETCH_COLUMN) as $constraintName) {
            $pdo->exec('ALTER TABLE office_tracking_records DROP FOREIGN KEY `' . str_replace('`', '``', $constraintName) . '`');
        }
        $pdo->exec('ALTER TABLE office_tracking_records MODIFY office_document_id VARCHAR(80) NULL');
    }
    $documentConstraintStmt = $pdo->prepare(
        "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'office_tracking_records'
           AND COLUMN_NAME = 'office_document_id' AND REFERENCED_TABLE_NAME = 'office_documents'"
    );
    $documentConstraintStmt->execute();
    if (!$documentConstraintStmt->fetchColumn()) {
        $pdo->exec(
            'ALTER TABLE office_tracking_records ADD CONSTRAINT fk_office_tracking_document
             FOREIGN KEY (office_document_id) REFERENCES office_documents(doc_id) ON DELETE CASCADE'
        );
    }
    $correspondenceTrackingColumn = $pdo->query("SHOW COLUMNS FROM office_tracking_records LIKE 'office_correspondence_id'")->fetch(PDO::FETCH_ASSOC);
    if (!$correspondenceTrackingColumn) {
        $pdo->exec('ALTER TABLE office_tracking_records ADD COLUMN office_correspondence_id VARCHAR(80) NULL UNIQUE');
    }
    $correspondenceConstraintStmt = $pdo->prepare(
        "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'office_tracking_records'
           AND COLUMN_NAME = 'office_correspondence_id' AND REFERENCED_TABLE_NAME = 'office_correspondence_documents'"
    );
    $correspondenceConstraintStmt->execute();
    if (!$correspondenceConstraintStmt->fetchColumn()) {
        $pdo->exec(
            'ALTER TABLE office_tracking_records ADD CONSTRAINT fk_office_tracking_correspondence
             FOREIGN KEY (office_correspondence_id) REFERENCES office_correspondence_documents(doc_id) ON DELETE CASCADE'
        );
    }
    $signatureColumn = $pdo->query("SHOW COLUMNS FROM office_documents LIKE 'signature'")->fetch(PDO::FETCH_ASSOC);
    if ($signatureColumn && $signatureColumn['Null'] === 'NO') {
        $pdo->exec('ALTER TABLE office_documents MODIFY signature VARCHAR(150) NULL');
    }
    foreach ([
        'title' => 'VARCHAR(200) NULL',
        'recipient' => 'VARCHAR(200) NULL',
        'sender' => 'VARCHAR(200) NULL',
        'subject_line' => 'VARCHAR(500) NULL',
    ] as $column => $definition) {
        $columnStmt = $pdo->query("SHOW COLUMNS FROM office_documents LIKE " . $pdo->quote($column));
        if (!$columnStmt->fetch(PDO::FETCH_ASSOC)) {
            $pdo->exec("ALTER TABLE office_documents ADD COLUMN {$column} {$definition}");
        }
    }
    foreach ([
        'office_documents' => 'uq_office_documents_city_admin_control_no',
        'office_correspondence_documents' => 'uq_office_correspondence_city_admin_control_no',
    ] as $table => $index) {
        $columnStmt = $pdo->query("SHOW COLUMNS FROM {$table} LIKE 'city_admin_control_no'");
        if (!$columnStmt->fetch(PDO::FETCH_ASSOC)) {
            $pdo->exec("ALTER TABLE {$table} ADD COLUMN city_admin_control_no VARCHAR(20) NULL");
        }
        $indexStmt = $pdo->query("SHOW INDEX FROM {$table} WHERE Key_name = " . $pdo->quote($index));
        if (!$indexStmt->fetch(PDO::FETCH_ASSOC)) {
            $pdo->exec("ALTER TABLE {$table} ADD UNIQUE KEY {$index} (city_admin_control_no)");
        }
    }
    foreach ([
        'created_office' => "VARCHAR(100) NOT NULL DEFAULT ''",
        'updated_office' => 'VARCHAR(100) NULL',
    ] as $column => $definition) {
        $columnStmt = $pdo->query("SHOW COLUMNS FROM city_admin_correspondence_documents LIKE " . $pdo->quote($column));
        if (!$columnStmt->fetch(PDO::FETCH_ASSOC)) {
            $pdo->exec("ALTER TABLE city_admin_correspondence_documents ADD COLUMN {$column} {$definition}");
        }
    }
    foreach ([
        'signature' => 'VARCHAR(150) NULL',
    ] as $column => $definition) {
        $columnStmt = $pdo->query("SHOW COLUMNS FROM office_correspondence_documents LIKE " . $pdo->quote($column));
        if (!$columnStmt->fetch(PDO::FETCH_ASSOC)) {
            $pdo->exec("ALTER TABLE office_correspondence_documents ADD COLUMN {$column} {$definition}");
        }
    }
    $cityAdminForwardedColumn = $pdo->query(
        "SHOW COLUMNS FROM city_admin_correspondence_documents LIKE 'date_forwarded'"
    );
    if (!$cityAdminForwardedColumn->fetch(PDO::FETCH_ASSOC)) {
        $pdo->exec('ALTER TABLE city_admin_correspondence_documents ADD COLUMN date_forwarded DATETIME NULL');
    }
    $correspondenceForwardedColumn = $pdo->query(
        "SHOW COLUMNS FROM office_correspondence_documents LIKE 'date_forwarded'"
    );
    if (!$correspondenceForwardedColumn->fetch(PDO::FETCH_ASSOC)) {
        $pdo->exec('ALTER TABLE office_correspondence_documents ADD COLUMN date_forwarded DATETIME NULL');
        $pdo->exec(
            'UPDATE office_correspondence_documents d
             SET date_forwarded = (
                 SELECT MIN(step.forwarded_at)
                 FROM office_tracking_records record
                 INNER JOIN office_tracking_steps step ON step.tracking_id = record.id
                 WHERE record.office_correspondence_id = d.doc_id
                   AND step.forwarded_at IS NOT NULL
             )
             WHERE d.date_forwarded IS NULL'
        );
    }
}

function adtraqsAcquireCityAdminControlNumberLock(PDO $pdo): void
{
    $lockStmt = $pdo->prepare('SELECT GET_LOCK(?, 10)');
    $lockStmt->execute(['adtraqs_document_control_number']);
    if ((int) $lockStmt->fetchColumn() !== 1) {
        throw new RuntimeException('Could not reserve a City Admin control number. Please try again.');
    }
}

function adtraqsReleaseCityAdminControlNumberLock(PDO $pdo): void
{
    $releaseStmt = $pdo->prepare('SELECT RELEASE_LOCK(?)');
    $releaseStmt->execute(['adtraqs_document_control_number']);
}

function adtraqsAssignCityAdminControlNumber(PDO $pdo, string $table, string $docId): string
{
    $tableColumns = [
        'office_documents' => 'doc_id',
        'office_correspondence_documents' => 'doc_id',
    ];
    if (!isset($tableColumns[$table])) {
        throw new InvalidArgumentException('Unsupported office document table.');
    }

    $column = $tableColumns[$table];
    $existingStmt = $pdo->prepare("SELECT city_admin_control_no FROM {$table} WHERE {$column} = ? LIMIT 1");
    $existingStmt->execute([$docId]);
    $existingControlNo = $existingStmt->fetchColumn();
    if ($existingControlNo !== false && $existingControlNo !== null && $existingControlNo !== '') {
        return (string) $existingControlNo;
    }

    $nextNumber = (int) $pdo->query(
        'SELECT GREATEST(
            COALESCE((SELECT MAX(CAST(control_no AS UNSIGNED)) FROM documents), 0),
            COALESCE((SELECT MAX(CAST(control_no AS UNSIGNED)) FROM city_admin_correspondence_documents), 0),
            COALESCE((SELECT MAX(CAST(city_admin_control_no AS UNSIGNED)) FROM office_documents), 0),
            COALESCE((SELECT MAX(CAST(city_admin_control_no AS UNSIGNED)) FROM office_correspondence_documents), 0)
         ) + 1'
    )->fetchColumn();
    $controlNo = str_pad((string) $nextNumber, 7, '0', STR_PAD_LEFT);
    $updateStmt = $pdo->prepare(
        "UPDATE {$table} SET city_admin_control_no = ? WHERE {$column} = ? AND city_admin_control_no IS NULL"
    );
    $updateStmt->execute([$controlNo, $docId]);
    if ($updateStmt->rowCount() !== 1) {
        $existingStmt->execute([$docId]);
        $existingControlNo = $existingStmt->fetchColumn();
        if ($existingControlNo === false || $existingControlNo === null || $existingControlNo === '') {
            throw new RuntimeException('Unable to assign a City Admin control number.');
        }
        return (string) $existingControlNo;
    }

    return $controlNo;
}

function adtraqsOfficeDocumentPrefix(string $officeName): string
{
    $words = preg_split('/[^a-z0-9]+/i', trim($officeName), -1, PREG_SPLIT_NO_EMPTY) ?: [];
    if (count($words) === 1 && strlen($words[0]) > 1 && strtoupper($words[0]) === $words[0]) {
        return $words[0];
    }

    $prefix = '';
    foreach ($words as $word) {
        if (in_array(strtolower($word), ['and', 'of', 'the'], true)) {
            continue;
        }
        $prefix .= strtoupper(substr($word, 0, 1));
    }

    return $prefix !== '' ? $prefix : 'OFFICE';
}

function adtraqsIsOfficeCorrespondenceType(string $type): bool
{
    $normalized = strtoupper((string) preg_replace('/[^a-z]/i', '', trim($type)));
    return in_array($normalized, ['LETTER', 'MEMO', 'MEMORANDUM', 'MEMORANDOM'], true);
}
