// Resume a saída de erro (stderr) de um coletor numa frase curta para o painel "Qualidade dos dados" e os alertas.
// O Node imprime primeiro o TRECHO DE CÓDIGO da linha que falhou e só depois "Error: <mensagem>". A versão antiga pegava a
// primeira linha com a palavra "error", que era o trecho de código (ex.: "if (tentativa === 3) throw new Error(...)").
// Agora a linha de erro de verdade vem primeiro; trechos de código nunca viram motivo.

const LINHA_ERRO = /^(?:Uncaught\s+)?(?:[A-Za-z]*Error|AggregateError)(?:\s*\[[^\]]*\])?\s*:\s*\S/;
const PARECE_CODIGO = /\bthrow\s+new\b|=>|\$\{|^\s*\^+\s*$|[;{}]\s*$|\bcatch\s*\(|\bif\s*\(|\bawait\s|\bconst\s|\blet\s/;

export function resumirErro(saida: string, codigoSaida: number | null = null): string {
  const linhas = saida.split('\n').map((l) => l.trim()).filter(Boolean);
  const emPilha = (l: string): boolean => /^at\s/.test(l) || /^node:/.test(l) || /^Node\.js v/.test(l) || /^file:\/\/\//.test(l);
  const bruta =
    linhas.find((l) => LINHA_ERRO.test(l))
    ?? linhas.find((l) => /timeout|HTTP \d{3}|ECONN|ENOTFOUND|ETIMEDOUT/i.test(l) && !PARECE_CODIGO.test(l) && !emPilha(l))
    ?? [...linhas].reverse().find((l) => !PARECE_CODIGO.test(l) && !emPilha(l))
    ?? `saiu com código ${codigoSaida ?? 'desconhecido'}`;
  // Não grava caminhos de disco (nem do computador, nem do servidor): só o motivo.
  return bruta
    .replace(/[A-Za-z]:\\[^'"\s]*/g, '<caminho>')
    .replace(/\/(home|Users|tmp|opt)\/[^'"\s]*/g, '<caminho>')
    .replace(/file:\/\/\/\S*/g, '<caminho>')
    .slice(0, 400);
}
