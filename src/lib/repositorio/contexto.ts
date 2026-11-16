import { AsyncLocalStorage } from 'node:async_hooks';
import type { Carteira } from '../carteira/tipos.ts';
import type { Cronogramas } from '../cronograma/tipos.ts';
import type { RegistroLog } from '../log/tipos.ts';
export const contextoDados = new AsyncLocalStorage<{ carteira: Carteira; cronogramas: Cronogramas; historico: { registros: RegistroLog[] } }>();
