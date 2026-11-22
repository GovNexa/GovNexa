import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// E3 (22/11/2026): a tela inicial virou "Projetos prioritários". O painel antigo (farol, prazos, convênios) continua no código
// (src/components/dashboard/DashboardPrefeito.astro e src/lib/gestao/dashboard.ts) e volta no painel da equipe na E10,
// que reativa estes testes apontando para a nova rota. Os testes unitários de dashboard.ts continuam no test:dados.
test.skip(() => true, 'Painel antigo fora da tela inicial desde a E3; reativar na E10 (painel da equipe).');

const tamanhos = [
  [1280, 720], [1366, 768], [1920, 1080], [2560, 1440], [3840, 2160],
  [3440, 1440], [1080, 1920], [1024, 768], [768, 1024], [390, 844],
];

test('dashboard apresenta os dez indicadores calculados', async ({ page }) => {
  await page.goto('/plataforma/');
  const cartoes = page.locator('[data-cartao]');
  await expect(cartoes).toHaveCount(10);
  for (const cartao of await cartoes.all()) {
    await expect(cartao.locator('.pd-numero')).toHaveText(/^(Regular|Com pendência|—|(?:R\$\s*)?\d[\d.,]*(?:\s*(?:mil|mi|bi))?%?)$/);
    await expect(cartao.locator('.pd-situacao')).toBeVisible();
  }
});

test('correção visual: valores em uma linha, grade ampla e cartões dentro da janela', async ({ page }) => {
  for (const [width, height] of [[1366, 768], [1920, 1080], [3840, 2160]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/plataforma/');
    await page.evaluate(() => document.querySelector('.platform')?.classList.add('collapsed'));
    const medidas = await page.locator('.pd-cartoes').evaluate((grade) => ({
      largura: grade.getBoundingClientRect().width,
      util: document.querySelector('.prefeito-dashboard')!.getBoundingClientRect().width,
      cartoes: [...grade.querySelectorAll('[data-cartao]')].map((cartao) => {
        const numero = cartao.querySelector('.pd-numero')!;
        const estilo = getComputedStyle(numero);
        return { topo: cartao.getBoundingClientRect().top, fundo: cartao.getBoundingClientRect().bottom,
          altura: numero.getBoundingClientRect().height, linha: parseFloat(estilo.lineHeight), fonte: parseFloat(estilo.fontSize) };
      }),
    }));
    expect(medidas.cartoes).toHaveLength(10);
    for (const cartao of medidas.cartoes) {
      expect(cartao.altura).toBeLessThanOrEqual(cartao.linha * 1.3);
      if (width !== 3840) {
        expect(cartao.topo).toBeGreaterThanOrEqual(0);
        expect(cartao.fundo).toBeLessThanOrEqual(height);
      } else expect(cartao.fonte).toBeGreaterThanOrEqual(64);
    }
    if (width === 3840) expect(medidas.largura).toBeGreaterThanOrEqual(medidas.util * .8);
  }
});

test('textos brasileiros e quebras do painel sem sobreposição', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  for (const id of ['carteira', 'execucao', 'contratacao', 'entregas', 'atencao', 'falta_financiar', 'convenios', 'convenios_risco', 'cauc', 'oportunidades']) {
    await page.goto(`/plataforma/?cartao=${id}`);
    expect(await page.locator('.prefeito-dashboard').innerText()).not.toMatch(/\d+\.\d+%|\d{4}-\d{2}-\d{2}/);
    for (const linha of await page.locator('.pd-barras-painel>li').all()) {
      const label = await linha.locator('.pd-barra-label').boundingBox();
      const barra = await linha.locator('.pd-barra-trilho').boundingBox();
      const dados = await linha.locator('.pd-barra-dados').boundingBox();
      expect(label!.x + label!.width).toBeLessThanOrEqual(barra!.x);
      expect(barra!.x + barra!.width).toBeLessThanOrEqual(dados!.x);
    }
  }
});

