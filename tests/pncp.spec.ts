import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// E14a: secretarias compradoras e quadro "Dados do PNCP". O Worker local usa só as respostas fictícias (data/exemplo/pncp); nada chama o PNCP real.
// O modo simulado usa os limites reais (10 pedidos por minuto por pessoa): os testes rodam em sequência e esperam a janela quando preciso.
test.describe.configure({ mode: 'serial' });

const PAINEL = '/plataforma/gestao-licitacoes/';
const SECRETARIAS = '/plataforma/gestao-licitacoes/secretarias/';
const GRAVAR = '/plataforma/gestao-licitacoes/gravar/';
const CNPJ = '90.000.001/0001-29';
const controle = (seq: number) => `90000001000129-1-${String(seq).padStart(6, '0')}/2026`;
const origem = (baseURL: string | undefined) => new URL(baseURL ?? 'http://127.0.0.1:4470').origin;
const semRolagem = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

// Controle do limite por pessoa (10 por minuto): espera a janela antes de cada pedido ao PNCP.
const envios: number[] = [];
async function liberar(): Promise<void> {
  for (;;) {
    const agora = Date.now();
    while (envios.length && agora - envios[0]! > 62_000) envios.shift();
    if (envios.length < 9) { envios.push(agora); return; }
    await new Promise((ok) => setTimeout(ok, 1000));
  }
}

async function criar(request: APIRequestContext, baseURL: string | undefined, nome: string): Promise<string> {
  for (let i = 0; i < 4; i++) {
    const r = await request.post(GRAVAR, { headers: { origin: origem(baseURL) }, data: { acao: 'criar', campos: { nome, etapa: 'finalizacao' } } });
    if (r.status() === 429) { await new Promise((ok) => setTimeout(ok, 5000)); continue; }
    expect(r.status()).toBe(200);
    return (await r.json()).id as string;
  }
  throw new Error('Limite de gravações (429) persistente.');
}
/** Limpeza: remover a contratação desliga o vínculo (a mesma compra pode ser ligada de novo na próxima rodada). */
async function limpar(request: APIRequestContext, baseURL: string | undefined, id: string | null): Promise<void> {
  if (!id) return;
  for (let i = 0; i < 4; i++) {
    const r = await request.post(GRAVAR, { headers: { origin: origem(baseURL) }, data: { acao: 'remover', id, revisao: 0, motivo: 'limpeza do teste' } });
    if (r.status() !== 429) return;
    await new Promise((ok) => setTimeout(ok, 5000));
  }
}
const nome = (t: string) => `E2E PNCP ${t} ${Date.now()}`;

async function previa(page: Page, entrada: string): Promise<void> {
  await page.getByLabel('Número de controle ou link do PNCP').fill(entrada);
  await liberar();
  await page.getByRole('button', { name: 'Conferir no PNCP' }).click();
}
async function ligar(page: Page): Promise<void> {
  await liberar();
  await page.getByRole('button', { name: 'Ligar esta compra' }).click();
  await expect(page.locator('[data-pn-resumo]')).toBeVisible();
}
async function layoutOk(page: Page): Promise<void> {
  for (const tema of ['light', 'dark']) {
    for (const largura of [1280, 390]) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), tema);
      expect(await semRolagem(page), `${tema} ${largura}px`).toBe(true);
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

