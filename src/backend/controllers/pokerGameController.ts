/**
 * PokerGameController - WebSocket event handlers for poker game actions
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 1.5, 4.3, 9.2, 9.3, 9.4
 */

import { Server, Socket } from 'socket.io';
import { PokerGameEngine } from '../poker/PokerGameEngine';

// Store active game engines by room ID
const activeGames = new Map<number, PokerGameEngine>();

/**
 * Register a poker game engine for a room
 */
export function registerGame(roomId: number, engine: PokerGameEngine): void {
    activeGames.set(roomId, engine);
}

/**
 * Get a poker game engine for a room
 */
export function getGame(roomId: number): PokerGameEngine | undefined {
    return activeGames.get(roomId);
}

/**
 * Remove a poker game engine for a room
 */
export function unregisterGame(roomId: number): void {
    activeGames.delete(roomId);
}

/**
 * Register all poker game WebSocket event handlers
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */
export function registerPokerHandlers(_io: Server, socket: Socket, userId: number, roomId: number): void {
    const game = activeGames.get(roomId);

    if (!game) {
        console.error(`[pokerGameController] No game found for room ${roomId}`);
        return;
    }

    /**
     * Handle fold action
     * Requirement 2.2: Mark player as inactive for remainder of hand
     */
    socket.on('game:action:fold', async () => {
        try {
            await game.handlePlayerAction(userId, { type: 'fold' });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('[game:action:fold] error:', errorMessage);

            // Requirement 9.3: Send error message to affected player
            socket.emit('game:error', {
                message: errorMessage
            });
        }
    });

    /**
     * Handle check action
     * Requirement 2.3: Advance to next player without changing pot
     */
    socket.on('game:action:check', async () => {
        try {
            await game.handlePlayerAction(userId, { type: 'check' });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('[game:action:check] error:', errorMessage);

            // Requirement 9.3: Send error message to affected player
            socket.emit('game:error', {
                message: errorMessage
            });
        }
    });

    /**
     * Handle call action
     * Requirement 2.4: Add call amount to pot and deduct from player's stack
     */
    socket.on('game:action:call', async () => {
        try {
            await game.handlePlayerAction(userId, { type: 'call' });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('[game:action:call] error:', errorMessage);

            // Requirement 9.3: Send error message to affected player
            socket.emit('game:error', {
                message: errorMessage
            });
        }
    });

    /**
     * Handle raise action with amount validation
     * Requirement 2.5: Validate raise amount is at least minimum raise
     */
    socket.on('game:action:raise', async (data: { amount: number }) => {
        try {
            // Validate amount is provided
            if (!data || typeof data.amount !== 'number') {
                throw new Error('Invalid raise amount');
            }

            // Validate amount is positive
            if (data.amount <= 0) {
                throw new Error('Raise amount must be positive');
            }

            await game.handlePlayerAction(userId, {
                type: 'raise',
                amount: data.amount
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('[game:action:raise] error:', errorMessage);

            // Requirement 9.3: Send error message to affected player
            socket.emit('game:error', {
                message: errorMessage
            });
        }
    });

    /**
     * Handle all-in action
     * Requirement 2.6: Move all remaining chips from player's stack to pot
     */
    socket.on('game:action:allin', async () => {
        try {
            await game.handlePlayerAction(userId, { type: 'all_in' });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('[game:action:allin] error:', errorMessage);

            // Requirement 9.3: Send error message to affected player
            socket.emit('game:error', {
                message: errorMessage
            });
        }
    });

    console.log(`[pokerGameController] Registered poker handlers for user ${userId} in room ${roomId}`);
}

/**
 * Broadcast game state events
 * These events are emitted by the PokerGameEngine directly to the Socket.io server
 * This file documents the event structure for reference
 * 
 * Requirements: 1.5, 4.3, 9.2, 9.3, 9.4
 */

/**
 * Event: game:hand:started
 * Emitted when a new hand begins
 * Requirement 9.2: Broadcast game state changes to all players
 * 
 * Payload: {
 *   handNumber: number,
 *   dealerPosition: number,
 *   pot: number
 * }
 */

/**
 * Event: game:cards:dealt
 * Emitted privately to each player with their hole cards
 * Requirement 1.5: Send each player's hole cards only to that specific player
 * 
 * Payload: {
 *   userId: number,
 *   holeCards: [Card, Card]
 * }
 */

/**
 * Event: game:pot:updated
 * Emitted when pot changes
 * Requirement 4.3: Broadcast updated pot size to all players
 * 
 * Payload: {
 *   pot: number
 * }
 */

/**
 * Event: game:action:performed
 * Emitted when a player takes an action
 * Requirement 9.2: Broadcast player actions to all players
 * 
 * Payload: {
 *   userId: number,
 *   username: string,
 *   action: string,
 *   amount: number,
 *   pot: number
 * }
 */

/**
 * Event: game:error
 * Emitted for invalid actions
 * Requirement 9.3: Send error message to affected player
 * 
 * Payload: {
 *   message: string
 * }
 */

/**
 * Event: game:street:advanced
 * Emitted when advancing to next street (flop, turn, river)
 * Requirement 9.2: Broadcast game state changes to all players
 * 
 * Payload: {
 *   street: string,
 *   boardCards: Card[],
 *   pot: number
 * }
 */

/**
 * Event: game:turn:started
 * Emitted when a player's turn begins
 * Requirement 9.2: Broadcast game state changes to all players
 * 
 * Payload: {
 *   userId: number,
 *   timeRemaining: number
 * }
 */

/**
 * Event: game:turn:tick
 * Emitted every second during a player's turn
 * Requirement 9.2: Broadcast game state changes to all players
 * 
 * Payload: {
 *   timeRemaining: number
 * }
 */

/**
 * Event: game:winner:determined
 * Emitted when winners are determined at showdown
 * Requirement 9.4: Broadcast final hand summary to all players
 * 
 * Payload: {
 *   winners: Array<{
 *     userId: number,
 *     username: string,
 *     amountWon: number,
 *     handRank: string,
 *     holeCards?: [Card, Card],
 *     stack: number
 *   }>,
 *   pot: number,
 *   boardCards?: Card[]
 * }
 */

/**
 * Event: game:stacks:updated
 * Emitted after hand completes with updated player stacks
 * Requirement 9.2: Broadcast game state changes to all players
 * 
 * Payload: {
 *   players: Array<{
 *     userId: number,
 *     username: string,
 *     stack: number,
 *     isActive: boolean
 *   }>,
 *   eliminatedPlayers: Array<{
 *     userId: number,
 *     username: string
 *   }>
 * }
 */

/**
 * Event: game:positions:updated
 * Emitted when dealer and blind positions are updated
 * Requirement 9.2: Broadcast game state changes to all players
 * 
 * Payload: {
 *   dealerPosition: number,
 *   smallBlindPosition: number,
 *   bigBlindPosition: number
 * }
 */

/**
 * Event: game:ended
 * Emitted when game ends (only 0 or 1 player remains)
 * Requirement 9.2: Broadcast game state changes to all players
 * 
 * Payload: {
 *   winner: {
 *     userId: number,
 *     username: string,
 *     stack: number
 *   } | null
 * }
 */
