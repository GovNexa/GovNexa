import { test, expect } from '@playwright/test';

// E12: perfil leitura (prefeito) vê tudo da Gestão das licitações e não recebe nenhum controle de gravação.
const PAINEL = '/plataforma/gestao-licitacoes/';
const CONTROLES = '.ct-editar, [data-ct-nova], [data-ct-etapa-form], [data-ct-remover], [data-ct-form-marco], [data-ct-avancar]';

test('leitura: painel com os seis cartões e sem controles de edição', async ({ page }) => {
  await page.goto(PAINEL);
  await expect(page.locator('[data-ct-cartao]')).toHaveCount(6);
  await expect(page.locator('[data-ct-linha]').first()).toBeVisible();
  await expect(page.locator(CONTROLES)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Nova contratação' })).toHaveCount(0);
  await expect(page.locator('[data-ct-imprimir]')).toBeVisible();
});

test('leitura: página da contratação abre sem controles', async ({ page }) => {
  await page.goto(`${PAINEL}C-EX01/`);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('[data-ct-historico]')).toBeVisible();
  await expect(page.locator(CONTROLES)).toHaveCount(0);
});

test('leitura: a rota de gravação recusa com 403', async ({ request, baseURL }) => {
  const r = await request.post(`${PAINEL}gravar/`, {
    headers: { origin: new URL(baseURL!).origin },
    data: { acao: 'editar', id: 'C-EX01', revisao: 0, campos: { situacao: 'x' } },
  });
  expect(r.status()).toBe(403);
});

test('leitura: ficha do projeto lista as contratações sem o link de cadastrar', async ({ page }) => {
  await page.goto('/plataforma/projeto/P-906/?aba=contratacoes');
  await expect(page.locator('[data-fp-contratacoes]')).toContainText('Centro Comunitário Exemplo G');
  await expect(page.locator('[data-fp-contratacoes-novo]')).toHaveCount(0);
});