test('1. do zero: Gestão das licitações → Secretarias compradoras → cadastra (com Histórico e autor) → volta com os filtros', async ({ page }) => {
  await page.goto(`${PAINEL}?orgao=SME`);
  await page.getByRole('link', { name: 'Secretarias compradoras (PNCP)' }).click();
  await expect(page).toHaveURL(/\/secretarias\/\?volta=/);
  await expect(page.getByRole('heading', { name: 'Secretarias compradoras (PNCP)' })).toBeVisible();
  await page.locator('[data-pn-cadastro] summary').click();
  // o navegador confere o CNPJ na hora (o servidor decide)
  await page.locator('[data-pn-orgao-criar] input[name="cnpj"]').fill('90.000.001/0001-28');
  await page.locator('[data-pn-orgao-criar] input[name="nome"]').fill('Secretaria Exemplo de Obras');
  await page.locator('[data-pn-orgao-criar] button[type="submit"]').click();
  await expect(page.locator('[data-pn-msg]')).toContainText('CNPJ inválido');
  await page.locator('[data-pn-orgao-criar] input[name="cnpj"]').fill(CNPJ);
  await page.locator('[data-pn-orgao-criar] input[name="sigla"]').fill('SEINFRA');
  await page.locator('[data-pn-orgao-criar] button[type="submit"]').click();
  // se a secretaria já existir (repetição do servidor), aceita a mensagem de duplicidade
  await expect(page.locator('[data-pn-msg]')).toContainText(/Secretaria cadastrada\.|já está cadastrado/);
  await page.goto(page.url());
  const linha = page.locator('[data-pn-orgao]', { hasText: CNPJ });
  await expect(linha).toBeVisible();
  await expect(linha).toContainText('Ativa');
  await expect(linha).toContainText(/Cadastrada por dev@exemplo\.invalid em \d\d\/\d\d\/\d{4} \d\d:\d\d/);
  await linha.locator('[data-pn-historico-orgao] summary').click();
  await expect(linha.locator('[data-pn-historico-orgao]')).toContainText(/Secretaria cadastrada.*por dev@exemplo\.invalid/);
  await layoutOk(page);
  await page.locator('[data-voltar] a').first().click();
  await expect(page).toHaveURL(/gestao-licitacoes\/\?orgao=SME/);
});

test('2. ligar a seq 1 (obra), ver itens e vencedor, atualizar, lote da secretaria e desligar com motivo', async ({ page, request, baseURL }) => {
  test.setTimeout(240_000);
  const id = await criar(request, baseURL, nome('seq1'));
  try {
    page.on('dialog', (d) => { void d.accept(); });
    await page.goto(`${PAINEL}${id}/`);
    const quadro = page.locator('[data-pn]');
    await expect(quadro.getByRole('heading', { name: 'Dados do PNCP' })).toBeVisible();
    await expect(quadro).toContainText('Esta contratação ainda não está ligada ao PNCP.');
    await previa(page, controle(1));
    const area = page.locator('[data-pn-previa-area]');
    await expect(area).toBeVisible();
    await expect(area).toContainText('Obra ou serviço de engenharia');
    await expect(area).toContainText('Secretaria Exemplo de Obras');
    await expect(page.locator('[data-pn-previa-aviso-municipio]')).toBeHidden();
    await ligar(page);
    await expect(quadro.locator('[data-pn-controle]')).toHaveText(controle(1));
    await expect(quadro.getByRole('link', { name: 'Abrir no PNCP' }).first()).toHaveAttribute('href', 'https://pncp.gov.br/app/editais/90000001000129/2026/1');
    await expect(quadro.getByRole('link', { name: 'Abrir no PNCP' }).first()).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(quadro).toContainText(/Atualizado em \d\d\/\d\d\/\d{4} \d\d:\d\d/);
    const itens = quadro.locator('[data-pn-itens] tbody tr');
    await expect(itens).toHaveCount(1);
    await expect(itens.first()).toContainText('Homologado');
    await expect(itens.first()).toContainText('Construtora Exemplo Alfa Ltda');
    await expect(itens.first()).toContainText(/R\$\s1\.380\.000,00/);
    await expect(itens.first()).toContainText('Vencedor');
    await expect(quadro.locator('[data-pn-obra="sim"]')).toBeVisible();
    await expect(quadro.locator('[data-pn-sem-colocacao]')).toContainText('Colocação completa (2º, 3º…) não disponível no PNCP para esta compra.');
    await layoutOk(page);
    // atualizar logo em seguida: a trava de 10 minutos responde sem chamar o PNCP
    await liberar();
    await quadro.getByRole('button', { name: 'Atualizar agora' }).click();
    await expect(quadro.locator('[data-pn-msg]')).toContainText(/Dados atualizados há pouco\. Nova consulta liberada às \d\d:\d\d\./);
    // lote da secretaria
    await page.goto(SECRETARIAS);
    await liberar();
    await page.locator('[data-pn-orgao]', { hasText: CNPJ }).getByRole('button', { name: 'Atualizar agora as contratações desta secretaria' }).click();
    await expect(page.locator('[data-pn-msg]')).toContainText(/\d+ atualizadas, \d+ já estavam em dia, \d+ com falha\./);
    expect(await semRolagem(page)).toBe(true);
    // desligar com motivo
    await page.goto(`${PAINEL}${id}/`);
    await quadro.locator('[data-pn-desligar] summary').click();
    await quadro.locator('[data-pn-desligar-form] textarea[name="motivo"]').fill('Compra errada (teste)');
    await liberar();
    await quadro.locator('[data-pn-desligar-form] button[type="submit"]').click();
    await expect(quadro).toContainText('Esta contratação ainda não está ligada ao PNCP.');
    const historico = quadro.locator('[data-pn-historico] li');
    await expect(historico).toHaveCount(3);
    await expect(historico.nth(0)).toContainText('Desligada do PNCP');
    await expect(historico.nth(1)).toContainText('Dados atualizados'); // do mais novo ao mais antigo: no mesmo instante, a atualização fica acima da ligação
    await expect(historico.nth(2)).toContainText('Ligada ao PNCP');
    await expect(quadro.locator('[data-pn-historico]')).toContainText('dev@exemplo.invalid');
  } finally {
    await limpar(request, baseURL, id);
  }
});

