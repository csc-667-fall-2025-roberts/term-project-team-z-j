// src/backend/server.ts
import bcrypt from 'bcrypt';
import express, { NextFunction, Request, Response } from 'express';
import session from 'express-session';
import { createServer } from 'http';
import path from 'path';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import ViteExpress from 'vite-express';

import { createGame, endGame, getGameDetails, getGameResults, getGames, joinGame, leaveGame, startGame } from './controllers/gameController.js';
import { getMessages, sendMessage } from './controllers/messageController.js';
import { getGame, registerPokerHandlers } from './controllers/pokerGameController.js';
import pool, { testConnection } from './database.js';

// Session types are in types.d.ts

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
            secure: process.env.NODE_ENV === 'production',
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

// Serve frontend TypeScript files through Vite
app.use('/src/frontend', express.static(path.join(__dirname, '../frontend')));

// ---------- AUTH GUARD ----------
function requireAuth(req: Request, res: Response, next: NextFunction) {
    if (!req.session?.user) return res.redirect('/auth/login');
    next();
}

// ---------- MESSAGE ROUTES ----------
app.post('/api/rooms/:roomId/messages', sendMessage);
app.get('/api/rooms/:roomId/messages', getMessages);
app.post('/chat/send', requireAuth, async (_req, res) => {
    // TEMP: lobby chat placeholder
    res.redirect('/lobby');
});


// ---------- SOCKET.IO ----------

// Map socket IDs to user IDs for private messaging
const socketToUser = new Map<string, number>();
const userToSocket = new Map<number, string>();

io.on('connection', (socket) => {
    console.log('[socket] User connected', socket.id);

    // Handle user authentication for socket
    socket.on('auth:identify', (data: { userId: number }) => {
        console.log('[socket] ===== AUTH:IDENTIFY EVENT RECEIVED =====');
        console.log('[socket] Data:', data);

        if (!data?.userId) {
            console.error('[socket] Invalid auth:identify data', data);
            return;
        }

        // Ensure userId is a number
        const numericUserId = Number(data.userId);

        if (isNaN(numericUserId)) {
            console.error('[socket] Invalid userId - not a number:', data.userId);
            return;
        }

        // Clean up any existing mapping for this user
        const existingSocketId = userToSocket.get(numericUserId);
        if (existingSocketId && existingSocketId !== socket.id) {
            socketToUser.delete(existingSocketId);
            console.log(`[socket] Cleaned up old socket ${existingSocketId} for user ${numericUserId}`);
        }

        // Map socket to user
        socketToUser.set(socket.id, numericUserId);
        userToSocket.set(numericUserId, socket.id);

        console.log(`[socket] User ${numericUserId} (type: ${typeof numericUserId}) identified on socket ${socket.id}`);
    });

    // Handle joining the lobby chat room
    socket.on('lobby:join', () => {
        console.log('[socket] ===== LOBBY:JOIN EVENT RECEIVED =====');
        socket.join('lobby');
        console.log(`[socket] ${socket.id} joined lobby chat`);
        socket.emit('lobby:joined', { success: true });
    });

    socket.on('room:join', (data: any) => {
        console.log('[socket] ===== ROOM:JOIN EVENT RECEIVED =====');
        console.log('[socket] Data:', data);

        if (!data?.roomId) {
            console.error('[socket] Invalid room:join data', data);
            return;
        }

        const numericRoomId = Number(data.roomId);
        if (isNaN(numericRoomId)) {
            console.error('[socket] Invalid roomId - not a number:', data.roomId);
            return;
        }

        const roomName = `room:${numericRoomId}`;
        socket.join(roomName);
        console.log(`[socket] ${socket.id} joined ${roomName}`);

        // Get user ID from socket mapping
        const userId = socketToUser.get(socket.id);

        if (!userId) {
            console.error(`[socket] User not identified for socket ${socket.id}`);
            return;
        }

        console.log(`[socket] User ${userId} (type: ${typeof userId}) joining room ${numericRoomId}`);

        // Check if there's an active poker game for this room
        const game = getGame(numericRoomId);

        if (game) {
            // Register poker event handlers for this socket
            registerPokerHandlers(io, socket, userId, numericRoomId);
            console.log(`[socket] Registered poker handlers for user ${userId} in room ${numericRoomId}`);
        } else {
            console.log(`[socket] No active game found for room ${numericRoomId} - handlers will be registered when game starts`);
        }

        // Always emit confirmation
        socket.emit('room:joined', {
            roomId: numericRoomId,
            userId: userId
        });
    });

    // Handle request to register poker handlers (called when game starts)
    socket.on('game:register:handlers', (data: { roomId: number }) => {
        console.log('[socket] ===== GAME:REGISTER:HANDLERS EVENT RECEIVED =====');
        console.log('[socket] Data:', data);

        if (!data?.roomId) {
            console.error('[socket] Invalid game:register:handlers data', data);
            return;
        }

        const numericRoomId = Number(data.roomId);
        if (isNaN(numericRoomId)) {
            console.error('[socket] Invalid roomId - not a number:', data.roomId);
            return;
        }

        const userId = socketToUser.get(socket.id);
        if (!userId) {
            console.error(`[socket] User not identified for socket ${socket.id}`);
            return;
        }

        console.log(`[socket] Registering handlers for user ${userId} (type: ${typeof userId}) in room ${numericRoomId}`);

        const game = getGame(numericRoomId);
        if (game) {
            registerPokerHandlers(io, socket, userId, numericRoomId);
            console.log(`[socket] Registered poker handlers for user ${userId} in room ${numericRoomId}`);
        } else {
            console.error(`[socket] No game found for room ${numericRoomId}`);
        }
    });

    socket.on('disconnect', () => {
        console.log('[socket] User disconnected', socket.id);

        // Get user ID before removing mapping
        const userId = socketToUser.get(socket.id);

        // Handle player disconnection during active game
        if (userId) {
            // Find which room(s) the user was in
            const rooms = Array.from(socket.rooms).filter(room => room.startsWith('room:'));

            for (const room of rooms) {
                const roomId = parseInt(room.replace('room:', ''));
                const game = getGame(roomId);

                if (game) {
                    // Emit player disconnected event
                    io.to(room).emit('game:player:disconnected', {
                        userId,
                        socketId: socket.id
                    });

                    console.log(`[socket] User ${userId} disconnected from active game in room ${roomId}`);
                }
            }
        }

        // Clean up socket mappings
        if (userId) {
            userToSocket.delete(userId);
        }
        socketToUser.delete(socket.id);
    });
});

