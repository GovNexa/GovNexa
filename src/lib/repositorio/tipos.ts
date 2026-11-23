// Contrato do repositório de dados: as telas e a API falam só com esta interface (JSON hoje, PostgreSQL depois).
import type { Evento, RegistroHistorico } from '../carteira/movimentacao.ts';
import type { CodigoMacroetapa, Projeto } from '../carteira/tipos.ts';
import type { OperacaoCronograma } from '../cronograma/planejar.ts';
import type { Cronograma } from '../cronograma/tipos.ts';
import type { RegistroLog } from '../log/tipos.ts';

export type ResultadoAplicacao =
  | { ok: true; historico: RegistroHistorico[] }
  | { ok: false; erro: string; faltando?: string[] };

export type ResultadoCriacaoProjeto =
  | { ok: true; projeto: Projeto; historico: RegistroHistorico[] }
  | { ok: false; erro: string; faltando?: string[]; codigo?: 'concorrencia' };

export interface AreaCatalogo { codigo: string; nome: string }
export type ResultadoEdicao =
  | { ok: true; mudou: boolean; historico: RegistroHistorico[] }
  | { ok: false; codigo: 'inexistente' | 'conflito' | 'invalido'; erro: string };

/** Pedido de mudança de macroetapa (E7/B3): revisão e etapa que a pessoa viu, destino, motivo e se força. */
export interface PedidoMovimento {
  revisao: number;
  de: CodigoMacroetapa | null;
  para: CodigoMacroetapa;
  motivo: string | null;
  forcar: boolean;
  origem: 'kanban' | 'pendencia';
}
export type ResultadoMovimento =
  | { ok: true; revisao: number; projeto: Projeto; forcado: boolean }
  | { ok: false; codigo: 'inexistente' | 'conflito' | 'regra'; erro: string; faltando?: string[] };

export type ResultadoGravacaoCronograma =
  | { ok: true; mudou: boolean; revisao: number; tarefa_id?: string }
  | { ok: false; codigo: 'inexistente' | 'conflito' | 'invalido'; erro: string };
export type ResultadoCriacaoCronograma =
  | { ok: true; id: string }
  | { ok: false; codigo: 'inexistente' | 'conflito'; erro: string; existente?: string };

export interface RepositorioProjetos {
  podeGravar: boolean;
  /** Prefeitura de que este repositório lê e grava (chave do cache; preenchida por `repositorioDoUsuario`). */
  prefeituraId?: number;
  /** Ausente apenas nos adaptadores legados. */
  listarGeoBairros?(): Promise<import('../mapa/geo.ts').GeoBairros>;
  listarProjetos(): Promise<Projeto[]>;
  obterProjeto(id: string): Promise<Projeto | null>;
  /** Revisão, catálogo da prefeitura e edição de projeto (só no D1). */
  obterProjetoComRevisao?(id: string): Promise<{ projeto: Projeto; revisao: number } | null>;
  listarAreas?(incluirInativas?: boolean): Promise<AreaCatalogo[]>;
  editarProjeto?(projetoId: string, revisao: number, campos: Record<string, unknown>, motivo: string | null, autor: string): Promise<ResultadoEdicao>;
  /** Revisão atual de cada projeto da prefeitura (leitura direta, sem cache; só no D1). */
  listarRevisoes?(): Promise<Map<string, number>>;
  /** Muda a macroetapa pela regra única (portão e motivo) e grava o evento no Histórico no mesmo lote (só no D1). */
  moverProjeto?(projetoId: string, pedido: PedidoMovimento, autor: string): Promise<ResultadoMovimento>;
  historico(projetoId: string): Promise<RegistroHistorico[]>;
  /** Todos os registros do histórico de alterações (inclui importações), mais recentes primeiro. */
  listarHistorico(): Promise<RegistroLog[]>;
  aplicar(e: Evento): Promise<ResultadoAplicacao>;
  /** Cadastra um projeto novo na macroetapa 00 (grava só com o banco configurado). */
  criarProjeto(dados: Partial<Projeto> & { nome: string; orgao: string }, autor: string): Promise<ResultadoCriacaoProjeto>;
  listarCronogramas(): Promise<Cronograma[]>;
  /** Cronograma com a versão (E13; só no D1). Leitura direta, sem cache. */
  obterCronograma?(id: string): Promise<{ cronograma: Cronograma; revisao: number } | null>;
  /** Grava uma mudança do cronograma (tarefa, responsável, ordem) e o evento no mesmo lote; vale só se a versão for a lida (E13; só no D1). */
  gravarCronograma?(id: string, revisao: number, op: OperacaoCronograma, ctx: { autor: string; agora: string; hoje: string }): Promise<ResultadoGravacaoCronograma>;
  /** Cria o cronograma de um projeto da carteira, direto na tela (E13; só no D1). */
  criarCronograma?(dados: { projeto_id: string; titulo: string }, ctx: { autor: string; agora: string }): Promise<ResultadoCriacaoCronograma>;
  /**
   * Grava a localização e o evento de histórico juntos (só no D1). `decidir` recebe a localização que está no banco e devolve
   * o novo valor com a frase do histórico, ou null se nada muda. A gravação só vale se o projeto não mudou desde essa leitura.
   * 'inexistente' = projeto não é desta prefeitura; 'igual' = nada a gravar; 'conflito' = outra pessoa alterou o projeto no meio.
   */
  definirLocalizacao?(
    projetoId: string,
    decidir: (atual: unknown) => { valor: import('../mapa/tipos.ts').Localizacao; descricao: string } | null,
    autor: string,
  ): Promise<'ok' | 'igual' | 'inexistente' | 'conflito'>;
  /** Documentos de projeto (só no D1; ausente nos demais repositórios). */
  documentos?: import('../documentos/repositorio.ts').RepositorioDocumentos;
  /** Fotos da obra (E9; só no D1; ausente nos demais repositórios). */
  fotos?: import('../fotos/repositorio.ts').RepositorioFotos;
  /** Contratações (E12; só no D1; ausente nos demais repositórios). */
  contratacoes?: import('../contratacoes/repositorio.ts').RepositorioContratacoes;
}
