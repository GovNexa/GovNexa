import { test, expect } from '@playwright/test';

// Cada página sai com um único documento: um doctype, um <main> e um rodapé.
// Protege contra o layout duplicado por um conflito de merge mal resolvido (17/11/2026).
for (const rota of ['/', '/sobre/', '/entrar/', '/plataforma/', '/plataforma/projetos-carteira/']) {
  test(`página única em ${rota}`, async ({ request }) => {
    const html = await (await request.get(rota)).text();
    expect(html.match(/<!doctype html>/gi)?.length).toBe(1);
    expect(html.match(/<main[\s>]/gi)?.length).toBe(1);
    expect(html.match(/<\/html>/gi)?.length).toBe(1);
  });
}
