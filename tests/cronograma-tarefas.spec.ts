import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// E13 (áudio 31): cronograma como processo na tela, painel Responsáveis e abuso das rotas de gravação.
// No máximo 12 gravações neste arquivo (limite de 30 por minuto da suíte). Nada de dado real: nomes fictícios com token.
test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1280, height: 900 } });

const token = Date.now().toString(36);
const PESSOA_A = `Pessoa Teste A ${token}`;
const PESSOA_B = `Pessoa Teste B ${token}`;
const PESSOA_C = `Pessoa Teste C ${token}`;
const MOTIVO_XSS = '<img src=x onerror=alert(1)>';
const semRolagem = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const HEADER_CSV = 'Pessoa;Área;Tarefa;Fase;Cronograma;Projeto;Com a pessoa desde;Dias com a pessoa (agora);Dias com a pessoa (total na tarefa);Duração prevista (dias);Situação';

async function enviarFormulario(page: Page, campos: Record<string, string>) {
  const dlg = page.locator('[data-cr-dialogo]');
  await expect(dlg).toBeVisible();
  for (const [nome, valor] of Object.entries(campos)) await dlg.locator(`[name="${nome}"]`).fill(valor);
  await Promise.all([page.waitForEvent('load'), dlg.getByRole('button', { name: 'Salvar' }).click()]);
}

test('do zero: cria o cronograma, inclui tarefas, troca o responsável, reordena, conclui, remove e confere o Histórico', async ({ page, request }) => {
  await page.goto('/plataforma/projetos-carteira/');
  const origin = new URL(page.url()).origin;
  const criado = await request.post('/plataforma/projeto/criar/', { headers: { origin, 'content-type': 'application/json' }, data: { nome: `Projeto Cronograma ${token}`, orgao: 'SMS' } });
  expect(criado.status()).toBe(201);
  const projetoId = (await criado.json()).projeto.id as string;

  await page.goto(`/plataforma/projeto/${projetoId}/?aba=cronograma`);
  await page.locator('[data-fp-cron-criar]').click();
  await expect(page.locator('h1')).toHaveText('Novo cronograma');
  await expect(page.locator('select[name="projeto_id"]')).toHaveValue(projetoId);
  await page.getByRole('button', { name: 'Criar cronograma' }).click();
  await page.waitForURL(/\/plataforma\/cronograma\/C-[^/]+\/\?aba=tarefas&volta=/);
  const cronogramaUrl = page.url();
  await expect(page.getByText('Este cronograma ainda não tem tarefas.')).toBeVisible();
  await expect(page.locator('[data-voltar]')).toHaveText('← Voltar para a ficha do projeto');

  const hoje = await page.locator('[data-cr-editor]').getAttribute('data-hoje');
  await page.getByRole('button', { name: 'Incluir a primeira tarefa' }).click();
  await enviarFormulario(page, { nome: `Tarefa A ${token}`, fase: 'Planejamento', responsavel: PESSOA_A, unidade: 'Unidade Teste', inicio_real: hoje!, duracao_prevista: '10' });
  await expect(page.locator('[data-cr-tarefa]')).toHaveCount(1);
  await expect(page.locator('[data-cr-tarefa]').first()).toContainText(new RegExp(`Com ${PESSOA_A}.* desde hoje`));

  await page.getByRole('button', { name: '+ Nova tarefa' }).click();
  await enviarFormulario(page, { nome: `Tarefa B ${token}`, fase: 'Obra' });
  await expect(page.locator('[data-cr-tarefa]')).toHaveCount(2);
  const fases = () => page.locator('[data-cr-fase] h3').allTextContents();
  expect(await fases()).toEqual(['Planejamento', 'Obra']);

  // Troca de responsável (com histórico).
  await page.locator('[data-cr-tarefa]', { hasText: `Tarefa A ${token}` }).getByRole('button', { name: 'Trocar responsável' }).click();
  await enviarFormulario(page, { para_responsavel: PESSOA_B, motivo_troca: 'Motivo teste' });
  const linhaA = page.locator('[data-cr-tarefa]', { hasText: `Tarefa A ${token}` });
  await expect(linhaA).toContainText(PESSOA_B);
  await linhaA.locator('[data-cr-historico] summary').click();
  await expect(linhaA.locator('[data-cr-historico]')).toContainText('Motivo: Motivo teste');

  // "↓ fase" em Planejamento: Obra passa a ser a primeira.
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Descer a fase Planejamento' }).click()]);
  await expect.poll(fases).toEqual(['Obra', 'Planejamento']);

  // Conclui a A.
  await Promise.all([page.waitForEvent('load'), page.locator('[data-cr-tarefa]', { hasText: `Tarefa A ${token}` }).getByRole('button', { name: 'Concluir hoje' }).click()]);
  await expect(page.locator('[data-cr-tarefa]', { hasText: `Tarefa A ${token}` })).toContainText('Concluída');

  // Remove a B com motivo que tenta virar HTML: tem de aparecer como texto no Histórico (nunca como elemento).
  await page.locator('[data-cr-tarefa]', { hasText: `Tarefa B ${token}` }).getByRole('button', { name: 'Remover' }).click();
  await enviarFormulario(page, { motivo_remover: MOTIVO_XSS });
  await expect(page.locator('[data-cr-tarefa]')).toHaveCount(1);

  // Volta à ficha com a aba Cronograma aberta e confere o Histórico.
  await page.goto(cronogramaUrl);
  await page.locator('[data-voltar]').click();
  await expect(page).toHaveURL(new RegExp(`/plataforma/projeto/${projetoId}/\\?.*aba=cronograma`));
  await expect(page.locator('#fp-painel-cronograma')).toBeVisible();
  await page.goto(`/plataforma/projeto/${projetoId}/?aba=historico`);
  const historico = page.locator('[data-pj-historico]');
  await expect(historico).toContainText('Responsável da tarefa trocado');
  await expect(historico).toContainText('Tarefa removida do cronograma');
  await expect(historico).toContainText(MOTIVO_XSS); // como texto
  await expect(historico.locator('img')).toHaveCount(0);
});

