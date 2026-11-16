import exemplo from '../../../data/exemplo/carteira/carteira.json' with { type: 'json' };
import { contextoDados } from '../repositorio/contexto.ts';
import type { Carteira } from './tipos.ts';
export function carregarCarteira(): Carteira {
 const contexto = contextoDados.getStore();
 if (!contexto && import.meta.env?.SSR) throw new Error('Contexto do repositório indisponível');
 return contexto?.carteira ?? exemplo as Carteira;
}
export function caminhoCarteira(): string { return 'data/exemplo/carteira/carteira.json'; }
