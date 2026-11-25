// Regras de envolvidos e recursos da tarefa (E20): normaliza o pedido e decide o que gravar. Sem SQL e sem relógio próprio.
// A observação nunca entra na descrição do Histórico (LGPD): só "Observação alterada".
import { texto } from '../carteira/cadastro.ts';
import { dataBr } from '../datas.ts';
import { chaveNome } from './responsaveis.ts';
import {
  ID_ENVOLVIDO, ID_RECURSO, MAX_ENVOLVIDOS_TAREFA, MAX_RECURSOS_TAREFA, ROTULO_TIPO_RECURSO, TETO_QUANTIDADE_CENTESIMOS, TETO_VALOR_CENTAVOS, TIPOS_RECURSO,
  centesimosDeTexto, quantidadeTexto, quemEnvolvido, reaisDeCentavos,
  type AcaoItem, type DadosEnvolvido, type DadosRecurso, type Envolvido, type OperacaoItem, type Recurso, type TipoEventoItem, type TipoRecurso,
} from './recursos.ts';

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Data real AAAA-MM-DD (ida e volta por Date UTC) entre 2000-01-01 e 2100-12-31; vazio = null; outro = undefined (inválida). */
function dataUso(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return undefined;
  return v >= '2000-01-01' && v <= '2100-12-31' ? v : undefined;
}

export function normalizarOperacaoItem(acao: AcaoItem, bruto: Record<string, unknown>, idTarefa: (v: unknown) => string, erros: string[]): OperacaoItem {
  const tarefa_id = idTarefa(bruto.tarefa_id);
  const ehEnvolvido = acao.endsWith('_envolvido');
  const itemBruto = bruto.item_id;
  let item_id = '';
  if (acao.startsWith('editar') || acao.startsWith('remover')) {
    if (typeof itemBruto === 'string' && (ehEnvolvido ? ID_ENVOLVIDO : ID_RECURSO).test(itemBruto)) item_id = itemBruto;
    else erros.push('Item inválido.');
  }
  if (acao.startsWith('remover')) {
    const motivo = texto(bruto.motivo, 500, true);
    return acao === 'remover_envolvido' ? { acao, tarefa_id, item_id, motivo } : { acao: 'remover_recurso', tarefa_id, item_id, motivo };
  }
  if (ehEnvolvido) {
    const v = ehObjeto(bruto.envolvido) ? bruto.envolvido : {};
    const envolvido: DadosEnvolvido = { nome: texto(v.nome, 120), area: texto(v.area, 80), papel: texto(v.papel, 80), observacao: texto(v.observacao, 500, true) };
    if (!envolvido.nome && !envolvido.area) erros.push('Informe o nome ou a área do envolvido.');
    return acao === 'incluir_envolvido' ? { acao, tarefa_id, envolvido } : { acao: 'editar_envolvido', tarefa_id, item_id, envolvido };
  }
  const v = ehObjeto(bruto.recurso) ? bruto.recurso : {};
  const tipoBruto = v.tipo;
  const tipo: TipoRecurso = typeof tipoBruto === 'string' && (TIPOS_RECURSO as readonly string[]).includes(tipoBruto) ? (tipoBruto as TipoRecurso) : 'material';
  if (!(typeof tipoBruto === 'string' && (TIPOS_RECURSO as readonly string[]).includes(tipoBruto))) erros.push('Tipo do recurso: escolha humano, material ou financeiro.');
  const descricao = texto(v.descricao, 200) ?? '';
  if (!descricao) erros.push('Descrição: obrigatória.');
  const q = centesimosDeTexto(v.quantidade, TETO_QUANTIDADE_CENTESIMOS);
  let quantidade: number | null = null;
  if (q === 'invalido') erros.push('Quantidade: use um número como 10 ou 2,5.');
  else if (q === 0) erros.push('Quantidade: precisa ser maior que zero.');
  else quantidade = q;
  const unidade = texto(v.unidade, 30);
  if (unidade && q === null) erros.push('Unidade: informe também a quantidade.');
  const valor = (bruto2: unknown, rotulo: string): number | null => {
    const r = centesimosDeTexto(bruto2, TETO_VALOR_CENTAVOS);
    if (r === 'invalido') { erros.push(`${rotulo}: use um valor como 1.234,56 (até R$ 10 bilhões).`); return null; }
    return r;
  };
  const estimado = valor(v.valor_estimado, 'Valor estimado');
  const utilizado = valor(v.valor_utilizado, 'Valor utilizado');
  const data = dataUso(v.data_uso);
  if (data === undefined) erros.push('Data de uso: data inválida.');
  const recurso: DadosRecurso = {
    tipo, descricao, quantidade_centesimos: quantidade, unidade: quantidade === null ? null : unidade, valor_estimado_centavos: estimado, valor_utilizado_centavos: utilizado,
    data_uso: data ?? null, observacao: texto(v.observacao, 500, true),
  };
  // Depois da conversão: valor vazio ou só "R$" também não conta (senão cairia no CHECK do banco).
  const valorInvalido = erros.some((e) => e.startsWith('Valor estimado:') || e.startsWith('Valor utilizado:'));
  if (tipoBruto === 'financeiro' && estimado === null && utilizado === null && !valorInvalido) erros.push('Recurso financeiro: informe o valor estimado ou o utilizado.');
  return acao === 'incluir_recurso' ? { acao, tarefa_id, recurso } : { acao: 'editar_recurso', tarefa_id, item_id, recurso };
}

