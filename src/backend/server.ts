// src/backend/server.ts
import bcrypt from 'bcrypt';
import express, { NextFunction, Request, Response } from 'express';
import session from 'express-session';
import { createServer } from 'http';
import path from 'path';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import ViteExpress from 'vite-express';

import { createGame, getGames, getGameDetails, joinGame, startGame, handleAction } from './controllers/gameController';
import { getMessages, sendMessage } from './controllers/messageController';
import pool, { testConnection } from './database';

// Extend Express Request type to include session
declare module 'express-session' {
    interface SessionData {
        user?: {
            id: number;
            email: string;
            username: string;
        };
    }
}

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
// IMPORTANT: views root is /views (pages are inside /views/pages)
app.set('views', path.join(__dirname, 'views'));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../../public')));

// Serve the main frontend entry (TypeScript) through Vite
app.use('/main.ts', (_req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/main.ts'));
});

// ---------- AUTH GUARD ----------
function requireAuth(req: Request, res: Response, next: NextFunction) {
    if (!req.session?.user) return res.redirect('/auth/login');
    next();
}

// ---------- MESSAGE ROUTES ----------
app.post('/api/rooms/:roomId/messages', sendMessage);
app.get('/api/rooms/:roomId/messages', getMessages);
app.post('/chat/send', requireAuth, async (req, res) => {
  // TEMP: lobby chat placeholder
  res.redirect('/lobby');
});


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
    res.render('pages/index');
});

// login page (GET)
app.get('/auth/login', (_req, res) => {
    res.render('pages/login', { error: null });
});

// login submit (POST)
app.post('/auth/login', async (req, res) => {
    try {
        const { identifier, password } = req.body;

        if (!identifier || !password) {
            return res.status(400).render('pages/login', { error: 'Missing credentials' });
        }

        const result = await pool.query(
            `SELECT id, email, username, password_hash
       FROM users
       WHERE email=$1 OR username=$1`,
            [identifier]
        );

        if (result.rowCount === 0) {
            return res.status(401).render('pages/login', { error: 'Invalid credentials' });
        }

        const user = result.rows[0];
        const ok = await bcrypt.compare(password, user.password_hash);

        if (!ok) {
            return res.status(401).render('pages/login', { error: 'Invalid credentials' });
        }

        (req.session as any).user = { id: user.id, email: user.email, username: user.username };
        return res.redirect('/lobby');
    } catch (err) {
        console.error('[auth/login] error:', err);
        return res.status(500).render('pages/login', { error: 'Server error' });
    }
});

// signup page (GET)
app.get('/auth/signup', (_req, res) => {
    res.render('pages/signup', { error: null });
});

// signup submit (POST)
app.post('/auth/signup', async (req, res) => {
    try {
        const { email, username, password } = req.body;

        if (!email || !username || !password) {
            return res.status(400).render('pages/signup', { error: 'Missing required fields' });
        }

        if (String(password).length < 6) {
            return res.status(400).render('pages/signup', {
                error: 'Password must be at least 6 characters',
            });
        }

        // check duplicates
        const dup = await pool.query('SELECT id FROM users WHERE email=$1 OR username=$2', [
            email,
            username,
        ]);

        if ((dup.rowCount ?? 0) > 0) {
            return res.status(409).render('pages/signup', { error: 'Email or username already exists' });
        }

        const passwordHash = await bcrypt.hash(password, 10);

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
        return res.status(500).render('pages/signup', { error: 'Server error' });
    }
});

// logout
app.get('/auth/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

// ---------- GAME ROUTES ----------

// Get all games (API)
app.get('/api/games', getGames);

// Get game details (API)
app.get('/api/games/:id', getGameDetails);

// Create game
app.post('/games/create', requireAuth, createGame);

// Join game (API)
app.post('/api/games/:id/join', requireAuth, joinGame);

// Start game
app.post('/api/games/:id/start', requireAuth, startGame);

// Handle player action  
app.post('/api/hands/:handId/action', requireAuth, handleAction);

// ---------- PAGE ROUTES ----------

// lobby
app.get('/lobby', requireAuth, async (req, res) => {
    try {
        const user = req.session.user;

        // Fetch available games
        const gamesResult = await pool.query(
            `SELECT 
                gr.id,
                gr.name,
                gr.max_players,
                gr.status,
                gr.created_at,
                COUNT(rp.user_id) as player_count
            FROM game_room gr
            LEFT JOIN room_players rp ON gr.id = rp.room_id
            WHERE gr.status IN ('waiting', 'in_progress')
            GROUP BY gr.id
            ORDER BY gr.created_at DESC`
        );

        res.render('pages/lobby', {
            username: user?.username || 'Player',
            games: gamesResult.rows,
            messages: [],
        });
    } catch (err) {
        console.error('[lobby] error:', err);
        res.render('pages/lobby', {
            username: req.session.user?.username || 'Player',
            games: [],
            messages: [],
        });
    }
});

// game page
app.get('/games/:id', requireAuth, async (req, res) => {
    const gameId = req.params.id;
    const username = req.session.user?.username;
    res.render('pages/game', { gameId, username });
});

// optional alias
app.get('/game/:id', requireAuth, (req, res) => {
    const gameId = req.params.id;
    res.redirect(`/games/${gameId}`);
});

// generic error page route
app.get('/error', (_req, res) => {
    res.status(500).render('pages/error', {
        statusCode: 500,
        title: 'Server Error',
        message: 'An error occurred',
    });
});

// 404 handler
app.use((_req, res) => {
    res.status(404).render('pages/error', {
        statusCode: 404,
        title: 'Page Not Found',
        message: 'Page not found',
    });
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
