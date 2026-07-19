/**
 * Script para corregir los registros de la tabla 'quadrant' que tengan
 * hora_inicio/hora_fin en sus valores DEFAULT pero con horas_trabajadas
 * en formato legado ('14H-22H', '6H-14H', '00H - 6H', etc.)
 *
 * Ejecutar: node corregir_horas_quadrant.js
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, 'db', 'operativa_rrhh.db');

function parsarHoresLlegades(horasStr) {
    if (!horasStr || horasStr === '-' || horasStr === '0' || horasStr === '8') {
        return null;
    }
    const norm = horasStr.replace(/\s/g, '').toUpperCase();
    const match = norm.match(/^(\d+)H?(?::(\d+))?[-](\d+)H?(?::(\d+))?$/);
    if (!match) return null;

    const hIni = parseInt(match[1], 10);
    const mIni = parseInt(match[2] || '0', 10);
    const hFin = parseInt(match[3], 10);
    const mFin = parseInt(match[4] || '0', 10);

    const inicio = `${String(hIni).padStart(2, '0')}:${String(mIni).padStart(2, '0')}`;
    const fin    = `${String(hFin).padStart(2, '0')}:${String(mFin).padStart(2, '0')}`;
    return { inicio, fin };
}

const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
        console.error('[Error] No se pudo abrir la base de datos:', err.message);
        process.exit(1);
    }
    console.log('[OK] Base de datos abierta:', DB_PATH);
    iniciarCorreccion();
});

function iniciarCorreccion() {
    db.all(
        `SELECT id, hora_inicio, hora_fin, horas_trabajadas FROM quadrant WHERE horas_trabajadas LIKE '%H-%'`,
        [],
        (err, rows) => {
            if (err) {
                console.error('[Error] SELECT fallido:', err.message);
                db.close();
                return;
            }
            console.log(`[Corrección] Encontrados ${rows.length} registros con horas legado.`);

            if (rows.length === 0) {
                console.log('[OK] Nada que corregir.');
                db.close();
                return;
            }

            const updates = [];
            let fallidos = 0;
            for (const row of rows) {
                const parsed = parsarHoresLlegades(row.horas_trabajadas);
                if (!parsed) {
                    console.log(`[Fallido] ID ${row.id}: "${row.horas_trabajadas}" no parseable`);
                    fallidos++;
                } else {
                    updates.push({ id: row.id, inicio: parsed.inicio, fin: parsed.fin });
                }
            }

            console.log(`[Corrección] ${updates.length} registros a actualizar, ${fallidos} no parseables.`);

            db.run('BEGIN TRANSACTION', (err) => {
                if (err) { console.error('[Error] BEGIN:', err.message); return; }
                ejecutarUpdates(updates, 0, () => {
                    db.run('COMMIT', (err) => {
                        if (err) {
                            console.error('[Error] COMMIT:', err.message);
                            db.run('ROLLBACK');
                            db.close();
                        } else {
                            console.log(`\n=== RESULTADO ===`);
                            console.log(`Corregidos: ${updates.length}`);
                            console.log(`No parseables: ${fallidos}`);
                            verificarYCerrar();
                        }
                    });
                });
            });
        }
    );
}

function ejecutarUpdates(updates, idx, done) {
    if (idx >= updates.length) { done(); return; }
    const u = updates[idx];
    db.run(
        `UPDATE quadrant SET hora_inicio = ?, hora_fin = ? WHERE id = ?`,
        [u.inicio, u.fin, u.id],
        (err) => {
            if (err) console.error(`[Error] UPDATE ID ${u.id}:`, err.message);
            if ((idx + 1) % 500 === 0) console.log(`  [Progreso] ${idx + 1}/${updates.length}...`);
            ejecutarUpdates(updates, idx + 1, done);
        }
    );
}

function verificarYCerrar() {
    db.all(
        `SELECT id, fecha, hora_inicio, hora_fin, horas_trabajadas FROM quadrant WHERE horas_trabajadas LIKE '%H-%' LIMIT 5`,
        [],
        (err, rem) => {
            if (!err) {
                if (rem.length === 0) {
                    console.log('\nVerificacion OK: no quedan registros sin corregir.');
                } else {
                    console.log('\nQuedan registros sin corregir:');
                    console.log(rem);
                }
            }
            db.close(() => console.log('\n[Fin] Base de datos cerrada.'));
        }
    );
}
