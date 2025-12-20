import { Request, Response } from 'express';
import pool from '../database';

// Create a new game room
export async function createGame(req: Request, res: Response) {
    try {
        const { gameName, maxPlayers } = req.body;
        const userId = req.session.user?.id;

        if (!userId) {
            return res.status(401).redirect('/auth/login');
        }

        if (!gameName || !maxPlayers) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const maxPlayersNum = parseInt(maxPlayers);
        if (isNaN(maxPlayersNum) || maxPlayersNum < 2 || maxPlayersNum > 10) {
            return res.status(400).json({ error: 'Invalid max players value' });
        }

        // Create game room
        const roomResult = await pool.query(
            `INSERT INTO game_room (owner_id, name, max_players, status)
       VALUES ($1, $2, $3, 'waiting')
       RETURNING id, owner_id, name, max_players, status, created_at`,
            [userId, gameName, maxPlayersNum]
        );

        const room = roomResult.rows[0];

        // Add owner as first player
        await pool.query(
            `INSERT INTO room_players (user_id, room_id, position, is_ready)
       VALUES ($1, $2, 0, true)`,
            [userId, room.id]
        );

        // Broadcast new game to lobby
        const io = req.app.get('io');
        if (io) {
            io.emit('lobby:game:new', {
                id: room.id,
                name: room.name,
                max_players: room.max_players,
                player_count: 1,
                status: room.status,
            });
        }

        return res.redirect(`/games/${room.id}`);
    } catch (error) {
        console.error('[createGame] error:', error);
        return res.status(500).json({ error: 'Failed to create game' });
    }
}

// Get all available games
export async function getGames(_req: Request, res: Response) {
    try {
        const result = await pool.query(
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

        return res.json({ games: result.rows });
    } catch (error) {
        console.error('[getGames] error:', error);
        return res.status(500).json({ error: 'Failed to fetch games' });
    }
}

// Get game details
export async function getGameDetails(req: Request, res: Response) {
    try {
        const gameId = parseInt(req.params.id);
        const userId = req.session.user?.id;

        if (!userId) {
            return res.status(401).redirect('/auth/login');
        }

        if (isNaN(gameId)) {
            return res.status(400).json({ error: 'Invalid game ID' });
        }

        // Get game room details
        const roomResult = await pool.query(
            `SELECT 
        gr.id,
        gr.name,
        gr.max_players,
        gr.status,
        gr.owner_id,
        u.username as owner_name
       FROM game_room gr
       JOIN users u ON gr.owner_id = u.id
       WHERE gr.id = $1`,
            [gameId]
        );

        if ((roomResult.rowCount ?? 0) === 0) {
            return res.status(404).json({ error: 'Game not found' });
        }

        const room = roomResult.rows[0];

        // Get players in room
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

        return res.json({
            room,
            players: playersResult.rows,
        });
    } catch (error) {
        console.error('[getGameDetails] error:', error);
        return res.status(500).json({ error: 'Failed to fetch game details' });
    }
}

// Join a game
export async function joinGame(req: Request, res: Response) {
    try {
        const gameId = parseInt(req.params.id);
        const userId = req.session.user?.id;

        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        if (isNaN(gameId)) {
            return res.status(400).json({ error: 'Invalid game ID' });
        }

        // Check if room exists and has space
        const roomResult = await pool.query(
            `SELECT 
        gr.id,
        gr.max_players,
        gr.status,
        COUNT(rp.user_id) as player_count
       FROM game_room gr
       LEFT JOIN room_players rp ON gr.id = rp.room_id
       WHERE gr.id = $1
       GROUP BY gr.id`,
            [gameId]
        );

        if ((roomResult.rowCount ?? 0) === 0) {
            return res.status(404).json({ error: 'Game not found' });
        }

        const room = roomResult.rows[0];

        if (room.status !== 'waiting') {
            return res.status(400).json({ error: 'Game already started' });
        }

        if (room.player_count >= room.max_players) {
            return res.status(400).json({ error: 'Game is full' });
        }

        // Check if already in room
        const existingPlayer = await pool.query(
            `SELECT user_id FROM room_players WHERE user_id = $1 AND room_id = $2`,
            [userId, gameId]
        );

        if ((existingPlayer.rowCount ?? 0) > 0) {
            return res.status(400).json({ error: 'Already in this game' });
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

        // Add player to room
        await pool.query(
            `INSERT INTO room_players (user_id, room_id, position, is_ready)
       VALUES ($1, $2, $3, false)`,
            [userId, gameId, nextPosition]
        );

        // Broadcast player joined
        const io = req.app.get('io');
        if (io) {
            const userResult = await pool.query(
                `SELECT username FROM users WHERE id = $1`,
                [userId]
            );

            io.to(`room:${gameId}`).emit('room:player:joined', {
                user_id: userId,
                username: userResult.rows[0]?.username,
                position: nextPosition,
            });
        }

        return res.json({ success: true, position: nextPosition });
    } catch (error) {
        console.error('[joinGame] error:', error);
        return res.status(500).json({ error: 'Failed to join game' });
    }
}
