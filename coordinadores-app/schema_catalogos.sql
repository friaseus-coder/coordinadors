-- ============================================================
-- SCHEMA_CATALOGOS.SQL — Esquema de Catálogos Maestros (Shard)
-- ============================================================

PRAGMA foreign_keys = ON;

-- 1. SOCIEDADES — Empresas del grupo que gestionan aparcamientos
CREATE TABLE IF NOT EXISTS sociedades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_fiscal TEXT NOT NULL,        -- Razón social completa (ej: "Aparcamientos BCN, S.L.")
    codigo_corto TEXT NOT NULL UNIQUE,  -- Código abreviado para UI y reportes (ej: "ABCN")
    activo INTEGER DEFAULT 1            -- Borrado lógico (0 = desactivada)
);

-- 2. APARCAMIENTOS — Catálogo maestro de parkings gestionados
CREATE TABLE IF NOT EXISTS aparcamientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_obra TEXT UNIQUE,                    -- Código contable/facturación (ej: "OB-2301")
    nombre TEXT NOT NULL,                       -- Nombre operativo (ej: "NN CONCEPT")
    zona TEXT,                                  -- Zona geográfica libre
    es_remotizado INTEGER DEFAULT 0,            -- 1 = Parking solo con control remoto, sin presencia
    tipo_gestion TEXT CHECK(tipo_gestion IN ('propio', 'socios')),  -- Gestión directa o delegada
    permitir_vacio_laborables INTEGER DEFAULT 0, -- Override individual: 1 = puede estar vacío L-V
    sociedad_id INTEGER,                        -- FK: ¿A qué sociedad pertenece este parking?
    coordinador_responsable TEXT CHECK(coordinador_responsable IN ('Albert', 'Laura', 'Ambos')),
    activo INTEGER DEFAULT 1,                   -- Borrado lógico
    FOREIGN KEY(sociedad_id) REFERENCES sociedades(id)
);

-- 3. COBERTURAS REQUERIDAS — Turnos obligatorios por parking
CREATE TABLE IF NOT EXISTS coberturas_requeridas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    aparcamiento_id INTEGER NOT NULL,
    dia_semana INTEGER,         -- 1=Lunes..7=Domingo (recurrente semanal)
    fecha TEXT,                 -- Fecha concreta YYYY-MM-DD (servicio extraordinario)
    turno TEXT NOT NULL,        -- Nombre del turno (ej: "MATÍ", "TARDA", "NIT")
    hora_inicio TEXT NOT NULL,  -- Formato HH:MM
    hora_fin TEXT NOT NULL,     -- Formato HH:MM
    activo INTEGER DEFAULT 1,
    FOREIGN KEY(aparcamiento_id) REFERENCES aparcamientos(id) ON DELETE CASCADE,
    CHECK (dia_semana IS NOT NULL OR fecha IS NOT NULL)
);

-- 4. AGENTES — Trabajadores (propios y empresas externas)
CREATE TABLE IF NOT EXISTS agentes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    zona_habitual TEXT,                 -- Zona preferente para asignaciones
    ranking_score INTEGER DEFAULT 50,   -- Puntuación de prioridad (0-100)
    es_empresa_externa INTEGER DEFAULT 0, -- 1 = Empresa subcontratada (sin límites de jornada)
    activo INTEGER DEFAULT 1
);

-- 5. CONTRATOS DE AGENTES — Vinculación temporal Agente ↔ Sociedad
CREATE TABLE IF NOT EXISTS contratos_agentes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agente_id INTEGER NOT NULL,
    sociedad_id INTEGER NOT NULL,
    fecha_inicio TEXT NOT NULL,  -- YYYY-MM-DD
    fecha_fin TEXT,              -- NULL = contrato vigente
    FOREIGN KEY(agente_id) REFERENCES agentes(id) ON DELETE CASCADE,
    FOREIGN KEY(sociedad_id) REFERENCES sociedades(id)
);

