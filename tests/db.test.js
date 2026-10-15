import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initializeDatabase, getDocs, getTracking, createUser } from '../server/db.js';

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'smartdocs-db-test-'));
const targetFile = path.join(testDirectory, 'test-smart-docs.db');

test.after(() => {
  fs.rmSync(testDirectory, { recursive: true, force: true });
});

test('database initializes without demo docs or tracking records', () => {
  const db = initializeDatabase(targetFile);
  const docs = getDocs(db);
  const tracking = getTracking(db);

  assert.ok(Array.isArray(docs));
  assert.equal(docs.length, 0);
  assert.ok(Array.isArray(tracking));
  assert.equal(tracking.length, 0);

  const createdUser = createUser(db, {
    fullName: 'Test User',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    role: 'staff',
    office: 'CMO'
  });

  assert.equal(createdUser.email, 'test@example.com');
  assert.equal(createdUser.role, 'staff');
  db.close();
});
