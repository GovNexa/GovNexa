// Rotina de importação das planilhas (etapa 3.5): lê a pasta de planilhas, confere, gera o SQL e, se pedido, grava no D1.
//   node scripts/importar-planilhas.ts --planilhas <pasta> [--saida <pasta>] [--autor <nome>] [--destino nenhum|local|remoto]
// Planilhas esperadas na pasta (o nome identifica o tipo):
//   Projeto_obras_prioritarias*.xlsx   carteira (abas PIPELINE e BASE_OPERACIONAL)
//   GEPP*.xlsx                         cronogramas por projeto
//   codigos-corrigidos.json            (opcional) correções de códigos repetidos da carteira: [{ codigo, orgao, novo, motivo }]
// Padrão: só CONFERE (nada vai ao banco). Com `--destino remoto` grava no D1 de produção (precisa de CLOUDFLARE_API_TOKEN e
// CLOUDFLARE_ACCOUNT_ID, ou de `wrangler login`); `--destino local` grava no D1 local (testes e desenvolvimento).
// Regras de segurança dos dados (cada uma tem teste):
// - Nunca apaga projeto que saiu da planilha (só avisa).
// - Nunca sobrescreve localização e compromisso (preenchidos no sistema).
// - NÃO atualiza projeto que já foi alterado no sistema (tem evento que não veio de importação): ele é pulado e listado.
// - Um código só pode continuar sendo do mesmo órgão: se P-450 era da SEINFRA no banco e a planilha o traz como da SECAP, para tudo.
// - Planilha com menos da metade dos projetos do banco, ou com muitos projetos novos de uma vez, é recusada.
// - Não regrava o histórico: registra um único evento de carga e uma linha no registro de importações.
// Relatórios, console e erros trazem só contagens, códigos, linhas e órgãos: nunca nomes, valores ou textos da planilha.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { municipioAtivo } from '../src/lib/municipio-ativo.ts';
import type { Carteira } from '../src/lib/carteira/tipos.ts';
import { importarCarteira, lerCorrecoes } from './importar-carteira.ts';
import { importarCronogramas } from './importar-cronogramas.ts';

export type Destino = 'nenhum' | 'local' | 'remoto';
export interface OpcoesImportacao { planilhas: string; saida: string; autor: string; destino: Destino; agora?: Date }
export interface ResumoImportacao {
  projetos: number;
  cronogramas: number;
  etapas: number;
  codigosRepetidos: { codigo: number; linhas: number[]; orgaos: string[]; resolvido: boolean; novo?: number }[];
  correcoesSemEfeito: number;
  casamentoCronogramas: { sei: number; nome: number; semPar: number };
  novos: number | null; // ids que ainda não estavam no banco (só com destino local/remoto)
  atualizados: number | null;
  editadosNoSistema: number | null; // pulados: já foram alterados no sistema
  foraDaPlanilha: number | null; // projetos que estão no banco e saíram da planilha: ficam, só são avisados
  cronogramasForaDaPlanilha: number | null;
  avisos: string[];
  arquivos: { carteira: string; cronogramas: string };
  sql: string;
}

const NOME_CARTEIRA = /^Projeto_obras_prioritarias.*\.xlsx$/i;
const NOME_CRONOGRAMAS = /^GEPP.*\.xlsx$/i;
/** Planilha com menos da metade dos projetos que o banco já tem é tratada como incompleta. */
export const PROPORCAO_MINIMA = 0.5;
/** Com pelo menos esta quantidade de projetos no banco, mais de metade de projetos novos de uma vez é recusada. */
export const BANCO_MINIMO_PARA_LIMITE_DE_NOVOS = 20;

// ---------- decisão (pura, testada) ----------

export interface AvaliacaoImportacao {
  novos: string[];
  atualizados: string[]; // os que serão gravados (existem nos dois e não foram editados no sistema)
  editadosNoSistema: string[]; // existem nos dois, mas foram alterados no sistema: pulados
  foraDaPlanilha: string[];
  erros: string[];
  avisos: string[];
}
const norm = (o: string | null | undefined): string => String(o ?? '').trim().toLowerCase();

