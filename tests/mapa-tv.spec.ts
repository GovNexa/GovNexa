import { expect, test } from '@playwright/test';

test('mapa em modo TV ocupa a tela e oferece alvos de 56 px', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  await page.goto('/plataforma/gestao/');

  const mapa = page.locator('[data-mapa-obras]');
  await mapa.getByRole('button', { name: 'Apresentar mapa' }).click();
  await expect.poll(() => mapa.evaluate((element) => element.matches(':fullscreen'))).toBe(true);
  const altura = await mapa.evaluate((element) => ({
    conteudo: element.scrollHeight,
    tela: element.clientHeight,
    itens: [...element.children].map((item) => {
      const caixa = item.getBoundingClientRect();
      return { nome: item.className, topo: Math.round(caixa.top), fim: Math.round(caixa.bottom), altura: Math.round(caixa.height) };
    }),
  }));
  expect(altura.conteudo <= altura.tela + 1, JSON.stringify(altura)).toBeTruthy();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();

  const alvos = mapa.locator('.mp-chip, .mp-btn, .mp-zoom button');
  for (const alvo of await alvos.all()) {
    const caixa = await alvo.boundingBox();
    expect(caixa).not.toBeNull();
    expect(caixa!.height).toBeGreaterThanOrEqual(56);
  }

  await page.keyboard.press('Escape');
  await expect.poll(() => mapa.evaluate((element) => element.matches(':fullscreen'))).toBe(false);
  await mapa.getByRole('button', { name: 'Apresentar mapa' }).click();
  await expect.poll(() => mapa.evaluate((element) => element.matches(':fullscreen'))).toBe(true);
  await mapa.getByRole('button', { name: 'Sair da apresentação' }).click();
  await expect.poll(() => mapa.evaluate((element) => element.matches(':fullscreen'))).toBe(false);
});
