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
  created_by INT NOT NULL,
  updated_by INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_documents_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_documents_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS office_documents (
  doc_id VARCHAR(80) NOT NULL PRIMARY KEY,
  office_sequence INT NOT NULL,
  office_code VARCHAR(100) NOT NULL,
  office_name VARCHAR(100) NOT NULL,
  date_entered DATE NOT NULL,
  city_admin_control_no VARCHAR(20) UNIQUE,
  title VARCHAR(200),
  recipient VARCHAR(200),
  sender VARCHAR(200),
  subject_line VARCHAR(500),
  type VARCHAR(30) NOT NULL,
  sub_type VARCHAR(80),
  payroll_voucher VARCHAR(200) NOT NULL,
  particulars VARCHAR(300) NOT NULL,
  fund VARCHAR(100) NOT NULL,
  amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  signature VARCHAR(150),
  status ENUM('For Signature','Completed','Flagged') NOT NULL DEFAULT 'For Signature',
  previous_status ENUM('For Signature','Completed') DEFAULT NULL,
  cheque_no VARCHAR(50),
  pr_number VARCHAR(100),
  created_by INT NOT NULL,
  created_office VARCHAR(100) NOT NULL,
  updated_by INT,
  updated_office VARCHAR(100),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_office_documents_sequence (office_code, office_sequence),
  CONSTRAINT fk_office_documents_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_office_documents_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS office_correspondence_documents (
  doc_id VARCHAR(80) NOT NULL PRIMARY KEY,
  office_sequence INT NOT NULL,
  office_code VARCHAR(100) NOT NULL,
  office_name VARCHAR(100) NOT NULL,
  city_admin_control_no VARCHAR(20) UNIQUE,
  type VARCHAR(30) NOT NULL,
  title VARCHAR(200) NOT NULL,
  recipient VARCHAR(200) NOT NULL,
  sender VARCHAR(200) NOT NULL,
  date_entered DATE NOT NULL,
  subject_line VARCHAR(500) NOT NULL,
  signature VARCHAR(150),
  date_forwarded DATETIME,
  status ENUM('For Signature','Completed','Flagged') NOT NULL DEFAULT 'For Signature',
  previous_status ENUM('For Signature','Completed') DEFAULT NULL,
  created_by INT NOT NULL,
  created_office VARCHAR(100) NOT NULL,
  updated_by INT,
  updated_office VARCHAR(100),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_office_correspondence_sequence (office_code, office_sequence),
  CONSTRAINT fk_office_correspondence_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_office_correspondence_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS city_admin_correspondence_documents (
  control_no VARCHAR(20) NOT NULL PRIMARY KEY,
  type VARCHAR(30) NOT NULL,
  office VARCHAR(100) NOT NULL,
  title VARCHAR(200) NOT NULL,
  recipient VARCHAR(200) NOT NULL,
  sender VARCHAR(200) NOT NULL,
  date_entered DATE NOT NULL,
  subject_line VARCHAR(500) NOT NULL,
  signature VARCHAR(150) NOT NULL,
  date_forwarded DATETIME,
  status ENUM('For Signature','Completed','Flagged') NOT NULL DEFAULT 'For Signature',
  previous_status ENUM('For Signature','Completed') DEFAULT NULL,
  created_by INT NOT NULL,
  created_office VARCHAR(100) NOT NULL,
  updated_by INT,
  updated_office VARCHAR(100),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_city_admin_correspondence_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_city_admin_correspondence_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS office_tracking_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  office_document_id VARCHAR(80) UNIQUE,
  office_correspondence_id VARCHAR(80) UNIQUE,
  initiated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  completed_by VARCHAR(150),
  CONSTRAINT fk_office_tracking_document FOREIGN KEY (office_document_id)
    REFERENCES office_documents(doc_id) ON DELETE CASCADE,
  CONSTRAINT fk_office_tracking_correspondence FOREIGN KEY (office_correspondence_id)
    REFERENCES office_correspondence_documents(doc_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS office_tracking_steps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tracking_id INT NOT NULL,
  office_code VARCHAR(100) NOT NULL,
  received_at DATETIME,
  received_by VARCHAR(150),
  for_sig_at DATETIME,
  forwarded_at DATETIME,
  forwarded_to VARCHAR(100),
  forwarded_by VARCHAR(150),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_office_steps_tracking FOREIGN KEY (tracking_id)
    REFERENCES office_tracking_records(id) ON DELETE CASCADE,
  KEY idx_office_steps_tracking_id (tracking_id, id)
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
  office_code VARCHAR(100) NOT NULL,
  received_at DATETIME,
  received_by VARCHAR(150),
  for_sig_at DATETIME,
  forwarded_at DATETIME,
  forwarded_to VARCHAR(100),
  forwarded_by VARCHAR(150),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_steps_tracking FOREIGN KEY (tracking_id) REFERENCES tracking_records(id) ON DELETE CASCADE
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