/** Decide o que a importação pode fazer, comparando a planilha com o que o banco já tem. Só trabalha com ids e órgãos. */
export function avaliarImportacao(
  planilha: Map<string, { orgao: string | null }>,
  banco: Map<string, { orgao: string | null }>,
  editados: Set<string>,
): AvaliacaoImportacao {
  const r: AvaliacaoImportacao = { novos: [], atualizados: [], editadosNoSistema: [], foraDaPlanilha: [], erros: [], avisos: [] };
  const divergentes: string[] = [];
  for (const [id, p] of planilha) {
    const b = banco.get(id);
    if (!b) {
      r.novos.push(id);
      continue;
    }
    if (norm(b.orgao) && norm(p.orgao) && norm(b.orgao) !== norm(p.orgao)) divergentes.push(`${id} (no banco: ${b.orgao}; na planilha: ${p.orgao})`);
    else if (editados.has(id)) r.editadosNoSistema.push(id);
    else r.atualizados.push(id);
  }
  for (const id of banco.keys()) if (!planilha.has(id)) r.foraDaPlanilha.push(id);
  if (divergentes.length) r.erros.push(`Código(s) com órgão diferente do que já está no banco: ${divergentes.join('; ')}. A planilha pode ter renumerado ou reaproveitado códigos; nada foi gravado. Confira a planilha e o arquivo codigos-corrigidos.json.`);
  if (banco.size > 0 && planilha.size < banco.size * PROPORCAO_MINIMA) r.erros.push(`A planilha tem ${planilha.size} projetos e o banco já tem ${banco.size}: parece incompleta. Nada foi gravado.`);
  if (banco.size >= BANCO_MINIMO_PARA_LIMITE_DE_NOVOS && r.novos.length > banco.size * PROPORCAO_MINIMA) r.erros.push(`A planilha traz ${r.novos.length} projetos novos de uma vez para um banco com ${banco.size}: confira se é a planilha certa. Nada foi gravado.`);
  if (r.foraDaPlanilha.length) r.avisos.push(`${r.foraDaPlanilha.length} projeto(s) estão no banco e não estão mais na planilha. Foram mantidos; retirar um projeto é decisão manual.`);
  if (r.editadosNoSistema.length) r.avisos.push(`${r.editadosNoSistema.length} projeto(s) já foram alterados no sistema e NÃO foram atualizados pela planilha: ${r.editadosNoSistema.slice(0, 30).join(', ')}${r.editadosNoSistema.length > 30 ? '…' : ''}.`);
  return r;
}

// ---------- processos e banco ----------

function achar(pasta: string, padrao: RegExp, rotulo: string): string {
  const lista = readdirSync(pasta).filter((n) => padrao.test(n) && !n.startsWith('~$'));
  if (lista.length === 0) throw new Error(`Planilha de ${rotulo} não encontrada na pasta ${pasta}.`);
  if (lista.length > 1) throw new Error(`Mais de uma planilha de ${rotulo} na pasta (${lista.length}). Deixe só a versão atual.`);
  return join(pasta, lista[0]);
}

/** No Windows `npx` é npx.cmd e precisa de shell (argumentos com espaço vão entre aspas); nos outros sistemas não usa shell.
 * `stdout` vem separado: avisos do wrangler saem no stderr e não podem se misturar à resposta em JSON. */
