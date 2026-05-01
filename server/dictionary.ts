import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

function normalize(w: string): string {
  return w.toUpperCase().replace(/Ё/g, 'Е').replace(/Ъ/g, 'Ь');
}

let knownRaw: Set<string> | null = null;
let knownNormalized: Set<string> | null = null;

function load(): void {
  if (knownRaw !== null) return;
  const candidates = [
    path.resolve(process.cwd(), 'server/data/nouns.txt'),
    path.resolve(import.meta.dirname ?? '.', 'data/nouns.txt'),
  ];
  const file = candidates.find((c) => existsSync(c));
  if (!file) {
    console.warn('[dictionary] nouns.txt not found; advisory disabled');
    knownRaw = new Set();
    knownNormalized = new Set();
    return;
  }
  const lines = readFileSync(file, 'utf-8').split('\n').filter((l) => l.length > 0);
  knownRaw = new Set(lines.map((l) => l.toUpperCase()));
  knownNormalized = new Set([...knownRaw].map(normalize));
}

export function checkWords(words: string[]): string[] {
  load();
  const unknown: string[] = [];
  for (const w of words) {
    const upper = w.toUpperCase();
    if (knownRaw!.has(upper)) continue;
    if (knownNormalized!.has(normalize(upper))) continue;
    unknown.push(upper);
  }
  return unknown;
}
