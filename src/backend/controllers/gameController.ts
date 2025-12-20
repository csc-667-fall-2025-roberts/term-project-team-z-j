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

// Start game - creates game record and deals first hand
export async function startGame(req: Request, res: Response) {
    try {
        const roomId = parseInt(req.params.id);
        const userId = req.session.user?.id;

        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        // Check if user is room owner
        const roomResult = await pool.query(
            `SELECT owner_id, status FROM game_room WHERE id = $1`,
            [roomId]
        );

        if ((roomResult.rowCount ?? 0) === 0) {
            return res.status(404).json({ error: 'Room not found' });
        }

        const room = roomResult.rows[0];

        if (room.owner_id !== userId) {
            return res.status(403).json({ error: 'Only owner can start game' });
        }

        if (room.status !== 'waiting') {
            return res.status(400).json({ error: 'Game already started' });
        }

        // Check minimum players
        const playerCount = await pool.query(
            `SELECT COUNT(*) as count FROM room_players WHERE room_id = $1`,
            [roomId]
        );

        if (parseInt(playerCount.rows[0].count) < 2) {
            return res.status(400).json({ error: 'Need at least 2 players' });
        }

        // Create game record
        const gameResult = await pool.query(
            `INSERT INTO game (room_id, start_time) 
       VALUES ($1, NOW()) 
       RETURNING id`,
            [roomId]
        );

        const gameId = gameResult.rows[0].id;

        // Update room status to in_progress
        await pool.query(
            `UPDATE game_room SET status = 'in_progress' WHERE id = $1`,
            [roomId]
        );

        // Deal first hand
        const handId = await dealHand(gameId, roomId, req.app.get('io'));

        return res.json({ success: true, game_id: gameId, hand_id: handId });
    } catch (error) {
        console.error('[startGame] error:', error);
        return res.status(500).json({ error: 'Failed to start game' });
    }
}

// Deal hand - creates a new hand and deals cards to all players
async function dealHand(gameId: number, roomId: number, io: any): Promise<number> {
    // Get all players in the room
    const playersResult = await pool.query(
        `SELECT user_id, position FROM room_players WHERE room_id = $1 ORDER BY position`,
        [roomId]
    );

    const players = playersResult.rows;
    const playerCount = players.length;

    // Set dealer positions (simplified - dealer is always seat 0)
    const dealerSeat = 0;
    const smallBlindSeat = 1 % playerCount;
    const bigBlindSeat = 2 % playerCount;
    const initialPot = 30;

    // Create hand record
    const handResult = await pool.query(
        `INSERT INTO hands (game_id, hand_number, dealer_seat, small_blind_seat, big_blind_seat, current_street, pot_size)
       VALUES ($1, 1, $2, $3, $4, 'preflop', $5)
       RETURNING id`,
        [gameId, dealerSeat, smallBlindSeat, bigBlindSeat, initialPot]
    );

    const handId = handResult.rows[0].id;

    // Generate and shuffle deck
    const deck = createDeck();
    shuffle(deck);

    // Deal 2 cards to each player
    for (const player of players) {
        const card1 = deck.pop()!;
        const card2 = deck.pop()!;

        await pool.query(
            `INSERT INTO hand_cards (hand_id, user_id, card_1, card_2, is_active)
           VALUES ($1, $2, $3, $4, true)`,
            [handId, player.user_id, card1, card2]
        );
    }

    // Broadcast hand started to all players in room
    if (io) {
        io.to(`room:${roomId}`).emit('game:hand:started', {
            hand_id: handId,
            dealer_seat: dealerSeat,
            small_blind_seat: smallBlindSeat,
            big_blind_seat: bigBlindSeat,
            pot_size: initialPot,
        });
    }

    return handId;
}

