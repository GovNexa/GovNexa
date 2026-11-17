import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('página inicial: mensagem principal, entrada da plataforma e ciclo do projeto', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('obra entregue');
  await expect(page.locator('.gx-hero').getByRole('link', { name: /Entrar na plataforma/ })).toHaveAttribute('href', '/plataforma/');
  await expect(page.getByRole('heading', { name: 'Módulos que conversam entre si.' })).toBeVisible();
  await expect(page.locator('.gx-step')).toHaveCount(7);
  // A ficha acompanha a etapa em leitura.
  await page.locator('.gx-step[data-i="3"]').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await expect(page.locator('#fNome')).toHaveText('Contratação');
  await expect(page.locator('#fNum')).toHaveText('03');
});

test('página inicial: sem rolagem horizontal e acessível nos temas claro e escuro', async ({ page }) => {
  // Sem animação: o contraste é medido no estado final, não no meio da entrada.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const tema of ['light', 'dark']) {
    await page.addInitScript((t) => { try { localStorage.setItem('govnexa-theme', t); } catch {} }, tema);
    for (const largura of [1280, 390]) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', tema);
      const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(sobra, `${tema} ${largura}px`).toBeLessThanOrEqual(0);
      // A página corta o que transborda (overflow: clip); por isso confere também que nada passa da borda.
      const cortados = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('.gx h1, .gx h2, .gx h3, .gx .gx-btn, .gx .gx-glass'))
        .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1); })
        .map((el) => (el.textContent || '').trim().slice(0, 40)));
      expect(cortados, `${tema} ${largura}px`).toEqual([]);
      const r = await new AxeBuilder({ page }).include('.gx').analyze();
      expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 4).join(' | ')}`), `${tema} ${largura}px`).toEqual([]);
    }
  }
});
