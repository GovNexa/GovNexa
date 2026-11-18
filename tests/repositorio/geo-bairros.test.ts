import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bancoTeste } from '../helpers/d1.ts';
import { criarRepositorioD1 } from '../../src/lib/repositorio/d1.ts';
import { criarRepositorioJson } from '../../src/lib/repositorio/json.ts';
import { contextoDados } from '../../src/lib/repositorio/contexto.ts';
import { carregarGeoBairros, lerGeoBairrosDoRepositorio, obrasDoMapa } from '../../src/lib/mapa/obras.ts';
import { carregarCarteira } from '../../src/lib/carteira/carga.ts';
import { gerarSql } from '../../scripts/geocodificar-bairros.ts';

test('D1 filtra centros por prefeitura; contexto usa banco e vazio cai no exemplo', async () => {
  const { db, sqlite } = bancoTeste();
  const carteira = carregarCarteira();
  const exemplo = carregarGeoBairros();
  const contexto = { carteira, cronogramas: { prefeitura_id: carteira.prefeitura_id, fonte: carteira.fonte, cronogramas: [] }, historico: { registros: [] } };
  try {
    const repo = criarRepositorioD1(db, 5208707);
    const vazio = await repo.listarGeoBairros!();
    assert.deepEqual(await lerGeoBairrosDoRepositorio(repo), exemplo);
    assert.deepEqual(await lerGeoBairrosDoRepositorio(), exemplo);
    contextoDados.run({ ...contexto, geoBairros: vazio }, () => assert.deepEqual(carregarGeoBairros(), exemplo));
    assert.deepEqual(await criarRepositorioJson().listarGeoBairros!(), exemplo);
    const geo = { bairros: { 'Bairro Exemplo': { busca: 'Exemplo', encontrado: true, lat: -16.68, lng: -49.26 } }, fonte: 'exemplo fictício', gerado_em: '2026-11-17' };
    sqlite.exec(gerarSql(geo, 5208707));
    sqlite.exec("INSERT INTO bairro_geo VALUES(999,'Outro Exemplo','Outro',0,NULL,NULL,'exemplo','')");
    assert.deepEqual(await repo.listarGeoBairros!(), geo);
    assert.deepEqual(await lerGeoBairrosDoRepositorio(repo), geo);
    assert.deepEqual(Object.keys((await criarRepositorioD1(db, 999).listarGeoBairros!()).bairros), ['Outro Exemplo']);
    contextoDados.run({ ...contexto, geoBairros: await repo.listarGeoBairros!() }, () => {
      assert.deepEqual(carregarGeoBairros(), geo);
      const projeto = { ...carteira.projetos[0], localizacao: null, regiao: ' Centro ' };
      const { obras } = obrasDoMapa({ ...carteira, projetos: [projeto] }, carregarGeoBairros(), '2026-11-17');
      assert.equal(obras[0].precisao, 'bairro');
      assert.equal(obras[0].regiao, 'Centro');
    });
    sqlite.exec('DROP TABLE bairro_geo');
    const fallback = await lerGeoBairrosDoRepositorio(repo);
    contextoDados.run({ ...contexto, geoBairros: fallback }, () => assert.deepEqual(carregarGeoBairros(), exemplo));
  } finally { sqlite.close(); }
});
