import { join, relative } from 'node:path';
import { readdir, stat } from 'node:fs/promises';

const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif']);

export const listGameImages = async (): Promise<string[]> => {
  const root = join(process.cwd(), 'public', 'games');

  const walk = async (dir: string): Promise<string[]> => {
    let entries: string[] = [];

    try {
      const files = await readdir(dir, { withFileTypes: true });
      for (const file of files) {
        const path = join(dir, file.name);
        if (file.isDirectory()) {
          entries = entries.concat(await walk(path));
        } else {
          const dot = file.name.lastIndexOf('.');
          if (dot === -1) continue;
          const ext = file.name.slice(dot).toLowerCase();
          if (imageExtensions.has(ext)) {
            entries.push('/' + relative(join(process.cwd(), 'public'), path).replace(/\\/g, '/'));
          }
        }
      }
    } catch (err) {
      console.warn('[admin:shop] unable to read images directory', err);
    }

    return entries.sort((a, b) => a.localeCompare(b));
  };

  try {
    await stat(root);
  } catch {
    return [];
  }

  return walk(root);
};
