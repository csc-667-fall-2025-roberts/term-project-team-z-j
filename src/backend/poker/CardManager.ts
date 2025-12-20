import crypto from 'crypto';
import { Card } from './types';

/**
 * CardManager handles card representation, deck management, and dealing
 */
export class CardManager {
    /**
     * Creates a standard 52-card deck
     */
    static createDeck(): Card[] {
        const ranks: Card['rank'][] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
        const suits: Card['suit'][] = ['h', 'd', 'c', 's'];
        const deck: Card[] = [];

        for (const suit of suits) {
            for (const rank of ranks) {
                deck.push({ rank, suit });
            }
        }

        return deck;
    }

    /**
     * Shuffles a deck using Fisher-Yates algorithm with cryptographically secure random numbers
     */
    static shuffleDeck(deck: Card[]): Card[] {
        const shuffled = [...deck];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = crypto.randomInt(0, i + 1);
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    /**
     * Converts a Card object to string representation (e.g., "Ah" for Ace of hearts)
     */
    static cardToString(card: Card): string {
        return `${card.rank}${card.suit}`;
    }

    /**
     * Converts a string representation to a Card object
     */
    static stringToCard(str: string): Card {
        if (str.length !== 2) {
            throw new Error(`Invalid card string: ${str}`);
        }

        const rank = str[0] as Card['rank'];
        const suit = str[1] as Card['suit'];

        const validRanks: Card['rank'][] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
        const validSuits: Card['suit'][] = ['h', 'd', 'c', 's'];

        if (!validRanks.includes(rank) || !validSuits.includes(suit)) {
            throw new Error(`Invalid card string: ${str}`);
        }

        return { rank, suit };
    }

    /**
     * Deals (removes and returns) a specified number of cards from the deck
     */
    static dealCards(deck: Card[], count: number): Card[] {
        if (count > deck.length) {
            throw new Error(`Cannot deal ${count} cards from deck with ${deck.length} cards`);
        }

        return deck.splice(0, count);
    }
}
