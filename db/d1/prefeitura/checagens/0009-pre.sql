-- Checagem SÓ DE LEITURA da migração 0009: lista as linhas de etapa_cronograma que a migração vai sanear
-- (valor vira NULL e o motivo entra em "pendencias"). Rodar no banco REMOTO antes de publicar e relatar ao dono.
-- 'ordem' fora da regra (<= 0) NÃO é saneada: a migração falharia inteira; corrija antes.
SELECT prefeitura_id, cronograma_id, ordem, 'ordem (migração falha)' AS campo, CAST(ordem AS TEXT) AS valor FROM etapa_cronograma WHERE ordem <= 0
UNION ALL SELECT prefeitura_id, cronograma_id, ordem, 'código cronograma#ordem com mais de 120 caracteres (migração falha)', cronograma_id || '#' || ordem FROM etapa_cronograma WHERE length(cronograma_id || '#' || ordem) > 120
UNION ALL SELECT prefeitura_id, cronograma_id, ordem, 'duracao_prevista', CAST(duracao_prevista AS TEXT) FROM etapa_cronograma WHERE duracao_prevista < 0
UNION ALL SELECT prefeitura_id, cronograma_id, ordem, 'inicio_previsto', inicio_previsto FROM etapa_cronograma WHERE inicio_previsto IS NOT NULL AND date(inicio_previsto) IS NOT inicio_previsto
UNION ALL SELECT prefeitura_id, cronograma_id, ordem, 'fim_previsto', fim_previsto FROM etapa_cronograma WHERE fim_previsto IS NOT NULL AND date(fim_previsto) IS NOT fim_previsto
UNION ALL SELECT prefeitura_id, cronograma_id, ordem, 'inicio_real', inicio_real FROM etapa_cronograma WHERE inicio_real IS NOT NULL AND date(inicio_real) IS NOT inicio_real
UNION ALL SELECT prefeitura_id, cronograma_id, ordem, 'fim_real', fim_real FROM etapa_cronograma WHERE fim_real IS NOT NULL AND date(fim_real) IS NOT fim_real
UNION ALL SELECT prefeitura_id, cronograma_id, ordem, 'fim_previsto (antes do início)', fim_previsto FROM etapa_cronograma
 WHERE date(inicio_previsto) IS inicio_previsto AND date(fim_previsto) IS fim_previsto AND inicio_previsto IS NOT NULL AND fim_previsto < inicio_previsto
UNION ALL SELECT prefeitura_id, cronograma_id, ordem, 'fim_real (antes do início)', fim_real FROM etapa_cronograma
 WHERE date(inicio_real) IS inicio_real AND date(fim_real) IS fim_real AND inicio_real IS NOT NULL AND fim_real < inicio_real
ORDER BY 1, 2, 3, 4;
