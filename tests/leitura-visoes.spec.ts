import { test, expect } from '@playwright/test';

// E11: servidor local com o usuário fictício de perfil leitura (projeto "leitura" do playwright.config.ts, semente de
// scripts/db-local.mjs). O menu esconde as guias que o perfil não abre, e as páginas continuam recusando com 403.
const ESCONDIDAS = ['/plataforma/gestao-equipe/', '/plataforma/gestao-inconsistencias/', '/plataforma/usuarios/'];

test('leitura: o menu tem as três visões e não mostra as guias que o perfil não pode abrir', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/plataforma/convenios/');
  await expect(page.locator('h1')).toHaveText('Visão Convênios');
  await expect(page.locator('.app-user .user-name')).toHaveText('Leitura local');
  const nomes = await page.locator('.side-links button[data-sec^="m:"] .side-sec-label').allTextContents();
  expect(nomes).toEqual(['Visão gerencial', 'Governança da execução', 'Convênios', 'Licitações', 'Conta']);
  for (const href of ESCONDIDAS) {
    await expect(page.locator(`.sidebar a[href="${href}"], .side-module-flyouts a[href="${href}"]`), href).toHaveCount(0);
  }
  // O resto da Governança continua visível para o prefeito.
  for (const href of ['/plataforma/projetos-cronogramas/', '/plataforma/projetos-parado/', '/plataforma/projetos-log/', '/plataforma/convenios/', '/plataforma/']) {
    await expect(page.locator(`.side-links a[href="${href}"]`), href).toHaveCount(1);
  }
});

test('leitura: as guias escondidas continuam recusando pelo endereço (403)', async ({ page, request }) => {
  for (const href of ['/plataforma/gestao-equipe/', '/plataforma/gestao-inconsistencias/']) {
    const r = await page.goto(href);
    expect(r?.status(), href).toBe(403);
    await expect(page.getByRole('alert')).toContainText('Sem permissão');
  }
  const csv = await request.get('/plataforma/gestao-inconsistencias/csv/');
  expect(csv.status()).toBe(403);
  expect(await csv.text()).toBe('Sem permissão.');
  expect((await page.goto('/plataforma/usuarios/'))?.status()).toBe(403);
});
