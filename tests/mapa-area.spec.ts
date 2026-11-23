import { expect, test, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// E4: mapa das obras por área (legenda, cor e filtro), macroetapa e região opcional; sem situação de prazo; bolhas sem
// sobreposição (alvos de toque). Sem contagens absolutas da carteira: outros testes cadastram projetos no mesmo D1 local.
const GESTAO = '/plataforma/gestao/';
const PREFEITO = '/plataforma/';
const CHAVE = 'govnexa-localizacao-simulacao';
const PROIBIDO = /no prazo|atenção|atrasad|farol|situação do prazo|vencid/i;
const ponto = (lat: number, lng: number) => ({ tipo: 'ponto', ponto: { lat, lng }, endereco: null });
/** Três obras de exemplo sem local ganham um ponto simulado (só nesta aba): Saúde/Leste, Cultura/Oeste, Drenagem/Sul. */
const TRES = { 'P-901': ponto(-16.64, -49.22), 'P-904': ponto(-16.7, -49.32), 'P-910': ponto(-16.74, -49.26) };
/** Todas as obras de exemplo sem local no mesmo ponto: o pior caso de bolhas e marcadores amontoados. */
const AMONTOADAS = Object.fromEntries(['P-900', 'P-901', 'P-902', 'P-903', 'P-904', 'P-906', 'P-907', 'P-908', 'P-909', 'P-910', 'P-911', 'P-913']
  .map((id) => [id, ponto(-16.6869, -49.2648)]));
const semRolagem = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

async function simular(page: Page, rota: string, locais: Record<string, unknown>): Promise<void> {
  await page.goto(rota);
  await page.evaluate(([chave, valor]) => sessionStorage.setItem(chave, valor), [CHAVE, JSON.stringify(locais)] as const);
  await page.reload();
}
/** Pares de alvos do mapa (bolhas, marcadores e controles) cujas caixas se sobrepõem. Vazio = nenhum alvo cobre outro. */
const sobrepostos = (mapa: Locator) => mapa.locator('[data-mp-mapa]').evaluate((raiz) => {
  const visivel = (e: Element) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const alvos = [...raiz.querySelectorAll('.leaflet-marker-icon')].filter(visivel);
  const controles = [...raiz.querySelectorAll('.mp-zoom button, .mp-camadas button')].filter(visivel);
  const cruza = (a: DOMRect, b: DOMRect) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
  const erros: string[] = [];
  alvos.forEach((a, i) => {
    const ra = a.getBoundingClientRect();
    if (ra.width < 24 || ra.height < 24) erros.push(`pequeno: ${a.getAttribute('aria-label')}`);
    for (const b of alvos.slice(i + 1)) if (cruza(ra, b.getBoundingClientRect())) erros.push(`${a.getAttribute('aria-label')} x ${b.getAttribute('aria-label')}`);
    for (const c of controles) if (cruza(ra, c.getBoundingClientRect())) erros.push(`${a.getAttribute('aria-label')} x controle ${c.textContent}`);
  });
  return erros;
});
const textoSemScript = (local: Locator) => local.evaluate((e) => {
  const c = e.cloneNode(true) as HTMLElement;
  c.querySelectorAll('script').forEach((s) => s.remove());
  return c.textContent ?? '';
});

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (r) => r.abort());
  await page.route('https://server.arcgisonline.com/**', (r) => r.abort());
});

