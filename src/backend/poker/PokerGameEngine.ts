/**
 * PokerGameEngine - Core game engine for Texas Hold'em poker
 * Manages game state, turn progression, and hand execution
 */

import { Server } from 'socket.io';
import { query } from '../database';
import { CardManager } from './CardManager';
import { Card, PlayerState } from './types';

export interface GameState {
    roomId: number;
    gameId: number;
    handId: number | null;
    handNumber: number;
    players: Map<number, PlayerState>;
    dealerPosition: number;
    smallBlindPosition: number;
    bigBlindPosition: number;
    currentPlayerPosition: number;
    currentStreet: 'preflop' | 'flop' | 'turn' | 'river';
    pot: number;
    currentBet: number;
    boardCards: Card[];
    deck: Card[];
    isHandActive: boolean;
}

export interface PlayerInfo {
    userId: number;
    username: string;
    position: number;
}

export interface PlayerAction {
    type: 'fold' | 'check' | 'call' | 'raise' | 'all_in';
    amount?: number;
}

/**
 * PokerGameEngine manages the state and logic of a poker game
 */
export class PokerGameEngine {
    private gameState: GameState;
    private io: Server;
    private timer: NodeJS.Timeout | null = null;

    private readonly TURN_TIME_SECONDS = 30;
    private readonly SMALL_BLIND = 10;
    private readonly BIG_BLIND = 20;
    private readonly STARTING_STACK = 1500;

    /**
     * Initialize a new poker game engine
     * Requirements: 7.1, 8.1, 8.3, 8.4
     */
    constructor(roomId: number, gameId: number, players: PlayerInfo[], io: Server) {
        this.io = io;

        // Initialize player states with starting stacks
        const playerMap = new Map<number, PlayerState>();
        for (const player of players) {
            const numericUserId = Number(player.userId);
            console.log(`[PokerGameEngine] Adding player ${player.username} with userId ${numericUserId} (type: ${typeof numericUserId})`);
            playerMap.set(numericUserId, {
                userId: numericUserId,
                username: player.username,
                position: Number(player.position),
                stack: this.STARTING_STACK, // Requirement 7.1: 1500 chips starting stack
                currentBet: 0,
                holeCards: null,
                isActive: true,
                isFolded: false,
                hasActed: false,
            });
        }

        console.log(`[PokerGameEngine] Player map keys:`, Array.from(playerMap.keys()));

        // Get sorted list of actual player positions from database
        const sortedPositions = players.map(p => p.position).sort((a, b) => a - b);

        // Assign dealer button to random player position (Requirement 8.1)
        const dealerIndex = Math.floor(Math.random() * sortedPositions.length);
        const dealerPosition = sortedPositions[dealerIndex];

        // Calculate blind positions using actual positions (Requirements 8.3, 8.4)
        const smallBlindIndex = (dealerIndex + 1) % sortedPositions.length;
        const bigBlindIndex = (dealerIndex + 2) % sortedPositions.length;
        const smallBlindPosition = sortedPositions[smallBlindIndex];
        const bigBlindPosition = sortedPositions[bigBlindIndex];

        // First to act is after big blind
        const firstToActIndex = (bigBlindIndex + 1) % sortedPositions.length;
        const currentPlayerPosition = sortedPositions[firstToActIndex];

        this.gameState = {
            roomId,
            gameId,
            handId: null,
            handNumber: 0,
            players: playerMap,
            dealerPosition,
            smallBlindPosition,
            bigBlindPosition,
            currentPlayerPosition,
            currentStreet: 'preflop',
            pot: 0,
            currentBet: 0,
            boardCards: [],
            deck: [],
            isHandActive: false,
        };
    }

    /**
     * Get the current game state
     */
    getGameState(): GameState {
        return this.gameState;
    }

