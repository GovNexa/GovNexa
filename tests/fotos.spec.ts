import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// E9: fotos da obra na aba Fotos da ficha. Os testes rodam em série num projeto criado só para eles: o banco local é compartilhado
// pelos testes paralelos e o limite local de 30 gravações por minuto por pessoa vale para a suíte inteira (menos gravações, menos 429).
// O servidor local só tem o usuário administrador e uma prefeitura: perfil leitura e foto de outra prefeitura estão nos testes de
// unidade (tests/fotos/fotos.test.ts: "envio: perfil leitura...", "remover: ... leitura não remove", "ver: foto de outra prefeitura...").
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
/** PNG de 1 x 1 válido; o texto depois do fim da imagem muda o conteúdo (e o hash) sem atrapalhar a exibição. */
const png = (marca: string) => Buffer.concat([PNG_1X1, Buffer.from(`${marca}-${Date.now()}-${Math.random()}`)]);
const MALICIOSA = 'https://site-malicioso.example';
const semRolagem = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

let projetoDosTestes = '';
async function novoProjeto(request: APIRequestContext): Promise<string> {
  if (projetoDosTestes) return projetoDosTestes;
  const origin = new URL(test.info().project.use.baseURL as string).origin;
  const criado = await request.post('/plataforma/projeto/criar/', { headers: { 'content-type': 'application/json', origin }, data: { nome: 'Obra E9 fotos', orgao: 'SEINFRA' } });
  expect(criado.status()).toBe(201);
  projetoDosTestes = (await criado.json()).projeto.id as string;
  return projetoDosTestes;
}
async function enviar(page: Page, arquivo: { name: string; mimeType: string; buffer: Buffer }, legenda = '', data?: string): Promise<void> {
  await page.setInputFiles('#ft-arquivo', arquivo);
  await page.locator('#ft-legenda').fill(legenda);
  if (data) await page.locator('#ft-data').fill(data);
  // Tira a mensagem anterior: a conferência seguinte só passa com a mensagem da página nova.
  await page.evaluate(() => document.querySelector('[data-ft-mensagem]')?.remove());
  await page.getByRole('button', { name: 'Enviar foto', exact: true }).click();
  await expect(page.locator('[data-ft-mensagem]')).toHaveCount(1);
}

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (r) => r.abort());
  await page.route('https://server.arcgisonline.com/**', (r) => r.abort());
});

