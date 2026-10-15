USE adtraqs;

CREATE TABLE IF NOT EXISTS document_groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  control_range VARCHAR(41) NOT NULL UNIQUE,
  start_control_no VARCHAR(20) NOT NULL,
  end_control_no VARCHAR(20) NOT NULL,
  created_by INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_document_groups_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS document_group_documents (
  group_id INT NOT NULL,
  document_id INT NOT NULL UNIQUE,
  PRIMARY KEY (group_id, document_id),
  CONSTRAINT fk_group_documents_group FOREIGN KEY (group_id) REFERENCES document_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_group_documents_document FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS group_tracking_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  group_id INT NOT NULL UNIQUE,
  initiated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  completed_by VARCHAR(150),
  CONSTRAINT fk_group_tracking_group FOREIGN KEY (group_id) REFERENCES document_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS group_tracking_steps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tracking_id INT NOT NULL,
  office_code VARCHAR(30) NOT NULL,
  received_at DATETIME,
  received_by VARCHAR(150),
  for_sig_at DATETIME,
  forwarded_at DATETIME,
  forwarded_to VARCHAR(50),
  forwarded_by VARCHAR(150),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_group_steps_tracking FOREIGN KEY (tracking_id) REFERENCES group_tracking_records(id) ON DELETE CASCADE
) ENGINE=InnoDB;
