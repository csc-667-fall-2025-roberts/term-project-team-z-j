# Poker Game Logic Design Document

## Overview

This design document outlines the implementation of core Texas Hold'em poker game functionality for a multiplayer web application. The system will manage game state, card dealing, player actions, betting rounds, pot calculation, and winner determination using WebSockets for real-time communication and PostgreSQL for persistence.

The implementation will extend the existing Express/Socket.io server architecture and integrate with the current database schema (game, hands, actions, hand_cards, winners tables).

## Architecture

### High-Level Architecture

```
┌─────────────┐         WebSocket          ┌──────────────────┐
│   Client    │◄──────────────────────────►│  Socket.io       │
│  (Browser)  │         Events             │  Server          │
└─────────────┘                            └──────────────────┘
                                                    │
                                                    ▼
                                           ┌──────────────────┐
                                           │  Game Engine     │
                                           │  (PokerGame)     │
                                           └──────────────────┘
                                                    │
                                    ┌───────────────┼───────────────┐
                                    ▼               ▼               ▼
                            ┌──────────────┐ ┌──────────┐  ┌──────────────┐
                            │ Card Manager │ │  Pot     │  │ Hand         │
                            │              │ │  Manager │  │ Evaluator    │
                            └──────────────┘ └──────────┘  └──────────────┘
                                                    │
                                                    ▼
                                           ┌──────────────────┐
                                           │   PostgreSQL     │
                                           │   Database       │
                                           └──────────────────┘
```

### Component Responsibilities

1. **PokerGameController**: WebSocket event handlers and HTTP endpoints for game actions
2. **PokerGameEngine**: Core game state management, turn progression, street advancement
3. **CardManager**: Deck shuffling, card dealing, card representation
4. **HandEvaluator**: Poker hand ranking and winner determination
5. **PotManager**: Pot calculation, side pot handling, chip distribution
6. **GameStateManager**: Database persistence and state recovery

## Components and Interfaces

### 1. PokerGameEngine

The central game engine that manages the state of an active poker hand.

```typescript
interface PlayerState {
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

interface GameState {
  roomId: number;
  gameId: number;
  handId: number;
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

class PokerGameEngine {
  private gameState: GameState;
  private timer: NodeJS.Timeout | null;
  private readonly TURN_TIME_SECONDS = 30;
  private readonly SMALL_BLIND = 10;
  private readonly BIG_BLIND = 20;
  
  constructor(roomId: number, players: PlayerInfo[]);
  
  startHand(): Promise<void>;
  handlePlayerAction(userId: number, action: PlayerAction): Promise<void>;
  advanceToNextPlayer(): Promise<void>;
  advanceToNextStreet(): Promise<void>;
  determineWinner(): Promise<void>;
  getGameState(): GameState;
}
```

### 2. CardManager

Handles card representation, deck management, and dealing.

```typescript
interface Card {
  rank: '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
  suit: 'h' | 'd' | 'c' | 's'; // hearts, diamonds, clubs, spades
}

class CardManager {
  static createDeck(): Card[];
  static shuffleDeck(deck: Card[]): Card[];
  static dealCards(deck: Card[], count: number): Card[];
  static cardToString(card: Card): string; // e.g., "Ah" for Ace of hearts
  static stringToCard(str: string): Card;
}
```

### 3. HandEvaluator

Evaluates poker hands and determines winners.

```typescript
interface HandRank {
  rank: number; // 0-8 (high card to straight flush)
  name: string; // "High Card", "Pair", "Two Pair", etc.
  tiebreakers: number[]; // For comparing hands of same rank
}

class HandEvaluator {
  static evaluateHand(holeCards: [Card, Card], boardCards: Card[]): HandRank;
  static compareHands(hand1: HandRank, hand2: HandRank): number; // -1, 0, 1
  static findWinners(players: PlayerState[], boardCards: Card[]): number[]; // userIds
}
```

### 4. PotManager

