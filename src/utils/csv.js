import fs from 'node:fs';

function parseLine(line) {
  const cells = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') { value += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { cells.push(value); value = ''; }
    else value += char;
  }
  cells.push(value);
  return cells;
}

export function readCsv(file) {
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = parseLine(lines.shift());
  return lines.map((line) => Object.fromEntries(headers.map((key, i) => [key, parseLine(line)[i] ?? ''])));
}

export function csvCell(value) {
  const text = String(value ?? '').replace(/[\r\n]+/g, ' ');
  return /[",]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function appendCsv(file, headers, row) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, `${headers.map(csvCell).join(',')}\n`, { mode: 0o600 });
  fs.appendFileSync(file, `${headers.map((key) => csvCell(row[key])).join(',')}\n`);
}

