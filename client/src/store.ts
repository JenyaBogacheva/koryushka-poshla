import { create } from 'zustand';
import type { GameState, Letter, LobbySlot, Slot } from '@shared/types';

type Pending = { tileId: string; row: number; col: number; playedAs: Letter };
type Identity = { slot: Slot; name: string; password: string };

const IDENTITY_KEY = 'scrabble.identity';

function loadIdentity(): Identity | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(IDENTITY_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as { slot: number; name: string; password?: string };
    if (parsed.slot !== 0 && parsed.slot !== 1 && parsed.slot !== 2) return null;
    if (typeof parsed.name !== 'string' || parsed.name.trim() === '') return null;
    if (typeof parsed.password !== 'string' || parsed.password === '') return null;
    return { slot: parsed.slot as Slot, name: parsed.name, password: parsed.password };
  } catch {
    return null;
  }
}

type Store = {
  state: GameState | null;
  connected: boolean;
  lobby: LobbySlot[] | null;
  identity: Identity | null;
  pendingPlacements: Pending[];
  pendingHelperSlot: Slot | null;
  lastError: string | null;
  warning: string | null;
  setState: (state: GameState) => void;
  setConnected: (connected: boolean) => void;
  setLobby: (slots: LobbySlot[]) => void;
  setIdentity: (slot: Slot, name: string, password: string) => void;
  clearIdentity: () => void;
  addPending: (p: Pending) => void;
  removePending: (tileId: string) => void;
  togglePendingSubstitution: (tileId: string, real: Letter, sub: Letter) => void;
  clearPending: () => void;
  setPendingHelperSlot: (slot: Slot | null) => void;
  setError: (message: string | null) => void;
  setWarning: (message: string | null) => void;
};

export const useGameStore = create<Store>((set) => ({
  state: null,
  connected: false,
  lobby: null,
  identity: loadIdentity(),
  pendingPlacements: [],
  pendingHelperSlot: null,
  lastError: null,
  warning: null,
  setState: (state) => set({ state }),
  setConnected: (connected) => set({ connected }),
  setLobby: (slots) => set({ lobby: slots }),
  setIdentity: (slot, name, password) => {
    const identity: Identity = { slot, name, password };
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
    }
    set({ identity });
  },
  clearIdentity: () => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(IDENTITY_KEY);
    }
    set({ identity: null });
  },
  addPending: (p) =>
    set((s) => {
      const i = s.pendingPlacements.findIndex((x) => x.tileId === p.tileId);
      if (i < 0) {
        return { pendingPlacements: [...s.pendingPlacements, p], lastError: null };
      }
      // upsert — moving an already-pending tile keeps its row/col/playedAs updated.
      const next = s.pendingPlacements.slice();
      next[i] = p;
      return { pendingPlacements: next, lastError: null };
    }),
  removePending: (tileId) =>
    set((s) => ({
      pendingPlacements: s.pendingPlacements.filter((x) => x.tileId !== tileId),
      lastError: null,
    })),
  togglePendingSubstitution: (tileId, real, sub) =>
    set((s) => ({
      pendingPlacements: s.pendingPlacements.map((p) =>
        p.tileId === tileId ? { ...p, playedAs: p.playedAs === real ? sub : real } : p,
      ),
    })),
  clearPending: () => set({ pendingPlacements: [], pendingHelperSlot: null, lastError: null }),
  setPendingHelperSlot: (pendingHelperSlot) => set({ pendingHelperSlot }),
  setError: (lastError) => set({ lastError }),
  setWarning: (warning) => set({ warning }),
}));
