// Decide o que gravar numa mudança do cronograma, a partir do estado lido do banco (E13). Puro: sem SQL, sem relógio próprio.
import { dataBr } from '../datas.ts';
import { chaveNome } from './responsaveis.ts';
import type { TrocaResponsavel } from './tipos.ts';

export const MAX_TAREFAS = 500;
export interface DadosTarefa { nome: string; fase: string; duracao_prevista: number | null; inicio_previsto: string | null; fim_previsto: string | null; inicio_real: string | null; fim_real: string | null }
export type CampoTarefa = keyof DadosTarefa;
export const CAMPOS_TAREFA: readonly CampoTarefa[] = ['nome', 'fase', 'duracao_prevista', 'inicio_previsto', 'fim_previsto', 'inicio_real', 'fim_real'];
export type OperacaoCronograma =
  | { acao: 'incluir_tarefa'; tarefa: DadosTarefa & { responsavel: string | null; unidade: string | null } }
  | { acao: 'editar_tarefa'; tarefa_id: string; campos: Partial<DadosTarefa> }
  | { acao: 'trocar_responsavel'; tarefa_id: string; para_responsavel: string | null; para_unidade: string | null; desde: string; motivo: string | null }
  | { acao: 'reordenar'; ids: string[] }
  | { acao: 'remover_tarefa'; tarefa_id: string; motivo: string | null };
export interface TarefaAtual extends DadosTarefa { id: string; ordem: number; unidade: string | null; responsavel: string | null; ultima_troca: string | null; tem_trocas: boolean }
export interface EstadoCronograma { id: string; titulo: string; projeto_id: string | null; revisao: number; tarefas: TarefaAtual[] } // tarefas ativas, por ordem
export type TipoEventoCronograma = 'cronograma_criado' | 'tarefa_incluida' | 'tarefa_alterada' | 'responsavel_trocado' | 'tarefas_reordenadas' | 'tarefa_removida';
export interface PlanoGravacao {
  inserir?: TarefaAtual; // nova tarefa completa, já com id e ordem final
  atualizar?: { id: string; campos: Partial<DadosTarefa> }; // só os campos que mudaram
  remover?: { id: string; motivo: string | null };
  ordens: { id: string; ordem: number }[]; // ordem final de TODAS as ativas (inclusive a nova); [] se a ordem não muda
  troca?: TrocaResponsavel & { tarefa_id: string }; // grava a linha e atualiza responsavel/unidade da tarefa
  evento: { tipo: TipoEventoCronograma; descricao: string; motivo: string | null };
}
export interface ContextoPlano { autor: string; agora: string; hoje: string; novoId: () => string }
export type ResultadoPlano = { ok: true; plano: PlanoGravacao; tarefa_id?: string } | { ok: false; codigo: 'invalido' | 'inexistente' | 'sem_mudanca'; erro: string };

/** Fases na ordem da 1ª aparição; tarefas agrupadas por fase (estável dentro do grupo); devolve 1..n. */
export function normalizarOrdem(tarefas: { id: string; fase: string | null }[]): { id: string; ordem: number }[] {
  const grupos = new Map<string, string[]>();
  for (const t of tarefas) {
    const k = chaveNome(t.fase);
    grupos.set(k, [...(grupos.get(k) ?? []), t.id]);
  }
  return [...grupos.values()].flat().map((id, i) => ({ id, ordem: i + 1 }));
}

const falha = (codigo: 'invalido' | 'inexistente' | 'sem_mudanca', erro: string): ResultadoPlano => ({ ok: false, codigo, erro });

/**
 * Valida a tarefa resultante. Na edição (`antes` e `mudados` informados) só vale o que foi alterado e as relações que o
 * campo alterado afeta; dado antigo inválido que não foi tocado não impede, por exemplo, mudar só o nome (Delta 1, item 7).
 * Se uma relação afetada esbarra em dado antigo já inválido, a mensagem diz qual campo antigo corrigir.
 */
function validarTarefa(t: DadosTarefa, hoje: string, antes?: DadosTarefa, mudados?: readonly CampoTarefa[]): string | null {
  const m = (c: CampoTarefa): boolean => !mudados || mudados.includes(c);
  const relacao = (ini: 'inicio_previsto' | 'inicio_real', fim: 'fim_previsto' | 'fim_real', rotulo: string, padrao: string): string | null => {
    if (!(m(ini) || m(fim)) || !t[ini] || !t[fim] || t[fim]! >= t[ini]!) return null;
    const antigaInvalida = !!antes && !!antes[ini] && !!antes[fim] && antes[fim]! < antes[ini]!;
    if (antigaInvalida && !m(ini)) return `${rotulo} (dado antigo) está depois do fim informado: corrija o ${rotulo.toLowerCase()}.`;
    return padrao;
  };
  if (m('nome') && !t.nome.trim()) return 'Nome: obrigatório.';
  if (m('fase') && !t.fase.trim()) return 'Fase: obrigatória.';
  const r1 = relacao('inicio_previsto', 'fim_previsto', 'Início previsto', 'Fim previsto antes do início previsto.');
  if (r1) return r1;
  const r2 = relacao('inicio_real', 'fim_real', 'Início real', 'Fim real antes do início real.');
  if (r2) return r2;
  if ((m('fim_real') || m('inicio_real')) && t.fim_real && !t.inicio_real) return 'Informe o início real antes de concluir.';
  if (m('inicio_real') && t.inicio_real && t.inicio_real > hoje) return 'Início real no futuro.';
  if (m('fim_real') && t.fim_real && t.fim_real > hoje) return 'Fim real no futuro.';
  return null;
}

