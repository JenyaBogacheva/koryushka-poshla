import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadFamilyConfig } from '../server/family';

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'scrabble-fam-'));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe('family config loader', () => {
  it('returns null when family.json is absent', () => {
    expect(loadFamilyConfig(dataDir)).toBeNull();
  });

  it('returns null on invalid JSON', () => {
    writeFileSync(path.join(dataDir, 'family.json'), '{ not json');
    expect(loadFamilyConfig(dataDir)).toBeNull();
  });

  it('returns null when fewer than 3 players', () => {
    writeFileSync(path.join(dataDir, 'family.json'), JSON.stringify({
      password: 'x',
      players: [{ slot: 0, name: 'A' }, { slot: 1, name: 'B' }],
    }));
    expect(loadFamilyConfig(dataDir)).toBeNull();
  });

  it('returns null when slots are duplicated', () => {
    writeFileSync(path.join(dataDir, 'family.json'), JSON.stringify({
      password: 'x',
      players: [{ slot: 0, name: 'A' }, { slot: 0, name: 'B' }, { slot: 1, name: 'C' }],
    }));
    expect(loadFamilyConfig(dataDir)).toBeNull();
  });

  it('orders players by slot regardless of input order', () => {
    writeFileSync(path.join(dataDir, 'family.json'), JSON.stringify({
      password: 'piter',
      players: [
        { slot: 2, name: 'Женя' },
        { slot: 0, name: 'Мама' },
        { slot: 1, name: 'Папа' },
      ],
    }));
    const cfg = loadFamilyConfig(dataDir);
    expect(cfg).not.toBeNull();
    expect(cfg!.password).toBe('piter');
    expect(cfg!.players.map((p) => p.name)).toEqual(['Мама', 'Папа', 'Женя']);
  });
});
