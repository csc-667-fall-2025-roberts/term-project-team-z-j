
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import ViteExpress from 'vite-express';
import { testConnection } from './database';

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

// login submit (POST) – will hook to DB later
app.post('/auth/login', (_req, res) => {
    // TODO: check credentials against users table
    // for now just send them to the lobby so frontend flow works
    res.redirect('/lobby');
});

// signup page (GET)
app.get('/auth/signup', (_req, res) => {
    res.render('pages/signup', { error: null });
});

// signup submit (POST) – will hook to DB later
app.post('/auth/signup', (_req, res) => {
    // TODO: insert new user into users table
    // for now just redirect back to login
    res.redirect('/auth/login');
});

// logout (just sends them back home for now)
app.get('/auth/logout', (_req, res) => {
    res.redirect('/');
});

// lobby – later this will read games + messages from DB
app.get('/lobby', (_req, res) => {
    res.render('pages/lobby', {
        username: 'Player1', // TODO: pull from session after auth is added
        games: [],           // TODO: fetch game_room records
        messages: []         // TODO: fetch messages for lobby / room
    });
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

// create game – stub for now (will insert into game_room later)
app.post('/games', (_req, res) => {
    // TODO: insert a new row into game_room using database.ts
    // for demo we just go back to lobby
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
