// Mudança de macroetapa gravando no banco (E7/B3): Kanban e Pendências de etapa. A prefeitura e o autor vêm da sessão.
// A regra (portão, motivo, forçar) é a mesma de sempre: `aplicarEvento`, dentro de `repositorio.moverProjeto`.
import { ID_PROJETO } from '../documentos/regras.ts';
import type { PedidoMovimento, RepositorioProjetos } from '../repositorio/tipos.ts';
import { usuarioPode, type Usuario } from '../usuarios/index.ts';
import { texto } from './cadastro.ts';
import { saidaDoMarco } from './kanban.ts';
import { MACROETAPAS } from './macroetapas.ts';
import type { CodigoMacroetapa } from './tipos.ts';

export interface ContextoMover { usuario: Usuario | null | undefined; repositorio: RepositorioProjetos }
export type OrigemMover = PedidoMovimento['origem'];
export type ResultadoMover =
  | { ok: true; revisao: number; macroetapa: CodigoMacroetapa; saida: string | null; forcado: boolean }
  | { ok: false; status: number; erro: string; faltando?: string[]; forcavel?: boolean };

/** Corpo do pedido: poucos campos curtos; 4 KB sobram. */
export const LIMITE_CORPO_MOVER = 4_096;
export const MAX_MOTIVO = 500;
export const ORIGENS_MOVER: readonly OrigemMover[] = ['kanban', 'pendencia'];
const CODIGOS: readonly string[] = MACROETAPAS.map((m) => m.codigo);
const CHAVES = new Set(['revisao', 'de', 'para', 'motivo', 'forcar', 'origem']);

export const ERROS_MOVER = {
  perfil: 'Seu perfil não permite mover projetos.',
  perfilPendencia: 'Seu perfil não permite aprovar ou reprovar etapas.',
  indisponivel: 'Gravação indisponível no momento.',
  invalido: 'Pedido de mudança inválido.',
  inexistente: 'Projeto não encontrado.',
  umaEtapa: 'Nas Pendências de etapa o projeto só avança ou volta uma etapa.',
  primeiraEtapa: 'Projeto sem etapa começa em 00 – Em estruturação.',
} as const;

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const falha = (status: number, erro: string, faltando?: string[], forcavel = false): ResultadoMover => ({
  ok: false, status, erro, ...(faltando?.length ? { faltando } : {}), ...(forcavel ? { forcavel: true } : {}),
});
/** Avançar (de uma etapa conhecida para outra mais adiante) aceita forçar com motivo; voltar e definir a primeira etapa só pedem motivo. */
const avanca = (de: CodigoMacroetapa | null, para: CodigoMacroetapa): boolean => de !== null && CODIGOS.indexOf(para) > CODIGOS.indexOf(de);

/** Perfil e banco. Sem origem: confere o mínimo da rota (antes de ler o corpo); com 'pendencia', exige também `aprovar_etapa`. */
export function podeMover(c: ContextoMover, origem?: OrigemMover): { ok: true } | { ok: false; status: number; erro: string } {
  if (!usuarioPode(c.usuario, 'editar_projeto')) return { ok: false, status: 403, erro: ERROS_MOVER.perfil };
  if (origem === 'pendencia' && !usuarioPode(c.usuario, 'aprovar_etapa')) return { ok: false, status: 403, erro: ERROS_MOVER.perfilPendencia };
  if (!c.repositorio.podeGravar || !c.repositorio.moverProjeto || !c.repositorio.listarRevisoes) return { ok: false, status: 503, erro: ERROS_MOVER.indisponivel };
  return { ok: true };
}

/** O que a tela mostra: 'ok' = botões de mover; 'perfil' = só consulta; 'indisponivel' = banco sem gravação. */
export function podeMoverNaTela(usuario: Usuario | null | undefined, repositorio: RepositorioProjetos, origem: OrigemMover): 'ok' | 'perfil' | 'indisponivel' {
  const r = podeMover({ usuario, repositorio }, origem);
  return r.ok ? 'ok' : r.status === 403 ? 'perfil' : 'indisponivel';
}

