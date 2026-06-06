const fs = require('fs');
const code = fs.readFileSync('server.js', 'utf8');
const match = code.match(/const SOLVER_SCRIPT = `([\s\S]*?)`;/);
if (match) {
    const line = match[1].split('\n').find(l => l.includes('split'));
    console.log(JSON.stringify(line));
}
