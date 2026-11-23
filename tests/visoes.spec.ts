import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// E11 (áudios 01 e 31): menu nas três visões (Gerencial, Governança da execução e Convênios) e a tela Visão Convênios.
// A Captação usa as coletas públicas do repositório (Transferegov e CAUC): as conferências são relativas (cartão = linhas da tabela).
const CONVENIOS = '/plataforma/convenios/';
const VISOES = [
  { nome: 'Visão gerencial', links: ['/plataforma/', '/plataforma/projetos-carteira/', '/plataforma/gestao/', '/plataforma/gestao-licitacoes/', '/plataforma/projetos-kanban/', '/plataforma/projetos-gantt/'] },
  { nome: 'Governança da execução', links: ['/plataforma/gestao-equipe/', '/plataforma/projetos/', '/plataforma/projetos-cronogramas/', '/plataforma/projetos-parado/', '/plataforma/gestao-inconsistencias/', '/plataforma/projetos-pendencias/', '/plataforma/projetos-reuniao/', '/plataforma/projetos-sala/', '/plataforma/projetos-log/', '/plataforma/gestao-alertas/', '/plataforma/projetos-sei/'] },
  { nome: 'Convênios', links: ['/plataforma/convenios/', '/plataforma/captacao/', '/plataforma/captacao-acompanhamento/', '/plataforma/captacao-alertas/', '/plataforma/captacao-oportunidades/', '/plataforma/captacao-projetos/', '/plataforma/captacao-comparativo/', '/plataforma/captacao-qualidade/'] },
];
const semRolagem = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
// Só as células do corpo: no celular o cabeçalho fica escondido para leitor de tela (1 px), de propósito.
const celulasEstouradas = (page: Page) => page.locator('[data-cv] tbody th, [data-cv] tbody td').evaluateAll((cs) =>
  cs.filter((c) => (c as HTMLElement).offsetParent !== null && c.scrollWidth > c.clientWidth + 1).map((c) => c.textContent?.slice(0, 40)));

async function abrirMenu(page: Page) {
  const toggle = page.locator('#sidebar-toggle');
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
}

test('visões: o menu tem Gerencial, Governança da execução e Convênios, cada uma com as suas telas', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(CONVENIOS);
  await expect(page.locator('#side-module-rail .side-module-icon')).toHaveCount(5);
  const nomes = await page.locator('.side-links button[data-sec^="m:"] .side-sec-label').allTextContents();
  expect(nomes).toEqual(['Visão gerencial', 'Governança da execução', 'Convênios', 'Licitações', 'Conta']);
  for (const visao of VISOES) {
    const corpo = page.locator(`#${await page.locator(`.side-links button[data-sec="m:${visao.nome}"]`).getAttribute('aria-controls')}`);
    const hrefs = await corpo.locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    expect(hrefs, visao.nome).toEqual(visao.links);
    // Lista simples: sem subtítulos de grupo dentro da visão.
    await expect(corpo.locator('button[data-sec^="g:"]'), visao.nome).toHaveCount(0);
  }
  await expect(page.locator('.side-links a[href="/plataforma/"] .side-label')).toHaveText('Projetos prioritários');
  // A tela atual abre a sua visão e fica marcada.
  await abrirMenu(page);
  await expect(page.locator('.side-links button[data-sec="m:Convênios"]')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.side-links a[href="/plataforma/convenios/"]')).toHaveAttribute('aria-current', 'page');
  // O administrador vê as guias da equipe e Usuários.
  for (const href of ['/plataforma/gestao-equipe/', '/plataforma/gestao-inconsistencias/', '/plataforma/usuarios/']) await expect(page.locator(`.side-links a[href="${href}"]`)).toHaveCount(1);
  // Licitações (demonstrativo) continua com os grupos; Projetos prioritários saiu de lá.
  await expect(page.locator('.side-links button[data-sec="g:Licitações:Operação"]')).toHaveCount(1);
  await expect(page.locator('.side-links button[data-sec^="m:Projetos"], .side-links button[data-sec^="m:Gestão"], .side-links button[data-sec^="m:Captação"]')).toHaveCount(0);
});

