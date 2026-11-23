// Posição das bolhas e dos marcadores do mapa das obras sem sobreposição (E4). Função pura, em pixels da camada do Leaflet.
// Cada alvo é tratado como um quadrado (a caixa clicável do ícone do Leaflet é quadrada): dois alvos nunca se tocam e ficam
// a `folga` px um do outro e dos controles do mapa (zoom, camadas, atribuição). Assim nenhum alvo cobre outro e todos
// mantêm pelo menos 24 x 24 px livres (critério 2.5.8 da WCAG 2.2, conferido pelo axe na regra target-size).

export interface Alvo { id: string; x: number; y: number; /** Metade do lado do quadrado (px). */ meio: number }
export interface Obstaculo { x: number; y: number; /** Metade da largura (px). */ meioL: number; /** Metade da altura (px). */ meioA: number }
export interface Posicao { x: number; y: number }

export const FOLGA_ALVOS = 4;
const PASSO = 4;
const CELULA = 64;
const MAX_ALVOS = 5000;

const finito = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const alvoValido = (a: Alvo): boolean => typeof a?.id === 'string' && finito(a.x) && finito(a.y) && finito(a.meio) && a.meio > 0 && a.meio <= 500;
const obstaculoValido = (o: Obstaculo): boolean => finito(o?.x) && finito(o?.y) && finito(o?.meioL) && finito(o?.meioA) && o.meioL >= 0 && o.meioA >= 0 && o.meioL <= 5000 && o.meioA <= 5000;

/** Grade de células para conferir colisão só com os vizinhos (centenas de marcadores sem custo quadrático). */
class Grade {
  private readonly celulas = new Map<string, Obstaculo[]>();
  readonly todos: Obstaculo[] = [];
  private faixa(o: Obstaculo, folga: number): [number, number, number, number] {
    return [
      Math.floor((o.x - o.meioL - folga) / CELULA), Math.floor((o.x + o.meioL + folga) / CELULA),
      Math.floor((o.y - o.meioA - folga) / CELULA), Math.floor((o.y + o.meioA + folga) / CELULA),
    ];
  }
  inserir(o: Obstaculo): void {
    this.todos.push(o);
    const [x0, x1, y0, y1] = this.faixa(o, 0);
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) {
      const chave = `${i},${j}`;
      const lista = this.celulas.get(chave);
      if (lista) lista.push(o); else this.celulas.set(chave, [o]);
    }
  }
  colide(c: Obstaculo, folga: number): boolean {
    const [x0, x1, y0, y1] = this.faixa(c, folga);
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) {
      for (const o of this.celulas.get(`${i},${j}`) ?? []) {
        if (Math.abs(c.x - o.x) < c.meioL + o.meioL + folga && Math.abs(c.y - o.y) < c.meioA + o.meioA + folga) return true;
      }
    }
    return false;
  }
}

/**
 * Devolve a posição de cada alvo. Ordem fixa (maior primeiro; empate pelo id), então o resultado é sempre o mesmo para a
 * mesma entrada. O alvo fica no ponto pedido se estiver livre; senão, no ponto livre mais próximo de uma espiral de anéis
 * de 4 em 4 px. Sempre há vaga: além do obstáculo mais distante nada colide, então a busca termina.
 */
export function posicionarSemSobrepor(alvos: readonly Alvo[], obstaculos: readonly Obstaculo[] = [], folga = FOLGA_ALVOS): Map<string, Posicao> {
  const f = finito(folga) && folga >= 0 && folga <= 100 ? folga : FOLGA_ALVOS;
  const ordem = alvos.filter(alvoValido).slice(0, MAX_ALVOS).sort((a, b) => b.meio - a.meio || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const grade = new Grade();
  for (const o of obstaculos) if (obstaculoValido(o)) grade.inserir({ x: o.x, y: o.y, meioL: o.meioL, meioA: o.meioA });
  const saida = new Map<string, Posicao>();
  for (const a of ordem) {
    if (saida.has(a.id)) continue;
    const caixa = (x: number, y: number): Obstaculo => ({ x, y, meioL: a.meio, meioA: a.meio });
    let pos: Posicao | null = grade.colide(caixa(a.x, a.y), f) ? null : { x: a.x, y: a.y };
    if (!pos) {
      let alcance = 0;
      for (const o of grade.todos) alcance = Math.max(alcance, Math.abs(o.x - a.x) + o.meioL, Math.abs(o.y - a.y) + o.meioA);
      alcance += a.meio + f + PASSO;
      for (let raio = PASSO; !pos; raio += PASSO) {
        const n = Math.max(8, Math.ceil((2 * Math.PI * raio) / Math.max(PASSO, a.meio / 2)));
        for (let k = 0; k < n; k++) {
          const angulo = (2 * Math.PI * k) / n;
          const x = a.x + Math.cos(angulo) * raio;
          const y = a.y + Math.sin(angulo) * raio;
          if (!grade.colide(caixa(x, y), f)) { pos = { x, y }; break; }
        }
        // Garantia: com raio além do alcance, o ponto de ângulo 0 está livre (o laço acima já o teria achado).
        if (!pos && raio > alcance) pos = { x: a.x + raio, y: a.y };
      }
    }
    if (!pos) continue;
    grade.inserir(caixa(pos.x, pos.y));
    saida.set(a.id, pos);
  }
  return saida;
}
