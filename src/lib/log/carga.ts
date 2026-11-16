import exemplo from '../../../data/exemplo/historico/historico.json' with { type: 'json' };
import { contextoDados } from '../repositorio/contexto.ts';
import type { RegistroLog } from './tipos.ts';
export function carregarHistorico(): { registros: RegistroLog[] } {
 const contexto = contextoDados.getStore();
 if (!contexto && import.meta.env?.SSR) throw new Error('Contexto do repositório indisponível');
 return contexto?.historico ?? exemplo as { registros: RegistroLog[] };
}