export interface EstadoItens {
  titulo: string;
  tarefa: { id: string; nome: string; responsavel: string | null };
  envolvidos: Envolvido[]; // ativos desta tarefa
  recursos: Recurso[];
}
export type PlanoItem = {
  tabela: 'envolvido' | 'recurso';
  inserir?: { id: string; dados: DadosEnvolvido | DadosRecurso };
  atualizar?: { id: string; dados: DadosEnvolvido | DadosRecurso };
  remover?: { id: string; motivo: string | null };
  evento: { tipo: TipoEventoItem; descricao: string; motivo: string | null };
};
export type ResultadoPlanoItem = { ok: true; plano: PlanoItem; item_id: string } | { ok: false; codigo: 'invalido' | 'inexistente' | 'sem_mudanca'; erro: string };

const falha = (codigo: 'invalido' | 'inexistente' | 'sem_mudanca', erro: string): ResultadoPlanoItem => ({ ok: false, codigo, erro });
const cortar = (s: string): string => (Array.from(s).length > 1000 ? Array.from(s).slice(0, 999).join('') + '…' : s);
const vazio = (s: string | null | undefined): string => (s ? s : '—');

export function planejarItem(estado: EstadoItens, op: OperacaoItem, ctx: { novoId: () => string }): ResultadoPlanoItem {
  const P = `Cronograma «${estado.titulo}»: tarefa «${estado.tarefa.nome}»`;
  const chaveResp = chaveNome(estado.tarefa.responsavel);

  if (op.acao === 'incluir_envolvido' || op.acao === 'editar_envolvido' || op.acao === 'remover_envolvido') {
    const antes = op.acao === 'incluir_envolvido' ? undefined : estado.envolvidos.find((e) => e.id === op.item_id);
    if (op.acao !== 'incluir_envolvido' && !antes) return falha('inexistente', 'Envolvido não encontrado.');
    if (op.acao === 'remover_envolvido') {
      return { ok: true, item_id: antes!.id, plano: { tabela: 'envolvido', remover: { id: antes!.id, motivo: op.motivo }, evento: { tipo: 'envolvido_removido', descricao: cortar(`${P}: envolvido ${quemEnvolvido(antes!)} removido.`), motivo: op.motivo } } };
    }
    const d = op.envolvido;
    if (op.acao === 'incluir_envolvido' && estado.envolvidos.length >= MAX_ENVOLVIDOS_TAREFA) return falha('invalido', `Limite de ${MAX_ENVOLVIDOS_TAREFA} envolvidos por tarefa.`);
    if (antes && antes.nome === d.nome && antes.area === d.area && antes.papel === d.papel && antes.observacao === d.observacao) return falha('sem_mudanca', 'Nada mudou.');
    const duplicado = estado.envolvidos.some((e) => e.id !== antes?.id && chaveNome(e.nome) === chaveNome(d.nome) && chaveNome(e.area) === chaveNome(d.area));
    if (duplicado) return falha('invalido', 'Este envolvido já está na tarefa.');
    const nomeMudou = !antes || antes.nome !== d.nome;
    if (nomeMudou && d.nome && chaveNome(d.nome) === chaveResp) return falha('invalido', 'Esta pessoa já é a responsável pela tarefa.');
    if (!antes) {
      const id = 'E-' + ctx.novoId();
      return { ok: true, item_id: id, plano: { tabela: 'envolvido', inserir: { id, dados: d }, evento: { tipo: 'envolvido_incluido', descricao: cortar(`${P}: envolvido ${quemEnvolvido(d)}${d.papel ? ` (${d.papel})` : ''} incluído.`), motivo: null } } };
    }
    const mudancas: string[] = [];
    if (antes.nome !== d.nome) mudancas.push(`Nome: ${vazio(antes.nome)} → ${vazio(d.nome)}`);
    if (antes.area !== d.area) mudancas.push(`Área: ${vazio(antes.area)} → ${vazio(d.area)}`);
    if (antes.papel !== d.papel) mudancas.push(`Papel: ${vazio(antes.papel)} → ${vazio(d.papel)}`);
    if (antes.observacao !== d.observacao) mudancas.push('Observação alterada');
    return { ok: true, item_id: antes.id, plano: { tabela: 'envolvido', atualizar: { id: antes.id, dados: d }, evento: { tipo: 'envolvido_alterado', descricao: cortar(`${P}: envolvido ${quemEnvolvido(antes)} alterado · ${mudancas.join('; ')}`), motivo: null } } };
  }

  const antes = op.acao === 'incluir_recurso' ? undefined : estado.recursos.find((r) => r.id === op.item_id);
  if (op.acao !== 'incluir_recurso' && !antes) return falha('inexistente', 'Recurso não encontrado.');
  if (op.acao === 'remover_recurso') {
    return { ok: true, item_id: antes!.id, plano: { tabela: 'recurso', remover: { id: antes!.id, motivo: op.motivo }, evento: { tipo: 'recurso_removido', descricao: cortar(`${P}: recurso «${antes!.descricao}» removido.`), motivo: op.motivo } } };
  }
  const d = op.recurso;
  if (!antes) {
    if (estado.recursos.length >= MAX_RECURSOS_TAREFA) return falha('invalido', `Limite de ${MAX_RECURSOS_TAREFA} recursos por tarefa.`);
    const id = 'R-' + ctx.novoId();
    let desc = `${P}: recurso ${ROTULO_TIPO_RECURSO[d.tipo].toLowerCase()} «${d.descricao}» incluído`;
    if (d.quantidade_centesimos !== null) desc += `, ${quantidadeTexto(d.quantidade_centesimos)}${d.unidade ? ' ' + d.unidade : ''}`;
    if (d.valor_estimado_centavos !== null) desc += `, estimado ${reaisDeCentavos(d.valor_estimado_centavos)}`;
    if (d.valor_utilizado_centavos !== null) desc += `, utilizado ${reaisDeCentavos(d.valor_utilizado_centavos)}`;
    if (d.data_uso) desc += `, em ${dataBr(d.data_uso)}`;
    return { ok: true, item_id: id, plano: { tabela: 'recurso', inserir: { id, dados: d }, evento: { tipo: 'recurso_incluido', descricao: cortar(desc + '.'), motivo: null } } };
  }
  const mudancas: string[] = [];
  if (antes.tipo !== d.tipo) mudancas.push(`Tipo: ${ROTULO_TIPO_RECURSO[antes.tipo]} → ${ROTULO_TIPO_RECURSO[d.tipo]}`);
  if (antes.descricao !== d.descricao) mudancas.push(`Descrição: ${vazio(antes.descricao)} → ${vazio(d.descricao)}`);
  if (antes.quantidade_centesimos !== d.quantidade_centesimos) mudancas.push(`Quantidade: ${vazio(quantidadeTexto(antes.quantidade_centesimos))} → ${vazio(quantidadeTexto(d.quantidade_centesimos))}`);
  if (antes.unidade !== d.unidade) mudancas.push(`Unidade: ${vazio(antes.unidade)} → ${vazio(d.unidade)}`);
  if (antes.valor_estimado_centavos !== d.valor_estimado_centavos) mudancas.push(`Valor estimado: ${reaisDeCentavos(antes.valor_estimado_centavos)} → ${reaisDeCentavos(d.valor_estimado_centavos)}`);
  if (antes.valor_utilizado_centavos !== d.valor_utilizado_centavos) mudancas.push(`Valor utilizado: ${reaisDeCentavos(antes.valor_utilizado_centavos)} → ${reaisDeCentavos(d.valor_utilizado_centavos)}`);
  if (antes.data_uso !== d.data_uso) mudancas.push(`Data de uso: ${antes.data_uso ? dataBr(antes.data_uso) : '—'} → ${d.data_uso ? dataBr(d.data_uso) : '—'}`);
  if (antes.observacao !== d.observacao) mudancas.push('Observação alterada');
  if (!mudancas.length) return falha('sem_mudanca', 'Nada mudou.');
  return { ok: true, item_id: antes.id, plano: { tabela: 'recurso', atualizar: { id: antes.id, dados: d }, evento: { tipo: 'recurso_alterado', descricao: cortar(`${P}: recurso «${antes.descricao}» alterado · ${mudancas.join('; ')}`), motivo: null } } };
}
