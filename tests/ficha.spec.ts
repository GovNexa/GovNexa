import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Ficha única do projeto (E6). Usa P-900, P-901 e P-905 (dados de exemplo) e cria projetos novos só para si.
const FICHA = '/plataforma/projeto/P-900/';
const CARTEIRA = '/plataforma/projetos-carteira/';
const ROTULOS = ['Cadastro', 'Recurso', 'Entrega', 'Localização', 'Fotos', 'Documentos', 'Processos SEI', 'Cronograma', 'Histórico', 'Governança'];
const IDS = ['cadastro', 'recurso', 'entrega', 'localizacao', 'fotos', 'documentos', 'sei', 'cronograma', 'historico', 'governanca'];
const semRolagem = (page: import('@playwright/test').Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const PROIBIDOS = /Valores por ano|Tipo de contratação|Órgão da contratação|Situação do recurso|Tipo do recurso|Vermelho|Amarelo|\bVerde\b|[Ff]arol/;

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (r) => r.abort());
  await page.route('https://server.arcgisonline.com/**', (r) => r.abort());
});

test('ficha: Ver detalhes da Carteira abre a ficha em tela grande e o X volta à lista com o filtro', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(CARTEIRA + '?orgao=SEINFRA');
  await page.locator('tbody [data-row][data-id="P-900"]').getByRole('button', { name: 'Ver detalhes' }).click();
  await page.waitForURL((u) => u.pathname === FICHA);
  expect(new URL(page.url()).searchParams.get('volta')).toBe('/plataforma/projetos-carteira/?orgao=SEINFRA');
  await expect(page.locator('#record-dialog')).toBeHidden();
  const caixa = await page.locator('[data-ficha-projeto]').boundingBox();
  expect(caixa?.width ?? 0).toBeGreaterThanOrEqual(800);
  await page.getByRole('link', { name: 'Fechar e voltar à Carteira' }).click();
  await page.waitForURL((u) => u.pathname === CARTEIRA);
  expect(new URL(page.url()).search).toBe('?orgao=SEINFRA');
});

test('ficha: aberta pelo endereço, X leva à Carteira e volta de fora é ignorada', async ({ page }) => {
  await page.goto(FICHA + '?volta=' + encodeURIComponent('https://externo.example/'));
  await expect(page.locator('.pj-contexto a')).toHaveText('Fechar e voltar à Carteira');
  await expect(page.locator('.pj-contexto a')).toHaveAttribute('href', CARTEIRA);
  await page.goto(FICHA + '?volta=' + encodeURIComponent('/plataforma/gestao/?sel=obra%3AP-900'));
  await expect(page.locator('.pj-contexto a')).toHaveText('Fechar e voltar ao mapa');
  await page.goto(FICHA);
  await page.locator('.pj-contexto a').click();
  await expect(page).toHaveURL(/\/plataforma\/projetos-carteira\/$/);
  expect((await page.goto('/plataforma/projeto/P-NAO-EXISTE/'))?.status()).toBe(404);
  await page.goto(FICHA + '?aba=' + encodeURIComponent('<script>'));
  await expect(page.locator('#fp-aba-cadastro')).toBeChecked();
});

test('ficha: topo com órgão, área, valor total, macroetapa, entrega prevista, localização e observação', async ({ page }) => {
  await page.goto(FICHA);
  await expect(page.locator('[data-fp-topo] dt')).toHaveText(['Órgão', 'Área', 'Valor total', 'Macroetapa', 'Entrega prevista', 'Localização']);
  await expect(page.locator('[data-fp-topo-item="orgao"] dd')).toHaveText('SEINFRA');
  await expect(page.locator('[data-fp-topo-item="valor"] dd')).toHaveText(/R\$\s*1\.200\.000/);
  await expect(page.locator('[data-fp-topo-item="macroetapa"] dd')).toHaveText('Em estruturação');
  await expect(page.locator('[data-fp-topo-item="entrega"] dd')).toHaveText('28/03/2027');
  await expect(page.locator('[data-fp-observacao]')).toBeVisible();
  await expect(page.locator('[data-fp-observacao]')).toHaveText('Registro fictício para demonstração.');
});

