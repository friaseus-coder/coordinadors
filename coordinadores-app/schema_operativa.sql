-- ============================================================
-- SCHEMA_OPERATIVA.SQL — Esquema Operativo y de RRHH (Shard)
-- ============================================================

PRAGMA foreign_keys = ON;

-- Asignaciones de agentes a parkings (sin FK directas para permitir sharding)
CREATE TABLE IF NOT EXISTS quadrant (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,                         -- YYYY-MM-DD
    aparcamiento_id INTEGER NOT NULL,
    agente_id INTEGER NOT NULL,
    sociedad_contrato_snapshot_id INTEGER,       -- Snapshot: sociedad del contrato en el momento de la asignación
    turno TEXT NOT NULL DEFAULT 'MATÍ',
    hora_inicio TEXT NOT NULL DEFAULT '06:00',
    hora_fin TEXT NOT NULL DEFAULT '14:00',
    horas_trabajadas INTEGER DEFAULT 8,
    es_substitucio INTEGER DEFAULT 0,           -- 1 = Este turno fue una sustitución
    nota TEXT                                   -- Observaciones libres
);

-- Tabla unificada para todo tipo de excepciones al horario normal
CREATE TABLE IF NOT EXISTS incidencias_horarias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_trabajador TEXT NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE,
    tipo_incidencia TEXT NOT NULL, -- Ej: 'Vacaciones', 'Baja Médica', 'Deuda Horas (-)', 'Bolsa Horas (+)'
    impacto_horas REAL DEFAULT 0,  -- Cuántas horas suma o resta esta incidencia
    coordinador TEXT,
    estado TEXT DEFAULT 'Aprobado',
    comentarios TEXT
);

-- Almacenamiento clave-valor legacy
CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Versión del esquema
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
