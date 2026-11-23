import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { GOIANIA } from '../src/lib/mapa/geo.ts';

// Navegação (E15): de toda tela, o link de conteúdo leva a origem em `volta` e o destino mostra "← Voltar para …".
const enc = encodeURIComponent;
const voltar = (page: Page, nome: string) => page.getByRole('link', { name: `Voltar para ${nome}`, exact: true });
const pdf = (texto: string) => Buffer.from(`%PDF-1.7 ${texto}`);
const semRolagem = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (r) => r.abort());
  await page.route('https://server.arcgisonline.com/**', (r) => r.abort());
});

test('navegação 1: ficha → cronograma → ficha → origem', async ({ page }) => {
  await page.goto(`/plataforma/projeto/P-900/?aba=cronograma&volta=${enc('/plataforma/projetos-gantt/')}`);
  await page.getByRole('link', { name: 'Abrir o cronograma detalhado' }).click();
  await page.waitForURL((u) => u.pathname === '/plataforma/cronograma/C-exemplo-001/');
  await expect(page.getByRole('link', { name: 'Todos os cronogramas' })).toHaveCount(0);
  const hrefVoltar = await voltar(page, 'a ficha do projeto P-900').getAttribute('href');
  await expect(page.locator('.cr-resumo a')).toHaveAttribute('href', hrefVoltar!);
  await voltar(page, 'a ficha do projeto P-900').click();
  await page.waitForURL((u) => u.pathname === '/plataforma/projeto/P-900/');
  expect(new URL(page.url()).searchParams.get('aba')).toBe('cronograma');
  await expect(page.locator('.pj-contexto a')).toHaveText('Fechar e voltar ao Gantt');
  await page.locator('.pj-contexto a').click();
  await page.waitForURL((u) => u.pathname === '/plataforma/projetos-gantt/');
});

test('navegação 2: diálogo de detalhes → cronograma → origem', async ({ page }) => {
  await page.goto('/plataforma/projetos-cronogramas/');
  await page.locator('tbody [data-row]').first().getByRole('button', { name: 'Ver detalhes' }).click();
  const links = page.locator('#record-dialog [data-record-actions] a[href^="/plataforma/"]');
  expect(await links.count()).toBeGreaterThan(0);
  for (const href of await links.evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''))) expect(href).toContain('volta=%2Fplataforma%2Fprojetos-cronogramas%2F');
  await page.locator('#record-dialog [data-record-actions]').getByRole('link', { name: /Cronograma/ }).first().click();
  await page.waitForURL((u) => u.pathname.startsWith('/plataforma/cronograma/'));
  await voltar(page, 'Cronogramas').click();
  await page.waitForURL((u) => u.pathname === '/plataforma/projetos-cronogramas/');
});

test('navegação 3: sala de guerra → cronograma → sala; projeto → ficha', async ({ page }) => {
  await page.goto('/plataforma/sala-de-guerra/S-1/');
  await expect(page.getByRole('link', { name: 'Todas as salas de guerra' })).toBeVisible();
  await page.getByRole('link', { name: 'Cronograma', exact: true }).first().click();
  await page.waitForURL((u) => u.pathname.startsWith('/plataforma/cronograma/'));
  await voltar(page, 'a sala de guerra').click();
  await page.waitForURL((u) => u.pathname === '/plataforma/sala-de-guerra/S-1/');
  await page.getByRole('link', { name: /^P-903 · / }).first().click();
  await page.waitForURL((u) => u.pathname === '/plataforma/projeto/P-903/');
  await expect(page.locator('.pj-contexto a')).toHaveText('Fechar e voltar para a sala de guerra');
});

test('navegação 4: ficha → documentos → envio → ficha → origem', async ({ page }) => {
  await page.goto(`/plataforma/projeto/P-900/?aba=documentos&volta=${enc('/plataforma/projetos-carteira/?orgao=SMS')}`);
  await page.getByRole('link', { name: 'Abrir os documentos do projeto' }).click();
  await page.waitForURL((u) => u.pathname === '/plataforma/documentos-projeto/projeto/P-900/');
  const nome = `nav-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`;
  await page.setInputFiles('#doc-arquivo', { name: nome, mimeType: 'application/pdf', buffer: pdf(nome) });
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Documento enviado' })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('volta')).toContain('/plataforma/projeto/P-900/');
  await voltar(page, 'a ficha do projeto P-900').click();
  await page.waitForURL((u) => u.pathname === '/plataforma/projeto/P-900/');
  expect(new URL(page.url()).searchParams.get('aba')).toBe('documentos');
  await expect(page.locator('.pj-contexto a')).toHaveText('Fechar e voltar à Carteira');
  await page.locator('.pj-contexto a').click();
  await page.waitForURL((u) => u.pathname === '/plataforma/projetos-carteira/');
  expect(new URL(page.url()).search).toBe('?orgao=SMS');
});

