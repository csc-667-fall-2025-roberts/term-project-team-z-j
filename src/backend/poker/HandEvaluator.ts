import { Card, HandRank, PlayerState } from './types.js';

/**
 * HandEvaluator evaluates poker hands and determines winners
 */
export class HandEvaluator {
    // Hand rank constants
    static readonly HIGH_CARD = 0;
    static readonly PAIR = 1;
    static readonly TWO_PAIR = 2;
    static readonly THREE_OF_A_KIND = 3;
    static readonly STRAIGHT = 4;
    static readonly FLUSH = 5;
    static readonly FULL_HOUSE = 6;
    static readonly FOUR_OF_A_KIND = 7;
    static readonly STRAIGHT_FLUSH = 8;

    // Rank values for comparison (2=2, 3=3, ..., T=10, J=11, Q=12, K=13, A=14)
    private static rankValue(rank: Card['rank']): number {
        const values: Record<Card['rank'], number> = {
            '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
            'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
        };
        return values[rank];
    }

    /**
     * Evaluates the best 5-card poker hand from 7 cards (2 hole + 5 board)
     */
    static evaluateHand(holeCards: [Card, Card], boardCards: Card[]): HandRank {
        const allCards = [...holeCards, ...boardCards];

        if (allCards.length !== 7) {
            throw new Error(`Expected 7 cards, got ${allCards.length}`);
        }

        // Generate all 21 possible 5-card combinations
        const combinations = this.getCombinations(allCards, 5);

        // Evaluate each combination and return the best
        let bestHand: HandRank | null = null;

        for (const combo of combinations) {
            const hand = this.evaluate5CardHand(combo);
            if (!bestHand || this.compareHands(hand, bestHand) > 0) {
                bestHand = hand;
            }
        }

        return bestHand!;
    }

    /**
     * Evaluates a specific 5-card hand
     */
    private static evaluate5CardHand(cards: Card[]): HandRank {
        if (cards.length !== 5) {
            throw new Error(`Expected 5 cards, got ${cards.length}`);
        }

        const isFlush = this.isFlush(cards);
        const straightValue = this.getStraightValue(cards);
        const rankCounts = this.getRankCounts(cards);

        // Straight Flush
        if (isFlush && straightValue > 0) {
            return {
                rank: this.STRAIGHT_FLUSH,
                name: 'Straight Flush',
                tiebreakers: [straightValue]
            };
        }

        // Four of a Kind
        if (rankCounts.some(c => c.count === 4)) {
            const fourKind = rankCounts.find(c => c.count === 4)!;
            const kicker = rankCounts.find(c => c.count === 1)!;
            return {
                rank: this.FOUR_OF_A_KIND,
                name: 'Four of a Kind',
                tiebreakers: [fourKind.value, kicker.value]
            };
        }

        // Full House
        if (rankCounts.some(c => c.count === 3) && rankCounts.some(c => c.count === 2)) {
            const threeKind = rankCounts.find(c => c.count === 3)!;
            const pair = rankCounts.find(c => c.count === 2)!;
            return {
                rank: this.FULL_HOUSE,
                name: 'Full House',
                tiebreakers: [threeKind.value, pair.value]
            };
        }

        // Flush
        if (isFlush) {
            const values = cards.map(c => this.rankValue(c.rank)).sort((a, b) => b - a);
            return {
                rank: this.FLUSH,
                name: 'Flush',
                tiebreakers: values
            };
        }

        // Straight
        if (straightValue > 0) {
            return {
                rank: this.STRAIGHT,
                name: 'Straight',
                tiebreakers: [straightValue]
            };
        }

        // Three of a Kind
        if (rankCounts.some(c => c.count === 3)) {
            const threeKind = rankCounts.find(c => c.count === 3)!;
            const kickers = rankCounts.filter(c => c.count === 1).map(c => c.value).sort((a, b) => b - a);
            return {
                rank: this.THREE_OF_A_KIND,
                name: 'Three of a Kind',
                tiebreakers: [threeKind.value, ...kickers]
            };
        }

        // Two Pair
        const pairs = rankCounts.filter(c => c.count === 2);
        if (pairs.length === 2) {
            const sortedPairs = pairs.sort((a, b) => b.value - a.value);
            const kicker = rankCounts.find(c => c.count === 1)!;
            return {
                rank: this.TWO_PAIR,
                name: 'Two Pair',
                tiebreakers: [sortedPairs[0].value, sortedPairs[1].value, kicker.value]
            };
        }

        // Pair
        if (pairs.length === 1) {
            const pair = pairs[0];
            const kickers = rankCounts.filter(c => c.count === 1).map(c => c.value).sort((a, b) => b - a);
            return {
                rank: this.PAIR,
                name: 'Pair',
                tiebreakers: [pair.value, ...kickers]
            };
        }

        // High Card
        const values = cards.map(c => this.rankValue(c.rank)).sort((a, b) => b - a);
        return {
            rank: this.HIGH_CARD,
            name: 'High Card',
            tiebreakers: values
        };
    }