const dados = (t: DadosTarefa): DadosTarefa => ({
  nome: t.nome, fase: t.fase, duracao_prevista: t.duracao_prevista, inicio_previsto: t.inicio_previsto,
  fim_previsto: t.fim_previsto, inicio_real: t.inicio_real, fim_real: t.fim_real,
});
const limpar = (v: string | null | undefined): string | null => { const s = (v ?? '').trim(); return s ? s : null; };
const ROTULO: Record<CampoTarefa, string> = {
  nome: 'Nome', fase: 'Fase', duracao_prevista: 'Duração prevista (dias)', inicio_previsto: 'Início previsto',
  fim_previsto: 'Fim previsto', inicio_real: 'Início real', fim_real: 'Fim real',
};
const valorTexto = (c: CampoTarefa, v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  return c.startsWith('inicio_') || c.startsWith('fim_') ? dataBr(String(v)) : String(v);
};
const quem = (r: string | null, u: string | null): string => (r && u ? `${r} (${u})` : r ?? u ?? 'sem responsável');
const cortar = (s: string): string => (Array.from(s).length > 1000 ? Array.from(s).slice(0, 999).join('') + '…' : s);

/** Coloca a tarefa logo depois da última da mesma fase (fase nova = no fim) e renumera. */
function comTarefaNaFase<T extends { id: string; fase: string | null }>(outras: T[], nova: T): T[] {
  const k = chaveNome(nova.fase);
  let ultimo = -1;
  outras.forEach((t, i) => { if (chaveNome(t.fase) === k) ultimo = i; });
  const lista = [...outras];
  lista.splice(ultimo >= 0 ? ultimo + 1 : lista.length, 0, nova);
  return lista;
}