test('navegação 5: ficha → SEI com o projeto filtrado → ficha', async ({ page }) => {
  await page.goto(`/plataforma/projeto/P-901/?aba=sei&volta=${enc('/plataforma/gestao/')}`);
  await page.getByRole('link', { name: 'Abrir a tela Processos no SEI' }).click();
  await page.waitForURL((u) => u.pathname === '/plataforma/projetos-sei/');
  expect(new URL(page.url()).searchParams.get('projeto')).toBe('P-901');
  await expect(page.locator('[data-sei-filtro]')).toHaveValue('P-901');
  await voltar(page, 'a ficha do projeto P-901').click();
  await page.waitForURL((u) => u.pathname === '/plataforma/projeto/P-901/');
  expect(new URL(page.url()).searchParams.get('aba')).toBe('sei');
});

test('navegação 6: ficha → histórico completo → ficha', async ({ page }) => {
  await page.goto(`/plataforma/projeto/P-900/?aba=historico&volta=${enc('/plataforma/projetos-kanban/')}`);
  await page.getByRole('link', { name: 'Ver o histórico completo' }).click();
  await page.waitForURL((u) => u.pathname === '/plataforma/projetos-log/');
  const hrefVoltar = await voltar(page, 'a ficha do projeto P-900').getAttribute('href');
  await expect(page.locator('[data-lg-corpo] a').first()).toBeVisible();
  const hrefs = await page.locator('[data-lg-corpo] a').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  expect(hrefs).toContain(hrefVoltar);
  await voltar(page, 'a ficha do projeto P-900').click();
  await page.waitForURL((u) => u.pathname === '/plataforma/projeto/P-900/');
  await expect(page.locator('.pj-contexto a')).toHaveText('Fechar e voltar ao Kanban');
});

test('navegação 7: prioritários → ficha → origem', async ({ page }) => {
  await page.goto('/plataforma/');
  await page.locator('[data-pp-principais] a').first().click();
  await page.waitForURL((u) => u.pathname.startsWith('/plataforma/projeto/'));
  await expect(page.locator('.pj-contexto a')).toHaveText('Fechar e voltar para Projetos prioritários');
  await page.locator('.pj-contexto a').click();
  await page.waitForURL((u) => u.pathname === '/plataforma/');
});

test('navegação 8: alertas e reunião → ficha → origem', async ({ page }) => {
  await page.goto('/plataforma/gestao-alertas/');
  await page.getByRole('link', { name: /Abrir a ficha do projeto/ }).first().click();
  await page.waitForURL((u) => u.pathname.startsWith('/plataforma/projeto/'));
  await expect(page.locator('.pj-contexto a')).toHaveText('Fechar e voltar para Alertas');
  await page.goto('/plataforma/projetos-reuniao/');
  await page.locator('.ru-item h3 a').first().click();
  await page.waitForURL((u) => u.pathname.startsWith('/plataforma/projeto/'));
  await expect(page.locator('.pj-contexto a')).toHaveText('Fechar e voltar para Reunião semanal');
});

test('navegação 9: obras sem localização → ficha na aba Localização', async ({ page }) => {
  await page.goto('/plataforma/projetos-localizacao/');
  const itens = page.getByRole('link', { name: /Cadastrar localização de/ });
  await page.locator('[data-lp-pendentes] summary').click();
  test.skip((await itens.count()) === 0, 'sem obras pendentes nos dados de exemplo');
  await itens.first().click();
  await page.waitForURL((u) => u.pathname.startsWith('/plataforma/projeto/'));
  expect(new URL(page.url()).searchParams.get('aba')).toBe('localizacao');
  await expect(page.locator('.pj-contexto a')).toHaveText('Fechar e voltar para Obras sem localização');
  await page.goto(`/plataforma/projetos-localizacao/?id=P-905&volta=${enc('/plataforma/gestao/')}`);
  await page.waitForURL((u) => u.pathname === '/plataforma/projeto/P-905/');
  await expect(page.locator('.pj-contexto a')).toHaveText('Fechar e voltar ao mapa');
});

test('navegação 10: mapa → painel da obra leva a volta no link Localização', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/plataforma/gestao/');
  await page.evaluate((centro) => sessionStorage.setItem('govnexa-localizacao-simulacao', JSON.stringify({
    'P-905': { tipo: 'ponto', ponto: centro, endereco: null },
  })), GOIANIA.centro);
  await page.reload();
  const mapa = page.locator('[data-mapa-obras]');
  await mapa.locator('.mp-bolha').first().click();
  await mapa.locator('.mp-painel-lista .mp-item').filter({ hasText: 'Aquisição de Equipamentos Exemplo F' }).click();
  await mapa.getByRole('link', { name: 'Abrir ficha completa' }).click();
  await expect(mapa.getByRole('link', { name: 'Localização', exact: true })).toHaveAttribute('href', /volta=%2Fplataforma%2Fgestao%2F/);
});

