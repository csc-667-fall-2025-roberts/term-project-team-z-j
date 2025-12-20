// Game state interfaces
interface Card {
    rank: string;
    suit: string;
    value: number;
}

interface Player {
    id: string;
    name: string;
    chips: number;
    cards: Card[];
    currentBet: number;
    folded: boolean;
    allIn: boolean;
    position: number;
}

interface GameState {
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
    winners: { playerId: string; amount: number; hand: string }[];
    smallBlind: number;
    bigBlind: number;
}

// Global game state
let currentGameState: GameState | null = null;
let currentPlayerId: string = 'player_0';
let gameId: number;
let playerName: string = 'You';

// Card rendering function
function createCard(rank: string, suit: string, faceDown: boolean = false): string {
    if (faceDown) {
        return `
            <div class="w-20 h-28 bg-blue-900 rounded-lg shadow-2xl border border-white/10 relative overflow-hidden flex items-center justify-center">
                <div class="absolute inset-0 opacity-30" style="background-image: radial-gradient(#ffffff 1px, transparent 1px); background-size: 6px 6px;"></div>
                <div class="w-10 h-10 rounded-full bg-blue-500/30 z-10"></div>
            </div>
        `;
    }

    const rankMap: { [key: string]: string } = {
        'A': 'ace',
        'K': 'king',
        'Q': 'queen',
        'J': 'jack',
        '10': '10',
        '9': '9',
        '8': '8',
        '7': '7',
        '6': '6',
        '5': '5',
        '4': '4',
        '3': '3',
        '2': '2'
    };

    const fileName = `${rankMap[rank]}_of_${suit}.svg`;
    return `<img src="/cards/${fileName}" alt="${rank} of ${suit}" class="w-20 h-28 rounded-lg shadow-2xl border border-black/10 transition-transform hover:-translate-y-2 duration-300" />`;
}

// API functions
async function makeAction(action: string, amount?: number): Promise<void> {
    try {
        const response = await fetch(`/api/games/${gameId}/action`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                playerId: currentPlayerId,
                action,
                amount
            })
        });

        const result = await response.json();
        if (result.success && result.gameState) {
            currentGameState = result.gameState;
            updateGameDisplay();
        } else {
            console.error('Action failed:', result.error);
            alert(`Action failed: ${result.error}`);
        }
    } catch (error) {
        console.error('Error making action:', error);
        alert('Error making action');
    }
}

async function fetchGameState(): Promise<void> {
    try {
        console.log('Fetching game state for game ID:', gameId);
        const response = await fetch(`/api/games/${gameId}/state`);
        console.log('Response status:', response.status);

        if (response.ok) {
            const gameState = await response.json();
            console.log('Received game state:', gameState);
            if (gameState && gameState.id) {
                currentGameState = gameState;
                updateGameDisplay();
                console.log('✅ Game state updated from server');
            } else {
                console.log('⚠️ Game state is invalid:', gameState);
            }
        } else if (response.status === 404) {
            // Game hasn't started yet, keep waiting
            console.log('⏳ Game not started yet (404), waiting...');
        } else {
            console.log('❌ Unexpected response status:', response.status);
        }
    } catch (error) {
        console.error('❌ Error fetching game state:', error);
    }
}

