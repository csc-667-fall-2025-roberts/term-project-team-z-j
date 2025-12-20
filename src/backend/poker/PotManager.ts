/**
 * PotManager - Handles pot calculations, side pots, and chip distribution
 */

import { PlayerState } from './types.js';

export interface PotInfo {
    amount: number;
    eligiblePlayers: number[]; // userIds
}

export class PotManager {
    /**
     * Calculate the total pot from all player bets
     * Requirements: 4.1, 4.2
     */
    static calculatePot(players: PlayerState[]): number {
        return players.reduce((total, player) => total + player.currentBet, 0);
    }

    /**
     * Calculate side pots for all-in scenarios with different amounts
     * Requirements: 4.5
     * 
     * Algorithm:
     * 1. Sort players by their bet amount (ascending)
     * 2. For each unique bet level, create a pot that includes all players who bet at least that amount
     * 3. Each pot contains the difference between current level and previous level, multiplied by eligible players
     */
    static calculateSidePots(players: PlayerState[]): PotInfo[] {
        // Filter out players who haven't bet anything
        const bettingPlayers = players.filter(p => p.currentBet > 0);

        if (bettingPlayers.length === 0) {
            return [];
        }

        // Sort players by bet amount (ascending)
        const sortedPlayers = [...bettingPlayers].sort((a, b) => a.currentBet - b.currentBet);

        const pots: PotInfo[] = [];
        let previousBetLevel = 0;

        // Get unique bet levels
        const betLevels = [...new Set(sortedPlayers.map(p => p.currentBet))].sort((a, b) => a - b);

        for (const betLevel of betLevels) {
            // Find all players who bet at least this amount and haven't folded
            const eligiblePlayers = players
                .filter(p => p.currentBet >= betLevel && !p.isFolded)
                .map(p => p.userId);

            if (eligiblePlayers.length === 0) {
                continue;
            }

            // Calculate pot amount for this level
            // Each eligible player contributes (betLevel - previousBetLevel)
            const contributionPerPlayer = betLevel - previousBetLevel;
            const playersAtThisLevel = players.filter(p => p.currentBet >= betLevel).length;
            const potAmount = contributionPerPlayer * playersAtThisLevel;

            if (potAmount > 0) {
                pots.push({
                    amount: potAmount,
                    eligiblePlayers
                });
            }

            previousBetLevel = betLevel;
        }

        return pots;
    }

    /**
     * Distribute pot to winner(s) and update their stacks
     * Requirements: 6.3, 6.4
     * 
     * @param pot - Total pot amount to distribute
     * @param winners - Array of winner userIds
     * @param players - Map of userId to PlayerState
     */
    static distributePot(
        pot: number,
        winners: number[],
        players: Map<number, PlayerState>
    ): void {
        if (winners.length === 0) {
            throw new Error('Cannot distribute pot: no winners specified');
        }

        // Calculate amount per winner (handle pot splitting)
        const amountPerWinner = Math.floor(pot / winners.length);
        const remainder = pot % winners.length;

        // Distribute pot to each winner
        winners.forEach((userId, index) => {
            const player = players.get(userId);
            if (!player) {
                throw new Error(`Cannot distribute pot: player ${userId} not found`);
            }

            // First winner gets any remainder from rounding
            const winnings = index === 0 ? amountPerWinner + remainder : amountPerWinner;
            player.stack += winnings;
        });
    }

    /**
     * Distribute side pots to winners
     * Requirements: 4.5, 6.3, 6.4
     * 
     * @param sidePots - Array of side pots with eligible players
     * @param winners - Array of winner userIds (in order of hand strength)
     * @param players - Map of userId to PlayerState
     */
    static distributeSidePots(
        sidePots: PotInfo[],
        winners: number[],
        players: Map<number, PlayerState>
    ): void {
        for (const pot of sidePots) {
            // Find which winners are eligible for this pot
            const eligibleWinners = winners.filter(winnerId =>
                pot.eligiblePlayers.includes(winnerId)
            );

            if (eligibleWinners.length > 0) {
                // Distribute this pot among eligible winners
                this.distributePot(pot.amount, eligibleWinners, players);
            }
        }
    }
}
