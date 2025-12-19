// Texas Hold'em Poker Game Engine
export interface Card {
    rank: string;
    suit: string;
    value: number; // For comparison (2=2, 3=3, ..., J=11, Q=12, K=13, A=14)
}

export interface Player {
    id: string;
    name: string;
    chips: number;
    cards: Card[];
    currentBet: number;
    folded: boolean;
    allIn: boolean;
    position: number;
}

export interface GameState {
    id: string;
    players: Player[];
    communityCards: Card[];
    pot: number;
    currentBet: number;
    currentPlayerIndex: number;
    dealerIndex: number;
    smallBlindIndex: number;
    bigBlindIndex: number;
    phase: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'ended';
    deck: Card[];
    winners: { playerId: string; amount: number; hand: string }[];
    smallBlind: number;
    bigBlind: number;
}

export class PokerGame {
    private gameState: GameState;

    constructor(gameId: string, playerNames: string[], smallBlind: number = 25, bigBlind: number = 50) {
        this.gameState = {
            id: gameId,
            players: playerNames.map((name, index) => ({
                id: `player_${index}`,
                name,
                chips: 1500, // Starting chips
                cards: [],
                currentBet: 0,
                folded: false,
                allIn: false,
                position: index
            })),
            communityCards: [],
            pot: 0,
            currentBet: 0,
            currentPlayerIndex: 0,
            dealerIndex: 0,
            smallBlindIndex: 1,
            bigBlindIndex: 2,
            phase: 'preflop',
            deck: [],
            winners: [],
            smallBlind,
            bigBlind
        };

        this.initializeDeck();
        this.startNewHand();
    }

    private initializeDeck(): void {
        const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
        const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        const values = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

        this.gameState.deck = [];
        for (const suit of suits) {
            for (let i = 0; i < ranks.length; i++) {
                this.gameState.deck.push({
                    rank: ranks[i],
                    suit,
                    value: values[i]
                });
            }
        }
    }

