// Gestão das licitações (E12), lado do navegador: edição em linha, cadastro, mudança de etapa, marcos e remoção.
// Todo texto vindo do banco entra na tela só por textContent (nunca como HTML). A gravação é uma única rota JSON.
import { hrefContratacao } from '../lib/contratacoes/navegacao.ts';
import {
  CAMPOS, ROTULO_AGUARDANDO, ROTULO_MARCO, ROTULO_MODALIDADE, centavosDeTexto, formatarCampo, hojeBrasilia, type CampoEditavel, type DefCampo,
} from '../lib/contratacoes/regras.ts';

const ROTA_GRAVAR = '/plataforma/gestao-licitacoes/gravar/';
const CHAVE_MSG = 'ct-msg-pendente';
const ERRO_REDE = 'Não foi possível salvar agora. Tente de novo.';
const OPCOES: Record<string, Record<string, string>> = { modalidade: ROTULO_MODALIDADE, marco: ROTULO_MARCO, aguardando: ROTULO_AGUARDANDO };
const DEF = new Map<string, DefCampo>(CAMPOS.map((d) => [d.campo, d]));

interface Resposta { ok?: boolean; erro?: string; erros?: string[]; id?: string; revisao?: number; mudou?: boolean; avisos?: string[] }
type Retorno = { ok: true; r: Resposta } | { ok: false; erro: string; lista: string[] };

async function enviar(corpo: Record<string, unknown>): Promise<Retorno> {
  try {
    const resposta = await fetch(ROTA_GRAVAR, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo),
      credentials: 'same-origin', redirect: 'manual',
    });
    if (resposta.type === 'opaqueredirect' || resposta.status === 401) return { ok: false, erro: 'Sua sessão terminou. Entre de novo e repita a alteração.', lista: [] };
    if (resposta.status === 409) return { ok: false, erro: 'Esta contratação foi alterada por outra pessoa. Recarregue a página para ver a versão atual; o que você digitou não foi salvo.', lista: [] };
    if (resposta.status === 403) return { ok: false, erro: 'Seu perfil não pode alterar contratações.', lista: [] };
    if (resposta.status === 404) return { ok: false, erro: 'Esta contratação ou marco não existe mais. Recarregue a página.', lista: [] };
    if (resposta.status === 429) return { ok: false, erro: 'Muitas ações em pouco tempo. Tente de novo em um minuto.', lista: [] };
    const r = await resposta.json().catch(() => null) as Resposta | null;
    if (resposta.status === 400) return { ok: false, erro: 'Não foi possível salvar. Corrija:', lista: r?.erros?.length ? r.erros : [r?.erro ?? 'Pedido inválido.'] };
    if (!resposta.ok || !r?.ok) return { ok: false, erro: ERRO_REDE, lista: [] };
    return { ok: true, r };
  } catch {
    return { ok: false, erro: ERRO_REDE, lista: [] };
  }
}