// ---------- ROUTES ----------

// landing page
app.get('/', (req, res) => {
    res.render('pages/index', { user: req.session?.user || null });
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

// Start game (API)
app.post('/api/games/:id/start', requireAuth, startGame);

// Leave game (API)
app.post('/api/games/:id/leave', requireAuth, leaveGame);

// End game (API)
app.post('/api/games/:id/end', requireAuth, endGame);

// Game results page
app.get('/games/:id/results', requireAuth, getGameResults);

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
    try {
        const gameId = parseInt(req.params.id);
        const userId = req.session.user?.id;
        const username = req.session.user?.username;

        if (isNaN(gameId)) {
            return res.status(400).render('pages/error', {
                statusCode: 400,
                title: 'Invalid Game',
                message: 'Invalid game ID',
                user: req.session?.user || null,
            });
        }

        // Get game room details
        const roomResult = await pool.query(
            `SELECT id, name, max_players, status, owner_id FROM game_room WHERE id = $1`,
            [gameId]
        );

        if ((roomResult.rowCount ?? 0) === 0) {
            return res.status(404).render('pages/error', {
                statusCode: 404,
                title: 'Game Not Found',
                message: 'The game room does not exist',
                user: req.session?.user || null,
            });
        }

        // Check if user is in the game
        const userInGame = await pool.query(
            `SELECT user_id FROM room_players WHERE user_id = $1 AND room_id = $2`,
            [userId, gameId]
        );

        // If user is not in the game, try to add them automatically
        if ((userInGame.rowCount ?? 0) === 0) {
            const room = roomResult.rows[0];

            // Check if game is full
            const playerCountResult = await pool.query(
                `SELECT COUNT(*) as count FROM room_players WHERE room_id = $1`,
                [gameId]
            );

            const playerCount = parseInt(playerCountResult.rows[0].count);

            if (playerCount >= room.max_players) {
                return res.status(403).render('pages/error', {
                    statusCode: 403,
                    title: 'Game Full',
                    message: 'This game is full. You cannot join.',
                    user: req.session?.user || null,
                });
            }

            // Find next available position
            const positionsResult = await pool.query(
                `SELECT position FROM room_players WHERE room_id = $1 ORDER BY position`,
                [gameId]
            );

            let nextPosition = 0;
            const takenPositions = positionsResult.rows.map((r) => r.position);
            while (takenPositions.includes(nextPosition)) {
                nextPosition++;
            }

            // Add user to the game
            await pool.query(
                `INSERT INTO room_players (user_id, room_id, position, is_ready)
                VALUES ($1, $2, $3, false)`,
                [userId, gameId, nextPosition]
            );

            // Broadcast player joined
            const io = req.app.get('io');
            if (io) {
                io.to(`room:${gameId}`).emit('room:player:joined', {
                    user_id: userId,
                    username: username,
                    position: nextPosition,
                });

                // Also emit lobby update
                io.emit('lobby:game:updated', {
                    id: gameId,
                    player_count: playerCount + 1,
                });
            }
        }

        // Get players in the room
        const playersResult = await pool.query(
            `SELECT 
                rp.user_id,
                rp.position,
                rp.is_ready,
                u.username
            FROM room_players rp
            JOIN users u ON rp.user_id = u.id
            WHERE rp.room_id = $1
            ORDER BY rp.position`,
            [gameId]
        );

        res.render('pages/game', {
            gameId,
            username,
            userId,
            ownerId: roomResult.rows[0].owner_id,
            gameStatus: roomResult.rows[0].status,
            players: playersResult.rows,
        });
    } catch (err) {
        console.error('[games/:id] error:', err);
        res.status(500).render('pages/error', {
            statusCode: 500,
            title: 'Server Error',
            message: 'Failed to load game',
            user: req.session?.user || null,
        });
    }
});

// optional alias
app.get('/game/:id', requireAuth, (req, res) => {
    const gameId = req.params.id;
    res.redirect(`/games/${gameId}`);
});

// generic error page route
app.get('/error', (req, res) => {
    res.status(500).render('pages/error', {
        statusCode: 500,
        title: 'Server Error',
        message: 'An error occurred',
        user: req.session?.user || null,
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('pages/error', {
        statusCode: 404,
        title: 'Page Not Found',
        message: 'Page not found',
        user: req.session?.user || null,
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
