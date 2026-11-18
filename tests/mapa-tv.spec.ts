import { expect, test } from '@playwright/test';
import { GOIANIA } from '../src/lib/mapa/geo.ts';

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

test('painel fica abaixo do mapa em 390 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  await page.goto('/plataforma/gestao/');

  const mapa = await page.locator('[data-mp-mapa]').boundingBox();
  const painel = await page.locator('[data-mp-painel]').boundingBox();
  const alturaEsperada = await page.evaluate(() => innerHeight * 0.6);
  expect(mapa).not.toBeNull();
  expect(painel).not.toBeNull();
  expect(Math.abs(mapa!.height - alturaEsperada)).toBeLessThan(2);
  expect(painel!.y).toBeGreaterThanOrEqual(mapa!.y + mapa!.height);
});

test('obra selecionada ganha destaque e perde ao voltar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  await page.goto('/plataforma/gestao/');
  await page.evaluate((centro) => sessionStorage.setItem('govnexa-localizacao-simulacao', JSON.stringify({
    'P-905': { tipo: 'ponto', ponto: centro, endereco: null },
  })), GOIANIA.centro);
  await page.reload();

  const mapa = page.locator('[data-mapa-obras]');
  await mapa.locator('.mp-bolha').first().click();
  await mapa.locator('.mp-painel-lista .mp-item').filter({ hasText: 'Aquisição de Equipamentos Exemplo F' }).click();
  await expect(mapa.locator('.mp-marcador-selecionado')).toHaveCount(1);
  await mapa.getByRole('button', { name: 'Voltar' }).click();
  await expect(mapa.locator('.mp-marcador-selecionado')).toHaveCount(0);
});
