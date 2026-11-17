import { expect, test } from '@playwright/test';

test('plataforma: atas exibe um único aviso compacto com as duas informações', async ({ page }) => {
  await page.goto('/plataforma/atas/');
  const aviso = page.locator('.workspace > .notice');
  await expect(aviso).toHaveCount(1);
  await expect(aviso).toContainText(/Dados do banco da prefeitura|Ambiente de homologação/);
  await expect(aviso).toContainText('Dados de exemplo nos módulos demonstrativos');
});

test('rodapé da plataforma fica no fim da janela em página curta', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/plataforma/usuarios/');
  const rodape = await page.locator('.app-footer').boundingBox();
  expect(rodape).not.toBeNull();
  expect(rodape!.y + rodape!.height).toBeGreaterThanOrEqual(899);
});

test('tabela em tablet mostra todos os botões Ver detalhes dentro da tela', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/plataforma/captacao-acompanhamento/');
  const botoes = page.getByRole('button', { name: 'Ver detalhes' });
  await expect(botoes.first()).toBeVisible();
  for (const botao of await botoes.all()) {
    const caixa = await botao.boundingBox();
    expect(caixa).not.toBeNull();
    expect(caixa!.x).toBeGreaterThanOrEqual(0);
    expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(1024);
  }
});

test('células com e-mails longos quebram sem sobrepor a coluna Situação', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/plataforma/usuarios/');
  // Última linha da lista: existe sempre (no mínimo o administrador local) e, quando outro teste cadastra alguém, é a pessoa de e-mail longo.
  const linha = page.locator('.usr-tabela tbody tr').last();
  const email = linha.locator('td[data-label="E-mail"]');
  const situacao = linha.locator('td[data-label="Situação"]');
  await expect(email).toBeVisible();
  await expect(situacao).toBeVisible();

  const resultado = await Promise.all(
    [email, situacao].map((celula) =>
      celula.evaluate((el) => {
        const estilo = getComputedStyle(el);
        const faixa = document.createRange();
        faixa.selectNodeContents(el);
        return {
          whiteSpace: estilo.whiteSpace,
          overflowWrap: estilo.overflowWrap,
          fragmentos: Array.from(faixa.getClientRects(), ({ left, right, top, bottom }) => ({
            left,
            right,
            top,
            bottom,
          })),
        };
      }),
    ),
  );
  for (const celula of resultado) {
    expect(celula.whiteSpace).toBe('normal');
    expect(celula.overflowWrap).toBe('anywhere');
  }
  for (const emailFragmento of resultado[0].fragmentos) {
    for (const situacaoFragmento of resultado[1].fragmentos) {
      const mesmoNivel = emailFragmento.top < situacaoFragmento.bottom &&
        situacaoFragmento.top < emailFragmento.bottom;
      if (mesmoNivel) expect(emailFragmento.right).toBeLessThanOrEqual(situacaoFragmento.left + 1);
    }
  }
});

test('tabelas largas mantêm Ver detalhes acessível dentro da moldura', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const rota of ['/plataforma/atas/', '/plataforma/banco-de-precos/']) {
    await page.goto(rota);
    const moldura = page.locator('.workspace .table-wrap').first();
    const botoes = moldura.getByRole('button', { name: 'Ver detalhes' });
    await expect(botoes.first()).toBeVisible();
    const estado = await moldura.evaluate((el) => ({
      overflowX: getComputedStyle(el).overflowX,
      boxShadow: getComputedStyle(el).boxShadow,
      precisaRolar: el.scrollWidth > el.clientWidth,
    }));
    expect(estado.overflowX).toBe('auto');
    expect(estado.boxShadow).not.toBe('none');
    if (estado.precisaRolar) await moldura.evaluate((el) => { el.scrollLeft = el.scrollWidth; });

    const molduraCaixa = await moldura.boundingBox();
    expect(molduraCaixa).not.toBeNull();
    for (const botao of await botoes.all()) {
      const caixa = await botao.boundingBox();
      expect(caixa).not.toBeNull();
      expect(caixa!.x).toBeGreaterThanOrEqual(molduraCaixa!.x);
      expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(molduraCaixa!.x + molduraCaixa!.width + 1);
    }
  }
});