/** Valida o corpo JSON. Campo desconhecido, tipo errado ou etapa fora da lista = inválido. */
export function normalizarMovimento(bruto: unknown): { ok: true; pedido: PedidoMovimento } | { ok: false; erro: string } {
  if (!ehObjeto(bruto)) return { ok: false, erro: ERROS_MOVER.invalido };
  for (const k of Object.keys(bruto)) if (!CHAVES.has(k)) return { ok: false, erro: ERROS_MOVER.invalido };
  const { revisao, de, para, motivo, forcar, origem } = bruto;
  if (typeof revisao !== 'number' || !Number.isSafeInteger(revisao) || revisao < 0) return { ok: false, erro: 'Versão do projeto ausente: recarregue a página e tente de novo.' };
  if (!(de === null || (typeof de === 'string' && CODIGOS.includes(de)))) return { ok: false, erro: ERROS_MOVER.invalido };
  if (typeof para !== 'string' || !CODIGOS.includes(para)) return { ok: false, erro: 'Macroetapa inválida.' };
  if (motivo !== undefined && motivo !== null && typeof motivo !== 'string') return { ok: false, erro: ERROS_MOVER.invalido };
  if (typeof motivo === 'string' && Array.from(motivo.trim()).length > MAX_MOTIVO) return { ok: false, erro: `Motivo: até ${MAX_MOTIVO} caracteres.` };
  if (forcar !== undefined && typeof forcar !== 'boolean') return { ok: false, erro: ERROS_MOVER.invalido };
  if (typeof origem !== 'string' || !(ORIGENS_MOVER as readonly string[]).includes(origem)) return { ok: false, erro: ERROS_MOVER.invalido };
  return {
    ok: true,
    pedido: {
      revisao, de: de as CodigoMacroetapa | null, para: para as CodigoMacroetapa,
      motivo: texto(motivo, MAX_MOTIVO, true), forcar: forcar === true, origem: origem as OrigemMover,
    },
  };
}

const vizinha = (de: CodigoMacroetapa | null, para: CodigoMacroetapa): boolean => {
  if (de === null) return para === '00'; // primeira etapa: a regra exige motivo
  return Math.abs(CODIGOS.indexOf(para) - CODIGOS.indexOf(de)) === 1;
};

/** Conferências na ordem: perfil e banco; id; corpo; perfil da origem; uma etapa nas Pendências; gravação com revisão. */
export async function moverProjeto(c: ContextoMover, projetoId: string, bruto: unknown): Promise<ResultadoMover> {
  const base = podeMover(c);
  if (!base.ok) return base;
  if (!ID_PROJETO.test(projetoId)) return falha(404, ERROS_MOVER.inexistente);
  const n = normalizarMovimento(bruto);
  if (!n.ok) return falha(400, n.erro);
  const { pedido } = n;
  const daOrigem = podeMover(c, pedido.origem);
  if (!daOrigem.ok) return daOrigem;
  // Projeto sem etapa só entra em 00, também pelo Kanban: pular direto para Execução ou Conclusão driblaria o portão sem ficar registrado como forçado.
  if (pedido.de === null && pedido.para !== '00') return falha(400, ERROS_MOVER.primeiraEtapa);
  if (pedido.origem === 'pendencia' && !vizinha(pedido.de, pedido.para)) return falha(400, ERROS_MOVER.umaEtapa);
  const r = await c.repositorio.moverProjeto!(projetoId, pedido, c.usuario!.email);
  if (!r.ok) {
    if (r.codigo === 'inexistente') return falha(404, ERROS_MOVER.inexistente);
    if (r.codigo === 'conflito') return falha(409, r.erro);
    return falha(422, r.erro, r.faltando, avanca(pedido.de, pedido.para));
  }
  return { ok: true, revisao: r.revisao, macroetapa: pedido.para, saida: saidaDoMarco(r.projeto), forcado: r.forcado };
}
