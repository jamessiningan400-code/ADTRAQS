import http from 'node:http';
import { randomUUID } from 'node:crypto';
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
const sessions = new Map();
function sendJson(res, statusCode, payload, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-ADTRAQS-SESSION',
    ...headers,
  });
  res.end(JSON.stringify(payload));
}

function getSessionUser(req) {
  const cookieToken = (req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('adtraqs_api_session='))
    ?.slice('adtraqs_api_session='.length);
  const token = req.headers['x-adtraqs-session'] || cookieToken;
  return token ? sessions.get(token) || null : null;
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
    contactNumber: user.contact_number || '',
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

  if (req.method === 'GET' && pathname === '/api/processor-lookup') {
    const requestedControlNo = (url.searchParams.get('control_no') || '').trim();
    const controlNo = /^\d{1,7}$/.test(requestedControlNo)
      ? requestedControlNo.padStart(7, '0')
      : requestedControlNo;
    if (!/^(?:\d{1,20}|[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+)$/.test(controlNo)) {
      sendJson(res, 400, { success: false, message: 'Enter a valid document ID or control number.' });
      return;
    }

    const [docs, tracking] = await Promise.all([getDocs(db), getTracking(db)]);
    const doc = docs.find((item) => String(item.id) === controlNo || String(item.id).padStart(7, '0') === controlNo);
    if (!doc) {
      sendJson(res, 404, { success: false, message: 'Document not found.' });
      return;
    }

    const record = tracking.find((item) => String(item.controlNo) === controlNo || String(item.controlNo).padStart(7, '0') === controlNo);
    let currentOffice = 'City Administrative Office';
    let status = 'Not yet received';
    if (record?.caReturn?.received) {
      currentOffice = 'Tracking Complete';
      status = 'Tracking Complete';
    } else if (record?.cao?.forwarded) {
      currentOffice = record.cao.forwardedTo || 'CA';
      status = 'Forwarded';
    } else if (record?.cao?.forSig) {
      currentOffice = 'CAO';
      status = 'For Signature';
    } else if (record?.cao?.received) {
      currentOffice = 'CAO';
      status = 'Received';
    } else if (record?.cbo?.forwarded) {
      currentOffice = record.cbo.forwardedTo || 'CAO';
      status = 'Forwarded';
    } else if (record?.cbo?.forSig) {
      currentOffice = 'CBO';
      status = 'For Signature';
    } else if (record?.cbo?.received) {
      currentOffice = 'CBO';
      status = 'Received';
    } else if (record?.cto?.forwarded) {
      currentOffice = record.cto.forwardedTo || 'CBO';
      status = 'Forwarded';
    } else if (record?.cto?.forSig) {
      currentOffice = 'CTO';
      status = 'For Signature';
    } else if (record?.cto?.received) {
      currentOffice = 'CTO';
      status = 'Received';
    } else if (record) {
      currentOffice = 'CTO';
      status = 'Awaiting Receipt';
    }
    currentOffice = ({
      CA: 'City Administrative Office',
      CTO: "City Treasurer's Office",
      CBO: 'City Budget Office',
      CAO: 'City Accounting Office',
      PRC: 'Processors',
      Complete: 'Tracking Complete',
    })[currentOffice] || currentOffice;

    sendJson(res, 200, {
      success: true,
      document: { controlNo: String(doc.id), currentOffice, status },
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/users') {
    const user = getSessionUser(req);
    if (!user) {
      sendJson(res, 401, { success: false, message: 'Sign in before viewing user accounts.' });
      return;
    }
    const allUsers = await getUsers();
    const users = user.role === 'admin' ? allUsers : allUsers.filter((account) => account.id === user.id);
    sendJson(res, 200, { success: true, users });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/users') {
    const currentUser = getSessionUser(req);
    if (!currentUser) {
      sendJson(res, 401, { success: false, message: 'Sign in before managing users.' });
      return;
    }
    if (currentUser.role !== 'admin') {
      sendJson(res, 403, { success: false, message: 'Only administrators can add users.' });
      return;
    }
    try {
      const body = await parseBody(req);
      const fullName = String(body.full_name || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const contactNumber = String(body.contact_number || '').replace(/\D/g, '');
      let office = String(body.office || '').trim();
      const requestedRole = String(body.role || 'staff').trim().toLowerCase();
      if (office.toLowerCase() === 'city administrative office') office = 'City Administrative Office';
      if (!fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          password.length < 4 || !/^09\d{9}$/.test(contactNumber) || !office || office.length > 80) {
        sendJson(res, 400, { success: false, message: 'Enter a name, valid email, office, contact number starting with 09 and exactly 11 digits, and password of at least 4 characters.' });
        return;
      }
      if (!['admin', 'staff'].includes(requestedRole) ||
          (requestedRole === 'admin' && office !== 'City Administrative Office')) {
        sendJson(res, 400, { success: false, message: 'Only City Administrative Office accounts can be administrators.' });
        return;
      }
      const role = requestedRole;
      if (role === 'admin' && (await getUsers()).filter((account) =>
        account.role.toLowerCase() === 'admin' && account.office === 'City Administrative Office').length >= 2) {
        sendJson(res, 400, { success: false, message: 'The City Administrative Office can only have two administrative users.' });
        return;
      }
      await createUser(db, {
        fullName,
        email,
        passwordHash: password,
        role,
        office,
        contactNumber,
        status: 'Active',
      });
      sendJson(res, 201, { success: true, message: 'User created successfully.' });
    } catch (error) {
      console.error('Unable to create user account.', error);
      sendJson(res, 409, { success: false, message: 'Email already exists or the account could not be saved.' });
    }
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
      if (!result.ok) {
        sendJson(res, 401, result);
        return;
      }
      const token = randomUUID();
      sessions.set(token, result.user);
      result.session_token = token;
      const secure = req.socket.encrypted ? '; Secure' : '';
      sendJson(res, 200, result, {
        'Set-Cookie': `adtraqs_api_session=${token}; HttpOnly; SameSite=Lax; Path=/${secure}`,
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, success: false, message: error.message || 'Bad request' });
    }
    return;
  }

  if (req.method === 'POST' && (url.pathname === '/api/auth/logout' || url.pathname === '/api/auth/logout.php')) {
    const cookieToken = (req.headers.cookie || '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('adtraqs_api_session='))
      ?.slice('adtraqs_api_session='.length);
    const token = req.headers['x-adtraqs-session'] || cookieToken;
    if (token) sessions.delete(token);
    const headers = { 'Set-Cookie': 'adtraqs_api_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' };
    if (req.headers['x-adtraqs-session']) delete headers['Set-Cookie'];
    sendJson(res, 200, { success: true }, headers);
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
