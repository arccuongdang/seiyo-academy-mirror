// scripts/copy-kuromoji-dict.cjs
const fs = require('fs');
const path = require('path');

const src = path.join(process.cwd(), 'node_modules', 'kuromoji', 'dict');
const dest = path.join(process.cwd(), 'public', 'kuromoji', 'dict');

fs.mkdirSync(dest, { recursive: true });

// copy recursively
function copyDir(s, d) {
  for (const entry of fs.readdirSync(s, { withFileTypes: true })) {
    const sp = path.join(s, entry.name);
    const dp = path.join(d, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(dp, { recursive: true });
      copyDir(sp, dp);
    } else {
      fs.copyFileSync(sp, dp);
    }
  }
}
copyDir(src, dest);
console.log('Copied kuromoji dict to', dest);
