import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Busca de endereço na aba Localização (E8). O servidor local (AMBIENTE=local, 127.0.0.1) usa as respostas FICTÍCIAS de
// src/lib/mapa/busca-endereco.ts: nenhum teste chama o Nominatim de verdade. Cada teste cria o próprio projeto (sem disputa de dados).
// Teto de buscas no arquivo: 12 por navegador (o limite local da ligação LIMITE_API é 30 por minuto por pessoa).
const CRIAR = '/plataforma/projeto/criar/';
const BUSCA = '/plataforma/localizacao/buscar/';
const NADA = 'Nada encontrado em Goiânia e no entorno. Tente o nome da rua com o bairro, ou marque o ponto no mapa.';
const semRolagem = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

async function novoProjeto(page: Page, nome: string): Promise<string> {
  await page.goto('/plataforma/projetos-novo/');
  const origin = new URL(page.url()).origin;
  const r = await page.request.post(CRIAR, { headers: { 'content-type': 'application/json', origin }, data: { nome, orgao: 'SMS' } });
  expect(r.status()).toBe(201);
  const { projeto: { id } } = await r.json();
  await page.goto(`/plataforma/projeto/${id}/?aba=localizacao`);
  await expect(page.locator('#fp-aba-localizacao')).toBeChecked();
  await expect(page.locator('[data-ed-busca]')).toBeVisible();
  return id;
}
const resultados = (page: Page) => page.locator('[data-ed-resultados] button');
async function procurar(page: Page, texto: string): Promise<void> {
  await page.locator('#lp-loc-busca').fill(texto);
  await page.locator('[data-ed-busca]').getByRole('button', { name: 'Procurar', exact: true }).click();
}

