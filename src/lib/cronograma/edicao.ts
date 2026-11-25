// Edição do cronograma na tela (E13): normaliza o corpo do pedido e chama o repositório. Sem SQL aqui.
// A prefeitura e o autor vêm da sessão (nunca do corpo).
import { ID_FICHA } from '../carteira/ficha.ts';
import { texto } from '../carteira/cadastro.ts';
import type { RepositorioProjetos } from '../repositorio/tipos.ts';
import { usuarioPode, type Usuario } from '../usuarios/index.ts';
import { hojeEmBrasilia } from '../datas.ts';
import { CAMPOS_TAREFA, type DadosTarefa, type OperacaoCronograma } from './planejar.ts';
import { ACOES_ITEM, ehAcaoItem, type OperacaoItem } from './recursos.ts';
import { normalizarOperacaoItem } from './recursos-regras.ts';

export const LIMITE_CORPO_CRONOGRAMA = 16_384;
export const ID_CRONOGRAMA = /^C-[A-Za-z0-9_-]{1,80}$/;
export const ID_TAREFA = /^(T-[0-9a-f-]{36}|C-[A-Za-z0-9_-]{1,80}#\d{1,4})$/;
export interface ContextoCronograma { usuario: Usuario; repositorio: RepositorioProjetos }
export type ResultadoServico<T> = ({ ok: true } & T) | { ok: false; status: number; erro: string; erros?: string[]; existente?: string };

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const AUSENTE = 'Versão do cronograma ausente: recarregue a página e tente de novo.';
const ACOES = ['incluir_tarefa', 'editar_tarefa', 'trocar_responsavel', 'reordenar', 'remover_tarefa', ...ACOES_ITEM] as const;
const ROTULO_CAMPO: Record<string, string> = {
  nome: 'Nome', fase: 'Fase', duracao_prevista: 'Duração prevista', inicio_previsto: 'Início previsto', fim_previsto: 'Fim previsto', inicio_real: 'Início real', fim_real: 'Fim real',
};

export function podeEditarCronograma(c: ContextoCronograma): { ok: true } | { ok: false; status: number; erro: string } {
  if (!usuarioPode(c.usuario, 'editar_projeto')) return { ok: false, status: 403, erro: 'Seu perfil não permite alterar cronogramas.' };
  if (!c.repositorio.podeGravar || !c.repositorio.gravarCronograma || !c.repositorio.criarCronograma) return { ok: false, status: 503, erro: 'Gravação indisponível no momento.' };
  return { ok: true };
}

/** Data real no formato AAAA-MM-DD; vazio = null; outro valor = undefined (inválido). */
function dataIso(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? undefined : v;
}
function duracao(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === '') return null;
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 3650 ? v : undefined;
}

export function normalizarPedido(bruto: unknown): { ok: true; revisao: number; op: OperacaoCronograma | OperacaoItem } | { ok: false; erros: string[] } {
  if (!ehObjeto(bruto)) return { ok: false, erros: ['Pedido inválido.'] };
  const { revisao, acao } = bruto;
  if (typeof revisao !== 'number' || !Number.isSafeInteger(revisao) || revisao < 0) return { ok: false, erros: [AUSENTE] };
  if (typeof acao !== 'string' || !(ACOES as readonly string[]).includes(acao)) return { ok: false, erros: ['Ação inválida.'] };
  const erros: string[] = [];
  const data = (v: unknown, rotulo: string): string | null => {
    const r = dataIso(v);
    if (r === undefined) { erros.push(`${rotulo}: data inválida.`); return null; }
    return r;
  };
  const dur = (v: unknown): number | null => {
    const r = duracao(v);
    if (r === undefined) { erros.push('Duração prevista: valor inválido.'); return null; }
    return r;
  };
  const idTarefa = (v: unknown): string => {
    if (typeof v === 'string' && ID_TAREFA.test(v)) return v;
    erros.push('Tarefa inválida.');
    return '';
  };
  if (ehAcaoItem(acao)) {
    const opItem = normalizarOperacaoItem(acao, bruto, idTarefa, erros);
    return erros.length ? { ok: false, erros } : { ok: true, revisao, op: opItem };
  }
  let op: OperacaoCronograma | null = null;

  if (acao === 'incluir_tarefa') {
    const t = ehObjeto(bruto.tarefa) ? bruto.tarefa : {};
    const nome = texto(t.nome, 200);
    const fase = texto(t.fase, 80);
    if (!nome) erros.push('Nome: obrigatório.');
    if (!fase) erros.push('Fase: obrigatória.');
    const tarefa = {
      nome: nome ?? '', fase: fase ?? '', duracao_prevista: dur(t.duracao_prevista),
      inicio_previsto: data(t.inicio_previsto, 'Início previsto'), fim_previsto: data(t.fim_previsto, 'Fim previsto'),
      inicio_real: data(t.inicio_real, 'Início real'), fim_real: data(t.fim_real, 'Fim real'),
      responsavel: texto(t.responsavel, 120), unidade: texto(t.unidade, 80),
    };
    op = { acao, tarefa };
  } else if (acao === 'editar_tarefa') {
    const tarefa_id = idTarefa(bruto.tarefa_id);
    const enviados = ehObjeto(bruto.campos) ? bruto.campos : {};
    if (Object.hasOwn(enviados, 'responsavel') || Object.hasOwn(enviados, 'unidade')) erros.push('Para mudar o responsável ou a área, use Trocar responsável.');
    const campos: Partial<DadosTarefa> = {};
    for (const c of CAMPOS_TAREFA) {
      if (!Object.hasOwn(enviados, c)) continue;
      const v = enviados[c];
      if (c === 'nome' || c === 'fase') {
        const s = texto(v, c === 'nome' ? 200 : 80);
        if (!s) erros.push(`${ROTULO_CAMPO[c]}: ${c === 'nome' ? 'obrigatório' : 'obrigatória'}.`);
        else campos[c] = s;
      } else if (c === 'duracao_prevista') campos[c] = dur(v);
      else campos[c] = data(v, ROTULO_CAMPO[c]);
    }
    op = { acao, tarefa_id, campos };
  } else if (acao === 'trocar_responsavel') {
    const tarefa_id = idTarefa(bruto.tarefa_id);
    const desdeBruto = dataIso(bruto.desde);
    if (!desdeBruto) erros.push('Data da troca: data inválida.');
    op = {
      acao, tarefa_id, para_responsavel: texto(bruto.para_responsavel, 120), para_unidade: texto(bruto.para_unidade, 80),
      desde: desdeBruto ?? '', motivo: texto(bruto.motivo, 500, true),
    };
  } else if (acao === 'reordenar') {
    const ids = bruto.ids;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 500 || !ids.every((i) => typeof i === 'string' && ID_TAREFA.test(i))) erros.push('Lista de tarefas inválida.');
    op = { acao, ids: Array.isArray(ids) ? ids.filter((i): i is string => typeof i === 'string') : [] };
  } else {
    op = { acao: 'remover_tarefa', tarefa_id: idTarefa(bruto.tarefa_id), motivo: texto(bruto.motivo, 500, true) };
  }
  return erros.length || !op ? { ok: false, erros } : { ok: true, revisao, op };
}

