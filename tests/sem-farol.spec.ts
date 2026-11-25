import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// E19: o farol (vermelho/amarelo/verde) saiu de todo o sistema. Os fatos continuam em texto, com os dias.
const ROTAS = [
  '/', '/plataforma/', '/plataforma/gestao/', '/plataforma/gestao-equipe/', '/plataforma/gestao-alertas/', '/plataforma/projetos/',
  '/plataforma/projetos-carteira/', '/plataforma/projetos-kanban/', '/plataforma/projetos-reuniao/', '/plataforma/projetos-sala/',
  '/plataforma/sala-de-guerra/S-1/', '/plataforma/gestao-whatsapp/', '/plataforma/cronograma/C-exemplo-001/', '/plataforma/projeto/P-900/',
  '/plataforma/convenios/', '/plataforma/projetos-parado/', '/plataforma/projetos-sei/', '/plataforma/licitacoes-detalhe/',
];
const ROTAS_VISUAIS = [
  '/', '/plataforma/gestao-alertas/', '/plataforma/projetos-reuniao/', '/plataforma/sala-de-guerra/S-1/', '/plataforma/projetos-sala/',
  '/plataforma/gestao-whatsapp/', '/plataforma/gestao-equipe/', '/plataforma/projetos/', '/plataforma/cronograma/C-exemplo-001/',
];
const semRolagem = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

test('sem farol: nenhuma tela mostra a palavra, o selo ou a bolinha de cor', async ({ page }) => {
  for (const rota of ROTAS) {
    const resposta = await page.goto(rota);
    expect(resposta?.status(), rota).toBe(200);
    if (rota === '/plataforma/projetos-reuniao/') await expect(page.locator('.ru-item, [data-ru-vazio]:not([hidden])').first()).toBeVisible();
    expect(await page.locator('body').innerText(), rota).not.toMatch(/farol|sem[áa]foro/i);
    expect((await page.content()).toLowerCase(), rota).not.toContain('farol');
    await expect(page.locator('[class*="farol"], .cart-ponto'), rota).toHaveCount(0);
  }
});

test('sem farol: a central de alertas mostra Urgente e Atenção', async ({ page }) => {
  await page.goto('/plataforma/gestao-alertas/');
  const graus = await page.locator('.al-grav').allInnerTexts();
  expect(graus.length).toBeGreaterThan(0);
  for (const g of graus) expect(g.replace(/[●▲]/g, '').trim()).toMatch(/^(Urgente|Atenção)$/);
  const opcoes = await page.locator('#al-f-gravidade option').allInnerTexts();
  expect(opcoes.join(' ')).not.toMatch(/Vermelho|Amarelo/);
  expect(opcoes.join(' ')).toMatch(/Urgente/);
  expect(await page.locator('main').innerText()).not.toMatch(/vermelh|amarel/i);
});

test('sem farol: o WhatsApp não usa emoji de cor', async ({ page }) => {
  await page.goto('/plataforma/gestao-whatsapp/');
  const conversa = page.locator('[data-wa-conversa]');
  await expect(conversa.locator('.wa-balao').first()).toBeVisible();
  const texto = await conversa.innerText();
  expect(texto).not.toMatch(/🔴|🟡|🟢/);
});

test('sem farol: a sala de guerra mostra a situação em texto', async ({ page }) => {
  await page.goto('/plataforma/sala-de-guerra/S-1/');
  const situacao = page.locator('.sl-situacao').first();
  await expect(situacao).toContainText('Situação:');
  expect((await situacao.innerText()).replace('Situação:', '').trim().length).toBeGreaterThan(0);
});

test('sem farol: Projetos · Início conta no prazo, prazo próximo ou dado faltando e prazo vencido', async ({ page }) => {
  await page.goto('/plataforma/projetos/');
  const cabecalho = await page.locator('table thead').first().innerText();
  for (const t of ['No prazo', 'Prazo próximo ou dado faltando', 'Prazo vencido']) expect(cabecalho).toContain(t);
  expect(cabecalho).not.toMatch(/Verde|Amarelo|Vermelho/);
});

test('sem farol: sem rolagem horizontal e sem violação grave de acessibilidade, nos temas claro e escuro', async ({ page }) => {
  test.setTimeout(240000);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const rota of ROTAS_VISUAIS) {
      await page.goto(rota);
      expect(await semRolagem(page), `${rota} em ${width}px`).toBe(true);
      for (const tema of ['light', 'dark']) {
        await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, tema);
        await page.waitForTimeout(400); // espera a transição de cores do tema
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
        expect(r.violations.filter((v) => ['serious', 'critical'].includes(v.impact || '')), `${rota} ${width}px ${tema}: ${JSON.stringify(r.violations)}`).toEqual([]);
      }
    }
  }
});
