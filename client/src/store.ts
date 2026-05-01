import { create } from 'zustand';
import type { GameState, Slot } from '@shared/types';

type Pending = { tileId: string; row: number; col: number };

type Store = {
  state: GameState | null;
  connected: boolean;
  mySlot: Slot | null;
  myName: string | null;
  pendingPlacements: Pending[];
  lastError: string | null;
  setState: (state: GameState) => void;
  setConnected: (connected: boolean) => void;
  setIdentity: (slot: Slot, name: string) => void;
  addPending: (p: Pending) => void;
  removePending: (tileId: string) => void;
  clearPending: () => void;
  setError: (message: string | null) => void;
};

export const useGameStore = create<Store>((set) => ({
  state: null,
  connected: false,
  mySlot: null,
  myName: null,
  pendingPlacements: [],
  lastError: null,
  setState: (state) => set({ state }),
  setConnected: (connected) => set({ connected }),
  setIdentity: (mySlot, myName) => set({ mySlot, myName }),
  addPending: (p) =>
    set((s) => ({ pendingPlacements: [...s.pendingPlacements, p], lastError: null })),
  removePending: (tileId) =>
    set((s) => ({
      pendingPlacements: s.pendingPlacements.filter((x) => x.tileId !== tileId),
      lastError: null,
    })),
  clearPending: () => set({ pendingPlacements: [], lastError: null }),
  setError: (lastError) => set({ lastError }),
}));