test('navegação 11: Novo projeto → ficha → Novo projeto → Carteira com o filtro', async ({ page }) => {
  await page.goto('/plataforma/projetos-carteira/?orgao=SMS');
  await page.getByRole('link', { name: 'Novo projeto' }).click();
  await page.waitForURL((u) => u.pathname === '/plataforma/projetos-novo/');
  await expect(voltar(page, 'Carteira de projetos')).toBeVisible();
  await page.locator('#np-nome').fill(`Projeto navegação ${Date.now()}`);
  await page.locator('#np-orgao').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Cadastrar projeto' }).click();
  await expect(page.locator('[data-np-ok]')).toContainText('foi cadastrado');
  await page.getByRole('link', { name: 'Abrir a página do projeto' }).click();
  await expect(page.locator('.pj-contexto a')).toHaveText('Fechar e voltar para Novo projeto');
  await page.locator('.pj-contexto a').click();
  await page.waitForURL((u) => u.pathname === '/plataforma/projetos-novo/');
  await voltar(page, 'Carteira de projetos').click();
  await page.waitForURL((u) => u.pathname === '/plataforma/projetos-carteira/');
  expect(new URL(page.url()).search).toBe('?orgao=SMS');
});

test('navegação 12: Gantt → ficha → Gantt', async ({ page }) => {
  await page.goto('/plataforma/projetos-gantt/');
  await page.locator('.gt-nome').first().click();
  await page.waitForURL((u) => u.pathname.startsWith('/plataforma/projeto/'));
  await expect(page.locator('.pj-contexto a')).toHaveText('Fechar e voltar ao Gantt');
  await page.locator('.pj-contexto a').click();
  await page.waitForURL((u) => u.pathname === '/plataforma/projetos-gantt/');
});

test('navegação 13: abuso, volta externa ou de gravação é ignorada e a edição mantém a aba', async ({ page, request }) => {
  await page.goto(`/plataforma/cronograma/C-exemplo-001/?volta=${enc('https://externo.example/')}`);
  await expect(page.locator('[data-voltar-link]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Todos os cronogramas' })).toBeVisible();
  await page.goto(`/plataforma/projetos-log/?volta=${enc('/plataforma/projeto/editar/P-900/')}`);
  await expect(page.locator('[data-voltar]')).toHaveCount(0);
  await page.goto(`/plataforma/projetos-parado/?volta=${enc('//externo.example/')}`);
  await expect(page.locator('[data-voltar]')).toHaveCount(0);

  const origin = new URL(page.url()).origin;
  const nome = `abuso-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`;
  const r = await request.post('/plataforma/documentos-projeto/enviar/?volta=' + enc('https://externo.example/'), {
    headers: { origin },
    multipart: { projeto: 'P-900', arquivo: { name: nome, mimeType: 'application/pdf', buffer: pdf(nome) } },
    maxRedirects: 0,
  });
  expect(r.status()).toBe(303);
  const local = r.headers().location;
  expect(local).not.toContain('externo');
  expect(new URL(local, origin).pathname).toBe('/plataforma/documentos-projeto/projeto/P-900/');
  expect(new URL(local, origin).origin).toBe(origin);
  const mal = await request.post('/plataforma/documentos-projeto/enviar/', {
    headers: { origin: 'https://site-malicioso.example' },
    multipart: { projeto: 'P-900', arquivo: { name: 'x.pdf', mimeType: 'application/pdf', buffer: pdf('x') } },
    maxRedirects: 0,
  });
  expect([303, 403]).toContain(mal.status());
  if (mal.status() === 303) expect(mal.headers().location).toContain('r=origem');

  const criado = await request.post('/plataforma/projeto/criar/', { headers: { 'content-type': 'application/json', origin }, data: { nome: 'Projeto navegação edição', orgao: 'SMS' } });
  expect(criado.status()).toBe(201);
  const { projeto: { id } } = await criado.json();
  const volta = '/plataforma/projetos-carteira/?orgao=SMS';
  await page.goto(`/plataforma/projeto/${id}/?aba=cadastro&volta=${enc(volta)}`);
  await page.locator('#fp-painel-cadastro [data-editar-projeto] summary').click();
  await page.locator('#ep-observacao').fill('observação de navegação');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.locator('[data-pj-salvo]')).toBeVisible();
  const u = new URL(page.url());
  expect(u.searchParams.get('salvo')).toBe('1');
  expect(u.searchParams.get('aba')).toBe('cadastro');
  expect(u.searchParams.get('volta')).toBe(volta);
});

test('navegação 14: telas com Voltar sem rolagem horizontal e sem falha grave de acessibilidade', async ({ page }) => {
  const telas = [
    `/plataforma/cronograma/C-exemplo-001/?volta=${enc('/plataforma/projetos-cronogramas/')}`,
    `/plataforma/documentos-projeto/projeto/P-900/?volta=${enc('/plataforma/projeto/P-900/?aba=documentos')}`,
  ];
  for (const tamanho of [{ width: 1280, height: 800 }, { width: 390, height: 800 }]) {
    await page.setViewportSize(tamanho);
    for (const tela of telas) {
      await page.goto(tela);
      await expect(page.locator('[data-voltar-link]').first()).toBeVisible();
      expect(await semRolagem(page), `${tamanho.width} ${tela}`).toBe(true);
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const tema of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: tema });
    for (const tela of telas) {
      await page.goto(tela);
      const a11y = await new AxeBuilder({ page }).include('[data-voltar]').analyze();
      expect(a11y.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')), `${tema} ${tela}`).toEqual([]);
    }
  }
});
