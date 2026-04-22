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
        } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
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
        let imp = match[1];
        if (!imp.startsWith('.') && !imp.startsWith('/') && !imp.startsWith('@ohiru/') && imp !== 'shared') {
            // Handle scoped packages
            if (imp.startsWith('@')) {
                const parts = imp.split('/');
                imp = `${parts[0]}/${parts[1]}`;
            } else {
                imp = imp.split('/')[0];
            }
            imports.add(imp);
        }
    }
    
    // Also check dynamic imports
    const dynamicMatches = content.matchAll(/import\(['"]([^'"]+)['"]\)/g);
    for (const match of dynamicMatches) {
        let imp = match[1];
        if (!imp.startsWith('.') && !imp.startsWith('/') && !imp.startsWith('@ohiru/') && imp !== 'shared') {
            if (imp.startsWith('@')) {
                const parts = imp.split('/');
                imp = `${parts[0]}/${parts[1]}`;
            } else {
                imp = imp.split('/')[0];
            }
            imports.add(imp);
        }
    }
});

console.log('Found external imports:');
Array.from(imports).sort().forEach(imp => console.log(`- ${imp}`));
