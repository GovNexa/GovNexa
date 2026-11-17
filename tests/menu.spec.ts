import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const modulos = [
  { nome: 'Projetos', href: '/plataforma/projetos/' },
  { nome: 'Captação', href: '/plataforma/captacao/' },
  { nome: 'Licitações', href: '/plataforma/' },
  { nome: 'Gestão', href: '/plataforma/gestao/' },
  { nome: 'Conta', href: '/plataforma/relatorios/' },
];

test('menu aberto apresenta ícones e tipografia uniforme nos módulos e grupos', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/plataforma/');

  const headers = page.locator('.sidebar button[data-sec]');
  const headerCount = await headers.count();
  await expect(headers.locator('svg')).toHaveCount(headerCount);
  const links = page.locator('.sidebar .side-links a');
  await expect(links.locator('svg')).toHaveCount(await links.count());

  const styles = await headers.evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      return {
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        textTransform: style.textTransform,
        letterSpacing: style.letterSpacing,
      };
    }),
  );
  expect(new Set(styles.map((style) => style.fontSize)).size).toBe(1);
  expect(new Set(styles.map((style) => style.fontWeight)).size).toBe(1);
  expect(new Set(styles.map((style) => style.textTransform))).toEqual(new Set(['none']));
  expect(new Set(styles.map((style) => style.letterSpacing))).toEqual(new Set(['normal']));
});

test('menu recolhido mostra atalhos acessíveis que abrem a tela inicial dos módulos', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/plataforma/');
  await page.locator('#sidebar-toggle').click();

  const rail = page.locator('#side-module-rail');
  await expect(rail).toBeVisible();
  await expect(rail.locator('a')).toHaveCount(modulos.length);
  for (const modulo of modulos) {
    const link = page.getByRole('link', { name: `Módulo ${modulo.nome}` });
    await expect(link).toHaveAttribute('href', modulo.href);
    await expect(link.locator('svg')).toBeVisible();
    await expect(link).toHaveAttribute('title', modulo.nome);
    await link.focus();
    await expect(link.locator('.side-module-tooltip')).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${modulo.href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    await expect(page.getByRole('link', { name: `Módulo ${modulo.nome}` })).toHaveAttribute('data-current', 'true');
  }
});

test('menu não causa rolagem horizontal e passa no axe nos dois temas', async ({ page }) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/plataforma/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();

    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      const results = await new AxeBuilder({ page })
        .include('.sidebar')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact || '')),
        `menu ${width}px ${theme}: ${JSON.stringify(results.violations)}`,
      ).toEqual([]);
    }

    if (width === 1280) {
      await page.locator('#sidebar-toggle').click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        const results = await new AxeBuilder({ page })
          .include('.sidebar')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(
          results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact || '')),
          `menu recolhido ${theme}: ${JSON.stringify(results.violations)}`,
        ).toEqual([]);
      }
    }
  }
});