test('mapa por área: legenda com as áreas e as cores da tela do prefeito, filtro por área e por macroetapa', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await simular(page, GESTAO, TRES);
  const mapa = page.locator('#mapa [data-mapa-obras]');
  const legenda = mapa.locator('[data-mp-legenda]');
  await expect(legenda).toHaveAttribute('aria-label', 'Legenda das áreas');
  for (const [codigo, nome] of [['saude', 'Saúde'], ['cultura', 'Cultura'], ['drenagem', 'Drenagem']]) {
    const item = legenda.locator(`[data-mp-legenda-area="${codigo}"]`);
    await expect(item).toContainText(`${nome} (`);
    await expect(item.locator('.mp-amostra')).toHaveClass(/mp-cor-(\d|outros|sem)/);
  }
  // Mesma cor da E3: a classe da amostra na legenda do mapa é a da barra "Obras por área" da tela do prefeito.
  const corMapa = await legenda.locator('[data-mp-legenda-area="saude"] .mp-amostra').getAttribute('class');
  await page.goto(PREFEITO);
  const corPrefeito = await page.locator('[data-pp-area="saude"] rect').getAttribute('class');
  expect(corMapa?.match(/mp-cor-(\w+)/)?.[1]).toBe(corPrefeito?.match(/pp-cor-(\w+)/)?.[1]);
  await page.goto(GESTAO);

  await mapa.locator('summary').click();
  const linhas = mapa.locator('[data-mp-lista-corpo] tr');
  const total = await linhas.count();
  expect(total).toBeGreaterThanOrEqual(4);
  const filtroArea = mapa.locator('[data-mp-filtro="areas"]');
  await filtroArea.locator('[data-mp-abrir]').click();
  await filtroArea.getByRole('button', { name: 'Desmarcar todos' }).click();
  await expect(linhas).toHaveCount(0);
  await expect(mapa.locator('[data-mp-painel]')).toContainText('Nenhuma obra com estes filtros');
  await filtroArea.getByRole('checkbox', { name: 'Saúde', exact: true }).check();
  await expect(filtroArea.locator('[data-mp-abrir]')).toHaveText('Área: Saúde ▾');
  await expect(page).toHaveURL(/[?&]areas=saude(&|$)/);
  await expect(linhas.first()).toBeVisible();
  for (const celula of await linhas.locator('td:nth-child(3)').all()) await expect(celula).toHaveText('Saúde');
  expect(await linhas.count()).toBeLessThan(total);
  await filtroArea.locator('[data-mp-pronto]').click();

  await mapa.getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(linhas).toHaveCount(total);
  const filtroEtapa = mapa.locator('[data-mp-filtro="etapas"]');
  await filtroEtapa.locator('[data-mp-abrir]').click();
  await expect(filtroEtapa.getByRole('checkbox')).toHaveCount(7);
  await filtroEtapa.getByRole('button', { name: 'Desmarcar todos' }).click();
  await filtroEtapa.getByRole('checkbox', { name: 'Execução', exact: true }).check();
  await expect(filtroEtapa.locator('[data-mp-abrir]')).toHaveText('Macroetapa: Execução ▾');
  await expect(page).toHaveURL(/[?&]etapas=execucao(&|$)/);
  for (const celula of await linhas.locator('td:nth-child(4)').all()) await expect(celula).toHaveText('Execução');
  expect(await linhas.count()).toBeLessThan(total);
  // O endereço restaura os dois filtros.
  await page.reload();
  await expect(filtroEtapa.locator('[data-mp-abrir]')).toHaveText('Macroetapa: Execução ▾');
});

test('mapa por área: nada de situação de prazo, farol ou tipo de obra no mapa', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const rota of [GESTAO, PREFEITO]) {
    await simular(page, rota, TRES);
    const mapa = page.locator('[data-mapa-obras]');
    await expect(mapa.locator('[data-mp-legenda] li').first()).toBeVisible();
    await expect(mapa.locator('[data-mp-filtro="farol"], [data-mp-filtro="situacoes"], [data-mp-filtro="categorias"]')).toHaveCount(0);
    await expect(mapa.locator('[class*="farol"], [class*="mp-texto-"]')).toHaveCount(0);
    expect(await textoSemScript(mapa), rota).not.toMatch(PROIBIDO);
    expect(await mapa.locator('[data-mp-dados]').textContent(), rota).not.toMatch(/"farol"|"prazo"|"categoria"/);
  }
  // Os filtros abertos e o painel da região também não falam de prazo.
  await page.goto(GESTAO);
  const mapa = page.locator('#mapa [data-mapa-obras]');
  for (const filtro of ['etapas', 'areas', 'regiao']) {
    const raiz = mapa.locator(`[data-mp-filtro="${filtro}"]`);
    if (await raiz.isHidden()) continue;
    await raiz.locator('[data-mp-abrir]').click();
    expect(await raiz.locator('[data-mp-popover]').innerText(), filtro).not.toMatch(PROIBIDO);
    await raiz.locator('[data-mp-pronto]').click();
  }
});