test('abas da plataforma ficam em uma linha rolável no celular com indicador ativo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [rota, seletor] of [
    ['/plataforma/cronograma/C-exemplo-002/', '.cr-abas .tabs'],
    ['/plataforma/cotacoes/', '[data-table] .tabs'],
  ]) {
    await page.goto(rota);
    const abas = page.locator(seletor);
    const botoes = abas.getByRole('button');
    await expect(abas).toBeVisible();
    const estilo = await abas.evaluate((el) => {
      const css = getComputedStyle(el);
      return { overflowX: css.overflowX, flexWrap: css.flexWrap, scrollbarWidth: css.scrollbarWidth };
    });
    expect(estilo).toEqual({ overflowX: 'auto', flexWrap: 'nowrap', scrollbarWidth: 'thin' });

    const caixas = await Promise.all((await botoes.all()).map((botao) => botao.boundingBox()));
    expect(caixas.every(Boolean)).toBeTruthy();
    const centros = caixas.map((caixa) => caixa!.y + caixa!.height / 2);
    expect(Math.max(...centros) - Math.min(...centros)).toBeLessThanOrEqual(2);
    await botoes.last().click();
    await expect(botoes.last()).toHaveAttribute('aria-pressed', 'true');
    const marcador = abas.locator('.tab-indicator');
    if (await marcador.count()) {
      await expect.poll(async () => {
        const [indicadorCaixa, ativoCaixa] = await Promise.all([
          marcador.boundingBox(),
          botoes.last().boundingBox(),
        ]);
        if (!indicadorCaixa || !ativoCaixa) return Number.POSITIVE_INFINITY;
        return Math.abs(indicadorCaixa.x - ativoCaixa.x);
      }).toBeLessThanOrEqual(1);
      await expect.poll(async () => {
        const [indicadorCaixa, ativoCaixa] = await Promise.all([
          marcador.boundingBox(),
          botoes.last().boundingBox(),
        ]);
        if (!indicadorCaixa || !ativoCaixa) return Number.POSITIVE_INFINITY;
        return Math.abs(indicadorCaixa.width - ativoCaixa.width);
      }).toBeLessThanOrEqual(1);
    } else {
      const [ativo, inativo] = await Promise.all([
        botoes.last().evaluate((el) => getComputedStyle(el).backgroundColor),
        botoes.first().evaluate((el) => getComputedStyle(el).backgroundColor),
      ]);
      expect(ativo).not.toBe(inativo);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  }
});

test('cabeçalho público mantém logo, Menu e Tema na mesma linha no celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/compradores/');
  const caixas = await Promise.all(
    ['.header .brand', '.header #menu-toggle', '.header #theme'].map((selector) =>
      page.locator(selector).boundingBox(),
    ),
  );
  expect(caixas.every(Boolean)).toBeTruthy();
  const centros = caixas.map((caixa) => caixa!.y + caixa!.height / 2);
  expect(Math.max(...centros) - Math.min(...centros)).toBeLessThanOrEqual(2);
});

test('Perfil mostra o rótulo Foto', async ({ page }) => {
  await page.goto('/plataforma/perfil/');
  await expect(page.getByText('Foto', { exact: true })).toBeVisible();
});

test.describe('alvos de toque', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('Fluxo e Gestão têm controles de mapa e zoom com pelo menos 44 px', async ({ page }) => {
    await page.goto('/plataforma/projetos-fluxo/');
    for (const seletor of ['[data-fx-zoom-menos]', '[data-fx-zoom-mais]']) {
      const caixa = await page.locator(seletor).boundingBox();
      expect(caixa).not.toBeNull();
      expect(caixa!.width).toBeGreaterThanOrEqual(44);
      expect(caixa!.height).toBeGreaterThanOrEqual(44);
    }

    await page.goto('/plataforma/gestao/');
    const chips = page.locator('#mapa .mp-chip');
    await expect(chips.first()).toBeVisible();
    for (const chip of await chips.all()) {
      const caixa = await chip.boundingBox();
      expect(caixa).not.toBeNull();
      expect(caixa!.width).toBeGreaterThanOrEqual(44);
      expect(caixa!.height).toBeGreaterThanOrEqual(44);
    }
  });
});
