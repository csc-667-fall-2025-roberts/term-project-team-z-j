import { query } from '../database.js';
import { GameState, PokerGame } from './PokerGame.js';

export interface GameRoom {
    id: number;
    name: string;
    maxPlayers: number;
    status: 'waiting' | 'in_progress' | 'finished';
    players: string[];
    game?: PokerGame;
}

export class GameManager {
    private games: Map<number, GameRoom> = new Map();

    async createGame(roomId: number, playerNames: string[]): Promise<boolean> {
        try {
            // Get room info from database
            const roomResult = await query<{
                id: number;
                name: string;
                max_players: number;
                status: string;
            }>('SELECT id, name, max_players, status FROM game_room WHERE id = $1', [roomId]);

            if (roomResult.rows.length === 0) {
                return false;
            }

            const room = roomResult.rows[0];

            // Check if we have enough players
            if (playerNames.length < 2) {
                return false;
            }

            // Create new poker game
            const pokerGame = new PokerGame(roomId.toString(), playerNames);

            const gameRoom: GameRoom = {
                id: roomId,
                name: room.name,
                maxPlayers: room.max_players,
                status: 'in_progress',
                players: playerNames,
                game: pokerGame
            };

            this.games.set(roomId, gameRoom);

            // Update room status in database
            await query('UPDATE game_room SET status = $1 WHERE id = $2', ['in_progress', roomId]);

            // Create game record
            await query('INSERT INTO game (room_id) VALUES ($1)', [roomId]);

            return true;
        } catch (error) {
            console.error('Error creating game:', error);
            return false;
        }
    }

    async joinGame(roomId: number, playerName: string): Promise<boolean> {
        try {
            const gameRoom = this.games.get(roomId);

            if (!gameRoom) {
                // Check if room exists and is waiting
                const roomResult = await query<{
                    id: number;
                    name: string;
                    max_players: number;
                    status: string;
                }>('SELECT id, name, max_players, status FROM game_room WHERE id = $1', [roomId]);

                if (roomResult.rows.length === 0 || roomResult.rows[0].status !== 'waiting') {
                    return false;
                }

                const room = roomResult.rows[0];

                // Create new game room entry
                const newGameRoom: GameRoom = {
                    id: roomId,
                    name: room.name,
                    maxPlayers: room.max_players,
                    status: 'waiting',
                    players: [playerName]
                };

                this.games.set(roomId, newGameRoom);
                return true;
            }

            // Add player to existing room
            if (gameRoom.players.length >= gameRoom.maxPlayers) {
                return false;
            }

            if (gameRoom.players.includes(playerName)) {
                return false; // Player already in game
            }

            gameRoom.players.push(playerName);

            // Don't auto-start - wait for manual start
            // Players can join and then click "Start Game" when ready

            return true;
        } catch (error) {
            console.error('Error joining game:', error);
            return false;
        }
    }

    getGame(roomId: number): GameRoom | undefined {
        return this.games.get(roomId);
    }

    getGameState(roomId: number): GameState | null {
        const gameRoom = this.games.get(roomId);
        return gameRoom?.game?.getGameState() || null;
    }

    async makeAction(roomId: number, playerId: string, action: string, amount?: number): Promise<boolean> {
        const gameRoom = this.games.get(roomId);
        if (!gameRoom?.game) return false;

        const game = gameRoom.game;
        let success = false;

        switch (action) {
            case 'fold':
                success = game.fold(playerId);
                break;
            case 'call':
                success = game.call(playerId);
                break;
            case 'check':
                success = game.check(playerId);
                break;
            case 'raise':
                if (amount !== undefined) {
                    success = game.raise(playerId, amount);
                }
                break;
        }

        if (success) {
            // Save action to database
            try {
                const gameResult = await query<{ id: number }>(
                    'SELECT id FROM game WHERE room_id = $1 ORDER BY start_time DESC LIMIT 1',
                    [roomId]
                );

                if (gameResult.rows.length > 0) {
                    await query(
                        'INSERT INTO actions (game_id, player_id, action_type, amount) VALUES ($1, $2, $3, $4)',
                        [gameResult.rows[0].id, playerId, action, amount || 0]
                    );
                }
            } catch (error) {
                console.error('Error saving action:', error);
            }
        }

        return success;
    }

    async endGame(roomId: number): Promise<void> {
        const gameRoom = this.games.get(roomId);
        if (!gameRoom?.game) return;

        try {
            // Update game end time
            await query(
                'UPDATE game SET end_time = CURRENT_TIMESTAMP WHERE room_id = $1 AND end_time IS NULL',
                [roomId]
            );

            // Update room status
            await query('UPDATE game_room SET status = $1 WHERE id = $2', ['finished', roomId]);

            // Save winners
            const gameState = gameRoom.game.getGameState();
            if (gameState.winners.length > 0) {
                const gameResult = await query<{ id: number }>(
                    'SELECT id FROM game WHERE room_id = $1 ORDER BY start_time DESC LIMIT 1',
                    [roomId]
                );

                if (gameResult.rows.length > 0) {
                    for (const winner of gameState.winners) {
                        await query(
                            'INSERT INTO winners (game_id, player_id, amount) VALUES ($1, $2, $3)',
                            [gameResult.rows[0].id, winner.playerId, winner.amount]
                        );
                    }
                }
            }

            gameRoom.status = 'finished';
        } catch (error) {
            console.error('Error ending game:', error);
        }
    }

    getAllGames(): GameRoom[] {
        return Array.from(this.games.values());
    }

    async startNewHand(roomId: number): Promise<boolean> {
        const gameRoom = this.games.get(roomId);
        if (!gameRoom?.game) return false;

        try {
            gameRoom.game.startNewHand();

            // Create new game record for the new hand
            await query('INSERT INTO game (room_id) VALUES ($1)', [roomId]);

            return true;
        } catch (error) {
            console.error('Error starting new hand:', error);
            return false;
        }
    }

    getPlayerCount(roomId: number): number {
        const gameRoom = this.games.get(roomId);
        return gameRoom?.players.length || 0;
    }
}

// Singleton instance
export const gameManager = new GameManager();