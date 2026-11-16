import exemplo from '../../../data/exemplo/cronogramas/cronogramas.json' with { type: 'json' };
import { contextoDados } from '../repositorio/contexto.ts';
import type { Cronogramas } from './tipos.ts';
export function carregarCronogramas(): Cronogramas {
 const contexto = contextoDados.getStore();
 if (!contexto && import.meta.env?.SSR) throw new Error('Contexto do repositório indisponível');
 return contexto?.cronogramas ?? exemplo as Cronogramas;
}
