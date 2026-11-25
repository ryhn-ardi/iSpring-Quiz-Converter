import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '4mb' }));

// ============================================================================
// Server-Side Admin Auth & Persistent Owner Profile Store
// ============================================================================

const DATA_DIR = path.resolve(process.cwd(), '.data');
const STORE_PATH = path.resolve(DATA_DIR, 'admin-store.json');

type AdminCredential = {
  username: string;
  salt: string;
  hash: string;
  createdAt: string;
};

export type OwnerProfile = {
  ownerName: string;
  ownerRole: string;
  quote: string;
  photoDataUrl: string | null;
  updatedAt: string;
};

type PersistentStore = {
  adminCredential: AdminCredential | null;
  profile: OwnerProfile;
};

const DEFAULT_PROFILE: OwnerProfile = {
  ownerName: 'ms. Reyhan lohyaa',
  ownerRole: 'Pemilik Website',
  quote: 'Mengajar dengan hati, menyusun evaluasi lebih cepat dan rapi setiap hari.',
  photoDataUrl: null,
  updatedAt: new Date(0).toISOString(),
};

function readStore(): PersistentStore {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      return {
        adminCredential: null,
        profile: { ...DEFAULT_PROFILE },
      };
    }
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PersistentStore>;
    return {
      adminCredential: parsed.adminCredential ?? null,
      profile: {
        ...DEFAULT_PROFILE,
        ...(parsed.profile ?? {}),
      },
    };
  } catch {
    return {
      adminCredential: null,
      profile: { ...DEFAULT_PROFILE },
    };
  }
}

function writeStore(store: PersistentStore) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
  const tmpPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
  fs.renameSync(tmpPath, STORE_PATH);
}

function safeEqualStrings(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function hashPassword(password: string, saltHex: string): Buffer {
  return crypto.scryptSync(password, saltHex, 64);
}

function verifyPasswordHash(password: string, saltHex: string, expectedHex: string): boolean {
  const derived = hashPassword(password, saltHex);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function getEnvAdminConfig(): { configured: boolean; username: string; password: string } {
  const envPass = (process.env.ADMIN_PASSWORD ?? '').trim();
  const envUser = (process.env.ADMIN_USERNAME ?? 'admin').trim() || 'admin';
  return {
    configured: envPass.length > 0,
    username: envUser,
    password: envPass,
  };
}

// In-memory session tokens (12-hour TTL)
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const sessions = new Map<string, { username: string; expiresAt: number }>();

function issueSessionToken(username: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    username,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

function getSessionFromRequest(req: express.Request): { token: string; username: string } | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const entry = sessions.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return { token, username: entry.username };
}

function requireAdminAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const session = getSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: 'Sesi admin tidak valid atau sudah kedaluwarsa. Silakan login kembali.' });
    return;
  }
  (req as express.Request & { adminUser?: string }).adminUser = session.username;
  next();
}

// Simple per-IP login rate limiter
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 12) return false;
  entry.count += 1;
  return true;
}

const VALID_IMAGE_DATA_URL_RE =
  /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i;
const MAX_PHOTO_DATA_URL_LENGTH = 2_800_000; // ~2 MB binary image

// Public: fetch owner profile (photo frame & custom quote)
app.get('/api/profile', (_req, res) => {
  const store = readStore();
  res.json({ profile: store.profile });
});

// Public: check auth status & whether first-run bootstrap is needed
app.get('/api/admin/status', (req, res) => {
  const envCfg = getEnvAdminConfig();
  const store = readStore();
  const session = getSessionFromRequest(req);
  const needsBootstrap = !envCfg.configured && !store.adminCredential;

  res.json({
    authenticated: Boolean(session),
    username: session ? session.username : null,
    needsBootstrap,
    envConfigured: envCfg.configured,
    defaultUsername: envCfg.configured
      ? envCfg.username
      : store.adminCredential?.username ?? 'admin',
  });
});

// One-time bootstrap when ADMIN_PASSWORD env is unset and no hash exists yet
app.post('/api/admin/bootstrap', (req, res) => {
  const envCfg = getEnvAdminConfig();
  if (envCfg.configured) {
    res.status(409).json({
      error: 'Konfigurasi password admin sudah diatur melalui variabel lingkungan server.',
    });
    return;
  }

  const store = readStore();
  if (store.adminCredential) {
    res.status(409).json({
      error: 'Akun admin sudah diaktifkan sebelumnya. Silakan login menggunakan password Anda.',
    });
    return;
  }

  const rawUsername = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const rawPassword = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!rawUsername || rawUsername.length > 40) {
    res.status(400).json({ error: 'Username admin wajib diisi (maksimal 40 karakter).' });
    return;
  }
  if (rawPassword.length < 6 || rawPassword.length > 128) {
    res.status(400).json({ error: 'Password admin harus terdiri dari 6 hingga 128 karakter.' });
    return;
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(rawPassword, salt).toString('hex');
  store.adminCredential = {
    username: rawUsername,
    salt,
    hash,
    createdAt: new Date().toISOString(),
  };
  writeStore(store);

  const token = issueSessionToken(rawUsername);
  res.status(201).json({ token, username: rawUsername });
});

