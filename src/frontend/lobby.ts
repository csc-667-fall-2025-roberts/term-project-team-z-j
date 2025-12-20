// Lobby client-side functionality
import { io } from 'socket.io-client';

const socket = io();

// Fetch and display games
async function loadGames() {
    try {
        const response = await fetch('/api/games');
        const data = await response.json();

        if (data.games && data.games.length > 0) {
            displayGames(data.games);
        }
    } catch (error) {
        console.error('Failed to load games:', error);
    }
}

// Display games in the UI
function displayGames(games: any[]) {
    const gamesContainer = document.querySelector('.space-y-3');
    if (!gamesContainer) return;

    const gamesHTML = games.map(game => `
    <div class="bg-gray-50 border-2 border-gray-200 rounded-lg p-4 hover:border-blue-400 transition-all duration-300">
      <div class="flex items-center justify-between">
        <div class="flex-1">
          <h3 class="text-lg font-semibold text-gray-800">${game.name}</h3>
          <div class="flex items-center gap-4 mt-2 text-sm text-gray-600">
            <span class="flex items-center gap-1">
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
              </svg>
              ${game.player_count || 0}/${game.max_players} Players
            </span>
            <span class="px-2 py-1 bg-${game.status === 'waiting' ? 'green' : 'yellow'}-100 text-${game.status === 'waiting' ? 'green' : 'yellow'}-700 rounded-full text-xs font-medium">
              ${game.status === 'waiting' ? 'Waiting' : 'In Progress'}
            </span>
          </div>
        </div>
        ${game.status === 'waiting' ? `
          <button
            onclick="location.href='/games/${game.id}'"
            class="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-6 py-2 rounded-full transition-all duration-300"
          >
            Join
          </button>
        ` : `
          <button
            onclick="location.href='/games/${game.id}'"
            class="bg-gray-400 hover:bg-gray-500 text-white font-semibold px-6 py-2 rounded-full transition-all duration-300"
          >
            Spectate
          </button>
        `}
      </div>
    </div>
  `).join('');

    gamesContainer.innerHTML = gamesHTML;
}

// Listen for new games
socket.on('lobby:game:new', (game) => {
    console.log('New game created:', game);
    loadGames(); // Reload games list
});

// Load games on page load
document.addEventListener('DOMContentLoaded', () => {
    loadGames();
});
