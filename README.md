# Texas Hold'em Poker

A real-time multiplayer Texas Hold'em poker game built with Node.js, Express, Socket.io, and PostgreSQL.

## Tech Stack

- **Backend:** Express 5, TypeScript, Socket.io
- **Frontend:** Vite, TypeScript, Tailwind CSS
- **Database:** PostgreSQL with node-pg-migrate
- **Templating:** EJS
- **Auth:** bcrypt, express-session

## Features

- User authentication (signup/login)
- Real-time multiplayer game rooms
- Full Texas Hold'em poker logic (blinds, betting rounds, hand evaluation)
- Turn-based gameplay with 30-second timer
- Side pot calculation
- In-game chat
- Responsive UI with card graphics

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

## Setup

1. Clone the repository

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```

4. Configure your database connection in `.env`:
   ```
   DATABASE_URL=postgresql://user:password@localhost:5432/texas_holdem
   SESSION_SECRET=your-secret-key
   ```

5. Run database migrations:
   ```bash
   npm run migrate:up
   ```

6. Start the development server:
   ```bash
   npm run dev
   ```

7. Open http://localhost:3000

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build TypeScript for production |
| `npm start` | Run production server |
| `npm run migrate:up` | Run pending database migrations |
| `npm run migrate:down` | Rollback last migration |

## Project Structure

```
├── src/
│   ├── backend/
│   │   ├── controllers/    # Route handlers
│   │   ├── poker/          # Game engine, hand evaluator, pot manager
│   │   ├── views/          # EJS templates
│   │   ├── database.ts     # PostgreSQL connection
│   │   └── server.ts       # Express app entry point
│   └── frontend/
│       ├── games/          # Game room & poker client logic
│       └── main.ts         # Frontend entry point
├── migrations/             # Database migrations
├── public/cards/           # Card SVG assets
└── package.json
```

## Game Rules

- Starting stack: 1,500 chips
- Small blind: 10 chips
- Big blind: 20 chips
- 30-second turn timer (auto-fold on timeout)
- Standard Texas Hold'em hand rankings
