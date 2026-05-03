import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadFamilyConfig } from '../server/family';

let dataDir: string;
const ENV_KEYS = ['FAMILY_PASSWORD', 'FAMILY_NAME_0', 'FAMILY_NAME_1', 'FAMILY_NAME_2'] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'scrabble-fam-'));
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
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

  it('loads from env vars when all four are set, ignoring file', () => {
    process.env.FAMILY_PASSWORD = 'env-pw';
    process.env.FAMILY_NAME_0 = 'Мама';
    process.env.FAMILY_NAME_1 = 'Папа';
    process.env.FAMILY_NAME_2 = 'Женя';
    writeFileSync(path.join(dataDir, 'family.json'), JSON.stringify({
      password: 'file-pw',
      players: [{ slot: 0, name: 'X' }, { slot: 1, name: 'Y' }, { slot: 2, name: 'Z' }],
    }));
    const cfg = loadFamilyConfig(dataDir);
    expect(cfg).not.toBeNull();
    expect(cfg!.password).toBe('env-pw');
    expect(cfg!.players.map((p) => p.name)).toEqual(['Мама', 'Папа', 'Женя']);
  });

  it('falls back to file when env vars are partial', () => {
    process.env.FAMILY_PASSWORD = 'env-pw';
    // FAMILY_NAME_* not set
    writeFileSync(path.join(dataDir, 'family.json'), JSON.stringify({
      password: 'file-pw',
      players: [{ slot: 0, name: 'A' }, { slot: 1, name: 'B' }, { slot: 2, name: 'C' }],
    }));
    const cfg = loadFamilyConfig(dataDir);
    expect(cfg).not.toBeNull();
    expect(cfg!.password).toBe('file-pw');
  });

  it('returns null when env-var password is empty string', () => {
    process.env.FAMILY_PASSWORD = '';
    process.env.FAMILY_NAME_0 = 'A';
    process.env.FAMILY_NAME_1 = 'B';
    process.env.FAMILY_NAME_2 = 'C';
    expect(loadFamilyConfig(dataDir)).toBeNull();
  });

  it('returns null when an env-var name is empty', () => {
    process.env.FAMILY_PASSWORD = 'pw';
    process.env.FAMILY_NAME_0 = 'A';
    process.env.FAMILY_NAME_1 = '';
    process.env.FAMILY_NAME_2 = 'C';
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
