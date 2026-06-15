-- ══════════════════════════════════════════════════════════════════
-- BISONTE — Schema operativo v1
-- Eje central: guia (nro único de Transoft)
-- ══════════════════════════════════════════════════════════════════

-- ── 1. CATÁLOGOS ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cat_sucursal (
    codigo      TEXT PRIMARY KEY,
    nombre      TEXT NOT NULL,
    tipo        TEXT,
    activa      BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cat_estado_guia (
    codigo      TEXT PRIMARY KEY,
    descripcion TEXT NOT NULL,
    proceso     TEXT
);

CREATE TABLE IF NOT EXISTS cat_referente (
    codigo      TEXT PRIMARY KEY,
    nombre      TEXT NOT NULL,
    tipo        TEXT,
    activo      BOOLEAN DEFAULT TRUE
);

-- ── 2. GUIAS (universo completo) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS guia (
    nro                  TEXT PRIMARY KEY,
    guiafec              TEXT,
    razsocc              TEXT,
    clase                TEXT,
    fechaedit            TIMESTAMPTZ,
    sucori               TEXT,
    sucdest              TEXT,
    importe              NUMERIC(18,2),
    saldo                NUMERIC(18,2),
    succobro             TEXT,
    tiporec              TEXT,
    sucursal             TEXT,
    nrogen_a             TEXT,
    estado_actual        TEXT,
    primera_vez_visto    TIMESTAMPTZ DEFAULT NOW(),
    ultima_vez_visto     TIMESTAMPTZ DEFAULT NOW(),
    fuente               TEXT DEFAULT 'transoft'
);

CREATE INDEX IF NOT EXISTS idx_guia_estado    ON guia(estado_actual);
CREATE INDEX IF NOT EXISTS idx_guia_succobro  ON guia(succobro);
CREATE INDEX IF NOT EXISTS idx_guia_sucdest   ON guia(sucdest);
CREATE INDEX IF NOT EXISTS idx_guia_fechaedit ON guia(fechaedit);

-- ── 3. PROCESO: COBRANZAS CONTADO ─────────────────────────────────

CREATE TABLE IF NOT EXISTS contado_run (
    id              SERIAL PRIMARY KEY,
    fecha_run       TIMESTAMPTZ DEFAULT NOW(),
    usuario         TEXT DEFAULT 'edith',
    total_inicial   INTEGER,
    total_sistema   INTEGER,
    total_final     INTEGER,
    nuevos          INTEGER,
    eliminados      INTEGER,
    existentes      INTEGER,
    estado_cambio   INTEGER,
    archivo_inicial TEXT,
    archivo_sistema TEXT
);

CREATE TABLE IF NOT EXISTS contado_anotacion (
    id              SERIAL PRIMARY KEY,
    nro             TEXT NOT NULL REFERENCES guia(nro) ON DELETE CASCADE,
    justificacion   TEXT,
    referente       TEXT,
    estado_gestion  TEXT,
    observacion     TEXT,
    dias_atraso     INTEGER,
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_by      TEXT DEFAULT 'sistema',
    run_id          INTEGER REFERENCES contado_run(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contado_anotacion_nro  ON contado_anotacion(nro);
CREATE INDEX IF NOT EXISTS idx_contado_referente             ON contado_anotacion(referente);
CREATE INDEX IF NOT EXISTS idx_contado_estado_gestion        ON contado_anotacion(estado_gestion);

-- ── 4. PROCESO: CDO / PTE FACTURACIÓN ─────────────────────────────

CREATE TABLE IF NOT EXISTS cdo_run (
    id                SERIAL PRIMARY KEY,
    fecha_run         TIMESTAMPTZ DEFAULT NOW(),
    usuario           TEXT DEFAULT 'sistema',
    total_cdo         INTEGER,
    total_pte_fact    INTEGER,
    diff_cdo          INTEGER,
    diff_pte          INTEGER,
    archivo_combinado TEXT
);

CREATE TABLE IF NOT EXISTS cdo_guia (
    id                  SERIAL PRIMARY KEY,
    nro                 TEXT NOT NULL REFERENCES guia(nro) ON DELETE CASCADE,
    importe_sistema     NUMERIC(18,2),
    saldo_sistema       NUMERIC(18,2),
    estado_sistema      TEXT,
    importe_trabajado   NUMERIC(18,2),
    saldo_trabajado     NUMERIC(18,2),
    estado_trabajado    TEXT,
    diff_importe        NUMERIC(18,2),
    diff_saldo          NUMERIC(18,2),
    tiene_diferencia    BOOLEAN,
    run_id              INTEGER REFERENCES cdo_run(id) ON DELETE SET NULL,
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_by          TEXT DEFAULT 'sistema'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cdo_guia_nro   ON cdo_guia(nro);
CREATE INDEX IF NOT EXISTS idx_cdo_diferencia        ON cdo_guia(tiene_diferencia);

CREATE TABLE IF NOT EXISTS pte_fact_guia (
    id                  SERIAL PRIMARY KEY,
    nro                 TEXT NOT NULL REFERENCES guia(nro) ON DELETE CASCADE,
    importe_sistema     NUMERIC(18,2),
    saldo_sistema       NUMERIC(18,2),
    estado_sistema      TEXT,
    importe_trabajado   NUMERIC(18,2),
    saldo_trabajado     NUMERIC(18,2),
    estado_trabajado    TEXT,
    diff_importe        NUMERIC(18,2),
    diff_saldo          NUMERIC(18,2),
    tiene_diferencia    BOOLEAN,
    run_id              INTEGER REFERENCES cdo_run(id) ON DELETE SET NULL,
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_by          TEXT DEFAULT 'sistema'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pte_fact_nro ON pte_fact_guia(nro);

-- ── 5. VISTA DE CRUCE ─────────────────────────────────────────────

CREATE OR REPLACE VIEW v_guia_cruce AS
SELECT
    g.nro,
    g.razsocc,
    g.importe,
    g.saldo,
    g.succobro,
    g.estado_actual,
    ca.referente          AS contado_referente,
    ca.estado_gestion     AS contado_estado,
    ca.observacion        AS contado_obs,
    ca.dias_atraso        AS contado_dias,
    cdo.importe_sistema   AS cdo_importe_sis,
    cdo.importe_trabajado AS cdo_importe_trab,
    cdo.diff_importe      AS cdo_diff,
    cdo.tiene_diferencia  AS cdo_tiene_diff,
    pte.importe_sistema   AS pte_importe_sis,
    pte.importe_trabajado AS pte_importe_trab,
    pte.diff_importe      AS pte_diff,
    pte.tiene_diferencia  AS pte_tiene_diff
FROM guia g
LEFT JOIN contado_anotacion ca ON ca.nro = g.nro
LEFT JOIN cdo_guia cdo         ON cdo.nro = g.nro
LEFT JOIN pte_fact_guia pte    ON pte.nro = g.nro;

-- ── 6. CATÁLOGOS BASE ─────────────────────────────────────────────

INSERT INTO cat_sucursal (codigo, nombre, tipo) VALUES
    ('CC',  'Casa Central (Tucumán)', 'propia'),
    ('BA',  'Buenos Aires',           'propia'),
    ('JU',  'Jujuy',                  'propia'),
    ('RO',  'Rosario',                'propia'),
    ('SA',  'Salta',                  'propia')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO cat_estado_guia (codigo, descripcion, proceso) VALUES
    ('ED',  'Entregada pendiente de cobro',  'contado'),
    ('DT',  'Despachada en tránsito',        'transito'),
    ('TT',  'En tránsito',                   'transito'),
    ('RL',  'Recibida en depósito local',    'deposito'),
    ('RT',  'Retornada',                     'devolucion'),
    ('DO',  'Devuelta al origen',            'devolucion'),
    ('DI',  'Documentación incompleta',      'problema'),
    ('OB',  'Observada',                     'problema'),
    ('NR',  'No retirada',                   'problema')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO cat_referente (codigo, nombre, tipo) VALUES
    ('BA',       'Buenos Aires',     'sucursal'),
    ('CC',       'Casa Central',     'sucursal'),
    ('JU',       'Jujuy',            'sucursal'),
    ('RO',       'Rosario',          'sucursal'),
    ('SA',       'Salta',            'sucursal'),
    ('HM',       'Héctor M.',        'comercial'),
    ('HMS',      'Héctor M.',        'comercial'),
    ('MRA',      'Comercial MRA',    'comercial'),
    ('FN',       'Federico Nacif',   'comercial'),
    ('NDS',      'Sin asignar',      'sin_asignar'),
    ('NDE',      'Sin asignar',      'sin_asignar'),
    ('POSVENTA', 'Área Posventa',    'interno')
ON CONFLICT (codigo) DO NOTHING;

SELECT 'SCHEMA BISONTE v1 OK' AS resultado;
