import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import ViteExpress from 'vite-express';
// import { l } from 'vite/dist/node/types.d-aGj9QkWt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve TypeScript files directly
app.use('/main.ts', (_req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/main.ts'));
});

// Routes
app.get('/', (_req, res) => {
    res.render('index');
});

// Login route
app.get('/auth/login', (_req, res) => {
    res.render('login', { error: null });
});

app.post('/auth/login', (req, res) => {
    // for now just redirect back to lobby
    res.redirect('/lobby');
});

// Singup route
app.get('/auth/signup', (_req, res) => {
    res.render('signup', { error: null });
});

app.post('/auth/signup', (req, res) => {
    // for now just redirect back to login
    res.redirect('/auth/login');
});

// Logout
app.get('/auth/logout', (_req, res) => {
    // for now just redirect back to /
    res.redirect('/');
});

// Lobby route
app.get('/lobby', (_req, res) => {
    // fetch games and messages from db later
    res.render('lobby', {
        username: 'Player1', // get from session
        games: [],           // fetch from db later
        messages: []         // fetch from db later
    });
});

// game routes 
// app.get('/game/:id', (_req, res) => {
//     res.render('game', { gameId: _req.params.id });
// });

// app.post('/game/create', (req, res) => {
//     // create new game logic here
//     res.redirect('/lobby');
// });

// error handlers

// app.get('/error', (_req, res) => {
//     res.render('error', { message: 'An error occurred' });
// });

// 404
//general 


// Start the server 
ViteExpress.listen(app, PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});




