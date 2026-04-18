import fs from 'fs-extra';
import path from 'path';

const mappings = [
  { src: 'packages/dashboard/src/ui', dist: 'packages/dashboard/dist/ui' },
  { src: 'packages/canvas/src/ui', dist: 'packages/canvas/dist/ui' },
  { src: 'packages/channels/src/webchat/ui', dist: 'packages/channels/dist/webchat/ui' },
];

mappings.forEach(m => {
  const src = path.join(process.cwd(), m.src);
  const dist = path.join(process.cwd(), m.dist);

  if (fs.existsSync(src)) {
    fs.ensureDirSync(path.dirname(dist));
    fs.copySync(src, dist, { overwrite: true });
    console.log(`[Build] Copied ${m.src} to ${m.dist}.`);
  }
});
