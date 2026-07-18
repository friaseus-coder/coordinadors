-- ============================================================
-- SCHEMA_COMERCIAL.SQL — Esquema de Comerciales (Shard)
-- ============================================================

PRAGMA foreign_keys = ON;

-- Almacenamiento clave-valor para tarifas y precios
CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
