import { test, expect, type Page } from '@playwright/test';

// Nenhuma informação da plataforma pode ficar atrás do menu lateral, esteja ele recolhido ou expandido.
// Confere todo elemento com texto ou controle visível, no topo e no fim da rolagem de cada tela.
const atrasDoMenu = (page: Page) => page.evaluate(async () => {
  const menu = document.querySelector('.platform > .sidebar');
  if (!menu) return ['menu não encontrado'];
  const achados = new Set<string>();
  const conferir = () => {
    const m = menu.getBoundingClientRect();
    for (const el of document.body.querySelectorAll<HTMLElement>('*')) {
      if (el.closest('.sidebar, .side-module-flyouts, .sr-only, .skip, script, style')) continue;
      const temTexto = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '');
      const controle = el.matches('a, button, input, select, textarea, img, svg, canvas');
      if (!temTexto && !controle) continue;
      const estilo = getComputedStyle(el);
      if (estilo.visibility === 'hidden' || estilo.display === 'none' || Number(estilo.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const largura = Math.min(r.right, m.right) - Math.max(r.left, m.left);
      const altura = Math.min(r.bottom, m.bottom) - Math.max(r.top, m.top);
      if (largura > 1 && altura > 1) achados.add(`${el.tagName.toLowerCase()}.${el.className} "${(el.textContent ?? '').trim().slice(0, 40)}"`);
    }
  };
  conferir();
  window.scrollTo(0, document.documentElement.scrollHeight);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  conferir();
  return [...achados];
});

for (const largura of [1050, 1280, 1920]) {
  test(`o menu não cobre informações em nenhuma tela (${largura}px, recolhido e expandido)`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: largura, height: 800 });
    await page.goto('/plataforma/');
    const telas = await page.locator('.sidebar .side-links a').evaluateAll((links) =>
      [...new Set(links.map((a) => new URL((a as HTMLAnchorElement).href).pathname))].filter((p) => p.startsWith('/plataforma/')));
    expect(telas.length).toBeGreaterThan(10);
    telas.push('/plataforma/', '/plataforma/documentos-projeto/', '/plataforma/documentos-projeto/projeto/P-900/');
    for (const expandido of [false, true]) {
      if (expandido) {
        await page.goto('/plataforma/');
        await page.locator('#sidebar-toggle').click();
        await expect(page.locator('#sidebar-toggle')).toHaveAttribute('aria-expanded', 'true');
      }
      for (const tela of telas) {
        await page.goto(tela);
        await expect(page.locator('#sidebar-toggle')).toHaveAttribute('aria-expanded', String(expandido));
        expect(await atrasDoMenu(page), `${tela} (${expandido ? 'expandido' : 'recolhido'}, ${largura}px)`).toEqual([]);
      }
    }
    await page.evaluate(() => localStorage.removeItem('govnexa-sidebar'));
  });
}
