import { io } from 'socket.io-client';

// Game state
interface GameState {
    pot: number;
    currentBet: number;
    playerChips: number;
    gameId: string | null;
}

const gameState: GameState = {
    pot: 10,
    currentBet: 0,
    playerChips: 998,
    gameId: null
};

const socket = io();

// Card rendering using actual SVG files from public/cards
function createCard(rank: string, suit: string, faceDown: boolean = false): string {
    if (faceDown) {
        return `
      <div class="w-20 h-28 bg-blue-900 rounded-lg shadow-2xl border border-white/10 relative overflow-hidden flex items-center justify-center">
        <div class="absolute inset-0 opacity-30" style="background-image: radial-gradient(#ffffff 1px, transparent 1px); background-size: 6px 6px;"></div>
        <div class="w-10 h-10 rounded-full bg-blue-500/30 z-10"></div>
      </div>
    `;
    }

    // Map rank to filename format
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

    return `
    <img src="/cards/${fileName}" alt="${rank} of ${suit}" class="w-20 h-28 rounded-lg shadow-2xl border border-black/10 transition-transform hover:-translate-y-2 duration-300" />
  `;
}

// Load game details
async function loadGameDetails(gameId: string) {
    try {
        const response = await fetch(`/api/games/${gameId}`);
        const data = await response.json();

        if (data.room) {
            console.log('Game room:', data.room);
            console.log('Players:', data.players);
            // Update UI with game details
        }
    } catch (error) {
        console.error('Failed to load game details:', error);
    }
}

// Join game room via socket
function joinGameRoom(gameId: string) {
    socket.emit('room:join', { roomId: gameId });
}

// Initialize game
document.addEventListener('DOMContentLoaded', () => {
    // Get game ID from URL
    const pathParts = window.location.pathname.split('/');
    const gameId = pathParts[pathParts.length - 1];

    if (gameId) {
        gameState.gameId = gameId;
        loadGameDetails(gameId);
        joinGameRoom(gameId);
    }

    // Action buttons
    const foldBtn = document.getElementById('foldBtn');
    const checkBtn = document.getElementById('checkBtn');
    const raiseBtn = document.getElementById('raiseBtn');

    // Sample community cards
    const communityCardsContainer = document.getElementById('communityCards');
    if (communityCardsContainer) {
        communityCardsContainer.innerHTML = `
      ${createCard('3', 'clubs')}
      ${createCard('10', 'clubs')}
      ${createCard('5', 'clubs')}
    `;
    }

    // Fold action
    foldBtn?.addEventListener('click', () => {
        console.log('Player folded');
        alert('You folded!');
    });

    // Check action
    checkBtn?.addEventListener('click', () => {
        console.log('Player checked');
        alert('You checked!');
    });

    // Raise action
    raiseBtn?.addEventListener('click', () => {
        const amount = 50; // Default raise amount
        gameState.pot += amount;
        gameState.playerChips -= amount;
        updatePot();
        console.log(`Player raised ${amount}`);
        alert(`You raised ${amount}!`);
    });

    // Update pot display
    function updatePot() {
        const potElement = document.getElementById('potAmount');
        if (potElement) {
            potElement.textContent = gameState.pot.toString();
        }
    }

    // Socket event listeners
    socket.on('room:player:joined', (data) => {
        console.log('Player joined:', data);
        // Update UI to show new player
    });

    socket.on('room:message:new', (data) => {
        console.log('New message:', data);
        // Update chat UI
    });
});
