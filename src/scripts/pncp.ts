// PNCP (E14a), lado do navegador: prévia, ligar, atualizar e desligar na contratação; secretarias compradoras na tela própria.
// Todo texto vindo do servidor ou do PNCP entra na tela só por textContent (nunca como HTML). O servidor decide tudo; aqui só se confere o óbvio.
import { ROTULO_STATUS, cnpjValido, normalizarCnpj } from '../lib/pncp/regras.ts';

const ROTA_PNCP = '/plataforma/gestao-licitacoes/pncp/';
const ROTA_ORGAOS = '/plataforma/gestao-licitacoes/secretarias/gravar/';
const CHAVE_MSG = 'pn-msg-pendente';
const ERRO_REDE = 'Não foi possível concluir agora. Tente de novo.';
const ERRO_PNCP = 'O PNCP não respondeu agora. Tente de novo em alguns minutos.';
const CONTROLE = /^([0-9A-Z]{12}\d{2})-1-(\d{6})\/(\d{4})$/;

interface Resposta { ok?: boolean; erro?: string; [chave: string]: unknown }
type Retorno = { ok: true; r: Resposta } | { ok: false; erro: string };

async function enviar(rota: string, corpo: Record<string, unknown>): Promise<Retorno> {
  try {
    const resposta = await fetch(rota, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo),
      credentials: 'same-origin', redirect: 'manual',
    });
    if (resposta.type === 'opaqueredirect' || resposta.status === 401) return { ok: false, erro: 'Sua sessão terminou. Entre de novo e repita a ação.' };
    const r = await resposta.json().catch(() => null) as Resposta | null;
    const doServidor = typeof r?.erro === 'string' && r.erro ? r.erro : null;
    if (resposta.status === 403) return { ok: false, erro: doServidor ?? 'Seu perfil não permite esta ação.' };
    if (resposta.status === 404) return { ok: false, erro: doServidor ?? 'Não encontrado. Recarregue a página.' };
    if (resposta.status === 409) return { ok: false, erro: doServidor ?? 'Alterado por outra pessoa. Recarregue a página.' };
    if (resposta.status === 429) return { ok: false, erro: doServidor ?? 'Muitas consultas em pouco tempo. Espere um minuto e tente de novo.' };
    if (resposta.status === 502) return { ok: false, erro: doServidor ?? ERRO_PNCP };
    if (resposta.status === 400) return { ok: false, erro: doServidor ?? 'Pedido inválido.' };
    if (!resposta.ok || !r?.ok) return { ok: false, erro: doServidor ?? ERRO_REDE };
    return { ok: true, r };
  } catch {
    return { ok: false, erro: ERRO_REDE };
  }
}

