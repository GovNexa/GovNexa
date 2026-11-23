import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { SUBFLUXOS } from '../src/lib/govnexa/subfluxos.ts';

const TELA = '/plataforma/projetos-fluxo/';

const caixas = (pdf: string) => [...pdf.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
const paginas = (pdf: string) => [...pdf.matchAll(/\/Type\s*\/Page(?![s\w])/g)].length;

test('fluxo: na tela as partes de impressão não aparecem', async ({ page }) => {
  await page.goto(TELA);
  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('.fx-partes').first()).toBeHidden();
  await expect(page.locator('.fx-so-impressao-svg').first()).toBeHidden();
});

test('fluxo: a impressão sai em partes legíveis, em A4 paisagem', async ({ page }) => {
  await page.goto(TELA);
  await page.emulateMedia({ media: 'print' });
  const partes = page.locator('[data-fx-partes]');
  await expect(partes).toHaveCount(1);
  const n = Number(await partes.getAttribute('data-fx-partes'));
  expect(n, 'o fluxo de exemplo deve gerar 2 ou mais partes').toBeGreaterThanOrEqual(2);
  await expect(page.locator('.fx-parte')).toHaveCount(n);
  const escalaGeral = await page.locator('.fx-svg').first().evaluate((e) => e.getBoundingClientRect().width / 1000);
  for (let i = 1; i <= n; i++) {
    const parte = page.locator(`.fx-parte[data-fx-parte="${i}"]`);
    const svg = parte.locator('.fx-parte-svg');
    await expect(svg).toBeVisible();
    const lp = await parte.evaluate((e) => e.getBoundingClientRect().width);
    const ls = await svg.evaluate((e) => e.getBoundingClientRect().width);
    expect(ls, `parte ${i}`).toBeGreaterThanOrEqual(lp * 0.9);
    expect(ls / 1000, `escala da parte ${i}`).toBeGreaterThanOrEqual(escalaGeral * 1.3);
  }
  const pdfBuf = await page.pdf({ preferCSSPageSize: true });
  mkdirSync('.tmp', { recursive: true });
  writeFileSync('.tmp/fluxo-impressao-e17.pdf', pdfBuf);
  const pdf = pdfBuf.toString('latin1');
  expect(paginas(pdf)).toBeGreaterThanOrEqual(n + 1);
  const cx = caixas(pdf);
  expect(cx.length).toBeGreaterThan(0);
  for (const [largura, altura] of cx) expect(largura, `${largura}x${altura}`).toBeGreaterThan(altura);
});

test('fluxo detalhado: imprime sem erro', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(String(e)));
  await page.goto(`/plataforma/fluxo/${SUBFLUXOS[0].id}/`);
  await page.emulateMedia({ media: 'print' });
  const pdfBuf = await page.pdf({ preferCSSPageSize: true });
  expect(paginas(pdfBuf.toString('latin1'))).toBeGreaterThanOrEqual(1);
  expect(erros).toEqual([]);
});