function elementoMsg(raiz: HTMLElement): HTMLElement {
  let el = raiz.querySelector<HTMLElement>('[data-ct-msg]');
  if (!el) {
    el = document.createElement('p');
    el.className = 'ct-msg';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.dataset.ctMsg = '';
    raiz.prepend(el);
  }
  return el;
}
function mostrar(raiz: HTMLElement, texto: string, lista: string[] = []): void {
  const el = elementoMsg(raiz);
  el.replaceChildren(document.createTextNode(texto));
  if (lista.length) {
    const ul = document.createElement('ul');
    for (const t of lista) { const li = document.createElement('li'); li.textContent = t; ul.append(li); }
    el.append(ul);
  }
}
function guardarMsg(texto: string, lista: string[]): void {
  try { sessionStorage.setItem(CHAVE_MSG, JSON.stringify({ texto, lista })); } catch { /* sem armazenamento: a mensagem some no recarregamento */ }
}
function lerMsg(): { texto: string; lista: string[] } | null {
  try {
    const bruto = sessionStorage.getItem(CHAVE_MSG);
    if (!bruto) return null;
    sessionStorage.removeItem(CHAVE_MSG);
    const m = JSON.parse(bruto) as { texto?: unknown; lista?: unknown };
    if (typeof m.texto !== 'string') return null;
    return { texto: m.texto, lista: Array.isArray(m.lista) ? m.lista.filter((x): x is string => typeof x === 'string') : [] };
  } catch { return null; }
}
const textoLimpo = (v: string): string | null => (v.trim() === '' ? null : v.trim());
const reaisTexto = (centavos: string): string =>
  centavos === '' ? '' : (Number(centavos) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function dadosDaLinha(raiz: HTMLElement, el: HTMLElement): { id: string; revisao: number; linha: HTMLElement } {
  const linha = el.closest<HTMLElement>('[data-ct-linha]') ?? raiz;
  return { id: linha.dataset.id ?? '', revisao: Number(linha.dataset.revisao), linha };
}

function criarControle(def: DefCampo, valorCru: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (def.tipo === 'longo') {
    const t = document.createElement('textarea');
    t.rows = 3; t.maxLength = def.max ?? 2000; t.value = valorCru;
    return t;
  }
  if (def.tipo === 'opcao') {
    const s = document.createElement('select');
    if (def.campo !== 'aguardando') { const o = document.createElement('option'); o.value = ''; o.textContent = '—'; s.append(o); }
    for (const [valor, rotulo] of Object.entries(OPCOES[def.campo] ?? {})) { const o = document.createElement('option'); o.value = valor; o.textContent = rotulo; s.append(o); }
    s.value = valorCru;
    return s;
  }
  const i = document.createElement('input');
  if (def.tipo === 'data') { i.type = 'date'; i.value = valorCru; }
  else if (def.tipo === 'inteiro') { i.type = 'number'; i.min = '1'; i.max = '99'; i.value = valorCru; }
  else if (def.tipo === 'moeda') { i.type = 'text'; i.inputMode = 'decimal'; i.value = reaisTexto(valorCru); }
  else { i.type = 'text'; i.maxLength = def.max ?? 200; i.value = valorCru; }
  return i;
}

function prepararEdicaoEmLinha(raiz: HTMLElement): void {
  for (const el of raiz.querySelectorAll<HTMLElement>('[data-ct-campo]')) {
    const def = DEF.get(el.dataset.ctCampo ?? '');
    if (!def || el.querySelector('.ct-editar')) continue;
    const nome = el.closest<HTMLElement>('[data-nome]')?.dataset.nome ?? '';
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'ct-editar';
    botao.textContent = '✎';
    botao.setAttribute('aria-label', `Editar ${def.rotulo} de ${nome}`);
    botao.addEventListener('click', () => abrirEditor(raiz, el, def, botao));
    el.append(botao);
  }
}

function abrirEditor(raiz: HTMLElement, el: HTMLElement, def: DefCampo, botao: HTMLButtonElement): void {
  if (el.querySelector('.ct-editor')) return;
  const alvo = el.querySelector<HTMLElement>('[data-ct-texto]');
  if (!alvo) return;
  const extras = [...el.querySelectorAll<HTMLElement>('[data-ct-extra]')];
  const controle = criarControle(def, el.dataset.valor ?? '');
  controle.setAttribute('aria-label', def.rotulo);
  const editor = document.createElement('div');
  editor.className = 'ct-editor';
  const botoes = document.createElement('div');
  botoes.className = 'ct-editor-botoes';
  const salvar = document.createElement('button');
  salvar.type = 'button'; salvar.className = 'primary'; salvar.textContent = 'Salvar';
  const cancelar = document.createElement('button');
  cancelar.type = 'button'; cancelar.textContent = 'Cancelar';
  botoes.append(salvar, cancelar);
  editor.append(controle, botoes);
  const esconder = (sim: boolean): void => { alvo.hidden = sim; botao.hidden = sim; for (const x of extras) x.hidden = sim; };
  const fechar = (): void => { editor.remove(); esconder(false); botao.focus(); };
  esconder(true);
  el.append(editor);
  controle.focus();

  const gravar = async (): Promise<void> => {
    let valor: string | number | null;
    const bruto = controle.value;
    if (def.tipo === 'moeda') {
      const c = centavosDeTexto(bruto);
      if (c === 'invalido') { mostrar(raiz, 'Valor inválido: use o formato 1.234,56.'); return; }
      valor = c;
    } else if (def.tipo === 'inteiro') {
      valor = bruto.trim() === '' ? null : Number(bruto);
    } else {
      valor = textoLimpo(bruto);
    }
    const { id, revisao, linha } = dadosDaLinha(raiz, el);
    salvar.disabled = true; cancelar.disabled = true;
    const r = await enviar({ acao: 'editar', id, revisao, campos: { [def.campo]: valor } });
    salvar.disabled = false; cancelar.disabled = false;
    if (!r.ok) { mostrar(raiz, r.erro, r.lista); return; }
    const avisos = r.r.avisos ?? [];
    if (raiz.hasAttribute('data-ct-pagina')) {
      guardarMsg('Salvo e registrado no Histórico.', avisos);
      location.reload();
      return;
    }
    if (typeof r.r.revisao === 'number') linha.dataset.revisao = String(r.r.revisao);
    el.dataset.valor = valor === null ? '' : String(valor);
    alvo.textContent = formatarCampo(def.campo as CampoEditavel, valor);
    for (const x of linha.querySelectorAll('[data-ct-extra]')) x.remove();
    fechar();
    mostrar(raiz, 'Salvo e registrado no Histórico.', avisos);
  };
  salvar.addEventListener('click', () => { void gravar(); });
  cancelar.addEventListener('click', fechar);
  controle.addEventListener('keydown', (e) => {
    const ev = e as KeyboardEvent;
    if (ev.key === 'Escape') { ev.preventDefault(); fechar(); }
    else if (ev.key === 'Enter' && !(controle instanceof HTMLTextAreaElement)) { ev.preventDefault(); void gravar(); }
  });
}

function prepararCadastro(raiz: HTMLElement): void {
  const form = raiz.querySelector<HTMLFormElement>('[data-ct-form-nova]');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dados = new FormData(form);
    const pegar = (k: string): string | null => textoLimpo(String(dados.get(k) ?? ''));
    const reais = centavosDeTexto(String(dados.get('valor_estimado') ?? ''));
    if (reais === 'invalido') { mostrar(raiz, 'Valor inválido: use o formato 1.234,56.'); return; }
    const campos = {
      nome: pegar('nome'), etapa: pegar('etapa'), etapa_desde: pegar('etapa_desde'), orgao: pegar('orgao'), projeto_id: pegar('projeto_id'),
      modalidade: pegar('modalidade'), valor_estimado: reais, objeto: pegar('objeto'),
    };
    const botao = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (botao) botao.disabled = true;
    const r = await enviar({ acao: 'criar', campos });
    if (botao) botao.disabled = false;
    if (!r.ok) { mostrar(raiz, r.erro, r.lista); return; }
    guardarMsg('Contratação cadastrada.', r.r.avisos ?? []);
    location.assign(hrefContratacao(r.r.id ?? '', raiz.dataset.volta));
  });
}

