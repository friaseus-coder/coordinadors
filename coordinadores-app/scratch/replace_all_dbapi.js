const fs = require('fs');
const path = require('path');

function processDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      processDir(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.html'))) {
      let content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('dbAPI')) {
        console.log("Sustituyendo dbAPI en:", fullPath);
        content = content.replace(/window\.dbAPI/g, 'window.api');
        content = content.replace(/dbAPI/g, 'window.api');
        fs.writeFileSync(fullPath, content);
      }
    }
  }
}

const srcDir = path.join(__dirname, '..', 'src');
processDir(srcDir);
console.log("Reemplazo masivo de dbAPI finalizado.");
