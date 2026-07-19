-- ============================================================
-- SCHEMA_FINANZAS_V2.SQL — Migración de Inventario Relacional
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