-- 8. REGLAS DE NEGOCIO — Parámetros dinámicos configurables
CREATE TABLE IF NOT EXISTS reglas_config (
    clave TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'numero',       -- 'numero', 'booleano', 'texto'
    categoria TEXT NOT NULL DEFAULT 'general',  -- 'agentes', 'aparcamientos', 'general'
    descripcion TEXT NOT NULL
);

-- 9. HISTÓRICO DE APARCAMIENTOS — Auditoría de cambios
CREATE TABLE IF NOT EXISTS historico_aparcamientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    aparcamiento_id INTEGER NOT NULL,
    campo_modificado TEXT NOT NULL,
    valor_anterior TEXT,
    valor_nuevo TEXT,
    fecha_cambio TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY(aparcamiento_id) REFERENCES aparcamientos(id) ON DELETE CASCADE
);

-- 10. TRIGGER DE AUDITORÍA — Registro automático de cambios
CREATE TRIGGER IF NOT EXISTS log_cambios_aparcamientos
AFTER UPDATE ON aparcamientos
FOR EACH ROW
BEGIN
    INSERT INTO historico_aparcamientos (aparcamiento_id, campo_modificado, valor_anterior, valor_nuevo)
    SELECT OLD.id, 'nombre', OLD.nombre, NEW.nombre
    WHERE OLD.nombre <> NEW.nombre;

    INSERT INTO historico_aparcamientos (aparcamiento_id, campo_modificado, valor_anterior, valor_nuevo)
    SELECT OLD.id, 'numero_obra', OLD.numero_obra, NEW.numero_obra
    WHERE COALESCE(OLD.numero_obra, '') <> COALESCE(NEW.numero_obra, '');

    INSERT INTO historico_aparcamientos (aparcamiento_id, campo_modificado, valor_anterior, valor_nuevo)
    SELECT OLD.id, 'es_remotizado',
           CASE OLD.es_remotizado WHEN 1 THEN 'Sí' ELSE 'No' END,
           CASE NEW.es_remotizado WHEN 1 THEN 'Sí' ELSE 'No' END
    WHERE OLD.es_remotizado <> NEW.es_remotizado;

    INSERT INTO historico_aparcamientos (aparcamiento_id, campo_modificado, valor_anterior, valor_nuevo)
    SELECT OLD.id, 'permitir_vacio_laborables',
           CASE OLD.permitir_vacio_laborables WHEN 1 THEN 'Permitido' ELSE 'Prohibido' END,
           CASE NEW.permitir_vacio_laborables WHEN 1 THEN 'Permitido' ELSE 'Prohibido' END
    WHERE OLD.permitir_vacio_laborables <> NEW.permitir_vacio_laborables;

    INSERT INTO historico_aparcamientos (aparcamiento_id, campo_modificado, valor_anterior, valor_nuevo)
    SELECT OLD.id, 'coordinador_responsable', OLD.coordinador_responsable, NEW.coordinador_responsable
    WHERE OLD.coordinador_responsable <> NEW.coordinador_responsable;

    INSERT INTO historico_aparcamientos (aparcamiento_id, campo_modificado, valor_anterior, valor_nuevo)
    SELECT OLD.id, 'sociedad_id', CAST(OLD.sociedad_id AS TEXT), CAST(NEW.sociedad_id AS TEXT)
    WHERE COALESCE(OLD.sociedad_id, 0) <> COALESCE(NEW.sociedad_id, 0);
END;

-- Tabla unificada de todo el personal de la empresa
CREATE TABLE IF NOT EXISTS empleados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT,
    rol TEXT NOT NULL, -- Ej: 'Admin', 'Coordinador', 'Comercial', 'Trabajador'
    activo INTEGER DEFAULT 1, -- 1 para activo, 0 para inactivo/baja
    json_preferencias TEXT -- Para guardar tema claro/oscuro, idioma, etc.
);

-- 13. SCHEMA_VERSION — Control de versiones del esquema
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
