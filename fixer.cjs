const fs = require('fs');
const path = require('path');
function fixFiles(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      fixFiles(fullPath);
    } else if (fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      content = content.replace(/\\\`/g, '`');
      content = content.replace(/\\\${/g, '${');
      content = content.replace(/\\\\n/g, '\\n');
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log('Fixed:', fullPath);
    }
  }
}
fixFiles('packages/cli/src');
