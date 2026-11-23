// @ts-nocheck
// Casos de abuso da migração 0011 (portados de validar.mjs, os mesmos 92 casos validados pela Opus). Rodam sobre o banco de teste (0001 a 0011).
export function rodarCasosMigracao(s: any): { ok: number; falhas: number; mensagens: string[] } {
  const mensagens: string[] = [];
  const console = { log: (...a: unknown[]) => { mensagens.push(a.join(' ')); } };
  let ok = 0, falhas = 0;
  const passa = (n, sql) => { try { s.exec(sql); ok++; } catch (e) { falhas++; console.log('FALHOU (devia passar):', n, e.message); } };
  const recusa = (n, sql) => { try { s.exec('SAVEPOINT t'); s.exec(sql); falhas++; console.log('PASSOU (devia recusar):', n); s.exec('ROLLBACK TO t'); s.exec('RELEASE t'); } catch { ok++; s.exec('ROLLBACK TO t'); s.exec('RELEASE t'); } };
  const P = 5208707, Q = 5300108, A = '90000001000129', B = '90000002000173', ALFA = '12ABC34501DE35';
  const EM = '2026-11-23T12:00:00.000Z';
  passa('prefeituras', `INSERT INTO prefeitura (id, nome, uf) VALUES (${P}, 'T', 'GO'), (${Q}, 'O', 'DF')`);
  passa('contratacoes', `INSERT INTO contratacao (prefeitura_id, id, nome, etapa, etapa_desde, criada_por) VALUES (${P}, 'C-1', 'x', 'publicada', '2026-01-01', 'a'), (${P}, 'C-2', 'y', 'publicada', '2026-01-01', 'a'), (${Q}, 'C-9', 'z', 'publicada', '2026-01-01', 'a')`);
  passa('orgao A', `INSERT INTO pncp_orgao (prefeitura_id, id, cnpj, nome, criado_por) VALUES (${P}, 'O-A', '${A}', 'Secretaria Exemplo de Obras', 'adm')`);
  passa('orgao alfanumérico', `INSERT INTO pncp_orgao (prefeitura_id, id, cnpj, nome, criado_por) VALUES (${P}, 'O-ALFA', '${ALFA}', 'Fundo Exemplo', 'adm')`);
  passa('mesmo CNPJ em outra prefeitura', `INSERT INTO pncp_orgao (prefeitura_id, id, cnpj, nome, criado_por) VALUES (${Q}, 'O-A', '${A}', 'Outra', 'adm')`);
  recusa('CNPJ duplicado', `INSERT INTO pncp_orgao (prefeitura_id, id, cnpj, nome, criado_por) VALUES (${P}, 'O-X', '${A}', 'Dup', 'adm')`);
  recusa('CNPJ curto', `INSERT INTO pncp_orgao (prefeitura_id, id, cnpj, nome, criado_por) VALUES (${P}, 'O-X', '9000000100012', 'n', 'adm')`);
  recusa('CNPJ com pontuação', `INSERT INTO pncp_orgao (prefeitura_id, id, cnpj, nome, criado_por) VALUES (${P}, 'O-X', '90.000.001/000', 'n', 'adm')`);
  recusa('CNPJ minúsculo', `INSERT INTO pncp_orgao (prefeitura_id, id, cnpj, nome, criado_por) VALUES (${P}, 'O-X', '12abc34501de35', 'n', 'adm')`);
  recusa('CNPJ DV letra', `INSERT INTO pncp_orgao (prefeitura_id, id, cnpj, nome, criado_por) VALUES (${P}, 'O-X', '12ABC34501DEAB', 'n', 'adm')`);
  recusa('id sem O-', `INSERT INTO pncp_orgao (prefeitura_id, id, cnpj, nome, criado_por) VALUES (${P}, 'X-1', '${B}', 'n', 'adm')`);
  recusa('nome vazio', `INSERT INTO pncp_orgao (prefeitura_id, id, cnpj, nome, criado_por) VALUES (${P}, 'O-B', '${B}', '  ', 'adm')`);
  recusa('apagar órgão', `DELETE FROM pncp_orgao WHERE id = 'O-ALFA'`);
  recusa('trocar CNPJ', `UPDATE pncp_orgao SET cnpj = '${B}' WHERE prefeitura_id = ${P} AND id = 'O-A'`);
  passa('editar nome', `UPDATE pncp_orgao SET nome = 'Secretaria Exemplo de Infraestrutura', revisao = revisao + 1 WHERE prefeitura_id = ${P} AND id = 'O-A'`);
  const V = (id, c, o, cnpj, seq, extra = '') => `INSERT INTO contratacao_pncp (prefeitura_id, id, contratacao_id, orgao_id, cnpj, ano, sequencial, numero_controle, modo, vinculado_por, vinculado_em${extra ? ', ' + extra.split('|')[0] : ''}) VALUES (${P}, '${id}', '${c}', '${o}', '${cnpj}', 2026, ${seq}, '${cnpj}-1-${String(seq).padStart(6, '0')}/2026', 'manual', 'ed', '${EM}'${extra ? ', ' + extra.split('|')[1] : ''})`;
  passa('vínculo C-1', V('V-1', 'C-1', 'O-A', A, 1));
  recusa('segundo vínculo ativo da C-1', V('V-2', 'C-1', 'O-A', A, 2));
  recusa('mesma compra em outra contratação', V('V-2', 'C-2', 'O-A', A, 1));
  recusa('número de controle incoerente', V('V-2', 'C-2', 'O-A', A, 2).replace('-1-000002/2026', '-1-000003/2026'));
  recusa('órgão com outro CNPJ', V('V-2', 'C-2', 'O-A', ALFA, 2));
  recusa('contratação de outra prefeitura', V('V-2', 'C-9', 'O-A', A, 2));
  recusa('órgão inexistente', V('V-2', 'C-2', 'O-Z', A, 2));
  recusa('modo inválido', V('V-2', 'C-2', 'O-A', A, 2).replace("'manual'", "'auto'"));
  recusa('ano 2020', V('V-2', 'C-2', 'O-A', A, 2).replaceAll('2026', '2020'));
  recusa('sequencial 0', V('V-2', 'C-2', 'O-A', A, 0));
  recusa('status sem tentativa', V('V-2', 'C-2', 'O-A', A, 2, "ultimo_status|'ok'"));
  recusa('vinculado_em sem Z', V('V-2', 'C-2', 'O-A', A, 2).replace(EM, '2026-11-23 12:00'));
  passa('vínculo alfanumérico', V('V-3', 'C-2', 'O-ALFA', ALFA, 7));
  recusa('trocar contratação do vínculo', `UPDATE contratacao_pncp SET contratacao_id = 'C-2' WHERE prefeitura_id = ${P} AND id = 'V-1'`);
  recusa('apagar vínculo', `DELETE FROM contratacao_pncp WHERE id = 'V-1'`);
  const COMPRA = (v, extra = '') => `INSERT INTO pncp_compra (prefeitura_id, vinculo_id, situacao_id, existe_resultado, srp, obra, coletado_em${extra ? ', ' + extra.split('|')[0] : ''}) VALUES (${P}, '${v}', 1, 1, 0, 'sim', '${EM}'${extra ? ', ' + extra.split('|')[1] : ''})`;
  recusa('valor negativo', COMPRA('V-1', 'valor_estimado|-1'));
  recusa('valor fracionário', COMPRA('V-1', 'valor_homologado|1.5'));
  recusa('obra inválida', COMPRA('V-1').replace("'sim'", "'talvez'"));
  recusa('objeto enorme', COMPRA('V-1', `objeto|'${'x'.repeat(2001)}'`));
  passa('retrato da compra', COMPRA('V-1', 'valor_estimado, objeto|33447543, \'<script>alert(1)</script>\''));
  passa('regravar retrato (lote)', `BEGIN; DELETE FROM pncp_resultado WHERE prefeitura_id = ${P} AND vinculo_id = 'V-1'; DELETE FROM pncp_item WHERE prefeitura_id = ${P} AND vinculo_id = 'V-1';
    INSERT INTO pncp_compra (prefeitura_id, vinculo_id, situacao_id, existe_resultado, srp, obra, coletado_em) VALUES (${P}, 'V-1', 1, 1, 1, 'sim', '${EM}') ON CONFLICT (prefeitura_id, vinculo_id) DO UPDATE SET srp = excluded.srp, coletado_em = excluded.coletado_em;
    INSERT INTO pncp_item (prefeitura_id, vinculo_id, numero_item, situacao_id, tem_resultado) VALUES (${P}, 'V-1', 1, 2, 1);
    INSERT INTO pncp_resultado (prefeitura_id, vinculo_id, numero_item, sequencial_resultado, tipo_pessoa, fornecedor_ni, fornecedor_nome, ordem_classificacao, valor_homologado, data_resultado) VALUES (${P}, 'V-1', 1, 1, 'PJ', '${B}', 'Construtora Exemplo', 1, 25085000, '2026-07-09');
    INSERT INTO pncp_resultado (prefeitura_id, vinculo_id, numero_item, sequencial_resultado, tipo_pessoa, fornecedor_nome, ordem_classificacao) VALUES (${P}, 'V-1', 1, 2, 'PF', 'Pessoa Exemplo', 2); COMMIT;`);
  recusa('CPF de pessoa física', `INSERT INTO pncp_resultado (prefeitura_id, vinculo_id, numero_item, sequencial_resultado, tipo_pessoa, fornecedor_ni) VALUES (${P}, 'V-1', 1, 3, 'PF', '12345678909')`);
  recusa('NI de PJ com 11 dígitos', `INSERT INTO pncp_resultado (prefeitura_id, vinculo_id, numero_item, sequencial_resultado, tipo_pessoa, fornecedor_ni) VALUES (${P}, 'V-1', 1, 3, 'PJ', '12345678909')`);
  recusa('NI sem tipo de pessoa', `INSERT INTO pncp_resultado (prefeitura_id, vinculo_id, numero_item, sequencial_resultado, fornecedor_ni) VALUES (${P}, 'V-1', 1, 3, '${B}')`);
  recusa('estrangeiro com NI', `INSERT INTO pncp_resultado (prefeitura_id, vinculo_id, numero_item, sequencial_resultado, tipo_pessoa, fornecedor_ni) VALUES (${P}, 'V-1', 1, 3, 'PE', '${B}')`);
  recusa('data do resultado inválida', `INSERT INTO pncp_resultado (prefeitura_id, vinculo_id, numero_item, sequencial_resultado, data_resultado) VALUES (${P}, 'V-1', 1, 3, '2026-02-30')`);
  recusa('resultado de item inexistente', `INSERT INTO pncp_resultado (prefeitura_id, vinculo_id, numero_item, sequencial_resultado) VALUES (${P}, 'V-1', 9, 1)`);
  recusa('alterar item (só regravar)', `UPDATE pncp_item SET situacao_id = 3 WHERE prefeitura_id = ${P} AND vinculo_id = 'V-1'`);
  recusa('apagar retrato da compra', `DELETE FROM pncp_compra WHERE vinculo_id = 'V-1'`);
  recusa('retrato de vínculo de outra prefeitura', `INSERT INTO pncp_compra (prefeitura_id, vinculo_id, situacao_id, existe_resultado, srp, obra, coletado_em) VALUES (${Q}, 'V-1', 1, 0, 0, 'sim', '${EM}')`);
  passa('reservar tentativa', `UPDATE contratacao_pncp SET ultima_tentativa_em = '${EM}', ultimo_status = 'ok', ultima_coleta_em = '${EM}' WHERE prefeitura_id = ${P} AND id = 'V-1' AND desvinculado_em IS NULL`);
  recusa('status inválido', `UPDATE contratacao_pncp SET ultimo_status = 'quebrado' WHERE prefeitura_id = ${P} AND id = 'V-1'`);
  recusa('erro longo', `UPDATE contratacao_pncp SET ultimo_erro = '${'e'.repeat(201)}' WHERE prefeitura_id = ${P} AND id = 'V-1'`);
  recusa('desvincular sem autor', `UPDATE contratacao_pncp SET desvinculado_em = '${EM}' WHERE prefeitura_id = ${P} AND id = 'V-1'`);
  passa('desvincular', `UPDATE contratacao_pncp SET desvinculado_em = '${EM}', desvinculado_por = 'ed' WHERE prefeitura_id = ${P} AND id = 'V-1'`);
  recusa('vínculo desfeito não muda', `UPDATE contratacao_pncp SET ultimo_status = 'erro' WHERE prefeitura_id = ${P} AND id = 'V-1'`);
  recusa('retrato de vínculo desfeito (update)', `UPDATE pncp_compra SET srp = 0 WHERE prefeitura_id = ${P} AND vinculo_id = 'V-1'`);
  recusa('item de vínculo desfeito', `INSERT INTO pncp_item (prefeitura_id, vinculo_id, numero_item, situacao_id, tem_resultado) VALUES (${P}, 'V-1', 2, 1, 0)`);
  passa('religar a mesma compra depois de desfeito', V('V-4', 'C-1', 'O-A', A, 1));
  passa('desativar órgão', `UPDATE pncp_orgao SET ativo = 0 WHERE prefeitura_id = ${P} AND id = 'O-ALFA'`);
  recusa('vincular a órgão inativo', V('V-5', 'C-2', 'O-ALFA', ALFA, 8));
  s.exec(`UPDATE contratacao SET removida_em = '${EM}', removida_por = 'a' WHERE prefeitura_id = ${P} AND id = 'C-2'`);
  recusa('vincular contratação removida', `UPDATE pncp_orgao SET ativo = 1 WHERE id = 'O-ALFA' AND prefeitura_id = ${P}; ` + V('V-5', 'C-2', 'O-ALFA', ALFA, 8));
  const EV = (tipo, cols, vals) => `INSERT INTO evento_pncp (id, prefeitura_id, tipo, autor, em, ${cols}) VALUES ('${crypto.randomUUID()}', ${P}, '${tipo}', 'ed', '${EM}', ${vals})`;
  passa('evento de órgão', EV('orgao_cadastrado', 'orgao_id', "'O-A'"));
  passa('evento de vínculo', EV('vinculo', 'contratacao_id, vinculo_id, detalhe', `'C-1', 'V-4', '{"obra":"sim"}'`));
  recusa('evento de órgão com contratação', EV('orgao_editado', 'orgao_id, contratacao_id', "'O-A', 'C-1'"));
  recusa('evento de coleta sem vínculo', EV('coleta_ok', 'contratacao_id', "'C-1'"));
  recusa('tipo de evento inválido', EV('apagado', 'contratacao_id, vinculo_id', "'C-1', 'V-4'"));
  recusa('detalhe não objeto', EV('coleta_erro', 'contratacao_id, vinculo_id, detalhe', `'C-1', 'V-4', '[1]'`));
  recusa('evento com vínculo de outra prefeitura', `INSERT INTO evento_pncp (id, prefeitura_id, tipo, autor, em, contratacao_id, vinculo_id) VALUES ('x1', ${Q}, 'coleta_ok', 'ed', '${EM}', 'C-9', 'V-4')`);
  recusa('evento sem Z', EV('coleta_ok', 'contratacao_id, vinculo_id', "'C-1', 'V-4'").replace(EM, '2026-11-23T12:00:00'));
  recusa('alterar Histórico', `UPDATE evento_pncp SET autor = 'x'`);
  recusa('apagar Histórico', `DELETE FROM evento_pncp`);
  // ——— DELTA 1 (itens 1, 3, 4, 10, 18, 19)
  const UP = (sql) => `UPDATE contratacao_pncp SET ${sql} WHERE prefeitura_id = ${P} AND id = 'V-4'`;
  recusa('tentativa sem Z', UP("ultima_tentativa_em = '2026-11-23 12:00:00', ultimo_status = 'ok'"));
  recusa('coleta com mês 13', UP("ultima_tentativa_em = '" + EM + "', ultima_coleta_em = '2026-13-01T00:00:00Z'"));
  recusa('desvinculado_em texto', UP("desvinculado_em = 'ontem', desvinculado_por = 'ed'"));
  recusa('órgão criado_em só dia', `INSERT INTO pncp_orgao (prefeitura_id, id, cnpj, nome, criado_por, criado_em) VALUES (${P}, 'O-B', '${B}', 'n', 'adm', '2026-11-23')`);
  recusa('órgão atualizado_em inválido', `UPDATE pncp_orgao SET atualizado_em = '2026-11-23T25:00:00Z' WHERE prefeitura_id = ${P} AND id = 'O-A'`);
  recusa('coletado_em sem hora válida', COMPRA('V-4').replace(EM, '2026-11-23T99:00:00Z'));
  passa('data PNCP com hora', COMPRA('V-4', "data_publicacao, data_abertura, data_atualizacao_global|'2026-07-09T16:42:27', '2026-07-09', '2026-07-09T16:42:27'"));
  s.exec(`DELETE FROM pncp_item WHERE vinculo_id = 'V-4'`);
  const COMPRA_UPD = (c, v) => `UPDATE pncp_compra SET ${c} = ${v} WHERE prefeitura_id = ${P} AND vinculo_id = 'V-4'`;
  recusa('data PNCP sem segundos', COMPRA_UPD('data_publicacao', "'2026-07-09T16:42'"));
  recusa('data PNCP inexistente', COMPRA_UPD('data_abertura', "'2026-02-30'"));
  recusa('data PNCP em formato BR', COMPRA_UPD('data_encerramento', "'09/07/2026'"));
  recusa('data do resultado fora do intervalo', `INSERT INTO pncp_item (prefeitura_id, vinculo_id, numero_item, situacao_id, tem_resultado) VALUES (${P}, 'V-4', 1, 2, 1); INSERT INTO pncp_resultado (prefeitura_id, vinculo_id, numero_item, sequencial_resultado, data_resultado) VALUES (${P}, 'V-4', 1, 1, '1999-12-31')`);
  // Item 1: gravação por json_each, em pedaços de até 500 linhas (D1: ≤ 100 parâmetros por instrução).
  passa('contratação C-3 e vínculo V-6', `INSERT INTO contratacao (prefeitura_id, id, nome, etapa, etapa_desde, criada_por) VALUES (${P}, 'C-3', 'w', 'publicada', '2026-01-01', 'a'); ` + V('V-6', 'C-3', 'O-A', A, 2));
  const SQL_ITENS = `INSERT INTO pncp_item (prefeitura_id, vinculo_id, numero_item, descricao, material_servico, categoria_id, categoria_nome, criterio_nome, situacao_id, situacao_nome, tem_resultado, valor_total)
    SELECT ?, ?, json_extract(value, '$.numero_item'), json_extract(value, '$.descricao'), json_extract(value, '$.material_servico'), json_extract(value, '$.categoria_id'), json_extract(value, '$.categoria_nome'), json_extract(value, '$.criterio_nome'), json_extract(value, '$.situacao_id'), json_extract(value, '$.situacao_nome'), json_extract(value, '$.tem_resultado'), json_extract(value, '$.valor_total') FROM json_each(?)`;
  const SQL_RESULTADOS = `INSERT INTO pncp_resultado (prefeitura_id, vinculo_id, numero_item, sequencial_resultado, tipo_pessoa, fornecedor_ni, fornecedor_nome, ordem_classificacao, situacao_id, situacao_nome, valor_homologado, data_resultado, motivo_cancelamento)
    SELECT ?, ?, json_extract(value, '$.numero_item'), json_extract(value, '$.sequencial_resultado'), json_extract(value, '$.tipo_pessoa'), json_extract(value, '$.fornecedor_ni'), json_extract(value, '$.fornecedor_nome'), json_extract(value, '$.ordem_classificacao'), json_extract(value, '$.situacao_id'), json_extract(value, '$.situacao_nome'), json_extract(value, '$.valor_homologado'), json_extract(value, '$.data_resultado'), json_extract(value, '$.motivo_cancelamento') FROM json_each(?)`;
  const itens = Array.from({ length: 200 }, (_, i) => ({ numero_item: i + 1, descricao: 'Item ' + (i + 1), material_servico: 'S', categoria_id: null, categoria_nome: null, criterio_nome: 'Menor preço', situacao_id: 2, situacao_nome: 'Homologado', tem_resultado: 1, valor_total: 100000 + i }));
  const resultados = itens.flatMap((it) => Array.from({ length: 50 }, (_, k) => ({ numero_item: it.numero_item, sequencial_resultado: k + 1, tipo_pessoa: 'PJ', fornecedor_ni: B, fornecedor_nome: 'Empresa Exemplo ' + k, ordem_classificacao: k + 1, situacao_id: k ? 3 : 1, situacao_nome: null, valor_homologado: 90000 + k, data_resultado: '2026-09-15', motivo_cancelamento: null })));
  const pedacos = (l) => Array.from({ length: Math.ceil(l.length / 500) }, (_, i) => l.slice(i * 500, i * 500 + 500));
  let instrucoes = 0;
  try {
    s.exec('BEGIN');
    const lote = [
      [`DELETE FROM pncp_resultado WHERE prefeitura_id = ? AND vinculo_id = ?`, [P, 'V-6']],
      [`DELETE FROM pncp_item WHERE prefeitura_id = ? AND vinculo_id = ?`, [P, 'V-6']],
      [`INSERT INTO pncp_compra (prefeitura_id, vinculo_id, situacao_id, existe_resultado, srp, obra, coletado_em) VALUES (?, ?, 1, 1, 1, 'sim', ?) ON CONFLICT (prefeitura_id, vinculo_id) DO UPDATE SET coletado_em = excluded.coletado_em`, [P, 'V-6', EM]],
      ...pedacos(itens).map((p) => [SQL_ITENS, [P, 'V-6', JSON.stringify(p)]]),
      ...pedacos(resultados).map((p) => [SQL_RESULTADOS, [P, 'V-6', JSON.stringify(p)]]),
      [`UPDATE contratacao_pncp SET ultima_tentativa_em = ?, ultima_coleta_em = ?, ultimo_status = 'ok', ultimo_erro = NULL WHERE prefeitura_id = ? AND id = ? AND desvinculado_em IS NULL`, [EM, EM, P, 'V-6']],
      [`INSERT INTO evento_pncp (id, prefeitura_id, tipo, contratacao_id, vinculo_id, autor, em, detalhe) SELECT ?, ?, 'coleta_ok', 'C-3', 'V-6', 'ed', ?, '{"itens":200,"resultados":10000}' WHERE changes() = 1`, [crypto.randomUUID(), P, EM]],
    ];
    for (const [sql, v] of lote) { s.prepare(sql).run(...v); instrucoes++; }
    s.exec('COMMIT');
    const n = s.prepare(`SELECT (SELECT count(*) FROM pncp_item WHERE vinculo_id = 'V-6') AS i, (SELECT count(*) FROM pncp_resultado WHERE vinculo_id = 'V-6') AS r, (SELECT typeof(tem_resultado) FROM pncp_item WHERE vinculo_id = 'V-6' LIMIT 1) AS t`).get();
    if (n.i === 200 && n.r === 10000 && n.t === 'integer' && instrucoes <= 50) ok++; else { falhas++; console.log('json_each: contagem', n, instrucoes); }
    console.log(`json_each: 200 itens × 50 resultados em ${instrucoes} instruções`);
  } catch (e) { s.exec('ROLLBACK'); falhas++; console.log('FALHOU json_each', e.message); }
  const run = (sql, v) => s.prepare(sql).run(...v);
  const recusaJson = (n, sql, v) => { s.exec('SAVEPOINT j'); try { run(sql, v); falhas++; console.log('PASSOU (devia recusar):', n); } catch { ok++; } s.exec('ROLLBACK TO j'); s.exec('RELEASE j'); };
  recusaJson('json_each com CPF de PF', SQL_RESULTADOS, [P, 'V-6', JSON.stringify([{ numero_item: 1, sequencial_resultado: 99, tipo_pessoa: 'PF', fornecedor_ni: '00000000191' }])]);
  recusaJson('json_each com booleano texto', SQL_ITENS, [P, 'V-6', JSON.stringify([{ numero_item: 999, situacao_id: 1, tem_resultado: 'true' }])]);
  recusaJson('json_each com valor fracionário', SQL_ITENS, [P, 'V-6', JSON.stringify([{ numero_item: 999, situacao_id: 1, tem_resultado: 0, valor_total: 1.5 }])]);
  // Item 3: remover da E12 desliga o vínculo no MESMO lote.
  const EM2 = '2026-11-23T13:00:00.000Z';
  try {
    s.exec('BEGIN');
    run(`UPDATE contratacao SET removida_em = ?, removida_por = ? WHERE prefeitura_id = ? AND id = ? AND revisao = ? AND removida_em IS NULL`, [EM2, 'ed', P, 'C-3', 0]);
    run(`INSERT INTO evento_contratacao (id, prefeitura_id, contratacao_id, tipo, autor, em, motivo) SELECT ?, ?, ?, 'removida', ?, ?, ? WHERE changes() = 1`, [crypto.randomUUID(), P, 'C-3', 'ed', EM2, 'teste']);
    run(`UPDATE contratacao_pncp SET desvinculado_em = ?, desvinculado_por = ? WHERE prefeitura_id = ? AND contratacao_id = ? AND desvinculado_em IS NULL AND EXISTS (SELECT 1 FROM contratacao WHERE prefeitura_id = ? AND id = ? AND removida_em = ? AND removida_por = ?)`, [EM2, 'ed', P, 'C-3', P, 'C-3', EM2, 'ed']);
    run(`INSERT INTO evento_pncp (id, prefeitura_id, tipo, contratacao_id, vinculo_id, autor, em, descricao) SELECT ?, prefeitura_id, 'desvinculo', contratacao_id, id, ?, ?, 'Contratação removida' FROM contratacao_pncp WHERE prefeitura_id = ? AND contratacao_id = ? AND desvinculado_em = ? AND desvinculado_por = ? AND changes() = 1`, [crypto.randomUUID(), 'ed', EM2, P, 'C-3', EM2, 'ed']);
    s.exec('COMMIT');
    const r = s.prepare(`SELECT (SELECT desvinculado_em FROM contratacao_pncp WHERE id = 'V-6') AS d, (SELECT count(*) FROM evento_pncp WHERE vinculo_id = 'V-6' AND tipo = 'desvinculo') AS e`).get();
    if (r.d === EM2 && r.e === 1) ok++; else { falhas++; console.log('remover E12 não desligou', r); }
  } catch (e) { s.exec('ROLLBACK'); falhas++; console.log('FALHOU remover E12', e.message); }
  recusa('retrato depois da remoção', `INSERT INTO pncp_item (prefeitura_id, vinculo_id, numero_item, situacao_id, tem_resultado) VALUES (${P}, 'V-6', 999, 1, 0)`);
  // Item 4: gravarFalha não toca vínculo desfeito nem grava evento.
  try {
    s.exec('BEGIN');
    run(`UPDATE contratacao_pncp SET ultimo_status = ?, ultimo_erro = ? WHERE prefeitura_id = ? AND id = ? AND desvinculado_em IS NULL`, ['erro', 'x', P, 'V-6']);
    run(`INSERT INTO evento_pncp (id, prefeitura_id, tipo, contratacao_id, vinculo_id, autor, em, descricao) SELECT ?, ?, 'coleta_erro', 'C-3', 'V-6', 'ed', ?, 'x' WHERE changes() = 1`, [crypto.randomUUID(), P, EM2]);
    s.exec('COMMIT');
    const e = s.prepare(`SELECT count(*) AS n FROM evento_pncp WHERE vinculo_id = 'V-6' AND tipo = 'coleta_erro'`).get();
    if (e.n === 0) ok++; else { falhas++; console.log('gravarFalha gravou em vínculo desfeito'); }
  } catch (e) { s.exec('ROLLBACK'); falhas++; console.log('FALHOU gravarFalha', e.message); }
  // Itens 17-19: Histórico da secretaria.
  passa('evento de edição da secretaria', EV('orgao_editado', 'orgao_id, detalhe', `'O-A', '{"nome":{"de":"Secretaria Exemplo de Obras","para":"Secretaria Exemplo de Infraestrutura"}}'`));
  passa('evento de desativação', EV('orgao_desativado', 'orgao_id, descricao', `'O-ALFA', 'Secretaria desativada: Fundo Exemplo (12.ABC.345/01DE-35)'`));
  recusa('evento de secretaria com vínculo', EV('orgao_reativado', 'orgao_id, vinculo_id', "'O-A', 'V-4'"));
  recusa('evento de secretaria sem órgão', EV('orgao_cadastrado', 'descricao', "'x'"));
  recusa('evento de secretaria de outra prefeitura', `INSERT INTO evento_pncp (id, prefeitura_id, tipo, autor, em, orgao_id) VALUES ('x2', ${Q}, 'orgao_editado', 'ed', '${EM}', 'O-ALFA')`);
  const planoOrgao = s.prepare(`EXPLAIN QUERY PLAN SELECT tipo, autor, em, descricao, detalhe FROM evento_pncp WHERE prefeitura_id = ? AND orgao_id = ? ORDER BY em DESC LIMIT 20`).all(P, 'O-A');
  console.log('plano histórico da secretaria:', planoOrgao.map((x) => x.detail).join(' | '));
  if (planoOrgao.some((x) => /evento_pncp_orgao_idx/.test(x.detail))) ok++; else { falhas++; console.log('índice da secretaria não usado'); }
  const plano = s.prepare(`EXPLAIN QUERY PLAN SELECT count(*) FROM evento_pncp WHERE prefeitura_id = ? AND tipo IN ('coleta_ok','coleta_erro') AND em >= ?`).all(P, EM);
  console.log('plano limite por prefeitura:', plano.map((x) => x.detail).join(' | '));
  console.log(`ok=${ok} falhas=${falhas}`);
  return { ok, falhas, mensagens };
}
