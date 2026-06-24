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

-- Periodos de ausencia (vacaciones/bajas)
CREATE TABLE IF NOT EXISTS vacances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agente_id INTEGER NOT NULL,
    fecha_inicio TEXT NOT NULL,  -- YYYY-MM-DD
    fecha_fin TEXT NOT NULL     -- YYYY-MM-DD
);

-- Deudas / horas extra pendientes
CREATE TABLE IF NOT EXISTS deutes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comercial TEXT NOT NULL,
    cliente TEXT NOT NULL,
    import REAL NOT NULL,
    fecha TEXT NOT NULL,
    activo INTEGER DEFAULT 1
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