async function startGame(): Promise<void> {
    try {
        const response = await fetch(`/api/games/${gameId}/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        const result = await response.json();
        if (result.success && result.gameState) {
            currentGameState = result.gameState;
            updateGameDisplay();
            // Remove start button
            const startBtn = document.getElementById('startGameBtn');
            if (startBtn) startBtn.remove();
        } else {
            alert(`Failed to start game: ${result.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error starting game:', error);
        alert('Error starting game');
    }
}

function updateGameDisplay(): void {
    if (!currentGameState) {
        // No game state - hide pot, show waiting message
        const waitingMessage = document.getElementById('waitingMessage');
        if (waitingMessage) {
            waitingMessage.style.display = 'block';
        }
        const potDisplay = document.getElementById('potDisplay');
        if (potDisplay) {
            potDisplay.style.display = 'none';
        }
        console.log('No game state available yet');
        return;
    }

    // Log game state output
    console.log('=== GAME STATE OUTPUT ===');
    console.log('Game ID:', currentGameState.id);
    console.log('Phase:', currentGameState.phase);
    console.log('Pot:', currentGameState.pot);
    console.log('Current Bet:', currentGameState.currentBet);
    console.log('Players:', currentGameState.players.map(p => ({
        name: p.name,
        chips: p.chips,
        cards: p.cards,
        currentBet: p.currentBet,
        folded: p.folded
    })));
    console.log('Community Cards:', currentGameState.communityCards);
    console.log('Current Player Index:', currentGameState.currentPlayerIndex);
    if (currentGameState.winners.length > 0) {
        console.log('Winners:', currentGameState.winners);
    }
    console.log('========================');

    // Hide waiting message when game starts
    const waitingMessage = document.getElementById('waitingMessage');
    if (waitingMessage) {
        waitingMessage.style.display = 'none';
    }

    // Show pot display only when game has started
    const potDisplay = document.getElementById('potDisplay');
    if (potDisplay) {
        potDisplay.style.display = 'flex';
    }

    updatePot();
    updateCommunityCards();
    updatePlayerDisplays();
    updateActionButtons();
    updateGamePhase();
}

function updatePot(): void {
    const potElement = document.querySelector('.text-yellow-400.font-bold.text-4xl');
    if (potElement && currentGameState) {
        potElement.textContent = `$${currentGameState.pot}`;
    }
}

function updateCommunityCards(): void {
    if (!currentGameState) return;

    const communityCardsContainer = document.getElementById('communityCards');
    if (communityCardsContainer && currentGameState.communityCards.length > 0) {
        communityCardsContainer.innerHTML = currentGameState.communityCards
            .map(card => createCard(card.rank, card.suit))
            .join('');
    }
}

function updatePlayerDisplays(): void {
    if (!currentGameState) return;

    currentGameState.players.forEach((player, index) => {
        const chipElements = document.querySelectorAll('.text-green-400.font-bold');
        if (chipElements[index]) {
            chipElements[index].textContent = `$${player.chips}`;
        }

        if (player.id === currentPlayerId && player.cards.length === 2) {
            const cardElements = document.querySelectorAll('.w-24.h-32');
            if (cardElements.length >= 2) {
                const card1 = cardElements[0] as HTMLImageElement;
                const card2 = cardElements[1] as HTMLImageElement;

                card1.src = `/cards/${getCardFileName(player.cards[0])}`;
                card1.alt = `${player.cards[0].rank} of ${player.cards[0].suit}`;

                card2.src = `/cards/${getCardFileName(player.cards[1])}`;
                card2.alt = `${player.cards[1].rank} of ${player.cards[1].suit}`;
            }
        }
    });
}

function getCardFileName(card: Card): string {
    const rankMap: { [key: string]: string } = {
        'A': 'ace',
        'K': 'king',
        'Q': 'queen',
        'J': 'jack',
        '10': '10',
        '9': '9',
        '8': '8',
        '7': '7',
        '6': '6',
        '5': '5',
        '4': '4',
        '3': '3',
        '2': '2'
    };
    return `${rankMap[card.rank]}_of_${card.suit}.svg`;
}

function updateActionButtons(): void {
    if (!currentGameState) return;

    const currentPlayer = currentGameState.players[currentGameState.currentPlayerIndex];
    const isMyTurn = currentPlayer?.id === currentPlayerId;

    const foldBtn = document.getElementById('foldBtn') as HTMLButtonElement;
    const checkBtn = document.getElementById('checkBtn') as HTMLButtonElement;
    const raiseBtn = document.getElementById('raiseBtn') as HTMLButtonElement;
    const betSlider = document.getElementById('betSlider') as HTMLInputElement;

    if (foldBtn) foldBtn.disabled = !isMyTurn;
    if (checkBtn) checkBtn.disabled = !isMyTurn;
    if (raiseBtn) raiseBtn.disabled = !isMyTurn;
    if (betSlider) betSlider.disabled = !isMyTurn;

    if (checkBtn) {
        const myPlayer = currentGameState.players.find(p => p.id === currentPlayerId);
        const callAmount = currentGameState.currentBet - (myPlayer?.currentBet || 0);
        checkBtn.textContent = callAmount > 0 ? 'CALL' : 'CHECK';
    }
}

function updateGamePhase(): void {
    if (!currentGameState) return;

    if (currentGameState.phase === 'ended' && currentGameState.winners.length > 0) {
        const winnerText = currentGameState.winners
            .map(w => {
                const player = currentGameState!.players.find(p => p.id === w.playerId);
                return `${player?.name || w.playerId} wins $${w.amount} with ${w.hand}`;
            })
            .join(', ');

        setTimeout(() => {
            alert(`Hand ended! ${winnerText}`);
            showNewHandButton();
        }, 1000);
    }
}

// Global variables for owner check
let isGameOwner = false;

// Initialize game
document.addEventListener('DOMContentLoaded', () => {
    // Get game data from server
    const gameData = (window as any).gameData;
    console.log('=== GAME INITIALIZATION ===');
    console.log('Game data from server:', gameData);

    if (gameData) {
        gameId = gameData.gameId;
        isGameOwner = gameData.isOwner || false;
        console.log('Game ID:', gameId);
        console.log('Is game owner:', isGameOwner);
        console.log('Initial game state:', gameData.gameState);

        if (gameData.gameState) {
            currentGameState = gameData.gameState;
            updateGameDisplay();
        } else {
            // No game state yet - ensure pot is hidden
            const potDisplay = document.getElementById('potDisplay');
            if (potDisplay) {
                potDisplay.style.display = 'none';
            }
            const waitingMessage = document.getElementById('waitingMessage');
            if (waitingMessage) {
                waitingMessage.style.display = 'block';
            }
        }
    } else {
        const pathParts = window.location.pathname.split('/');
        gameId = parseInt(pathParts[pathParts.length - 1]) || 1;
    }

    const foldBtn = document.getElementById('foldBtn');
    const checkBtn = document.getElementById('checkBtn');
    const raiseBtn = document.getElementById('raiseBtn');
    const betSlider = document.getElementById('betSlider') as HTMLInputElement;

    foldBtn?.addEventListener('click', () => {
        makeAction('fold');
    });

    checkBtn?.addEventListener('click', () => {
        if (!currentGameState) return;

        const currentPlayer = currentGameState.players.find(p => p.id === currentPlayerId);
        const callAmount = currentGameState.currentBet - (currentPlayer?.currentBet || 0);

        if (callAmount > 0) {
            makeAction('call');
        } else {
            makeAction('check');
        }
    });

    raiseBtn?.addEventListener('click', () => {
        const amount = parseInt(betSlider?.value || '50');
        makeAction('raise', amount);
    });

    // Show player list if game hasn't started
    if (!currentGameState) {
        showPlayerList();
        // Show start button if owner
        if (isGameOwner) {
            showStartGameButton();
        }
    }

    // Fetch game state immediately and then every 1 second (faster polling)
    fetchGameState();
    setInterval(fetchGameState, 1000); // Changed from 2000 to 1000ms
});

async function joinGameAPI(): Promise<boolean> {
    try {
        const response = await fetch(`/api/games/${gameId}/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({})
        });

        const result = await response.json();
        if (result.success) {
            // Check if game auto-started
            if (result.autoStarted && result.gameState) {
                currentGameState = result.gameState;
                updateGameDisplay();
            }
            return true;
        } else {
            alert(`Failed to join: ${result.error}`);
            return false;
        }
    } catch (error) {
        console.error('Error joining game:', error);
        alert('Error joining game');
        return false;
    }
}

function showStartGameButton(): void {
    // Don't create if already exists
    if (document.getElementById('startGameBtn')) return;

    const startGameBtn = document.createElement('button');
    startGameBtn.id = 'startGameBtn';
    startGameBtn.innerHTML = `
        <div class="flex items-center gap-2">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/>
            </svg>
            <span>Start Game</span>
        </div>
    `;
    startGameBtn.className = 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white px-8 py-4 rounded-xl fixed top-4 right-4 z-50 font-bold shadow-2xl transition-all hover:scale-105 border-2 border-green-400';
    startGameBtn.addEventListener('click', startGame);
    document.body.appendChild(startGameBtn);
}

function showNewHandButton(): void {
    // Remove existing button if any
    const existingBtn = document.getElementById('newHandBtn');
    if (existingBtn) existingBtn.remove();

    const newHandBtn = document.createElement('button');
    newHandBtn.id = 'newHandBtn';
    newHandBtn.textContent = 'Start New Hand';
    newHandBtn.className = 'bg-purple-500 hover:bg-purple-600 text-white px-6 py-3 rounded-lg fixed top-20 right-4 z-50 font-semibold shadow-lg';
    newHandBtn.addEventListener('click', async () => {
        try {
            const response = await fetch(`/api/games/${gameId}/new-hand`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            const result = await response.json();
            if (result.success && result.gameState) {
                currentGameState = result.gameState;
                updateGameDisplay();
                newHandBtn.remove();
            }
        } catch (error) {
            console.error('Error starting new hand:', error);
        }
    });
    document.body.appendChild(newHandBtn);
}

async function showPlayerList(): Promise<void> {
    const playerListDiv = document.createElement('div');
    playerListDiv.id = 'playerList';
    playerListDiv.className = 'fixed top-4 left-4 bg-white rounded-lg shadow-lg p-4 z-50';
    playerListDiv.innerHTML = '<h3 class="font-bold text-lg mb-2">Players in Lobby</h3><div id="playerListContent">Loading...</div>';
    document.body.appendChild(playerListDiv);

    // Update player list periodically
    const updatePlayerList = async () => {
        try {
            const response = await fetch(`/api/games/${gameId}/players`);
            if (response.ok) {
                const data = await response.json();
                const content = document.getElementById('playerListContent');
                if (content) {
                    if (data.players.length === 0) {
                        content.innerHTML = '<p class="text-gray-500 text-sm">No players yet</p>';
                    } else {
                        content.innerHTML = data.players.map((p: string) =>
                            `<div class="flex items-center gap-2 py-1">
                                <div class="w-2 h-2 bg-green-500 rounded-full"></div>
                                <span class="text-sm">${p}</span>
                            </div>`
                        ).join('') + `<p class="text-xs text-gray-500 mt-2">${data.players.length}/${data.maxPlayers} players</p>`;
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching player list:', error);
        }
    };

    updatePlayerList();
    const interval = setInterval(updatePlayerList, 2000);

    // Clean up when game starts
    const checkGameStarted = setInterval(() => {
        if (currentGameState) {
            clearInterval(interval);
            clearInterval(checkGameStarted);
            const list = document.getElementById('playerList');
            if (list) list.remove();
        }
    }, 500);
}

// Join/start game UI removed - focusing on game output display