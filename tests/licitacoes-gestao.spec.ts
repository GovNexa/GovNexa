import { test, expect, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';

// E12: Gestão das licitações (Parte B). Nenhum teste altera as contratações do exemplo (C-EX01 a C-EX12): cada teste que grava cria a sua.
const PAINEL = '/plataforma/gestao-licitacoes/';
const GRAVAR = '/plataforma/gestao-licitacoes/gravar/';
const BRL = (v: string) => new RegExp(`R\\$\\s${v.replace(/\./g, '\\.')}`);
const nomeUnico = (t: TestInfo) => `E2E ${t.project.name} ${Date.now()}`;
const orgaoUnico = (t: TestInfo) => `E2E-${t.project.name}-${Date.now()}`;
const origem = (baseURL: string | undefined) => new URL(baseURL ?? 'http://127.0.0.1:4412').origin;

async function criarPorApi(request: APIRequestContext, baseURL: string | undefined, campos: Record<string, unknown>): Promise<string> {
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const r = await request.post(GRAVAR, { headers: { origin: origem(baseURL) }, data: { acao: 'criar', campos } });
    if (r.status() === 429) { await new Promise((ok) => setTimeout(ok, 5000)); continue; }
    expect(r.status()).toBe(200);
    return (await r.json()).id as string;
  }
  throw new Error('Limite de gravações (429) persistente.');
}
const semRolagem = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test('1. grandes números: seis cartões, contagens do exemplo e clique mantendo os filtros', async ({ page }) => {
  await page.goto(`${PAINEL}?orgao=SME`);
  await expect(page.locator('[data-ct-cartao]')).toHaveCount(6);
  await expect(page.locator('[data-ct-cartao="julgamento"]')).toHaveAttribute('data-qtd', '2');
  await expect(page.locator('[data-ct-cartao="concluida"]')).toHaveAttribute('data-qtd', '1');
  await expect(page.locator('[data-ct-cartao="preparacao"]')).toHaveAttribute('data-qtd', '1');
  await page.locator('[data-ct-cartao="julgamento"]').click();
  await expect(page).toHaveURL(/etapa=julgamento/);
  await expect(page).toHaveURL(/orgao=SME/);
  await expect(page.locator('[data-ct-etapa]')).toHaveCount(1);
  await expect(page.locator('[data-ct-etapa="julgamento"]')).toBeVisible();
  await expect(page.locator('[data-ct-cartao]')).toHaveCount(6);
  await expect(page.locator('[data-ct-cartao="concluida"]')).toHaveAttribute('data-qtd', '1');
});

test('2. filtros: aguardando PGM e Limpar', async ({ page }) => {
  await page.goto(`${PAINEL}?aguardando=pgm`);
  const lista = page.locator('[data-ct-aguardando="pgm"]');
  for (const nome of ['Reforma de Quadra Exemplo', 'Creche Exemplo Lote 1', 'Recapeamento Exemplo']) await expect(lista).toContainText(nome);
  await expect(lista.locator('li')).toHaveCount(3);
  await page.getByRole('link', { name: 'Limpar' }).click();
  await expect(page).toHaveURL(new RegExp(`${PAINEL}$`));
});

