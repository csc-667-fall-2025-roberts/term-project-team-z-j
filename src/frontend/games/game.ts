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
        const response = await fetch(`/api/games/${gameId}/state`);

        if (response.ok) {
            const gameState = await response.json();
            currentGameState = gameState;
            updateGameDisplay();
        }
    } catch (error) {
        console.error('Error fetching game state:', error);
    }
}

async function startGame(): Promise<void> {
    try {
        const playerNames = ['You', 'varan307', 'PokerPro88', 'AllInAnnie'];
        const response = await fetch(`/api/games/${gameId}/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ playerNames })
        });

        const result = await response.json();
        if (result.success && result.gameState) {
            currentGameState = result.gameState;
            updateGameDisplay();
        }
    } catch (error) {
        console.error('Error starting game:', error);
    }
}

function updateGameDisplay(): void {
    if (!currentGameState) return;

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
        }, 1000);
    }
}

// Initialize game
document.addEventListener('DOMContentLoaded', () => {
    const pathParts = window.location.pathname.split('/');
    gameId = parseInt(pathParts[pathParts.length - 1]) || 1;

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

    const startGameBtn = document.createElement('button');
    startGameBtn.textContent = 'Start Game';
    startGameBtn.className = 'bg-blue-500 text-white px-4 py-2 rounded fixed top-4 right-4 z-50';
    startGameBtn.addEventListener('click', startGame);
    document.body.appendChild(startGameBtn);

    fetchGameState();
    setInterval(fetchGameState, 2000);
});