    private shuffleDeck(): void {
        for (let i = this.gameState.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.gameState.deck[i], this.gameState.deck[j]] = [this.gameState.deck[j], this.gameState.deck[i]];
        }
    }

    private dealCard(): Card {
        const card = this.gameState.deck.pop();
        if (!card) throw new Error('No more cards in deck');
        return card;
    }

    public startNewHand(): void {
        // Reset for new hand
        this.initializeDeck();
        this.shuffleDeck();

        this.gameState.communityCards = [];
        this.gameState.pot = 0;
        this.gameState.currentBet = 0;
        this.gameState.phase = 'preflop';
        this.gameState.winners = [];

        // Reset players
        this.gameState.players.forEach(player => {
            player.cards = [];
            player.currentBet = 0;
            player.folded = false;
            player.allIn = false;
        });

        // Deal hole cards
        for (let i = 0; i < 2; i++) {
            for (const player of this.gameState.players) {
                if (!player.folded) {
                    player.cards.push(this.dealCard());
                }
            }
        }

        // Post blinds
        this.postBlinds();

        // Set current player to left of big blind
        this.gameState.currentPlayerIndex = (this.gameState.bigBlindIndex + 1) % this.gameState.players.length;
    }

    private postBlinds(): void {
        const smallBlindPlayer = this.gameState.players[this.gameState.smallBlindIndex];
        const bigBlindPlayer = this.gameState.players[this.gameState.bigBlindIndex];

        // Small blind
        const smallBlindAmount = Math.min(this.gameState.smallBlind, smallBlindPlayer.chips);
        smallBlindPlayer.chips -= smallBlindAmount;
        smallBlindPlayer.currentBet = smallBlindAmount;
        this.gameState.pot += smallBlindAmount;

        // Big blind
        const bigBlindAmount = Math.min(this.gameState.bigBlind, bigBlindPlayer.chips);
        bigBlindPlayer.chips -= bigBlindAmount;
        bigBlindPlayer.currentBet = bigBlindAmount;
        this.gameState.pot += bigBlindAmount;
        this.gameState.currentBet = bigBlindAmount;

        // Check for all-in
        if (smallBlindPlayer.chips === 0) smallBlindPlayer.allIn = true;
        if (bigBlindPlayer.chips === 0) bigBlindPlayer.allIn = true;
    }

    public fold(playerId: string): boolean {
        const player = this.gameState.players.find(p => p.id === playerId);
        if (!player || player.folded) return false;

        player.folded = true;
        this.nextPlayer();

        if (this.getActivePlayers().length === 1) {
            this.endHand();
        } else if (this.isRoundComplete()) {
            this.nextPhase();
        }

        return true;
    }

    public call(playerId: string): boolean {
        const player = this.gameState.players.find(p => p.id === playerId);
        if (!player || player.folded) return false;

        const callAmount = this.gameState.currentBet - player.currentBet;
        const actualAmount = Math.min(callAmount, player.chips);

        player.chips -= actualAmount;
        player.currentBet += actualAmount;
        this.gameState.pot += actualAmount;

        if (player.chips === 0) player.allIn = true;

        this.nextPlayer();

        if (this.isRoundComplete()) {
            this.nextPhase();
        }

        return true;
    }

    public raise(playerId: string, amount: number): boolean {
        const player = this.gameState.players.find(p => p.id === playerId);
        if (!player || player.folded) return false;

        const totalBet = this.gameState.currentBet + amount;
        const actualAmount = Math.min(totalBet - player.currentBet, player.chips);

        player.chips -= actualAmount;
        player.currentBet += actualAmount;
        this.gameState.pot += actualAmount;
        this.gameState.currentBet = player.currentBet;

        if (player.chips === 0) player.allIn = true;

        this.nextPlayer();

        if (this.isRoundComplete()) {
            this.nextPhase();
        }

        return true;
    }

    public check(playerId: string): boolean {
        const player = this.gameState.players.find(p => p.id === playerId);
        if (!player || player.folded || player.currentBet < this.gameState.currentBet) return false;

        this.nextPlayer();

        if (this.isRoundComplete()) {
            this.nextPhase();
        }

        return true;
    }

    private nextPlayer(): void {
        do {
            this.gameState.currentPlayerIndex = (this.gameState.currentPlayerIndex + 1) % this.gameState.players.length;
        } while (this.gameState.players[this.gameState.currentPlayerIndex].folded ||
            this.gameState.players[this.gameState.currentPlayerIndex].allIn);
    }

    private isRoundComplete(): boolean {
        const activePlayers = this.getActivePlayers();
        return activePlayers.every(player =>
            player.currentBet === this.gameState.currentBet || player.allIn
        );
    }

    private nextPhase(): void {
        // Reset current bets for next round
        this.gameState.players.forEach(player => {
            player.currentBet = 0;
        });
        this.gameState.currentBet = 0;

        switch (this.gameState.phase) {
            case 'preflop':
                this.gameState.phase = 'flop';
                this.dealFlop();
                break;
            case 'flop':
                this.gameState.phase = 'turn';
                this.dealTurn();
                break;
            case 'turn':
                this.gameState.phase = 'river';
                this.dealRiver();
                break;
            case 'river':
                this.gameState.phase = 'showdown';
                this.showdown();
                break;
        }

        // Set current player to left of dealer
        this.gameState.currentPlayerIndex = (this.gameState.dealerIndex + 1) % this.gameState.players.length;
        while (this.gameState.players[this.gameState.currentPlayerIndex].folded ||
            this.gameState.players[this.gameState.currentPlayerIndex].allIn) {
            this.gameState.currentPlayerIndex = (this.gameState.currentPlayerIndex + 1) % this.gameState.players.length;
        }
    }

    private dealFlop(): void {
        // Burn one card
        this.dealCard();
        // Deal 3 community cards
        for (let i = 0; i < 3; i++) {
            this.gameState.communityCards.push(this.dealCard());
        }
    }

    private dealTurn(): void {
        // Burn one card
        this.dealCard();
        // Deal 1 community card
        this.gameState.communityCards.push(this.dealCard());
    }

    private dealRiver(): void {
        // Burn one card
        this.dealCard();
        // Deal 1 community card
        this.gameState.communityCards.push(this.dealCard());
    }

    private showdown(): void {
        const activePlayers = this.getActivePlayers();
        const playerHands = activePlayers.map(player => ({
            player,
            hand: this.evaluateHand(player.cards.concat(this.gameState.communityCards)),
            handName: this.getHandName(this.evaluateHand(player.cards.concat(this.gameState.communityCards)))
        }));

        // Sort by hand strength (higher is better)
        playerHands.sort((a, b) => b.hand.strength - a.hand.strength);

        // Determine winners (players with the same hand strength)
        const winningStrength = playerHands[0].hand.strength;
        const winners = playerHands.filter(ph => ph.hand.strength === winningStrength);

        // Distribute pot
        const winAmount = Math.floor(this.gameState.pot / winners.length);
        this.gameState.winners = winners.map(winner => ({
            playerId: winner.player.id,
            amount: winAmount,
            hand: winner.handName
        }));

        winners.forEach(winner => {
            winner.player.chips += winAmount;
        });

        this.gameState.phase = 'ended';
    }

    private endHand(): void {
        const winner = this.getActivePlayers()[0];
        winner.chips += this.gameState.pot;
        this.gameState.winners = [{
            playerId: winner.id,
            amount: this.gameState.pot,
            hand: 'Won by fold'
        }];
        this.gameState.phase = 'ended';
    }

    private getActivePlayers(): Player[] {
        return this.gameState.players.filter(player => !player.folded);
    }

    private evaluateHand(cards: Card[]): { strength: number; kickers: number[] } {
        // This is a simplified hand evaluation
        // In a real implementation, you'd want a more sophisticated algorithm
        const sortedCards = cards.sort((a, b) => b.value - a.value);

        // Check for flush
        const suits = cards.reduce((acc, card) => {
            acc[card.suit] = (acc[card.suit] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        const isFlush = Object.values(suits).some(count => count >= 5);

        // Check for straight
        const values = [...new Set(cards.map(card => card.value))].sort((a, b) => b - a);
        let isStraight = false;
        for (let i = 0; i <= values.length - 5; i++) {
            if (values[i] - values[i + 4] === 4) {
                isStraight = true;
                break;
            }
        }

        // Count ranks
        const rankCounts = cards.reduce((acc, card) => {
            acc[card.value] = (acc[card.value] || 0) + 1;
            return acc;
        }, {} as Record<number, number>);

        const counts = Object.values(rankCounts).sort((a, b) => b - a);
        const ranks = Object.keys(rankCounts).map(Number).sort((a, b) => b - a);

        // Determine hand strength
        if (isStraight && isFlush) return { strength: 8, kickers: [values[0]] }; // Straight flush
        if (counts[0] === 4) return { strength: 7, kickers: ranks }; // Four of a kind
        if (counts[0] === 3 && counts[1] === 2) return { strength: 6, kickers: ranks }; // Full house
        if (isFlush) return { strength: 5, kickers: ranks }; // Flush
        if (isStraight) return { strength: 4, kickers: [values[0]] }; // Straight
        if (counts[0] === 3) return { strength: 3, kickers: ranks }; // Three of a kind
        if (counts[0] === 2 && counts[1] === 2) return { strength: 2, kickers: ranks }; // Two pair
        if (counts[0] === 2) return { strength: 1, kickers: ranks }; // One pair
        return { strength: 0, kickers: ranks }; // High card
    }

    private getHandName(hand: { strength: number; kickers: number[] }): string {
        const handNames = [
            'High Card', 'One Pair', 'Two Pair', 'Three of a Kind',
            'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'
        ];
        return handNames[hand.strength];
    }

    public getGameState(): GameState {
        return { ...this.gameState };
    }

    public getCurrentPlayer(): Player | null {
        return this.gameState.players[this.gameState.currentPlayerIndex] || null;
    }

    public canPlayerAct(playerId: string): boolean {
        const currentPlayer = this.getCurrentPlayer();
        return currentPlayer?.id === playerId && !currentPlayer.folded && !currentPlayer.allIn;
    }
}