import fs from 'node:fs';

export function loadMatrix(file = 'config/devices.json') {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed) || parsed.length < 3) throw new Error('Cloud matrix must define at least three devices');
  for (const item of parsed) {
    if (!item.name || !item.version) throw new Error('Every matrix entry requires name and version');
  }
  return parsed;
}

