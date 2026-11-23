import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';

const C = '/plataforma/projetos-carteira/';
const linhas = (page: Page) => page.locator('tbody tr[data-cp-linha]');
const digitos = (t: string | null): number => Number((t ?? '').replace(/\D/g, ''));
type Janela = Window & { __xss?: number; __impressoes?: number };
test.use({ viewport: { width: 1280, height: 900 } });

async function conferirTotais(page: Page) {
  const qtd = digitos(await page.locator('[data-cp-total-qtd]').textContent());
  await expect(linhas(page)).toHaveCount(qtd);
  const somaLinhas = await linhas(page).evaluateAll((ls) => ls.reduce((s, l) => s + Number((l as HTMLElement).dataset.centavos || 0), 0));
  const total = Number(await page.locator('[data-cp-total-valor]').getAttribute('data-centavos'));
  expect(somaLinhas).toBe(total);
  expect(digitos(await page.locator('[data-cp-total-valor]').textContent())).toBe(Math.round(total / 100));
  return { qtd, total };
}

test('carteira: grandes números batem com a soma das linhas e mudam com o filtro de órgão', async ({ page }) => {
  await page.goto(C);
  const antes = await conferirTotais(page);
  expect(antes.qtd).toBeGreaterThan(0);
  await page.locator('form[data-filtros-projetos] select[name=orgao]').selectOption('SMS');
  await Promise.all([page.waitForURL(/[?&]orgao=SMS/), page.getByRole('button', { name: 'Aplicar filtros' }).click()]);
  const depois = await conferirTotais(page);
  expect(depois.qtd).toBeLessThan(antes.qtd);
  expect(depois.total).toBeLessThan(antes.total);
  for (const c of await page.locator('tbody tr[data-cp-linha] td.cp-orgao').allTextContents()) expect(c.trim()).toBe('SMS');
  await expect(page.locator('.cp-numero-extra').first()).toContainText('na carteira');
});

test('carteira: só prioritários deixa só os marcados e soma de novo', async ({ page }) => {
  await page.goto(C);
  const antes = await conferirTotais(page);
  await page.getByLabel('Só prioritários').check();
  await Promise.all([page.waitForURL(/[?&]prioritarios=1/), page.getByRole('button', { name: 'Aplicar filtros' }).click()]);
  const depois = await conferirTotais(page);
  expect(depois.qtd).toBeLessThanOrEqual(antes.qtd);
  for (const l of await linhas(page).all()) await expect(l).toHaveAttribute('data-prioritario', '1');
  await expect(page.getByLabel('Só prioritários')).toBeChecked();
  await expect(page.getByRole('link', { name: 'Limpar filtros' })).toBeVisible();
});

test('carteira: filtro que zera mostra aviso e totais zerados', async ({ page }) => {
  await page.goto(C + '?q=' + encodeURIComponent('nenhum-projeto-com-este-nome'));
  await expect(page.locator('[data-cp-total-qtd]')).toHaveText('0');
  await expect(page.locator('[data-cp-total-valor]')).toHaveAttribute('data-centavos', '0');
  await expect(page.locator('[data-cp-vazio-filtro]')).toBeVisible();
  await expect(linhas(page)).toHaveCount(0);
});

test('carteira: agrupada por macroetapa e, em cada grupo, da entrega mais próxima para a mais distante', async ({ page }) => {
  await page.goto(C);
  const grupos = await page.locator('tbody[data-cp-grupo]').evaluateAll((gs) => gs.map((g) => ({
    codigo: g.getAttribute('data-cp-grupo') ?? '',
    entregas: [...g.querySelectorAll('tr[data-cp-linha]')].map((l) => l.getAttribute('data-entrega') ?? ''),
  })));
  const ORDEM = ['00', '01', '02', '03', '04', '05', '06', 'sem'];
  const codigos = grupos.map((g) => g.codigo);
  expect(codigos).toEqual(ORDEM.filter((c) => codigos.includes(c)));
  for (const g of grupos) {
    expect(g.entregas.length).toBeGreaterThan(0);
    const comData = g.entregas.filter(Boolean);
    expect(comData).toEqual([...comData].sort());
    const primeiraVazia = g.entregas.indexOf('');
    if (primeiraVazia >= 0) expect(g.entregas.slice(primeiraVazia).every((e) => e === '')).toBe(true);
  }
  await expect(page.locator('tbody[data-cp-grupo] tr.cp-grupo th').first()).toContainText('projeto');
});

