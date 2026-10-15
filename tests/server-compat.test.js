import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createUser, initializeDatabase } from '../server/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'smartdocs-login-test-'));
const databasePath = path.join(testDirectory, 'smart-docs.db');
const testDb = initializeDatabase(databasePath);
[
  { fullName: 'City Admin Staff', email: 'city-admin@example.test', office: 'City Administrative Office', status: 'Active' },
  { fullName: 'Treasurer Staff', email: 'treasurer@example.test', office: 'City Treasurer Office', status: 'Active' },
  { fullName: 'Pending City Staff', email: 'pending@example.test', office: 'City Administrative Office', status: 'Pending' },
].forEach((user) => createUser(testDb, {
  ...user,
  passwordHash: 'test-password',
  role: 'staff',
}));
testDb.close();

const server = spawn(process.execPath, [path.join(projectRoot, 'server', 'index.js')], {
  cwd: projectRoot,
  env: { ...process.env, SMARTDOCS_DB_PATH: databasePath },
  stdio: ['ignore', 'pipe', 'pipe'],
});

const log = [];
let resolveReady;
const serverReady = new Promise((resolve) => { resolveReady = resolve; });
server.stdout.on('data', (chunk) => {
  const output = chunk.toString();
  log.push(output);
  if (output.includes('SMART DOCS API running')) resolveReady();
});
server.stderr.on('data', (chunk) => log.push(chunk.toString()));

server.on('error', (error) => {
  console.error('Server spawn error:', error);
});

test('login is limited to admins and City Admin staff', async (t) => {
  t.after(async () => {
    server.kill('SIGTERM');
    await once(server, 'exit');
    fs.rmSync(testDirectory, { recursive: true, force: true });
  });
  await serverReady;

  const login = async (payload) => {
    const response = await fetch('http://127.0.0.1:3001/api/auth/login.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { status: response.status, data: await response.json() };
  };

  const demoAdmin = await login({ email: 'admin@smartdocs.local', password: 'admin' });
  assert.equal(demoAdmin.status, 401);
  assert.equal(demoAdmin.data.message, 'User not found.');

  const cityAdminStaff = await login({ email: 'city-admin@example.test', password: 'test-password' });
  assert.equal(cityAdminStaff.status, 200);

  const officeAccountOnMain = await login({ email: 'treasurer@example.test', password: 'test-password' });
  assert.equal(officeAccountOnMain.status, 401);

  const officeAccountOnOfficeLogin = await login({
    email: 'treasurer@example.test', password: 'test-password', office: 'City Treasurer Office',
  });
  assert.equal(officeAccountOnOfficeLogin.status, 401);
  assert.equal(officeAccountOnOfficeLogin.data.message, 'Office staff contacts do not use login credentials.');

  const officeAccountOnWrongOffice = await login({
    email: 'treasurer@example.test', password: 'test-password', office: 'City Budget Office',
  });
  assert.equal(officeAccountOnWrongOffice.status, 401);

  const pendingAccount = await login({ email: 'pending@example.test', password: 'test-password' });
  assert.equal(pendingAccount.status, 401);
});
