import { expect, test } from '@playwright/test';

const viewports = [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 3840, height: 2160 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 360, height: 640 },
];
const pages = [
  { path: '/entrar/', action: 'Entrar' },
  { path: '/entrar/esqueci/', action: 'Enviar link' },
  { path: '/entrar/definir-senha/?token=x', action: 'Voltar ao login' },
];

test('as telas de acesso cabem na janela em todos os tamanhos e temas', async ({ page }) => {
  test.setTimeout(120_000);

  for (const theme of ['light', 'dark']) {
    await page.goto('/entrar/');
    await page.evaluate((value) => {
      localStorage.setItem('govnexa-theme', value);
      document.documentElement.dataset.theme = value;
    }, theme);

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);

      for (const route of pages) {
        await page.goto(route.path);
        // Pedido do dono: cartão centralizado, sem o caminho "Início / Acessar", e o mesmo rodapé do site visível.
        await expect(page.locator('main .breadcrumb')).toHaveCount(0);
        await expect(page.locator('body > footer')).toBeVisible();
        const centro = await page.evaluate(() => {
          const c = document.querySelector('.login-layout')!.getBoundingClientRect();
          const f = document.querySelector('body > footer')!.getBoundingClientRect();
          return { esquerda: c.left, direita: innerWidth - c.right, abaixoDoCartao: f.top - c.bottom };
        });
        expect(Math.abs(centro.esquerda - centro.direita), `${route.path} ${viewport.width}x${viewport.height} centralizado`).toBeLessThanOrEqual(2);
        expect(centro.abaixoDoCartao, `${route.path} ${viewport.width}x${viewport.height} rodapé abaixo do cartão`).toBeGreaterThanOrEqual(0);
        const dimensions = await page.evaluate(() => ({
          scrollHeight: document.documentElement.scrollHeight,
          scrollWidth: document.documentElement.scrollWidth,
          innerHeight: window.innerHeight,
          innerWidth: window.innerWidth,
        }));
        expect(dimensions.scrollHeight, `${route.path} ${viewport.width}x${viewport.height} (${theme})`).toBeLessThanOrEqual(dimensions.innerHeight);
        expect(dimensions.scrollWidth, `${route.path} ${viewport.width}x${viewport.height} (${theme})`).toBeLessThanOrEqual(dimensions.innerWidth);

        const layout = await page.locator('.login-layout').boundingBox();
        expect(layout, `${route.path} ${viewport.width}x${viewport.height} (${theme})`).not.toBeNull();
        expect(layout!.y, 'margem superior do cartão').toBeGreaterThanOrEqual(8);
        expect(layout!.y + layout!.height, 'margem inferior do cartão').toBeLessThanOrEqual(viewport.height - 8);
        const main = await page.locator('body > main').boundingBox();
        expect(main).not.toBeNull();
        expect(Math.abs(layout!.y + layout!.height / 2 - (main!.y + main!.height / 2)), 'centralização vertical do cartão').toBeLessThanOrEqual(2);

        const header = await page.locator('body > .header').evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const children = [...element.querySelectorAll('*')]
            .filter((child) => child.getClientRects().length > 0)
            .map((child) => {
              const rect = child.getBoundingClientRect();
              return { top: rect.top, bottom: rect.bottom };
            });
          return { top: bounds.top, bottom: bounds.bottom, children };
        });
        for (const child of header.children) {
          expect(child.top, 'filho do cabeçalho acima da altura').toBeGreaterThanOrEqual(header.top);
          expect(child.bottom, 'filho do cabeçalho abaixo da altura').toBeLessThanOrEqual(header.bottom);
        }

        const action = route.action === 'Voltar ao login'
          ? page.getByRole('link', { name: route.action })
          : page.getByRole('button', { name: route.action, exact: true });
        await expect(action).toBeVisible();
        const bounds = await action.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.y).toBeGreaterThanOrEqual(0);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
      }
    }
  }
});