function elementoMsg(raiz: HTMLElement): HTMLElement {
  let el = raiz.querySelector<HTMLElement>('[data-pn-msg]');
  if (!el) {
    el = document.createElement('p');
    el.className = 'ct-msg';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.dataset.pnMsg = '';
    raiz.prepend(el);
  }
  return el;
}
function mostrar(raiz: HTMLElement, texto: string): void {
  elementoMsg(raiz).textContent = texto;
}
function guardarMsg(texto: string): void {
  try { sessionStorage.setItem(CHAVE_MSG, texto); } catch { /* sem armazenamento: a mensagem some no recarregamento */ }
}
function lerMsg(): string | null {
  try {
    const t = sessionStorage.getItem(CHAVE_MSG);
    if (t === null) return null;
    sessionStorage.removeItem(CHAVE_MSG);
    return t;
  } catch { return null; }
}
/** Recarrega a mesma página mantendo `location.search` (preserva o `volta`) e mostra o aviso guardado. */
function recarregar(texto: string): void {
  guardarMsg(texto);
  location.reload();
}
/** Desabilita os botões durante o envio e reabilita no fim (evita clique duplo). */
async function travando<T>(botoes: Iterable<HTMLButtonElement>, fn: () => Promise<T>): Promise<T> {
  const lista = [...botoes];
  const antes = lista.map((b) => b.disabled);
  for (const b of lista) b.disabled = true;
  try { return await fn(); } finally { lista.forEach((b, i) => { b.disabled = antes[i]!; }); }
}
const texto = (v: unknown): string => (typeof v === 'string' ? v : '');
const reais = (c: unknown): string => (typeof c === 'number' ? (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—');

/** Texto do aviso depois de atualizar: a resposta do servidor, ou a frase padrão. */
function avisoAtualizacao(r: Resposta, padrao: string): string {
  const aviso = texto(r.aviso);
  const status = texto(r.status);
  if (status === 'erro' || status === 'nao_encontrado' || status === 'formato') return `${ROTULO_STATUS[status]}. Os dados anteriores continuam na tela.`;
  if (status === 'desligado') return 'Esta contratação foi desligada do PNCP.';
  return aviso || padrao;
}

function prepararContratacao(raiz: HTMLElement): void {
  const id = raiz.dataset.id ?? '';
  const form = raiz.querySelector<HTMLFormElement>('[data-pn-previa]');
  const area = raiz.querySelector<HTMLElement>('[data-pn-previa-area]');
  let trio: { cnpj: string; ano: number; sequencial: number } | null = null;

  const linha = (dl: HTMLElement, rotulo: string, valor: string): void => {
    const d = document.createElement('div');
    const dt = document.createElement('dt'); dt.textContent = rotulo;
    const dd = document.createElement('dd'); dd.textContent = valor || '—';
    d.append(dt, dd);
    dl.append(d);
  };
  const fecharPrevia = (): void => {
    trio = null;
    if (area) area.hidden = true;
    form?.reset();
    form?.querySelector<HTMLElement>('input')?.focus();
  };
  const mostrarPrevia = (p: Record<string, unknown>): boolean => {
    const m = CONTROLE.exec(texto(p.numero_controle));
    if (!area || !m) return false;
    trio = { cnpj: m[1]!, sequencial: Number(m[2]), ano: Number(m[3]) };
    const dl = area.querySelector<HTMLElement>('[data-pn-previa-dados]')!;
    dl.replaceChildren();
    linha(dl, 'Número de controle', texto(p.numero_controle));
    linha(dl, 'Secretaria', texto(p.orgao_nome));
    linha(dl, 'Objeto', texto(p.objeto));
    linha(dl, 'Processo', texto(p.processo));
    linha(dl, 'Nº da compra', texto(p.numero_compra));
    linha(dl, 'Modalidade', texto(p.modalidade));
    linha(dl, 'Situação', texto(p.situacao));
    linha(dl, 'Valor estimado', reais(p.valor_estimado));
    linha(dl, 'Classificação', texto(p.obra_rotulo));
    const naoObra = p.obra === 'nao_identificado';
    const aviso = area.querySelector<HTMLElement>('[data-pn-previa-aviso]')!;
    aviso.hidden = !naoObra;
    aviso.textContent = naoObra ? 'Atenção: esta compra não parece ser de obra ou serviço de engenharia. Confirme só se for a compra certa.' : '';
    const confirma = area.querySelector<HTMLElement>('[data-pn-previa-confirma]')!;
    confirma.hidden = !naoObra;
    const caixa = confirma.querySelector<HTMLInputElement>('input')!;
    caixa.checked = false;
    const avisoMun = area.querySelector<HTMLElement>('[data-pn-previa-aviso-municipio]')!;
    const mun = texto(p.aviso_municipio);
    avisoMun.hidden = mun === '';
    avisoMun.textContent = mun;
    area.hidden = false;
    return true;
  };

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const entrada = String(new FormData(form).get('entrada') ?? '').trim();
    if (!entrada) { mostrar(raiz, 'Cole o número de controle do PNCP ou o link da página da compra.'); return; }
    void travando(form.querySelectorAll('button'), async () => {
      if (area) area.hidden = true;
      const r = await enviar(ROTA_PNCP, { acao: 'previa', id, entrada });
      if (!r.ok) { mostrar(raiz, r.erro); return; }
      const p = r.r.previa as Record<string, unknown> | undefined;
      if (!p || !mostrarPrevia(p)) { mostrar(raiz, ERRO_PNCP); return; }
      mostrar(raiz, 'Confira os dados abaixo e ligue a compra.');
    });
  });
  raiz.querySelector<HTMLButtonElement>('[data-pn-cancelar]')?.addEventListener('click', fecharPrevia);
  raiz.querySelector<HTMLButtonElement>('[data-pn-ligar]')?.addEventListener('click', (e) => {
    const botao = e.currentTarget as HTMLButtonElement;
    if (!trio) return;
    const dados = trio;
    const confirma = area?.querySelector<HTMLElement>('[data-pn-previa-confirma]');
    const exige = !!confirma && !confirma.hidden;
    const marcada = !!confirma?.querySelector<HTMLInputElement>('input')?.checked;
    if (exige && !marcada) { mostrar(raiz, 'Marque "Confirmo que esta é a compra certa" para ligar esta compra.'); return; }
    const todos = [botao, ...(area?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    void travando(todos, async () => {
      const r = await enviar(ROTA_PNCP, { acao: 'vincular', id, ...dados, ...(exige ? { confirmo_nao_obra: true } : {}) });
      if (!r.ok) { mostrar(raiz, r.erro); return; }
      recarregar(avisoAtualizacao(r.r, 'Compra ligada ao PNCP e dados trazidos.'));
    });
  });
  raiz.querySelector<HTMLButtonElement>('[data-pn-atualizar]')?.addEventListener('click', (e) => {
    const botao = e.currentTarget as HTMLButtonElement;
    void travando([botao], async () => {
      const r = await enviar(ROTA_PNCP, { acao: 'atualizar', id });
      if (!r.ok) { mostrar(raiz, r.erro); return; }
      recarregar(avisoAtualizacao(r.r, 'Dados do PNCP atualizados.'));
    });
  });
  const desligar = raiz.querySelector<HTMLFormElement>('[data-pn-desligar-form]');
  desligar?.addEventListener('submit', (e) => {
    e.preventDefault();
    const motivo = String(new FormData(desligar).get('motivo') ?? '').trim();
    if (!motivo) { mostrar(raiz, 'Informe o motivo para desligar do PNCP.'); return; }
    if (!confirm('Desligar esta contratação do PNCP? O Histórico fica guardado.')) return;
    void travando(desligar.querySelectorAll('button'), async () => {
      const r = await enviar(ROTA_PNCP, { acao: 'desvincular', id, vinculo_id: desligar.dataset.vinculo ?? '', motivo });
      if (!r.ok) { mostrar(raiz, r.erro); return; }
      recarregar('Contratação desligada do PNCP.');
    });
  });
}

function prepararSecretarias(raiz: HTMLElement): void {
  const botoesTodos = (): HTMLButtonElement[] => [...raiz.querySelectorAll<HTMLButtonElement>('button')];
  for (const botao of raiz.querySelectorAll<HTMLButtonElement>('[data-pn-orgao-atualizar]')) {
    botao.addEventListener('click', () => {
      void travando(botoesTodos(), async () => {
        const r = await enviar(ROTA_PNCP, { acao: 'atualizar_orgao', orgao_id: botao.dataset.orgaoId ?? '' });
        if (!r.ok) { mostrar(raiz, r.erro); return; }
        const n = (v: unknown): number => (typeof v === 'number' ? v : 0);
        const restantes = n(r.r.restantes);
        mostrar(raiz, `${n(r.r.atualizadas)} atualizadas, ${n(r.r.recentes)} já estavam em dia, ${n(r.r.falhas)} com falha.${restantes > 0 ? ` Restam ${restantes} para o próximo clique.` : ''}`);
      });
    });
  }
  const criar = raiz.querySelector<HTMLFormElement>('[data-pn-orgao-criar]');
  criar?.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = new FormData(criar);
    const cnpj = String(d.get('cnpj') ?? '').trim();
    if (!cnpjValido(normalizarCnpj(cnpj) ?? '')) { mostrar(raiz, 'CNPJ inválido: confira os dígitos.'); return; }
    void travando(botoesTodos(), async () => {
      const r = await enviar(ROTA_ORGAOS, { acao: 'orgao_criar', cnpj, nome: String(d.get('nome') ?? ''), sigla: String(d.get('sigla') ?? '') });
      if (!r.ok) { mostrar(raiz, r.erro); return; }
      recarregar('Secretaria cadastrada.');
    });
  });
  for (const form of raiz.querySelectorAll<HTMLFormElement>('[data-pn-orgao-editar]')) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const d = new FormData(form);
      void travando(botoesTodos(), async () => {
        const r = await enviar(ROTA_ORGAOS, {
          acao: 'orgao_editar', orgao_id: form.dataset.orgaoId ?? '', revisao: Number(form.dataset.revisao), nome: String(d.get('nome') ?? ''), sigla: String(d.get('sigla') ?? ''),
        });
        if (!r.ok) { mostrar(raiz, r.erro); return; }
        recarregar(r.r.mudou === false ? 'Nada mudou.' : 'Secretaria atualizada.');
      });
    });
  }
  for (const form of raiz.querySelectorAll<HTMLFormElement>('[data-pn-orgao-ativo]')) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const acao = form.dataset.acao === 'orgao_reativar' ? 'orgao_reativar' : 'orgao_desativar';
      if (!form.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked) { mostrar(raiz, 'Marque a confirmação para continuar.'); return; }
      void travando(botoesTodos(), async () => {
        const r = await enviar(ROTA_ORGAOS, { acao, orgao_id: form.dataset.orgaoId ?? '', revisao: Number(form.dataset.revisao) });
        if (!r.ok) { mostrar(raiz, r.erro); return; }
        recarregar(acao === 'orgao_reativar' ? 'Secretaria reativada.' : 'Secretaria desativada.');
      });
    });
  }
}

function iniciar(): void {
  const pendente = lerMsg();
  for (const raiz of document.querySelectorAll<HTMLElement>('[data-pn]')) {
    if (raiz.dataset.pnPronto) continue;
    raiz.dataset.pnPronto = '1';
    if (pendente) mostrar(raiz, pendente);
    if (raiz.dataset.podeEditar === '1') prepararContratacao(raiz);
  }
  for (const raiz of document.querySelectorAll<HTMLElement>('[data-pn-secretarias]')) {
    if (raiz.dataset.pnPronto) continue;
    raiz.dataset.pnPronto = '1';
    if (pendente) mostrar(raiz, pendente);
    prepararSecretarias(raiz);
  }
}
iniciar();
document.addEventListener('astro:page-load', iniciar);
