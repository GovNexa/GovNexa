import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('painel de detalhes: abre, navega e fecha devolvendo o foco (tabela genérica)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/plataforma/projetos-cronogramas/');
  const abrir = page.locator('tbody [data-row]').first().getByRole('button', { name: 'Ver detalhes' });
  await abrir.click();
  const painel = page.getByRole('dialog');
  await expect(painel).toBeVisible();
  const titulo = painel.locator('#record-title');
  await expect(titulo).toBeFocused();
  const primeiro = await titulo.textContent() ?? '';
  await expect(painel.getByRole('button', { name: 'Registro anterior' })).toBeDisabled();
  await painel.getByRole('button', { name: 'Próximo registro' }).click();
  await expect(titulo).not.toHaveText(primeiro);
  await page.keyboard.press('ArrowLeft');
  await expect(titulo).toHaveText(primeiro);
  for (const tema of ['light', 'dark'] as const) {
    await page.evaluate((valor) => { document.documentElement.dataset.theme = valor; }, tema);
    const a11y = await new AxeBuilder({ page }).include('#record-dialog').analyze();
    expect(a11y.violations.filter((violacao) => ['serious', 'critical'].includes(violacao.impact ?? '')), tema).toEqual([]);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(painel).toBeHidden();
  await expect(abrir).toBeFocused();
});

test('painel de detalhes mantém fallback de tabelas sem dados detalhados', async ({ page }) => {
  await page.goto('/plataforma/atas/');
  await page.getByRole('button', { name: 'Ver detalhes' }).first().click();

  const painel = page.getByRole('dialog');
  await expect(painel).toBeVisible();
  await expect(painel.locator('#record-code')).toHaveText('ARP 001/2026');
  await expect(painel.getByRole('heading', { level: 2 })).toHaveText('PE 045/2026 – SME');
  await expect(painel.getByRole('heading', { level: 3, name: 'Dados' })).toBeVisible();
  await expect(painel.locator('.rd-definition').filter({ hasText: 'Valor unitário' })).toContainText(/R\$\s*42,50/);
  await expect(painel.locator('.rd-definition').filter({ hasText: 'Valor total' })).toContainText(/R\$\s*4\.250,00/);
});
