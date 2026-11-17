import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const modulos = [
  { nome: 'Projetos' },
  { nome: 'Captação' },
  { nome: 'Licitações' },
  { nome: 'Gestão' },
  { nome: 'Conta' },
];

test('primeira visita começa recolhida e a preferência expandida persiste nas páginas', async ({ page }) => {
  for (const width of [1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/plataforma/');
    const toggle = page.locator('#sidebar-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toHaveAccessibleName('Expandir menu');
    await expect(page.locator('.platform')).toHaveClass(/collapsed/);
    await expect(page.locator('.sidebar')).toHaveAttribute('data-closed', 'true');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.platform')).not.toHaveClass(/collapsed/);
    await page.goto('/plataforma/projetos-carteira/');
    await expect(page.locator('#sidebar-toggle')).toHaveAttribute('aria-expanded', 'true');
    await page.evaluate(() => localStorage.removeItem('govnexa-sidebar'));
  }
});

test('início mantém módulos fechados e conta apenas no topo', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/plataforma/');
  await expect(page.locator('.sidebar .sidebar-account, .sidebar .sidebar-account-avatar, .sidebar [href="/sair"]')).toHaveCount(0);
  await page.locator('#sidebar-toggle').click();
  for (const button of await page.locator('.sidebar button[data-module-id]').all()) {
    await expect(button).toHaveAttribute('aria-expanded', 'false');
  }
  const top = page.locator('.app-user');
  await expect(top.locator('.avatar')).toHaveText('AL');
  await expect(top.locator('.user-name')).toHaveText('Administrador local');
  await top.locator('summary').click();
  for (const [name, href] of [['Meu perfil', '/plataforma/perfil/'], ['Sair', '/sair']]) {
    const link = top.getByRole('link', { name, exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', href);
    const box = await link.boundingBox();
    // A medida vem em fração de pixel (43,99999 em vez de 44): arredonda antes de comparar.
    expect(Math.round(box?.height ?? 0)).toBeGreaterThanOrEqual(44);
    expect(Math.round(box?.width ?? 0)).toBeGreaterThanOrEqual(44);
  }
  await expect(page.locator('body')).not.toContainText('dev@exemplo.invalid');
});

test('menu aberto apresenta ícones e tipografia uniforme nos módulos e grupos', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/plataforma/');
  await page.locator('#sidebar-toggle').click();

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

test('menu recolhido mostra flyouts acessíveis com todos os links e fecha com Escape', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/plataforma/projetos-carteira/');

  const rail = page.locator('#side-module-rail');
  await expect(rail).toBeVisible();
  await expect(rail.locator('.side-module-icon')).toHaveCount(modulos.length);
  for (let i = 0; i < modulos.length; i++) {
    const modulo = modulos[i];
    const button = page.getByRole('button', { name: `Módulo ${modulo.nome}` });
    await expect(button).toHaveAttribute('aria-controls');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button.locator('svg')).toBeVisible();
    await expect(button).toHaveAttribute('title', modulo.nome);
    if (i === 0) {
      await button.hover();
      await expect(button).toHaveAttribute('aria-expanded', 'true');
      await page.mouse.move(640, 450);
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await button.focus();
      await expect(button).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('ArrowDown');
      await expect(page.locator(`#${await button.getAttribute('aria-controls')} a`).first()).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(button).toBeFocused();
    }
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    const flyout = page.locator(`#${await button.getAttribute('aria-controls')}`);
    await expect(flyout).toBeVisible();
    await expect(flyout.locator('a')).toHaveCount(await page.locator('.side-module').nth(i).locator('a').count());
    await expect(flyout.locator('a[aria-current=page]')).toHaveCount(0);
    if (modulo.nome === 'Projetos') await expect(flyout.locator('a[data-atual=true]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeFocused();
  }
  const firstModule = page.getByRole('button', { name: 'Módulo Projetos' });
  await firstModule.click();
  await page.locator('.workspace').click({ position: { x: 10, y: 10 } });
  await expect(firstModule).toHaveAttribute('aria-expanded', 'false');
});

test('rail recolhido alinha os botões e a sanfona mantém apenas o contexto atual aberto', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/plataforma/projetos-carteira/');
  await page.locator('#sidebar-toggle').click();
  const moduleHeaders = page.locator('.side-links button[data-sec^="m:"]');
  for (const header of await moduleHeaders.all()) {
    const expected = (await header.getAttribute('data-module-id')) === 'projetos' ? 'true' : 'false';
    await expect(header).toHaveAttribute('aria-expanded', expected);
  }
  await expect(moduleHeaders.filter({ hasText: 'Projetos' })).toHaveAttribute('aria-expanded', 'true');
  const projectModule = page.locator('.side-links button[data-sec="m:Projetos"]');
  const projectBodyId = await projectModule.getAttribute('aria-controls');
  expect(projectBodyId).toBeTruthy();
  const projectBody = page.locator(`#${projectBodyId}`);
  await expect(projectBody.locator('a[href="/plataforma/projetos-carteira/"][aria-current=page]')).toBeVisible();
  await expect(page.locator('.side-links button[data-sec^="g:Projetos:"][aria-expanded="true"]')).toHaveCount(0);
  await page.goto('/plataforma/processos/');
  await expect(page.locator('.side-links button[data-sec="m:Licitações"]')).toHaveAttribute('aria-expanded', 'true');
  const procurementGroups = page.locator('.side-links button[data-sec^="g:Licitações:"]');
  for (const group of await procurementGroups.all()) {
    const expected = (await group.getAttribute('data-sec')) === 'g:Licitações:Operação' ? 'true' : 'false';
    await expect(group).toHaveAttribute('aria-expanded', expected);
  }
  await expect(page.locator('.side-links a[href="/plataforma/processos/"][aria-current=page]')).toBeVisible();
  await page.goto('/plataforma/projetos-carteira/');
  await page.locator('.side-links button[data-sec="m:Captação"]').click();
  await expect(page.locator('.side-links button[data-sec="m:Captação"]')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.side-links button[data-sec="m:Projetos"]')).toHaveAttribute('aria-expanded', 'false');

  await page.goto('/plataforma/');
  for (const header of await moduleHeaders.all()) {
    await expect(header).toHaveAttribute('aria-expanded', 'false');
  }

  await page.locator('#sidebar-toggle').click();
  const controls = [page.locator('#sidebar-toggle'), ...await page.locator('.side-module-icon').all(), page.locator('.sidebar-help')];
  const boxes = await Promise.all(controls.map((control) => control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, center: rect.left + rect.width / 2 };
  })));
  expect(Math.max(...boxes.map((box) => box.width)) - Math.min(...boxes.map((box) => box.width))).toBeLessThanOrEqual(1);
  expect(Math.max(...boxes.map((box) => box.center)) - Math.min(...boxes.map((box) => box.center))).toBeLessThanOrEqual(1);
});

test('menu não causa rolagem horizontal e passa no axe nos dois temas', async ({ page }) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/plataforma/');
    if (width === 390) {
      await page.locator('#drawer-toggle').click();
      await expect(page.locator('#drawer-toggle')).toHaveAttribute('aria-expanded', 'true');
    }
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

test('ícone do módulo atual mantém contraste no menu recolhido nos dois temas', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/plataforma/projetos-carteira/');

  const currentButton = page.locator('.side-module-icon[data-current=true]');
  await expect(currentButton).toHaveCount(1);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    const contrast = await currentButton.evaluate((button) => {
      const foreground = getComputedStyle(button.querySelector('svg')!).color;
      const background = getComputedStyle(button).backgroundColor;
      const luminance = (color: string) => {
        const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((channel) => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
      };
      const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      return (values[0] + 0.05) / (values[1] + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(3);
  }
});

test('flyout de Licitações cabe na viewport e permite rolar até o último link', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/plataforma/processos/');

  const button = page.getByRole('button', { name: 'Módulo Licitações' });
  await button.click();
  const flyout = page.locator(`#${await button.getAttribute('aria-controls')}`);
  const bounds = await flyout.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, height: rect.height, scrollHeight: element.scrollHeight };
  });
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeLessThanOrEqual(900);
  expect(bounds.height).toBeLessThanOrEqual(876);
  expect(bounds.scrollHeight).toBeGreaterThan(bounds.height);

  const lastLink = flyout.locator('a').last();
  await lastLink.scrollIntoViewIfNeeded();
  await expect(lastLink).toBeInViewport();
});
