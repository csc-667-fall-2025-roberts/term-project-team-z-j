# Implementation Plan

- [x] 1. Set up core poker utilities and card management
- [x] 1.1 Create CardManager class with deck creation, shuffling, and card representation
  - Implement createDeck() to generate all 52 cards
  - Implement shuffleDeck() using crypto.randomInt() for secure shuffling
  - Implement cardToString() and stringToCard() conversion methods
  - Implement dealCards() to remove and return cards from deck
  - _Requirements: 1.1, 1.4_

- [ ]* 1.2 Write property test for deck uniqueness
  - **Property 1: Deck uniqueness**
  - **Validates: Requirements 1.1, 1.4**

- [x] 1.3 Create HandEvaluator class for poker hand ranking
  - Implement evaluateHand() to determine hand rank from 7 cards (2 hole + 5 board)
  - Implement compareHands() to compare two HandRank objects
  - Implement findWinners() to determine winner(s) from multiple players
  - Use standard poker rankings: high card (0) through straight flush (8)
  - _Requirements: 6.1, 6.2_

- [ ]* 1.4 Write unit tests for hand evaluation
  - Test specific hand rankings (royal flush, straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, pair, high card)
  - Test tiebreaker scenarios (higher kicker wins)
  - Test edge cases (ace-low straight, ace-high straight)
  - _Requirements: 6.1, 6.2_

- [ ]* 1.5 Write property test for hand ranking correctness
  - **Property 13: Hand ranking correctness**
  - **Validates: Requirements 6.2**

- [-] 2. Implement pot management and chip distribution
- [x] 2.1 Create PotManager class for pot calculations
  - Implement calculatePot() to sum all player bets
  - Implement calculateSidePots() for all-in scenarios with different amounts
  - Implement distributePot() to award chips to winner(s)
  - Handle pot splitting for tied players
  - _Requirements: 4.1, 4.2, 4.5, 6.3, 6.4_

- [ ]* 2.2 Write unit tests for pot management
  - Test simple pot calculation with no all-ins
  - Test side pot creation with one all-in player
  - Test complex side pot scenarios with multiple all-ins at different amounts
  - Test pot splitting with 2, 3, and 4-way ties
  - _Requirements: 4.5, 6.4_

- [ ]* 2.3 Write property test for side pot correctness
  - **Property 11: Side pot correctness**
  - **Validates: Requirements 4.5**

- [ ]* 2.4 Write property test for pot splitting on tie
  - **Property 15: Pot splitting on tie**
  - **Validates: Requirements 6.4**

- [x] 3. Build core game engine and state management
- [x] 3.1 Create PokerGameEngine class with game state initialization
  - Define GameState and PlayerState interfaces
  - Implement constructor to initialize game with players from room
  - Set starting stacks to 1500 chips for each player
  - Initialize dealer, small blind, and big blind positions
  - _Requirements: 7.1, 8.1, 8.3, 8.4_

- [x] 3.2 Implement hand start logic
  - Create startHand() method to begin a new hand
  - Create new deck and shuffle it
  - Post small blind and big blind
  - Deal 2 hole cards to each active player
  - Set current street to 'preflop'
  - Persist hand record to database (hands table)
  - Persist hole cards to database (hand_cards table)
  - _Requirements: 1.1, 1.2, 4.1, 5.1, 10.1_

- [ ]* 3.3 Write property test for hole card distribution
  - **Property 2: Hole card distribution**
  - **Validates: Requirements 1.2**

- [ ]* 3.4 Write property test for hand database persistence
  - **Property 19: Hand database persistence**
  - **Validates: Requirements 10.1**

- [x] 3.4 Implement player action handling
  - Create handlePlayerAction() method to process fold, check, call, raise, all-in
  - Validate action is from current active player
  - Update player state (stack, currentBet, isFolded, hasActed)
  - Update pot and current bet
  - Persist action to database (actions table)
  - Broadcast action to all players via WebSocket
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

- [ ]* 3.5 Write property test for fold permanence
  - **Property 5: Fold permanence**
  - **Validates: Requirements 2.2**

- [ ]* 3.6 Write property test for check pot invariance
  - **Property 6: Check pot invariance**
  - **Validates: Requirements 2.3**

- [ ]* 3.7 Write property test for call chip conservation
  - **Property 7: Call chip conservation**
  - **Validates: Requirements 2.4**

- [ ]* 3.8 Write property test for all-in stack depletion
  - **Property 8: All-in stack depletion**
  - **Validates: Requirements 2.6**

- [ ]* 3.9 Write property test for action persistence
  - **Property 9: Action persistence**
  - **Validates: Requirements 2.7**

- [ ] 4. Implement turn progression and betting round logic
- [x] 4.1 Create turn timer system
  - Implement startTurnTimer() to begin 30-second countdown
  - Emit 'game:turn:tick' event every second with remaining time
  - Implement handleTimeout() to auto-fold player when timer expires
  - Stop timer when player takes action
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 4.2 Implement turn advancement logic
  - Create advanceToNextPlayer() method
  - Find next active (non-folded) player clockwise
  - Start new turn timer for next player
  - Emit 'game:turn:started' event to all players
  - Check if betting round is complete (all players acted and bets matched)
  - _Requirements: 2.1, 3.4, 3.5_

- [ ]* 4.3 Write property test for street progression
  - **Property 12: Street progression**
  - **Validates: Requirements 5.2, 3.5**

- [x] 5. Implement street advancement and community card dealing
- [x] 5.1 Create advanceToNextStreet() method
  - Determine next street (preflop → flop → turn → river → showdown)
  - Deal appropriate number of community cards (flop: 3, turn: 1, river: 1)
  - Update board cards in game state
  - Persist board_cards to database (hands table)
  - Reset player betting state (hasActed, currentBet)
  - Emit 'game:street:advanced' event with new board cards
  - _Requirements: 1.3, 5.2, 5.3, 5.4, 5.5, 5.6, 10.3_

