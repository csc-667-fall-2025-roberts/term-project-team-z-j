import { defineConfig } from 'vite';

export default defineConfig({
    root: 'src/frontend',
    server: {
        middlewareMode: true,
    },
    optimizeDeps: {
        include: [],
    },
    build: {
        rollupOptions: {
            input: {
                main: 'src/frontend/main.ts',
                game: 'src/frontend/games/game.ts'
            },
        },
    },
});
