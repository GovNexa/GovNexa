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
  // Apresentação: filtros empilhados numa coluna à esquerda; mapa no centro com quase toda a altura; resumo à direita.
  const arranjo = await mapa.evaluate((raiz) => {
    const caixa = (seletor: string) => raiz.querySelector(seletor)!.getBoundingClientRect();
    const controles = [...raiz.querySelectorAll('.mp-filtros .mp-filtro-abrir, .mp-filtros .mp-acoes .mp-btn')];
    return {
      esquerdas: controles.map((controle) => Math.round(controle.getBoundingClientRect().left)),
      larguraFiltro: caixa('.mp-filtro').width,
      fimFiltros: caixa('.mp-filtros').right,
      mapa: { esquerda: caixa('[data-mp-mapa]').left, direita: caixa('[data-mp-mapa]').right, altura: caixa('[data-mp-mapa]').height, largura: caixa('[data-mp-mapa]').width },
      painelEsquerda: caixa('.mp-painel').left,
    };
  });
  expect(new Set(arranjo.esquerdas).size, JSON.stringify(arranjo)).toBe(1);
  expect(arranjo.larguraFiltro).toBeGreaterThanOrEqual(200);
  expect(arranjo.mapa.esquerda).toBeGreaterThan(arranjo.fimFiltros);
  expect(arranjo.painelEsquerda).toBeGreaterThan(arranjo.mapa.direita);
  expect(arranjo.mapa.altura).toBeGreaterThanOrEqual(1080 * 0.85);
  expect(arranjo.mapa.largura).toBeGreaterThanOrEqual(1920 * 0.55);
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

test('mapa: camadas Mapa, Satélite e Híbrido (Esri) com estado no endereço', async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  await page.route('https://server.arcgisonline.com/**', (route) => route.abort());
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/plataforma/gestao/');
  const grupo = page.getByRole('group', { name: 'Camada do mapa' });
  await expect(grupo.getByRole('button', { name: 'Mapa' })).toHaveAttribute('aria-pressed', 'true');
  await grupo.getByRole('button', { name: 'Satélite' }).click();
  await expect(grupo.getByRole('button', { name: 'Satélite' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/camada=satelite/);
  await expect(page.locator('[data-mp-mapa]')).toHaveAttribute('data-camada', 'satelite');
  await expect.poll(() => page.locator('[data-mp-mapa] .leaflet-tile-pane .leaflet-layer').count()).toBe(1);
  await grupo.getByRole('button', { name: 'Híbrido' }).click();
  await expect.poll(() => page.locator('[data-mp-mapa] .leaflet-tile-pane .leaflet-layer').count()).toBe(3);
  await page.goto('/plataforma/gestao/?camada=hibrido');
  await expect(page.getByRole('group', { name: 'Camada do mapa' }).getByRole('button', { name: 'Híbrido' })).toHaveAttribute('aria-pressed', 'true');
});
