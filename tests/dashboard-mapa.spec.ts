import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// E3 (22/11/2026): a tela inicial virou "Projetos prioritários". O painel antigo (farol, prazos, convênios) continua no código
// (src/components/dashboard/DashboardPrefeito.astro e src/lib/gestao/dashboard.ts) e volta no painel da equipe na E10,
// que reativa estes testes apontando para a nova rota. Os testes unitários de dashboard.ts continuam no test:dados.
test.skip(() => true, 'Painel antigo fora da tela inicial desde a E3; reativar na E10 (painel da equipe).');

const emTelaCheia = (mapa: import('@playwright/test').Locator) => mapa.evaluate((element) => element.matches(':fullscreen'));

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  await page.route('https://server.arcgisonline.com/**', (route) => route.abort());
});

test('dashboard mostra o mapa compacto e amplia para a mesma apresentação da Gestão', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/plataforma/');
  const mapa = page.locator('[data-mapa-obras="mapa-dashboard"]');
  await expect(mapa).toBeVisible();
  await expect(mapa.locator('.leaflet-container')).toBeVisible();
  // Compacto: sem filtros, painel e camadas; com legenda, contagem e o botão de ampliar.
  await expect(mapa.locator('.mp-filtros')).toBeHidden();
  await expect(mapa.locator('[data-mp-painel]')).toBeHidden();
  await expect(mapa.locator('.mp-legenda')).toBeVisible();
  await expect(mapa.locator('[data-mp-contagem]')).toContainText('no mapa');
  await expect(mapa.getByRole('link', { name: 'Abrir na Gestão →' })).toHaveAttribute('href', '/plataforma/gestao/#mapa');
  const ampliar = mapa.getByRole('button', { name: 'Ampliar o mapa das obras em tela cheia' });
  await expect(ampliar).toBeVisible();
  const urlAntes = page.url();

  await ampliar.click();
  await expect.poll(() => emTelaCheia(mapa)).toBe(true);
  // Mesma apresentação da Gestão: filtros à esquerda, mapa no centro, painel à direita.
  await expect(mapa.locator('.mp-filtros')).toBeVisible();
  await expect(mapa.locator('[data-mp-painel]')).toBeVisible();
  await expect(ampliar).toBeHidden();
  await expect(mapa.getByRole('button', { name: 'Sair da apresentação' })).toBeVisible();
  const arranjo = await mapa.evaluate((raiz) => {
    const caixa = (seletor: string) => raiz.querySelector(seletor)!.getBoundingClientRect();
    return { filtros: caixa('.mp-filtros').right, mapaEsq: caixa('[data-mp-mapa]').left, mapaDir: caixa('[data-mp-mapa]').right, painel: caixa('.mp-painel').left, altura: caixa('[data-mp-mapa]').height };
  });
  expect(arranjo.mapaEsq).toBeGreaterThan(arranjo.filtros);
  expect(arranjo.painel).toBeGreaterThan(arranjo.mapaDir);
  expect(arranjo.altura).toBeGreaterThanOrEqual(900 * 0.8);
  await mapa.locator('[data-mp-filtro="situacoes"] [data-mp-abrir]').click();
  await mapa.locator('[data-mp-filtro="situacoes"] input[type="checkbox"]').first().uncheck();
  await expect(mapa.locator('[data-mp-filtro="situacoes"] [data-mp-abrir]')).toContainText('Etapas: 5 de 6');
  await mapa.locator('[data-mp-filtro="situacoes"] [data-mp-pronto]').click();
  // O estado do mapa não vai para o endereço do dashboard.
  expect(page.url()).toBe(urlAntes);

  await mapa.getByRole('button', { name: 'Sair da apresentação' }).click();
  await expect.poll(() => emTelaCheia(mapa)).toBe(false);
  await expect(mapa.locator('.mp-filtros')).toBeHidden();
  await expect(ampliar).toBeVisible();
  expect(page.url()).toBe(urlAntes);
});

test('mapa do dashboard segue os filtros do dashboard sem ser recriado', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/plataforma/');
  const mapa = page.locator('[data-mapa-obras="mapa-dashboard"]');
  const contagem = mapa.locator('[data-mp-contagem]');
  await expect(contagem).toContainText('no mapa');
  const base = await contagem.textContent();
  await mapa.evaluate((element) => { (element as HTMLElement & { __mesmo?: number }).__mesmo = 1; });
  const regioes = await page.locator('select[name="regiao"] option').evaluateAll((itens) =>
    itens.map((item) => (item as HTMLOptionElement).value).filter(Boolean));
  let mudou = false;
  for (const regiao of regioes) {
    await page.locator('select[name="regiao"]').selectOption(regiao);
    await expect.poll(() => new URL(page.url()).searchParams.get('regiao')).toBe(regiao);
    await expect(page.locator('[data-filtros-status]')).toContainText('Filtros aplicados');
    if ((await contagem.textContent()) !== base) { mudou = true; break; }
  }
  expect(mudou, 'ao menos uma região deve mudar a contagem do mapa').toBeTruthy();
  // O mesmo elemento continua na página (não foi recriado pela troca de conteúdo).
  expect(await page.locator('[data-mapa-obras="mapa-dashboard"]').evaluate((element) => (element as HTMLElement & { __mesmo?: number }).__mesmo)).toBe(1);
  await page.getByRole('link', { name: 'Limpar' }).click();
  await expect(contagem).toHaveText(base!);
});

test('mapa do dashboard: celular sem rolagem lateral e acessível nos dois temas', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/plataforma/');
  const mapa = page.locator('[data-mapa-obras="mapa-dashboard"]');
  await expect(mapa.locator('.leaflet-container')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  const botao = await mapa.locator('[data-mp-expandir] span').boundingBox();
  expect(botao!.height).toBeGreaterThanOrEqual(44);
  for (const tema of ['light', 'dark']) {
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, tema);
    const resultado = await new AxeBuilder({ page }).include('[data-pd-mapa]').withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
    expect(resultado.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')), tema).toEqual([]);
  }
});