test('3. do cadastro ao fim, pela tela', async ({ page }, testInfo) => {
  page.on('dialog', (d) => { void d.accept(); });
  const nome = nomeUnico(testInfo);
  const orgao = orgaoUnico(testInfo);
  await page.goto(`${PAINEL}?novo=1`);
  const form = page.locator('[data-ct-form-nova]');
  await form.locator('[name="nome"]').fill(nome);
  await form.locator('[name="orgao"]').fill(orgao);
  await form.locator('[name="valor_estimado"]').fill('1.250.000,00');
  await form.getByRole('button', { name: 'Cadastrar' }).click();
  await expect(page).toHaveURL(/\/gestao-licitacoes\/C-[^/]+\/\?volta=/);
  await expect(page.locator('h1')).toHaveText(nome);
  for (const etapa of ['Em preparação', 'Edital em ajustes', 'Publicada', 'Em julgamento', 'Concluída']) {
    await page.locator('[data-ct-avancar]').click();
    await expect(page.locator('[data-ct-etapa-atual]')).toHaveText(etapa);
  }
  await expect(page.locator('[data-ct-avancar]')).toHaveCount(0);
  const campo = (c: string) => page.locator(`[data-ct-campo="${c}"]`);
  await campo('valor_contratado').locator('.ct-editar').click();
  await campo('valor_contratado').locator('input').fill('1.100.000,00');
  await campo('valor_contratado').getByRole('button', { name: 'Salvar' }).click();
  await expect(campo('valor_contratado').locator('[data-ct-texto]')).toHaveText(BRL('1.100.000,00'));
  await campo('valor_pago').locator('.ct-editar').click();
  await campo('valor_pago').locator('input').fill('550.000,00');
  await campo('valor_pago').getByRole('button', { name: 'Salvar' }).click();
  await expect(campo('valor_pago').locator('[data-ct-texto]')).toHaveText(BRL('550.000,00'));
  await page.reload();
  await expect(campo('valor_contratado').locator('[data-ct-texto]')).toHaveText(BRL('1.100.000,00'));
  // Marcos: criar, concluir, reabrir, remover.
  const marcos = page.locator('[data-ct-marcos-lista]');
  await marcos.locator('[name="data"]').fill('2026-12-20');
  await marcos.locator('[name="descricao"]').fill('Assinatura E2E');
  await marcos.getByRole('button', { name: 'Adicionar' }).click();
  const marco = marcos.locator('li[data-marco-id]');
  await expect(marco).toContainText('Pendente');
  await marco.getByRole('button', { name: 'Concluir' }).click();
  await expect(marco).toContainText('Concluído em');
  await marco.getByRole('button', { name: 'Reabrir' }).click();
  await expect(marco).toContainText('Pendente');
  await marco.getByRole('button', { name: 'Remover' }).click();
  await expect(marcos).toContainText('Nenhum marco registrado.');
  // Histórico.
  const historico = page.locator('[data-ct-historico]');
  await expect(historico.locator('strong', { hasText: 'Mudança de etapa' })).toHaveCount(5);
  await expect(historico).toContainText('Edição');
  await expect(historico).toContainText(/Valor contratado: — → R\$\s1\.100\.000,00/);
  // Outra etapa: voltar exige motivo.
  await page.locator('[data-ct-etapa-form] summary').click();
  await page.locator('[data-ct-etapa-form] select[name="para"]').selectOption('julgamento');
  await page.getByRole('button', { name: 'Mudar etapa' }).click();
  await expect(page.locator('[data-ct-msg]')).toContainText('informe o motivo');
  await page.locator('[data-ct-etapa-form] textarea[name="motivo"]').fill('Voltou ao julgamento (E2E)');
  await page.getByRole('button', { name: 'Mudar etapa' }).click();
  await expect(page.locator('[data-ct-etapa-atual]')).toHaveText('Em julgamento');
  // Remover com motivo: volta ao painel e o nome some.
  await page.locator('[data-ct-remover] summary').click();
  await page.locator('[data-ct-form-remover] textarea').fill('Fim do teste E2E');
  await page.locator('[data-ct-form-remover]').getByRole('button', { name: 'Remover' }).click();
  await expect(page).toHaveURL(new RegExp(`${PAINEL}$`));
  await expect(page.getByText(nome)).toHaveCount(0);
});

