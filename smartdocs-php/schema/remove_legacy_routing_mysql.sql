ALTER TABLE documents
  DROP FOREIGN KEY fk_documents_processor,
  DROP COLUMN processor_id,
  DROP COLUMN processor_name,
  DROP COLUMN processor_contact_number;

DROP TABLE IF EXISTS group_tracking_steps;
DROP TABLE IF EXISTS group_tracking_records;
DROP TABLE IF EXISTS document_group_documents;
DROP TABLE IF EXISTS document_groups;
DROP TABLE IF EXISTS office_staff;
DROP TABLE IF EXISTS processors;