test('carteira: colunas na ordem pedida, ID só o número e sem farol', async ({ page }) => {
  await page.goto(C);
  const cab = (await page.locator('.cp-tabela thead th').allTextContents()).map((t) => t.trim());
  expect(cab).toEqual(['ID', 'Órgão', 'Projeto', 'Valor', 'Macroetapa', 'Peças técnicas', 'Fim da contratação', 'Dias de obra', 'Entrega', 'Detalhes']);
  for (const id of await page.locator('tbody tr[data-cp-linha] td.cp-id').allTextContents()) expect(id.trim()).toMatch(/^\d+$/);
  expect(await page.locator('.cp-tabela').innerText()).not.toMatch(/\bP-\d/);
  await expect(page.locator('.cp .cart-ponto, .cp .status, .cp .kb-farol')).toHaveCount(0);
  await expect(page.locator('tbody tr[data-cp-linha][data-id="P-900"] td.cp-id')).toHaveText('900');
  await expect(page.locator('tbody tr[data-cp-linha] td.cp-nome strong')).toHaveCount(await linhas(page).count());
});

test('carteira: links antigos com ?q=P-... abrem só aquele projeto', async ({ page }) => {
  await page.goto(C + '?q=P-900');
  await expect(linhas(page)).toHaveCount(1);
  await expect(linhas(page).first()).toHaveAttribute('data-id', 'P-900');
});

test('carteira: a Visão por órgão redireciona para a Carteira (com o órgão) e saiu do menu', async ({ page }) => {
  await page.goto('/plataforma/projetos-orgaos/');
  let u = new URL(page.url());
  expect(u.pathname).toBe(C);
  expect(u.search).toBe('');
  await page.goto('/plataforma/projetos-orgaos/?orgao=SMS&url=' + encodeURIComponent('https://exemplo.com'));
  u = new URL(page.url());
  expect(u.pathname).toBe(C);
  expect([...u.searchParams.keys()]).toEqual(['orgao']);
  expect(u.searchParams.get('orgao')).toBe('SMS');
  await expect(page.locator('form[data-filtros-projetos] select[name=orgao]')).toHaveValue('SMS');
  for (const c of await page.locator('tbody tr[data-cp-linha] td.cp-orgao').allTextContents()) expect(c.trim()).toBe('SMS');
  await expect(page.locator('a[href^="/plataforma/projetos-orgaos"]')).toHaveCount(0);
  const r = await page.request.get('/plataforma/projetos-orgaos/?orgao=SMS', { maxRedirects: 0 });
  expect(r.status()).toBe(302);
  expect(r.headers()['location']).toMatch(/\/plataforma\/projetos-carteira\/\?orgao=SMS$/);
});

test('carteira: HTML no endereço não executa (filtros e redirecionamento)', async ({ page }) => {
  await page.addInitScript(() => { (window as Janela).__xss = 0; });
  const ataque = '<img src=x onerror="window.__xss=1">';
  await page.goto(C + '?q=' + encodeURIComponent(ataque) + '&orgao=' + encodeURIComponent(ataque));
  expect(await page.evaluate(() => (window as Janela).__xss)).toBe(0);
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await expect(page.locator('form[data-filtros-projetos] input[name=q]')).toHaveValue(ataque);
  await page.goto('/plataforma/projetos-orgaos/?orgao=' + encodeURIComponent(ataque));
  expect(new URL(page.url()).pathname).toBe(C);
  expect(await page.evaluate(() => (window as Janela).__xss)).toBe(0);
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await expect(page.locator('[data-fp-avisos]')).toBeVisible();
});

test('carteira: nome com HTML vira texto; projeto novo sem valor e sem datas; a ficha abre como antes', async ({ page }) => {
  await page.addInitScript(() => { (window as Janela).__xss = 0; });
  const marca = `E5 ${randomUUID().slice(0, 8)}`;
  const nome = `<img src=x onerror="window.__xss=1"> ${marca}`;
  await page.goto('/plataforma/projetos-novo/');
  await page.locator('#np-nome').fill(nome);
  await page.locator('#np-orgao').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Cadastrar projeto' }).click();
  await expect(page.locator('[data-np-ok]')).toContainText('foi cadastrado');
  await page.goto(C + '?q=' + encodeURIComponent(marca));
  const linha = linhas(page);
  await expect(linha).toHaveCount(1);
  await expect(linha.locator('td.cp-nome strong')).toHaveText(nome);
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as Janela).__xss)).toBe(0);
  expect(digitos(await linha.locator('td.cp-id').textContent())).toBeGreaterThanOrEqual(9000);
  await expect(linha.locator('td.cp-id')).toHaveText(/^\d+$/);
  await expect(linha.locator('td.cp-valor')).toHaveText('\u2014');
  await expect(linha.locator('td.cp-entrega')).toHaveText('\u2014');
  await expect(linha).toHaveAttribute('data-centavos', '');
  await expect(page.locator('[data-cp-sem-valor]')).toBeVisible();
  await expect(page.locator('[data-cp-total-valor]')).toHaveAttribute('data-centavos', '0');
  await linha.getByRole('button', { name: 'Ver detalhes' }).click();
  await expect(page.locator('#record-title')).toHaveText(nome);
  await expect(page.locator('#record-body')).toContainText('Valores e recursos');
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
});

