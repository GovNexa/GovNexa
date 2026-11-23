import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// E20 (áudio 31): envolvidos e recursos de cada tarefa do cronograma, CSV, impressão e abuso da rota de gravação.
// No máximo 10 gravações neste arquivo (limite de 30 por minuto da suíte). Nada de dado real: nomes fictícios com token.
test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1280, height: 900 } });

const token = Date.now().toString(36);
const PESSOA = `Pessoa Teste A ${token}`;
const OBS_XSS = '<img src=x onerror=alert(1)>';
const HEADER_CSV = 'Fase;Tarefa;Responsável da tarefa;Registro;Tipo;Nome ou descrição;Área;Papel;Quantidade;Unidade;Valor estimado (R$);Valor utilizado (R$);Data de uso;Observação;Incluído por;Incluído em';
const semRolagem = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

let projetoId = '';
let cronogramaId = '';
let cronogramaUrl = '';
let tarefaId = '';

async function salvar(page: Page) {
  const dlg = page.locator('[data-ev-dialogo]');
  await expect(dlg).toBeVisible();
  await Promise.all([page.waitForEvent('load'), dlg.getByRole('button', { name: 'Salvar' }).click()]);
}
const linhaTarefa = (page: Page) => page.locator('tr[data-ev-tarefa]').first();