test('busca de endereço: procurar, ver no mapa e confirmar; salvar grava no banco e entra no Histórico', async ({ page }) => {
  const id = await novoProjeto(page, 'Projeto E8 busca e confirma');
  await procurar(page, 'Avenida Exemplo');
  await expect(resultados(page)).toHaveCount(3);
  await expect(resultados(page)).toHaveText(['Avenida Exemplo, Setor Central, Goiânia, Goiás (Rua)', 'Setor Oeste, Goiânia, Goiás (Bairro)', '100, Rua Exemplo, Jardim América, Goiânia, Goiás, 74000-000 (Endereço)']);
  await expect(page.locator('[data-ed-busca-msg]')).toHaveText('3 resultados. Escolha um para ver no mapa e confirmar.');
  await expect(page.locator('.mp-ed-mapa path.mp-previa')).toHaveCount(3);
  await expect(page.locator('[data-ed-confirmar]')).toBeHidden();
  // Ver no mapa não muda o ponto.
  await resultados(page).nth(2).click();
  await expect(resultados(page).nth(2)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.mp-ed-mapa path.mp-previa-escolhida')).toHaveCount(1);
  await expect(page.locator('[data-ed-confirmar-texto]')).toHaveText('Local escolhido: 100, Rua Exemplo, Jardim América, Goiânia, Goiás, 74000-000 (Endereço). Confira no mapa antes de usar.');
  await expect(page.locator('#lp-loc-lat')).toHaveValue('');
  await page.getByRole('button', { name: 'Usar este local', exact: true }).click();
  await expect(page.locator('#lp-loc-lat')).toHaveValue('-16.72000');
  await expect(page.locator('#lp-loc-lng')).toHaveValue('-49.30000');
  await expect(page.locator('#lp-loc-endereco')).toHaveValue('100, Rua Exemplo, Jardim América, Goiânia, Goiás, 74000-000');
  await expect(page.locator('.mp-ed-mapa path.mp-previa')).toHaveCount(0);
  await expect(page.locator('.mp-ed-mapa .mp-marcador')).toHaveCount(1);
  // Confirmar o local ainda não grava: só o botão Salvar grava (rota da B1).
  await expect(page.locator('[data-lp-precisao]')).toHaveText('Localização atual: Sem localização');
  await page.getByRole('button', { name: 'Salvar localização', exact: true }).click();
  await expect(page.locator('[data-lp-ok]')).toContainText('Salva e registrada no Histórico.');
  await page.goto(`/plataforma/projeto/${id}/`);
  await expect(page.locator('[data-pj-local]')).toContainText('Cadastrada: ponto em latitude -16.72, longitude -49.3 (100, Rua Exemplo, Jardim América, Goiânia, Goiás, 74000-000)');
  await expect(page.locator('[data-pj-historico] li').filter({ hasText: 'Localização cadastrada' })).toHaveCount(1);
});

test('busca de endereço: descartar, ou usar sem salvar, não grava nada', async ({ page }) => {
  const id = await novoProjeto(page, 'Projeto E8 descarta');
  const gravacoes: string[] = [];
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/plataforma/projeto/localizacao/')) gravacoes.push(r.url()); });
  // Enter no campo procura (sem enviar formulário nem recarregar).
  await page.locator('#lp-loc-busca').fill('Setor Oeste');
  await page.locator('#lp-loc-busca').press('Enter');
  await expect(resultados(page)).toHaveCount(3);
  await resultados(page).nth(1).click();
  await page.getByRole('button', { name: 'Descartar', exact: true }).click();
  await expect(page.locator('[data-ed-busca-msg]')).toHaveText('Resultado descartado. Nada foi alterado.');
  await expect(page.locator('[data-ed-resultados]')).toBeHidden();
  await expect(page.locator('[data-ed-confirmar]')).toBeHidden();
  await expect(page.locator('.mp-ed-mapa path.mp-previa')).toHaveCount(0);
  await expect(page.locator('#lp-loc-lat')).toHaveValue('');
  await procurar(page, 'Setor Oeste');
  await resultados(page).nth(1).click();
  await page.getByRole('button', { name: 'Usar este local', exact: true }).click();
  await expect(page.locator('#lp-loc-lat')).toHaveValue('-16.70500');
  await page.reload();
  await expect(page.locator('[data-lp-precisao]')).toHaveText('Localização atual: Sem localização');
  await expect(page.locator('#lp-loc-lat')).toHaveValue('');
  expect(gravacoes).toEqual([]);
  await page.goto(`/plataforma/projeto/${id}/`);
  await expect(page.locator('[data-pj-historico] li').filter({ hasText: 'Localização' })).toHaveCount(0);
});

test('busca de endereço: texto curto não pede ao servidor; nada encontrado, fora da área e serviço fora do ar avisam', async ({ page }) => {
  await novoProjeto(page, 'Projeto E8 casos de borda');
  const pedidos: string[] = [];
  page.on('request', (r) => { if (r.url().includes(BUSCA)) pedidos.push(r.method()); });
  const msg = page.locator('[data-ed-busca-msg]');
  await procurar(page, 'ab');
  await expect(msg).toHaveText('Digite ao menos 3 letras ou números.');
  await procurar(page, '!!! --- ...');
  await expect(msg).toHaveText('Digite ao menos 3 letras ou números.');
  expect(pedidos).toEqual([]);
  await procurar(page, 'Rua sem resultado');
  await expect(msg).toHaveText(NADA);
  await procurar(page, 'Rua de outra cidade');
  await expect.poll(() => pedidos.length).toBe(2);
  await expect(msg).toHaveText(NADA);
  await procurar(page, 'Serviço fora do ar');
  await expect.poll(() => pedidos.length).toBe(3);
  await expect(msg).toHaveText('A busca de endereços não respondeu agora. Tente de novo em instantes ou marque o ponto no mapa.');
  await expect(page.locator('[data-ed-resultados]')).toBeHidden();
  await expect(page.locator('#lp-loc-lat')).toHaveValue('');
  expect(pedidos.every((m) => m === 'POST')).toBe(true);
});

test('rota da busca: recusa origem de fora, formato errado, corpo grande, JSON quebrado e GET; a resposta só tem rótulo, ponto e tipo', async ({ page, request }) => {
  await page.goto('/plataforma/projetos-novo/');
  const origin = new URL(page.url()).origin;
  const json = { 'content-type': 'application/json' };
  expect((await request.post(BUSCA, { headers: { ...json, origin: 'https://site-malicioso.example' }, data: { q: 'Avenida Exemplo' } })).status()).toBe(403);
  expect((await request.post(BUSCA, { headers: json, data: { q: 'Avenida Exemplo' } })).status()).toBe(403);
  expect((await request.post(BUSCA, { headers: { 'content-type': 'text/plain', origin }, data: JSON.stringify({ q: 'Avenida Exemplo' }) })).status()).toBe(415);
  expect((await request.post(BUSCA, { headers: { ...json, origin }, data: { q: 'x'.repeat(2000) } })).status()).toBe(413);
  expect((await request.post(BUSCA, { headers: { ...json, origin }, data: '{nao e json' })).status()).toBe(400);
  expect((await request.get(BUSCA)).status()).not.toBe(200);
  const ok = await request.post(BUSCA, { headers: { ...json, origin }, data: { q: 'Avenida Exemplo', extra: '<b>x</b>' } });
  expect(ok.status()).toBe(200);
  expect(ok.headers()['cache-control']).toBe('private, no-store');
  const corpo = await ok.json();
  expect(Object.keys(corpo).sort()).toEqual(['ok', 'resultados']);
  expect(corpo.resultados.map((r: { tipo: string }) => r.tipo)).toEqual(['rua', 'bairro', 'endereco']);
  for (const r of corpo.resultados) expect(Object.keys(r).sort()).toEqual(['lat', 'lng', 'rotulo', 'tipo']);
});

test('busca de endereço: rótulo com HTML aparece como texto, sem executar nada', async ({ page }) => {
  await novoProjeto(page, 'Projeto E8 rótulo seguro');
  const dialogos: string[] = [];
  page.on('dialog', (d) => { dialogos.push(d.message()); void d.dismiss(); });
  const nome = '<img src=x onerror=alert(1)>';
  await procurar(page, nome);
  await expect(resultados(page).first()).toHaveText(`${nome}, Setor Central, Goiânia, Goiás (Rua)`);
  await resultados(page).first().click();
  await expect(page.locator('[data-ed-confirmar-texto]')).toContainText(nome);
  await page.getByRole('button', { name: 'Usar este local', exact: true }).click();
  await expect(page.locator('#lp-loc-endereco')).toHaveValue(`${nome}, Setor Central, Goiânia, Goiás`);
  await expect(page.locator('main img[src="x"]')).toHaveCount(0);
  expect(dialogos).toEqual([]);
});

test('busca de endereço no celular (390 px) sem rolagem e sem falhas graves de acessibilidade nos dois temas', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  for (const tema of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: tema });
    await novoProjeto(page, `Projeto E8 celular ${tema}`);
    await procurar(page, 'Avenida Exemplo com um nome bem comprido para quebrar a linha no celular');
    await expect(resultados(page)).toHaveCount(3);
    await resultados(page).first().click();
    await expect(page.locator('[data-ed-confirmar]')).toBeVisible();
    expect(await semRolagem(page), tema).toBe(true);
    for (const b of await resultados(page).all()) expect(await b.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/busca-endereco-390-${tema}.png`, fullPage: true });
    const a11y = await new AxeBuilder({ page }).include('main').exclude('.leaflet-tile-pane').analyze();
    expect(a11y.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')), tema).toEqual([]);
  }
});
