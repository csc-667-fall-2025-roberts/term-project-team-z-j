// @ts-ignore - socket.io is loaded via CDN
const io = (window as any).io;

// Card interface matching backend
interface Card {
    rank: '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
    suit: 'h' | 'd' | 'c' | 's';
}

// Game state interface
interface PokerGameState {
    pot: number;
    currentBet: number;
    playerStack: number;
    gameId: number | null;
    userId: number | null;
    isMyTurn: boolean;
    holeCards: Card[] | null;
    boardCards: Card[];
    turnTimeRemaining: number;
    currentStreet: string;
    handNumber: number;
}

// Initialize game state
const pokerGameState: PokerGameState = {
    pot: 0,
    currentBet: 0,
    playerStack: 1500,
    gameId: null,
    userId: null,
    isMyTurn: false,
    holeCards: null,
    boardCards: [],
    turnTimeRemaining: 0,
    currentStreet: 'preflop',
    handNumber: 0
};

// Socket instance
let pokerSocket: any = null;

/**
 * Initialize Socket.io connection with reconnection options
 */
export function initializePokerSocket(): any {
    if (pokerSocket) return pokerSocket;

    pokerSocket = io({
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
        transports: ['websocket', 'polling']
    });

    // Handle socket connection events
    pokerSocket.on('connect', () => {
        console.log('[Poker] Socket connected:', pokerSocket.id);

        // Identify user to server FIRST
        if (pokerGameState.userId) {
            console.log('[Poker] Identifying user:', pokerGameState.userId);
            pokerSocket.emit('auth:identify', { userId: pokerGameState.userId });

            // Wait a bit for identification to complete, then join room
            setTimeout(() => {
                if (pokerGameState.gameId) {
                    console.log('[Poker] Joining/Rejoining room:', pokerGameState.gameId);
                    pokerSocket.emit('room:join', { roomId: pokerGameState.gameId });
                }
            }, 100);
        }
    });

    pokerSocket.on('disconnect', (reason: string) => {
        console.log('[Poker] Socket disconnected:', reason);
    });

    pokerSocket.on('connect_error', (error: any) => {
        console.error('[Poker] Socket connection error:', error);
    });

    pokerSocket.on('reconnect', (attemptNumber: number) => {
        console.log('[Poker] Socket reconnected after', attemptNumber, 'attempts');
    });

    pokerSocket.on('reconnect_failed', () => {
        console.error('[Poker] Socket reconnection failed');
        addGameLog('Connection lost. Please refresh the page.');
    });

    return pokerSocket;
}

/**
 * Join poker game room via WebSocket
 */
export function joinPokerRoom(gameId: number): void {
    console.log('[Poker] Joining game room:', gameId);
    const socket = initializePokerSocket();

    // Make sure we're connected before joining
    if (socket.connected) {
        socket.emit('room:join', { roomId: gameId });
    } else {
        // Wait for connection, then join
        socket.once('connect', () => {
            // Identify first
            if (pokerGameState.userId) {
                socket.emit('auth:identify', { userId: pokerGameState.userId });
            }
            // Then join room after a short delay
            setTimeout(() => {
                socket.emit('room:join', { roomId: gameId });
            }, 100);
        });
    }
}

/**
 * Get card image filename from card object
 */
function getCardImageName(card: Card): string {
    const rankMap: { [key: string]: string } = {
        '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
        'T': '10', 'J': 'jack', 'Q': 'queen', 'K': 'king', 'A': 'ace'
    };
    const suitMap: { [key: string]: string } = {
        'h': 'hearts', 'd': 'diamonds', 'c': 'clubs', 's': 'spades'
    };

    const rank = rankMap[card.rank] || card.rank;
    const suit = suitMap[card.suit] || card.suit;

    return `${rank}_of_${suit}.svg`;
}

/**
 * Update pot display in UI
 */
function updatePotDisplay(pot: number): void {
    const potElement = document.getElementById('potAmount');
    if (potElement) {
        potElement.textContent = `${pot}`;
    }
    pokerGameState.pot = pot;
}

/**
 * Update player stack display in UI
 */
