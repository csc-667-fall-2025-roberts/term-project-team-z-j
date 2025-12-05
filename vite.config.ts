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
            input: 'src/frontend/main.ts',
        },
    },
});