test('mapa por área: cada região mostra o total de obras e o valor; região é filtro opcional', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await simular(page, GESTAO, TRES);
  const mapa = page.locator('#mapa [data-mapa-obras]');
  const leste = mapa.locator('[data-mp-painel] .mp-item-regiao[data-mp-regiao="Leste"]');
  await expect(leste).toContainText(/\d+ obras?/);
  await expect(leste).toContainText(/R\$\s?[\d.]+ \(\d+ de \d+ com valor\)/);
  await expect(mapa.locator('[data-mp-painel] .mp-item-regiao').first()).not.toContainText(PROIBIDO);
  const filtro = mapa.locator('[data-mp-filtro="regiao"]');
  await expect(filtro.locator('[data-mp-abrir]')).toHaveText('Região: Todas ▾');
  await filtro.locator('[data-mp-abrir]').click();
  await filtro.getByRole('radio', { name: 'Leste', exact: true }).check();
  await expect(filtro.locator('[data-mp-abrir]')).toHaveText('Região: Leste ▾');
  await expect(page).toHaveURL(/[?&]regiao=Leste(&|$)/);
  await expect(mapa.locator('[data-mp-painel] .mp-item-regiao')).toHaveCount(1);
  await filtro.getByRole('radio', { name: 'Todas', exact: true }).check();
  await expect(page).not.toHaveURL(/[?&]regiao=/);
  expect(await mapa.locator('[data-mp-painel] .mp-item-regiao').count()).toBeGreaterThanOrEqual(4);
  // A bolha da região diz o total e o valor no nome acessível.
  await expect(mapa.locator('.mp-bolha-caixa').first()).toHaveAttribute('aria-label', /^Região .+: \d+ obras?; valor /);
});

test('mapa por área: a tela do prefeito mostra o mapa compacto com legenda por área e respeita os filtros dela', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(PREFEITO);
  const secao = page.locator('[data-pp-mapa]');
  const mapa = secao.locator('[data-mapa-obras="mapa-prefeito"]');
  await expect(mapa.locator('.leaflet-container')).toBeVisible();
  await expect(mapa.locator('.mp-filtros')).toBeHidden();
  await expect(mapa.locator('[data-mp-painel]')).toBeHidden();
  await expect(mapa.locator('[data-mp-legenda] li').first()).toBeVisible();
  await expect(mapa.locator('[data-mp-contagem]')).toContainText('no mapa');
  await expect(mapa.getByRole('link', { name: 'Abrir na Gestão →' })).toHaveAttribute('href', '/plataforma/gestao/#mapa');
  // Fica entre a linha do tempo e as listas: o croqui de cima não muda.
  const linhaTempo = await page.locator('.pp-linha').boundingBox();
  const caixa = await secao.boundingBox();
  const listas = await page.locator('.pp-listas').boundingBox();
  expect(caixa!.y).toBeGreaterThanOrEqual(linhaTempo!.y + linhaTempo!.height);
  expect(listas!.y).toBeGreaterThanOrEqual(caixa!.y + caixa!.height);

  await page.goto(`${PREFEITO}?area=educacao`);
  const itens = mapa.locator('[data-mp-legenda] [data-mp-legenda-area]');
  await expect(itens.first()).toBeVisible();
  for (const item of await itens.all()) await expect(item).toHaveAttribute('data-mp-legenda-area', 'educacao');
  await expect(mapa.getByRole('link', { name: 'Abrir na Gestão →' })).toHaveAttribute('href', '/plataforma/gestao/?areas=educacao#mapa');

  // Filtro que zera o mapa: contagem zero e aviso na legenda.
  await page.goto(`${PREFEITO}?etapa=concluida`);
  await expect(mapa.locator('[data-mp-contagem]')).toContainText(/^0 obras no mapa/);
  await expect(mapa.locator('[data-mp-legenda]')).toHaveText('Nenhuma obra no mapa com estes filtros.');

  // Ampliar: o mapa em tela cheia traz os filtros de área, macroetapa e região, e o endereço da tela não muda.
  await page.goto(`${PREFEITO}?etapa=execucao`);
  const antes = page.url();
  await mapa.getByRole('button', { name: 'Ampliar o mapa das obras em tela cheia' }).click();
  await expect.poll(() => mapa.evaluate((e) => e.matches(':fullscreen'))).toBe(true);
  await expect(mapa.locator('[data-mp-filtro="areas"] [data-mp-abrir]')).toBeVisible();
  await expect(mapa.locator('[data-mp-filtro="etapas"] [data-mp-abrir]')).toBeVisible();
  await mapa.getByRole('button', { name: 'Sair da apresentação' }).click();
  await expect.poll(() => mapa.evaluate((e) => e.matches(':fullscreen'))).toBe(false);
  expect(page.url()).toBe(antes);
});