test('carteira: impressão no formato do relatório, preto no branco mesmo no tema escuro', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('govnexa-theme', 'dark'));
  await page.goto(C + '?orgao=SMS');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.cp')).toHaveCSS('color', 'rgb(0, 0, 0)');
  await expect(page.locator('.cp-tabela td.cp-nome').first()).toHaveCSS('color', 'rgb(0, 0, 0)');
  await expect(page.locator('.cp-quadro')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('form[data-filtros-projetos]')).toBeHidden();
  await expect(page.locator('[data-cp-imprimir]')).toBeHidden();
  await expect(page.locator('.cp-tabela thead th.cp-acao')).toBeHidden();
  await expect(page.locator('[data-cp-impressao]')).toBeVisible();
  await expect(page.locator('[data-cp-impressao]')).toContainText('Emitido em');
  await expect(page.locator('[data-cp-impressao]')).toContainText('SMS');
  await expect(page.locator('[data-cp-total-qtd]')).toBeVisible();
  await expect(page.locator('tbody[data-cp-grupo] tr.cp-grupo').first()).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => { const w = window as Janela; w.__impressoes = 0; window.print = () => { w.__impressoes = (w.__impressoes ?? 0) + 1; }; });
  await page.locator('[data-cp-imprimir]').click();
  expect(await page.evaluate(() => (window as Janela).__impressoes)).toBe(1);
});

test('carteira: em 1280 px a tabela cabe, com o menu recolhido e aberto', async ({ page }) => {
  await page.goto(C);
  await expect(page.locator('.cp-tabela thead')).not.toHaveCSS('position', 'absolute');
  for (const alternar of [false, true]) {
    if (alternar) await page.locator('#sidebar-toggle').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(await page.locator('.cp-quadro').evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
  }
});

test('carteira: em 390 px sem rolagem horizontal, cada projeto vira cartão e a ficha abre', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(C);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await expect(page.locator('.cp-tabela thead')).toHaveCSS('position', 'absolute');
  const linha = linhas(page).first();
  const caixa = await linha.boundingBox();
  expect(caixa!.x).toBeGreaterThanOrEqual(0);
  expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(390);
  await expect(linha.locator('td.cp-entrega')).toBeVisible();
  const id = await linha.locator('td.cp-id').boundingBox();
  const nome = await linha.locator('td.cp-nome').boundingBox();
  expect(id!.y).toBeLessThan(nome!.y);
  await linha.getByRole('button', { name: 'Ver detalhes' }).click();
  await expect(page.locator('#record-dialog')).toBeVisible();
});

test('carteira: em 1280 px nenhum texto passa por cima da coluna vizinha', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(C);
  await expect(page.locator('.cp-tabela thead')).not.toHaveCSS('position', 'absolute');
  const estouros = await page.locator('.cp-tabela td:not(.cp-acao)').evaluateAll((tds) => tds.filter((td) => td.scrollWidth > td.clientWidth + 1).map((td) => `${td.className}: ${td.textContent?.trim().slice(0, 40)}`));
  expect(estouros).toEqual([]);
});

test('carteira: a impressão sai em A4 paisagem em todas as páginas', async ({ page }) => {
  await page.goto(C);
  await page.emulateMedia({ media: 'print' });
  const pdf = (await page.pdf({ preferCSSPageSize: true })).toString('latin1');
  const caixas = [...pdf.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
  expect(caixas.length).toBeGreaterThan(0);
  for (const [largura, altura] of caixas) expect(largura, `${largura}x${altura}`).toBeGreaterThan(altura);
});

for (const tema of ['light', 'dark'] as const) {
  test(`carteira: sem violação grave de acessibilidade no tema ${tema} (1280 e 390 px)`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('govnexa-theme', t), tema);
    for (const largura of [1280, 390]) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(C);
      const r = await new AxeBuilder({ page }).include('.cp').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(r.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')), `${largura}px ${JSON.stringify(r.violations)}`).toEqual([]);
    }
  });
}
