import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
export default defineConfig({ site: 'https://govnexa.com.br', trailingSlash:'always', vite:{ build:{ rollupOptions:{ output:{ hashCharacters:'hex' } } } }, integrations:[sitemap({ filter: (page) => !/^\/(plataforma|entrar)(\/|$)/.test(new URL(page).pathname) })] });
