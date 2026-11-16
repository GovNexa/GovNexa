import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
export default defineConfig({ session: false, adapter: cloudflare({ prerenderEnvironment: "node", imageService: "passthrough" }), site: 'https://govnexa.com.br', trailingSlash:'always', vite:{ build:{ rollupOptions:{ output:{ hashCharacters:'hex' } } } }, integrations:[sitemap({ filter: (page) => !/^\/(plataforma|entrar)(\/|$)/.test(new URL(page).pathname) })] });
