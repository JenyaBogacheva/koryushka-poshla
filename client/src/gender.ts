// Russian-style gender heuristic: names ending in а/я are feminine — except
// for these family-game names, which decline like а-stem feminines but are
// grammatically masculine (Папа, Дядя, Илья, Никита, …).
const MASC_OVERRIDES = new Set(['папа', 'дядя', 'илья', 'никита']);

export function isFemName(name: string): boolean {
  const trimmed = name.trim().toLowerCase();
  if (MASC_OVERRIDES.has(trimmed)) return false;
  const last = trimmed.slice(-1);
  return last === 'а' || last === 'я';
}
