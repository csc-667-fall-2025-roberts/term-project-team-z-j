// src/backend/server.ts
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import ViteExpress from 'vite-express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import session from 'express-session';
import bcrypt from 'bcrypt';

import pool, { testConnection } from './database';
import { sendMessage, getMessages } from './controllers/messageController';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Create HTTP server + Socket.io ONCE
const httpServer = createServer(app);
const io = new Server(httpServer);
app.set('io', io);

// ---------- MIDDLEWARE ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // set true only when using HTTPS
      maxAge: 1000 * 60 * 60 * 6, // 6 hours
    },
  })
);

// ---------- VIEW ENGINE ----------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve the main frontend entry (TypeScript) through Vite
app.use('/main.ts', (_req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/main.ts'));
});

// ---------- AUTH GUARD ----------
function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.user) return res.redirect('/auth/login');
  next();
}

// ---------- MESSAGE ROUTES ----------
app.post('/api/rooms/:roomId/messages', sendMessage);
app.get('/api/rooms/:roomId/messages', getMessages);

// ---------- SOCKET.IO ----------
io.on('connection', (socket) => {
  console.log('[socket] User connected', socket.id);

  socket.on('room:join', (data: any) => {
    if (!data?.roomId) return;
    socket.join(`room:${data.roomId}`);
    console.log(`[socket] ${socket.id} joined room:${data.roomId}`);
  });

  socket.on('disconnect', () => {
    console.log('[socket] User disconnected', socket.id);
  });
});

// ---------- ROUTES ----------

// landing page
app.get('/', (_req, res) => {
  res.render('index');
});

// login page (GET)
app.get('/auth/login', (_req, res) => {
  res.render('login', { error: null });
});

// login submit (POST)
app.post('/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).render('login', { error: 'Missing credentials' });
    }

    const result = await pool.query(
      `SELECT id, email, username, password_hash
       FROM users
       WHERE email=$1 OR username=$1`,
      [identifier]
    );

    if (result.rowCount === 0) {
      return res.status(401).render('login', { error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);

    if (!ok) {
      return res.status(401).render('login', { error: 'Invalid credentials' });
    }

    (req.session as any).user = { id: user.id, email: user.email, username: user.username };
    return res.redirect('/lobby');
  } catch (err) {
    console.error('[auth/login] error:', err);
    return res.status(500).render('login', { error: 'Server error' });
  }
});

// signup page (GET)
app.get('/auth/signup', (_req, res) => {
  res.render('signup', { error: null });
});

// signup submit (POST)
app.post('/auth/signup', async (req, res) => {
  try {
    const { email, username, password } = req.body;

    if (!email || !username || !password) {
      return res.status(400).render('signup', { error: 'Missing required fields' });
    }
    if (String(password).length < 6) {
      return res.status(400).render('signup', { error: 'Password must be at least 6 characters' });
    }

    // check duplicates
    const dup = await pool.query(
      'SELECT id FROM users WHERE email=$1 OR username=$2',
      [email, username]
    );

    if (dup.rowCount > 0) {
      return res.status(409).render('signup', { error: 'Email or username already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // IMPORTANT: requires users.id to auto-increment (bigserial/identity)
    const inserted = await pool.query(
      `INSERT INTO users (email, username, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, username`,
      [email, username, passwordHash]
    );

    (req.session as any).user = inserted.rows[0];
    return res.redirect('/lobby');
  } catch (err) {
    console.error('[auth/signup] error:', err);
    return res.status(500).render('signup', { error: 'Server error' });
  }
});

// logout
app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// lobby
app.get('/lobby', requireAuth, (req, res) => {
  const user = (req.session as any).user;
  res.render('lobby', {
    username: user.username,
    games: [],
    messages: [],
  });
});

// game page – base path per milestone: /games/:id
app.get('/games/:id', requireAuth, (req, res) => {
  const gameId = req.params.id;
  res.render('game', { gameId });
});

// optional alias
app.get('/game/:id', requireAuth, (req, res) => {
  const gameId = req.params.id;
  res.redirect(`/games/${gameId}`);
});

// create game – stub (later insert into game_room)
app.post('/games', requireAuth, (_req, res) => {
  res.redirect('/lobby');
});

// generic error page route
app.get('/error', (_req, res) => {
  res.status(500).render('error', { message: 'An error occurred' });
});

// 404 handler – must be last route
app.use((_req, res) => {
  res.status(404).render('error', { message: 'Page not found' });
});

// ---------- STARTUP ----------

// Test DB connection once on startup
testConnection()
  .then(() => console.log('[db] PostgreSQL connection OK'))
  .catch((err) => console.error('[db] PostgreSQL connection FAILED', err));

// Bind ViteExpress to the existing httpServer
ViteExpress.bind(app, httpServer);

// Start HTTP server
httpServer.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

