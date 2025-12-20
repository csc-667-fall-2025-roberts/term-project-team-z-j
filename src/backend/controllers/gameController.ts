import { Request, Response } from 'express';
import pool from '../database';
import { PokerGameEngine } from '../poker/PokerGameEngine';
import { registerGame } from './pokerGameController';

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

        // Check if already in room
        const existingPlayer = await pool.query(
            `SELECT user_id FROM room_players WHERE user_id = $1 AND room_id = $2`,
            [userId, gameId]
        );

        if ((existingPlayer.rowCount ?? 0) > 0) {
            // User is already in the game, just return success
            return res.json({ success: true, alreadyJoined: true });
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

            // Also emit lobby update
            io.emit('lobby:game:updated', {
                id: gameId,
                player_count: room.player_count + 1,
            });
        }

        return res.json({ success: true, position: nextPosition });
    } catch (error) {
        console.error('[joinGame] error:', error);
        return res.status(500).json({ error: 'Failed to join game' });
    }
}

// Start a game (owner only)
export async function startGame(req: Request, res: Response) {
    const gameId = parseInt(req.params.id);

    try {
        const userId = req.session.user?.id;

        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        if (isNaN(gameId)) {
            return res.status(400).json({ error: 'Invalid game ID' });
        }

        // Check if user is the owner
        const roomResult = await pool.query(
            `SELECT owner_id, status FROM game_room WHERE id = $1`,
            [gameId]
        );

        if ((roomResult.rowCount ?? 0) === 0) {
            return res.status(404).json({ error: 'Game not found' });
        }

        const room = roomResult.rows[0];

        if (room.owner_id !== userId) {
            return res.status(403).json({ error: 'Only the owner can start the game' });
        }

        if (room.status !== 'waiting') {
            return res.status(400).json({ error: 'Game already started' });
        }

        // Check if there are at least 2 players
        const playerCountResult = await pool.query(
            `SELECT COUNT(*) as count FROM room_players WHERE room_id = $1`,
            [gameId]
        );

        const playerCount = parseInt(playerCountResult.rows[0].count);

        if (playerCount < 2) {
            return res.status(400).json({ error: 'Need at least 2 players to start' });
        }

        // Update game status
        await pool.query(
            `UPDATE game_room SET status = 'in_progress' WHERE id = $1`,
            [gameId]
        );

        // Create game record in database (Requirement 10.1)
        const gameResult = await pool.query(
            `INSERT INTO game (room_id)
            VALUES ($1)
            RETURNING id`,
            [gameId]
        );

        const dbGameId = gameResult.rows[0].id;

        // Get players in room with their positions
        const playersResult = await pool.query(
            `SELECT rp.user_id, u.username, rp.position
            FROM room_players rp
            JOIN users u ON rp.user_id = u.id
            WHERE rp.room_id = $1
            ORDER BY rp.position`,
            [gameId]
        );

        const players = playersResult.rows.map((row: any) => ({
            userId: row.user_id,
            username: row.username,
            position: row.position
        }));

        // Get Socket.io instance
        const io = req.app.get('io');
        if (!io) {
            // Rollback status change
            await pool.query(
                `UPDATE game_room SET status = 'waiting' WHERE id = $1`,
                [gameId]
            );
            return res.status(500).json({ error: 'Socket.io not available' });
        }

        // Instantiate PokerGameEngine with room players (Requirement 7.1)
        const pokerEngine = new PokerGameEngine(gameId, dbGameId, players, io);

        // Store engine instance in memory (Map<roomId, PokerGameEngine>)
        registerGame(gameId, pokerEngine);

        // Broadcast game started - clients will register handlers on this event
        io.to(`room:${gameId}`).emit('game:started', {
            gameId,
        });

        // Small delay to allow clients to register handlers before starting the hand
        await new Promise(resolve => setTimeout(resolve, 500));

        // Call engine.startHand() to begin first hand
        await pokerEngine.startHand();

        return res.json({ success: true });
    } catch (error) {
        console.error('[startGame] error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to start game';

        // Rollback: Reset room status to 'waiting' if game failed to start
        try {
            await pool.query(
                `UPDATE game_room SET status = 'waiting' WHERE id = $1`,
                [gameId]
            );
        } catch (rollbackError) {
            console.error('[startGame] rollback error:', rollbackError);
        }

        return res.status(500).json({ error: errorMessage, details: error });
    }
}

// Leave a game
export async function leaveGame(req: Request, res: Response) {
    try {
        const gameId = parseInt(req.params.id);
        const userId = req.session.user?.id;

        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        if (isNaN(gameId)) {
            return res.status(400).json({ error: 'Invalid game ID' });
        }

        // Check if user is in the game
        const playerResult = await pool.query(
            `SELECT user_id FROM room_players WHERE user_id = $1 AND room_id = $2`,
            [userId, gameId]
        );

        if ((playerResult.rowCount ?? 0) === 0) {
            return res.status(400).json({ error: 'You are not in this game' });
        }

        // Remove player from game
        await pool.query(
            `DELETE FROM room_players WHERE user_id = $1 AND room_id = $2`,
            [userId, gameId]
        );

        // Check if game is now empty
        const remainingPlayersResult = await pool.query(
            `SELECT COUNT(*) as count FROM room_players WHERE room_id = $1`,
            [gameId]
        );

        const remainingPlayers = parseInt(remainingPlayersResult.rows[0].count);

        if (remainingPlayers === 0) {
            // Delete the game if no players left
            await pool.query(`DELETE FROM game_room WHERE id = $1`, [gameId]);
        } else {
            // Check if the owner left
            const roomResult = await pool.query(
                `SELECT owner_id FROM game_room WHERE id = $1`,
                [gameId]
            );

            if ((roomResult.rowCount ?? 0) > 0 && roomResult.rows[0].owner_id === userId) {
                // Transfer ownership to the first remaining player
                const newOwnerResult = await pool.query(
                    `SELECT user_id FROM room_players WHERE room_id = $1 ORDER BY position LIMIT 1`,
                    [gameId]
                );

                if ((newOwnerResult.rowCount ?? 0) > 0) {
                    await pool.query(
                        `UPDATE game_room SET owner_id = $1 WHERE id = $2`,
                        [newOwnerResult.rows[0].user_id, gameId]
                    );
                }
            }
        }

        // Broadcast player left
        const io = req.app.get('io');
        if (io) {
            io.to(`room:${gameId}`).emit('room:player:left', {
                user_id: userId,
            });

            // Also emit lobby update
            if (remainingPlayers > 0) {
                io.emit('lobby:game:updated', {
                    id: gameId,
                    player_count: remainingPlayers,
                });
            }
        }

        return res.json({ success: true });
    } catch (error) {
        console.error('[leaveGame] error:', error);
        return res.status(500).json({ error: 'Failed to leave game' });
    }
}