test('4. edição em linha no painel', async ({ page, request, baseURL }, testInfo) => {
  const nome = nomeUnico(testInfo);
  const orgao = orgaoUnico(testInfo);
  const id = await criarPorApi(request, baseURL, { nome, etapa: 'julgamento', orgao });
  await page.goto(`${PAINEL}?orgao=${encodeURIComponent(orgao)}`);
  const linha = page.locator(`[data-ct-linha][data-id="${id}"]`);
  const campo = (c: string) => linha.locator(`[data-ct-campo="${c}"]`);
  await campo('empresa').locator('.ct-editar').click();
  await campo('empresa').locator('input').fill('Empresa E2E');
  await campo('empresa').getByRole('button', { name: 'Salvar' }).click();
  await expect(page.locator('[data-ct-msg]')).toHaveText('Salvo e registrado no Histórico.');
  await expect(campo('empresa').locator('[data-ct-texto]')).toHaveText('Empresa E2E');
  await campo('colocacao').locator('.ct-editar').click();
  await campo('colocacao').locator('input').fill('2');
  await campo('colocacao').locator('input').press('Enter');
  await expect(campo('colocacao').locator('[data-ct-texto]')).toHaveText('2º colocado');
  await campo('valor_proposta').locator('.ct-editar').click();
  await campo('valor_proposta').locator('input').fill('abc');
  await campo('valor_proposta').getByRole('button', { name: 'Salvar' }).click();
  await expect(page.locator('[data-ct-msg]')).toHaveText('Valor inválido: use o formato 1.234,56.');
});

test('5. XSS: nome e motivo aparecem como texto', async ({ page, request, baseURL }, testInfo) => {
  page.on('dialog', (d) => { void d.accept(); });
  const nome = `<img src=x onerror="window.__xss=1">E2E ${Date.now()}`;
  const orgao = orgaoUnico(testInfo);
  await page.goto(`${PAINEL}?novo=1`);
  const form = page.locator('[data-ct-form-nova]');
  await form.locator('[name="nome"]').fill(nome);
  await form.locator('[name="orgao"]').fill(orgao);
  await form.getByRole('button', { name: 'Cadastrar' }).click();
  await expect(page).toHaveURL(/\/gestao-licitacoes\/C-[^/]+\//);
  await expect(page.locator('h1')).toHaveText(nome);
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  // Motivo com marcação: aparece literal no Histórico.
  const motivo = '<img src=x onerror=alert(1)>';
  await page.locator('[data-ct-etapa-form] summary').click();
  await page.locator('[data-ct-etapa-form] select[name="para"]').selectOption('ajustes');
  await page.locator('[data-ct-etapa-form] textarea[name="motivo"]').fill(motivo);
  await page.getByRole('button', { name: 'Mudar etapa' }).click();
  await expect(page.locator('[data-ct-etapa-atual]')).toHaveText('Edital em ajustes');
  await expect(page.locator('[data-ct-historico]')).toContainText(`Motivo: ${motivo}`);
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  await page.goto(`${PAINEL}?orgao=${encodeURIComponent(orgao)}`);
  await expect(page.locator('[data-ct-linha]').first()).toContainText(nome);
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  // CSV: a célula vem entre aspas, como texto.
  const csv = await request.get(`${PAINEL}csv/?orgao=${encodeURIComponent(orgao)}`);
  expect(await csv.text()).toContain(`"${nome.replace(/"/g, '""')}"`);
  void baseURL;
});

test('6. conflito: outra pessoa grava antes', async ({ page, baseURL }, testInfo) => {
  const nome = nomeUnico(testInfo);
  const id = await criarPorApi(page.request, baseURL, { nome, etapa: 'preparacao', orgao: orgaoUnico(testInfo) });
  await page.goto(`${PAINEL}${id}/`);
  const r = await page.request.post(GRAVAR, { headers: { origin: origem(baseURL) }, data: { acao: 'editar', id, revisao: 0, campos: { situacao: 'outra pessoa' } } });
  expect(r.status()).toBe(200);
  const campo = page.locator('[data-ct-campo="onde_esta"]');
  await campo.locator('.ct-editar').click();
  await campo.locator('input').fill('Gabinete');
  await campo.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.locator('[data-ct-msg]')).toContainText('alterada por outra pessoa');
});

