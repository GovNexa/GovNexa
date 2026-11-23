import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// E3: tela inicial "Projetos prioritários". Sem contagens absolutas: outros testes podem cadastrar projetos no mesmo D1 local.
const TELA = '[data-prioritarios]';
const total = async (page: Page) => Number(await page.locator('[data-pp-total-qtd]').getAttribute('data-pp-total-qtd'));
const soma = (page: Page, seletor: string, campo: 'qtd' | 'centavos') =>
  page.locator(seletor).evaluateAll((els, c) => els.reduce((t, e) => t + Number((e as HTMLElement).dataset[c]), 0), campo);
const semRolagem = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test('prioritários: tela inicial mostra os quadros do croqui e as partes somam o total', async ({ page }) => {
  await page.goto('/plataforma/');
  await expect(page.getByRole('heading', { level: 1, name: 'Projetos prioritários', exact: true })).toBeVisible();
  for (const nome of ['Obras por área', 'Obras por etapa', 'Valor por etapa', 'Linha do tempo de entregas', 'Próximas entregas', 'Principais obras']) {
    await expect(page.getByRole('heading', { level: 2, name: nome, exact: true })).toBeVisible();
  }
  const n = await total(page);
  expect(n).toBeGreaterThan(0);
  await expect(page.locator('[data-pp-etapa]')).toHaveCount(await page.locator('[data-pp-etapa-valor]').count());
  expect(await page.locator('[data-pp-etapa]').count()).toBeGreaterThanOrEqual(5);
  expect(await soma(page, '[data-pp-etapa] .pp-num', 'qtd')).toBe(n);
  expect(await soma(page, '[data-pp-area] .pp-num', 'qtd')).toBe(n);
  const valor = Number(await page.locator('[data-pp-total-valor]').getAttribute('data-pp-total-valor'));
  expect(await soma(page, '[data-pp-etapa-valor] .pp-num', 'centavos')).toBe(valor);
  await expect(page.getByRole('img', { name: /^Linha do tempo/ })).toBeVisible();
});

test('prioritários: clicar numa etapa filtra o resto, muda o endereço e voltar restaura', async ({ page }) => {
  await page.goto('/plataforma/');
  const antes = await total(page);
  const execucao = Number(await page.locator('[data-pp-etapa="execucao"] .pp-num').getAttribute('data-qtd'));
  expect(execucao).toBeGreaterThan(0);
  await page.locator('[data-pp-etapa="execucao"]').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('etapa')).toBe('execucao');
  await expect.poll(() => total(page)).toBe(execucao);
  expect(await soma(page, '[data-pp-area] .pp-num', 'qtd')).toBe(execucao);
  await expect(page.locator('[data-pp-etapa="execucao"]')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('list', { name: 'Filtros ativos' })).toContainText('Etapa: Execução');
  for (const sub of await page.locator('[data-pp-proximas] .pp-sub').all()) await expect(sub).toContainText('Execução');
  await page.goBack();
  await expect.poll(() => new URL(page.url()).searchParams.get('etapa')).toBeNull();
  await expect.poll(() => total(page)).toBe(antes);
  await page.locator('[data-pp-etapa="execucao"]').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('etapa')).toBe('execucao');
  await page.locator('[data-pp-etapa="execucao"]').click();
  await expect.poll(() => new URL(page.url()).search).toBe('');
  await expect.poll(() => total(page)).toBe(antes);
});

test('prioritários: clicar numa área filtra as etapas e a lista', async ({ page }) => {
  await page.goto('/plataforma/');
  const area = page.locator('[data-pp-area]:not([data-pp-area="-sem"])').first();
  const codigo = (await area.getAttribute('data-pp-area'))!;
  const qtd = Number(await area.locator('.pp-num').getAttribute('data-qtd'));
  await area.click();
  await expect.poll(() => new URL(page.url()).searchParams.get('area')).toBe(codigo);
  await expect.poll(() => total(page)).toBe(qtd);
  expect(await soma(page, '[data-pp-etapa] .pp-num', 'qtd')).toBe(qtd);
  await expect(page.locator('[data-pp-area]')).toHaveCount(1);
  await expect(page.locator(`[data-pp-area="${codigo}"]`)).toHaveAttribute('aria-current', 'true');
});

test('prioritários: "Só prioritários" pelo formulário deixa o endereço limpo', async ({ page }) => {
  await page.goto('/plataforma/');
  const antes = await total(page);
  await page.getByLabel('Só prioritários').check();
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect.poll(() => new URL(page.url()).search).toBe('?prioritarios=1');
  await expect(page.getByLabel('Só prioritários')).toBeChecked();
  const depois = await total(page);
  expect(depois).toBeGreaterThanOrEqual(1);
  expect(depois).toBeLessThan(antes);
  for (const sub of await page.locator('[data-pp-principais] .pp-sub').all()) await expect(sub).toContainText('Prioritário');
});

test('prioritários: filtro que zera tudo mostra a mensagem e o caminho para limpar', async ({ page }) => {
  await page.goto('/plataforma/?prioritarios=1&etapa=concluida');
  expect(await total(page)).toBe(0);
  await expect(page.locator('.pp-aviso-zero')).toHaveText('Nenhuma obra com estes filtros. Limpar filtros');
  expect(await semRolagem(page)).toBeTruthy();
  await page.locator('.pp-aviso-zero').getByRole('link', { name: 'Limpar filtros', exact: true }).click();
  await expect.poll(() => new URL(page.url()).search).toBe('');
  await expect.poll(() => total(page)).toBeGreaterThan(0);
});

