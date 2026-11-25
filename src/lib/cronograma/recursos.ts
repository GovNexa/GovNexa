// Envolvidos e recursos da tarefa (E20, áudio 31): tipos e funções puras. Seguro para o navegador (só importa tipos).
// Valores sempre em inteiros (centavos / centésimos) e somas em bigint; nunca float, toFixed ou toLocaleString.

export const TIPOS_RECURSO = ['humano', 'material', 'financeiro'] as const;
export type TipoRecurso = (typeof TIPOS_RECURSO)[number];
export const ROTULO_TIPO_RECURSO: Record<TipoRecurso, string> = { humano: 'Humano', material: 'Material ou equipamento', financeiro: 'Financeiro' };
export const ROTULO_TIPO_PLURAL: Record<TipoRecurso, [string, string]> = {
  humano: ['humano', 'humanos'], material: ['material ou equipamento', 'materiais ou equipamentos'], financeiro: ['financeiro', 'financeiros'],
};
export const MAX_ENVOLVIDOS_TAREFA = 50;
export const MAX_RECURSOS_TAREFA = 200;
export const TETO_VALOR_CENTAVOS = 1_000_000_000_000; // igual a MAX_VALOR_CENTAVOS da E12 (um teste confere)
export const TETO_QUANTIDADE_CENTESIMOS = 100_000_000_000; // 1 bilhão de unidades
export const ID_ENVOLVIDO = /^E-[0-9a-f-]{36}$/;
export const ID_RECURSO = /^R-[0-9a-f-]{36}$/;

export interface DadosEnvolvido { nome: string | null; area: string | null; papel: string | null; observacao: string | null }
export interface DadosRecurso {
  tipo: TipoRecurso; descricao: string; quantidade_centesimos: number | null; unidade: string | null;
  valor_estimado_centavos: number | null; valor_utilizado_centavos: number | null; data_uso: string | null; observacao: string | null;
}
interface Autoria { id: string; tarefa_id: string; criado_por: string; criado_em: string; atualizado_por: string | null; atualizado_em: string | null }
export type Envolvido = DadosEnvolvido & Autoria;
export type Recurso = DadosRecurso & Autoria;
/** Só itens ativos de tarefas ativas do cronograma. */
export interface ItensCronograma { envolvidos: Envolvido[]; recursos: Recurso[] }

export const ACOES_ITEM = ['incluir_envolvido', 'editar_envolvido', 'remover_envolvido', 'incluir_recurso', 'editar_recurso', 'remover_recurso'] as const;
export type AcaoItem = (typeof ACOES_ITEM)[number];
export type OperacaoItem =
  | { acao: 'incluir_envolvido'; tarefa_id: string; envolvido: DadosEnvolvido }
  | { acao: 'editar_envolvido'; tarefa_id: string; item_id: string; envolvido: DadosEnvolvido }
  | { acao: 'remover_envolvido'; tarefa_id: string; item_id: string; motivo: string | null }
  | { acao: 'incluir_recurso'; tarefa_id: string; recurso: DadosRecurso }
  | { acao: 'editar_recurso'; tarefa_id: string; item_id: string; recurso: DadosRecurso }
  | { acao: 'remover_recurso'; tarefa_id: string; item_id: string; motivo: string | null };
export const ehAcaoItem = (a: unknown): a is AcaoItem => typeof a === 'string' && (ACOES_ITEM as readonly string[]).includes(a);
export type TipoEventoItem = 'envolvido_incluido' | 'envolvido_alterado' | 'envolvido_removido' | 'recurso_incluido' | 'recurso_alterado' | 'recurso_removido';

const milhar = (digitos: string): string => digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Texto brasileiro ("1.234,56", "R$ 10", "2,5") para inteiro em centésimos. Vazio = null; formato ou faixa inválidos = 'invalido'. */
export function centesimosDeTexto(v: unknown, teto: number): number | null | 'invalido' {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string') return 'invalido';
  const limpo = v.replace(/R\$/gi, '').replace(/\s+/g, '');
  if (limpo === '') return null;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(limpo) && !/^\d+(,\d{1,2})?$/.test(limpo)) return 'invalido';
  const [parteInteira, parteFrac = ''] = limpo.split(',');
  const inteira = parteInteira.replace(/\./g, '');
  if (inteira.length > 15) return 'invalido';
  const frac = parteFrac.padEnd(2, '0');
  const total = BigInt(inteira) * 100n + BigInt(frac);
  if (total > BigInt(teto)) return 'invalido';
  const n = Number(total);
  return Number.isSafeInteger(n) ? n : 'invalido';
}

export function reaisDeCentavos(c: number | bigint | null | undefined): string {
  if (c === null || c === undefined) return '—';
  const t = BigInt(c);
  return `R$ ${milhar((t / 100n).toString())},${(t % 100n).toString().padStart(2, '0')}`;
}

export function valorEditavel(c: number | null): string {
  if (c === null) return '';
  const t = BigInt(c);
  return `${milhar((t / 100n).toString())},${(t % 100n).toString().padStart(2, '0')}`;
}

