const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, 'dades', 'dades Laura', 'quadrant.json');
if (!fs.existsSync(filePath)) {
  console.error("No existe el archivo:", filePath);
  process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf8');
const data = JSON.parse(content);

const parkings = new Set();
Object.keys(data).forEach(key => {
  if (key.startsWith('nyn_v12_') || key.startsWith('nyn_v9_')) {
    const parts = key.split('_');
    if (parts.length >= 6) {
      const park = parts.slice(4, parts.length - 2).join(' ');
      parkings.add(park);
    }
  }
});

console.log("Aparcamientos únicos en el JSON de Laura:");
console.log(Array.from(parkings).sort());
