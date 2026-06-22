const fs = require('fs'); const lines = fs.readFileSync('server.js', 'utf8').split('\n'); lines.forEach((l, i) => { if(l.includes('SOLVER_SCRIPT')) console.log(i+1, l); });
