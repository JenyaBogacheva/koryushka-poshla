import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Slot } from '@shared/types';

export type FamilyMember = { slot: Slot; name: string };
export type FamilyConfig = { password: string; players: [FamilyMember, FamilyMember, FamilyMember] };

export function loadFamilyConfig(dataDir: string): FamilyConfig | null {
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