function updatePlayerStack(userId: number, stack: number): void {
    const playerElement = document.querySelector(`[data-player="${userId}"]`);
    if (playerElement) {
        const stackElement = playerElement.querySelector('.text-green-400');
        if (stackElement) {
            stackElement.textContent = `$${stack}`;
        }
    }

    if (userId === pokerGameState.userId) {
        pokerGameState.playerStack = stack;
    }
}

/**
 * Update hole cards display for current player
 */
function updateHoleCards(cards: Card[]): void {
    pokerGameState.holeCards = cards;

    // Find current user's card display
    const currentUserElement = document.querySelector(`[data-player="${pokerGameState.userId}"]`);
    if (!currentUserElement) return;

    const cardContainer = currentUserElement.querySelector('.flex.gap-2');
    if (!cardContainer) return;

    // Update card images
    const cardImages = cardContainer.querySelectorAll('img');
    if (cardImages.length >= 2 && cards.length >= 2) {
        cardImages[0].src = `/cards/${getCardImageName(cards[0])}`;
        cardImages[0].alt = `${cards[0].rank} of ${cards[0].suit}`;
        cardImages[1].src = `/cards/${getCardImageName(cards[1])}`;
        cardImages[1].alt = `${cards[1].rank} of ${cards[1].suit}`;
    }
}

/**
 * Update community cards display
 */
function updateCommunityCards(cards: Card[]): void {
    pokerGameState.boardCards = cards;

    const communityCardsContainer = document.getElementById('communityCards');
    if (!communityCardsContainer) return;

    // Clear existing cards
    communityCardsContainer.innerHTML = '';

    // Add new cards
    cards.forEach(card => {
        const img = document.createElement('img');
        img.src = `/cards/${getCardImageName(card)}`;
        img.alt = `${card.rank} of ${card.suit}`;
        img.className = 'w-16 h-24 rounded-lg shadow-2xl';
        img.style.filter = 'drop-shadow(0 8px 16px rgba(0,0,0,0.4))';
        communityCardsContainer.appendChild(img);
    });
}

/**
 * Update turn timer display
 */
function updateTurnTimer(timeRemaining: number): void {
    pokerGameState.turnTimeRemaining = timeRemaining;

    const timerElement = document.getElementById('gameClockMain');
    if (timerElement) {
        const minutes = Math.floor(timeRemaining / 60);
        const seconds = timeRemaining % 60;
        timerElement.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        // Change color based on time remaining
        if (timeRemaining <= 5) {
            timerElement.style.color = '#ef4444'; // red
        } else if (timeRemaining <= 10) {
            timerElement.style.color = '#f59e0b'; // orange
        } else {
            timerElement.style.color = '#1f2937'; // gray-800
        }
    }
}

/**
 * Enable/disable action buttons based on turn
 */
function updateActionButtons(isMyTurn: boolean, currentBet: number = 0): void {
    pokerGameState.isMyTurn = isMyTurn;
    pokerGameState.currentBet = currentBet;

    const foldBtn = document.getElementById('foldBtn') as HTMLButtonElement;
    const checkBtn = document.getElementById('checkBtn') as HTMLButtonElement;
    const callBtn = document.getElementById('callBtn') as HTMLButtonElement;
    const raiseBtn = document.getElementById('raiseBtn') as HTMLButtonElement;
    const allinBtn = document.getElementById('allinBtn') as HTMLButtonElement;
    const betSlider = document.getElementById('betSlider') as HTMLInputElement;

    const buttons = [foldBtn, checkBtn, callBtn, raiseBtn, allinBtn];

    buttons.forEach(btn => {
        if (btn) {
            btn.disabled = !isMyTurn;
            btn.style.opacity = isMyTurn ? '1' : '0.5';
            btn.style.cursor = isMyTurn ? 'pointer' : 'not-allowed';
        }
    });

    if (betSlider) {
        betSlider.disabled = !isMyTurn;
        betSlider.style.opacity = isMyTurn ? '1' : '0.5';
    }

    // Update call button text with amount
    if (callBtn && currentBet > 0) {
        const callAmount = currentBet;
        callBtn.textContent = `Call $${callAmount}`;
    }
}

/**
 * Add message to game log
 */
