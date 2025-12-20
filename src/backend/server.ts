import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import ViteExpress from 'vite-express';
import { query, testConnection } from './database.js';
import { gameManager } from './game/GameManager.js';

// Extend session data
declare module 'express-session' {
    interface SessionData {
        username: string;
        userId: number;
    }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({
    secret: 'poker-secret-key-change-in-production',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../../public')));

// set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---------- ROUTES ----------

// landing page
app.get('/', (_req, res) => {
    res.render('pages/index');
});

// login page (GET)
app.get('/auth/login', (_req, res) => {
    res.render('pages/login', { error: null });
});

// login submit (POST) – simple username-based login for now
app.post('/auth/login', async (req, res) => {
    const { username } = req.body;

    if (!username) {
        return res.render('pages/login', { error: 'Username is required' });
    }

    try {
        // Check if user exists
        const result = await query<{ id: number; username: string }>(
            'SELECT id, username FROM users WHERE username = $1',
            [username]
        );

        if (result.rows.length > 0) {
            // User exists, set session
            req.session.username = result.rows[0].username;
            req.session.userId = result.rows[0].id;
            res.redirect('/lobby');
        } else {
            // User doesn't exist, create them
            const insertResult = await query<{ id: number }>(
                'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
                [username, `${username}@temp.com`, 'temp']
            );
            req.session.username = username;
            req.session.userId = insertResult.rows[0].id;
            res.redirect('/lobby');
        }
    } catch (error) {
        console.error('Login error:', error);
        res.render('pages/login', { error: 'Login failed. Please try again.' });
    }
});

// signup page (GET)
app.get('/auth/signup', (_req, res) => {
    res.render('pages/signup', { error: null });
});

// signup submit (POST) – creates user and logs them in
app.post('/auth/signup', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username) {
        return res.render('pages/signup', { error: 'Username is required' });
    }

    try {
        // Check if username already exists
        const existing = await query<{ id: number }>(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );

        if (existing.rows.length > 0) {
            return res.render('pages/signup', { error: 'Username already taken' });
        }

        // Create new user
        const result = await query<{ id: number }>(
            'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
            [username, email || `${username}@temp.com`, password || 'temp']
        );

        // Set session
        req.session.username = username;
        req.session.userId = result.rows[0].id;
        res.redirect('/lobby');
    } catch (error) {
        console.error('Signup error:', error);
        res.render('pages/signup', { error: 'Signup failed. Please try again.' });
    }
});

// logout (clears session)
app.get('/auth/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// lobby – NOW reads games from DB
app.get('/lobby', async (req, res) => {
    // Redirect to login if not logged in
    if (!req.session.username) {
        return res.redirect('/auth/login');
    }

    try {
        const result = await query<{
            id: number;
            name: string;
            max_players: number;
            state: string;
            player_count: number;
        }>(`
      SELECT
        id,
        name,
        max_players,
        status AS state,
        0::int AS player_count   -- placeholder until we track real counts
      FROM game_room
      ORDER BY created_at DESC
    `);

        // Update player counts from game manager
        const games = result.rows.map(game => ({
            ...game,
            player_count: gameManager.getPlayerCount(game.id)
        }));

        res.render('pages/lobby', {
            username: req.session.username,
            games,                    // <%- games %> in lobby.ejs
            messages: []              // still empty for now
        });
    } catch (err) {
        console.error('[lobby] Failed to load games', err);
        res.status(500).render('pages/error', { message: 'Failed to load games' });
    }
});

// game page – base path per milestone: /games/:id
app.get('/games/:id', async (req, res, next) => {
    const gameId = parseInt(req.params.id);

    // If not a valid number, let it pass to next route (for Vite to handle .ts files)
    if (isNaN(gameId)) {
        return next();
    }

    try {
        // Get game room info including owner
        const roomResult = await query<{
            id: number;
            name: string;
            max_players: number;
            status: string;
            owner_id: number;
        }>('SELECT id, name, max_players, status, owner_id FROM game_room WHERE id = $1', [gameId]);

        if (roomResult.rows.length === 0) {
            return res.status(404).render('pages/error', { message: 'Game not found' });
        }

        const room = roomResult.rows[0];
        const gameState = gameManager.getGameState(gameId);

        // Check if current user is the owner
        const isOwner = req.session.userId === room.owner_id;

        // Prepare game data for frontend
        const gameDataJson = JSON.stringify({
            gameId,
            roomName: room.name,
            gameState: gameState || null,
            isOwner,
            username: req.session.username || 'Guest'
        });

        res.render('pages/game', {
            gameId,
            roomName: room.name,
            gameState: gameState ? JSON.stringify(gameState) : null,
            isOwner,
            username: req.session.username || 'Guest',
            gameDataJson
        });
    } catch (err) {
        console.error('[games/:id] Failed to load game', err);
        res.status(500).render('pages/error', { message: 'Failed to load game' });
    }
});

// optional alias so /game/:id also works if someone links that
app.get('/game/:id', (req, res) => {
    const gameId = req.params.id;
    res.redirect(`/games/${gameId}`);
});

// standalone game route for your frontend game
app.get('/game', (_req, res) => {
    res.render('pages/game');
});

// create game – NOW inserts into game_room
app.post('/games', async (req, res) => {
    const { gameName, maxPlayers } = req.body;

    if (!gameName) {
        return res.status(400).render('pages/error', {
            message: 'Game name is required.'
        });
    }

    const maxPlayersInt = parseInt(maxPlayers || '6', 10);

    try {
        // Get or create user ID for this session
        let userId = req.session.userId;

        if (!userId) {
            // Create a session user if one doesn't exist
            const username = req.session.username || `Player_${Date.now()}`;
            const email = `${username}@temp.com`;

            const userResult = await query<{ id: number }>(
                `INSERT INTO users (email, username, password_hash)
                VALUES ($1, $2, $3)
                ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
                RETURNING id`,
                [email, username, 'temp_password']
            );

            userId = userResult.rows[0].id;
            req.session.userId = userId;
            req.session.username = username;
        }

        // Insert the new game-room row with actual user as owner
        await query(
            `INSERT INTO game_room (owner_id, name, max_players, status)
            VALUES ($1, $2, $3, 'waiting')`,
            [userId, gameName, maxPlayersInt]
        );

        res.redirect('/lobby');
    } catch (err) {
        console.error('[games] Failed to create game', err);
        res.status(500).render('pages/error', {
            message: 'Failed to create game. Please try again.'
        });
    }
});

// very simple chat stub so the form doesn’t 404
app.post('/chat/send', (_req, res) => {
    // TODO: later insert into messages table
    res.redirect('/lobby');
});

// Game API endpoints
app.post('/api/games/:id/join', async (req, res) => {
    const gameId = parseInt(req.params.id);

    // Use session username instead of requiring playerName in body
    const playerName = req.session.username;

    console.log('=== JOIN GAME REQUEST ===');
    console.log('Game ID:', gameId);
    console.log('Username:', playerName);
    console.log('Session ID:', req.sessionID);

    if (!playerName) {
        console.log('Join failed: Not logged in');
        return res.status(401).json({ error: 'Not logged in. Please sign in first.' });
    }

    const success = await gameManager.joinGame(gameId, playerName);
    console.log('Join result:', success);

    if (success) {
        const gameRoom = gameManager.getGame(gameId);
        console.log('Game room after join:', {
            players: gameRoom?.players,
            playerCount: gameRoom?.players.length,
            hasGame: !!gameRoom?.game
        });

        // Check if we have enough players to auto-start
        if (gameRoom && gameRoom.players.length >= 2 && !gameRoom.game) {
            console.log('Auto-starting game with', gameRoom.players.length, 'players');
            // Auto-start the game
            const startSuccess = await gameManager.createGame(gameId, gameRoom.players);
            console.log('Auto-start result:', startSuccess);

            if (startSuccess) {
                const gameState = gameManager.getGameState(gameId);
                console.log('Game started! Phase:', gameState?.phase);
                return res.json({ success: true, autoStarted: true, gameState });
            } else {
                console.log('Auto-start failed');
            }
        } else {
            console.log('Not auto-starting:', {
                hasEnoughPlayers: gameRoom && gameRoom.players.length >= 2,
                gameAlreadyExists: !!gameRoom?.game
            });
        }
        res.json({ success: true });
    } else {
        console.log('Join failed: gameManager.joinGame returned false');
        res.status(400).json({ error: 'Could not join game. Game may be full or already in progress.' });
    }
});

// Admin endpoint to reset a game to waiting status
app.post('/api/games/:id/reset', async (req, res) => {
    const gameId = parseInt(req.params.id);

    try {
        await query('UPDATE game_room SET status = $1 WHERE id = $2', ['waiting', gameId]);
        // Clear the game from memory
        const gameRoom = gameManager.getGame(gameId);
        if (gameRoom) {
            gameRoom.status = 'waiting';
            gameRoom.game = undefined;
            gameRoom.players = [];
        }
        res.json({ success: true, message: 'Game reset to waiting status' });
    } catch (error) {
        console.error('Error resetting game:', error);
        res.status(500).json({ error: 'Failed to reset game' });
    }
});

app.post('/api/games/:id/action', async (req, res) => {
    const gameId = parseInt(req.params.id);
    const { playerId, action, amount } = req.body;

    if (!playerId || !action) {
        return res.status(400).json({ error: 'Player ID and action are required' });
    }

    const success = await gameManager.makeAction(gameId, playerId, action, amount);
    if (success) {
        const gameState = gameManager.getGameState(gameId);
        res.json({ success: true, gameState });
    } else {
        res.status(400).json({ error: 'Invalid action' });
    }
});

app.get('/api/games/:id/debug', (req, res) => {
    const gameId = parseInt(req.params.id);
    const gameRoom = gameManager.getGame(gameId);
    const gameState = gameManager.getGameState(gameId);

    res.json({
        gameId,
        gameRoom: gameRoom ? {
            id: gameRoom.id,
            name: gameRoom.name,
            status: gameRoom.status,
            players: gameRoom.players,
            playerCount: gameRoom.players.length,
            hasGame: !!gameRoom.game
        } : null,
        hasGameState: !!gameState,
        gamePhase: gameState?.phase || null
    });
});

app.get('/api/games/:id/state', (req, res) => {
    const gameId = parseInt(req.params.id);
    const gameState = gameManager.getGameState(gameId);

    if (gameState) {
        res.json(gameState);
    } else {
        res.status(404).json({ error: 'Game not found' });
    }
});

app.get('/api/games/:id/players', (req, res) => {
    const gameId = parseInt(req.params.id);
    const gameRoom = gameManager.getGame(gameId);

    if (gameRoom) {
        res.json({
            players: gameRoom.players,
            maxPlayers: gameRoom.maxPlayers,
            status: gameRoom.status
        });
    } else {
        res.json({ players: [], maxPlayers: 6, status: 'waiting' });
    }
});

app.post('/api/games/:id/start', async (req, res) => {
    const gameId = parseInt(req.params.id);

    // Get players from game room
    const gameRoom = gameManager.getGame(gameId);
    if (!gameRoom) {
        return res.status(404).json({ error: 'Game room not found' });
    }

    const playerNames = gameRoom.players;

    if (!playerNames || playerNames.length < 2) {
        return res.status(400).json({ error: 'At least 2 players required' });
    }

    const success = await gameManager.createGame(gameId, playerNames);
    if (success) {
        const gameState = gameManager.getGameState(gameId);
        res.json({ success: true, gameState });
    } else {
        res.status(400).json({ error: 'Could not start game' });
    }
});

app.post('/api/games/:id/new-hand', async (req, res) => {
    const gameId = parseInt(req.params.id);

    const success = await gameManager.startNewHand(gameId);
    if (success) {
        const gameState = gameManager.getGameState(gameId);
        res.json({ success: true, gameState });
    } else {
        res.status(400).json({ error: 'Could not start new hand' });
    }
});

// generic error page route
app.get('/error', (_req, res) => {
    res.status(500).render('pages/error', { message: 'An error occurred' });
});

// 404 handler – must be last route
app.use((_req, res) => {
    res.status(404).render('pages/error', {
        statusCode: 404,
        title: 'Page Not Found',
        message: 'Page not found'
    });
});

// ---------- STARTUP ----------

// test DB connection once on startup so we know config is correct
testConnection()
    .then(() => {
        console.log('[db] PostgreSQL connection OK');
    })
    .catch((err) => {
        console.error('[db] PostgreSQL connection FAILED', err);
    });

// start the server with ViteExpress so frontend + backend run together
ViteExpress.listen(app, PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});