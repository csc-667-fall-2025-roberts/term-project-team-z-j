import { defineConfig } from 'vite';

export default defineConfig({
    root: 'src/frontend',
    publicDir: '../../public',
    server: {
        middlewareMode: true,
    },
    optimizeDeps: {
        include: [],
    },
    build: {
        outDir: '../../dist/frontend',
        emptyDir: true,
        rollupOptions: {
            input: {
                main: 'src/frontend/main.ts',
                poker: 'src/frontend/games/poker.ts',
            },
        },
    },
});
