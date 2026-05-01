import { create } from 'zustand';
import type { GameState } from '@shared/types';

type Store = {
  state: GameState | null;
  connected: boolean;
  setState: (state: GameState) => void;
  setConnected: (connected: boolean) => void;
};

export const useGameStore = create<Store>((set) => ({
  state: null,
  connected: false,
  setState: (state) => set({ state }),
  setConnected: (connected) => set({ connected }),
}));
