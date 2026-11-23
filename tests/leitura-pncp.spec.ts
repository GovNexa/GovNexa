import { test, expect, request as pwRequest } from '@playwright/test';

// E14a: o perfil leitura (prefeito) vê o quadro "Dados do PNCP" e a lista de secretarias, sem nenhum botão ou formulário; as duas rotas recusam com 403.
// A contratação ligada é criada pelo servidor do administrador (mesmo banco local); a limpeza a remove no fim.
const PAINEL = '/plataforma/gestao-licitacoes/';
const PORTA_ADMIN = Number(process.env.PLAYWRIGHT_PORT || 4321);
const ADMIN = `http://127.0.0.1:${PORTA_ADMIN}`;

test('leitura: vê o quadro do PNCP e a lista de secretarias, sem controles; rotas recusam com 403', async ({ page, request, baseURL }) => {
  test.setTimeout(120_000);
  const admin = await pwRequest.newContext({ baseURL: ADMIN, extraHTTPHeaders: { origin: ADMIN } });
  let id: string | null = null;
  try {
    const nome = `E2E leitura PNCP ${Date.now()}`;
    const c = await admin.post(`${PAINEL}gravar/`, { data: { acao: 'criar', campos: { nome, etapa: 'finalizacao' } } });
    expect(c.status()).toBe(200);
    id = (await c.json()).id as string;
    const org = await admin.post(`${PAINEL}secretarias/gravar/`, { data: { acao: 'orgao_criar', cnpj: '90000001000129', nome: 'Secretaria Exemplo de Obras', sigla: 'SEINFRA' } });
    expect([200, 409]).toContain(org.status());
    const l = await admin.post(`${PAINEL}pncp/`, { data: { acao: 'vincular', id, cnpj: '90000001000129', ano: 2026, sequencial: 1 } });
    expect(l.status()).toBe(200);

    await page.goto(`${PAINEL}${id}/`);
    const quadro = page.locator('[data-pn]');
    await expect(quadro.getByRole('heading', { name: 'Dados do PNCP' })).toBeVisible();
    await expect(quadro.locator('[data-pn-itens]')).toContainText('Construtora Exemplo Alfa Ltda');
    await expect(quadro.locator('[data-pn-itens]')).toContainText(/R\$\s1\.380\.000,00/);
    await expect(quadro.getByRole('link', { name: 'Abrir no PNCP' }).first()).toBeVisible();
    await expect(quadro.locator('button, form, input, textarea, select')).toHaveCount(0);
    await expect(quadro.locator('[data-pn-historico]')).toBeVisible();

    await page.goto(`${PAINEL}secretarias/`);
    await expect(page.getByRole('heading', { name: 'Secretarias compradoras (PNCP)' })).toBeVisible();
    await expect(page.locator('[data-pn-orgao]', { hasText: '90.000.001/0001-29' })).toBeVisible();
    await expect(page.locator('[data-pn-secretarias] button, [data-pn-secretarias] form, [data-pn-secretarias] input')).toHaveCount(0);

    const origem = new URL(baseURL!).origin;
    const a = await request.post(`${PAINEL}pncp/`, { headers: { origin: origem }, data: { acao: 'atualizar', id } });
    expect(a.status()).toBe(403);
    const b = await request.post(`${PAINEL}secretarias/gravar/`, { headers: { origin: origem }, data: { acao: 'orgao_criar', cnpj: '90000002000173', nome: 'Outra' } });
    expect(b.status()).toBe(403);
  } finally {
    if (id) await admin.post(`${PAINEL}gravar/`, { data: { acao: 'remover', id, revisao: 0, motivo: 'limpeza do teste' } });
    await admin.dispose();
  }
});
