// scripts/validate-snapshots.ts
// Usage:
//   npx ts-node --transpile-only scripts/validate-snapshots.ts
// or compile then: ts-node/register if needed.
// It scans public/snapshots/**/*.json and validates JSON syntax with line/col reporting.

import fs from 'fs';
import path from 'path';

type ParseError = SyntaxError & { position?: number };

function getLineCol(text: string, pos: number) {
  const lines = text.split(/\r?\n/);
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineLen = lines[i].length + 1; // +1 for newline
    if (count + lineLen > pos) {
      const col = pos - count + 1;
      return { line: i + 1, column: col };
    }
    count += lineLen;
  }
  return { line: -1, column: -1 };
}

function context(text: string, pos: number, radius = 80) {
  const start = Math.max(0, pos - radius);
  const end = Math.min(text.length, pos + radius);
  return text.slice(start, end);
}

function isJsonFile(file: string) {
  return file.toLowerCase().endsWith('.json');
}

function listJsonFiles(dir: string): string[] {
  const out: string[] = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const it of items) {
    const p = path.join(dir, it.name);
    if (it.isDirectory()) out.push(...listJsonFiles(p));
    else if (it.isFile() && isJsonFile(p)) out.push(p);
  }
  return out;
}

function validateFile(file: string): { ok: boolean; message?: string } {
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''); // strip BOM
  try {
    JSON.parse(raw);
    return { ok: true };
  } catch (e) {
    const err = e as ParseError;
    const posMatch = String(err.message).match(/at position (\d+)/);
    const pos = posMatch ? Number(posMatch[1]) : -1;
    const lc = pos >= 0 ? getLineCol(raw, pos) : { line: -1, column: -1 };
    const near = pos >= 0 ? context(raw, pos) : '';
    return {
      ok: false,
      message: [
        `File: ${file}`,
        `Error: ${err.message}`,
        `Line/Col: ${lc.line}:${lc.column}`,
        `Near: ${JSON.stringify(near)}`
      ].join('\n')
    };
  }
}

const root = path.resolve(process.cwd(), 'public', 'snapshots');
if (!fs.existsSync(root)) {
  console.error(`Not found: ${root}`);
  process.exit(1);
}

const files = listJsonFiles(root);
if (files.length === 0) {
  console.log(`No JSON files under ${root}`);
  process.exit(0);
}

let failed = 0;
for (const f of files) {
  const res = validateFile(f);
  if (!res.ok) {
    failed++;
    console.error('---');
    console.error(res.message);
  }
}
if (failed > 0) {
  console.error(`\n${failed} file(s) failed JSON validation.`);
  process.exit(2);
} else {
  console.log(`All ${files.length} JSON files are valid.`);
}