// Handle player action - fold, check, call, raise
export async function handleAction(req: Request, res: Response) {
    try {
        const handId = parseInt(req.params.handId);
        const userId = req.session.user?.id;
        const { action_type, amount } = req.body;

        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        // Validate action
        const validActions = ['fold', 'check', 'call', 'raise'];
        if (!validActions.includes(action_type)) {
            return res.status(400).json({ error: 'Invalid action' });
        }

        // Get hand and room info
        const handResult = await pool.query(
            `SELECT h.*, g.room_id 
       FROM hands h 
       JOIN game g ON h.game_id = g.id 
       WHERE h.id = $1`,
            [handId]
        );

        if ((handResult.rowCount ?? 0) === 0) {
            return res.status(404).json({ error: 'Hand not found' });
        }

        const hand = handResult.rows[0];

        // Check if player is in this hand
        const playerCheck = await pool.query(
            `SELECT is_active FROM hand_cards WHERE hand_id = $1 AND user_id = $2`,
            [handId, userId]
        );

        if ((playerCheck.rowCount ?? 0) === 0) {
            return res.status(400).json({ error: 'Not in this hand' });
        }

        if (!playerCheck.rows[0].is_active) {
            return res.status(400).json({ error: 'Already folded' });
        }

        // Save action to database
        await pool.query(
            `INSERT INTO actions (hand_id, user_id, action_type, amount, street)
       VALUES ($1, $2, $3, $4, $5)`,
            [handId, userId, action_type, amount || 0, hand.current_street]
        );

        // Handle fold - mark player inactive
        if (action_type === 'fold') {
            await pool.query(
                `UPDATE hand_cards SET is_active = false WHERE hand_id = $1 AND user_id = $2`,
                [handId, userId]
            );
        }

        // Handle raise/call - add to pot
        if ((action_type === 'raise' || action_type === 'call') && amount) {
            await pool.query(
                `UPDATE hands SET pot_size = pot_size + $1 WHERE id = $2`,
                [amount, handId]
            );
        }

        // Broadcast action to all players
        const io = req.app.get('io');
        if (io) {
            const userResult = await pool.query(
                `SELECT username FROM users WHERE id = $1`,
                [userId]
            );

            io.to(`room:${hand.room_id}`).emit('game:action', {
                hand_id: handId,
                user_id: userId,
                username: userResult.rows[0]?.username,
                action_type,
                amount: amount || 0,
            });
        }

        // Check if only 1 player left (everyone else folded)
        const activePlayers = await pool.query(
            `SELECT COUNT(*) as count FROM hand_cards WHERE hand_id = $1 AND is_active = true`,
            [handId]
        );

        const activeCount = parseInt(activePlayers.rows[0].count);

        // If only 1 player left, they win
        if (activeCount === 1) {
            await determineWinner(handId, hand.room_id, io);
        }

        return res.json({ success: true });
    } catch (error) {
        console.error('[handleAction] error:', error);
        return res.status(500).json({ error: 'Failed to handle action' });
    }
}

// Determine winner - simplified version (last player standing wins)
async function determineWinner(handId: number, roomId: number, io: any) {
    const winnerResult = await pool.query(
        `SELECT hc.user_id, u.username 
       FROM hand_cards hc
       JOIN users u ON hc.user_id = u.id
       WHERE hc.hand_id = $1 AND hc.is_active = true
       LIMIT 1`,
        [handId]
    );

    if ((winnerResult.rowCount ?? 0) === 0) {
        return;
    }

    const winner = winnerResult.rows[0];

    const handResult = await pool.query(
        `SELECT pot_size FROM hands WHERE id = $1`,
        [handId]
    );

    const potSize = handResult.rows[0].pot_size;

    await pool.query(
        `INSERT INTO winners (hand_id, user_id, amount_won, hand_rank)
       VALUES ($1, $2, $3, 'Won by default')`,
        [handId, winner.user_id, potSize]
    );

    await pool.query(
        `UPDATE hands SET is_completed = true WHERE id = $1`,
        [handId]
    );

    if (io) {
        io.to(`room:${roomId}`).emit('game:winner', {
            hand_id: handId,
            winner_id: winner.user_id,
            winner_name: winner.username,
            amount_won: potSize,
        });
    }
}

// Helper: Create deck
function createDeck(): string[] {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck: string[] = [];

    for (const suit of suits) {
        for (const rank of ranks) {
            deck.push(`${rank}-${suit}`);
        }
    }

    return deck;
}

// Helper: Shuffle deck
function shuffle(array: any[]): void {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}