test('filtro de região atualiza sem recarregar e mantém o foco', async ({ page }) => {
  await page.goto('/plataforma/');
  await page.evaluate(() => { (window as Window & { __semRecarregar?: number }).__semRecarregar = 1; });
  const opcoes = await page.locator('select[name="regiao"] option').evaluateAll((items) =>
    items.map((item) => (item as HTMLOptionElement).value).filter(Boolean),
  );
  const conveniosBase = await page.locator('[data-cartao="convenios"] .pd-numero').textContent();
  const carteiraBase = await page.locator('[data-cartao="carteira"] .pd-numero').textContent();
  const select = page.locator('select[name="regiao"]');
  let mudou = false;
  for (const regiao of opcoes) {
    await select.selectOption(regiao);
    await expect.poll(() => new URL(page.url()).searchParams.get('regiao')).toBe(regiao);
    await expect(select).toHaveValue(regiao);
    await expect(select).toBeFocused();
    const carteiraFiltrada = await page.locator('[data-cartao="carteira"] .pd-numero').textContent();
    expect(await page.locator('[data-cartao="convenios"] .pd-numero').textContent()).toBe(conveniosBase);
    if (carteiraFiltrada !== carteiraBase) {
      mudou = true;
      const numero = page.locator('[data-cartao="carteira"] .pd-numero');
      await expect(numero).toHaveClass(/pd-mudou/);
      await expect(numero).toHaveAttribute('data-direcao', /^(↑|↓)$/);
      break;
    }
  }
  expect(mudou, 'ao menos uma região deve reduzir a carteira').toBeTruthy();
  expect(await page.evaluate(() => (window as Window & { __semRecarregar?: number }).__semRecarregar)).toBe(1);
  await page.getByRole('link', { name: 'Limpar' }).click();
  await expect.poll(() => new URL(page.url()).search).toBe('');
  await expect(page.locator('[data-cartao="carteira"] .pd-numero')).toHaveText(carteiraBase!);
  await expect(page.getByRole('link', { name: 'Limpar' })).toBeFocused();
  await expect(page.locator('[data-filtros-status]')).toHaveText('Sem filtros. Mostrando todos.');
});

test('trocas rápidas de região mantêm apenas o último filtro', async ({ page }) => {
  await page.goto('/plataforma/');
  const regioes = await page.locator('select[name="regiao"] option').evaluateAll((items) =>
    items.map((item) => (item as HTMLOptionElement).value).filter(Boolean),
  );
  expect(regioes.length).toBeGreaterThanOrEqual(2);
  const select = page.locator('select[name="regiao"]');
  const primeira = select.selectOption(regioes[0]);
  const ultima = select.selectOption(regioes[1]);
  await Promise.all([primeira, ultima]);
  await expect.poll(() => new URL(page.url()).searchParams.get('regiao')).toBe(regioes[1]);
  await expect(select).toHaveValue(regioes[1]);
  await expect(select).toBeFocused();
});

test('painel abre por URL e fecha com Escape, botão e voltar do navegador', async ({ page }) => {
  await page.goto('/plataforma/');
  await page.locator('[data-cartao="carteira"]').click();
  await expect(page).toHaveURL(/cartao=carteira/);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/cartao=/);

  await page.locator('[data-cartao="carteira"]').click();
  await expect(page).toHaveURL(/cartao=carteira/);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Fechar' }).click();
  await expect(page).not.toHaveURL(/cartao=/);

  await page.goto('/plataforma/');
  const regiao = await page.locator('select[name="regiao"] option').nth(1).getAttribute('value');
  await page.goto(`/plataforma/?regiao=${encodeURIComponent(regiao || '')}`);
  await page.locator('[data-cartao="carteira"]').click();
  await expect(page).toHaveURL(/cartao=carteira/);
  await expect(page.getByRole('dialog')).toBeVisible();
  const urlDoPainel = page.url();
  await page.goBack();
  await expect(page).not.toHaveURL(/cartao=/);
  await page.goForward();
  await expect(page).toHaveURL(urlDoPainel);
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('item da carteira abre a ficha e voltar preserva filtros e cartão', async ({ page }) => {
  await page.goto('/plataforma/');
  const regiao = await page.locator('select[name="regiao"] option').nth(1).getAttribute('value');
  await page.goto(`/plataforma/?regiao=${encodeURIComponent(regiao || '')}`);
  await page.locator('[data-cartao="carteira"]').click();
  const ficha = page.locator('.pd-itens a').first();
  await expect(ficha).toBeVisible();
  await ficha.click();
  await expect(page).toHaveURL(/\/plataforma\/projetos-carteira\/\?q=/);
  await page.goBack();
  const retorno = new URL(page.url());
  expect(retorno.searchParams.get('regiao')).toBe(regiao);
  expect(retorno.searchParams.get('cartao')).toBe('carteira');
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('dashboard é responsivo, sem rolagem horizontal e com alvos de toque adequados', async ({ page }) => {
  for (const [width, height] of tamanhos) {
    await page.setViewportSize({ width, height });
    await page.goto('/plataforma/');
    const cartoes = page.locator('[data-cartao]');
    await expect(cartoes).toHaveCount(10);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}x${height}`).toBeTruthy();
    for (const cartao of await cartoes.all()) {
      const box = await cartao.boundingBox();
      expect(box?.height, `alvo ${width}x${height}`).toBeGreaterThanOrEqual(48);
    }
  }
});

test('dashboard mantém acessibilidade WCAG 2.2 AA nos temas claro e escuro', async ({ page }) => {
  await page.goto('/plataforma/');
  for (const tema of ['light', 'dark']) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, tema);
    const resultados = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      resultados.violations.filter((violacao) => ['serious', 'critical'].includes(violacao.impact || '')),
      `dashboard ${tema}: ${JSON.stringify(resultados.violations)}`,
    ).toEqual([]);
  }
});
