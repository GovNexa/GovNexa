import { expect, test } from '@playwright/test';
import { GOIANIA } from '../src/lib/mapa/geo.ts';

test('mapa em modo TV ocupa a tela e oferece alvos de 56 px', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  await page.goto('/plataforma/gestao/');

  const mapa = page.locator('[data-mapa-obras]');
  await mapa.getByRole('button', { name: 'Apresentar mapa' }).click();
  await expect.poll(() => mapa.evaluate((element) => element.matches(':fullscreen'))).toBe(true);
  const linhaFiltros = await mapa.locator('.mp-filtros').evaluate((linha) => {
    const controles = [...linha.querySelectorAll('.mp-filtro-abrir, .mp-acoes .mp-btn')];
    return {
      topos: controles.map((controle) => controle.getBoundingClientRect().top),
      largurasFiltros: [...linha.querySelectorAll('.mp-filtro')].map((filtro) => filtro.getBoundingClientRect().width),
    };
  });
  expect(Math.max(...linhaFiltros.topos) - Math.min(...linhaFiltros.topos)).toBeLessThanOrEqual(1);
  expect(linhaFiltros.largurasFiltros.every((largura) => largura >= 200)).toBe(true);
  const filtroEtapas = mapa.locator('[data-mp-filtro="situacoes"]');
  await filtroEtapas.locator('[data-mp-abrir]').click();
  for (const opcao of await filtroEtapas.locator('.mp-opcao-filtro').all()) {
    const caixa = await opcao.boundingBox();
    expect(caixa?.height).toBeGreaterThanOrEqual(56);
  }
  await page.keyboard.press('Escape');
  await expect(filtroEtapas.locator('[data-mp-abrir]')).toHaveAttribute('aria-expanded', 'false');
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

  const alvos = mapa.locator('.mp-btn:visible, .mp-zoom button:visible');
  for (const alvo of await alvos.all()) {
    const caixa = await alvo.boundingBox();
    expect(caixa).not.toBeNull();
    expect(caixa!.height).toBeGreaterThanOrEqual(56);
  }

  await page.keyboard.press('Escape');
  await expect.poll(() => mapa.evaluate((element) => element.matches(':fullscreen'))).toBe(false);
  await mapa.getByRole('button', { name: 'Apresentar mapa' }).click();
  await expect.poll(() => mapa.evaluate((element) => element.matches(':fullscreen'))).toBe(true);
  await mapa.locator('[data-mp-zoom-in]').click();
  await mapa.locator('.mp-bolha-caixa').first().click();
  await mapa.locator('.mp-painel-lista .mp-item').first().click();
  await mapa.getByRole('link', { name: 'Abrir ficha completa' }).click();
  const ficha = mapa.locator('[data-mp-ficha]');
  await expect(ficha).toBeVisible();
  await expect(mapa.locator('[data-mp-ficha-titulo]')).not.toHaveText('Ficha do projeto');
  await expect(ficha.locator('.pj-contexto, .pj-titulo, .notice')).toHaveCount(0);
  await expect(ficha.getByRole('link', { name: '← Carteira de projetos' })).toHaveCount(0);
  const resumo = ficha.locator('.pj-bloco').filter({ hasText: 'Resumo' });
  await expect(resumo).toBeVisible();
  const estiloResumo = await resumo.evaluate((element) => {
    const estilo = getComputedStyle(element);
    return { fundo: estilo.backgroundColor, borda: estilo.borderTopWidth };
  });
  expect(estiloResumo.fundo).not.toBe('rgba(0, 0, 0, 0)');
  expect(estiloResumo.borda).not.toBe('0px');
  await mapa.getByRole('button', { name: '← Voltar ao mapa' }).click();
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
  await expect(page).toHaveURL(/sel=obra%3AP-905/);
  const estadoComSelecao = page.url();
  await page.goto(estadoComSelecao);
  await expect(mapa.locator('.mp-marcador-selecionado')).toHaveCount(1);
  await mapa.getByRole('link', { name: 'Abrir ficha completa' }).click();
  await expect(mapa.locator('[data-mp-ficha-titulo]')).toContainText('Aquisição de Equipamentos Exemplo F');
  const abrirPagina = mapa.locator('[data-mp-ficha-pagina]');
  await expect(abrirPagina).toHaveAttribute('href', /volta=%2Fplataforma%2Fgestao%2F/);
  await abrirPagina.click();
  await expect(page.locator('.pj-contexto a')).toHaveText('← Voltar ao mapa');
  const paginaProjeto = page.url().split('?')[0];
  await page.goto(`${paginaProjeto}?volta=https%3A%2F%2Fexterno.example`);
  await expect(page.locator('.pj-contexto a')).toHaveText('← Carteira de projetos');
  await page.goto(estadoComSelecao);
  const mapaRestaurado = page.locator('[data-mapa-obras]');
  await mapaRestaurado.getByRole('link', { name: 'Abrir ficha completa' }).click();
  await mapaRestaurado.getByRole('button', { name: '← Voltar ao mapa' }).click();
  await expect(mapaRestaurado.locator('.mp-marcador-selecionado')).toHaveCount(1);
  await mapa.getByRole('button', { name: 'Voltar' }).click();
  await expect(mapa.locator('.mp-marcador-selecionado')).toHaveCount(0);
});

test('painel compacto, PDF abaixo do mapa e filtros restaurados pela URL', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  await page.goto('/plataforma/gestao/');

  const cartao = page.locator('.pn-cartao').first();
  const alturaCartao = await cartao.evaluate((element) => element.getBoundingClientRect().height);
  expect(alturaCartao).toBeLessThanOrEqual(110);
  const mapa = await page.locator('#mapa').boundingBox();
  const pdf = await page.getByRole('button', { name: 'Exportar em PDF' }).boundingBox();
  expect(mapa && pdf && pdf.y).toBeGreaterThan(mapa!.y + mapa!.height);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const filtro = page.locator('#mapa [data-mp-filtro="situacoes"]');
  await filtro.locator('[data-mp-abrir]').click();
  await filtro.locator('input[type="checkbox"]').first().uncheck();
  await expect(filtro.locator('[data-mp-abrir]')).toContainText('Etapas: 5 de 6');
  await expect(page).toHaveURL(/etapas=/);
  await page.keyboard.press('Escape');
  await expect(filtro.locator('[data-mp-abrir]')).toHaveAttribute('aria-expanded', 'false');
  await page.reload();
  await filtro.locator('[data-mp-abrir]').click();
  await expect(filtro.locator('input[type="checkbox"]:checked')).toHaveCount(5);
});
