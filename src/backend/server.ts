import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import ViteExpress from 'vite-express';
import { testConnection, query } from './database';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../../public')));

// set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// serve the main frontend entry (TypeScript) through Vite
app.use('/main.ts', (_req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/main.ts'));
});

app.use('/game.ts', (_req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/games/game.ts'));
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

// login submit (POST) – still stubbed; frontend flow only
app.post('/auth/login', (_req, res) => {
  // TODO: later check credentials against users table
  res.redirect('/lobby');
});

// signup page (GET)
app.get('/auth/signup', (_req, res) => {
  res.render('pages/signup', { error: null });
});

// signup submit (POST) – still stubbed; frontend flow only
app.post('/auth/signup', (_req, res) => {
  // TODO: later insert new user into users table
  res.redirect('/auth/login');
});

// logout (just sends them back home for now)
app.get('/auth/logout', (_req, res) => {
  res.redirect('/');
});

// lobby – NOW reads games from DB
app.get('/lobby', async (_req, res) => {
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

    res.render('pages/lobby', {
      username: 'Player1',      // TODO: pull from session after auth is added
      games: result.rows,       // <%- games %> in lobby.ejs
      messages: []              // still empty for now
    });
  } catch (err) {
    console.error('[lobby] Failed to load games', err);
    res.status(500).render('pages/error', { message: 'Failed to load games' });
  }
});

// game page – base path per milestone: /games/:id
app.get('/games/:id', (req, res) => {
  const gameId = req.params.id;
  res.render('pages/game', { gameId });
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
    // Ensure a dummy owner user exists (id = 1) to satisfy FK on owner_id
    await query(
      `
      INSERT INTO users (id, email, username, password_hash)
      VALUES (1, 'demo@example.com', 'demo_owner', 'demo')
      ON CONFLICT (id) DO NOTHING
    `
    );

    // Insert the new game-room row
    await query(
      `
      INSERT INTO game_room (owner_id, name, max_players, status)
      VALUES (1, $1, $2, 'waiting')
    `,
      [gameName, maxPlayersInt]
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