test('mapa por área: sem rolagem lateral em 1280 e 390 px, célula a célula', async ({ page }) => {
  for (const [width, height] of [[1280, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    for (const rota of [PREFEITO, GESTAO]) {
      await simular(page, rota, TRES);
      const mapa = page.locator('[data-mapa-obras]');
      await expect(mapa.locator('.leaflet-container')).toBeVisible();
      expect(await semRolagem(page), `${rota} ${width}px`).toBeTruthy();
      const estouros = await mapa.evaluate((raiz) => [...raiz.querySelectorAll('.mp-legenda li, .mp-legenda-nota, .mp-cab, .mp-contagem, .mp-filtro-abrir, .mp-item')]
        .filter((e) => (e as HTMLElement).offsetParent !== null && e.scrollWidth > e.clientWidth + 1)
        .map((e) => `${e.className}: ${e.textContent}`));
      expect(estouros, `${rota} ${width}px`).toEqual([]);
      const caixa = await mapa.boundingBox();
      expect(caixa!.x + caixa!.width, `${rota} ${width}px`).toBeLessThanOrEqual(width + 1);
    }
  }
});

test('mapa por área: bolhas e marcadores nunca se cobrem e o axe não acusa alvo de toque, nos dois temas', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [width, height] of [[1280, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await simular(page, GESTAO, AMONTOADAS);
    const mapa = page.locator('#mapa [data-mapa-obras]');
    await expect(mapa.locator('.mp-bolha-caixa').first()).toBeVisible();
    await expect.poll(() => sobrepostos(mapa), `bolhas de região ${width}px`).toEqual([]);
    for (let i = 0; i < 3; i++) await mapa.locator('[data-mp-zoom-in]').click();
    await expect(mapa.locator('.leaflet-marker-icon .mp-marcador').first()).toBeVisible();
    await expect.poll(() => sobrepostos(mapa), `marcadores ${width}px`).toEqual([]);
    for (const tema of ['light', 'dark']) {
      await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, tema);
      const r = await new AxeBuilder({ page }).include('#mapa').exclude('.leaflet-tile-pane').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(r.violations.filter((v) => ['serious', 'critical'].includes(v.impact || '')), `gestão ${width}px ${tema}: ${JSON.stringify(r.violations)}`).toEqual([]);
    }
    await simular(page, PREFEITO, AMONTOADAS);
    await expect(page.locator('[data-pp-mapa] .mp-bolha-caixa').first()).toBeVisible();
    for (const tema of ['light', 'dark']) {
      await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, tema);
      const r = await new AxeBuilder({ page }).include('[data-pp-mapa]').exclude('.leaflet-tile-pane').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(r.violations.filter((v) => ['serious', 'critical'].includes(v.impact || '')), `prefeito ${width}px ${tema}: ${JSON.stringify(r.violations)}`).toEqual([]);
    }
  }
});

test('mapa por área: nome com marcação aparece como texto no mapa, no painel e na lista', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(GESTAO);
  const origin = new URL(page.url()).origin;
  const criado = await request.post('/plataforma/projeto/criar/', { headers: { 'content-type': 'application/json', origin }, data: { nome: '<img src=x onerror=alert(1)>', orgao: 'SECULT' } });
  expect(criado.status()).toBe(201);
  const { projeto: { id } } = await criado.json();
  await simular(page, GESTAO, { [id]: ponto(-16.6, -49.3) });
  const mapa = page.locator('#mapa [data-mapa-obras]');
  await mapa.locator('summary').click();
  await expect(mapa.locator('[data-mp-lista-corpo] td', { hasText: '<img src=x onerror=alert(1)>' })).toHaveCount(1);
  await mapa.locator('[data-mp-painel] .mp-item-regiao').first().click();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await expect(page.locator('[onerror]')).toHaveCount(0);
});
