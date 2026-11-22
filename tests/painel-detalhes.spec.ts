import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('painel de detalhes apresenta a carteira e permite navegar acessivelmente', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/plataforma/projetos-carteira/');

  // Abre o P-900 pelo código: outros testes podem cadastrar projetos (P-9xx) que entram antes na lista.
  const abrir = page.locator('tbody [data-row]').filter({ hasText: /\bP-900(?!\d)/ }).getByRole('button', { name: 'Ver detalhes' }).first();
  await abrir.click();
  const painel = page.getByRole('dialog');
  await expect(painel).toBeVisible();
  await expect(painel.locator('#record-code')).toHaveText('P-900');
  await expect(painel.getByRole('heading', { level: 2 })).toContainText('Unidade de Saúde Exemplo A');
  await expect(painel.locator('.rd-status')).toContainText('Vermelho');
  await expect(painel.locator('.rd-highlights .rd-highlight').first()).toContainText('Valor do projeto');
  await expect(painel.locator('.rd-definition').first()).toBeVisible();
  await expect(painel.locator('.rd-missing')).toContainText('Sem informação: Processos SEI');
  const datas = painel.locator('.rd-section').filter({ has: page.getByRole('heading', { name: 'Datas previstas' }) });
  await expect(datas.locator('.rd-timeline')).toBeVisible();
  const dataLonga = datas.locator('.rd-timeline-item').filter({ hasText: 'Fim de Preparatório para Contratação' });
  await expect(dataLonga.locator('.rd-timeline-date')).toHaveText('01/06/2026');
  const datasOrdenadas = await datas.locator('.rd-timeline-date').evaluateAll((elementos) =>
    elementos.map((elemento) => elemento.getAttribute('datetime')),
  );
  expect(datasOrdenadas).toEqual([...datasOrdenadas].sort());
  await expect(datas.locator('.rd-timeline-details .rd-definition').filter({ hasText: 'Execução' })).toContainText('180 dias');
  await expect(painel.locator('.rd-timeline-today')).toHaveText('Hoje');
  await expect(painel.locator('.rd-section').filter({ has: page.getByRole('heading', { name: 'Histórico' }) }).locator('.rd-history-item').first()).toBeVisible();
  await expect(painel.locator('.rd-section').filter({ has: page.getByRole('heading', { name: 'Histórico' }) }).locator('.rd-definitions')).toHaveCount(0);
  await expect(painel.getByRole('link', { name: 'Ficha completa do projeto' }))
    .toHaveAttribute('href', '/plataforma/projeto/P-900/');
  // Pedido do dono: os cinco botões de ação numa única linha.
  const topos = await painel.locator('.rd-actions a').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(topos).size).toBe(1);
  await expect(painel.locator('.rd-actions a')).toHaveText([
    'Ficha completa',
    'Cronograma',
    'Documentos',
    'Localização',
    'Histórico',
  ]);

  const titulo = painel.locator('#record-title');
  await expect(titulo).toBeFocused();
  await expect.poll(() => titulo.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('none');
  const cartoes = await painel.locator('.rd-highlight').evaluateAll((elementos) =>
    elementos.map((elemento) => {
      const { top, left, width } = elemento.getBoundingClientRect();
      return { top: Math.round(top), left, width };
    }),
  );
  expect(cartoes).toHaveLength(4);
  expect(new Set(cartoes.map((cartao) => cartao.top)).size).toBe(1);
  expect(cartoes[0].left).toBeLessThan(cartoes[1].left);
  const alinhamento = await painel.locator('.rd-section').evaluateAll((secoes) =>
    ['Pendências de dado', 'Origem do dado'].map((tituloSecao) => {
      const secao = secoes.find((elemento) => elemento.querySelector('h3')?.textContent === tituloSecao)!;
      const { left, width } = secao.getBoundingClientRect();
      return { left, width };
    }),
  );
  expect(Math.abs(alinhamento[0].left - alinhamento[1].left)).toBeLessThan(1);
  expect(Math.abs(alinhamento[0].width - alinhamento[1].width)).toBeLessThan(1);
  // "Registro anterior" só fica desativado quando o P-900 é a primeira linha visível.
  const primeiraLinha = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('tbody [data-row]')].find((linha) => !linha.hidden && linha.getClientRects().length > 0)?.textContent ?? '');
  if (/\bP-900(?!\d)/.test(primeiraLinha)) await expect(painel.getByRole('button', { name: 'Registro anterior' })).toBeDisabled();
  else await expect(painel.getByRole('button', { name: 'Registro anterior' })).toBeEnabled();
  await painel.getByRole('button', { name: 'Próximo registro' }).click();
  await expect(painel.locator('#record-code')).not.toHaveText('P-900');
  await page.keyboard.press('ArrowLeft');
  await expect(painel.locator('#record-code')).toHaveText('P-900');
  await page.keyboard.press('ArrowRight');
  await expect(painel.locator('#record-code')).not.toHaveText('P-900');
  await painel.getByRole('button', { name: 'Registro anterior' }).click();
  await expect(painel.locator('#record-code')).toHaveText('P-900');

  const rolagem = await page.evaluate(() => ({
    dialogo: getComputedStyle(document.querySelector('#record-dialog')!).overflowY,
    conteudo: getComputedStyle(document.querySelector('#record-content')!).overflowY,
    corpoMaior: document.querySelector('#record-content')!.scrollHeight > document.querySelector('#record-content')!.clientHeight,
  }));
  expect(rolagem.dialogo).toBe('hidden');
  expect(rolagem.conteudo).toBe('auto');
  expect(rolagem.corpoMaior).toBe(true);

  for (const tema of ['light', 'dark'] as const) {
    await page.evaluate((valor) => { document.documentElement.dataset.theme = valor; }, tema);
    const a11y = await new AxeBuilder({ page }).include('#record-dialog').analyze();
    expect(a11y.violations.filter((violacao) => ['serious', 'critical'].includes(violacao.impact ?? '')), tema).toEqual([]);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const cartoesCelular = await painel.locator('.rd-highlight').evaluateAll((elementos) =>
    elementos.map((elemento) => Math.round(elemento.getBoundingClientRect().top)),
  );
  expect(cartoesCelular).toHaveLength(4);
  expect(cartoesCelular[0]).toBe(cartoesCelular[1]);
  expect(cartoesCelular[2]).toBe(cartoesCelular[3]);
  expect(cartoesCelular[0]).toBeLessThan(cartoesCelular[2]);
  await page.keyboard.press('Escape');
  await expect(painel).toBeHidden();
  await expect(abrir).toBeFocused();
});

test('painel de detalhes mantém fallback de tabelas sem dados detalhados', async ({ page }) => {
  await page.goto('/plataforma/atas/');
  await page.getByRole('button', { name: 'Ver detalhes' }).first().click();

  const painel = page.getByRole('dialog');
  await expect(painel).toBeVisible();
  await expect(painel.locator('#record-code')).toHaveText('ARP 001/2026');
  await expect(painel.getByRole('heading', { level: 2 })).toHaveText('PE 045/2026 – SME');
  await expect(painel.getByRole('heading', { level: 3, name: 'Dados' })).toBeVisible();
  await expect(painel.locator('.rd-definition').filter({ hasText: 'Valor unitário' })).toContainText(/R\$\s*42,50/);
  await expect(painel.locator('.rd-definition').filter({ hasText: 'Valor total' })).toContainText(/R\$\s*4\.250,00/);
});