export async function gravarCronograma(
  c: ContextoCronograma, cronogramaId: string, bruto: unknown, relogio?: { agora: string; hoje: string },
): Promise<ResultadoServico<{ mudou: boolean; revisao: number; tarefa_id?: string; item_id?: string }>> {
  const pode = podeEditarCronograma(c);
  if (!pode.ok) return pode;
  if (!ID_CRONOGRAMA.test(cronogramaId)) return { ok: false, status: 404, erro: 'Cronograma não encontrado.' };
  const n = normalizarPedido(bruto);
  if (!n.ok) return { ok: false, status: 400, erro: 'Pedido inválido.', erros: n.erros };
  const agora = relogio?.agora ?? new Date().toISOString();
  const hoje = relogio?.hoje ?? hojeEmBrasilia();
  if (ehAcaoItem(n.op.acao)) {
    if (!c.repositorio.gravarItemTarefa) return { ok: false, status: 503, erro: 'Gravação indisponível no momento.' };
    const ri = await c.repositorio.gravarItemTarefa(cronogramaId, n.revisao, n.op as OperacaoItem, { autor: c.usuario.email, agora });
    if (ri.ok) return { ok: true, mudou: ri.mudou, revisao: ri.revisao, ...(ri.item_id ? { item_id: ri.item_id } : {}) };
    if (ri.codigo === 'inexistente') return { ok: false, status: 404, erro: ri.erro };
    if (ri.codigo === 'conflito') return { ok: false, status: 409, erro: 'O cronograma foi alterado por outra pessoa. Recarregue a página e tente de novo.' };
    return { ok: false, status: 400, erro: ri.erro, erros: [ri.erro] };
  }
  const r = await c.repositorio.gravarCronograma!(cronogramaId, n.revisao, n.op as OperacaoCronograma, { autor: c.usuario.email, agora, hoje });
  if (r.ok) return { ok: true, mudou: r.mudou, revisao: r.revisao, ...(r.tarefa_id ? { tarefa_id: r.tarefa_id } : {}) };
  if (r.codigo === 'inexistente') return { ok: false, status: 404, erro: r.erro };
  if (r.codigo === 'conflito') return { ok: false, status: 409, erro: 'O cronograma foi alterado por outra pessoa. Recarregue a página e tente de novo.' };
  return { ok: false, status: 400, erro: r.erro, erros: [r.erro] };
}

export async function criarCronograma(c: ContextoCronograma, bruto: unknown, relogio?: { agora: string }): Promise<ResultadoServico<{ id: string }>> {
  const pode = podeEditarCronograma(c);
  if (!pode.ok) return pode;
  if (!ehObjeto(bruto)) return { ok: false, status: 400, erro: 'Pedido inválido.', erros: ['Pedido inválido.'] };
  const projetoId = bruto.projeto_id;
  if (typeof projetoId !== 'string' || !ID_FICHA.test(projetoId)) return { ok: false, status: 404, erro: 'Projeto não encontrado.' };
  let titulo = texto(bruto.titulo, 200);
  if (!titulo) {
    const projeto = await c.repositorio.obterProjeto(projetoId);
    if (!projeto) return { ok: false, status: 404, erro: 'Projeto não encontrado.' };
    titulo = texto(projeto.nome, 200) ?? projetoId;
  }
  const r = await c.repositorio.criarCronograma!({ projeto_id: projetoId, titulo }, { autor: c.usuario.email, agora: relogio?.agora ?? new Date().toISOString() });
  if (r.ok) return { ok: true, id: r.id };
  if (r.codigo === 'inexistente') return { ok: false, status: 404, erro: r.erro };
  return { ok: false, status: 409, erro: r.erro, ...(r.existente ? { existente: r.existente } : {}) };
}
