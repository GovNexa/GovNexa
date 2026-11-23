// Serviço das contratações (E12): perfil, validação, regras de etapa e gravação. A prefeitura e o autor vêm da sessão.
import { dataBr } from '../datas.ts';
import { texto } from '../carteira/cadastro.ts';
import type { RepositorioProjetos } from '../repositorio/tipos.ts';
import { usuarioPode, type Usuario } from '../usuarios/index.ts';
import type { Contratacao, NovaContratacao } from './repositorio.ts';
import {
  CAMPOS, COLUNAS_EDITAVEIS, ETAPAS, ID_CONTRATACAO, ID_MARCO, MAX_CONTRATACOES, MAX_MARCOS, MAX_MOTIVO, ROTULO_ETAPA_CURTO,
  avisosFinais, camposEsperados, dataIsoValida, hojeBrasilia, normalizarCampos, regraMudanca, type CampoEditavel, type Etapa,
} from './regras.ts';

export interface ContextoContratacao { usuario: Usuario | null | undefined; repositorio: RepositorioProjetos }
export type ResultadoAcao =
  | { ok: true; id: string; revisao?: number; mudou: boolean; avisos: string[] }
  | { ok: false; status: number; erro: string; erros?: string[] };

export const ERRO_CONFLITO = 'A contratação foi alterada por outra pessoa enquanto você editava. Recarregue a página e tente de novo.';
const ERRO_PEDIDO = 'Pedido inválido.';
const ERRO_NAO_ENCONTRADA = 'Contratação não encontrada.';
const ERRO_REVISAO = 'Versão da contratação ausente: recarregue a página e tente de novo.';

const falha = (status: number, erro: string, erros?: string[]): ResultadoAcao => ({ ok: false, status, erro, ...(erros ? { erros } : {}) });
const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const ROTULO_CAMPO = new Map<string, string>(CAMPOS.map((d) => [d.campo, d.rotulo]));

export function podeGravarContratacao(c: ContextoContratacao): { ok: true } | { ok: false; status: number; erro: string } {
  if (!usuarioPode(c.usuario, 'editar_projeto')) return { ok: false, status: 403, erro: 'Seu perfil não permite alterar contratações.' };
  if (!c.repositorio.podeGravar || !c.repositorio.contratacoes) return { ok: false, status: 503, erro: 'Gravação indisponível no momento.' };
  return { ok: true };
}

/** O que a tela mostra: 'ok' = controles de gravação; 'perfil' = só consulta; 'indisponivel' = banco sem gravação. */
export function podeGravarNaTela(usuario: Usuario | null | undefined, repositorio: RepositorioProjetos): 'ok' | 'perfil' | 'indisponivel' {
  const r = podeGravarContratacao({ usuario, repositorio });
  return r.ok ? 'ok' : r.status === 403 ? 'perfil' : 'indisponivel';
}

const CHAVES_POR_ACAO: Record<string, readonly string[]> = {
  criar: ['acao', 'campos'],
  editar: ['acao', 'id', 'revisao', 'campos'],
  etapa: ['acao', 'id', 'revisao', 'de', 'para', 'data', 'motivo'],
  remover: ['acao', 'id', 'revisao', 'motivo'],
  marco_criar: ['acao', 'id', 'data', 'descricao'],
  marco_concluir: ['acao', 'id', 'marco_id'],
  marco_reabrir: ['acao', 'id', 'marco_id'],
  marco_remover: ['acao', 'id', 'marco_id'],
};