Manages pot calculations including side pots for all-in scenarios.

```typescript
interface PotInfo {
  amount: number;
  eligiblePlayers: number[]; // userIds
}

class PotManager {
  static calculatePot(players: PlayerState[]): number;
  static calculateSidePots(players: PlayerState[]): PotInfo[];
  static distributePot(pot: number, winners: number[], players: Map<number, PlayerState>): void;
}
```

### 5. PokerGameController

WebSocket event handlers for client-server communication.

```typescript
// WebSocket Events (Server -> Client)
interface ServerEvents {
  'game:hand:started': { handNumber: number; dealerPosition: number };
  'game:cards:dealt': { holeCards: [Card, Card] }; // Sent privately to each player
  'game:street:advanced': { street: string; boardCards: Card[] };
  'game:turn:started': { userId: number; timeRemaining: number };
  'game:turn:tick': { timeRemaining: number };
  'game:action:performed': { userId: number; action: string; amount: number };
  'game:pot:updated': { pot: number };
  'game:winner:determined': { winners: WinnerInfo[]; pot: number };
  'game:error': { message: string };
}

// WebSocket Events (Client -> Server)
interface ClientEvents {
  'game:action:fold': {};
  'game:action:check': {};
  'game:action:call': {};
  'game:action:raise': { amount: number };
  'game:action:allin': {};
}
```

## Data Models

### Card Representation

Cards are represented as objects with rank and suit:
- Ranks: 2-9, T (10), J (Jack), Q (Queen), K (King), A (Ace)
- Suits: h (hearts), d (diamonds), c (clubs), s (spades)
- String format: "Ah" (Ace of hearts), "Ts" (Ten of spades)

### Game State Persistence

The system uses the existing database schema:

1. **game table**: Created when game starts, links to room_id
2. **hands table**: One record per hand, stores dealer positions, pot, board cards, street
3. **hand_cards table**: Stores each player's hole cards for each hand
4. **actions table**: Records every player action with timestamp
5. **winners table**: Records winners and their winnings after showdown

## 
Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Deck uniqueness
*For any* shuffled deck, all 52 cards should be present and no card should appear more than once
**Validates: Requirements 1.1, 1.4**

### Property 2: Hole card distribution
*For any* game state with N active players, dealing hole cards should result in exactly N players each having exactly 2 cards
**Validates: Requirements 1.2**

### Property 3: Community card counts
*For any* hand progression, the flop should add exactly 3 board cards, the turn should add exactly 1 additional board card, and the river should add exactly 1 final board card
**Validates: Requirements 1.3**

### Property 4: Card privacy
*For any* player in a game, that player should receive only their own hole cards via WebSocket and not receive other players' hole cards
**Validates: Requirements 1.5**

### Property 5: Fold permanence
*For any* player who folds during a hand, that player's isActive status should remain false for the remainder of that hand regardless of subsequent game events
**Validates: Requirements 2.2**

### Property 6: Check pot invariance
*For any* game state where a player checks, the pot size before the check should equal the pot size after the check
**Validates: Requirements 2.3**

### Property 7: Call chip conservation
*For any* call action, the increase in pot size should equal the decrease in the calling player's stack
**Validates: Requirements 2.4**

### Property 8: All-in stack depletion
*For any* player who goes all-in, that player's stack should be zero immediately after the all-in action
**Validates: Requirements 2.6**

### Property 9: Action persistence
*For any* player action (fold, check, call, raise, all-in), a corresponding record should exist in the actions table with correct hand_id, user_id, action_type, amount, and street
**Validates: Requirements 2.7**

### Property 10: Pot increase on bet
*For any* bet or raise action, the pot size after the action should equal the pot size before the action plus the bet amount
**Validates: Requirements 4.2**

### Property 11: Side pot correctness
*For any* scenario with multiple all-in players at different amounts, the sum of all side pots should equal the total pot, and each side pot should only include eligible players
**Validates: Requirements 4.5**

