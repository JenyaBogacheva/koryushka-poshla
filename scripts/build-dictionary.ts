import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const SOURCE: string = process.argv[2] ?? (() => { console.error('usage: tsx scripts/build-dictionary.ts <dict.opcorpora.xml> [out]'); process.exit(1); })();
const OUT = process.argv[3] ?? 'server/data/nouns.txt';

const EXCLUDE = new Set(['Geox', 'Name', 'Surn', 'Patr', 'Abbr', 'Trad', 'Init']);

function extractLemmasFromLine(line: string): string[] {
  const results: string[] = [];
  const lemmaRe = /<lemma [^>]*>(.*?)<\/lemma>/g;
  let match: RegExpExecArray | null;
  while ((match = lemmaRe.exec(line)) !== null) {
    const body = match[1]!;
    const lMatch = body.match(/^<l t="([^"]+)"/);
    if (!lMatch) continue;
    const lemma = lMatch[1]!;
    const isNoun = body.includes('<g v="NOUN"');
    if (!isNoun) continue;
    let excluded = false;
    for (const ex of EXCLUDE) {
      if (body.includes(`<g v="${ex}"`)) { excluded = true; break; }
    }
    if (!excluded) results.push(lemma.toUpperCase());
  }
  return results;
}

async function main() {
  const lemmas = new Set<string>();
  const rl = createInterface({ input: createReadStream(SOURCE, 'utf-8'), crlfDelay: Infinity });
  for await (const raw of rl) {
    for (const lemma of extractLemmasFromLine(raw)) {
      lemmas.add(lemma);
    }
  }
  const sorted = [...lemmas].filter((w) => /^[А-ЯЁ]+$/.test(w)).sort();
  writeFileSync(OUT, sorted.join('\n') + '\n', 'utf-8');
  console.log(`wrote ${sorted.length} lemmas to ${OUT}`);
}
main();
