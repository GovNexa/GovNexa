import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// E7: Kanban enxuto, sem Conclusão, saída do marco, filtros e mudança de etapa gravando no banco (B3).
// Os testes que gravam criam o próprio projeto (nunca mexem nos projetos de exemplo, usados por outros testes).
const K = '/plataforma/projetos-kanban/';
const PD = '/plataforma/projetos-pendencias/';
const G = '/plataforma/projetos-gantt/';
const NOMES = ['Em estruturação', 'Planejamento', 'Preparatório para Contratação', 'Contratação', 'Mobilização', 'Execução'];
const MARCOS = [
  'Previsão de saída: entrega das peças técnicas', 'Previsão de saída: fim do planejamento', 'Previsão de saída: fim do preparatório',
  'Previsão de saída: contratação', 'Previsão de saída: mobilização', 'Previsão de saída: entrega da obra',
];
const semRolagem = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const card = (page: Page, id: string) => page.locator(`[data-kb-card][data-id="${id}"]`);
const coluna = (page: Page, codigo: string) => page.locator(`[data-kb-col][data-codigo="${codigo}"]`);
const unico = (prefixo: string) => `${prefixo} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function criar(page: Page, request: APIRequestContext, nome: string, extra: Record<string, unknown> = {}): Promise<string> {
  if (page.url() === 'about:blank') await page.goto(K);
  const origin = new URL(page.url()).origin;
  const r = await request.post('/plataforma/projeto/criar/', { headers: { origin, 'content-type': 'application/json' }, data: { nome, orgao: 'SMS', ...extra } });
  expect(r.status()).toBe(201);
  return (await r.json()).projeto.id as string;
}
const abrirQuadro = (page: Page, nome: string) => page.goto(K + '?q=' + encodeURIComponent(nome));

test.use({ viewport: { width: 1280, height: 900 } });

test('kanban: colunas de Em estruturação até Execução, sem Conclusão, com a previsão de saída do marco', async ({ page }) => {
  await page.goto(K);
  await expect(page.locator('.kq-col h2')).toHaveText(NOMES);
  await expect(coluna(page, '06')).toHaveCount(0);
  await expect(page.locator('[data-kb-marco]')).toHaveText(MARCOS);
  await expect(card(page, 'P-900').locator('[data-kb-saida]')).toHaveText('Saída prevista: 02/04/2026');
  await expect(coluna(page, '05').locator('[data-kb-card][data-id="P-905"] [data-kb-saida]')).toHaveText('Saída prevista: 11/07/2027');
  await expect(card(page, 'P-906')).toHaveCount(0);
  await expect(page.locator('[data-kb-concluidos]')).toContainText('em Conclusão não aparece');
  await expect(page.getByText('Modo simulação')).toHaveCount(0);
});

test('kanban: card enxuto só com nome, órgão e saída prevista, e mais cards por coluna', async ({ page }) => {
  await page.goto(K);
  const c = card(page, 'P-900');
  await expect(c.locator('.kq-nome')).toHaveText('Unidade de Saúde Exemplo A');
  await expect(c.locator('.kq-orgao')).toHaveText('SEINFRA');
  await expect(c.locator('.kq-nome')).toHaveAttribute('href', '/plataforma/projeto/P-900/?volta=%2Fplataforma%2Fprojetos-kanban%2F');
  const texto = (await c.innerText()).replace(/\s+/g, ' ');
  expect(texto).not.toMatch(/R\$|Valor|Vermelho|Amarelo|\bVerde\b|[Ff]arol/);
  expect((await c.boundingBox())!.height).toBeLessThanOrEqual(110);
  await expect(page.locator('.cart-ponto, .kb-farol')).toHaveCount(0);
});

test('kanban: filtros do padrão no endereço (órgão, área, nome, período e macroetapa)', async ({ page }) => {
  await page.goto(K);
  await expect(page.getByRole('search', { name: 'Filtros do Kanban' })).toBeVisible();
  const select = page.locator('form[data-filtros-projetos] select[name=orgao]');
  await select.selectOption('SEINFRA');
  await Promise.all([page.waitForURL(/[?&]orgao=SEINFRA/), page.getByRole('button', { name: 'Aplicar filtros' }).click()]);
  const orgaos = await page.locator('[data-kb-card] .kq-orgao').allInnerTexts();
  expect(orgaos.length).toBeGreaterThanOrEqual(3);
  expect(new Set(orgaos)).toEqual(new Set(['SEINFRA']));
  const ids = async () => (await page.locator('[data-kb-card]').evaluateAll((l) => l.map((e) => (e as HTMLElement).dataset.id!))).sort();
  await page.goto(K + '?area=saude');
  expect(await ids()).toContain('P-901');
  await page.goto(K + '?q=ponte');
  expect(await ids()).toEqual(expect.arrayContaining(['P-901', 'P-909']));
  for (const n of await page.locator('[data-kb-card] .kq-nome').allInnerTexts()) expect(n.toLowerCase()).toContain('ponte');
  await page.goto(K + '?de_mes=01&de_ano=2027&ate_mes=06&ate_ano=2027');
  const periodo = await ids();
  expect(periodo).toEqual(expect.arrayContaining(['P-900', 'P-901', 'P-904', 'P-908']));
  expect(periodo).not.toContain('P-902');
  await page.goto(K + '?macro=02');
  expect(await ids()).toEqual(expect.arrayContaining(['P-902', 'P-909']));
  for (const m of await page.locator('[data-kb-card]').evaluateAll((l) => l.map((e) => (e as HTMLElement).dataset.macro))) expect(m).toBe('02');
  await page.goto(K + '?macro=06');
  await expect(page.locator('[data-kb-aviso-conclusao]')).toBeVisible();
  await expect(page.locator('[data-kb-card]')).toHaveCount(0);
});

test('kanban: mover pelo botão grava, o card vai para a próxima coluna e aparece no Histórico da ficha', async ({ page, request }) => {
  const nome = unico('Projeto E7 botão');
  const id = await criar(page, request, nome);
  await abrirQuadro(page, nome);
  await expect(coluna(page, '00').locator(`[data-id="${id}"]`)).toHaveCount(1);
  await expect(card(page, id)).toHaveAttribute('data-revisao', '0');
  await card(page, id).getByRole('button', { name: `Mover ${nome}` }).click();
  const dlg = page.locator('#kb-dialog');
  await expect(dlg).toBeVisible();
  await expect(dlg.getByLabel('Para a etapa')).toHaveValue('01');
  await dlg.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(dlg).toBeHidden();
  await expect(coluna(page, '01').locator(`[data-id="${id}"]`)).toHaveCount(1);
  await expect(card(page, id)).toHaveAttribute('data-revisao', '1');
  await expect(page.locator('#toast')).toContainText('Registrado no Histórico');
  await page.reload();
  await expect(coluna(page, '01').locator(`[data-id="${id}"]`)).toHaveCount(1);
  await page.goto(`/plataforma/projeto/${id}/?aba=historico`);
  const historico = page.locator('[data-pj-historico]');
  await expect(historico).toContainText('Mudança de etapa');
  await expect(historico).toContainText('Em estruturação → Planejamento');
  await expect(historico).toContainText('Kanban · por');
});

test('kanban: arrastar para a próxima coluna grava; pular etapa pede forçar com motivo e o motivo fica no Histórico', async ({ page, request }) => {
  const nome = unico('Projeto E7 arrastar');
  const id = await criar(page, request, nome);
  await abrirQuadro(page, nome);
  await card(page, id).dragTo(coluna(page, '01').locator('.kq-lista'));
  await expect(coluna(page, '01').locator(`[data-id="${id}"]`)).toHaveCount(1);
  await expect(page.locator('#kb-dialog')).toBeHidden();
  await card(page, id).dragTo(coluna(page, '03').locator('.kq-lista'));
  const dlg = page.locator('#kb-dialog');
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole('alert')).toContainText('Avançar mais de uma etapa exige forçar com motivo.');
  await expect(dlg.getByLabel('Para a etapa')).toHaveValue('03');
  await dlg.getByLabel(/Forçar com motivo/).check();
  await dlg.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(dlg.getByRole('alert')).toContainText('Informe o motivo para forçar.');
  await dlg.getByLabel(/^Motivo/).fill('Teste E7: decisão do gabinete');
  await dlg.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(dlg).toBeHidden();
  await expect(coluna(page, '03').locator(`[data-id="${id}"]`)).toHaveCount(1);
  await expect(page.locator('#toast')).toContainText('forçado com motivo');
  await page.goto(`/plataforma/projeto/${id}/?aba=historico`);
  await expect(page.locator('[data-pj-historico]')).toContainText('Planejamento → Contratação');
  await expect(page.locator('[data-pj-historico]')).toContainText('Motivo: Teste E7: decisão do gabinete');
});

test('kanban: voltar sem motivo é recusado, com motivo grava; mesma etapa não envia nada', async ({ page, request }) => {
  const nome = unico('Projeto E7 voltar');
  const id = await criar(page, request, nome);
  await abrirQuadro(page, nome);
  const dlg = page.locator('#kb-dialog');
  const mover = () => card(page, id).getByRole('button', { name: `Mover ${nome}` }).click();
  await mover();
  await dlg.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(coluna(page, '01').locator(`[data-id="${id}"]`)).toHaveCount(1);
  await mover();
  await dlg.getByLabel('Para a etapa').selectOption('01');
  await dlg.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(dlg.getByRole('alert')).toHaveText('O projeto já está nesta etapa. Escolha outra.');
  await expect(card(page, id)).toHaveAttribute('data-revisao', '1');
  await dlg.getByLabel('Para a etapa').selectOption('00');
  await dlg.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(dlg.getByRole('alert')).toContainText('Para voltar de etapa, informe o motivo.');
  await expect(dlg.locator('[data-kb-dlg-forcar-linha]')).toBeHidden();
  await dlg.getByLabel(/^Motivo/).fill('Teste E7: faltou o orçamento');
  await dlg.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(dlg).toBeHidden();
  await expect(coluna(page, '00').locator(`[data-id="${id}"]`)).toHaveCount(1);
  await expect(card(page, id)).toHaveAttribute('data-revisao', '2');
});

test('kanban: alteração feita por outra pessoa no meio devolve 409 e nada é sobrescrito', async ({ page, request }) => {
  const nome = unico('Projeto E7 conflito');
  const id = await criar(page, request, nome);
  await abrirQuadro(page, nome);
  const origin = new URL(page.url()).origin;
  const outra = await request.post(`/plataforma/projeto/mover/${id}/`, { headers: { origin, 'content-type': 'application/json' }, data: { revisao: 0, de: '00', para: '01', origem: 'kanban' } });
  expect(outra.status()).toBe(200);
  expect(await outra.json()).toEqual({ ok: true, revisao: 1, macroetapa: '01', saida: null, forcado: false });
  await card(page, id).getByRole('button', { name: `Mover ${nome}` }).click();
  const dlg = page.locator('#kb-dialog');
  await dlg.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(dlg.getByRole('alert')).toContainText('alterado por outra pessoa');
  await expect(coluna(page, '00').locator(`[data-id="${id}"]`)).toHaveCount(1);
  await page.reload();
  await expect(coluna(page, '01').locator(`[data-id="${id}"]`)).toHaveCount(1);
  await page.goto(`/plataforma/projeto/${id}/?aba=historico`);
  await expect(page.locator('[data-pj-historico] li', { hasText: 'Mudança de etapa' })).toHaveCount(1);
});

test('kanban: ir para Conclusão tira o card do quadro e o projeto segue na Carteira', async ({ page, request }) => {
  const nome = unico('Projeto E7 conclusao');
  const id = await criar(page, request, nome);
  await abrirQuadro(page, nome);
  await card(page, id).getByRole('button', { name: `Mover ${nome}` }).click();
  const dlg = page.locator('#kb-dialog');
  await dlg.getByLabel('Para a etapa').selectOption({ label: 'Conclusão (sai do Kanban)' });
  await dlg.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(dlg.getByRole('alert')).toContainText('Avançar mais de uma etapa exige forçar com motivo.');
  await dlg.getByLabel(/Forçar com motivo/).check();
  await dlg.getByLabel(/^Motivo/).fill('Teste E7: obra entregue');
  await dlg.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(dlg).toBeHidden();
  await expect(card(page, id)).toHaveCount(0);
  await expect(page.locator('#toast')).toContainText('saiu do Kanban');
  await page.reload();
  await expect(card(page, id)).toHaveCount(0);
  await page.goto('/plataforma/projetos-carteira/?macro=06&q=' + encodeURIComponent(nome));
  await expect(page.locator('main')).toContainText(nome);
});

test('kanban: a rota recusa origem de fora, formato errado, corpo grande, JSON quebrado e projeto inexistente', async ({ page, request }) => {
  await page.goto(K);
  const origin = new URL(page.url()).origin;
  const rota = '/plataforma/projeto/mover/P-NAO-EXISTE/';
  const json = { 'content-type': 'application/json' };
  const corpo = { revisao: 0, de: '00', para: '01', origem: 'kanban' };
  expect((await request.post(rota, { headers: json, data: corpo })).status()).toBe(403);
  expect((await request.post(rota, { headers: { ...json, origin: 'https://site-malicioso.example' }, data: corpo })).status()).toBe(403);
  expect((await request.post(rota, { headers: { origin }, form: { revisao: '0' } })).status()).toBe(415);
  const grande = await request.post(rota, { headers: { ...json, origin }, data: { ...corpo, motivo: 'x'.repeat(5000) } });
  expect(grande.status()).toBe(413);
  const quebrado = await request.post(rota, { headers: { ...json, origin }, data: '{"revisao":' });
  expect(quebrado.status()).toBe(400);
  const inexistente = await request.post(rota, { headers: { ...json, origin }, data: corpo });
  expect(inexistente.status()).toBe(404);
  expect(inexistente.headers()['cache-control']).toContain('no-store');
});

test('pendências: aprovar avança e reprovar volta, gravando com motivo no Histórico', async ({ page, request }) => {
  const nome = unico('Projeto E7 pendencia');
  const id = await criar(page, request, nome, { valor_obra: 1000, origem_valor: 'Estimativa', datas: { pecas_tecnicas: '2026-03-01' } });
  await page.goto(PD);
  await expect(page.getByText('Modo simulação')).toHaveCount(0);
  const linha = page.locator(`[data-pd-linha][data-id="${id}"]`);
  await linha.getByRole('button', { name: 'Aprovar', exact: true }).click();
  await expect(linha.locator('[data-pd-resultado]')).toHaveText('Avançou para Planejamento. Registrado no Histórico.');
  await page.reload();
  await expect(page.locator(`[data-pd-grupo][data-codigo="01"] [data-pd-linha][data-id="${id}"]`)).toHaveCount(1);
  await linha.getByRole('button', { name: 'Reprovar', exact: true }).click();
  const dlg = page.locator('#pd-dialog');
  await dlg.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(dlg.getByRole('alert')).toContainText('Informe o motivo.');
  await dlg.getByLabel('Motivo (obrigatório)').fill('Teste E7: documento incompleto');
  await dlg.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(dlg).toBeHidden();
  await expect(linha.locator('[data-pd-resultado]')).toHaveText('Voltou para Em estruturação. Registrado no Histórico.');
  await page.goto(`/plataforma/projeto/${id}/?aba=historico`);
  const historico = page.locator('[data-pj-historico]');
  await expect(historico).toContainText('Pendências de etapa · por');
  await expect(historico).toContainText('Motivo: Teste E7: documento incompleto');
});

test('kanban e pendências: 390 px sem rolagem horizontal da página', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const caminho of [K, K + '?orgao=SEINFRA', PD]) {
    await page.goto(caminho);
    expect(await semRolagem(page), caminho).toBe(true);
  }
  await page.goto(K);
  await page.locator('[data-kb-mover]').first().click();
  await expect(page.locator('#kb-dialog')).toBeVisible();
  expect(await semRolagem(page)).toBe(true);
});

for (const tema of ['light', 'dark'] as const) {
  test(`kanban e pendências: sem falhas graves de acessibilidade no tema ${tema}`, async ({ page }) => {
    // Sem animação: a abertura do diálogo (180 ms) mudaria as cores medidas pelo axe.
    await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
    for (const caminho of [K, PD]) {
      await page.goto(caminho);
      await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, tema);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(r.violations.filter((v) => ['serious', 'critical'].includes(v.impact || '')), `${caminho} ${tema}`).toEqual([]);
    }
    await page.goto(K);
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, tema);
    await page.locator('[data-kb-mover]').first().click();
    const r = await new AxeBuilder({ page }).include('#kb-dialog').analyze();
    expect(r.violations.filter((v) => ['serious', 'critical'].includes(v.impact || '')), `diálogo ${tema}`).toEqual([]);
  });
}

test('gantt: busca pelo nome junto com o órgão e o período de entrega', async ({ page }) => {
  await page.goto(G + '?q=ponte');
  const linhas = page.locator('[data-gt-linha]');
  expect(await linhas.count()).toBeGreaterThanOrEqual(2);
  for (const t of await linhas.locator('.gt-rotulo').evaluateAll((l) => l.map((e) => e.getAttribute('title') ?? ''))) expect(t.toLowerCase()).toContain('ponte');
  await page.goto(G + '?q=ponte&orgao=SMS&de_mes=01&de_ano=2027&ate_mes=12&ate_ano=2027');
  await expect(linhas).toHaveCount(1);
  await expect(linhas.first()).toHaveAttribute('data-orgao', 'SMS');
  await expect(page.locator('form[data-filtros-projetos] input[name=q]')).toHaveValue('ponte');
});
