import { test, expect } from '@playwright/test';

// E13: o perfil leitura vê o cronograma e o painel Responsáveis, mas não tem botões de alteração e as rotas recusam com 403.
test('leitura: cronograma sem botões de ação, sem "Novo cronograma" na lista e rotas recusando', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/plataforma/cronograma/C-exemplo-001/?aba=tarefas');
  await expect(page.locator('[data-cr-tarefa]').first()).toBeVisible();
  await expect(page.locator('[data-cr-acao]')).toHaveCount(0);
  await expect(page.locator('[data-cr-dialogo]')).toHaveCount(0);
  await page.goto('/plataforma/projetos-cronogramas/');
  await expect(page.getByRole('link', { name: 'Novo cronograma' })).toHaveCount(0);

  const origin = new URL(page.url()).origin;
  const r = await request.post('/plataforma/cronograma/gravar/C-exemplo-001/', { headers: { origin, 'content-type': 'application/json' }, data: { revisao: 0, acao: 'reordenar', ids: ['C-exemplo-001#1'] } });
  expect(r.status()).toBe(403);
  const c = await request.post('/plataforma/cronograma/criar/', { headers: { origin, 'content-type': 'application/json' }, data: { projeto_id: 'P-901' } });
  expect(c.status()).toBe(403);

  const nova = await page.goto('/plataforma/cronograma/novo/');
  expect(nova?.status()).toBe(403);
  await expect(page.getByRole('alert')).toContainText('Sem permissão');
});

test('leitura: o painel Responsáveis abre e aparece no menu', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const r = await page.goto('/plataforma/gestao-responsaveis/');
  expect(r?.status()).toBe(200);
  await expect(page.locator('h1')).toHaveText('Responsáveis');
  await expect(page.locator('.side-links a[href="/plataforma/gestao-responsaveis/"]')).toHaveCount(1);
  await expect(page.locator('[data-rp-csv]')).toBeVisible();
});
