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

-- Versión del esquema
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
