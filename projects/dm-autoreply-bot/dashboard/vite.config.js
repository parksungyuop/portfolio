import { defineConfig } from 'vite';

// base './' → public_html/ig/dash/ 처럼 하위 경로 어디에 올려도 동작
export default defineConfig({ base: './', build: { outDir: 'dist', emptyOutDir: true } });
