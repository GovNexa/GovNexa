/**
 * Datas no padrão brasileiro, usado em todo o GovNexa:
 * - só o dia: DD/MM/AAAA;
 * - dia e hora: DD/MM/AAAA HH:MM:SS (24 horas, horário de Brasília).
 *
 * Quando a fonte não tem segundos (ex.: SEI, que registra só HH:MM), mostre o que a fonte tem:
 * completar com ":00" seria inventar precisão.
 */
export const FUSO_BRASILIA = 'America/Sao_Paulo';

const SO_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 'AAAA-MM-DD' (sem fuso) ou data e hora ISO/Date (convertida para Brasília) → DD/MM/AAAA. */
export function dataBr(valor: string | Date): string {
  if (typeof valor === 'string') {
    const m = valor.trim().match(SO_DIA);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const p = partes(valor);
  return p ? `${p.day}/${p.month}/${p.year}` : String(valor);
}

/** Data e hora ISO/Date → DD/MM/AAAA HH:MM:SS no horário de Brasília. */
export function dataHoraBr(valor: string | Date): string {
  const p = partes(valor);
  return p ? `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}` : String(valor);
}

/** Usa DD/MM/AAAA quando o valor é só um dia e DD/MM/AAAA HH:MM:SS quando tem hora. */
export function dataOuDataHoraBr(valor: string | Date): string {
  return typeof valor === 'string' && SO_DIA.test(valor.trim()) ? dataBr(valor) : dataHoraBr(valor);
}

function partes(valor: string | Date): Record<string, string> | null {
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return Object.fromEntries(
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: FUSO_BRASILIA,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
}