### Property 12: Street progression
*For any* betting round where all active players have acted and matched the current bet, the system should advance to the next street
**Validates: Requirements 5.2, 3.5**

### Property 13: Hand ranking correctness
*For any* two poker hands, a higher-ranked hand (e.g., flush) should always beat a lower-ranked hand (e.g., pair) according to standard poker rankings
**Validates: Requirements 6.2**

### Property 14: Winner pot award
*For any* hand with a single winner, the winner's stack after pot distribution should equal their stack before plus the pot amount
**Validates: Requirements 6.3**

### Property 15: Pot splitting on tie
*For any* hand where N players tie for the win, each tied player should receive pot / N chips (with remainder handling)
**Validates: Requirements 6.4**

### Property 16: Zero stack elimination
*For any* player whose stack reaches zero, that player should not be dealt into the next hand
**Validates: Requirements 7.3**

### Property 17: Dealer rotation
*For any* completed hand, the dealer position for the next hand should be the next active player position clockwise from the current dealer
**Validates: Requirements 8.2**

### Property 18: Blind position calculation
*For any* hand, the small blind position should be dealer position + 1 (mod number of players), and big blind position should be small blind position + 1 (mod number of players)
**Validates: Requirements 8.3, 8.4**

### Property 19: Hand database persistence
*For any* started hand, a record should exist in the hands table with correct game_id, hand_number, dealer_seat, small_blind_seat, big_blind_seat, and current_street
**Validates: Requirements 10.1**

### Property 20: Board cards persistence
*For any* hand where community cards have been dealt, the board_cards field in the hands table should match the dealt cards
**Validates: Requirements 10.3**

## Error Handling

### Invalid Action Handling

1. **Out of Turn Actions**: If a player attempts an action when it's not their turn, emit `game:error` with message "Not your turn"
2. **Invalid Raise Amount**: If a raise is below the minimum, emit `game:error` with message "Raise amount too low"
3. **Insufficient Chips**: If a player attempts to bet more than their stack, automatically convert to all-in
4. **Invalid Check**: If a player tries to check when there's a bet to call, emit `game:error` with message "Cannot check, must call or fold"

### Database Error Handling

1. **Connection Failures**: Log error, emit `game:error` to all players, pause game state
2. **Transaction Failures**: Rollback transaction, restore previous game state, notify players
3. **Constraint Violations**: Log error, investigate data inconsistency, notify administrators

### WebSocket Error Handling

1. **Disconnection**: Keep player in game for 60 seconds, auto-fold if turn comes up during disconnection
2. **Reconnection**: Send full game state to reconnecting player
3. **Message Parsing Errors**: Log error, ignore malformed message, continue game

## Testing Strategy

### Unit Testing

The implementation will use **Jest** as the testing framework for both unit tests and property-based tests.

**Unit Test Coverage:**

1. **CardManager Tests**:
   - Test deck creation produces 52 unique cards
   - Test card string conversion (cardToString, stringToCard)
   - Test dealing removes cards from deck

2. **HandEvaluator Tests**:
   - Test specific hand rankings (royal flush, straight flush, four of a kind, etc.)
   - Test tiebreaker scenarios (e.g., higher pair wins)
   - Test edge cases (ace-low straight, wheel)

3. **PotManager Tests**:
   - Test simple pot calculation with no all-ins
   - Test side pot creation with one all-in player
   - Test complex side pot scenarios with multiple all-ins

4. **PokerGameEngine Tests**:
   - Test game initialization with correct starting stacks
   - Test dealer button assignment
   - Test blind posting

### Property-Based Testing

The implementation will use **fast-check** library for property-based testing in TypeScript/JavaScript.

**Configuration:**
- Each property-based test MUST run a minimum of 100 iterations
- Each property-based test MUST be tagged with a comment referencing the correctness property from this design document
- Tag format: `// Feature: poker-game-logic, Property {number}: {property_text}`
- Each correctness property MUST be implemented by a SINGLE property-based test

