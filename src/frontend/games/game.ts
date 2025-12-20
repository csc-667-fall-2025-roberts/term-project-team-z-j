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

// Load game details and render players
async function loadGameDetails(gameId: string) {
    try {
        const response = await fetch(`/api/games/${gameId}`);
        const data = await response.json();

        if (data.room) {
            console.log('Game room:', data.room);
            console.log('Players:', data.players);
            renderPlayers(data.players);
        }
    } catch (error) {
        console.error('Failed to load game details:', error);
    }
}

// Render players dynamically
function renderPlayers(players: any[]) {
    // Get current user ID from the page
    const userId = (window as any).currentUserId;

    // Define player positions around the table
    const allPositions = [
        'bottom-0 left-1/2 transform -translate-x-1/2 translate-y-20',
        'left-0 top-1/2 transform -translate-y-1/2 -translate-x-16',
        'top-0 left-1/2 transform -translate-x-1/2 -translate-y-16',
        'right-0 top-1/2 transform -translate-y-1/2 translate-x-16',
        'left-[15%] top-[15%] transform -translate-x-12 -translate-y-12',
        'right-[15%] top-[15%] transform translate-x-12 -translate-y-12',
        'left-[15%] bottom-[15%] transform -translate-x-12 translate-y-12',
        'right-[15%] bottom-[15%] transform translate-x-12 translate-y-12',
    ];

    // Position mapping based on player count
    const visualPositionMap: { [key: number]: number[] } = {
        2: [0, 2],
        3: [0, 1, 3],
        4: [0, 1, 2, 3],
        5: [0, 1, 2, 3, 6],
        6: [0, 1, 2, 3, 6, 7],
        7: [0, 1, 4, 2, 5, 3, 6],
        8: [0, 1, 4, 2, 5, 3, 6, 7]
    };

    // Sort players by position
    const sortedPlayers = [...players].sort((a, b) => a.position - b.position);

    // Find current user in sorted list
    const currentUserIndex = sortedPlayers.findIndex((p: any) => p.user_id === userId);

    // Reorder so current user is first
    const reorderedPlayers: any[] = [];
    for (let i = 0; i < sortedPlayers.length; i++) {
        const index = (currentUserIndex + i) % sortedPlayers.length;
        reorderedPlayers.push(sortedPlayers[index]);
    }

    const playerCount = reorderedPlayers.length;
    const positionIndices = visualPositionMap[playerCount] || visualPositionMap[8];

    // Find the table container
    const tableContainer = document.querySelector('.relative.w-full.h-full');
    if (!tableContainer) return;

    // Remove existing player elements
    const existingPlayers = tableContainer.querySelectorAll('[data-player]');
    existingPlayers.forEach(el => el.remove());

    // Render each player
    reorderedPlayers.forEach((player: any, index: number) => {
        const positionIndex = positionIndices[index];
        const isCurrentUser = player.user_id === userId;

        const playerDiv = document.createElement('div');
        playerDiv.setAttribute('data-player', player.user_id);
        playerDiv.className = `absolute ${allPositions[positionIndex]} flex flex-col items-center ${isCurrentUser ? 'gap-2' : 'gap-1.5'}`;

        playerDiv.innerHTML = `
            <!-- Cards -->
            <div class="flex ${isCurrentUser ? 'gap-2 mb-1' : 'gap-1 mb-0.5'}">
                ${isCurrentUser ? `
                    <img src="/cards/ace_of_spades.svg" alt="Card" class="w-20 h-28 rounded-lg shadow-2xl transform hover:scale-105 transition-transform" style="filter: drop-shadow(0 8px 16px rgba(0,0,0,0.4));" />
                    <img src="/cards/king_of_hearts.svg" alt="Card" class="w-20 h-28 rounded-lg shadow-2xl transform hover:scale-105 transition-transform" style="filter: drop-shadow(0 8px 16px rgba(0,0,0,0.4));" />
                ` : `
                    <img src="/cards/back_card.jpg" alt="Card Back" class="w-14 h-20 rounded-md shadow-lg" style="filter: drop-shadow(0 4px 8px rgba(0,0,0,0.4));" />
                    <img src="/cards/back_card.jpg" alt="Card Back" class="w-14 h-20 rounded-md shadow-lg" style="filter: drop-shadow(0 4px 8px rgba(0,0,0,0.4));" />
                `}
            </div>
            <!-- Player Info -->
            ${isCurrentUser ? `
                <div class="bg-gradient-to-r from-gray-900 to-black rounded-full px-4 py-2 flex items-center gap-2.5 shadow-xl" style="border: 3px solid #fbbf24; box-shadow: 0 6px 16px rgba(0,0,0,0.5), 0 0 16px rgba(251, 191, 36, 0.3);">
                    <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${player.username}" alt="${player.username}" class="w-9 h-9 rounded-full border-2 border-white shadow-lg" />
                    <div class="text-left">
                        <div class="text-white font-bold text-xs tracking-wide">You</div>
                        <div class="text-green-400 font-bold text-sm">$1,500</div>
                    </div>
                </div>
            ` : `
                <div class="bg-gradient-to-r from-gray-900 to-black rounded-full px-3 py-1.5 flex items-center gap-2 shadow-lg" style="border: 2px solid #4b5563; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
                    <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${player.username}" alt="${player.username}" class="w-8 h-8 rounded-full border-2 border-white shadow-md" />
                    <div class="text-left">
                        <div class="text-white font-bold text-xs">${player.username}</div>
                        <div class="text-green-400 font-bold text-xs">$1,500</div>
                    </div>
                </div>
            `}
        `;

        tableContainer.appendChild(playerDiv);
    });
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
        // Reload game details to update player list
        if (gameState.gameId) {
            loadGameDetails(gameState.gameId);
        }
    });

    socket.on('room:player:left', (data) => {
        console.log('Player left:', data);
        // Reload game details to update player list
        if (gameState.gameId) {
            loadGameDetails(gameState.gameId);
        }
    });

    socket.on('game:started', (data) => {
        console.log('Game started:', data);
        // Reload page to update game state
        window.location.reload();
    });

    socket.on('room:message:new', (data) => {
        console.log('New message:', data);
        // Update chat UI
    });
});
