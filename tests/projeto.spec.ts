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
  expect([403, 415]).toContain(formulario.status()); // 403 = trava de origem do Astro para formulário; 415 = a nossa recusa
  const textoPuro = await request.post(ROTA, { headers: { 'content-type': 'text/plain', origin }, data: JSON.stringify(PONTO) });
  expect(textoPuro.status()).toBe(415);
  const quaseJson = await request.post(ROTA, { headers: { 'content-type': 'application/json-x', origin }, data: JSON.stringify(PONTO) });
  expect(quaseJson.status()).toBe(415);
  const grande = await request.post(ROTA, { headers: { ...json, origin }, data: { ...PONTO, endereco: 'x'.repeat(300_000) } });
  expect(grande.status()).toBe(413);
  const invalido = await request.post(ROTA, { headers: { ...json, origin }, data: { tipo: 'ponto', ponto: { lat: 0, lng: 0 } } });
  expect(invalido.status()).toBe(400);
  expect((await invalido.json()).erros).toEqual(['O ponto está fora de Goiânia e do entorno.']);
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

// Cadastro de projeto novo (entrega B2). Cria projetos novos no banco local; os nomes são exclusivos destes testes.
const CRIAR = '/plataforma/projeto/criar/';
const CADASTRO = { nome: 'Projeto B2 do teste de cadastro', orgao: 'SMS', compromisso: 'decidido', valor_obra: 1500000.5, sei: ['00.0.000000001-0'], datas: { pecas_tecnicas: '2026-03-01', planejamento: '2026-02-01', execucao_dias: 180 }, localizacao: { tipo: 'ponto', ponto: { lat: -16.7, lng: -49.3 }, endereco: 'Praça do teste' } };

test('cadastro: recusa origem de fora, formato errado, corpo grande, JSON quebrado e dado inválido', async ({ page, request }) => {
  await page.goto(PAGINA);
  const origin = new URL(page.url()).origin;
  const json = { 'content-type': 'application/json' };
  expect((await request.post(CRIAR, { headers: { ...json, origin: 'https://site-malicioso.example' }, data: CADASTRO })).status()).toBe(403);
  expect((await request.post(CRIAR, { headers: json, data: CADASTRO })).status()).toBe(403);
  expect((await request.post(CRIAR, { headers: { 'content-type': 'text/plain', origin }, data: JSON.stringify(CADASTRO) })).status()).toBe(415);
  expect((await request.post(CRIAR, { headers: { ...json, origin }, data: { ...CADASTRO, observacao: 'x'.repeat(400_000) } })).status()).toBe(413);
  expect((await request.post(CRIAR, { headers: { ...json, origin }, data: '{nao e json' })).status()).toBe(400);
  const invalido = await request.post(CRIAR, { headers: { ...json, origin }, data: { nome: '', orgao: '', valor_obra: -5, sei: ['1'] } });
  expect(invalido.status()).toBe(400);
  expect((await invalido.json()).erros).toEqual(expect.arrayContaining(['Informe o nome do projeto.', 'Escolha o órgão ou digite a sigla.']));
  const fora = await request.post(CRIAR, { headers: { ...json, origin }, data: { ...CADASTRO, localizacao: { tipo: 'ponto', ponto: { lat: 0, lng: 0 } } } });
  expect(fora.status()).toBe(400);
  expect((await fora.json()).erros).toEqual(['Localização: O ponto está fora de Goiânia e do entorno.']);
  expect((await request.get(CRIAR)).status()).not.toBe(200); // GET não grava nada
});

test('cadastro: o projeto criado abre na própria página, com histórico e localização', async ({ page, request }) => {
  await page.goto(PAGINA);
  const origin = new URL(page.url()).origin;
  const r = await request.post(CRIAR, { headers: { 'content-type': 'application/json', origin }, data: { ...CADASTRO, id: 'P-1', prefeitura_id: 1, macroetapa: '05' } });
  expect(r.status()).toBe(201);
  const corpo = await r.json();
  expect(corpo.ok).toBe(true);
  expect(corpo.projeto.macroetapa).toBe('00');
  expect(corpo.projeto.id).toMatch(/^P-\d+$/);
  expect(corpo.projeto.id).not.toBe('P-1');
  expect(corpo.avisos[0]).toContain('Datas fora de ordem');
  await page.goto(`/plataforma/projeto/${corpo.projeto.id}/`);
  await expect(page.locator('h1')).toContainText(CADASTRO.nome);
  await expect(page.locator('[data-pj-local]')).toContainText('Cadastrada: ponto em latitude -16.7, longitude -49.3 (Praça do teste)');
  await expect(page.locator('[data-pj-historico] li').filter({ hasText: 'Projeto incluído no cadastro' })).toHaveCount(1);
});

test('cadastro: o formulário grava de verdade e leva à página do projeto', async ({ page }) => {
  await page.goto('/plataforma/projetos-novo/');
  await expect(page.getByText('Modo simulação')).toHaveCount(0);
  await page.locator('#np-nome').fill('Projeto B2 pelo formulário');
  await page.locator('#np-orgao').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Cadastrar projeto' }).click();
  const ok = page.locator('[data-np-ok]');
  await expect(ok).toContainText('foi cadastrado em 00 – Em estruturação');
  const href = await page.locator('[data-np-ok-pagina]').getAttribute('href');
  expect(href).toMatch(/^\/plataforma\/projeto\/P-\d+\/$/);
  await page.locator('[data-np-ok-pagina]').click();
  await expect(page.locator('h1')).toContainText('Projeto B2 pelo formulário');
  await expect(page.locator('[data-pj-historico] li').filter({ hasText: 'Projeto incluído no cadastro' })).toHaveCount(1);
});
