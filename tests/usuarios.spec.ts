import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('usuários: administrador vê a lista, sem rolagem horizontal e com acessibilidade', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/plataforma/usuarios/');
  await expect(page.getByRole('heading', { name: 'Usuários com acesso' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'dev@exemplo.invalid' })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'Administrador local' })).toBeVisible();
  await expect(page.locator('a[href="/plataforma/usuarios/"]').first()).toBeAttached();
  for (const largura of [1280, 390]) {
    await page.setViewportSize({ width: largura, height: 800 });
    const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sobra).toBeLessThanOrEqual(0);
  }
  const resultado = await new AxeBuilder({ page }).include('main').analyze();
  expect(resultado.violations).toEqual([]);
});
