-- ============================================================
-- SCHEMA_FINANZAS.SQL — Esquema de Finanzas e Inventario (Shard)
-- ============================================================

PRAGMA foreign_keys = ON;

-- Tabla unificada para todo el flujo económico (Rutas, Tickets, Compras)
CREATE TABLE IF NOT EXISTS movimientos_economicos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_usuario TEXT NOT NULL,
    fecha DATE NOT NULL,
    tipo_movimiento TEXT NOT NULL, -- Ej: 'Gasto Material', 'Ruta Comercial', 'Ticket Parking'
    concepto TEXT NOT NULL,
    importe REAL NOT NULL,
    json_detalles TEXT -- Almacena meta-datos flexibles: {"km": 120, "origen": "BCN"} o {"ticket_url": "123.jpg"}
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
