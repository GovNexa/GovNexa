import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Página do projeto e gravação da localização (entrega B1). P-903 é usado só aqui, para não disputar dados com outros testes.
const PROJETO = 'P-903';
const PAGINA = `/plataforma/projeto/${PROJETO}/`;
const ROTA = `/plataforma/projeto/localizacao/${PROJETO}/`;
const PONTO = { tipo: 'ponto', ponto: { lat: -16.70123456, lng: -49.28123456 }, endereco: 'Praça de exemplo' };
const semRolagem = (page: import('@playwright/test').Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test('página do projeto: abre pela Carteira e mostra os blocos do projeto', async ({ page }) => {
  await page.goto(PAGINA);
  await expect(page.locator('h1')).toContainText(PROJETO);
  await expect(page.locator('[data-module-title]')).toHaveText('Projeto');
  for (const titulo of ['Resumo', 'Valores e recursos', 'Datas previstas', 'Localização', 'Documentos', 'Histórico']) {
    await expect(page.getByRole('heading', { level: 2, name: titulo, exact: true })).toBeVisible();
  }
  await expect(page.getByText('Modo simulação')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Abrir os documentos do projeto' })).toHaveAttribute('href', `/plataforma/documentos-projeto/projeto/${PROJETO}/`);
  await page.getByRole('link', { name: '← Carteira de projetos' }).click();
  await expect(page).toHaveURL(/\/plataforma\/projetos-carteira\//);
  // A tela de documentos leva de volta à página do projeto.
  await page.goto(`/plataforma/documentos-projeto/projeto/${PROJETO}/`);
  await page.locator('.doc-contexto').getByRole('link', { name: new RegExp(PROJETO) }).click();
  await expect(page).toHaveURL(new RegExp(`/plataforma/projeto/${PROJETO}/$`));
});

test('página do projeto: código inexistente ou malformado devolve 404', async ({ page }) => {
  expect((await page.goto('/plataforma/projeto/P-NAO-EXISTE/'))?.status()).toBe(404);
  expect((await page.goto('/plataforma/projeto/%3Cscript%3E/'))?.status()).toBe(404);
});

test('localização: recusa origem de fora, formato errado, corpo grande e valor inválido', async ({ page, request }) => {
  await page.goto(PAGINA);
  const origin = new URL(page.url()).origin;
  const json = { 'content-type': 'application/json' };
  const fora = await request.post(ROTA, { headers: { ...json, origin: 'https://site-malicioso.example' }, data: PONTO });
  expect(fora.status()).toBe(403);
  const semOrigem = await request.post(ROTA, { headers: json, data: PONTO });
  expect(semOrigem.status()).toBe(403);
  const formulario = await request.post(ROTA, { headers: { origin }, form: { tipo: 'ponto' } });
  expect([403, 415]).toContain(formulario.status());
  const grande = await request.post(ROTA, { headers: { ...json, origin }, data: { ...PONTO, endereco: 'x'.repeat(300_000) } });
  expect(grande.status()).toBe(413);
  const invalido = await request.post(ROTA, { headers: { ...json, origin }, data: { tipo: 'ponto', ponto: { lat: 0, lng: 0 } } });
  expect(invalido.status()).toBe(400);
  expect((await invalido.json()).erros).toEqual(['O ponto está fora de Goiânia.']);
  const quebrado = await request.post(ROTA, { headers: { ...json, origin }, data: '{nao e json' });
  expect(quebrado.status()).toBe(400);
  const inexistente = await request.post('/plataforma/projeto/localizacao/P-NAO-EXISTE/', { headers: { ...json, origin }, data: PONTO });
  expect(inexistente.status()).toBe(404);
  // GET não existe nessa rota: nada é gravado por link.
  expect((await request.get(ROTA)).status()).not.toBe(200);
});

test('localização: salvar grava no banco, aparece na página do projeto e no Histórico', async ({ page, request }) => {
  await page.goto(PAGINA);
  const origin = new URL(page.url()).origin;
  const r = await request.post(ROTA, { headers: { 'content-type': 'application/json', origin }, data: { ...PONTO, campo_a_mais: '<b>x</b>' } });
  expect(r.status()).toBe(200);
  const corpo = await r.json();
  expect(corpo.ok).toBe(true);
  expect(corpo.localizacao).toEqual({ tipo: 'ponto', ponto: { lat: -16.701235, lng: -49.281235 }, endereco: 'Praça de exemplo' });
  // Repetir o mesmo valor não cria outro registro.
  const de_novo = await request.post(ROTA, { headers: { 'content-type': 'application/json', origin }, data: PONTO });
  expect((await de_novo.json()).mudou).toBe(false);
  await page.goto(PAGINA);
  await expect(page.locator('[data-pj-local]')).toContainText('Cadastrada: ponto em latitude -16.701235, longitude -49.281235 (Praça de exemplo)');
  await expect(page.locator('[data-pj-historico] li').filter({ hasText: 'Localização cadastrada' })).toHaveCount(1);
  // A tela de localização mostra o que está no banco, sem aviso de simulação.
  await page.getByRole('link', { name: 'Alterar a localização no mapa' }).click();
  await expect(page).toHaveURL(new RegExp(`/plataforma/projetos-localizacao/\\?id=${PROJETO}`));
  await expect(page.locator('[data-lp-precisao]')).toHaveText('Localização atual: Cadastrada');
  await expect(page.getByText('Modo simulação')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Salvar localização', exact: true })).toBeVisible();
  await expect(page.locator('[data-lp-pagina]')).toHaveAttribute('href', PAGINA);
});

test('página do projeto: sem rolagem horizontal e sem falhas de acessibilidade, nos dois temas', async ({ page }) => {
  for (const largura of [1280, 390]) {
    await page.setViewportSize({ width: largura, height: 800 });
    await page.goto(PAGINA);
    expect(await semRolagem(page), `${largura}px`).toBe(true);
    await page.screenshot({ path: `test-results/projeto-${largura}.png`, fullPage: true });
  }
  for (const tema of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: tema });
    await page.goto(PAGINA);
    const a11y = await new AxeBuilder({ page }).include('main').analyze();
    expect(a11y.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')), tema).toEqual([]);
  }
});
