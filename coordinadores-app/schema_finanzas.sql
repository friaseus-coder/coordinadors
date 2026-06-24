-- ============================================================
-- SCHEMA_FINANZAS.SQL — Esquema de Finanzas e Inventario (Shard)
-- ============================================================

PRAGMA foreign_keys = ON;

-- Tabla Gastos
CREATE TABLE IF NOT EXISTS despeses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT,
    comercial TEXT,
    concepto TEXT,
    importe TEXT,
    estado TEXT,
    coordinador TEXT,
    activo INTEGER DEFAULT 1
);

-- Tabla Inventario
CREATE TABLE IF NOT EXISTS inventari (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comercial TEXT,
    articulo TEXT,
    fecha_entrega TEXT,
    estado TEXT,
    observaciones TEXT,
    activo INTEGER DEFAULT 1
);

-- Almacenamiento clave-valor legacy (Tickets, Rutas)
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