    /**
     * Compares two HandRank objects
     * Returns: 1 if hand1 > hand2, -1 if hand1 < hand2, 0 if equal
     */
    static compareHands(hand1: HandRank, hand2: HandRank): number {
        // Compare rank first
        if (hand1.rank > hand2.rank) return 1;
        if (hand1.rank < hand2.rank) return -1;

        // Same rank, compare tiebreakers
        for (let i = 0; i < Math.max(hand1.tiebreakers.length, hand2.tiebreakers.length); i++) {
            const val1 = hand1.tiebreakers[i] || 0;
            const val2 = hand2.tiebreakers[i] || 0;

            if (val1 > val2) return 1;
            if (val1 < val2) return -1;
        }

        return 0; // Exact tie
    }

    /**
     * Determines winner(s) from multiple players
     * Returns array of userIds of winning players
     */
    static findWinners(players: PlayerState[], boardCards: Card[]): number[] {
        const activePlayers = players.filter(p => !p.isFolded && p.holeCards);

        if (activePlayers.length === 0) {
            return [];
        }

        if (activePlayers.length === 1) {
            return [activePlayers[0].userId];
        }

        // Evaluate all hands
        const evaluatedHands = activePlayers.map(player => ({
            userId: player.userId,
            hand: this.evaluateHand(player.holeCards!, boardCards)
        }));

        // Find the best hand
        let bestHand = evaluatedHands[0].hand;
        for (let i = 1; i < evaluatedHands.length; i++) {
            if (this.compareHands(evaluatedHands[i].hand, bestHand) > 0) {
                bestHand = evaluatedHands[i].hand;
            }
        }

        // Find all players with the best hand (handles ties)
        const winners = evaluatedHands
            .filter(eh => this.compareHands(eh.hand, bestHand) === 0)
            .map(eh => eh.userId);

        return winners;
    }

    // Helper methods

    private static isFlush(cards: Card[]): boolean {
        const suit = cards[0].suit;
        return cards.every(c => c.suit === suit);
    }

    private static getStraightValue(cards: Card[]): number {
        const values = cards.map(c => this.rankValue(c.rank)).sort((a, b) => a - b);

        // Check for regular straight
        let isStraight = true;
        for (let i = 1; i < values.length; i++) {
            if (values[i] !== values[i - 1] + 1) {
                isStraight = false;
                break;
            }
        }

        if (isStraight) {
            return values[4]; // Return highest card value
        }

        // Check for ace-low straight (A-2-3-4-5, also called wheel)
        const hasAce = values.includes(14);
        const hasTwo = values.includes(2);
        const hasThree = values.includes(3);
        const hasFour = values.includes(4);
        const hasFive = values.includes(5);

        if (hasAce && hasTwo && hasThree && hasFour && hasFive) {
            return 5; // In ace-low straight, the high card is 5
        }

        return 0; // Not a straight
    }

    private static getRankCounts(cards: Card[]): Array<{ value: number; count: number }> {
        const counts = new Map<number, number>();

        for (const card of cards) {
            const value = this.rankValue(card.rank);
            counts.set(value, (counts.get(value) || 0) + 1);
        }

        return Array.from(counts.entries())
            .map(([value, count]) => ({ value, count }))
            .sort((a, b) => {
                // Sort by count descending, then by value descending
                if (b.count !== a.count) return b.count - a.count;
                return b.value - a.value;
            });
    }

    private static getCombinations<T>(arr: T[], k: number): T[][] {
        if (k === 0) return [[]];
        if (arr.length === 0) return [];

        const [first, ...rest] = arr;
        const withFirst = this.getCombinations(rest, k - 1).map(combo => [first, ...combo]);
        const withoutFirst = this.getCombinations(rest, k);

        return [...withFirst, ...withoutFirst];
    }
}
