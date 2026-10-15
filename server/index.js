import http from 'node:http';
import { URL } from 'node:url';
import {
  initializeDatabase,
  getDocs,
  getTracking,
  createUser,
  getUserByEmail,
} from './db.js';

const db = initializeDatabase(process.env.SMARTDOCS_DB_PATH);
const PORT = process.env.PORT || 3001;
function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

async function getUsers() {
  let users;
  if (db.kind === 'postgres') {
    await db.ready;
    const result = await db.pool.query('SELECT * FROM users ORDER BY full_name ASC');
    users = result.rows;
  } else {
    users = db.db.prepare('SELECT * FROM users ORDER BY full_name ASC').all();
  }
  return users.map((user) => ({
    id: user.id,
    name: user.full_name,
    email: user.email,
    role: String(user.role || 'staff').charAt(0).toUpperCase() + String(user.role || 'staff').slice(1),
    office: user.office,
    status: String(user.status || 'active').charAt(0).toUpperCase() + String(user.status || 'active').slice(1),
    lastLogin: user.last_login || '—',
  }));
}

export async function handleLogin(body) {
  const rawEmail = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const normalizedEmail = rawEmail === 'admin' ? 'admin@smartdocs.local' : rawEmail;

  if (!normalizedEmail || !password) {
    return { ok: false, success: false, message: 'Email and password are required.' };
  }

  const user = await getUserByEmail(db, normalizedEmail);
  if (!user) {
    return { ok: false, success: false, message: 'User not found.' };
  }

  if (user.password_hash !== password) {
    return { ok: false, success: false, message: 'Incorrect password.' };
  }

  if (String(user.status || '').toLowerCase() !== 'active') {
    return { ok: false, message: 'Account is not active yet.' };
  }

  const requestedOffice = String(body.office || '').trim();
  if (requestedOffice) {
    if (requestedOffice.toLowerCase() !== 'city administrative office') {
      return { ok: false, message: 'Office staff contacts do not use login credentials.' };
    }
    if (String(user.office || '').trim().toLowerCase() !== requestedOffice.toLowerCase()) {
      return { ok: false, message: 'This account is not assigned to this office.' };
    }
  } else {
    const isMainSystemAccount = user.role === 'admin' ||
      (user.role === 'staff' && String(user.office || '').trim().toLowerCase() === 'city administrative office');
    if (!isMainSystemAccount) {
      return { ok: false, message: 'This account is not assigned to the main SMART DOCS system. Use your office login.' };
    }
  }

  return {
    ok: true,
    success: true,
    user: {
      id: user.id,
      full_name: user.full_name,
      fullName: user.full_name,
      username: user.username || user.email.split('@')[0],
      email: user.email,
      role: user.role,
      office: user.office,
      position: user.position || user.role,
      status: user.status,
      lastLogin: user.last_login,
    },
  };
}

async function handleRegister(body) {
  const fullName = String(body.fullName || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const office = String(body.office || 'CHO').trim();
  const role = String(body.role || 'staff').trim();

  if (!fullName || !email || !password) {
    return { ok: false, success: false, message: 'Full name, email and password are required.' };
  }

  try {
    const user = await createUser(db, {
      fullName,
      email,
      passwordHash: password,
      role,
      office,
      status: 'Pending',
    });

    return { ok: true, success: true, user };
  } catch (error) {
    return { ok: false, success: false, message: error.message || 'Unable to create user.' };
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname.replace(/\/+$|\.php$/gi, '');

  if (req.method === 'GET' && pathname === '/api/health') {
    sendJson(res, 200, { ok: true, success: true, status: 'healthy' });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/docs') {
    const docs = await getDocs(db);
    sendJson(res, 200, { ok: true, success: true, docs });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/tracking') {
    const tracking = await getTracking(db);
    sendJson(res, 200, { ok: true, success: true, tracking });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/users') {
    const users = await getUsers();
    sendJson(res, 200, { success: true, users, officeStaff: [] });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/catalog.php') {
    sendJson(res, 503, {
      success: false,
      message: 'Catalog data is unavailable from this backend. Configure the XAMPP database API.',
    });
    return;
  }

  if ((req.method === 'POST' && (url.pathname === '/api/login' || url.pathname === '/api/auth/login.php')) ||
      (req.method === 'POST' && (url.pathname === '/api/auth/login' || url.pathname === '/api/auth/login.php'))) {
    try {
      const body = await parseBody(req);
      const result = await handleLogin(body);
      sendJson(res, result.ok ? 200 : 401, result);
    } catch (error) {
      sendJson(res, 400, { ok: false, success: false, message: error.message || 'Bad request' });
    }
    return;
  }

  if ((req.method === 'POST' && (url.pathname === '/api/register' || url.pathname === '/api/auth/signup.php')) ||
      (req.method === 'POST' && (url.pathname === '/api/auth/signup' || url.pathname === '/api/auth/signup.php'))) {
    try {
      const body = await parseBody(req);
      const result = await handleRegister(body);
      sendJson(res, result.ok ? 201 : 400, result);
    } catch (error) {
      sendJson(res, 400, { ok: false, success: false, message: error.message || 'Bad request' });
    }
    return;
  }

  sendJson(res, 404, { ok: false, success: false, message: 'Not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`SMART DOCS API running on http://localhost:${PORT}`);
});