test('3. seq 9 (papel A4): aviso de não identificada e Ligar só com a caixa marcada', async ({ page, request, baseURL }) => {
  test.setTimeout(180_000);
  const id = await criar(request, baseURL, nome('seq9'));
  try {
    await page.goto(`${PAINEL}${id}/`);
    await previa(page, controle(9));
    const area = page.locator('[data-pn-previa-area]');
    await expect(area).toContainText('Não identificada como obra ou serviço de engenharia');
    await expect(page.locator('[data-pn-previa-aviso]')).toContainText('não parece ser de obra ou serviço de engenharia');
    await expect(page.locator('[data-pn-previa-confirma]')).toBeVisible();
    // sem a caixa marcada: nenhum pedido sai
    await page.getByRole('button', { name: 'Ligar esta compra' }).click();
    await expect(page.locator('[data-pn-msg]')).toContainText('Marque');
    await expect(page.locator('[data-pn-resumo]')).toHaveCount(0);
    await page.locator('[data-pn-confirmo]').check();
    await ligar(page);
    await expect(page.locator('[data-pn-obra="nao_identificado"]')).toBeVisible();
  } finally {
    await limpar(request, baseURL, id);
  }
});

test('4. seq 5 (HTML no objeto): aparece como texto, nenhum img, nenhum diálogo; link de outro site recusado', async ({ page, request, baseURL }) => {
  test.setTimeout(180_000);
  const id = await criar(request, baseURL, nome('seq5'));
  const dialogos: string[] = [];
  page.on('dialog', (d) => { dialogos.push(d.message()); void d.dismiss(); });
  try {
    await page.goto(`${PAINEL}${id}/`);
    await previa(page, 'https://evil.example/app/editais/90000001000129/2026/5');
    await expect(page.locator('[data-pn-msg]')).toContainText('Cole o número de controle do PNCP');
    await previa(page, 'https://pncp.gov.br/app/editais/90000001000129/2026/5');
    await expect(page.locator('[data-pn-previa-area]')).toContainText('<img src=x onerror=alert(1)>');
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    await ligar(page);
    await expect(page.locator('[data-pn-retrato]')).toContainText('<img src=x onerror=alert(1)> Obra de drenagem exemplo');
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    expect(dialogos).toEqual([]);
  } finally {
    await limpar(request, baseURL, id);
  }
});

