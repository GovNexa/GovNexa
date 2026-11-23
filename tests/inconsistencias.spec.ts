import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';

// Relatório de inconsistências (E10). O banco local é compartilhado entre testes paralelos: as conferências são relativas
// (soma por regra = linhas da mesma página) e o projeto criado aqui é achado pelo código exato.
const REL = '/plataforma/gestao-inconsistencias/';
const CSV = '/plataforma/gestao-inconsistencias/csv/';
const CRIAR = '/plataforma/projeto/criar/';
const linhas = (page: Page) => page.locator('[data-inc-itens] tbody tr[data-inc-linha]');
const somaPorRegra = (page: Page) => page.locator('[data-inc-regras] tbody tr').evaluateAll((trs) => trs.reduce((s, t) => s + Number((t as HTMLElement).dataset.qtd), 0));
const semRolagem = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
type Janela = Window & { __impressoes?: number };

async function criarProjeto(page: Page, request: APIRequestContext, dados: Record<string, unknown>): Promise<string> {
  await page.goto(REL);
  const origin = new URL(page.url()).origin;
  const r = await request.post(CRIAR, { headers: { 'content-type': 'application/json', origin }, data: dados });
  expect(r.status()).toBe(201);
  return (await r.json()).projeto.id as string;
}

test('inconsistências: está no menu da Gestão e a contagem por regra bate com a lista', async ({ page }) => {
  await page.goto(REL);
  await expect(page.locator('h1')).toHaveText('Inconsistências de dados');
  await expect(page.locator('.side-links a[href="/plataforma/gestao-inconsistencias/"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-inc-regras] tbody tr')).toHaveCount(10);
  const soma = await somaPorRegra(page);
  expect(soma).toBeGreaterThan(0);
  await expect(linhas(page)).toHaveCount(soma);
  await expect(page.locator('[data-inc-orgaos]')).toBeVisible();
});

test('inconsistências: filtro por órgão mostra só o órgão e a regra filtra a lista', async ({ page }) => {
  await page.goto(REL);
  await page.locator('[data-inc-filtros] select[name=orgao]').selectOption('SMS');
  await Promise.all([page.waitForURL(/[?&]orgao=SMS(&|$)/), page.getByRole('button', { name: 'Aplicar filtros' }).click()]);
  await expect(page.locator('[data-inc-filtros] select[name=orgao]')).toHaveValue('SMS');
  await expect(page.locator('[data-inc-orgaos]')).toHaveCount(0);
  const orgaos = await page.locator('[data-inc-celula-orgao]').allTextContents();
  expect(orgaos.length).toBeGreaterThan(0);
  for (const o of orgaos) expect(o.trim()).toBe('SMS');
  await expect(linhas(page)).toHaveCount(await somaPorRegra(page));
  const qtd = Number(await page.locator('[data-inc-regra="sem_localizacao"]').getAttribute('data-qtd'));
  await page.locator('[data-inc-regra="sem_localizacao"] a').click();
  await page.waitForURL((u) => u.pathname === REL && u.searchParams.get('orgao') === 'SMS' && u.searchParams.get('regra') === 'sem_localizacao');
  await expect(linhas(page)).toHaveCount(qtd);
  for (const r of await linhas(page).evaluateAll((trs) => trs.map((t) => (t as HTMLElement).dataset.regra))) expect(r).toBe('sem_localizacao');
  await expect(page.locator('[data-inc-regra="sem_localizacao"] a')).toHaveAttribute('aria-current', 'true');
});

test('inconsistências: órgão ou regra inexistente no endereço mostra tudo com aviso', async ({ page }) => {
  const r = await page.goto(REL + '?orgao=NAO-EXISTE&regra=%3Cscript%3E');
  expect(r?.status()).toBe(200);
  await expect(page.locator('[data-inc-aviso-orgao]')).toHaveText('O órgão informado no endereço não existe nesta carteira. Mostrando todos os órgãos.');
  await expect(page.locator('[data-inc-aviso-regra]')).toHaveText('A regra informada no endereço não existe. Mostrando todas as regras.');
  await expect(page.locator('[data-inc-filtros] select[name=orgao]')).toHaveValue('');
  await expect(page.locator('[data-inc-orgaos]')).toBeVisible();
});

test('inconsistências: filtro sem resultado mostra a mensagem de vazio', async ({ page }) => {
  await page.goto(REL + '?orgao=_sem');
  await expect(page.locator('[data-inc-vazio]')).toHaveText('Nenhuma inconsistência encontrada nos filtros atuais.');
  await expect(linhas(page)).toHaveCount(0);
});