// Admin login
app.post('/api/admin/login', (req, res) => {
  const clientIp = req.ip || 'unknown';
  if (!checkRateLimit(clientIp)) {
    res.status(429).json({ error: 'Terlalu banyak percobaan login. Coba lagi dalam 1 menit.' });
    return;
  }

  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!username || !password) {
    res.status(400).json({ error: 'Username dan password wajib diisi.' });
    return;
  }

  const envCfg = getEnvAdminConfig();
  if (envCfg.configured) {
    const valid =
      safeEqualStrings(username, envCfg.username) &&
      safeEqualStrings(password, envCfg.password);
    if (!valid) {
      res.status(401).json({ error: 'Username atau password admin salah.' });
      return;
    }
    const token = issueSessionToken(envCfg.username);
    res.json({ token, username: envCfg.username });
    return;
  }

  const store = readStore();
  if (!store.adminCredential) {
    res.status(409).json({
      error: 'Password admin belum dibuat. Silakan aktifkan akun admin terlebih dahulu.',
      needsBootstrap: true,
    });
    return;
  }

  const valid =
    safeEqualStrings(username, store.adminCredential.username) &&
    verifyPasswordHash(password, store.adminCredential.salt, store.adminCredential.hash);

  if (!valid) {
    res.status(401).json({ error: 'Username atau password admin salah.' });
    return;
  }

  const token = issueSessionToken(store.adminCredential.username);
  res.json({ token, username: store.adminCredential.username });
});

// Admin logout
app.post('/api/admin/logout', (req, res) => {
  const session = getSessionFromRequest(req);
  if (session) {
    sessions.delete(session.token);
  }
  res.json({ ok: true });
});

// Protected: update owner photo frame & custom quote
app.put('/api/admin/profile', requireAdminAuth, (req, res) => {
  const body = req.body ?? {};
  const ownerName =
    typeof body.ownerName === 'string' ? body.ownerName.trim() : '';
  const ownerRole =
    typeof body.ownerRole === 'string' ? body.ownerRole.trim() : '';
  const quote = typeof body.quote === 'string' ? body.quote.trim() : '';
  const photoDataUrl = body.photoDataUrl;

  if (!ownerName || ownerName.length > 80) {
    res.status(400).json({ error: 'Nama pemilik wajib diisi (maksimal 80 karakter).' });
    return;
  }
  if (ownerRole.length > 80) {
    res.status(400).json({ error: 'Peran/gelar pemilik maksimal 80 karakter.' });
    return;
  }
  if (quote.length > 400) {
    res.status(400).json({ error: 'Quote maksimal 400 karakter.' });
    return;
  }

  let sanitizedPhoto: string | null = null;
  if (photoDataUrl !== null && photoDataUrl !== undefined && photoDataUrl !== '') {
    if (typeof photoDataUrl !== 'string') {
      res.status(400).json({ error: 'Format foto tidak valid.' });
      return;
    }
    if (photoDataUrl.length > MAX_PHOTO_DATA_URL_LENGTH) {
      res.status(400).json({ error: 'Ukuran file foto terlalu besar (maksimal ~2 MB).' });
      return;
    }
    if (!VALID_IMAGE_DATA_URL_RE.test(photoDataUrl)) {
      res.status(400).json({
        error: 'Format foto harus berupa gambar PNG, JPG, WebP, atau GIF.',
      });
      return;
    }
    sanitizedPhoto = photoDataUrl;
  }

  const store = readStore();
  store.profile = {
    ownerName,
    ownerRole: ownerRole || 'Pemilik Website',
    quote,
    photoDataUrl: sanitizedPhoto,
    updatedAt: new Date().toISOString(),
  };
  writeStore(store);

  res.json({ profile: store.profile });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vitePromise = createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    vitePromise.catch((err) => {
      console.error('Failed to initialize Vite middleware:', err);
    });

    app.use((req, res, next) => {
      vitePromise
        .then((vite) => vite.middlewares(req, res, next))
        .catch(next);
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
