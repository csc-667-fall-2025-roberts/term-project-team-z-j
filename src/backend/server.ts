import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import ViteExpress from 'vite-express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

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

ViteExpress.listen(app, PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
