const fs = require('fs');
const path = require('path');

const mainJsPath = path.join(__dirname, '..', 'main.js');
let code = fs.readFileSync(mainJsPath, 'utf8');

console.log("Leyendo main.js, tamaño original:", code.length, "bytes");

// 1. Inyección de crypto y variables globales del Motor de Deltas y RBAC
const headerSearch = "const { app, BrowserWindow, ipcMain, dialog } = require('electron');";
const headerReplace = `const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const crypto = require('crypto');

const CLIENT_ID = crypto.randomUUID();
let currentSession = { user: 'Desconocido', role: 'Invitado' };

function verifyRole(allowedRoles = []) {
  const role = (currentSession.role || '').toLowerCase();
  if (role === 'admin' || role === 'jefe operaciones') return true;
  const normalized = allowedRoles.map(r => r.toLowerCase());
  if (!normalized.includes(role)) {
    throw new Error("Acceso denegado: El rol '" + currentSession.role + "' no tiene permisos suficientes para esta operación.");
  }
  return true;
}
`;

code = code.replace(headerSearch, headerReplace);

fs.writeFileSync(path.join(__dirname, 'main_test.js'), code);
console.log("Header inyectado correctamente.");