export async function executarAcao(c: ContextoContratacao, bruto: unknown, agora: Date = new Date()): Promise<ResultadoAcao> {
  const pode = podeGravarContratacao(c);
  if (!pode.ok) return falha(pode.status, pode.erro);
  const repo = c.repositorio.contratacoes!;
  if (!ehObjeto(bruto) || typeof bruto.acao !== 'string') return falha(400, ERRO_PEDIDO);
  const permitidas = Object.hasOwn(CHAVES_POR_ACAO, bruto.acao) ? CHAVES_POR_ACAO[bruto.acao] : null;
  if (!permitidas || Object.keys(bruto).some((k) => !permitidas.includes(k))) return falha(400, ERRO_PEDIDO);
  const autor = c.usuario!.email;
  const emIso = agora.toISOString();
  const hoje = hojeBrasilia(agora);
  const idContratacao = typeof bruto.id === 'string' && ID_CONTRATACAO.test(bruto.id) ? bruto.id : null;
  const revisaoPedido = typeof bruto.revisao === 'number' && Number.isSafeInteger(bruto.revisao) && bruto.revisao >= 0 ? bruto.revisao : null;
  const doResultado = (r: 'conflito' | 'inexistente' | 'limite'): ResultadoAcao =>
    r === 'conflito' ? falha(409, ERRO_CONFLITO) : r === 'inexistente' ? falha(404, ERRO_NAO_ENCONTRADA) : falha(400, ERRO_PEDIDO);

  switch (bruto.acao) {
    case 'criar': {
      const n = normalizarCampos(bruto.campos, 'criar');
      if (!n.ok) return falha(400, n.erros.join(' '), n.erros);
      const desde = n.campos.etapa_desde ?? hoje;
      if (desde > hoje) return falha(400, 'Data da etapa: não pode ser futura.');
      const projeto = n.campos.projeto_id;
      if (typeof projeto === 'string' && !(await repo.projetoExiste(projeto))) {
        return falha(400, 'Projeto da carteira: não encontrado.', ['Projeto da carteira: não encontrado.']);
      }
      const etapa = n.campos.etapa as Etapa;
      const nova = { id: `C-${crypto.randomUUID()}`, etapa, etapa_desde: desde } as Record<string, unknown>;
      for (const col of COLUNAS_EDITAVEIS) nova[col] = n.campos[col] ?? (col === 'aguardando' ? 'nao' : null);
      if (nova.aguardando === 'nao') nova.aguardando_quem = null;
      const r = await repo.criar(nova as unknown as NovaContratacao, autor, emIso, `Contratação cadastrada em ${ROTULO_ETAPA_CURTO[etapa]}`);
      const msgLimite = `Limite de ${MAX_CONTRATACOES.toLocaleString('pt-BR')} contratações ativas atingido.`;
      if (r === 'limite') return falha(400, msgLimite);
      if (r === 'limite_total') return falha(409, msgLimite);
      const avisosCriar = new Set([...n.avisos, ...avisosFinais(nova as never)]);
      return { ok: true, id: nova.id as string, revisao: 0, mudou: true, avisos: [...avisosCriar] };
    }
    case 'editar': {
      if (!idContratacao) return falha(404, ERRO_NAO_ENCONTRADA);
      if (revisaoPedido === null) return falha(400, ERRO_REVISAO);
      const n = normalizarCampos(bruto.campos, 'editar');
      if (!n.ok) return falha(400, n.erros.join(' '), n.erros);
      const atual = await repo.obter(idContratacao);
      if (!atual) return falha(404, ERRO_NAO_ENCONTRADA);
      if (atual.revisao !== revisaoPedido) return falha(409, ERRO_CONFLITO);
      const projeto = n.campos.projeto_id;
      if (typeof projeto === 'string' && projeto !== atual.projeto_id && !(await repo.projetoExiste(projeto))) {
        return falha(400, 'Projeto da carteira: não encontrado.', ['Projeto da carteira: não encontrado.']);
      }
      const mudados: Partial<Record<CampoEditavel, unknown>> = {};
      const diff: Record<string, { de: unknown; para: unknown }> = {};
      for (const col of COLUNAS_EDITAVEIS) {
        if (!Object.hasOwn(n.campos, col)) continue;
        const novo = n.campos[col] ?? null;
        if (atual[col] !== novo) { mudados[col] = novo; diff[col] = { de: atual[col], para: novo }; }
      }
      const aguardandoFinal = (mudados.aguardando ?? atual.aguardando) as string;
      const quemFinal = Object.hasOwn(mudados, 'aguardando_quem') ? mudados.aguardando_quem : atual.aguardando_quem;
      if (aguardandoFinal === 'nao' && quemFinal !== null) { mudados.aguardando_quem = null; diff.aguardando_quem = { de: atual.aguardando_quem, para: null }; }
      if (Object.keys(diff).length === 0) return { ok: true, id: idContratacao, revisao: atual.revisao, mudou: false, avisos: [] };
      const avisos = new Set(n.avisos);
      const final = { ...atual, ...mudados } as Contratacao;
      for (const a of avisosFinais(final)) avisos.add(a);
      const r = await repo.editar(idContratacao, atual.revisao, mudados, diff, autor, emIso);
      if (r.r !== 'ok') return doResultado(r.r);
      return { ok: true, id: idContratacao, revisao: r.revisao, mudou: true, avisos: [...avisos] };
    }
    case 'etapa': {
      if (!idContratacao) return falha(404, ERRO_NAO_ENCONTRADA);
      if (revisaoPedido === null) return falha(400, ERRO_REVISAO);
      const etapas = ETAPAS as readonly unknown[];
      if (!etapas.includes(bruto.de) || !etapas.includes(bruto.para)) return falha(400, 'Etapa: valor não permitido.');
      const de = bruto.de as Etapa;
      const para = bruto.para as Etapa;
      let motivo: string | null = null;
      if (bruto.motivo !== undefined && bruto.motivo !== null) {
        if (typeof bruto.motivo !== 'string') return falha(400, ERRO_PEDIDO);
        motivo = texto(bruto.motivo, MAX_MOTIVO + 1, true);
        if (motivo && Array.from(motivo).length > MAX_MOTIVO) return falha(400, `Motivo: até ${MAX_MOTIVO} caracteres.`);
      }
      let data = hoje;
      if (bruto.data !== undefined && bruto.data !== null) {
        if (!dataIsoValida(bruto.data)) return falha(400, 'Data da etapa: data inválida.');
        data = bruto.data;
      }
      if (data > hoje) return falha(400, 'Data da etapa: não pode ser futura.');
      const atual = await repo.obter(idContratacao);
      if (!atual) return falha(404, ERRO_NAO_ENCONTRADA);
      if (atual.revisao !== revisaoPedido || atual.etapa !== de) return falha(409, ERRO_CONFLITO);
      if (data < atual.etapa_desde) return falha(400, 'Data da etapa: anterior à etapa atual.');
      const regra = regraMudanca(de, para, motivo);
      if (!regra.ok) return falha(400, regra.erro);
      const descricao = `${ROTULO_ETAPA_CURTO[de]} → ${ROTULO_ETAPA_CURTO[para]} em ${dataBr(data)}`;
      const r = await repo.mudarEtapa(idContratacao, atual.revisao, de, para, data, motivo, descricao, autor, emIso);
      if (r.r !== 'ok') return doResultado(r.r);
      const vazios = camposEsperados(para).filter((col) => atual[col] === null || atual[col] === undefined || atual[col] === '').map((col) => ROTULO_CAMPO.get(col)!);
      return { ok: true, id: idContratacao, revisao: r.revisao, mudou: true, avisos: vazios.length ? [`Preencha na nova etapa: ${vazios.join(', ')}.`] : [] };
    }
    case 'remover': {
      if (!idContratacao) return falha(404, ERRO_NAO_ENCONTRADA);
      if (revisaoPedido === null) return falha(400, ERRO_REVISAO);
      const motivo = typeof bruto.motivo === 'string' ? texto(bruto.motivo, MAX_MOTIVO + 1, true) : null;
      if (!motivo || Array.from(motivo).length > MAX_MOTIVO) return falha(400, 'Informe o motivo da remoção.');
      const atual = await repo.obter(idContratacao);
      if (!atual) return falha(404, ERRO_NAO_ENCONTRADA);
      if (atual.revisao !== revisaoPedido) return falha(409, ERRO_CONFLITO);
      const r = await repo.remover(idContratacao, atual.revisao, motivo, autor, emIso);
      if (r.r !== 'ok') return doResultado(r.r);
      return { ok: true, id: idContratacao, mudou: true, avisos: [] };
    }
    case 'marco_criar': {
      if (!idContratacao) return falha(404, ERRO_NAO_ENCONTRADA);
      if (!dataIsoValida(bruto.data)) return falha(400, 'Data do marco: data inválida.');
      const descricao = typeof bruto.descricao === 'string' ? texto(bruto.descricao, 201) : null;
      if (!descricao || Array.from(descricao).length > 200) return falha(400, 'Descrição do marco: de 1 a 200 caracteres.');
      const r = await repo.criarMarco(idContratacao, { id: `M-${crypto.randomUUID()}`, data: bruto.data, descricao }, autor, emIso);
      if (r === 'inexistente') return falha(404, ERRO_NAO_ENCONTRADA);
      if (r === 'limite') return falha(400, `Limite de ${MAX_MARCOS} marcos por contratação.`);
      if (r !== 'ok') return doResultado(r);
      return { ok: true, id: idContratacao, mudou: true, avisos: [] };
    }
    case 'marco_concluir':
    case 'marco_reabrir':
    case 'marco_remover': {
      if (!idContratacao) return falha(404, ERRO_NAO_ENCONTRADA);
      if (typeof bruto.marco_id !== 'string' || !ID_MARCO.test(bruto.marco_id)) return falha(404, 'Marco não encontrado.');
      const r = bruto.acao === 'marco_remover'
        ? await repo.removerMarco(idContratacao, bruto.marco_id, autor, emIso)
        : await repo.marcarMarco(idContratacao, bruto.marco_id, bruto.acao === 'marco_concluir', autor, emIso);
      if (r === 'inexistente') return falha(404, 'Marco não encontrado.');
      return { ok: true, id: idContratacao, mudou: r === 'ok', avisos: [] };
    }
    default:
      return falha(400, ERRO_PEDIDO);
  }
}