test('prioritários: valor estranho no endereço é ignorado com aviso e nada é refletido', async ({ page }) => {
  const q = new URLSearchParams({ regiao: '<script>window.__xss=1</script>', etapa: '<img src=x onerror=window.__xss=1>', area: '"><svg onload=window.__xss=1>' });
  await page.goto(`/plataforma/?${q}`);
  const avisos = page.locator('[data-pp-avisos]');
  await expect(avisos).toContainText('o filtro de região foi ignorado');
  await expect(avisos).toContainText('o filtro de etapa foi ignorado');
  await expect(avisos).toContainText('o filtro de área foi ignorado');
  expect(await page.evaluate(() => (window as Window & { __xss?: number }).__xss)).toBeUndefined();
  const html = await page.locator(TELA).innerHTML();
  // Texto escapado (ex.: nome de projeto "&lt;img ... onerror=...&gt;" criado por outro teste) é seguro; o que não pode existir é marcação ou atributo real.
  for (const trecho of ['<script>window', '<img src=x', '<svg onload']) expect(html).not.toContain(trecho);
  // E4: os únicos scripts dentro da tela são os do mapa compacto (dados em JSON e o módulo do próprio site).
  await expect(page.locator(`${TELA} [onerror], ${TELA} [onload], ${TELA} script:not([data-mp-dados]):not([type="module"][src^="/_astro/"])`)).toHaveCount(0);
  await expect(page.locator(`${TELA} script[data-mp-dados]`)).toHaveAttribute('type', 'application/json');
  await expect(page.getByRole('list', { name: 'Filtros ativos' })).toHaveCount(0);
});

test('prioritários: sem farol, prazo, onde está parado, decisões nem convênios na tela', async ({ page }) => {
  await page.goto('/plataforma/');
  const texto = await page.locator(TELA).innerText();
  expect(texto).not.toMatch(/farol|atrasad|no prazo|vencid|onde está parado|decisões pendentes|convênio|\bcauc\b|atenção|crítico/i);
  await expect(page.locator('[data-cartao], [data-indicador], #pd-decisoes, #pd-parado, #pd-regioes')).toHaveCount(0);
  // E4: o mapa compacto voltou, por área e sem situação de prazo (conferido em tests/mapa-area.spec.ts).
  await expect(page.locator(`${TELA} [data-mapa-obras="mapa-prefeito"]`)).toHaveCount(1);
});

test('prioritários: sem rolagem horizontal em 1280 e 390 px, com e sem filtro', async ({ page }) => {
  for (const [width, height] of [[1280, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    for (const rota of ['/plataforma/', '/plataforma/?etapa=execucao', '/plataforma/?prioritarios=1&etapa=concluida']) {
      await page.goto(rota);
      const resumo = page.locator('.pp-numeros summary');
      if (await resumo.count()) await resumo.click();
      expect(await semRolagem(page), `${rota} ${width}px`).toBeTruthy();
    }
  }
});

test('prioritários: acessibilidade sem violações graves nos temas claro e escuro', async ({ page }) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/plataforma/?etapa=execucao');
    const resumo = page.locator('.pp-numeros summary');
    if (await resumo.count()) await resumo.click();
    // E4: a tela ficou mais alta (mapa); abrir o resumo rolava a página e o cabeçalho fixo cobria os links das etapas.
    await page.evaluate(() => window.scrollTo(0, 0));
    for (const tema of ['light', 'dark']) {
      await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, tema);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(r.violations.filter((v) => ['serious', 'critical'].includes(v.impact || '')), `${width}px ${tema}: ${JSON.stringify(r.violations)}`).toEqual([]);
    }
  }
});

test('prioritários: números por mês viram filtro de período', async ({ page }) => {
  await page.goto('/plataforma/');
  await page.locator('.pp-numeros summary').click();
  const link = page.locator('[data-pp-mes]').first();
  const mes = (await link.getAttribute('data-pp-mes'))!;
  await link.click();
  await expect.poll(() => new URL(page.url()).searchParams.get('de_mes')).toBe(mes.slice(5, 7));
  const u = new URL(page.url()).searchParams;
  expect([u.get('de_ano'), u.get('ate_mes'), u.get('ate_ano')]).toEqual([mes.slice(0, 4), mes.slice(5, 7), mes.slice(0, 4)]);
  await expect(page.getByRole('list', { name: 'Filtros ativos' })).toContainText('Entrega:');
  for (const item of await page.locator('[data-pp-proximas] li').all()) expect((await item.getAttribute('data-entrega'))!.slice(0, 7)).toBe(mes);
});

test('prioritários: próximas entregas em ordem e o item abre a página do projeto', async ({ page }) => {
  await page.goto('/plataforma/');
  const datas = await page.locator('[data-pp-proximas] li').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.entrega ?? ''));
  expect(datas.length).toBeGreaterThan(0);
  expect(datas).toEqual([...datas].sort());
  await page.locator('[data-pp-proximas] li a').first().click();
  await expect(page).toHaveURL(/\/plataforma\/projeto\/P-\d+\/\?volta=%2Fplataforma%2F$/);
});