    /**
     * Start a new hand
     * Requirements: 1.1, 1.2, 4.1, 5.1, 10.1
     */
    async startHand(): Promise<void> {
        // Increment hand number
        this.gameState.handNumber++;
        this.gameState.isHandActive = true;
        this.gameState.currentStreet = 'preflop';
        this.gameState.boardCards = [];
        this.gameState.pot = 0;
        this.gameState.currentBet = this.BIG_BLIND;

        // Reset all players for new hand
        for (const player of this.gameState.players.values()) {
            player.currentBet = 0;
            player.holeCards = null;
            player.isFolded = false;
            player.hasActed = false;
            player.isActive = player.stack > 0; // Only active if they have chips
        }

        // Create and shuffle deck (Requirement 1.1)
        this.gameState.deck = CardManager.shuffleDeck(CardManager.createDeck());

        // Post blinds (Requirement 4.1)
        const smallBlindPlayer = this.getPlayerAtPosition(this.gameState.smallBlindPosition);
        const bigBlindPlayer = this.getPlayerAtPosition(this.gameState.bigBlindPosition);

        if (smallBlindPlayer) {
            const smallBlindAmount = Math.min(this.SMALL_BLIND, smallBlindPlayer.stack);
            smallBlindPlayer.stack -= smallBlindAmount;
            smallBlindPlayer.currentBet = smallBlindAmount;
            this.gameState.pot += smallBlindAmount;
        }

        if (bigBlindPlayer) {
            const bigBlindAmount = Math.min(this.BIG_BLIND, bigBlindPlayer.stack);
            bigBlindPlayer.stack -= bigBlindAmount;
            bigBlindPlayer.currentBet = bigBlindAmount;
            this.gameState.pot += bigBlindAmount;
        }

        // Deal hole cards to each active player (Requirement 1.2)
        for (const player of this.gameState.players.values()) {
            if (player.isActive && !player.isFolded) {
                const cards = CardManager.dealCards(this.gameState.deck, 2);
                player.holeCards = [cards[0], cards[1]];
            }
        }

        // Persist hand to database (Requirement 10.1)
        const handResult = await query<{ id: number }>(
            `INSERT INTO hands (
                game_id, hand_number, dealer_seat, small_blind_seat, big_blind_seat,
                current_street, pot_size
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id`,
            [
                this.gameState.gameId,
                this.gameState.handNumber,
                this.gameState.dealerPosition,
                this.gameState.smallBlindPosition,
                this.gameState.bigBlindPosition,
                this.gameState.currentStreet,
                this.gameState.pot,
            ]
        );

        this.gameState.handId = handResult.rows[0].id;

        // Persist hole cards to database (hand_cards table)
        for (const player of this.gameState.players.values()) {
            if (player.holeCards) {
                await query(
                    `INSERT INTO hand_cards (hand_id, user_id, card_1, card_2)
                    VALUES ($1, $2, $3, $4)`,
                    [
                        this.gameState.handId,
                        player.userId,
                        CardManager.cardToString(player.holeCards[0]),
                        CardManager.cardToString(player.holeCards[1]),
                    ]
                );
            }
        }

        // Set first player to act (player after big blind)
        const activePlayers = this.getActivePlayers();
        const sortedPositions = activePlayers.map(p => p.position).sort((a, b) => a - b);
        const bigBlindIndex = sortedPositions.indexOf(this.gameState.bigBlindPosition);
        const firstToActIndex = (bigBlindIndex + 1) % sortedPositions.length;
        this.gameState.currentPlayerPosition = sortedPositions[firstToActIndex];

        console.log('[PokerGameEngine] Hand started:', {
            handNumber: this.gameState.handNumber,
            pot: this.gameState.pot,
            dealerPosition: this.gameState.dealerPosition,
            smallBlindPosition: this.gameState.smallBlindPosition,
            bigBlindPosition: this.gameState.bigBlindPosition,
            currentPlayerPosition: this.gameState.currentPlayerPosition,
            activePlayers: activePlayers.map(p => ({ userId: p.userId, position: p.position }))
        });

        // Broadcast hand started event
        this.io.to(`room:${this.gameState.roomId}`).emit('game:hand:started', {
            handNumber: this.gameState.handNumber,
            dealerPosition: this.gameState.dealerPosition,
            pot: this.gameState.pot,
        });

        // Send private hole cards to each player
        for (const player of this.gameState.players.values()) {
            if (player.holeCards) {
                console.log('[PokerGameEngine] Dealing cards to user:', player.userId, player.holeCards);
                // Note: In a real implementation, we'd need to map userId to socket ID
                // For now, we'll emit to the room with userId filter on client side
                this.io.to(`room:${this.gameState.roomId}`).emit('game:cards:dealt', {
                    userId: player.userId,
                    holeCards: player.holeCards,
                });
            }
        }

        console.log('[PokerGameEngine] Starting turn timer for position:', this.gameState.currentPlayerPosition);
        // Start turn timer for first player (Requirement 3.1)
        this.startTurnTimer();
    }