test('5. seq 2 (registro de preços): 1º a 4º colocados e nenhum CPF na página', async ({ page, request, baseURL }) => {
  test.setTimeout(180_000);
  const id = await criar(request, baseURL, nome('seq2'));
  try {
    await page.goto(`${PAINEL}${id}/`);
    await previa(page, controle(2));
    await expect(page.locator('[data-pn-previa-area]')).toBeVisible();
    await ligar(page);
    const resultados = page.locator('[data-pn-resultado]');
    await expect(resultados).toHaveCount(4);
    for (const [i, ordem] of ['1º', '2º', '3º', '4º'].entries()) await expect(resultados.nth(i)).toContainText(ordem);
    await expect(resultados.nth(0)).toContainText('Engenharia Exemplo Beta Ltda');
    await expect(resultados.nth(0)).toContainText('CNPJ 90.000.002/0001-73');
    await expect(page.locator('[data-pn-sem-colocacao]')).toHaveCount(0);
    const html = await page.content();
    for (const cpf of ['00000000191', '000.000.001-91']) expect(html).not.toContain(cpf);
    await expect(page.locator('body')).not.toContainText('CNPJ 000.000.001-91');
    await expect(resultados.nth(3)).toContainText('Fornecedor Exemplo MEI ***');
  } finally {
    await limpar(request, baseURL, id);
  }
});

test('6. seq 3 (outro município): aviso na prévia, sem exigir confirmação, e ligar funciona', async ({ page, request, baseURL }) => {
  test.setTimeout(180_000);
  const id = await criar(request, baseURL, nome('seq3'));
  try {
    await page.goto(`${PAINEL}${id}/`);
    await previa(page, controle(3));
    await expect(page.locator('[data-pn-previa-aviso-municipio]')).toContainText('outro município (código IBGE 5300108)');
    await expect(page.locator('[data-pn-previa-confirma]')).toBeHidden();
    await ligar(page);
    await expect(page.locator('[data-pn-itens]')).toContainText('Em andamento');
  } finally {
    await limpar(request, baseURL, id);
  }
});

test('7. PNCP com erro depois de um retrato bom: os dados ficam e o aviso da última tentativa aparece', async ({ page, request, baseURL }) => {
  test.setTimeout(180_000);
  const id = await criar(request, baseURL, nome('seq7'));
  try {
    // Semente local: vínculo à seq 7 já com um retrato bom e coleta antiga (a seq 7 do exemplo responde 500).
    mkdirSync('.tmp', { recursive: true });
    const sql = `INSERT INTO contratacao_pncp (prefeitura_id, id, contratacao_id, orgao_id, cnpj, ano, sequencial, numero_controle, modo, vinculado_por, vinculado_em, ultima_tentativa_em, ultima_coleta_em, ultimo_status)
SELECT prefeitura_id, 'V-e2e-${Date.now()}', '${id}', id, cnpj, 2026, 7, '${controle(7)}', 'manual', 'dev@exemplo.invalid', '2026-11-01T10:00:00.000Z', '2026-11-01T10:00:00.000Z', '2026-11-01T10:00:00.000Z', 'ok'
  FROM pncp_orgao WHERE prefeitura_id = 5208707 AND cnpj = '90000001000129' AND ativo = 1;
INSERT INTO pncp_compra (prefeitura_id, vinculo_id, situacao_id, situacao_nome, existe_resultado, srp, obra, objeto, itens_total, incompleto, coletado_em)
SELECT 5208707, id, 1, 'Divulgada no PNCP', 0, 0, 'sim', 'OBRA DE RETRATO ANTIGO EXEMPLO 000.000.001-91', 1, 0, '2026-11-01T10:00:00.000Z' FROM contratacao_pncp WHERE prefeitura_id = 5208707 AND contratacao_id = '${id}';
INSERT INTO pncp_item (prefeitura_id, vinculo_id, numero_item, descricao, situacao_id, situacao_nome, tem_resultado)
SELECT 5208707, id, 1, 'Item do retrato antigo', 1, 'Em andamento', 0 FROM contratacao_pncp WHERE prefeitura_id = 5208707 AND contratacao_id = '${id}';
`;
    const arquivo = resolve('.tmp', 'pw-e14a-seed.sql');
    writeFileSync(arquivo, sql, 'utf8');
    execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB_PREFEITURA_5208707', '--local', '--file', arquivo], {
      shell: true, stdio: 'pipe', env: { ...process.env, TMPDIR: resolve('.tmp'), WRANGLER_LOG_PATH: resolve('.tmp/wrangler-seed.log') },
    });
    await page.goto(`${PAINEL}${id}/`);
    await expect(page.locator('[data-pn-retrato]')).toContainText('OBRA DE RETRATO ANTIGO EXEMPLO ***');
    await liberar();
    await page.getByRole('button', { name: 'Atualizar agora' }).click();
    const aviso = page.locator('[data-pn-aviso-status]');
    await expect(aviso).toContainText(/Última tentativa em \d\d\/\d\d\/\d{4} \d\d:\d\d: O PNCP não respondeu\./);
    await expect(aviso).toContainText('Mostrando os dados de 01/11/2026 07:00.'); // 10:00Z = 07:00 em Brasília
    await expect(page.locator('[data-pn-retrato]')).toContainText('OBRA DE RETRATO ANTIGO EXEMPLO ***');
    await expect(page.locator('[data-pn-itens]')).toContainText('Item do retrato antigo');
    await expect(page.locator('[data-pn-historico]')).toContainText('Falha ao atualizar');
  } finally {
    await limpar(request, baseURL, id);
  }
});