export function quantidadeTexto(c: number | null): string {
  if (c === null) return '';
  const t = BigInt(c);
  const frac = (t % 100n).toString().padStart(2, '0').replace(/0+$/, '');
  return milhar((t / 100n).toString()) + (frac ? `,${frac}` : '');
}

export function decimalCsv(c: number | bigint | null): string {
  if (c === null) return '';
  const t = BigInt(c);
  return `${(t / 100n).toString()},${(t % 100n).toString().padStart(2, '0')}`;
}

export function quemEnvolvido(e: { nome: string | null; area: string | null }): string {
  if (e.nome && e.area) return `${e.nome} (${e.area})`;
  return e.nome ?? e.area ?? '';
}

export const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`;

export interface ResumoTarefaItens { envolvidos: number; recursos: number; estimado: bigint; utilizado: bigint; comEstimado: number; comUtilizado: number }

export function resumoPorTarefa(itens: ItensCronograma): Map<string, ResumoTarefaItens> {
  const mapa = new Map<string, ResumoTarefaItens>();
  const de = (id: string): ResumoTarefaItens => {
    let r = mapa.get(id);
    if (!r) { r = { envolvidos: 0, recursos: 0, estimado: 0n, utilizado: 0n, comEstimado: 0, comUtilizado: 0 }; mapa.set(id, r); }
    return r;
  };
  for (const e of itens.envolvidos) de(e.tarefa_id).envolvidos++;
  for (const x of itens.recursos) {
    const r = de(x.tarefa_id);
    r.recursos++;
    if (x.valor_estimado_centavos !== null) { r.estimado += BigInt(x.valor_estimado_centavos); r.comEstimado++; }
    if (x.valor_utilizado_centavos !== null) { r.utilizado += BigInt(x.valor_utilizado_centavos); r.comUtilizado++; }
  }
  return mapa;
}

export interface ResumoItens {
  envolvidos: number; tarefasComEnvolvidos: number; recursos: number; tarefasComRecursos: number;
  porTipo: { tipo: TipoRecurso; itens: number; estimado: bigint; utilizado: bigint; comEstimado: number; comUtilizado: number }[];
  estimado: bigint; utilizado: bigint; comEstimado: number; comUtilizado: number;
}

export function resumoItens(itens: ItensCronograma): ResumoItens {
  const porTipo = TIPOS_RECURSO.map((tipo) => ({ tipo, itens: 0, estimado: 0n, utilizado: 0n, comEstimado: 0, comUtilizado: 0 }));
  let estimado = 0n; let utilizado = 0n; let comEstimado = 0; let comUtilizado = 0;
  for (const x of itens.recursos) {
    const t = porTipo.find((p) => p.tipo === x.tipo);
    if (t) t.itens++;
    if (x.valor_estimado_centavos !== null) {
      const v = BigInt(x.valor_estimado_centavos);
      estimado += v; comEstimado++;
      if (t) { t.estimado += v; t.comEstimado++; }
    }
    if (x.valor_utilizado_centavos !== null) {
      const v = BigInt(x.valor_utilizado_centavos);
      utilizado += v; comUtilizado++;
      if (t) { t.utilizado += v; t.comUtilizado++; }
    }
  }
  return {
    envolvidos: itens.envolvidos.length, tarefasComEnvolvidos: new Set(itens.envolvidos.map((e) => e.tarefa_id)).size,
    recursos: itens.recursos.length, tarefasComRecursos: new Set(itens.recursos.map((r) => r.tarefa_id)).size,
    porTipo, estimado, utilizado, comEstimado, comUtilizado,
  };
}

export function textoResumoTarefa(r: ResumoTarefaItens | undefined): string {
  if (!r) return '';
  const partes: string[] = [];
  if (r.envolvidos > 0) partes.push(plural(r.envolvidos, 'envolvido', 'envolvidos'));
  if (r.recursos > 0) partes.push(plural(r.recursos, 'recurso', 'recursos'));
  return partes.join(' · ');
}

export function linhasResumoFicha(r: ResumoItens): { rotulo: string; valor: string }[] {
  if (r.envolvidos + r.recursos === 0) return [];
  const linhas: { rotulo: string; valor: string }[] = [];
  if (r.envolvidos > 0) linhas.push({ rotulo: 'Envolvidos', valor: `${plural(r.envolvidos, 'pessoa ou área', 'pessoas ou áreas')} em ${plural(r.tarefasComEnvolvidos, 'tarefa', 'tarefas')}` });
  if (r.recursos > 0) {
    const tipos = r.porTipo.filter((t) => t.itens > 0).map((t) => `${t.itens} ${ROTULO_TIPO_PLURAL[t.tipo][t.itens === 1 ? 0 : 1]}`).join(', ');
    linhas.push({ rotulo: 'Recursos', valor: `${plural(r.recursos, 'item', 'itens')}: ${tipos}` });
  }
  if (r.comEstimado > 0) linhas.push({ rotulo: 'Valor estimado', valor: reaisDeCentavos(r.estimado) });
  if (r.comUtilizado > 0) linhas.push({ rotulo: 'Valor utilizado', valor: reaisDeCentavos(r.utilizado) });
  return linhas;
}
