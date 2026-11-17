import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PROJETO = 'P-900';
const semRolagem = (page: import('@playwright/test').Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const pdf = (texto: string) => Buffer.from(`%PDF-1.7 ${texto}`);

test('documentos: enviar, baixar como anexo, recusar tipo falso e remover', async ({ page }) => {
  await page.goto(`/plataforma/documentos-projeto/projeto/${PROJETO}/`);
  await expect(page.getByRole('heading', { name: 'Documentos do projeto' })).toBeVisible();
  // O topo mantém o padrão (nome da tela); o projeto aparece numa linha antes do aviso de dados.
  await expect(page.locator('[data-module-title]')).toHaveText('Documentos do projeto');
  const ordem = await page.evaluate(() => {
    const contexto = document.querySelector('.workspace .doc-contexto'); const aviso = document.querySelector('.workspace > .notice');
    return !!contexto && !!aviso && !!(contexto.compareDocumentPosition(aviso) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(ordem).toBe(true);
  await expect(page.locator('.doc-contexto')).toContainText(PROJETO);
  // Rodapé e aviso de dados dizem a mesma origem.
  const aviso = (await page.locator('.workspace > .notice').textContent()) ?? '';
  const origem = aviso.includes('dados de exemplo') ? 'Dados de exemplo' : 'Dados do banco da prefeitura';
  expect(aviso.includes('dados de exemplo') || aviso.includes('Dados do banco da prefeitura')).toBe(true);
  await expect(page.locator('.app-footer [data-origem-dados]')).toHaveText(origem);
  const nome = `termo-${Date.now()}.pdf`;
  await page.setInputFiles('#doc-arquivo', { name: nome, mimeType: 'application/pdf', buffer: pdf(nome) });
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Documento enviado');
  const link = page.getByRole('link', { name: nome });
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href') as string;
  const resposta = await page.request.get(href);
  expect(resposta.status()).toBe(200);
  expect(resposta.headers()['content-disposition']).toMatch(/^attachment;/);
  expect(resposta.headers()['x-content-type-options']).toBe('nosniff');
  expect((await resposta.body()).toString().startsWith('%PDF')).toBe(true);

  // arquivo repetido
  await page.setInputFiles('#doc-arquivo', { name: 'outro.pdf', mimeType: 'application/pdf', buffer: pdf(nome) });
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('já foi enviado');

  // extensão de PDF com conteúdo de outro tipo
  await page.setInputFiles('#doc-arquivo', { name: 'falso.pdf', mimeType: 'application/pdf', buffer: Buffer.from('<script>alert(1)</script>') });
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('não corresponde');

  // remoção lógica
  page.once('dialog', (d) => d.accept());
  await page.locator('li', { hasText: nome }).getByRole('button', { name: 'Remover' }).click();
  await expect(page.getByRole('status')).toContainText('removido');
  await expect(page.getByRole('link', { name: nome })).toHaveCount(0);
  expect((await page.request.get(href)).status()).toBe(404);
});

test('documentos: pedido de outra origem é recusado e projeto inexistente dá 404', async ({ page, request }) => {
  const r = await request.post('/plataforma/documentos-projeto/enviar/', {
    headers: { origin: 'https://site-malicioso.example' },
    multipart: { projeto: PROJETO, arquivo: { name: 'a.pdf', mimeType: 'application/pdf', buffer: pdf('x') } },
    maxRedirects: 0,
  });
  // 403 = trava de origem do Astro; 303 só vale se for a nossa recusa (r=origem), nunca um envio aceito
  expect([303, 403]).toContain(r.status());
  if (r.status() === 303) expect(r.headers().location).toContain('r=origem');
  const lista = await request.get('/plataforma/documentos-projeto/projeto/P-900/');
  expect(await lista.text()).not.toContain('a.pdf');
  const rem = await request.post('/plataforma/documentos-projeto/remover/00000000-0000-4000-8000-000000000001/', { headers: { origin: 'https://site-malicioso.example' }, form: { projeto: PROJETO }, maxRedirects: 0 });
  expect([303, 403]).toContain(rem.status());
  if (rem.status() === 303) expect(rem.headers().location).toContain('r=origem');
  const inexistente = await page.goto('/plataforma/documentos-projeto/projeto/P-NAO-EXISTE/');
  expect(inexistente?.status()).toBe(404);
  const semUuid = await request.get('/plataforma/documentos-projeto/arquivo/qualquer-coisa/');
  expect(semUuid.status()).toBe(404);
});

test('documentos: páginas sem rolagem horizontal e sem falhas de acessibilidade', async ({ page }) => {
  for (const largura of [1280, 390]) {
    await page.setViewportSize({ width: largura, height: 800 });
    for (const url of ['/plataforma/documentos-projeto/', `/plataforma/documentos-projeto/projeto/${PROJETO}/`]) {
      await page.goto(url);
      expect(await semRolagem(page), `${url} em ${largura}px`).toBe(true);
    }
  }
  const a11y = await new AxeBuilder({ page }).include('main').analyze();
  expect(a11y.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);
});
