CREATE TABLE bairro_geo (
 prefeitura_id INTEGER NOT NULL,
 bairro TEXT NOT NULL,
 busca TEXT NOT NULL,
 encontrado INTEGER NOT NULL CHECK(encontrado IN (0,1)),
 lat REAL,
 lng REAL,
 fonte TEXT NOT NULL,
 gerado_em TEXT NOT NULL,
 PRIMARY KEY(prefeitura_id, bairro),
 CHECK ((encontrado = 1 AND lat IS NOT NULL AND lng IS NOT NULL
   AND lat BETWEEN -16.85 AND -16.45 AND lng BETWEEN -49.5 AND -49.05)
   OR (encontrado = 0 AND lat IS NULL AND lng IS NULL))
);