test('fotos: enviar com legenda e data, ver na grade, ampliar, remover e tudo no Histórico', async ({ page, request }) => {
  const id = await novoProjeto(request);
  await page.goto(`/plataforma/projeto/${id}/?aba=fotos`);
  await expect(page.locator('#fp-aba-fotos')).toBeChecked();
  await expect(page.locator('[data-fp-fotos]')).toHaveText('Nenhuma foto enviada.');
  expect(await page.locator('#ft-data').inputValue()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const legenda = 'Fundação <b>concluída</b>';
  await enviar(page, { name: 'obra.png', mimeType: 'image/png', buffer: png('f1') }, legenda, '2025-01-15');
  await expect(page.locator('[data-ft-mensagem]')).toHaveText('Foto enviada e registrada no Histórico.');
  await expect(page.locator('#fp-aba-fotos')).toBeChecked();
  const item = page.locator('[data-ft-item]');
  await expect(item).toHaveCount(1);
  await expect(page.locator('[data-fp-fotos]')).toHaveText('1 foto');
  await expect(item.locator('[data-ft-legenda]')).toHaveText(legenda);
  await expect(item.locator('b')).toHaveCount(0);
  await expect(item.locator('[data-ft-data]')).toContainText('Foto de 15/01/2025');
  const img = item.locator('img');
  await expect(img).toHaveAttribute('loading', 'lazy');
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => (i.complete ? i.naturalWidth : 0))).toBe(1);
  const src = (await img.getAttribute('src')) as string;
  expect(src).toMatch(/^\/plataforma\/fotos-projeto\/foto\/[0-9a-f-]{36}\/$/);
  const resposta = await request.get(src);
  expect(resposta.status()).toBe(200);
  expect(resposta.headers()['content-type']).toBe('image/png');
  expect(resposta.headers()['x-content-type-options']).toBe('nosniff');
  expect(resposta.headers()['content-disposition']).toMatch(/^inline; filename="foto-[0-9a-f-]{36}\.png"$/);
  expect(resposta.headers()['cache-control']).toContain('private');
  // Ampliação: diálogo com a foto inteira e a legenda como texto.
  await item.locator('a[data-ft-ampliar]').click();
  const dialogo = page.locator('[data-ft-dialogo]');
  await expect(dialogo).toBeVisible();
  await expect(dialogo.locator('[data-ft-dialogo-legenda]')).toHaveText(legenda);
  await expect(dialogo.locator('[data-ft-dialogo-data]')).toHaveText('· Foto de 15/01/2025');
  await expect(dialogo.locator('img')).toHaveAttribute('src', src);
  await dialogo.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(dialogo).toBeHidden();
  // Histórico do projeto.
  await page.locator('label[for="fp-aba-historico"]').click();
  await expect(page.locator('[data-pj-historico]')).toContainText(`Foto enviada: ${legenda} (foto de 15/01/2025)`);
  // Remoção lógica: some da ficha, a foto deixa de ser servida e a remoção entra no Histórico.
  await page.locator('label[for="fp-aba-fotos"]').click();
  page.once('dialog', (d) => d.accept());
  await item.getByRole('button', { name: `Remover a foto: ${legenda}`, exact: true }).click();
  await expect(page.locator('[data-ft-mensagem]')).toHaveText('Foto removida da ficha e registrada no Histórico. O arquivo fica guardado para auditoria.');
  await expect(page.locator('[data-ft-item]')).toHaveCount(0);
  await expect(page.locator('[data-fp-fotos]')).toHaveText('Nenhuma foto enviada.');
  expect((await request.get(src)).status()).toBe(404);
  await page.locator('label[for="fp-aba-historico"]').click();
  await expect(page.locator('[data-pj-historico]')).toContainText(`Foto removida: ${legenda} (foto de 15/01/2025)`);
});

test('fotos: pedido de outra origem é recusado; foto inexistente ou com id inválido dá 404', async ({ page, request }) => {
  const id = await novoProjeto(request);
  const r = await request.post(`/plataforma/fotos-projeto/enviar/?projeto=${id}`, {
    headers: { origin: MALICIOSA },
    multipart: { foto: { name: 'a.png', mimeType: 'image/png', buffer: png('f3') }, legenda: 'De fora', data: '2025-01-01' },
    maxRedirects: 0,
  });
  // 403 = trava de origem do Astro; 303 só vale se for a nossa recusa (rf=origem), nunca um envio aceito.
  expect([303, 403]).toContain(r.status());
  if (r.status() === 303) expect(r.headers().location).toContain('rf=origem');
  await page.goto(`/plataforma/projeto/${id}/?aba=fotos`);
  await expect(page.locator('[data-fp-fotos]')).toHaveText('Nenhuma foto enviada.');
  const inexistente = '00000000-0000-4000-8000-000000000001';
  const rem = await request.post(`/plataforma/fotos-projeto/remover/${inexistente}/?projeto=${id}`, { headers: { origin: MALICIOSA }, form: {}, maxRedirects: 0 });
  expect([303, 403]).toContain(rem.status());
  if (rem.status() === 303) expect(rem.headers().location).toContain('rf=origem');
  const origin = new URL(page.url()).origin;
  const remNada = await request.post(`/plataforma/fotos-projeto/remover/${inexistente}/?projeto=${id}`, { headers: { origin }, form: {}, maxRedirects: 0 });
  expect(remNada.status()).toBe(303);
  expect(remNada.headers().location).toBe(`/plataforma/projeto/${id}/?aba=fotos&rf=naoencontrada`);
  expect((await request.get(`/plataforma/fotos-projeto/foto/${inexistente}/`)).status()).toBe(404);
  expect((await request.get('/plataforma/fotos-projeto/foto/qualquer-coisa/')).status()).toBe(404);
});