function addGameLog(message: string): void {
    console.log('[Game Log]', message);

    // Find or create game log container
    let logContainer = document.getElementById('gameLog');
    if (!logContainer) {
        // Create log container if it doesn't exist
        logContainer = document.createElement('div');
        logContainer.id = 'gameLog';
        logContainer.className = 'fixed bottom-4 right-4 bg-black/80 text-white p-4 rounded-lg max-w-md max-h-48 overflow-y-auto';
        document.body.appendChild(logContainer);
    }

    // Add message
    const messageElement = document.createElement('div');
    messageElement.className = 'text-sm mb-1';
    messageElement.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
    logContainer.appendChild(messageElement);

    // Auto-scroll to bottom
    logContainer.scrollTop = logContainer.scrollHeight;

    // Keep only last 20 messages
    while (logContainer.children.length > 20) {
        logContainer.removeChild(logContainer.firstChild!);
    }
}

/**
 * Register all poker game event listeners
 */
export function registerPokerEventListeners(socket: any): void {
    // Room joined confirmation
    socket.on('room:joined', (data: any) => {
        console.log('[Poker] Successfully joined room:', data);
        addGameLog(`Connected to game room ${data.roomId}`);
    });

    // Hand started
    socket.on('game:hand:started', (data: any) => {
        console.log('[Poker] Hand started:', data);
        pokerGameState.handNumber = data.handNumber;
        pokerGameState.currentStreet = 'preflop';
        addGameLog(`Hand #${data.handNumber} started`);

        if (data.pot !== undefined) {
            updatePotDisplay(data.pot);
        }

        // Clear board cards for new hand
        updateCommunityCards([]);
    });

    // Cards dealt (private to each player)
    socket.on('game:cards:dealt', (data: any) => {
        console.log('[Poker] Cards dealt:', data);
        if (data.holeCards && Array.isArray(data.holeCards)) {
            updateHoleCards(data.holeCards);
            addGameLog('Hole cards dealt');
        }
    });

    // Street advanced (flop, turn, river)
    socket.on('game:street:advanced', (data: any) => {
        console.log('[Poker] Street advanced:', data);
        pokerGameState.currentStreet = data.street;

        const streetName = data.street.toUpperCase();
        addGameLog(`${streetName} dealt`);

        if (data.boardCards && Array.isArray(data.boardCards)) {
            updateCommunityCards(data.boardCards);
        }

        if (data.pot !== undefined) {
            updatePotDisplay(data.pot);
        }
    });

    // Turn started
    socket.on('game:turn:started', (data: any) => {
        console.log('[Poker] Turn started:', data);
        const isMyTurn = data.userId === pokerGameState.userId;
        updateActionButtons(isMyTurn, data.currentBet || pokerGameState.currentBet);

        if (data.timeRemaining !== undefined) {
            updateTurnTimer(data.timeRemaining);
        }

        if (isMyTurn) {
            addGameLog('Your turn!');
        } else if (data.username) {
            addGameLog(`${data.username}'s turn`);
        }
    });

    // Turn tick (timer update)
    socket.on('game:turn:tick', (data: any) => {
        if (data.timeRemaining !== undefined) {
            updateTurnTimer(data.timeRemaining);
        }
    });

    // Action performed
    socket.on('game:action:performed', (data: any) => {
        console.log('[Poker] Action performed:', data);

        const username = data.username || 'Player';
        const action = data.action || 'acted';
        const amount = data.amount || 0;

        let logMessage = `${username} ${action}`;
        if (amount > 0) {
            logMessage += ` $${amount}`;
        }
        addGameLog(logMessage);

        if (data.pot !== undefined) {
            updatePotDisplay(data.pot);
        }

        if (data.currentBet !== undefined) {
            pokerGameState.currentBet = data.currentBet;
        }
    });

    // Pot updated
    socket.on('game:pot:updated', (data: any) => {
        console.log('[Poker] Pot updated:', data);
        if (data.pot !== undefined) {
            updatePotDisplay(data.pot);
        }
    });

    // Winner determined
    socket.on('game:winner:determined', (data: any) => {
        console.log('[Poker] Winner determined:', data);

        if (data.winners && Array.isArray(data.winners)) {
            data.winners.forEach((winner: any) => {
                const username = winner.username || 'Player';
                const amountWon = winner.amountWon || 0;
                const handRank = winner.handRank || 'best hand';

                addGameLog(`${username} wins $${amountWon} with ${handRank}`);

                if (winner.userId && winner.stack !== undefined) {
                    updatePlayerStack(winner.userId, winner.stack);
                }
            });
        }
    });

    // Stacks updated
    socket.on('game:stacks:updated', (data: any) => {
        console.log('[Poker] Stacks updated:', data);

        if (data.players && Array.isArray(data.players)) {
            data.players.forEach((player: any) => {
                if (player.userId && player.stack !== undefined) {
                    updatePlayerStack(player.userId, player.stack);
                }
            });
        }

        if (data.eliminatedPlayers && Array.isArray(data.eliminatedPlayers)) {
            data.eliminatedPlayers.forEach((player: any) => {
                const username = player.username || 'Player';
                addGameLog(`${username} eliminated`);
            });
        }
    });

    // Game error
    socket.on('game:error', (data: any) => {
        console.error('[Poker] Game error:', data);
        const message = data.message || 'An error occurred';
        addGameLog(`Error: ${message}`);
        alert(message);
    });

    // Game ended
    socket.on('game:ended', (data: any) => {
        console.log('[Poker] Game ended:', data);

        if (data.winner) {
            const username = data.winner.username || 'Player';
            const stack = data.winner.stack || 0;
            addGameLog(`Game over! ${username} wins with $${stack}`);
        } else {
            addGameLog('Game over!');
        }
    });
}

