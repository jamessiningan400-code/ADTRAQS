CREATE DATABASE IF NOT EXISTS adtraqs;
USE adtraqs;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  username VARCHAR(80) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin','staff') NOT NULL DEFAULT 'staff',
  office VARCHAR(80),
  position VARCHAR(100),
  contact_number VARCHAR(20),
  status ENUM('active','inactive','pending') NOT NULL DEFAULT 'pending',
  last_login DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS office_staff (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  contact_number VARCHAR(20) NOT NULL,
  office VARCHAR(80) NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS processors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  contact_number VARCHAR(20) NOT NULL,
  UNIQUE KEY uq_processors_identity (full_name, contact_number)
);

CREATE TABLE IF NOT EXISTS documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  control_no VARCHAR(20) NOT NULL UNIQUE,
  date_entered DATE NOT NULL,
  type VARCHAR(30) NOT NULL,
  sub_type VARCHAR(80),
  office VARCHAR(80) NOT NULL,
  payroll_voucher VARCHAR(200) NOT NULL,
  particulars VARCHAR(300) NOT NULL,
  fund VARCHAR(100) NOT NULL,
  amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  signature VARCHAR(150) NOT NULL,
  date_forwarded DATETIME,
  status ENUM('For Signature','Completed','Flagged') NOT NULL DEFAULT 'For Signature',
  previous_status ENUM('For Signature','Completed') DEFAULT NULL,
  cheque_no VARCHAR(50),
  date_returned DATETIME,
  pr_number VARCHAR(100),
  qr_generated TINYINT(1) NOT NULL DEFAULT 0,
  processor_id INT,
  processor_name VARCHAR(150),
  processor_contact_number VARCHAR(20),
  created_by INT NOT NULL,
  updated_by INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_documents_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_documents_updated_by FOREIGN KEY (updated_by) REFERENCES users(id),
  CONSTRAINT fk_documents_processor FOREIGN KEY (processor_id) REFERENCES processors(id)
);

CREATE TABLE IF NOT EXISTS tracking_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  document_id INT NOT NULL,
  initiated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  completed_by VARCHAR(150),
  CONSTRAINT fk_tracking_document FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tracking_steps (
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
  CONSTRAINT fk_steps_tracking FOREIGN KEY (tracking_id) REFERENCES tracking_records(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS document_groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  control_range VARCHAR(41) NOT NULL UNIQUE,
  start_control_no VARCHAR(20) NOT NULL,
  end_control_no VARCHAR(20) NOT NULL,
  created_by INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_document_groups_created_by FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS document_group_documents (
  group_id INT NOT NULL,
  document_id INT NOT NULL UNIQUE,
  PRIMARY KEY (group_id, document_id),
  CONSTRAINT fk_group_documents_group FOREIGN KEY (group_id) REFERENCES document_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_group_documents_document FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS group_tracking_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  group_id INT NOT NULL UNIQUE,
  initiated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  completed_by VARCHAR(150),
  CONSTRAINT fk_group_tracking_group FOREIGN KEY (group_id) REFERENCES document_groups(id) ON DELETE CASCADE
);

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
);

CREATE TABLE IF NOT EXISTS offices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS funds (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS document_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(30) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS signatures (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1
);