    /**
     * Get player at a specific position
     */
    private getPlayerAtPosition(position: number): PlayerState | undefined {
        for (const player of this.gameState.players.values()) {
            if (player.position === position) {
                return player;
            }
        }
        return undefined;
    }

    /**
     * Get all active (non-folded, non-eliminated) players
     */
    private getActivePlayers(): PlayerState[] {
        return Array.from(this.gameState.players.values()).filter(
            p => p.isActive && !p.isFolded
        );
    }

    /**
     * Handle a player action
     * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
     */
    async handlePlayerAction(userId: number, action: PlayerAction): Promise<void> {
        // Ensure userId is a number
        const numericUserId = Number(userId);

        console.log(`[PokerGameEngine] handlePlayerAction called with userId: ${numericUserId} (type: ${typeof numericUserId}), action:`, action);
        console.log(`[PokerGameEngine] Current player map keys:`, Array.from(this.gameState.players.keys()));
        console.log(`[PokerGameEngine] Player exists check: ${this.gameState.players.has(numericUserId)}`);

        if (!this.gameState.isHandActive) {
            throw new Error('No active hand');
        }

        const player = this.gameState.players.get(numericUserId);
        if (!player) {
            console.error(`[PokerGameEngine] Player not found! userId: ${numericUserId}, available keys:`, Array.from(this.gameState.players.keys()));
            throw new Error('Player not found');
        }

        // Validate it's the player's turn (Requirement 2.1)
        const currentPlayer = this.getPlayerAtPosition(this.gameState.currentPlayerPosition);
        if (!currentPlayer || currentPlayer.userId !== numericUserId) {
            throw new Error('Not your turn');
        }

        // Validate player is active and hasn't folded
        if (!player.isActive || player.isFolded) {
            throw new Error('Player is not active');
        }

        // Stop the turn timer (Requirement 3.4)
        this.stopTurnTimer();

        let actionAmount = 0;
        let actionType = action.type;

        // Process action based on type
        switch (action.type) {
            case 'fold':
                // Requirement 2.2: Mark player as folded
                player.isFolded = true;
                player.hasActed = true;
                break;

            case 'check':
                // Requirement 2.3: Check doesn't change pot
                // Validate player can check (no bet to call)
                if (player.currentBet < this.gameState.currentBet) {
                    throw new Error('Cannot check, must call or fold');
                }
                player.hasActed = true;
                break;

            case 'call':
                // Requirement 2.4: Call matches current bet
                const callAmount = this.gameState.currentBet - player.currentBet;

                if (callAmount > player.stack) {
                    // Not enough chips, convert to all-in
                    actionAmount = player.stack;
                    actionType = 'all_in';
                } else {
                    actionAmount = callAmount;
                }

                player.stack -= actionAmount;
                player.currentBet += actionAmount;
                this.gameState.pot += actionAmount;
                player.hasActed = true;
                break;

            case 'raise':
                // Requirement 2.5: Validate raise amount
                if (!action.amount || action.amount < this.gameState.currentBet * 2) {
                    throw new Error('Raise amount too low');
                }

                const raiseAmount = action.amount - player.currentBet;

                if (raiseAmount > player.stack) {
                    // Not enough chips, convert to all-in
                    actionAmount = player.stack;
                    actionType = 'all_in';
                    player.stack = 0;
                    player.currentBet += actionAmount;
                } else {
                    actionAmount = raiseAmount;
                    player.stack -= actionAmount;
                    player.currentBet = action.amount;
                    this.gameState.currentBet = action.amount;
                }

                this.gameState.pot += actionAmount;
                player.hasActed = true;

                // Reset hasActed for other players since there's a new bet
                for (const p of this.gameState.players.values()) {
                    if (p.userId !== userId && !p.isFolded) {
                        p.hasActed = false;
                    }
                }
                break;

            case 'all_in':
                // Requirement 2.6: All-in moves all chips to pot
                actionAmount = player.stack;
                player.currentBet += actionAmount;
                this.gameState.pot += actionAmount;
                player.stack = 0; // Stack becomes zero
                player.hasActed = true;

                // If all-in is a raise, reset other players' hasActed
                if (player.currentBet > this.gameState.currentBet) {
                    this.gameState.currentBet = player.currentBet;
                    for (const p of this.gameState.players.values()) {
                        if (p.userId !== userId && !p.isFolded && p.stack > 0) {
                            p.hasActed = false;
                        }
                    }
                }
                break;

            default:
                throw new Error(`Unknown action type: ${action.type}`);
        }

        // Persist action to database (Requirement 2.7)
        await query(
            `INSERT INTO actions (hand_id, user_id, action_type, amount, street)
            VALUES ($1, $2, $3, $4, $5)`,
            [
                this.gameState.handId,
                userId,
                actionType,
                actionAmount,
                this.gameState.currentStreet,
            ]
        );

        // Broadcast action to all players
        this.io.to(`room:${this.gameState.roomId}`).emit('game:action:performed', {
            userId,
            username: player.username,
            action: actionType,
            amount: actionAmount,
            pot: this.gameState.pot,
        });

        // Broadcast pot update
        this.io.to(`room:${this.gameState.roomId}`).emit('game:pot:updated', {
            pot: this.gameState.pot,
        });

        // Advance to next player (Requirement 2.1)
        await this.advanceToNextPlayer();
    }

