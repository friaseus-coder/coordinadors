const fs = require('fs'); const lines = fs.readFileSync('src/migrador/migrador.html', 'utf8').split('\n'); lines.forEach((l, i) => { if(l.includes('writeBatch')) console.log(i+1, l); });
