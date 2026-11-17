import { test, expect, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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

for (const tema of ['light', 'dark']) {
  for (const rota of ['/plataforma/', '/plataforma/projetos-carteira/']) {
    test(`${tema}: menu e superfícies em ${rota}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.addInitScript(value => localStorage.setItem('govnexa-theme', value), tema);
      await page.goto(rota);
      for (const recolhido of [true, false]) {
        if (!recolhido) await page.locator('#sidebar-toggle').click();
        const sidebar = await cores(page.locator('.sidebar'));
        if (tema === 'light') expect(sidebar.bg).toBeGreaterThan(.9);
        else expect(sidebar.bg).toBeLessThan(.2);
        expect(sidebar.contraste).toBeGreaterThanOrEqual(4.5);
        if (recolhido) {
          await page.getByRole('button', { name: 'Módulo Projetos' }).click();
          const flyout = page.locator('.side-module-flyout:visible');
          await expect(flyout).toBeVisible();
          expect((await cores(flyout)).contraste).toBeGreaterThanOrEqual(4.5);
          if (rota.includes('projetos-carteira')) {
            expect((await cores(flyout.locator('a[data-atual=true]'))).contraste).toBeGreaterThanOrEqual(4.5);
            expect((await cores(page.locator('.side-module-icon[data-current=true]'))).contraste).toBeGreaterThanOrEqual(4.5);
          }
        } else if (rota.includes('projetos-carteira')) {
          expect((await cores(page.locator('.sidebar a[aria-current=page]'))).contraste).toBeGreaterThanOrEqual(4.5);
        }
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
        expect(results.violations.filter(v => ['serious', 'critical'].includes(v.impact || '')), JSON.stringify(results.violations)).toEqual([]);
        const controls = page.locator('.sidebar button:visible, .sidebar a:visible, .side-module-flyout:visible a');
        for (const control of await controls.all()) {
          const box = await control.boundingBox();
          expect(box!.width).toBeGreaterThanOrEqual(44);
          expect(box!.height).toBeGreaterThanOrEqual(44);
        }
        if (recolhido) await page.keyboard.press('Escape');
      }
    });
  }
}