function prepararPagina(raiz: HTMLElement): void {
  const id = raiz.dataset.id ?? '';
  const revisao = (): number => Number(raiz.dataset.revisao);
  const mudarEtapa = async (para: string, data: string | null, motivo: string | null): Promise<void> => {
    const corpo: Record<string, unknown> = { acao: 'etapa', id, revisao: revisao(), de: raiz.dataset.etapa, para };
    if (data) corpo.data = data;
    if (motivo) corpo.motivo = motivo;
    const r = await enviar(corpo);
    if (!r.ok) { mostrar(raiz, r.erro, r.lista); return; }
    guardarMsg('Etapa alterada e registrada no Histórico.', r.r.avisos ?? []);
    location.reload();
  };
  raiz.querySelector<HTMLButtonElement>('[data-ct-avancar]')?.addEventListener('click', (e) => {
    const botao = e.currentTarget as HTMLButtonElement;
    botao.disabled = true;
    void mudarEtapa(botao.dataset.para ?? '', hojeBrasilia(), null).finally(() => { botao.disabled = false; });
  });
  const formEtapa = raiz.querySelector<HTMLFormElement>('[data-ct-etapa-form]');
  formEtapa?.addEventListener('submit', (e) => {
    e.preventDefault();
    const dados = new FormData(formEtapa);
    void mudarEtapa(String(dados.get('para') ?? ''), textoLimpo(String(dados.get('data') ?? '')), textoLimpo(String(dados.get('motivo') ?? '')));
  });
  const recarregarApos = async (corpo: Record<string, unknown>, texto: string): Promise<void> => {
    const r = await enviar(corpo);
    if (!r.ok) { mostrar(raiz, r.erro, r.lista); return; }
    guardarMsg(texto, r.r.avisos ?? []);
    location.reload();
  };
  const formMarco = raiz.querySelector<HTMLFormElement>('[data-ct-form-marco]');
  formMarco?.addEventListener('submit', (e) => {
    e.preventDefault();
    const dados = new FormData(formMarco);
    void recarregarApos({ acao: 'marco_criar', id, data: String(dados.get('data') ?? ''), descricao: String(dados.get('descricao') ?? '') }, 'Marco adicionado.');
  });
  for (const botao of raiz.querySelectorAll<HTMLButtonElement>('[data-ct-marco-acao]')) {
    botao.addEventListener('click', () => {
      const acao = botao.dataset.ctMarcoAcao ?? '';
      const marcoId = botao.closest<HTMLElement>('[data-marco-id]')?.dataset.marcoId ?? '';
      if (acao === 'marco_remover' && !confirm('Remover este marco?')) return;
      void recarregarApos({ acao, id, marco_id: marcoId }, acao === 'marco_remover' ? 'Marco removido.' : acao === 'marco_concluir' ? 'Marco concluído.' : 'Marco reaberto.');
    });
  }
  const formRemover = raiz.querySelector<HTMLFormElement>('[data-ct-form-remover]');
  formRemover?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const motivo = textoLimpo(String(new FormData(formRemover).get('motivo') ?? ''));
    if (!motivo) { mostrar(raiz, 'Informe o motivo da remoção.'); return; }
    if (!confirm('Remover esta contratação? Ela sai das listas; o Histórico fica guardado.')) return;
    const r = await enviar({ acao: 'remover', id, revisao: revisao(), motivo });
    if (!r.ok) { mostrar(raiz, r.erro, r.lista); return; }
    location.assign(document.querySelector<HTMLAnchorElement>('[data-ct-voltar]')?.getAttribute('href') ?? '/plataforma/gestao-licitacoes/');
  });
}

function iniciar(): void {
  for (const botao of document.querySelectorAll<HTMLElement>('[data-ct-imprimir]')) {
    if (botao.dataset.ctPronto) continue;
    botao.dataset.ctPronto = '1';
    botao.addEventListener('click', () => window.print());
  }
  for (const raiz of document.querySelectorAll<HTMLElement>('[data-ct][data-pode-editar="1"]')) {
    if (raiz.dataset.ctPronto) continue;
    raiz.dataset.ctPronto = '1';
    const pendente = lerMsg();
    if (pendente) mostrar(raiz, pendente.texto, pendente.lista);
    prepararEdicaoEmLinha(raiz);
    prepararCadastro(raiz);
    if (raiz.hasAttribute('data-ct-pagina')) prepararPagina(raiz);
  }
}
iniciar();
document.addEventListener('astro:page-load', iniciar);
