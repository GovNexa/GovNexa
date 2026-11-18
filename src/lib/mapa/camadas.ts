import type * as Leaflet from 'leaflet';

export type NomeCamada = 'mapa' | 'satelite' | 'hibrido';
export const ehCamada = (v: unknown): v is NomeCamada => v === 'mapa' || v === 'satelite' || v === 'hibrido';

export function criarCamadasFundo(L: typeof Leaflet): Record<NomeCamada, Leaflet.TileLayer[]> {
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
  const ATRIB_ESRI = 'Imagens © Esri — Fonte: Esri, Maxar, Earthstar Geographics e comunidade de usuários GIS';
  return {
    mapa: [L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© colaboradores do OpenStreetMap', maxZoom: 18 })],
    satelite: [L.tileLayer(`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, { attribution: ATRIB_ESRI, maxZoom: 18 })],
    hibrido: [
      L.tileLayer(`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, { attribution: ATRIB_ESRI, maxZoom: 18 }),
      L.tileLayer(`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 18 }),
      L.tileLayer(`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 18 }),
    ],
  };
}

/** Sem argumento lê a preferência; com argumento grava a escolha. */
export function preferenciaCamada(nome?: NomeCamada): NomeCamada {
  try {
    if (nome !== undefined) localStorage.setItem('govnexa-mapa-camada', nome);
    else {
      const lembrada = localStorage.getItem('govnexa-mapa-camada');
      return ehCamada(lembrada) ? lembrada : 'mapa';
    }
  } catch { /* Sem armazenamento: o mapa continua funcionando. */ }
  return nome ?? 'mapa';
}