test('visões: todos os endereços do menu e os antigos continuam abrindo', async ({ page, request }) => {
  await page.goto('/plataforma/projetos-carteira/');
  const hrefs = [...new Set(await page.locator('.side-links a').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? '')))];
  expect(hrefs.length).toBeGreaterThan(30);
  for (const href of hrefs) {
    const r = await request.get(href);
    expect(r.status(), href).toBe(200);
  }
  // Endereços antigos: a Visão por órgão leva à Carteira filtrada e o atalho antigo de localização leva à aba da ficha.
  const orgaos = await request.get('/plataforma/projetos-orgaos/?orgao=SMS', { maxRedirects: 0 });
  expect(orgaos.status()).toBe(302);
  expect(orgaos.headers().location).toContain('/plataforma/projetos-carteira/');
  await page.goto('/plataforma/projetos-localizacao/?id=P-905');
  await expect(page).toHaveURL(/\/plataforma\/projeto\/P-905\/\?aba=localizacao$/);
  await page.goto('/plataforma/gestao/');
  await expect(page.locator('h1')).toHaveText('Mapa e painel');
  await expect(page.locator('.side-links a[href="/plataforma/gestao/"]')).toHaveAttribute('aria-current', 'page');
  const gestao = await page.locator('.side-links button[data-sec="m:Visão gerencial"]').getAttribute('aria-controls');
  await expect(page.locator(`#${gestao} a[href="/plataforma/gestao/"]`)).toHaveCount(1);
});

test('visões: Visão Convênios mostra em execução, em risco e CAUC, e os números batem com as listas', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const resposta = await page.goto(CONVENIOS);
  expect(resposta?.status()).toBe(200);
  await expect(page.locator('h1')).toHaveText('Visão Convênios');
  await expect(page.locator('[data-cv-bloco]')).toHaveCount(3);
  for (const [bloco, titulo] of [['execucao', 'Convênios em execução'], ['risco', 'Convênios em risco'], ['cauc', 'Regularidade no CAUC']]) {
    await expect(page.locator(`[data-cv-bloco="${bloco}"] h2`)).toHaveText(titulo);
  }
  for (const bloco of ['execucao', 'risco'] as const) {
    const numero = Number((await page.locator(`[data-cv-cartao="${bloco}"] [data-cv-qtd]`).textContent())?.replace(/\D/g, ''));
    expect(numero, bloco).toBeGreaterThan(0);
    await expect(page.locator(`[data-cv-tabela="${bloco}"] tbody tr[data-cv-linha]`), bloco).toHaveCount(numero);
  }
  // Todo convênio em risco também está em execução, e a gravidade vem marcada.
  const execucao = await page.locator('[data-cv-tabela="execucao"] tbody tr').evaluateAll((trs) => trs.map((t) => (t as HTMLElement).dataset.convenio));
  const risco = await page.locator('[data-cv-tabela="risco"] tbody tr').evaluateAll((trs) => trs.map((t) => (t as HTMLElement).dataset.convenio));
  for (const nr of risco) expect(execucao).toContain(nr);
  await expect(page.locator('[data-cv-tabela="risco"] tbody tr:not([data-gravidade="vermelho"]):not([data-gravidade="amarelo"])')).toHaveCount(0);
  // CAUC: estado no cartão igual ao do bloco.
  const estado = await page.locator('[data-cv-estado]').textContent();
  expect(['Regular', 'Com pendência', 'Sem dado']).toContain(estado);
  await expect(page.locator('[data-cv-cauc-resumo] strong')).toHaveText(estado!);
  // O convênio abre o Acompanhamento com a busca pelo número.
  const primeiro = page.locator('[data-cv-tabela="execucao"] tbody tr').first();
  const nr = await primeiro.getAttribute('data-convenio');
  await expect(primeiro.locator('a')).toHaveAttribute('href', `/plataforma/captacao-acompanhamento/?q=${encodeURIComponent(nr!)}`);
  // O cartão leva ao bloco.
  await page.locator('[data-cv-cartao="cauc"]').click();
  await expect(page).toHaveURL(/#cv-cauc$/);
  await expect(page.locator('[data-cv-fonte]')).toContainText('Transferegov');
  await expect(page.locator('[data-cv-fonte]')).toContainText(/\d{2}\/\d{2}\/\d{4}/);
});

test('visões: Visão Convênios sem rolagem horizontal e sem texto estourando a célula em 1280 e 390 px', async ({ page }) => {
  for (const largura of [1280, 390]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.goto(CONVENIOS);
    expect(await semRolagem(page), `${largura}px`).toBeTruthy();
    expect(await celulasEstouradas(page), `${largura}px`).toEqual([]);
  }
  // No celular, cada convênio vira um bloco com os rótulos.
  await expect(page.locator('[data-cv-tabela="execucao"] thead')).toHaveCSS('position', 'absolute');
});

test('visões: Visão Convênios e o menu sem violação grave de acessibilidade nos dois temas (1280 e 390 px)', async ({ page }) => {
  for (const largura of [1280, 390]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.goto(CONVENIOS);
    if (largura === 1280) await abrirMenu(page);
    for (const tema of ['light', 'dark']) {
      await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, tema);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(r.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')), `${largura}px ${tema}: ${JSON.stringify(r.violations)}`).toEqual([]);
    }
  }
});