function executar(comando: string, args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const win = process.platform === 'win32';
  // Windows (cmd): dentro de aspas só `%` e NUL ainda são interpretados; fora delas, também & | < > ^.
  if (win && args.some((a) => (/[\s"]/.test(a) ? /[%\0]/ : /[&|<>^%\0]/).test(a))) throw new Error('Argumento com caractere não aceito.');
  const argv = win ? args.map((a) => (/[\s"]/.test(a) ? `"${a.replaceAll('"', '\\"')}"` : a)) : args;
  const r = spawnSync(comando, argv, { encoding: 'utf8', shell: win, maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
const sqlTxt = (s: string): string => {
  if (s.includes('\0')) throw new Error('Texto com caractere NUL não aceito.');
  return `'${s.replaceAll("'", "''")}'`;
};

/** Consulta só leitura; devolve as linhas da resposta JSON do wrangler (lida só do stdout). */
function consultar(banco: string, destino: Exclude<Destino, 'nenhum'>, sql: string): Record<string, unknown>[] {
  const r = executar('npx', ['wrangler', 'd1', 'execute', banco, destino === 'remoto' ? '--remote' : '--local', '--json', '--command', sql]);
  if (!r.ok) throw new Error('Não consegui ler o banco (confira o acesso ao Cloudflare).');
  const inicio = r.stdout.search(/^\[/m);
  if (inicio < 0) throw new Error('Resposta inesperada do banco.');
  const dados = JSON.parse(r.stdout.slice(inicio)) as { results?: Record<string, unknown>[] }[];
  return dados[0]?.results ?? [];
}

function recusarPastaPerigosa(pasta: string): void {
  const cwd = resolve(process.cwd());
  if (pasta === cwd || cwd.startsWith(pasta + sep) || existsSync(join(pasta, 'package.json')) || existsSync(join(pasta, '.git'))) {
    throw new Error('A pasta de trabalho (--saida) não pode ser a do projeto nem conter arquivos do projeto: ela é apagada a cada execução.');
  }
}

// ---------- rotina ----------

export async function importarPlanilhas(op: OpcoesImportacao): Promise<ResumoImportacao> {
  const ibge = municipioAtivo().codigo_ibge;
  const pastaPlanilhas = resolve(op.planilhas);
  if (!existsSync(pastaPlanilhas)) throw new Error(`Pasta de planilhas não encontrada: ${op.planilhas}`);
  const planilhaCarteira = achar(pastaPlanilhas, NOME_CARTEIRA, 'carteira');
  const planilhaCronogramas = achar(pastaPlanilhas, NOME_CRONOGRAMAS, 'cronogramas');
  const arquivoCorrecoes = join(pastaPlanilhas, 'codigos-corrigidos.json');
  const correcoes = existsSync(arquivoCorrecoes) ? lerCorrecoes(arquivoCorrecoes) : [];

  const trabalho = resolve(op.saida);
  recusarPastaPerigosa(trabalho);
  rmSync(trabalho, { recursive: true, force: true });
  const pastaDados = join(trabalho, String(ibge));
  mkdirSync(pastaDados, { recursive: true });

  const { carteira, relatorio: relCarteira } = await importarCarteira({ planilha: planilhaCarteira, saida: pastaDados, autor: op.autor, agora: op.agora, correcoes });
  const rc = relCarteira as { codigos_repetidos?: ResumoImportacao['codigosRepetidos']; correcoes_nao_usadas?: unknown[] };
  const { relatorio: relCrono } = await importarCronogramas({ planilha: planilhaCronogramas, saida: pastaDados, carteira: join(pastaDados, 'carteira.json'), agora: op.agora });

  const avisos: string[] = [];
  if (carteira.projetos.length === 0) throw new Error('A planilha da carteira não trouxe nenhum projeto.');
  if (relCrono.cronogramas === 0) throw new Error('A planilha de cronogramas não trouxe nenhum cronograma.');
  for (const c of rc.codigos_repetidos ?? []) avisos.push(`Código ${c.codigo} repetido nas linhas ${c.linhas.join(', ')} (órgãos ${c.orgaos.join(', ')}): ${c.resolvido ? `corrigido, um dos projetos ficou com o código ${c.novo}` : 'SEM CORREÇÃO'}.`);
  if ((rc.correcoes_nao_usadas ?? []).length) avisos.push(`${rc.correcoes_nao_usadas!.length} correção(ões) de código sem efeito: a planilha não repete mais esses códigos; tire-as de codigos-corrigidos.json.`);
  if (relCrono.casamento.sem_par > 0) avisos.push(`${relCrono.casamento.sem_par} cronograma(s) sem projeto correspondente na carteira.`);

  const resumo: ResumoImportacao = {
    projetos: carteira.projetos.length,
    cronogramas: relCrono.cronogramas,
    etapas: relCrono.etapas,
    codigosRepetidos: rc.codigos_repetidos ?? [],
    correcoesSemEfeito: (rc.correcoes_nao_usadas ?? []).length,
    casamentoCronogramas: { sei: relCrono.casamento.sei, nome: relCrono.casamento.nome, semPar: relCrono.casamento.sem_par },
    novos: null,
    atualizados: null,
    editadosNoSistema: null,
    foraDaPlanilha: null,
    cronogramasForaDaPlanilha: null,
    avisos,
    arquivos: { carteira: basename(planilhaCarteira), cronogramas: basename(planilhaCronogramas) },
    sql: join(trabalho, 'carga.sql'),
  };

  // O que o banco já tem decide o que pode ser gravado (só com destino local/remoto).
  let dadosParaSql = pastaDados;
  let banco: string | null = null;
  let editados = new Set<string>();
  if (op.destino !== 'nenhum') {
    banco = `DB_PREFEITURA_${ibge}`;
    const doBanco = new Map(consultar(banco, op.destino, `SELECT id, orgao FROM projeto WHERE prefeitura_id = ${ibge}`).map((l) => [String(l.id), { orgao: (l.orgao as string | null) ?? null }]));
    editados = new Set(consultar(banco, op.destino, `SELECT DISTINCT projeto_id FROM evento_projeto WHERE prefeitura_id = ${ibge} AND origem <> 'importacao'`).map((l) => String(l.projeto_id)));
    const idsCronogramas = new Set(consultar(banco, op.destino, `SELECT id FROM cronograma WHERE prefeitura_id = ${ibge}`).map((l) => String(l.id)));
    const av = avaliarImportacao(new Map(carteira.projetos.map((p) => [p.id, { orgao: p.orgao }])), doBanco, editados);
    resumo.novos = av.novos.length;
    resumo.atualizados = av.atualizados.length;
    resumo.editadosNoSistema = av.editadosNoSistema.length;
    resumo.foraDaPlanilha = av.foraDaPlanilha.length;
    avisos.push(...av.avisos);
    const doExcel = JSON.parse(readFileSync(join(pastaDados, 'cronogramas.json'), 'utf8')) as { cronogramas: { id: string }[] };
    const idsExcel = new Set(doExcel.cronogramas.map((c) => c.id));
    resumo.cronogramasForaDaPlanilha = [...idsCronogramas].filter((i) => !idsExcel.has(i)).length;
    if (resumo.cronogramasForaDaPlanilha > 0) avisos.push(`${resumo.cronogramasForaDaPlanilha} cronograma(s) do banco não estão mais na planilha (aba renomeada ou removida?). Foram mantidos.`);
    if (av.erros.length) {
      writeFileSync(join(trabalho, 'relatorio-importacao.md'), relatorioMd({ ...resumo, avisos: [...avisos, ...av.erros.map((e) => `RECUSADA: ${e}`)] }, 'nenhum'), 'utf8');
      throw new Error(av.erros.join(' '));
    }
    if (av.editadosNoSistema.length) {
      // Os projetos alterados no sistema ficam de fora do SQL: a planilha não passa por cima do que foi feito no sistema.
      dadosParaSql = join(trabalho, 'dados-sql');
      mkdirSync(dadosParaSql, { recursive: true });
      const pular = new Set(av.editadosNoSistema);
      const filtrada: Carteira = { ...carteira, projetos: carteira.projetos.filter((p) => !pular.has(p.id)) };
      writeFileSync(join(dadosParaSql, 'carteira.json'), JSON.stringify(filtrada), 'utf8');
      copyFileSync(join(pastaDados, 'cronogramas.json'), join(dadosParaSql, 'cronogramas.json'));
    }
  }

  // SQL sem o histórico da planilha (a rotina registra um evento único de carga, abaixo).
  const gerar = executar('node', ['scripts/gerar-sql-carga.ts', '--dados', dadosParaSql, '--saida', resumo.sql, '--dialeto', 'sqlite', '--sem-historico', '--nome', municipioAtivo().nome, '--uf', municipioAtivo().uf]);
  if (!gerar.ok) throw new Error('Falha ao gerar o SQL a partir das planilhas (confira se os números das planilhas estão preenchidos corretamente).');

  const falhas: string[] = [];
  if (op.destino !== 'nenhum' && banco) {
    const destinoFlag = op.destino === 'remoto' ? '--remote' : '--local';
    const iniciadoEm = new Date().toISOString();
    const aplicar = executar('npx', ['wrangler', 'd1', 'execute', banco, destinoFlag, '--file', resumo.sql]);
    const concluidoEm = new Date().toISOString();
    const ok = aplicar.ok;
    const mensagem = ok ? `${resumo.projetos} projetos, ${resumo.cronogramas} cronogramas, ${resumo.etapas} etapas` : 'Falha ao gravar no banco da prefeitura. Os dados são regravados por inteiro a cada importação: rode de novo.';
    // Registro da importação (banco central) e um único evento de carga no histórico da prefeitura.
    const central = `INSERT INTO importacao (id, prefeitura_id, tipo, arquivo, autor, iniciado_em, concluido_em, incluidos, alterados, retirados, status, mensagem) VALUES (${[
      sqlTxt(`planilhas-${concluidoEm}`), String(ibge), sqlTxt('planilhas'), sqlTxt(`${resumo.arquivos.carteira} + ${resumo.arquivos.cronogramas}`), sqlTxt(op.autor), sqlTxt(iniciadoEm), sqlTxt(concluidoEm),
      String(resumo.novos), String(resumo.atualizados), String(resumo.foraDaPlanilha), sqlTxt(ok ? 'ok' : 'erro'), sqlTxt(mensagem),
    ].join(', ')});`;
    writeFileSync(join(trabalho, 'importacao-central.sql'), central + '\n', 'utf8');
    if (!executar('npx', ['wrangler', 'd1', 'execute', 'DB_CENTRAL', destinoFlag, '--file', join(trabalho, 'importacao-central.sql')]).ok) falhas.push('não consegui gravar o registro da importação no banco central');
    if (ok) {
      const evento = `INSERT INTO evento_sistema (id, prefeitura_id, tipo, origem, autor, em, descricao) VALUES (${[
        sqlTxt(`carga-${concluidoEm}`), String(ibge), sqlTxt('carga'), sqlTxt('importacao'), sqlTxt(op.autor), sqlTxt(concluidoEm),
        sqlTxt(`Carga das planilhas ${resumo.arquivos.carteira} e ${resumo.arquivos.cronogramas}: ${resumo.projetos} projetos (${resumo.novos} novos, ${resumo.atualizados} atualizados, ${resumo.editadosNoSistema} pulados por já terem sido alterados no sistema, ${resumo.foraDaPlanilha} fora da planilha), ${resumo.cronogramas} cronogramas, ${resumo.etapas} etapas`),
      ].join(', ')}) ON CONFLICT (id) DO NOTHING;`;
      writeFileSync(join(trabalho, 'evento-carga.sql'), evento + '\n', 'utf8');
      if (!executar('npx', ['wrangler', 'd1', 'execute', banco, destinoFlag, '--file', join(trabalho, 'evento-carga.sql')]).ok) falhas.push('não consegui gravar o evento de carga no histórico');
    } else {
      falhas.push(mensagem);
    }
  }
  for (const f of falhas) avisos.push(`FALHA: ${f}`);
  writeFileSync(join(trabalho, 'relatorio-importacao.md'), relatorioMd(resumo, op.destino), 'utf8');
  if (falhas.length) throw new Error(falhas.join('; '));
  return resumo;
}

export function relatorioMd(r: ResumoImportacao, destino: Destino): string {
  const L: string[] = ['# Importação das planilhas', ''];
  L.push(`- Modo: ${destino === 'nenhum' ? 'só conferência (nada foi gravado no banco)' : destino === 'remoto' ? 'gravado no banco de produção' : 'gravado no banco local'}`);
  L.push(`- Carteira: ${r.arquivos.carteira}`, `- Cronogramas: ${r.arquivos.cronogramas}`, '');
  L.push('| Item | Quantidade |', '|---|---:|', `| Projetos na planilha | ${r.projetos} |`, `| Cronogramas | ${r.cronogramas} |`, `| Etapas | ${r.etapas} |`);
  L.push(`| Cronogramas casados com a carteira por SEI / por nome / sem par | ${r.casamentoCronogramas.sei} / ${r.casamentoCronogramas.nome} / ${r.casamentoCronogramas.semPar} |`);
  if (r.novos !== null) {
    L.push(`| Projetos novos no banco | ${r.novos} |`, `| Projetos atualizados | ${r.atualizados} |`, `| Projetos pulados por já terem sido alterados no sistema | ${r.editadosNoSistema} |`, `| Projetos no banco que saíram da planilha (mantidos) | ${r.foraDaPlanilha} |`);
    if (r.cronogramasForaDaPlanilha !== null) L.push(`| Cronogramas no banco que saíram da planilha (mantidos) | ${r.cronogramasForaDaPlanilha} |`);
  }
  L.push('', '## Avisos', '');
  if (r.avisos.length === 0) L.push('Nenhum aviso.');
  for (const a of r.avisos) L.push(`- ${a}`);
  L.push('', 'Este relatório traz só contagens, códigos, linhas e órgãos da planilha, nunca nomes nem valores.', '');
  return L.join('\n');
}

const executadoDireto = !!process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (executadoDireto) {
  const args = process.argv.slice(2);
  const pega = (nome: string, padrao?: string) => {
    const i = args.indexOf(nome);
    return i >= 0 ? args[i + 1] : padrao;
  };
  const destino = pega('--destino', 'nenhum') as Destino;
  if (!['nenhum', 'local', 'remoto'].includes(destino)) {
    console.error('Uso: node scripts/importar-planilhas.ts --planilhas <pasta> [--saida <pasta>] [--autor <nome>] [--destino nenhum|local|remoto]');
    process.exit(1);
  }
  const saida = resolve(pega('--saida', '.tmp/importacao')!);
  const mostrar = () => {
    const arquivo = join(saida, 'relatorio-importacao.md');
    if (!existsSync(arquivo)) return;
    const rel = readFileSync(arquivo, 'utf8');
    console.log(rel);
    if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, rel, { flag: 'a' });
  };
  try {
    await importarPlanilhas({ planilhas: pega('--planilhas', 'planilhas')!, saida, autor: pega('--autor', 'Importação das planilhas')!, destino });
    mostrar();
  } catch (e) {
    mostrar();
    console.error(`Falha na importação: ${(e as Error).message}`);
    process.exit(1);
  }
}
