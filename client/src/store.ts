import { create } from 'zustand';
import type { DrawState, GameState, Letter, LobbySlot, MovePreview, Slot } from '@shared/types';

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
  // Uncommitted placements of the *other* players (the one whose turn it is),
  // mirrored from the server so everyone watches tiles land. Keyed by slot.
  othersDraft: Record<Slot, Pending[]>;
  lastError: string | null;
  warning: string | null;
  lastPlacedCells: { row: number; col: number }[];
  lastPlacedAt: number;
  lastPlacedSlot: Slot | null;
  drawState: DrawState | null;
  movePreview: MovePreview | null;
  setMovePreview: (preview: MovePreview | null) => void;
  setState: (state: GameState) => void;
  setConnected: (connected: boolean) => void;
  setLobby: (slots: LobbySlot[]) => void;
  setIdentity: (slot: Slot, name: string, password: string) => void;
  clearIdentity: () => void;
  setLiveDraft: (slot: Slot, placements: Pending[]) => void;
  addPending: (p: Pending) => void;
  removePending: (tileId: string) => void;
  togglePendingSubstitution: (tileId: string, real: Letter, sub: Letter) => void;
  clearPending: () => void;
  setError: (message: string | null) => void;
  setWarning: (message: string | null) => void;
  setLastPlaced: (cells: { row: number; col: number }[], at: number, slot: Slot | null) => void;
};

export const useGameStore = create<Store>((set) => ({
  state: null,
  connected: false,
  lobby: null,
  identity: loadIdentity(),
  pendingPlacements: [],
  othersDraft: { 0: [], 1: [], 2: [] },
  lastError: null,
  warning: null,
  lastPlacedCells: [],
  lastPlacedAt: 0,
  lastPlacedSlot: null,
  drawState: null,
  movePreview: null,
  setMovePreview: (movePreview) => set({ movePreview }),
  // Keep only the active player's live draft across snapshots: unrelated broadcasts
  // (assist, suggestions, reconnect) mid-turn shouldn't make their staged tiles
  // flicker. A committed/passed move advances turnIndex, so the now-stale draft is
  // dropped on that snapshot.
  setState: (state) =>
    set((s) => ({
      state,
      drawState: state.drawState,
      othersDraft: { 0: [], 1: [], 2: [], [state.turnIndex]: s.othersDraft[state.turnIndex] },
    })),
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
  setLiveDraft: (slot, placements) =>
    set((s) => ({ othersDraft: { ...s.othersDraft, [slot]: placements } })),
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
  clearPending: () => set({ pendingPlacements: [], lastError: null, movePreview: null }),
  setError: (lastError) => set({ lastError }),
  setWarning: (warning) => set({ warning }),
  setLastPlaced: (cells, at, slot) => set({ lastPlacedCells: cells, lastPlacedAt: at, lastPlacedSlot: slot }),
}));
