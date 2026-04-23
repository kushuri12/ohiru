import fs from 'fs';
import path from 'path';

const newVersion = '1.7.4';

// Update root package.json
const rootPkgPath = './package.json';
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
rootPkg.version = newVersion;
fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + '\n');

// Update all packages
const packagesDir = './packages';
const packages = fs.readdirSync(packagesDir);

packages.forEach(pkg => {
    const pkgPath = path.join(packagesDir, pkg, 'package.json');
    if (fs.existsSync(pkgPath)) {
        const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        pkgJson.version = newVersion;
        
        // Also update internal dependencies
        if (pkgJson.dependencies) {
            Object.keys(pkgJson.dependencies).forEach(dep => {
                if (dep.startsWith('@ohiru/')) {
                    pkgJson.dependencies[dep] = newVersion;
                }
            });
        }
        
        fs.writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2) + '\n');
    }
});

// Update CLI version constant
const cliIndexPath = './packages/cli/src/index.ts';
if (fs.existsSync(cliIndexPath)) {
    let content = fs.readFileSync(cliIndexPath, 'utf8');
    content = content.replace(/export const version_cli = ".*";/, `export const version_cli = "${newVersion}";`);
    fs.writeFileSync(cliIndexPath, content);
}

console.log(`Updated all versions to ${newVersion}`);
