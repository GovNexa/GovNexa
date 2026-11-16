import { test, expect } from '@playwright/test';

for (const [path, location] of [
 ['/sair', '/cdn-cgi/access/logout'], ['/sair/', '/cdn-cgi/access/logout'],
 ['/sair/x/', '/cdn-cgi/access/logout'],
 ['/api/logout', '/cdn-cgi/access/logout'], ['/api/logout/', '/cdn-cgi/access/logout'],
 ['/api/logout/x/', '/cdn-cgi/access/logout'], ['/api/x/', null], ['/api', null],
 ['/api/', null], ['/entrar', '/plataforma/'], ['/entrar/', '/plataforma/'], ['/entrar/x/', '/plataforma/'],
] as const) {
 test(`Rota especial ${path}`, async ({ request }) => {
  const response = await request.get(path, {maxRedirects:0});
  expect(response.status()).toBe(location ? 302 : 404);
  expect(response.headers().location ?? null).toBe(location);
  expect(response.headers()['cache-control']).toBe('private, no-store');
  expect(response.headers()['x-frame-options']).toBe('DENY');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
 });
}