test('ficha: abas na ordem, Governança por último, aba no endereço e sem rolagem horizontal em 1280 e 390', async ({ page }) => {
  for (const largura of [1280, 390]) {
    await page.setViewportSize({ width: largura, height: 800 });
    await page.goto(FICHA);
    await expect(page.locator('.fp-aba label')).toHaveText(ROTULOS);
    for (const id of IDS) {
      await page.locator('label[for="fp-aba-' + id + '"]').click();
      await expect(page.locator('#fp-painel-' + id)).toBeVisible();
      await expect(page.locator('.fp-painel:visible')).toHaveCount(1);
      expect(await semRolagem(page), `${id} ${largura}px`).toBe(true);
    }
    await expect(page).toHaveURL(/[?&]aba=governanca(&|$)/);
  }
  const ids = await page.locator('.fp-painel').evaluateAll((els) => els.map((e) => e.id));
  expect(ids[ids.length - 1]).toBe('fp-painel-governanca');
  await page.goto(FICHA + '?aba=governanca');
  for (const name of ['Origem do dado', 'Responsável pelo dado', 'Pontos de atenção', 'Processos SEI', 'Dependências']) {
    await expect(page.locator('#fp-painel-governanca').getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
  }
});

test('ficha: sem farol, valor por ano, tipo ou órgão de contratação, situação ou tipo do recurso', async ({ page }) => {
  for (const id of ['P-900', 'P-901']) {
    await page.goto('/plataforma/projeto/' + id + '/');
    const texto = await page.locator('[data-ficha-projeto]').evaluate((el) => {
      const copia = el.cloneNode(true) as HTMLElement;
      copia.querySelectorAll('[data-editar-projeto], script, style').forEach((n) => n.remove());
      return copia.textContent ?? '';
    });
    expect(texto, id).not.toMatch(PROIBIDOS);
    await expect(page.locator('[data-ficha-projeto] .rd-status, [data-ficha-projeto] .status')).toHaveCount(0);
  }
});

test('ficha: processos SEI, cronograma e projeto sem dados', async ({ page, request }) => {
  await page.goto('/plataforma/projeto/P-901/?aba=sei');
  await expect(page.locator('[data-fp-sei] li')).toHaveText(['26.18.000001001-1']);
  await page.goto(FICHA + '?aba=cronograma');
  await expect(page.locator('[data-fp-cron]')).toHaveCount(1);
  await expect(page.locator('[data-fp-cron] a')).toHaveAttribute('href', '/plataforma/cronograma/C-exemplo-001/');
  const origin = new URL(page.url()).origin;
  const criado = await request.post('/plataforma/projeto/criar/', { headers: { 'content-type': 'application/json', origin }, data: { nome: 'Projeto E6 sem dados', orgao: 'SMS' } });
  expect(criado.status()).toBe(201);
  const { projeto: { id } } = await criado.json();
  await page.goto('/plataforma/projeto/' + id + '/');
  await expect(page.locator('[data-fp-observacao]')).toHaveText('Sem observação registrada.');
  await expect(page.locator('[data-fp-topo-item="entrega"] dd')).toHaveText('Sem data');
  await expect(page.locator('[data-fp-topo-item="localizacao"] dd')).toHaveText('Sem localização no mapa');
  await expect(page.locator('[data-fp-sei-vazio]')).toHaveText('Nenhum processo do SEI vinculado a este projeto.');
  await expect(page.locator('[data-fp-cron-vazio]')).toHaveText('Este projeto ainda não tem cronograma detalhado.');
  await expect(page.locator('[data-pj-docs]')).toHaveText('Nenhum documento enviado.');
  await expect(page.locator('[data-fp-fotos]')).toHaveText('Nenhuma foto enviada.');
});

test('ficha: guia Localização e fotos sai do menu e o endereço antigo leva à aba Localização', async ({ page }) => {
  await page.goto(CARTEIRA);
  await expect(page.locator('a[href="/plataforma/projetos-localizacao/"]')).toHaveCount(0);
  await page.goto('/plataforma/projetos-localizacao/?id=P-905');
  await expect(page).toHaveURL(/\/plataforma\/projeto\/P-905\/\?aba=localizacao$/);
  await expect(page.locator('#fp-aba-localizacao')).toBeChecked();
  await expect(page.locator('#lp-loc .leaflet-container')).toBeVisible();
  await page.goto('/plataforma/projetos-localizacao/');
  await expect(page.locator('h1')).toHaveText('Obras sem localização');
  await page.locator('[data-lp-pendentes] summary').click();
  await expect(page.getByRole('link', { name: /Cadastrar localização de/ }).first()).toHaveAttribute('href', /\/plataforma\/projeto\/P-[A-Za-z0-9_-]+\/\?aba=localizacao$/);
});

test('ficha: edição da E1 continua dentro da ficha e mantém a volta', async ({ page, request }) => {
  await page.goto(FICHA);
  const origin = new URL(page.url()).origin;
  const criado = await request.post('/plataforma/projeto/criar/', { headers: { 'content-type': 'application/json', origin }, data: { nome: '<img src=x onerror=alert(1)>', orgao: 'SMS' } });
  expect(criado.status()).toBe(201);
  const { projeto: { id } } = await criado.json();
  await page.goto('/plataforma/projeto/' + id + '/?volta=' + encodeURIComponent('/plataforma/projetos-carteira/?orgao=SMS'));
  await expect(page.locator('#fp-painel-cadastro [data-editar-projeto]')).toHaveCount(1);
  await page.locator('#fp-painel-cadastro [data-editar-projeto] summary').click();
  await page.locator('#ep-observacao').fill('<img src=x onerror=alert(2)>');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.locator('[data-pj-salvo]')).toBeVisible();
  await expect(page.locator('[data-fp-observacao]')).toHaveText('<img src=x onerror=alert(2)>');
  await expect(page.locator('main img[src="x"]')).toHaveCount(0);
  await expect(page.locator('.pj-contexto a')).toHaveAttribute('href', '/plataforma/projetos-carteira/?orgao=SMS');
});

test('ficha: acessibilidade sem falhas graves nos dois temas', async ({ page }) => {
  for (const tema of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: tema });
    for (const aba of ['cadastro', 'localizacao', 'governanca']) {
      await page.goto(FICHA + (aba === 'cadastro' ? '' : '?aba=' + aba));
      const a11y = await new AxeBuilder({ page }).include('main').exclude('.leaflet-tile-pane').analyze();
      expect(a11y.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')), `${tema} ${aba}`).toEqual([]);
    }
  }
});