test('fotos: arquivo falso e foto repetida são recusados e nada entra na grade', async ({ page, request }) => {
  const id = await novoProjeto(request);
  await page.goto(`/plataforma/projeto/${id}/?aba=fotos`);
  // SVG e os outros tipos recusados estão nos testes de unidade (U-1, U-2, U-11): aqui só o que passa pelo navegador.
  await enviar(page, { name: 'falsa.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('<html><script>alert(1)</script></html>') });
  await expect(page.locator('[data-ft-mensagem]')).toHaveText('O conteúdo do arquivo não corresponde a uma foto JPG, PNG ou WEBP.');
  await expect(page.locator('[data-ft-item]')).toHaveCount(0);
  const foto = { name: 'a.png', mimeType: 'image/png', buffer: png('f2') };
  await enviar(page, foto, 'Primeira');
  await expect(page.locator('[data-ft-mensagem]')).toHaveText('Foto enviada e registrada no Histórico.');
  await enviar(page, { ...foto, name: 'b.png' }, 'Repetida');
  await expect(page.locator('[data-ft-mensagem]')).toHaveText('Esta foto já foi enviada neste projeto.');
  await expect(page.locator('[data-ft-item]')).toHaveCount(1);
  await expect(page.locator('[data-ft-legenda]')).toHaveText('Primeira');
});

const LONGA = 'Legenda' + 'comprida'.repeat(24);
for (const tema of ['light', 'dark'] as const) {
  test(`fotos: aba com foto sem rolagem horizontal em 1280 e 390 px e sem violação grave de acessibilidade (tema ${tema})`, async ({ page, request }) => {
    const id = await novoProjeto(request);
    await page.addInitScript((t) => localStorage.setItem('govnexa-theme', t), tema);
    await page.goto(`/plataforma/projeto/${id}/?aba=fotos`);
    const item = page.locator('[data-ft-item]', { hasText: LONGA });
    // Uma só foto de legenda longa para os dois temas (menos gravações); o segundo tema só envia se rodar sozinho.
    if ((await item.count()) === 0) {
      await enviar(page, { name: 'longa.png', mimeType: 'image/png', buffer: png('f4') }, LONGA);
      await expect(page.locator('[data-ft-mensagem]')).toHaveText('Foto enviada e registrada no Histórico.');
    }
    await expect(item).toHaveCount(1);
    for (const largura of [1280, 390]) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(`/plataforma/projeto/${id}/?aba=fotos`);
      expect(await semRolagem(page), `${largura}px`).toBe(true);
      const estouros = await page.locator('.ft-item, .ft-envio, [data-fp-fotos]').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length);
      expect(estouros, `${largura}px`).toBe(0);
      const r = await new AxeBuilder({ page }).include('#fp-painel-fotos').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(r.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')), `${largura}px ${JSON.stringify(r.violations)}`).toEqual([]);
    }
    // Ampliação no celular cabe na tela e passa no axe aberta.
    await item.locator('a[data-ft-ampliar]').click();
    const dialogo = page.locator('[data-ft-dialogo]');
    await expect(dialogo).toBeVisible();
    const caixa = await dialogo.boundingBox();
    expect((caixa?.x ?? -1) >= 0 && (caixa?.x ?? 0) + (caixa?.width ?? 999) <= 390).toBe(true);
    const r = await new AxeBuilder({ page }).include('[data-ft-dialogo]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(r.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')), JSON.stringify(r.violations)).toEqual([]);
  });
}
