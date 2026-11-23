import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// E10 (22/11/2026): o painel que saiu da tela do prefeito na E3 é o Painel da equipe (Gestão), sem o mapa (mapa por área: E4).
const PAINEL = '/plataforma/gestao-equipe/';

const tamanhos = [
  [1280, 720], [1366, 768], [1920, 1080], [2560, 1440], [3840, 2160],
  [3440, 1440], [1080, 1920], [1024, 768], [768, 1024], [390, 844],
];

test('dashboard apresenta os dez indicadores calculados', async ({ page }) => {
  await page.goto(PAINEL);
  const cartoes = page.locator('[data-cartao]');
  await expect(cartoes).toHaveCount(10);
  for (const cartao of await cartoes.all()) {
    await expect(cartao.locator('.pd-numero')).toHaveText(/^(Regular|Com pend\u00eancia|\u2014|(?:R\$\s*)?\d[\d.,]*(?:\s*(?:mil|mi|bi))?%?)$/);
    await expect(cartao.locator('.pd-situacao')).toBeVisible();
  }
});

test('correção visual: valores em uma linha, grade ampla e cartões dentro da janela', async ({ page }) => {
  for (const [width, height] of [[1366, 768], [1920, 1080], [3840, 2160]]) {
    await page.setViewportSize({ width, height });
    await page.goto(PAINEL);
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
    await page.goto(`${PAINEL}?cartao=${id}`);
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
  await page.goto(PAINEL);
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
      await expect(numero).toHaveAttribute('data-direcao', /^(\u2191|\u2193)$/);
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
  await page.goto(PAINEL);
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
  await page.goto(PAINEL);
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

  await page.goto(PAINEL);
  const regiao = await page.locator('select[name="regiao"] option').nth(1).getAttribute('value');
  await page.goto(`${PAINEL}?regiao=${encodeURIComponent(regiao || '')}`);
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
  await page.goto(PAINEL);
  const regiao = await page.locator('select[name="regiao"] option').nth(1).getAttribute('value');
  await page.goto(`${PAINEL}?regiao=${encodeURIComponent(regiao || '')}`);
  await page.locator('[data-cartao="carteira"]').click();
  const ficha = page.locator('.pd-itens a').first();
  await expect(ficha).toBeVisible();
  await ficha.click();
  await expect(page).toHaveURL(/\/plataforma\/projeto\/P-[A-Za-z0-9_-]+\/\?volta=/);
  await page.goBack();
  const retorno = new URL(page.url());
  expect(retorno.searchParams.get('regiao')).toBe(regiao);
  expect(retorno.searchParams.get('cartao')).toBe('carteira');
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('dashboard é responsivo, sem rolagem horizontal e com alvos de toque adequados', async ({ page }) => {
  for (const [width, height] of tamanhos) {
    await page.setViewportSize({ width, height });
    await page.goto(PAINEL);
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
  await page.goto(PAINEL);
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

test('painel da equipe: prazos vencidos, onde está parado, decisões pendentes e alertas, sem mapa', async ({ page }) => {
  await page.goto(PAINEL);
  await expect(page.locator('h1')).toHaveText('Painel da equipe');
  await expect(page.locator('.side-links a[href="/plataforma/gestao-equipe/"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-cartao="atencao"] .pd-situacao')).toBeVisible();
  for (const secao of ['pd-parado', 'pd-decisoes', 'pd-alertas-central']) {
    await expect(page.locator(`#${secao}`)).toBeVisible();
    await expect(page.locator(`section:has(> #${secao}) :is(.pd-lista li, .pd-vazio)`).first()).toBeVisible();
  }
  await expect(page.locator('[data-pd-alertas] a[href="/plataforma/gestao-alertas/"]')).toHaveText('Abrir a central de alertas');
  await expect(page.locator('[data-mapa-obras]')).toHaveCount(0);
  await expect(page.locator('form.pd-filtros')).toHaveAttribute('action', PAINEL);
});

test('painel da equipe: decisão pendente abre a ficha e o X volta ao painel', async ({ page }) => {
  await page.goto(PAINEL);
  const decisao = page.locator('section:has(> #pd-decisoes) .pd-lista a').first();
  await expect(decisao).toBeVisible();
  await decisao.click();
  await page.waitForURL((u) => /^\/plataforma\/projeto\/P-[A-Za-z0-9_-]+\/$/.test(u.pathname));
  const fechar = page.locator('.pj-contexto a');
  await expect(fechar).toHaveText('Fechar e voltar ao painel da equipe');
  await expect(fechar).toHaveAttribute('href', PAINEL);
  await fechar.click();
  await page.waitForURL((u) => u.pathname === PAINEL);
  await expect(page.locator('h1')).toHaveText('Painel da equipe');
});
