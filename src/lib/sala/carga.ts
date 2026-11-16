import exemplo from '../../../data/exemplo/sala-guerra/salas.json' with { type: 'json' };
import type { Salas } from './tipos.ts';
export function carregarSalas(): Salas { return exemplo as Salas; }
