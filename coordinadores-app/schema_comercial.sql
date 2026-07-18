-- ============================================================
-- SCHEMA_COMERCIAL.SQL — Esquema de Comerciales (Shard)
-- ============================================================

PRAGMA foreign_keys = ON;

-- Tabla de tarifas comerciales estructurada (Reemplaza al antiguo kv_store)
CREATE TABLE IF NOT EXISTS tarifas_comerciales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coordinador TEXT NOT NULL,
    mes INTEGER NOT NULL,
    anio INTEGER NOT NULL,
    aparcamiento TEXT NOT NULL,
    direccion TEXT,
    fijos INTEGER DEFAULT 0,
    variables INTEGER DEFAULT 0,
    vacantes INTEGER DEFAULT 0,
    tarifa REAL DEFAULT 0.0,
    observaciones TEXT
);

-- Tabla de tarifas comerciales estructurada
CREATE TABLE IF NOT EXISTS comerciales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    direccion TEXT,
    plantas TEXT,
    capacidad TEXT,
    plazas_libres TEXT,
    tarifa TEXT,
    notas TEXT
);

-- Versión del esquema
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