- [ ]* 5.2 Write property test for community card counts
  - **Property 3: Community card counts**
  - **Validates: Requirements 1.3**

- [ ]* 5.3 Write property test for board cards persistence
  - **Property 20: Board cards persistence**
  - **Validates: Requirements 10.3**

- [x] 6. Implement showdown and winner determination
- [x] 6.1 Create determineWinner() method for showdown
  - Evaluate each active player's hand using HandEvaluator
  - Find winner(s) using findWinners()
  - Calculate side pots if needed using PotManager
  - Distribute pot to winner(s) and update stacks
  - Persist winner information to database (winners table)
  - Update hand record with is_completed = true
  - Emit 'game:winner:determined' event with winner info
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 10.4, 10.5_

- [ ]* 6.2 Write property test for winner pot award
  - **Property 14: Winner pot award**
  - **Validates: Requirements 6.3**

- [x] 6.2 Implement post-hand cleanup and next hand preparation
  - Check for eliminated players (stack = 0)
  - Rotate dealer button clockwise
  - Calculate new blind positions
  - Emit player stack updates to all players
  - Start next hand if 2+ players remain
  - _Requirements: 7.2, 7.3, 7.4, 8.2, 8.3, 8.4, 8.5_

- [ ]* 6.3 Write property test for zero stack elimination
  - **Property 16: Zero stack elimination**
  - **Validates: Requirements 7.3**

- [ ]* 6.4 Write property test for dealer rotation
  - **Property 17: Dealer rotation**
  - **Validates: Requirements 8.2**

- [ ]* 6.5 Write property test for blind position calculation
  - **Property 18: Blind position calculation**
  - **Validates: Requirements 8.3, 8.4**

- [x] 7. Create WebSocket controller for poker game events
- [x] 7.1 Create PokerGameController with WebSocket event handlers
  - Implement 'game:action:fold' handler
  - Implement 'game:action:check' handler
  - Implement 'game:action:call' handler
  - Implement 'game:action:raise' handler with amount validation
  - Implement 'game:action:allin' handler
  - Add error handling for invalid actions (out of turn, invalid amounts)
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 7.2 Implement game state broadcasting
  - Emit 'game:hand:started' when hand begins
  - Emit 'game:cards:dealt' privately to each player with their hole cards
  - Emit 'game:pot:updated' when pot changes
  - Emit 'game:action:performed' when player acts
  - Emit 'game:error' for invalid actions
  - _Requirements: 1.5, 4.3, 9.2, 9.3, 9.4_

- [ ]* 7.3 Write property test for card privacy
  - **Property 4: Card privacy**
  - **Validates: Requirements 1.5**

- [x] 8. Integrate poker engine with existing game room system
- [x] 8.1 Update startGame endpoint to initialize poker engine
  - Modify startGame() in gameController.ts to create game record in database
  - Instantiate PokerGameEngine with room players
  - Store engine instance in memory (Map<roomId, PokerGameEngine>)
  - Call engine.startHand() to begin first hand
  - _Requirements: 7.1, 10.1_

- [x] 8.2 Add poker WebSocket event handlers to server.ts
  - Register PokerGameController event handlers in Socket.io connection
  - Map socket connections to user IDs for private messaging
  - Handle player disconnection during active game
  - _Requirements: 9.1, 9.2_

- [x] 8.3 Update game.ejs view to display poker game UI
  - Add card display areas for hole cards and board cards
  - Add action buttons (Fold, Check, Call, Raise, All-In)
  - Add pot display and player stack displays
  - Add turn timer display
  - Add game log/history area
  - _Requirements: 2.1, 3.1, 4.3, 7.4_

- [x] 9. Create frontend game client logic
- [x] 9.1 Create poker game client in src/frontend/games/poker.ts
  - Connect to WebSocket and join room
  - Listen for 'game:hand:started', 'game:cards:dealt', 'game:street:advanced' events
  - Listen for 'game:turn:started', 'game:turn:tick' events
  - Listen for 'game:action:performed', 'game:pot:updated' events
  - Listen for 'game:winner:determined' event
  - Update UI based on received events
  - _Requirements: 9.1, 9.2, 9.4_

- [x] 9.2 Implement action button handlers
  - Emit 'game:action:fold' when Fold button clicked
  - Emit 'game:action:check' when Check button clicked
  - Emit 'game:action:call' when Call button clicked
  - Emit 'game:action:raise' with amount when Raise button clicked
  - Emit 'game:action:allin' when All-In button clicked
  - Disable buttons when not player's turn
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 9.3 Implement card and UI rendering
  - Render hole cards using SVG images from /public/cards
  - Render board cards (flop, turn, river) as they're dealt
  - Update pot display in real-time
  - Update player stack displays
  - Display turn timer countdown
  - Show action history/log
  - _Requirements: 1.5, 3.2, 4.3, 7.4_

- [ ] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Add error handling and edge case management
- [ ] 11.1 Implement comprehensive error handling
  - Handle database connection failures gracefully
  - Handle WebSocket disconnections and reconnections
  - Validate all player actions before processing
  - Add transaction rollback for database errors
  - Log all errors with context for debugging
  - _Requirements: 9.3_

- [ ] 11.2 Handle edge cases
  - Handle case where only 2 players remain (heads-up)
  - Handle case where all but one player folds (early winner)
  - Handle case where player disconnects during their turn
  - Handle case where multiple players go all-in simultaneously
  - Handle rounding for odd pot splits
  - _Requirements: 6.4, 7.3_

- [ ] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