test('inconsistências: o projeto abre a aba Governança da ficha e o X volta ao relatório filtrado', async ({ page }) => {
  await page.goto(REL + '?orgao=SMS');
  const linha = linhas(page).first();
  const id = await linha.getAttribute('data-projeto');
  expect(id).toMatch(/^P-[A-Za-z0-9_-]+$/);
  await linha.locator('a').click();
  await page.waitForURL((u) => u.pathname === `/plataforma/projeto/${id}/`);
  await expect(page.locator('#fp-aba-governanca')).toBeChecked();
  await expect(page.locator('#fp-painel-governanca')).toBeVisible();
  const fechar = page.locator('.pj-contexto a');
  await expect(fechar).toHaveText('Fechar e voltar ao relatório');
  await expect(fechar).toHaveAttribute('href', '/plataforma/gestao-inconsistencias/?orgao=SMS');
  await fechar.click();
  await page.waitForURL((u) => u.pathname === REL && u.search === '?orgao=SMS');
});

test('inconsistências: nome com HTML aparece como texto e o CSV protege contra fórmula', async ({ page, request }) => {
  const nome = `=HYPERLINK("https://externo.example") <img src=x onerror=alert(1)> E10-${randomUUID().slice(0, 8)}`;
  const id = await criarProjeto(page, request, { nome, orgao: 'SMS', datas: { pecas_tecnicas: '2026-03-01', planejamento: '2026-02-01' } });
  let alertou = false;
  page.on('dialog', async (d) => { alertou = true; await d.dismiss(); });
  await page.goto(REL + '?orgao=SMS&regra=datas_fora_de_ordem');
  const linha = page.locator(`[data-inc-itens] tr[data-projeto="${id}"]`);
  await expect(linha).toHaveCount(1);
  await expect(linha.locator('a')).toHaveText(nome);
  await expect(linha).toContainText('Planejamento (01/02/2026) termina antes de Peças técnicas (01/03/2026).');
  await expect(page.locator('main img[src="x"]')).toHaveCount(0);
  expect(alertou).toBe(false);
  await expect(page.locator('[data-inc-csv]')).toHaveAttribute('href', CSV + '?orgao=SMS&regra=datas_fora_de_ordem');

  const r = await request.get(CSV + '?orgao=SMS&regra=datas_fora_de_ordem');
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toBe('text/csv; charset=utf-8');
  expect(r.headers()['content-disposition']).toMatch(/^attachment; filename="inconsistencias-govnexa-\d{4}-\d{2}-\d{2}\.csv"$/);
  expect(r.headers()['cache-control']).toBe('private, no-store');
  const corpo = await r.text();
  expect(corpo.startsWith('\uFEFF"Órgão";"Código do projeto";"Projeto";"Regra";"O que corrigir"\r\n')).toBe(true);
  expect(corpo).toContain(`"SMS";"${id}";"'=HYPERLINK(""https://externo.example"") <img src=x onerror=alert(1)> E10-`);
  for (const l of corpo.replace(/^\uFEFF/, '').split('\r\n').slice(1).filter(Boolean)) expect(l).not.toMatch(/(^|;)"[=+\-@\t\r]/);
});

test('inconsistências: botão Imprimir e impressão em A4 retrato no PDF', async ({ page }) => {
  await page.goto(REL);
  await page.evaluate(() => { const w = window as Janela; w.__impressoes = 0; window.print = () => { w.__impressoes = (w.__impressoes ?? 0) + 1; }; });
  await page.locator('[data-inc-imprimir]').click();
  expect(await page.evaluate(() => (window as Janela).__impressoes)).toBe(1);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('[data-inc-impressao]')).toBeVisible();
  await expect(page.locator('[data-inc-filtros]')).toBeHidden();
  const pdf = (await page.pdf({ preferCSSPageSize: true })).toString('latin1');
  const caixas = [...pdf.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
  expect(caixas.length).toBeGreaterThan(0);
  for (const [largura, altura] of caixas) {
    expect(Math.abs(largura - 595.28), `${largura}x${altura}`).toBeLessThanOrEqual(2);
    expect(Math.abs(altura - 841.89), `${largura}x${altura}`).toBeLessThanOrEqual(2);
  }
});

test('inconsistências: sem rolagem horizontal e sem texto estourando a célula em 1280 e 390 px', async ({ page }) => {
  for (const largura of [1280, 390]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.goto(REL);
    expect(await semRolagem(page), `${largura}px`).toBe(true);
    const estouros = await page.locator('.inc-tabela td, .inc-tabela th').evaluateAll((cs) => cs.filter((c) => c.scrollWidth > c.clientWidth + 1).map((c) => c.textContent?.trim().slice(0, 40)));
    expect(estouros, `${largura}px`).toEqual([]);
  }
});

for (const tema of ['light', 'dark'] as const) {
  test(`inconsistências: sem violação grave de acessibilidade no tema ${tema} (1280 e 390 px)`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('govnexa-theme', t), tema);
    for (const largura of [1280, 390]) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(REL);
      const r = await new AxeBuilder({ page }).include('[data-inc]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(r.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')), `${largura}px ${JSON.stringify(r.violations)}`).toEqual([]);
    }
  });
}
