import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// E3 (22/11/2026): a tela inicial virou "Projetos prioritários". O painel antigo (farol, prazos, convênios) continua no código
// (src/components/dashboard/DashboardPrefeito.astro e src/lib/gestao/dashboard.ts) e volta no painel da equipe na E10,
// que reativa estes testes apontando para a nova rota. Os testes unitários de dashboard.ts continuam no test:dados.
test.skip(() => true, 'Painel antigo fora da tela inicial desde a E3; reativar na E10 (painel da equipe).');

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`valores finais com movimento ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto('/plataforma/');
    if (reducedMotion === 'no-preference') await page.waitForTimeout(1500);
    for (const numero of await page.locator('.pd-numero').all()) {
      await expect(numero).toHaveText((await numero.getAttribute('data-final'))!);
    }
  });
}
test('alerta abre painel e cálculo aparece no hover e detalhe', async ({ page }) => {
  await page.goto('/plataforma/');
  const critico = page.locator('.pd-cartao.pd-situacao-critico').first();
  await expect(critico.locator('[data-indicador="critico"]')).toBeVisible();
  await critico.hover();
  await expect(critico.locator('.pd-calculo')).toContainText('Como é calculado');
  await expect(critico.locator('.pd-calculo')).toBeVisible();
  await page.getByRole('complementary', { name: 'Pontos de atenção' }).locator('a').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Como é calculado' })).toBeVisible();
});
test('atualização destaca mudança e mantém dados na falha', async ({ page }) => {
  await page.goto('/plataforma/');
  await page.waitForTimeout(1500);
  const numero = page.locator('[data-cartao="carteira"] .pd-numero');
  const anterior = Number(await numero.getAttribute('data-valor'));
  // Resposta sintética restrita ao teste: nunca gravada como dado de exemplo.
  await page.route('**/plataforma/', async route => {
    const response = await route.fetch();
    const html = await response.text();
    const alterado = await page.evaluate(({ html, valor }) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const n = doc.querySelector<HTMLElement>('[data-cartao="carteira"] .pd-numero')!;
      n.dataset.valor = String(valor); n.dataset.final = String(valor); n.textContent = String(valor);
      return doc.documentElement.outerHTML;
    }, { html, valor: anterior + 1 });
    await route.fulfill({ response, body: alterado });
  });
  await page.getByRole('button', { name: 'Atualizar agora' }).click();
  await expect(numero).toHaveText(String(anterior + 1));
  await expect(numero).toHaveClass(/pd-mudou/);
  await expect(numero).toHaveAttribute('data-direcao', '↑');
  await page.unroute('**/plataforma/');
  await page.route('**/plataforma/', route => route.abort());
  await page.getByRole('button', { name: 'Atualizar agora' }).click();
  await expect(page.locator('[data-atualizacao]')).toHaveText('Sem conexão, tentando de novo');
  await expect(numero).toHaveText(String(anterior + 1));
});
test('axe nos dois temas', async ({ page }) => {
  await page.goto('/plataforma/');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(t => document.documentElement.dataset.theme = t, theme);
    const resultado = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(resultado.violations).toEqual([]);
  }
});
for (const tv of [{ width: 3840, height: 2160, scale: 1 }, { width: 1920, height: 1080, scale: 2 }]) {
  test(`TV ${tv.width} escala ${tv.scale}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: tv, deviceScaleFactor: tv.scale });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:' + (process.env.PLAYWRIGHT_PORT || '4321') + '/plataforma/');
    await page.getByRole('button', { name: 'Apresentar', exact: true }).click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBeTruthy();
    const sair = page.getByRole('button', { name: 'Sair da apresentação', exact: true });
    await expect(sair).toBeVisible();
    expect((await sair.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await expect(page.getByRole('button', { name: 'Apresentar', exact: true })).toHaveCount(0);
    await expect(page.locator('#pd-funil')).toBeInViewport();
    await expect(page.locator('#pd-decisoes')).toBeInViewport();
    await expect(page.locator('.pd-sobretitulo')).toBeVisible();
    for (const cartao of await page.locator('[data-cartao]').all()) {
      expect((await cartao.boundingBox())!.height).toBeLessThanOrEqual(tv.height * .32 + 1);
    }
    expect(await page.locator('[data-prefeito-dashboard]').evaluate(el => el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth)).toBeTruthy();
    for (const cartao of await page.locator('[data-cartao]').all()) await expect(cartao).toBeInViewport();
    const cartao = page.locator('[data-cartao]').first();
    await cartao.hover();
    const dica = (await cartao.locator('.pd-calculo').boundingBox())!;
    const caixa = (await cartao.boundingBox())!;
    expect(dica.y).toBeGreaterThanOrEqual(caixa.y);
    expect(dica.y + dica.height).toBeLessThanOrEqual(caixa.y + caixa.height + 1);
    await sair.click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBeFalsy();
    await page.getByRole('button', { name: 'Apresentar', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBeFalsy();
    await context.close();
  });
}