    /**
     * Start turn timer for the current player
     * Requirements: 3.1, 3.2, 3.3, 3.4
     */
    private startTurnTimer(): void {
        // Clear any existing timer
        this.stopTurnTimer();

        let timeRemaining = this.TURN_TIME_SECONDS;
        const currentPlayer = this.getPlayerAtPosition(this.gameState.currentPlayerPosition);

        if (!currentPlayer) {
            console.error('[PokerGameEngine] No player found at position:', this.gameState.currentPlayerPosition);
            return;
        }

        console.log('[PokerGameEngine] Starting turn timer for user:', currentPlayer.userId, 'at position:', currentPlayer.position);

        // Emit initial turn started event (Requirement 3.1)
        this.io.to(`room:${this.gameState.roomId}`).emit('game:turn:started', {
            userId: currentPlayer.userId,
            timeRemaining,
        });

        // Start interval to emit tick events every second (Requirement 3.2)
        this.timer = setInterval(() => {
            timeRemaining--;

            // Broadcast remaining time to all players
            this.io.to(`room:${this.gameState.roomId}`).emit('game:turn:tick', {
                timeRemaining,
            });

            // Handle timeout when timer reaches zero (Requirement 3.3)
            if (timeRemaining <= 0) {
                this.handleTimeout(currentPlayer.userId);
            }
        }, 1000);
    }