test('base carregada: troca o responsável, abre o painel Responsáveis e volta com o filtro preservado', async ({ page }) => {
  test.setTimeout(75_000);
  await page.goto('/plataforma/cronograma/C-exemplo-002/?aba=tarefas');
  await expect(page.locator('[data-cr-editor]')).toContainText('Com Responsável');
  await page.locator('[data-cr-acao="trocar"]:not([disabled])').first().click();
  await enviarFormulario(page, { para_responsavel: PESSOA_C, para_unidade: 'Unidade Teste' });
  const painel = `/plataforma/gestao-responsaveis/?pessoa=${encodeURIComponent(PESSOA_C)}`;
  // O contexto é guardado até 30 s: recarrega até aparecer.
  await expect.poll(async () => { await page.goto(painel); return (await page.locator('[data-rp-pessoas]').count()) ? (await page.locator('[data-rp-pessoas]').innerText()).includes(PESSOA_C) : false; }, { timeout: 35_000, intervals: [1000, 2000, 3000] }).toBe(true);
  await expect(page.locator('[data-rp-pessoas]')).toContainText(PESSOA_C);
  await page.locator('[data-rp-linha] a').first().click();
  await expect(page).toHaveURL(/\/plataforma\/cronograma\/C-exemplo-002\/\?aba=tarefas&volta=.*#t-/);
  await expect(page.locator('[data-voltar]')).toHaveText('← Voltar para Responsáveis');
  await page.locator('[data-voltar]').click();
  await expect(page).toHaveURL(new RegExp(`/plataforma/gestao-responsaveis/\\?pessoa=${encodeURIComponent(PESSOA_C).replaceAll('%20', '(%20|\\+)')}`));
  await expect(page.locator('select[name="pessoa"]')).toHaveValue(PESSOA_C);
});

test('abuso das rotas: origem alheia, formato, versão velha, corpo grande, cronograma inexistente e projeto repetido', async ({ page, request }) => {
  await page.goto('/plataforma/projetos-carteira/');
  const origin = new URL(page.url()).origin;
  const rota = '/plataforma/cronograma/gravar/C-exemplo-002/';
  const corpo = { revisao: 0, acao: 'reordenar', ids: ['C-exemplo-002#1'] };
  const json = { origin, 'content-type': 'application/json' };
  expect((await request.post(rota, { headers: { origin: 'https://site-malicioso.example', 'content-type': 'application/json' }, data: corpo })).status()).toBe(403);
  expect((await request.post(rota, { headers: { origin, 'content-type': 'text/plain' }, data: JSON.stringify(corpo) })).status()).toBe(415);
  expect((await request.post(rota, { headers: json, data: corpo })).status()).toBe(409); // revisão 0 ficou velha depois da gravação do passo 2
  expect((await request.post(rota, { headers: json, data: { revisao: 0, acao: 'reordenar', ids: [], enchimento: 'x'.repeat(20_000) } })).status()).toBe(413);
  expect((await request.post('/plataforma/cronograma/gravar/C-nao-existe/', { headers: json, data: corpo })).status()).toBe(404);
  const ficha = await request.get('/plataforma/cronograma/C-exemplo-002/?aba=tarefas');
  expect(ficha.status()).toBe(200);
  // Projeto que já tem cronograma: 409 (o P-900 tem o C-exemplo-001).
  const dup = await request.post('/plataforma/cronograma/criar/', { headers: json, data: { projeto_id: 'P-900' } });
  expect(dup.status()).toBe(409);
  expect((await dup.json()).existente).toBe('C-exemplo-001');
});

test('layout: sem rolagem horizontal em 1280 e 390 px e sem violação séria nos dois temas', async ({ page }) => {
  const paginas = ['/plataforma/cronograma/C-exemplo-002/?aba=tarefas', '/plataforma/cronograma/novo/', '/plataforma/gestao-responsaveis/'];
  for (const largura of [1280, 390]) {
    await page.setViewportSize({ width: largura, height: 900 });
    for (const caminho of paginas) {
      await page.goto(caminho);
      expect(await semRolagem(page), `${caminho} em ${largura}px`).toBe(true);
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const tema of ['light', 'dark']) {
    for (const caminho of ['/plataforma/gestao-responsaveis/', '/plataforma/cronograma/C-exemplo-002/?aba=tarefas']) {
      await page.goto(caminho);
      await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, tema);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(r.violations.filter((v) => ['serious', 'critical'].includes(v.impact || '')), `${caminho} ${tema}: ${JSON.stringify(r.violations)}`).toEqual([]);
    }
  }
});

test('CSV do painel: 200, text/csv e o cabeçalho certo', async ({ request }) => {
  const r = await request.get('/plataforma/gestao-responsaveis/csv/');
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toContain('text/csv');
  const texto = (await r.text()).replace(/^﻿/, '');
  expect(texto.split('\r\n')[0]).toBe(HEADER_CSV.split(';').map((c) => `"${c}"`).join(';'));
});
