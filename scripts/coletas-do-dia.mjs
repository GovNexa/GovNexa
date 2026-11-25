// Atualização diária dos dados (regra do dono, 25/11/2026; CLAUDE.md, seção 1.2).
// Mostra, para cada coletor de data/core/status-coletas.json, o resultado e se o último sucesso é de HOJE (dia de Brasília).
// Só lê o arquivo; não coleta nada. Uso: node scripts/coletas-do-dia.mjs [caminho-do-status]
import { readFileSync } from 'node:fs';

const caminho = process.argv[2] ?? 'data/core/status-coletas.json';
const diaBr = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const dataHoraBr = (iso) => {
  if (!iso) return 'nunca';
  const p = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
};

const hoje = diaBr(new Date());
const coletores = JSON.parse(readFileSync(caminho, 'utf8')).coletores ?? {};
const pendentes = [];
for (const [nome, c] of Object.entries(coletores)) {
  const deHoje = c.ultimo_sucesso ? diaBr(new Date(c.ultimo_sucesso)) === hoje : false;
  if (!deHoje) pendentes.push(nome);
  console.log(`${deHoje ? 'OK      ' : 'ATUALIZAR'} ${nome.padEnd(18)} último sucesso: ${dataHoraBr(c.ultimo_sucesso).padEnd(16)} última tentativa: ${c.resultado ?? '?'}${c.erro ? ` (${String(c.erro).slice(0, 80)})` : ''}`);
}
console.log(pendentes.length ? `\nA atualizar hoje: ${pendentes.join(', ')}` : '\nTodos os coletores foram atualizados hoje.');
