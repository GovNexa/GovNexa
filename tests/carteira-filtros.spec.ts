import { test, expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('carteira: impressão no tema escuro sai com texto escuro', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('govnexa-theme', 'dark'));
  await page.goto('/plataforma/projetos-carteira/');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.workspace')).toHaveCSS('color', 'rgb(0, 0, 0)');
});

async function cores(element: Locator) {
  return element.evaluate((el) => {
    const luminancia = (color: string) => {
      const c = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => {
        v /= 255;
        return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
      });
      return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
    };
    const style = getComputedStyle(el);
    let background = style.backgroundColor;
    let parent = el.parentElement;
    while (background === 'rgba(0, 0, 0, 0)' && parent) {
      background = getComputedStyle(parent).backgroundColor;
      parent = parent.parentElement;
    }
    const bg = luminancia(background), fg = luminancia(style.color);
    return { bg, contraste: (Math.max(bg, fg) + .05) / (Math.min(bg, fg) + .05) };
  });
}
const G = '/plataforma/projetos-gantt/';
const linhas = (page: Page) => page.locator('[data-gt-linha]');
test.use({ viewport: { width: 1280, height: 900 } });
async function aplicarOrgao(page: Page) {
  const select = page.locator('form[data-filtros-projetos] select[name=orgao]');
  const v = await select.locator('option').nth(1).getAttribute('value');
  await select.selectOption(v!); await Promise.all([page.waitForURL(/[?&]orgao=/), page.getByRole('button', { name: 'Aplicar filtros' }).click()]);
  return v!;
}
test('gantt: filtro de órgão muda a lista e o endereço', async ({ page }) => {
  await page.goto(G); const n = await linhas(page).count(); expect(n).toBeGreaterThan(0);
  const v = await aplicarOrgao(page); expect(page.url()).toContain('orgao=' + encodeURIComponent(v));
  expect(await linhas(page).count()).toBeLessThan(n);
  for (const linha of await linhas(page).all()) expect(await linha.getAttribute('data-orgao')).toBe(v);
  await expect(page.locator('[data-gt-resumo]')).toContainText('Mostrando');
});
test('gantt: voltar restaura o filtro anterior', async ({ page }) => {
  await page.goto(G); const n = await linhas(page).count(); const v = await aplicarOrgao(page);
  const macro = await linhas(page).first().getAttribute('data-macro');
  await page.locator('form[data-filtros-projetos] select[name=macro]').selectOption(macro!); await Promise.all([page.waitForURL(/[?&]macro=/), page.getByRole('button', { name: 'Aplicar filtros' }).click()]);
  expect(page.url()).toContain('orgao='); expect(page.url()).toContain('macro=');
  await page.goBack(); await page.waitForURL((u) => !u.search.includes('macro=')); expect(page.url()).toContain('orgao='); expect(page.url()).not.toContain('macro=');
  await expect(page.locator('form[data-filtros-projetos] select[name=macro]')).toHaveValue(''); await expect(page.locator('form[data-filtros-projetos] select[name=orgao]')).toHaveValue(v);
  for (const linha of await linhas(page).all()) expect(await linha.getAttribute('data-orgao')).toBe(v);
  await page.goBack(); await page.waitForURL((u) => u.search === ''); expect(page.url()).not.toContain('?'); await expect(linhas(page)).toHaveCount(n);
});
test('gantt: endereço compartilhado abre já filtrado e limpar volta a tudo', async ({ page }) => {
  await page.goto(G); const n = await linhas(page).count(); const termo = (await linhas(page).first().locator('.gt-rotulo').getAttribute('title'))!.slice(0, 6);
  await page.goto(G + '?q=' + encodeURIComponent(termo)); await expect(page.locator('form[data-filtros-projetos] input[name=q]')).toHaveValue(termo);
  for (const linha of await linhas(page).all()) expect((await linha.locator('.gt-rotulo').getAttribute('title'))!.toLowerCase()).toContain(termo.toLowerCase());
  await Promise.all([page.waitForURL((u) => u.search === ''), page.getByRole('link', { name: 'Limpar filtros' }).click()]); expect(page.url()).toMatch(/\/projetos-gantt\/$/); await expect(linhas(page)).toHaveCount(n); await expect(page.getByRole('link', { name: 'Limpar filtros' })).toHaveCount(0);
});
test('gantt: parâmetros inválidos são ignorados com aviso e nada da URL vira HTML', async ({ page }) => {
  await page.goto(G); const n = await linhas(page).count();
  await page.goto(G + '?orgao=' + encodeURIComponent('<img src=x onerror="window.__xss=1">') + '&macro=99&de_mes=13&de_ano=2027');
  for (const aviso of ['O órgão do endereço não existe nesta carteira; o filtro de órgão foi ignorado.', 'A macroetapa do endereço não existe; o filtro de macroetapa foi ignorado.', 'Mês ou ano inválido no endereço; essa ponta do período foi ignorada.']) await expect(page.locator('[data-fp-avisos]')).toContainText(aviso);
  await expect(linhas(page)).toHaveCount(n); await expect(page.locator('img[src="x"]')).toHaveCount(0); expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
  const valor = '<img src=x onerror="window.__xss=2">'; await page.goto(G + '?q=' + encodeURIComponent(valor));
  await expect(page.locator('form[data-filtros-projetos] input[name=q]')).toHaveValue(valor); await expect(page.locator('[data-gt-vazio]')).toContainText('Nenhum projeto encontrado com esses filtros.');
  await expect(page.locator('img[src="x"]')).toHaveCount(0); expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
});
test('gantt: ordem pela entrega mais próxima', async ({ page }) => {
  await page.goto(G); const datas = await linhas(page).evaluateAll(es => es.map(e => e.getAttribute('data-entrega') || ''));
  const preenchidas = datas.filter(Boolean); expect(preenchidas).toEqual([...preenchidas].sort()); expect(datas).toEqual([...preenchidas, ...datas.filter(d => !d)]);
  await expect(linhas(page).first().locator('.gt-rotulo small')).toContainText(/Entrega \d{2}\/\d{2}\/\d{4}/);
});
test('gantt: período de entrega pelo endereço', async ({ page }) => {
  await page.goto(G); const data = (await linhas(page).first().getAttribute('data-entrega'))!; const [ano, mes] = data.split('-');
  await page.goto(G + `?de_mes=${mes}&de_ano=${ano}&ate_mes=${mes}&ate_ano=${ano}`);
  expect(await linhas(page).count()).toBeGreaterThan(0); for (const linha of await linhas(page).all()) expect(await linha.getAttribute('data-entrega')).toMatch(new RegExp(`^${ano}-${mes}`));
  await expect(page.locator('form[data-filtros-projetos] select[name=de_mes]')).toHaveValue(mes); await expect(page.locator('form[data-filtros-projetos] select[name=de_ano]')).toHaveValue(ano);
});
test('gantt: teclado aplica o filtro', async ({ page }) => {
  await page.goto(G); const termo = (await linhas(page).first().locator('.gt-rotulo').getAttribute('title'))!.slice(0, 6);
  const busca = page.locator('form[data-filtros-projetos] input[name=q]'); await busca.focus(); await page.keyboard.type(termo); await page.keyboard.press('Tab'); await expect(page.locator('form[data-filtros-projetos] select[name=orgao]')).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(busca).toBeFocused(); await Promise.all([page.waitForURL(/[?&]q=/), page.keyboard.press('Enter')]);
});
test('gantt: 390 px sem rolagem horizontal, com e sem filtro', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const url of [G, G + '?orgao=SMS&de_ano=2026']) {
    await page.goto(url); expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    const box = await page.locator('form[data-filtros-projetos]').boundingBox(); expect(box!.x + box!.width).toBeLessThanOrEqual(390); await expect(page.getByRole('button', { name: 'Aplicar filtros' })).toBeVisible();
  }
});
for (const tema of ['light', 'dark']) test(`gantt: fundo claro e contraste AA no tema ${tema}`, async ({ page }) => {
  await page.addInitScript(v => localStorage.setItem('govnexa-theme', v), tema); await page.goto(G);
  const workspace = await cores(page.locator('.workspace')); if (tema === 'light') expect(workspace.bg).toBeGreaterThan(.9); else expect(workspace.bg).toBeLessThan(.05);
  for (const seletor of ['.fp label', '.fp legend', '[data-gt-resumo]', '.gt-rotulo small']) expect((await cores(page.locator(seletor).first())).contraste).toBeGreaterThanOrEqual(4.5);
  const sidebar = await cores(page.locator('.sidebar')); if (tema === 'light') expect(sidebar.bg).toBeGreaterThan(.9); else expect(sidebar.bg).toBeLessThan(.2); expect(sidebar.contraste).toBeGreaterThanOrEqual(4.5);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze(); expect(results.violations.filter(v => ['serious', 'critical'].includes(v.impact || '')), JSON.stringify(results.violations)).toEqual([]);
});
