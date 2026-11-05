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
  { fullName: 'City Admin', email: 'admin@example.test', office: 'City Administrative Office', role: 'admin', status: 'Active' },
  { fullName: 'City Admin Staff', email: 'city-admin@example.test', office: 'City Administrative Office', status: 'Active' },
  { fullName: 'Treasurer Staff', email: 'treasurer@example.test', office: 'City Treasurer Office', status: 'Active' },
  { fullName: 'Pending City Staff', email: 'pending@example.test', office: 'City Administrative Office', status: 'Pending' },
].forEach((user) => createUser(testDb, {
  ...user,
  passwordHash: 'test-password',
  role: user.role || 'staff',
}));
testDb.db.prepare(`
  INSERT INTO documents (
    id, date, type, office, payroll_voucher, particulars, fund, amount,
    signature, date_forwarded, status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run('0000123', '2025-01-01', 'DV', 'City Administrative Office', 'PV-1', 'Test document', 'General', 1, 'Signer', '', 'For Signature');
testDb.db.prepare(`
  INSERT INTO tracking (id, control_no, particulars, type, initiated_at, cto_received)
  VALUES (?, ?, ?, ?, ?, ?)
`).run('T1', '0000123', 'Test document', 'DV', '2025-01-01 09:00:00', '2025-01-01 10:00:00');
testDb.db.prepare(`
  INSERT INTO documents (
    id, date, type, office, payroll_voucher, particulars, fund, amount,
    signature, date_forwarded, status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run('CEO-1', '2025-01-02', 'DV', 'City Treasurer Office', 'PV-2', 'Office document', 'General', 1, 'Signer', '', 'For Signature');
testDb.db.prepare(`
  INSERT INTO tracking (id, control_no, particulars, type, initiated_at, cto_received)
  VALUES (?, ?, ?, ?, ?, ?)
`).run('T2', 'CEO-1', 'Office document', 'DV', '2025-01-02 09:00:00', '2025-01-02 10:00:00');
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

test('office accounts share login and processor lookup reveals only location status', async (t) => {
  t.after(async () => {
    server.kill('SIGTERM');
    await once(server, 'exit');
    fs.rmSync(testDirectory, { recursive: true, force: true });
  });
  await serverReady;

  const processorLookup = await fetch('http://127.0.0.1:3001/api/processor-lookup?control_no=0000123');
  assert.equal(processorLookup.status, 200);
  assert.deepEqual((await processorLookup.json()).document, {
    controlNo: '0000123',
    currentOffice: "City Treasurer's Office",
    status: 'Received',
  });

  const officeIdLookup = await fetch('http://127.0.0.1:3001/api/processor-lookup?control_no=CEO-1');
  assert.equal(officeIdLookup.status, 200);
  assert.deepEqual((await officeIdLookup.json()).document, {
    controlNo: 'CEO-1',
    currentOffice: "City Treasurer's Office",
    status: 'Received',
  });

  const login = async (payload) => {
    const response = await fetch('http://127.0.0.1:3001/api/auth/login.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  };

  const demoAdmin = await login({ email: 'admin@smartdocs.local', password: 'admin' });
  assert.equal(demoAdmin.status, 401);
  assert.equal(demoAdmin.data.message, 'User not found.');

  const admin = await login({ email: 'admin@example.test', password: 'test-password' });
  assert.equal(admin.status, 200);
  assert.match(admin.cookie, /^adtraqs_api_session=/);
  assert.equal(typeof admin.data.session_token, 'string');

  const cityAdminStaff = await login({ email: 'city-admin@example.test', password: 'test-password' });
  assert.equal(cityAdminStaff.status, 200);

  const officeAccount = await login({ email: 'treasurer@example.test', password: 'test-password' });
  assert.equal(officeAccount.status, 200);
  assert.equal(officeAccount.data.user.office, 'City Treasurer Office');

  const cityAdminUsers = await fetch('http://127.0.0.1:3001/api/users', {
    headers: {
      Cookie: officeAccount.cookie,
      'X-ADTRAQS-SESSION': cityAdminStaff.data.session_token,
    },
  });
  const cityAdminData = await cityAdminUsers.json();
  assert.deepEqual(cityAdminData.users.map((user) => user.email), ['city-admin@example.test']);

  const treasurerUsers = await fetch('http://127.0.0.1:3001/api/users', {
    headers: {
      Cookie: cityAdminStaff.cookie,
      'X-ADTRAQS-SESSION': officeAccount.data.session_token,
    },
  });
  const treasurerData = await treasurerUsers.json();
  assert.deepEqual(treasurerData.users.map((user) => user.email), ['treasurer@example.test']);

  const pendingAccount = await login({ email: 'pending@example.test', password: 'test-password' });
  assert.equal(pendingAccount.status, 401);

  const createAccount = async (cookie, contactNumber = '09123456789') => {
    const response = await fetch('http://127.0.0.1:3001/api/users.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        full_name: 'Planning Staff',
        email: 'planning@example.test',
        password: 'test-password',
        contact_number: contactNumber,
        role: 'staff',
        office: 'City Planning Office',
      }),
    });
    return { status: response.status, data: await response.json() };
  };
  assert.equal((await createAccount(cityAdminStaff.cookie)).status, 403);
  assert.equal((await createAccount(admin.cookie, '08123456789')).status, 400);
  assert.equal((await createAccount(admin.cookie, '091234567890')).status, 400);
  assert.equal((await createAccount(admin.cookie)).status, 201);

  const newOfficeAccount = await login({ email: 'planning@example.test', password: 'test-password' });
  assert.equal(newOfficeAccount.status, 200);
  assert.equal(newOfficeAccount.data.user.office, 'City Planning Office');

  const userAccounts = await fetch('http://127.0.0.1:3001/api/users', {
    headers: { Cookie: newOfficeAccount.cookie },
  });
  const userData = await userAccounts.json();
  assert.equal(userAccounts.status, 200);
  assert.deepEqual(userData.users.map((user) => user.email), ['planning@example.test']);
  assert.equal(userData.users[0].contactNumber, '09123456789');

  const logoutResponse = await fetch('http://127.0.0.1:3001/api/auth/logout', {
    method: 'POST',
    headers: { Cookie: newOfficeAccount.cookie },
  });
  assert.equal(logoutResponse.status, 200);
  const afterLogout = await fetch('http://127.0.0.1:3001/api/users', {
    headers: { 'X-ADTRAQS-SESSION': newOfficeAccount.data.session_token },
  });
  assert.equal(afterLogout.status, 401);

  const otherSessionAfterLogout = await fetch('http://127.0.0.1:3001/api/users', {
    headers: { 'X-ADTRAQS-SESSION': officeAccount.data.session_token },
  });
  assert.equal(otherSessionAfterLogout.status, 200);
});
