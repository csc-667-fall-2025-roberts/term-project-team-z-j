/**
 * Game Room Client - Handles real-time updates for players joining/leaving
 * and game state synchronization
 */

/**
 * Get available position classes for player placement
 */
function getPositionClasses(): string[] {
    return [
        'bottom-0 left-1/2 transform -translate-x-1/2 translate-y-20',  // Position 0 - Bottom
        'left-0 top-1/2 transform -translate-y-1/2 -translate-x-16',   // Position 1 - Left
        'top-0 left-1/2 transform -translate-x-1/2 -translate-y-16',   // Position 2 - Top
        'right-0 top-1/2 transform -translate-y-1/2 translate-x-16',   // Position 3 - Right
        'left-[15%] top-[15%] transform -translate-x-12 -translate-y-12', // Position 4 - Top-Left
        'right-[15%] top-[15%] transform translate-x-12 -translate-y-12', // Position 5 - Top-Right
        'left-[15%] bottom-[15%] transform -translate-x-12 translate-y-12', // Position 6 - Bottom-Left
        'right-[15%] bottom-[15%] transform translate-x-12 translate-y-12', // Position 7 - Bottom-Right
    ];
}

/**
 * Get visual position index based on player count
 */
function getVisualPositionIndex(playerIndex: number, totalPlayers: number): number {
    const visualPositionMap: { [key: number]: number[] } = {
        2: [0, 2],           // Bottom, Top
        3: [0, 1, 3],        // Bottom, Left, Right
        4: [0, 1, 2, 3],     // Bottom, Left, Top, Right
        5: [0, 1, 2, 3, 6],  // Add Bottom-Left
        6: [0, 1, 2, 3, 6, 7], // Add Bottom-Right
        7: [0, 1, 4, 2, 5, 3, 6], // Add Top-Left
        8: [0, 1, 4, 2, 5, 3, 6, 7] // All positions
    };

    const positions = visualPositionMap[totalPlayers] || visualPositionMap[8];
    return positions[playerIndex] || 0;
}

/**
 * Create a player element
 */
function createPlayerElement(player: any, isCurrentUser: boolean, visualPosition: number): HTMLElement {
    const positionClasses = getPositionClasses();
    const div = document.createElement('div');

    div.setAttribute('data-player', player.user_id.toString());
    div.setAttribute('data-position', player.position.toString());
    div.setAttribute('data-visual-position', visualPosition.toString());
    div.className = `absolute ${positionClasses[visualPosition]} flex flex-col items-center ${isCurrentUser ? 'gap-2' : 'gap-1.5'}`;

    // Create cards container
    const cardsDiv = document.createElement('div');
    cardsDiv.className = `flex ${isCurrentUser ? 'gap-2 mb-1' : 'gap-1 mb-0.5'}`;

    if (isCurrentUser) {
        // Current user sees their cards (placeholder)
        cardsDiv.innerHTML = `
            <img src="/cards/ace_of_spades.svg" alt="Card" class="w-20 h-28 rounded-lg shadow-2xl transform hover:scale-105 transition-transform" style="filter: drop-shadow(0 8px 16px rgba(0,0,0,0.4));" />
            <img src="/cards/king_of_hearts.svg" alt="Card" class="w-20 h-28 rounded-lg shadow-2xl transform hover:scale-105 transition-transform" style="filter: drop-shadow(0 8px 16px rgba(0,0,0,0.4));" />
        `;
    } else {
        // Other players show card backs
        cardsDiv.innerHTML = `
            <img src="/cards/back_card.jpg" alt="Card Back" class="w-14 h-20 rounded-md shadow-lg" style="filter: drop-shadow(0 4px 8px rgba(0,0,0,0.4));" />
            <img src="/cards/back_card.jpg" alt="Card Back" class="w-14 h-20 rounded-md shadow-lg" style="filter: drop-shadow(0 4px 8px rgba(0,0,0,0.4));" />
        `;
    }

    // Create player info
    const infoDiv = document.createElement('div');
    if (isCurrentUser) {
        infoDiv.className = 'bg-gradient-to-r from-gray-900 to-black rounded-full px-4 py-2 flex items-center gap-2.5 shadow-xl';
        infoDiv.style.border = '3px solid #fbbf24';
        infoDiv.style.boxShadow = '0 6px 16px rgba(0,0,0,0.5), 0 0 16px rgba(251, 191, 36, 0.3)';
        infoDiv.innerHTML = `
            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${player.username}" alt="${player.username}" class="w-9 h-9 rounded-full border-2 border-white shadow-lg" />
            <div class="text-left">
                <div class="text-white font-bold text-xs tracking-wide">You</div>
                <div class="text-green-400 font-bold text-sm">$1,500</div>
            </div>
        `;
    } else {
        infoDiv.className = 'bg-gradient-to-r from-gray-900 to-black rounded-full px-3 py-1.5 flex items-center gap-2 shadow-lg';
        infoDiv.style.border = '2px solid #4b5563';
        infoDiv.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
        infoDiv.innerHTML = `
            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${player.username}" alt="${player.username}" class="w-8 h-8 rounded-full border-2 border-white shadow-md" />
            <div class="text-left">
                <div class="text-white font-bold text-xs">${player.username}</div>
                <div class="text-green-400 font-bold text-xs">$1,500</div>
            </div>
        `;
    }

    div.appendChild(cardsDiv);
    div.appendChild(infoDiv);

    return div;
}