**Property Test Coverage:**

1. **Property 1 Test**: Generate random shuffles, verify all 52 cards present and unique
2. **Property 2 Test**: Generate random player counts (2-10), verify each gets 2 hole cards
3. **Property 3 Test**: Simulate hand progression, verify flop=3, turn=1, river=1 cards
4. **Property 6 Test**: Generate random game states, perform check, verify pot unchanged
5. **Property 7 Test**: Generate random call scenarios, verify chip conservation
6. **Property 8 Test**: Generate random all-in scenarios, verify stack becomes zero
7. **Property 10 Test**: Generate random bet amounts, verify pot increases correctly
8. **Property 13 Test**: Generate pairs of hands with known rankings, verify comparison
9. **Property 14 Test**: Generate random winning scenarios, verify pot awarded correctly
10. **Property 17 Test**: Generate random dealer positions, verify clockwise rotation

**Test Generators:**

```typescript
// Example generator for player states
const playerStateArbitrary = fc.record({
  userId: fc.integer({ min: 1, max: 1000 }),
  username: fc.string({ minLength: 3, maxLength: 20 }),
  position: fc.integer({ min: 0, max: 9 }),
  stack: fc.integer({ min: 0, max: 10000 }),
  currentBet: fc.integer({ min: 0, max: 1000 }),
  isActive: fc.boolean(),
  isFolded: fc.boolean(),
  hasActed: fc.boolean()
});

// Example generator for cards
const cardArbitrary = fc.record({
  rank: fc.constantFrom('2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'),
  suit: fc.constantFrom('h', 'd', 'c', 's')
});
```

## Implementation Notes

### Card Shuffling

Use Node.js `crypto.randomInt()` for cryptographically secure shuffling (Fisher-Yates algorithm):

```typescript
function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
```

### Hand Evaluation Algorithm

Use a lookup table approach for performance:
1. Convert 7 cards (2 hole + 5 board) to all possible 5-card combinations (21 combinations)
2. Evaluate each 5-card hand using bit manipulation
3. Return the best hand rank

### Timer Implementation

Use `setInterval` for timer ticks and `setTimeout` for turn expiration:

```typescript
private startTurnTimer(userId: number): void {
  let timeRemaining = this.TURN_TIME_SECONDS;
  
  this.timer = setInterval(() => {
    timeRemaining--;
    this.io.to(`room:${this.roomId}`).emit('game:turn:tick', { timeRemaining });
    
    if (timeRemaining <= 0) {
      this.handleTimeout(userId);
    }
  }, 1000);
}
```

### WebSocket Room Management

Each game room has a Socket.io room named `room:{roomId}`. All game events are broadcast to this room:

```typescript
this.io.to(`room:${this.roomId}`).emit('game:pot:updated', { pot: this.gameState.pot });
```

Private messages (like hole cards) are sent directly to specific socket IDs:

```typescript
const socket = this.getSocketByUserId(userId);
socket.emit('game:cards:dealt', { holeCards: player.holeCards });
```

## Deployment Considerations

1. **Scalability**: Current design supports single-server deployment. For multi-server, use Redis adapter for Socket.io
2. **State Recovery**: On server restart, active games are lost. Future enhancement: persist game state to Redis
3. **Database Connection Pooling**: Use existing pg pool with appropriate pool size (default: 10 connections)
4. **Memory Management**: Clean up completed games from memory after 5 minutes
5. **Monitoring**: Log all game events to console for debugging, add structured logging in production

## Future Enhancements

1. **Tournament Mode**: Multi-table tournaments with increasing blinds
2. **Hand History**: Detailed hand replay functionality
3. **Spectator Mode**: Allow users to watch games without playing
4. **Advanced Statistics**: Track player statistics (VPIP, PFR, aggression factor)
5. **Configurable Rules**: Allow custom blind structures, starting stacks, time limits