/**
 * Setup action button event handlers
 */
export function setupPokerActionButtons(socket: any): void {
    const foldBtn = document.getElementById('foldBtn');
    const checkBtn = document.getElementById('checkBtn');
    const callBtn = document.getElementById('callBtn');
    const raiseBtn = document.getElementById('raiseBtn');
    const allinBtn = document.getElementById('allinBtn');
    const betSlider = document.getElementById('betSlider') as HTMLInputElement;

    // Fold button
    if (foldBtn) {
        foldBtn.addEventListener('click', () => {
            if (pokerGameState.isMyTurn) {
                console.log('[Poker] Folding...');
                socket.emit('game:action:fold');
                addGameLog('You folded');
            }
        });
    }

    // Check button
    if (checkBtn) {
        checkBtn.addEventListener('click', () => {
            if (pokerGameState.isMyTurn) {
                console.log('[Poker] Checking...');
                socket.emit('game:action:check');
                addGameLog('You checked');
            }
        });
    }

    // Call button
    if (callBtn) {
        callBtn.addEventListener('click', () => {
            if (pokerGameState.isMyTurn) {
                console.log('[Poker] Calling...');
                socket.emit('game:action:call');
                addGameLog('You called');
            }
        });
    }

    // Raise button
    if (raiseBtn) {
        raiseBtn.addEventListener('click', () => {
            if (pokerGameState.isMyTurn && betSlider) {
                const amount = parseInt(betSlider.value);
                console.log('[Poker] Raising to:', amount);
                socket.emit('game:action:raise', { amount });
                addGameLog(`You raised to $${amount}`);
            }
        });
    }

    // All-in button
    if (allinBtn) {
        allinBtn.addEventListener('click', () => {
            if (pokerGameState.isMyTurn) {
                console.log('[Poker] Going all-in...');
                socket.emit('game:action:allin');
                addGameLog('You went all-in');
            }
        });
    }

    // Update raise amount display when slider changes
    if (betSlider) {
        const raiseAmountDisplay = document.getElementById('raiseAmount');
        betSlider.addEventListener('input', () => {
            if (raiseAmountDisplay) {
                raiseAmountDisplay.textContent = `$${betSlider.value}`;
            }
        });
    }
}

/**
 * Initialize poker game client
 */
export function initializePokerGame(gameId: number, userId: number): void {
    console.log('[Poker] Initializing poker game client');
    console.log('[Poker] Game ID:', gameId, 'User ID:', userId);

    // Set game state
    pokerGameState.gameId = gameId;
    pokerGameState.userId = userId;

    // Initialize socket
    const socket = initializePokerSocket();

    // Register event listeners
    registerPokerEventListeners(socket);

    // Setup action buttons
    setupPokerActionButtons(socket);

    // Disable action buttons initially
    updateActionButtons(false, 0);

    // Join the room
    joinPokerRoom(gameId);

    console.log('[Poker] Poker game client initialized');
    addGameLog('Connecting to game server...');
}

// Export game state for debugging
export function getPokerGameState(): PokerGameState {
    return { ...pokerGameState };
}