export function planejar(estado: EstadoCronograma, op: OperacaoCronograma, ctx: ContextoPlano): ResultadoPlano {
  const T = `«${estado.titulo}»`;
  const achar = (id: string): TarefaAtual | undefined => estado.tarefas.find((t) => t.id === id);
  const NAO = 'Tarefa não encontrada.';

  if (op.acao === 'incluir_tarefa') {
    if (estado.tarefas.length >= MAX_TAREFAS) return falha('invalido', 'Limite de 500 tarefas por cronograma.');
    const d: DadosTarefa = { ...dados(op.tarefa), nome: op.tarefa.nome.trim(), fase: op.tarefa.fase.trim() };
    const erro = validarTarefa(d, ctx.hoje);
    if (erro) return falha('invalido', erro);
    const id = 'T-' + ctx.novoId();
    const responsavel = limpar(op.tarefa.responsavel);
    const unidade = limpar(op.tarefa.unidade);
    const ordens = normalizarOrdem(comTarefaNaFase(estado.tarefas.map((t) => ({ id: t.id, fase: t.fase })), { id, fase: d.fase }));
    const nova: TarefaAtual = { ...d, id, ordem: ordens.find((o) => o.id === id)!.ordem, unidade, responsavel, ultima_troca: null, tem_trocas: false };
    const plano: PlanoGravacao = {
      inserir: nova, ordens,
      evento: {
        tipo: 'tarefa_incluida', motivo: null,
        descricao: cortar(`Cronograma ${T}: tarefa «${d.nome}» incluída na fase «${d.fase}»${responsavel || unidade ? `, com ${quem(responsavel, unidade)}` : ''}.`),
      },
    };
    if (responsavel || unidade) {
      plano.troca = {
        id: ctx.novoId(), tarefa_id: id, tipo: 'inicial', de_responsavel: null, de_unidade: null,
        para_responsavel: responsavel, para_unidade: unidade,
        desde: d.inicio_real && d.inicio_real < ctx.hoje ? d.inicio_real : ctx.hoje,
        motivo: null, registrado_por: ctx.autor, registrado_em: ctx.agora,
      };
    }
    return { ok: true, plano, tarefa_id: id };
  }

  if (op.acao === 'reordenar') {
    const atuais = estado.tarefas.map((t) => t.id);
    const unicos = new Set(op.ids);
    if (op.ids.length !== atuais.length || unicos.size !== op.ids.length || !atuais.every((id) => unicos.has(id))) {
      return falha('invalido', 'A lista de tarefas mudou. Recarregue a página e tente de novo.');
    }
    const porId = new Map(estado.tarefas.map((t) => [t.id, t]));
    const ordens = normalizarOrdem(op.ids.map((id) => ({ id, fase: porId.get(id)!.fase })));
    if (ordens.every((o) => porId.get(o.id)!.ordem === o.ordem)) return falha('sem_mudanca', 'Nada mudou.');
    return { ok: true, plano: { ordens, evento: { tipo: 'tarefas_reordenadas', motivo: null, descricao: cortar(`Cronograma ${T}: ordem das tarefas alterada.`) } } };
  }

  const atual = achar(op.tarefa_id);
  if (!atual) return falha('inexistente', NAO);

  if (op.acao === 'remover_tarefa') {
    const restantes = estado.tarefas.filter((t) => t.id !== atual.id).map((t) => ({ id: t.id, fase: t.fase }));
    return {
      ok: true, tarefa_id: atual.id,
      plano: {
        remover: { id: atual.id, motivo: op.motivo }, ordens: normalizarOrdem(restantes),
        evento: { tipo: 'tarefa_removida', motivo: op.motivo, descricao: cortar(`Cronograma ${T}: tarefa «${atual.nome}» removida.`) },
      },
    };
  }

  if (op.acao === 'trocar_responsavel') {
    if (atual.fim_real) return falha('invalido', 'Tarefa concluída: apague o fim real para reabrir antes de trocar o responsável.');
    if (op.desde > ctx.hoje) return falha('invalido', 'A data da troca não pode ser no futuro.');
    if (op.desde < '2000-01-01') return falha('invalido', 'Data da troca inválida.');
    if (atual.inicio_real && op.desde < atual.inicio_real) return falha('invalido', `A data da troca não pode ser antes do início real da tarefa (${dataBr(atual.inicio_real)}).`);
    if (atual.ultima_troca && op.desde < atual.ultima_troca) return falha('invalido', `A data da troca não pode ser antes da última troca (${dataBr(atual.ultima_troca)}).`);
    const para_responsavel = limpar(op.para_responsavel);
    const para_unidade = limpar(op.para_unidade);
    if (!para_responsavel && !para_unidade) return falha('invalido', 'Informe o responsável ou a área.');
    if (chaveNome(para_responsavel) === chaveNome(atual.responsavel) && chaveNome(para_unidade) === chaveNome(atual.unidade)) {
      return falha('invalido', 'O responsável e a área informados já são os atuais.');
    }
    const inicial = !atual.tem_trocas && atual.responsavel == null && atual.unidade == null;
    return {
      ok: true, tarefa_id: atual.id,
      plano: {
        ordens: [],
        troca: {
          id: ctx.novoId(), tarefa_id: atual.id, tipo: inicial ? 'inicial' : 'troca',
          de_responsavel: inicial ? null : atual.responsavel, de_unidade: inicial ? null : atual.unidade,
          para_responsavel, para_unidade, desde: op.desde, motivo: op.motivo, registrado_por: ctx.autor, registrado_em: ctx.agora,
        },
        evento: {
          tipo: 'responsavel_trocado', motivo: op.motivo,
          descricao: cortar(`Cronograma ${T}: tarefa «${atual.nome}» passou de ${quem(atual.responsavel, atual.unidade)} para ${quem(para_responsavel, para_unidade)} a partir de ${dataBr(op.desde)}.`),
        },
      },
    };
  }

  // editar_tarefa
  const antes = dados(atual);
  const depois: DadosTarefa = { ...antes };
  for (const c of CAMPOS_TAREFA) {
    if (!Object.hasOwn(op.campos, c)) continue;
    const v = op.campos[c];
    (depois as unknown as Record<string, unknown>)[c] = c === 'nome' || c === 'fase' ? String(v ?? '').trim() : v ?? null;
  }
  const mudados = CAMPOS_TAREFA.filter((c) => depois[c] !== antes[c]);
  if (mudados.length === 0) return falha('sem_mudanca', 'Nada mudou.');
  const erro = validarTarefa(depois, ctx.hoje, antes, mudados);
  if (erro) return falha('invalido', erro);
  if (mudados.includes('fim_real') && depois.fim_real && atual.ultima_troca && atual.ultima_troca > depois.fim_real) {
    return falha('invalido', `O fim real não pode ser antes da última troca de responsável (${dataBr(atual.ultima_troca)}).`);
  }
  const campos: Partial<DadosTarefa> = {};
  for (const c of mudados) (campos as Record<string, unknown>)[c] = depois[c];
  let ordens: { id: string; ordem: number }[] = [];
  if (mudados.includes('fase')) {
    const outras = estado.tarefas.filter((t) => t.id !== atual.id).map((t) => ({ id: t.id, fase: t.fase }));
    ordens = normalizarOrdem(comTarefaNaFase(outras, { id: atual.id, fase: depois.fase }));
  }
  let descricao = `Cronograma ${T}: tarefa «${atual.nome}» alterada · ${mudados.map((c) => `${ROTULO[c]}: ${valorTexto(c, antes[c])} → ${valorTexto(c, depois[c])}`).join('; ')}`;
  if (mudados.includes('fim_real')) descricao += !antes.fim_real && depois.fim_real ? ' (tarefa concluída)' : antes.fim_real && !depois.fim_real ? ' (tarefa reaberta)' : '';
  return { ok: true, tarefa_id: atual.id, plano: { atualizar: { id: atual.id, campos }, ordens, evento: { tipo: 'tarefa_alterada', motivo: null, descricao: cortar(descricao) } } };
}