test('7. rota de gravação: origem e formato', async ({ request, baseURL }) => {
  expect((await request.post(GRAVAR, { data: { acao: 'criar', campos: {} } })).status()).toBe(403);
  const r = await request.post(GRAVAR, { headers: { origin: origem(baseURL), 'content-type': 'text/plain' }, data: 'x' });
  expect(r.status()).toBe(415);
});

test('8. navegação de volta', async ({ page }) => {
  const original = `${PAINEL}?orgao=SEINFRA&aguardando=pgm`;
  await page.goto(original);
  await page.locator('[data-ct-linha][data-id="C-EX09"] a').first().click();
  await expect(page).toHaveURL(/\/C-EX09\//);
  await expect(page.locator('[data-ct-voltar]')).toHaveText('← Voltar para Gestão das licitações');
  await page.locator('[data-ct-voltar]').click();
  await expect(page.locator('[data-ct-cartao]').first()).toBeVisible();
  expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(original);

  await page.goto('/plataforma/projeto/P-906/?aba=contratacoes');
  const itens = page.locator('[data-fp-contratacoes]');
  await expect(itens).toContainText('Centro Comunitário Exemplo G');
  await itens.getByRole('link', { name: 'Centro Comunitário Exemplo G' }).click();
  await expect(page).toHaveURL(/\/C-EX01\//);
  await expect(page.locator('[data-ct-voltar]')).toHaveText('← Voltar para o projeto');
  await page.locator('[data-ct-voltar]').click();
  await expect(page).toHaveURL(/\/plataforma\/projeto\/P-906\/\?aba=contratacoes/);
  await expect(page.locator('#fp-aba-contratacoes')).toBeChecked();

  await page.locator('[data-fp-contratacoes-novo]').click();
  await expect(page).toHaveURL(/gestao-licitacoes\/\?novo=1&projeto=P-906/);
  await expect(page.locator('details[data-ct-nova]')).toHaveAttribute('open', '');
  await expect(page.locator('[data-ct-form-nova] [name="projeto_id"]')).toHaveValue('P-906');

  await page.goto(`${PAINEL}C-EX01/?volta=https://exemplo.invalid/`);
  await expect(page.locator('[data-ct-voltar]')).toHaveAttribute('href', PAINEL);
});

for (const [largura, altura] of [[1280, 800], [390, 844]]) {
  for (const tema of ['light', 'dark']) {
    test(`9. sem rolagem horizontal ${largura}px, tema ${tema}`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: altura });
      await page.addInitScript((v) => localStorage.setItem('govnexa-theme', v), tema);
      for (const rota of [PAINEL, `${PAINEL}C-EX01/`]) {
        await page.goto(rota);
        await expect(page.locator('[data-ct]')).toBeVisible();
        expect(await semRolagem(page), rota).toBe(true);
      }
    });
  }
}

test('10. CSV e impressão', async ({ page, request }) => {
  const r = await request.get(`${PAINEL}csv/?orgao=SME`);
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toContain('text/csv');
  const texto = await r.text();
  expect(texto.startsWith('﻿"Etapa";"Código";"Contratação"')).toBe(true);
  const linhas = texto.split('\r\n').filter(Boolean);
  expect(linhas).toHaveLength(5);
  for (const id of ['C-EX02', 'C-EX04', 'C-EX05', 'C-EX10']) expect(texto).toContain(id);
  await page.goto(PAINEL);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('[data-ct-filtros]')).toBeHidden();
  await expect(page.locator('.ct-editar').first()).toBeHidden();
  await expect(page.locator('.ct-impressao')).toBeVisible();
});

test('11. página inexistente', async ({ request }) => {
  expect((await request.get(`${PAINEL}C-NAOEXISTE/`)).status()).toBe(404);
  expect((await request.get(`${PAINEL}abc/`)).status()).toBe(404);
});