    /**
     * Stop the current turn timer
     * Requirement 3.4: Stop timer when player takes action
     */
    private stopTurnTimer(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /**
     * Handle timeout when player doesn't act in time
     * Requirement 3.3: Auto-fold player when timer expires
     */
    private async handleTimeout(userId: number): Promise<void> {
        this.stopTurnTimer();

        try {
            // Auto-fold the player - handlePlayerAction will call advanceToNextPlayer
            await this.handlePlayerAction(userId, { type: 'fold' });
        } catch (error) {
            console.error('Error handling timeout:', error);
            // Emit error to room
            this.io.to(`room:${this.gameState.roomId}`).emit('game:error', {
                message: 'Error processing timeout',
            });
        }
    }

    /**
     * Advance to the next player
     * Requirements: 2.1, 3.4, 3.5
     */
    async advanceToNextPlayer(): Promise<void> {
        const activePlayers = this.getActivePlayers();

        // Check if only one player remains (everyone else folded)
        if (activePlayers.length <= 1) {
            // Hand is over, determine winner
            await this.determineWinner();
            return;
        }

        // Check if betting round is complete (Requirement 3.5)
        // All active players must have acted and all bets must be matched
        const bettingRoundComplete = this.isBettingRoundComplete();

        if (bettingRoundComplete) {
            // Advance to next street
            await this.advanceToNextStreet();
            return;
        }

        // Find next active (non-folded) player clockwise (Requirement 2.1)
        const playerPositions = Array.from(this.gameState.players.values())
            .filter(p => p.isActive && !p.isFolded)
            .map(p => p.position)
            .sort((a, b) => a - b);

        if (playerPositions.length === 0) {
            // No active players, shouldn't happen but handle gracefully
            return;
        }

        // Find next position after current
        let nextPosition = this.gameState.currentPlayerPosition;
        let found = false;

        // Look for next player clockwise
        for (let i = 0; i < playerPositions.length; i++) {
            if (playerPositions[i] > this.gameState.currentPlayerPosition) {
                nextPosition = playerPositions[i];
                found = true;
                break;
            }
        }

        // If no player found after current position, wrap around to first player
        if (!found) {
            nextPosition = playerPositions[0];
        }

        // Update current player position
        this.gameState.currentPlayerPosition = nextPosition;

        // Start new turn timer for next player (Requirement 3.4)
        this.startTurnTimer();
    }

    /**
     * Check if the current betting round is complete
     * A betting round is complete when all active players have acted and all bets are matched
     * Requirements: 3.5
     */
    private isBettingRoundComplete(): boolean {
        const activePlayers = this.getActivePlayers();

        // Need at least one active player
        if (activePlayers.length === 0) {
            return true;
        }

        // Check if all active players with chips have acted
        for (const player of activePlayers) {
            // Players with chips who haven't acted mean round isn't complete
            if (player.stack > 0 && !player.hasActed) {
                return false;
            }

            // Players with chips who haven't matched the current bet mean round isn't complete
            // (unless they're all-in)
            if (player.stack > 0 && player.currentBet < this.gameState.currentBet) {
                return false;
            }
        }

        return true;
    }

    /**
     * Advance to the next street
     * Requirements: 1.3, 5.2, 5.3, 5.4, 5.5, 5.6, 10.3
     */
    async advanceToNextStreet(): Promise<void> {
        // Stop any active timer
        this.stopTurnTimer();

        // Determine next street (Requirement 5.2)
        let nextStreet: 'preflop' | 'flop' | 'turn' | 'river' | null = null;
        let cardsToDeal = 0;

        switch (this.gameState.currentStreet) {
            case 'preflop':
                nextStreet = 'flop';
                cardsToDeal = 3; // Requirement 1.3, 5.3: Deal 3 cards for flop
                break;
            case 'flop':
                nextStreet = 'turn';
                cardsToDeal = 1; // Requirement 1.3, 5.4: Deal 1 card for turn
                break;
            case 'turn':
                nextStreet = 'river';
                cardsToDeal = 1; // Requirement 1.3, 5.5: Deal 1 card for river
                break;
            case 'river':
                // Requirement 5.6: After river, proceed to showdown
                await this.determineWinner();
                return;
        }

        if (!nextStreet) {
            throw new Error('Invalid street progression');
        }

        // Deal appropriate number of community cards (Requirement 1.3)
        const newCards = CardManager.dealCards(this.gameState.deck, cardsToDeal);
        this.gameState.boardCards.push(...newCards);

        // Update current street in game state
        this.gameState.currentStreet = nextStreet;

        // Reset player betting state for new street (Requirement 5.2)
        for (const player of this.gameState.players.values()) {
            if (player.isActive && !player.isFolded) {
                player.hasActed = false;
                player.currentBet = 0;
            }
        }

        // Reset current bet for new street
        this.gameState.currentBet = 0;

        // Persist board_cards to database (Requirement 10.3)
        const boardCardsString = this.gameState.boardCards
            .map(card => CardManager.cardToString(card))
            .join(' ');

        await query(
            `UPDATE hands 
            SET board_cards = $1, current_street = $2, pot_size = $3
            WHERE id = $4`,
            [
                boardCardsString,
                this.gameState.currentStreet,
                this.gameState.pot,
                this.gameState.handId,
            ]
        );

        // Emit 'game:street:advanced' event with new board cards (Requirement 5.2)
        this.io.to(`room:${this.gameState.roomId}`).emit('game:street:advanced', {
            street: this.gameState.currentStreet,
            boardCards: this.gameState.boardCards,
            pot: this.gameState.pot,
        });

        // Set first player to act (player after dealer button)
        const activePlayers = this.getActivePlayers();
        if (activePlayers.length === 0) {
            // No active players, shouldn't happen but handle gracefully
            await this.determineWinner();
            return;
        }

        // Find first active player after dealer button
        const playerPositions = activePlayers
            .map(p => p.position)
            .sort((a, b) => a - b);

        let firstPlayerPosition = playerPositions[0];
        for (const position of playerPositions) {
            if (position > this.gameState.dealerPosition) {
                firstPlayerPosition = position;
                break;
            }
        }

        this.gameState.currentPlayerPosition = firstPlayerPosition;

        // Start turn timer for first player
        this.startTurnTimer();
    }

    /**
     * Determine winner at showdown
     * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 10.4, 10.5
     */
    async determineWinner(): Promise<void> {
        // Stop any active timer
        this.stopTurnTimer();

        // Get all active (non-folded) players
        const activePlayers = this.getActivePlayers();

        if (activePlayers.length === 0) {
            // No active players, shouldn't happen but handle gracefully
            console.error('No active players at showdown');
            this.gameState.isHandActive = false;
            return;
        }

        // If only one player remains (everyone else folded), they win by default
        if (activePlayers.length === 1) {
            const winner = activePlayers[0];

            // Award entire pot to winner (Requirement 6.3)
            winner.stack += this.gameState.pot;

            // Persist winner information to database (Requirement 6.5, 10.4)
            await query(
                `INSERT INTO winners (hand_id, user_id, amount_won, hand_rank)
                VALUES ($1, $2, $3, $4)`,
                [
                    this.gameState.handId,
                    winner.userId,
                    this.gameState.pot,
                    'Win by fold' // No hand evaluation needed
                ]
            );

            // Update hand record with is_completed = true (Requirement 10.5)
            await query(
                `UPDATE hands SET is_completed = true WHERE id = $1`,
                [this.gameState.handId]
            );

            // Emit 'game:winner:determined' event (Requirement 6.5)
            this.io.to(`room:${this.gameState.roomId}`).emit('game:winner:determined', {
                winners: [{
                    userId: winner.userId,
                    username: winner.username,
                    amountWon: this.gameState.pot,
                    handRank: 'Win by fold',
                    stack: winner.stack
                }],
                pot: this.gameState.pot
            });

            this.gameState.isHandActive = false;

            // Perform post-hand cleanup and prepare for next hand
            await this.prepareNextHand();
            return;
        }

        // Multiple players remain - evaluate hands at showdown
        // Requirement 6.1: Evaluate each active player's hand using HandEvaluator
        const HandEvaluator = require('./HandEvaluator').HandEvaluator;
        const PotManager = require('./PotManager').PotManager;

        // Find winner(s) using findWinners() (Requirement 6.2)
        const winnerIds = HandEvaluator.findWinners(activePlayers, this.gameState.boardCards);

        if (winnerIds.length === 0) {
            console.error('No winners determined at showdown');
            this.gameState.isHandActive = false;
            return;
        }

        // Calculate side pots if needed (Requirement 4.5)
        const sidePots = PotManager.calculateSidePots(Array.from(this.gameState.players.values()));

        if (sidePots.length > 0) {
            // Distribute side pots to winner(s) (Requirement 6.3, 6.4)
            PotManager.distributeSidePots(sidePots, winnerIds, this.gameState.players);
        } else {
            // Simple pot distribution - no side pots
            // Requirement 6.3: Award pot to winner
            // Requirement 6.4: Split pot equally among tied players
            PotManager.distributePot(this.gameState.pot, winnerIds, this.gameState.players);
        }

        // Prepare winner information for database and event
        const winnerInfos = [];

        for (const winnerId of winnerIds) {
            const winner = this.gameState.players.get(winnerId);
            if (!winner || !winner.holeCards) {
                continue;
            }

            // Evaluate winner's hand to get hand rank name
            const handRank = HandEvaluator.evaluateHand(winner.holeCards, this.gameState.boardCards);

            // Calculate amount won (pot split equally among winners)
            const amountWon = Math.floor(this.gameState.pot / winnerIds.length);

            // Persist winner information to database (Requirement 10.4)
            await query(
                `INSERT INTO winners (hand_id, user_id, amount_won, hand_rank)
                VALUES ($1, $2, $3, $4)`,
                [
                    this.gameState.handId,
                    winnerId,
                    amountWon,
                    handRank.name
                ]
            );

            winnerInfos.push({
                userId: winnerId,
                username: winner.username,
                amountWon,
                handRank: handRank.name,
                holeCards: winner.holeCards,
                stack: winner.stack
            });
        }

        // Update hand record with is_completed = true (Requirement 10.5)
        await query(
            `UPDATE hands SET is_completed = true WHERE id = $1`,
            [this.gameState.handId]
        );

        // Emit 'game:winner:determined' event with winner info (Requirement 6.5)
        this.io.to(`room:${this.gameState.roomId}`).emit('game:winner:determined', {
            winners: winnerInfos,
            pot: this.gameState.pot,
            boardCards: this.gameState.boardCards
        });

        this.gameState.isHandActive = false;

        // Perform post-hand cleanup and prepare for next hand
        await this.prepareNextHand();
    }

    /**
     * Post-hand cleanup and next hand preparation
     * Requirements: 7.2, 7.3, 7.4, 8.2, 8.3, 8.4, 8.5
     */
    async prepareNextHand(): Promise<void> {
        // Check for eliminated players (stack = 0) (Requirement 7.3)
        const eliminatedPlayers: PlayerState[] = [];
        for (const player of this.gameState.players.values()) {
            if (player.stack === 0) {
                player.isActive = false; // Mark as eliminated
                eliminatedPlayers.push(player);
            }
        }

        // Emit player stack updates to all players (Requirement 7.4)
        const stackUpdates = Array.from(this.gameState.players.values()).map(player => ({
            userId: player.userId,
            username: player.username,
            stack: player.stack,
            isActive: player.isActive
        }));

        this.io.to(`room:${this.gameState.roomId}`).emit('game:stacks:updated', {
            players: stackUpdates,
            eliminatedPlayers: eliminatedPlayers.map(p => ({
                userId: p.userId,
                username: p.username
            }))
        });

        // Count remaining active players
        const activePlayers = Array.from(this.gameState.players.values()).filter(p => p.isActive);

        // Check if game should continue (Requirement 8.5: 2+ players remain)
        if (activePlayers.length < 2) {
            // Game is over - only 0 or 1 player remains
            this.io.to(`room:${this.gameState.roomId}`).emit('game:ended', {
                winner: activePlayers.length === 1 ? {
                    userId: activePlayers[0].userId,
                    username: activePlayers[0].username,
                    stack: activePlayers[0].stack
                } : null
            });
            return;
        }

        // Rotate dealer button clockwise (Requirement 8.2)
        const activePositions = activePlayers
            .map(p => p.position)
            .sort((a, b) => a - b);

        // Find next active player position after current dealer
        let nextDealerPosition = this.gameState.dealerPosition;
        let found = false;

        for (const position of activePositions) {
            if (position > this.gameState.dealerPosition) {
                nextDealerPosition = position;
                found = true;
                break;
            }
        }

        // If no player found after current dealer, wrap around to first active player
        if (!found) {
            nextDealerPosition = activePositions[0];
        }

        this.gameState.dealerPosition = nextDealerPosition;

        // Calculate new blind positions (Requirements 8.3, 8.4)
        // Small blind is clockwise from dealer
        const dealerIndex = activePositions.indexOf(this.gameState.dealerPosition);
        const smallBlindIndex = (dealerIndex + 1) % activePositions.length;
        const bigBlindIndex = (dealerIndex + 2) % activePositions.length;

        this.gameState.smallBlindPosition = activePositions[smallBlindIndex];
        this.gameState.bigBlindPosition = activePositions[bigBlindIndex];

        // Emit dealer and blind position updates
        this.io.to(`room:${this.gameState.roomId}`).emit('game:positions:updated', {
            dealerPosition: this.gameState.dealerPosition,
            smallBlindPosition: this.gameState.smallBlindPosition,
            bigBlindPosition: this.gameState.bigBlindPosition
        });

        // Start next hand (Requirement 8.5)
        // Add a small delay before starting next hand to allow players to review results
        setTimeout(async () => {
            try {
                await this.startHand();
            } catch (error) {
                console.error('Error starting next hand:', error);
                this.io.to(`room:${this.gameState.roomId}`).emit('game:error', {
                    message: 'Error starting next hand'
                });
            }
        }, 5000); // 5 second delay
    }
}
