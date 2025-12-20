/**
 * Game Initialization - Entry point for game page
 */

import { registerGameRoomListeners } from './games/gameRoom';
import { initializePokerGame, initializePokerSocket } from './games/poker';

// Make functions available globally
(window as any).initializeGame = function (gameId: number, userId: number) {
    console.log('[GameInit] Initializing with gameId:', gameId, 'userId:', userId);

    if (!gameId || !userId) {
        console.error('[GameInit] Missing gameId or userId');
        return;
    }

    try {
        // Initialize poker socket (this will be shared)
        console.log('[GameInit] Initializing poker socket...');
        const socket = initializePokerSocket();

        // Register game room listeners on the same socket
        console.log('[GameInit] Registering game room listeners...');
        registerGameRoomListeners(socket, gameId, userId);

        // Initialize poker game for gameplay
        console.log('[GameInit] Initializing poker game...');
        initializePokerGame(gameId, userId);

        console.log('[GameInit] All modules initialized successfully');
    } catch (error) {
        console.error('[GameInit] Initialization error:', error);
    }
};

console.log('[GameInit] Module loaded, initializeGame function is ready');
