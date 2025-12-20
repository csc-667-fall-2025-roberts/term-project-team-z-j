/**
 * Poker game type definitions
 */

export interface Card {
    rank: '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
    suit: 'h' | 'd' | 'c' | 's'; // hearts, diamonds, clubs, spades
}

export interface HandRank {
    rank: number; // 0-8 (high card to straight flush)
    name: string; // "High Card", "Pair", "Two Pair", etc.
    tiebreakers: number[]; // For comparing hands of same rank
}

export interface PlayerState {
    userId: number;
    username: string;
    position: number;
    stack: number;
    currentBet: number;
    holeCards: [Card, Card] | null;
    isActive: boolean;
    isFolded: boolean;
    hasActed: boolean;
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river';
export type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'allin';