test('8. remover pela tela uma contratação ligada: o vínculo cai (atualizar devolve 404)', async ({ page, request, baseURL }) => {
  test.setTimeout(180_000);
  const id = await criar(request, baseURL, nome('seq10'));
  page.on('dialog', (d) => { void d.accept(); });
  await page.goto(`${PAINEL}${id}/`);
  await previa(page, controle(10));
  await expect(page.locator('[data-pn-previa-area]')).toContainText('Obra ou serviço de engenharia');
  await ligar(page);
  await page.locator('[data-ct-remover] summary').click();
  await page.locator('[data-ct-form-remover] textarea[name="motivo"]').fill('Teste de remoção');
  await page.locator('[data-ct-form-remover] button[type="submit"]').click();
  await expect(page).toHaveURL(/gestao-licitacoes\/(\?|$)/);
  await liberar();
  const r = await request.post('/plataforma/gestao-licitacoes/pncp/', { headers: { origin: origem(baseURL) }, data: { acao: 'atualizar', id } });
  expect(r.status()).toBe(404);
});

/** Contraste (axe) nos dois temas, trocando pelo ícone do topo. Parte do tema escuro. */
async function contrasteNosDoisTemas(page: Page, rotulo: string): Promise<void> {
  const graves = async () => (await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()).violations.filter((v) => ['serious', 'critical'].includes(v.impact || ''));
  const botao = page.locator('.appbar [data-tema-alternar]');
  await page.evaluate(() => localStorage.setItem('govnexa-theme', 'dark'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await graves(), `${rotulo}: escuro`).toEqual([]);
  await botao.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await graves(), `${rotulo}: claro`).toEqual([]);
}

test('9. contraste (axe) nos dois temas: secretarias e quadro Dados do PNCP (prévia, aviso e selo de aviso)', async ({ page, request, baseURL }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(SECRETARIAS);
  await page.locator('[data-pn-historico-orgao] summary').first().click();
  await contrasteNosDoisTemas(page, 'secretarias');
  const id = await criar(request, baseURL, nome('contraste'));
  try {
    await page.goto(`${PAINEL}${id}/`);
    await previa(page, controle(9)); // não identificada: aviso e caixa de confirmação visíveis
    await expect(page.locator('[data-pn-previa-aviso]')).toBeVisible();
    // a prévia fica aberta enquanto o tema é trocado (a troca recarrega a página: refaz a prévia a cada tema)
    const graves = async () => (await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()).violations.filter((v) => ['serious', 'critical'].includes(v.impact || ''));
    await page.evaluate(() => localStorage.setItem('govnexa-theme', 'dark'));
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    expect(await graves(), 'prévia: escuro').toEqual([]);
    await page.locator('.appbar [data-tema-alternar]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('[data-pn-previa-aviso]')).toBeVisible();
    expect(await graves(), 'prévia: claro').toEqual([]);
    await page.locator('[data-pn-confirmo]').check();
    await ligar(page);
    await expect(page.locator('.pn-selo-aviso')).toBeVisible();
    await contrasteNosDoisTemas(page, 'quadro com selo de aviso');
    await expect(page.locator('.pn-selo-aviso')).toBeVisible();
  } finally {
    await limpar(request, baseURL, id);
  }
});
