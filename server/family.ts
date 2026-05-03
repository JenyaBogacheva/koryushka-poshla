import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Slot } from '@shared/types';

export type FamilyMember = { slot: Slot; name: string };
export type FamilyConfig = { password: string; players: [FamilyMember, FamilyMember, FamilyMember] };

export function loadFamilyConfig(dataDir: string): FamilyConfig | null {
  const envCfg = loadFromEnv();
  if (envCfg !== undefined) return envCfg;

  const file = path.join(dataDir, 'family.json');
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`[scrabble] family.json invalid JSON: ${(err as Error).message}`);
    return null;
  }
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    typeof (parsed as { password: unknown }).password !== 'string' ||
    !Array.isArray((parsed as { players: unknown }).players) ||
    (parsed as { players: unknown[] }).players.length !== 3
  ) {
    console.error('[scrabble] family.json must be { password: string, players: [{slot,name},×3] }');
    return null;
  }
  const cfg = parsed as { password: string; players: { slot: number; name: string }[] };
  for (const p of cfg.players) {
    if (p.slot !== 0 && p.slot !== 1 && p.slot !== 2) {
      console.error(`[scrabble] family.json: invalid slot ${p.slot}`);
      return null;
    }
    if (typeof p.name !== 'string' || p.name.trim() === '') {
      console.error('[scrabble] family.json: every player needs a non-empty name');
      return null;
    }
  }
  const slots = new Set(cfg.players.map((p) => p.slot));
  if (slots.size !== 3) {
    console.error('[scrabble] family.json: slots must be 0, 1, 2 (each used once)');
    return null;
  }
  const ordered = [0, 1, 2].map((s) => cfg.players.find((p) => p.slot === s)!) as [
    FamilyMember, FamilyMember, FamilyMember,
  ];
  return { password: cfg.password, players: ordered };
}

export function familyNameForSlot(cfg: FamilyConfig, slot: Slot): string {
  return cfg.players[slot].name;
}

function loadFromEnv(): FamilyConfig | null | undefined {
  const password = process.env.FAMILY_PASSWORD;
  const name0 = process.env.FAMILY_NAME_0;
  const name1 = process.env.FAMILY_NAME_1;
  const name2 = process.env.FAMILY_NAME_2;
  const anySet = password !== undefined || name0 !== undefined || name1 !== undefined || name2 !== undefined;
  const allSet = password !== undefined && name0 !== undefined && name1 !== undefined && name2 !== undefined;
  if (!anySet) return undefined;
  if (!allSet) return undefined;
  if (password === '' || name0!.trim() === '' || name1!.trim() === '' || name2!.trim() === '') {
    console.error('[scrabble] FAMILY_PASSWORD and FAMILY_NAME_0/1/2 must all be non-empty');
    return null;
  }
  return {
    password,
    players: [
      { slot: 0, name: name0! },
      { slot: 1, name: name1! },
      { slot: 2, name: name2! },
    ],
  };
}