test('do zero: inclui envolvido e recursos, edita, remove e confere resumo, links de volta, ficha e Histórico', async ({ page, request }) => {
  await page.goto('/plataforma/projetos-carteira/');
  const origin = new URL(page.url()).origin;
  const criado = await request.post('/plataforma/projeto/criar/', { headers: { origin, 'content-type': 'application/json' }, data: { nome: `Projeto Recursos ${token}`, orgao: 'SMS' } });
  expect(criado.status()).toBe(201);
  projetoId = (await criado.json()).projeto.id as string;

  await page.goto(`/plataforma/projeto/${projetoId}/?aba=cronograma`);
  await page.locator('[data-fp-cron-criar]').click();
  await page.getByRole('button', { name: 'Criar cronograma' }).click();
  await page.waitForURL(/\/plataforma\/cronograma\/C-[^/]+\/\?aba=tarefas&volta=/);
  cronogramaUrl = page.url();
  cronogramaId = decodeURIComponent(new URL(cronogramaUrl).pathname.split('/')[3]);
  const revisao = Number(await page.locator('[data-cr-editor]').getAttribute('data-revisao'));
  const nova = await request.post(`/plataforma/cronograma/gravar/${encodeURIComponent(cronogramaId)}/`, {
    headers: { origin, 'content-type': 'application/json' },
    data: { revisao, acao: 'incluir_tarefa', tarefa: { nome: `Tarefa Recursos ${token}`, fase: 'Obra', responsavel: PESSOA, unidade: 'Unidade Teste' } },
  });
  expect(nova.status()).toBe(200);
  tarefaId = (await nova.json()).tarefa_id as string;

  await page.goto(cronogramaUrl.replace('aba=tarefas', 'aba=envolvidos'));
  await expect(page.locator('[data-ev-resumo]')).toContainText('Envolvidos: nenhum');

  // + Envolvido, com observação que tenta virar HTML: tem de aparecer como texto.
  await linhaTarefa(page).locator('[data-ev-acao="novo-envolvido"]').click();
  await expect(page.locator('[data-ev-dialogo] [data-ev-modo="envolvido"] [data-ev-lgpd]')).toBeVisible();
  const dlg = page.locator('[data-ev-dialogo]');
  await dlg.locator('[name="nome"]').fill(`Pessoa Teste B ${token}`);
  await dlg.locator('[name="papel"]').fill('Fiscal');
  await dlg.locator('[name="observacao_envolvido"]').fill(OBS_XSS);
  await salvar(page);
  await expect(page).toHaveURL(/aba=envolvidos/);
  await expect(page.locator('[data-ev]')).toContainText(OBS_XSS);
  await expect(page.locator('[data-ev] img')).toHaveCount(0);
  await expect(page.locator('[data-ev-resumo]')).toContainText('Envolvidos: 1 pessoa ou área em 1 tarefa');

  // + Recurso financeiro.
  await linhaTarefa(page).locator('[data-ev-acao="novo-recurso"]').click();
  await dlg.locator('[name="tipo"]').selectOption('financeiro');
  await dlg.locator('[name="descricao"]').fill('Diárias');
  await dlg.locator('[name="valor_estimado"]').fill('1.234,56');
  await dlg.locator('[name="valor_utilizado"]').fill('1.000,00');
  await salvar(page);
  const financeiro = page.locator('[data-ev-resumo] tbody tr', { hasText: 'Financeiro' });
  await expect(financeiro).toContainText('R$ 1.234,56');
  await expect(financeiro).toContainText('R$ 1.000,00');
  const total = page.locator('[data-ev-resumo] tbody tr', { hasText: 'Total' });
  await expect(total).toContainText('R$ 1.234,56');
  await expect(total).toContainText('R$ 1.000,00');

  // Editar o recurso (utilizado 1.100,00).
  await linhaTarefa(page).locator('details', { hasText: 'recurso' }).locator('summary').click();
  await page.getByRole('button', { name: 'Editar o recurso Diárias' }).click();
  await expect(dlg.locator('[name="valor_utilizado"]')).toHaveValue('1.000,00');
  await dlg.locator('[name="valor_utilizado"]').fill('1.100,00');
  await salvar(page);
  await expect(page.locator('[data-ev-resumo] tbody tr', { hasText: 'Financeiro' })).toContainText('R$ 1.100,00');

  // Remover o envolvido.
  await linhaTarefa(page).locator('details', { hasText: 'envolvido' }).locator('summary').click();
  await page.getByRole('button', { name: `Remover o envolvido Pessoa Teste B ${token}` }).click();
  await dlg.locator('[name="motivo_remover"]').fill('Engano de teste');
  await salvar(page);
  await expect(page.locator('[data-ev-resumo]')).toContainText('Envolvidos: nenhum');

  // A aba de tarefas mostra o resumo como link que volta para a aba nova.
  await page.goto(cronogramaUrl);
  const link = page.locator('[data-cr-itens]');
  await expect(link).toHaveText('1 recurso');
  await link.click();
  await expect(page).toHaveURL(/aba=envolvidos.*#ev-/);
  await expect(page.locator('[data-voltar]')).toHaveText(/^← Voltar para a ficha do projeto P-/);
  await page.locator('[data-voltar] a').click();
  await expect(page).toHaveURL(new RegExp(`/plataforma/projeto/${projetoId}/\\?.*aba=cronograma`));

  // Ficha: resumo e link para a aba.
  const itens = page.locator('[data-fp-cron-itens]');
  await expect(itens).toContainText('Valor utilizado');
  await expect(itens).toContainText('R$ 1.100,00');
  await expect(page.locator('[data-fp-cron-itens-link]')).toHaveText('Ver envolvidos e recursos');

  await page.goto(`/plataforma/projeto/${projetoId}/?aba=historico`);
  const historico = page.locator('[data-pj-historico]');
  await expect(historico).toContainText('Recurso incluído na tarefa');
  await expect(historico).toContainText('Recurso da tarefa alterado');
  await expect(historico).toContainText('Envolvido removido da tarefa');
  await expect(historico).not.toContainText(OBS_XSS); // a observação nunca vai ao Histórico
});

test('CSV: 200, text/csv, BOM, cabeçalho exato e linha Total', async ({ request }) => {
  const r = await request.get(`/plataforma/cronograma/recursos-csv/${encodeURIComponent(cronogramaId)}/`);
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toContain('text/csv');
  const bruto = await r.text();
  expect(bruto.startsWith('﻿')).toBe(true);
  const texto = bruto.replace(/^﻿/, '');
  expect(texto.split('\r\n')[0]).toBe(HEADER_CSV.split(';').map((c) => `"${c}"`).join(';'));
  expect(texto).toContain('"Total"');
  expect(texto).toContain('"Diárias"');
});

test('abuso da rota: origem alheia, formato, versão velha, corpo grande, item inexistente e CSV inexistente', async ({ page, request }) => {
  await page.goto(cronogramaUrl.replace('aba=tarefas', 'aba=envolvidos'));
  const origin = new URL(page.url()).origin;
  const revisao = Number(await page.locator('[data-ev]').getAttribute('data-revisao'));
  const rota = `/plataforma/cronograma/gravar/${encodeURIComponent(cronogramaId)}/`;
  const json = { origin, 'content-type': 'application/json' };
  const corpo = { revisao, acao: 'incluir_recurso', tarefa_id: tarefaId, recurso: { tipo: 'material', descricao: 'Item de abuso' } };
  expect((await request.post(rota, { headers: { origin: 'https://site-malicioso.example', 'content-type': 'application/json' }, data: corpo })).status()).toBe(403);
  expect((await request.post(rota, { headers: { origin, 'content-type': 'text/plain' }, data: JSON.stringify(corpo) })).status()).toBe(415);
  expect((await request.post(rota, { headers: json, data: { ...corpo, revisao: revisao - 1 } })).status()).toBe(409);
  expect((await request.post(rota, { headers: json, data: { ...corpo, enchimento: 'x'.repeat(20_000) } })).status()).toBe(413);
  const sem = await request.post(rota, { headers: json, data: { revisao, acao: 'remover_envolvido', tarefa_id: tarefaId, item_id: `E-${randomUUID()}` } });
  expect(sem.status()).toBe(404);
  expect((await sem.json()).erro).toBe('Envolvido não encontrado.');
  expect((await request.get('/plataforma/cronograma/recursos-csv/C-inexistente/')).status()).toBe(404);
});

test('layout: sem rolagem horizontal em 1280 e 390 px, células sem estouro e sem violação séria nos dois temas', async ({ page }) => {
  const url = cronogramaUrl.replace('aba=tarefas', 'aba=envolvidos');
  for (const largura of [1280, 390]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.goto(url);
    await page.locator('details[data-ev-det] summary').first().click();
    expect(await semRolagem(page), `rolagem horizontal em ${largura}px`).toBe(true);
    const estouros = await page.locator('[data-ev] td').evaluateAll((tds) => tds.filter((td) => td.scrollWidth > td.clientWidth + 1).length);
    expect(estouros, `células com estouro em ${largura}px`).toBe(0);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const tema of ['light', 'dark']) {
    await page.goto(url);
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, tema);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(r.violations.filter((v) => ['serious', 'critical'].includes(v.impact || '')), `${tema}: ${JSON.stringify(r.violations)}`).toEqual([]);
  }
});

test('impressão: sem botões visíveis e com todos os detalhes abertos', async ({ page }) => {
  await page.goto(cronogramaUrl.replace('aba=tarefas', 'aba=envolvidos'));
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('[data-ev] button').filter({ visible: true })).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  const fechados = await page.locator('details[data-ev-det]').evaluateAll((ds) => ds.filter((d) => !(d as HTMLDetailsElement).open).length);
  expect(fechados).toBe(0);
  expect(await page.locator('details[data-ev-det]').count()).toBeGreaterThan(0);
});
