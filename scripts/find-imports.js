import fs from 'fs';
import path from 'path';

function getFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(getFiles(file));
        } else if (file.endsWith('.ts') || file.endsWith('.js')) {
            results.push(file);
        }
    });
    return results;
}

const srcDir = './packages/cli/src';
const files = getFiles(srcDir);
const imports = new Set();

files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const matches = content.matchAll(/from\s+['"]([^'"]+)['"]/g);
    for (const match of matches) {
        const imp = match[1];
        if (!imp.startsWith('.') && !imp.startsWith('/') && !imp.startsWith('@ohiru/') && imp !== 'shared') {
            imports.add(imp);
        }
    }
    
    // Also check dynamic imports
    const dynamicMatches = content.matchAll(/import\(['"]([^'"]+)['"]\)/g);
    for (const match of dynamicMatches) {
        const imp = match[1];
        if (!imp.startsWith('.') && !imp.startsWith('/') && !imp.startsWith('@ohiru/') && imp !== 'shared') {
            imports.add(imp);
        }
    }
});

console.log('Found external imports:');
Array.from(imports).sort().forEach(imp => console.log(`- ${imp}`));