/**
 * Update player display dynamically
 */
async function updatePlayerDisplay(roomId: number, currentUserId: number): Promise<void> {
    try {
        console.log('[GameRoom] Fetching player list for room:', roomId);

        // Fetch current players from server
        const response = await fetch(`/api/games/${roomId}`);
        const data = await response.json();

        if (!data.players) {
            console.error('[GameRoom] No players data received');
            return;
        }

        const players = data.players;
        console.log('[GameRoom] Updating player display with', players.length, 'players:', players);

        // Find the table surface
        const tableSurface = document.getElementById('pokerTableSurface');
        if (!tableSurface) {
            console.error('[GameRoom] Table surface not found');
            return;
        }

        // Remove all existing player elements
        const existingPlayers = tableSurface.querySelectorAll('[data-player]');
        console.log('[GameRoom] Removing', existingPlayers.length, 'existing player elements');
        existingPlayers.forEach(el => el.remove());

        // Sort players by position
        const sortedPlayers = [...players].sort((a: any, b: any) => a.position - b.position);

        // Find current user index
        const currentUserIndex = sortedPlayers.findIndex((p: any) => p.user_id === currentUserId);
        console.log('[GameRoom] Current user index:', currentUserIndex);

        // Reorder so current user is first
        const reorderedPlayers: any[] = [];
        for (let i = 0; i < sortedPlayers.length; i++) {
            const index = (currentUserIndex + i) % sortedPlayers.length;
            reorderedPlayers.push(sortedPlayers[index]);
        }

        console.log('[GameRoom] Reordered players:', reorderedPlayers.map((p: any) => p.username));

        // Create and add player elements
        reorderedPlayers.forEach((player: any, index: number) => {
            const isCurrentUser = player.user_id === currentUserId;
            const visualPosition = getVisualPositionIndex(index, reorderedPlayers.length);
            console.log(`[GameRoom] Creating element for ${player.username} at visual position ${visualPosition}`);
            const playerElement = createPlayerElement(player, isCurrentUser, visualPosition);
            tableSurface.appendChild(playerElement);
        });

        console.log('[GameRoom] Player display updated successfully');
    } catch (error) {
        console.error('[GameRoom] Failed to update player display:', error);
    }
}

/**
 * Add a notification message to the UI
 */
function showNotification(message: string, type: 'info' | 'success' | 'warning' = 'info'): void {
    console.log('[GameRoom] Showing notification:', message);

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `fixed top-20 right-4 px-6 py-3 rounded-lg shadow-lg text-white font-semibold z-50`;
    notification.style.animation = 'slideIn 0.3s ease-out';

    // Set color based on type
    switch (type) {
        case 'success':
            notification.style.backgroundColor = '#10b981';
            break;
        case 'warning':
            notification.style.backgroundColor = '#f59e0b';
            break;
        default:
            notification.style.backgroundColor = '#3b82f6';
    }

    notification.textContent = message;
    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s';
        setTimeout(() => {
            if (notification.parentNode) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

/**
 * Register game room event listeners on the shared poker socket
 */
export function registerGameRoomListeners(socket: any, roomId: number, currentUserId: number): void {
    console.log('[GameRoom] Registering game room listeners for room:', roomId, 'user:', currentUserId);

    // Player joined event
    socket.on('room:player:joined', (data: any) => {
        console.log('[GameRoom] ===== PLAYER JOINED EVENT RECEIVED =====');
        console.log('[GameRoom] Player joined data:', data);
        showNotification(`${data.username || 'A player'} joined the game`, 'success');

        // Update player display dynamically
        setTimeout(() => {
            updatePlayerDisplay(roomId, currentUserId);
        }, 500);
    });

    // Player left event
    socket.on('room:player:left', (data: any) => {
        console.log('[GameRoom] ===== PLAYER LEFT EVENT RECEIVED =====');
        console.log('[GameRoom] Player left data:', data);
        showNotification(`A player left the game`, 'warning');

        // Update player display dynamically
        setTimeout(() => {
            updatePlayerDisplay(roomId, currentUserId);
        }, 500);
    });

    // Game started event
    socket.on('game:started', (data: any) => {
        console.log('[GameRoom] ===== GAME STARTED EVENT RECEIVED =====');
        console.log('[GameRoom] Game started data:', data);
        showNotification('Game has started!', 'success');

        // Hide start button if visible
        const startBtn = document.getElementById('startGameBtn');
        if (startBtn) {
            startBtn.style.display = 'none';
        }
    });

    // Player disconnected event
    socket.on('game:player:disconnected', (data: any) => {
        console.log('[GameRoom] ===== PLAYER DISCONNECTED EVENT RECEIVED =====');
        console.log('[GameRoom] Player disconnected data:', data);
        showNotification('A player disconnected', 'warning');
    });

    console.log('[GameRoom] Game room listeners registered successfully');
}
