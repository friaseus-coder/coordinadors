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

-- Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_mov_economicos_filtro ON movimientos_economicos(tipo_movimiento, fecha);
CREATE INDEX IF NOT EXISTS idx_mov_economicos_usuario ON movimientos_economicos(id_usuario);

-- ============================================================
-- TABLAS DE INVENTARIO RELACIONAL (Consolidadas de V2)
-- ============================================================

CREATE TABLE IF NOT EXISTS inventario_articulos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referencia TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    categoria TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inventario_almacenes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS inventario_existencias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    articulo_id INTEGER NOT NULL,
    almacen_id INTEGER NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY(articulo_id) REFERENCES inventario_articulos(id),
    FOREIGN KEY(almacen_id) REFERENCES inventario_almacenes(id)
);

-- Insertar los almacenes base iniciales
INSERT OR IGNORE INTO inventario_almacenes (nombre) VALUES ('OFICINES'), ('PROVENÇA'), ('CÒRSEGA'), ('OFICINA CENTRAL');

CREATE TABLE IF NOT EXISTS inventario_comandas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data TEXT NOT NULL,
    centre TEXT NOT NULL,
    articulo_id INTEGER NOT NULL,
    uds INTEGER NOT NULL DEFAULT 1,
    estat TEXT NOT NULL DEFAULT 'pendent',
    rec TEXT,
    FOREIGN KEY(articulo_id) REFERENCES inventario_articulos(id)
);
