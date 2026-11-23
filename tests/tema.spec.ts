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
          await page.getByRole('button', { name: 'Módulo Visão gerencial' }).click();
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

const TELAS_E18 = ['/plataforma/', '/plataforma/projetos-carteira/', '/plataforma/gestao/', '/plataforma/projetos-kanban/', '/plataforma/gestao-licitacoes/', '/plataforma/gestao-responsaveis/', '/plataforma/convenios/', '/plataforma/projetos-fluxo/', '/plataforma/projeto/P-900/'];

async function axeGraves(page: import('@playwright/test').Page) {
  const r = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  return r.violations.filter(v => ['serious', 'critical'].includes(v.impact || ''));
}

test.describe('E18: ícone do topo alterna o tema', () => {
  for (const rota of TELAS_E18) {
    test(`alternar claro e escuro em ${rota}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.addInitScript(() => { if (!sessionStorage.getItem('e18')) { sessionStorage.setItem('e18', '1'); localStorage.setItem('govnexa-theme', 'dark'); } });
      await page.goto(rota);
      await page.waitForLoadState('networkidle');
      const botao = page.locator('.appbar [data-tema-alternar]');
      await expect(botao).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(botao).toHaveAttribute('aria-pressed', 'true');
      await expect(botao).toHaveAttribute('aria-label', 'Mudar para o modo claro');
      await botao.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await expect(botao).toHaveAttribute('aria-pressed', 'false');
      await expect(botao).toHaveAttribute('aria-label', 'Mudar para o modo escuro');
      expect((await cores(page.locator('body'))).bg).toBeGreaterThan(.8);
      expect(await axeGraves(page), 'claro').toEqual([]);
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await page.locator('.appbar [data-tema-alternar]').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      expect(await axeGraves(page), 'escuro').toEqual([]);
    });
  }

  test('ícone alcançável por teclado e aciona com Enter', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.addInitScript(() => localStorage.setItem('govnexa-theme', 'dark'));
    await page.goto('/plataforma/');
    const botao = page.locator('.appbar [data-tema-alternar]');
    const box = await botao.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(40);
    expect(box!.height).toBeGreaterThanOrEqual(40);
    await botao.focus();
    await expect(botao).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.keyboard.press('Shift+Tab');
    let alcancou = false;
    for (let i = 0; i < 30 && !alcancou; i++) { await page.keyboard.press('Tab'); alcancou = await botao.evaluate(el => el === document.activeElement); }
    expect(alcancou).toBe(true);
  });

  test('captura da plataforma nos dois temas', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const tema of ['light', 'dark']) {
      await page.addInitScript(v => localStorage.setItem('govnexa-theme', v), tema);
      await page.goto('/plataforma/');
      await page.screenshot({ path: `.tmp/e18-plataforma-${tema}.png` });
    }
  });
});
