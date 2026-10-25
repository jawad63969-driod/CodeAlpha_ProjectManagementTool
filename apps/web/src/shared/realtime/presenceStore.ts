import { create } from 'zustand';
import type { UserRefDto } from '@taskforge/shared';

interface DragHint {
  taskId: string;
  columnId: string;
  user: UserRefDto;
  at: number;
}

interface PresenceState {
  viewers: Record<string, UserRefDto[]>;
  drags: Record<string, DragHint>;
  connected: boolean;
  setConnected: (connected: boolean) => void;
  setViewers: (projectId: string, viewers: UserRefDto[]) => void;
  noteDrag: (hint: Omit<DragHint, 'at'>) => void;
  expireDrags: () => void;
  reset: () => void;
}

/**
 * Ephemeral UI state — who is looking, who is dragging. Deliberately NOT in the
 * query cache: it is not server data, it expires on its own and nothing refetches it.
 */
export const usePresence = create<PresenceState>((set) => ({
  viewers: {},
  drags: {},
  connected: false,
  setConnected: (connected) => set({ connected }),
  setViewers: (projectId, viewers) => set((state) => ({ viewers: { ...state.viewers, [projectId]: viewers } })),
  noteDrag: (hint) => set((state) => ({ drags: { ...state.drags, [hint.taskId]: { ...hint, at: Date.now() } } })),
  expireDrags: () =>
    set((state) => {
      const fresh = Object.fromEntries(
        Object.entries(state.drags).filter(([, hint]) => Date.now() - hint.at < 2500),
      );
      return Object.keys(fresh).length === Object.keys(state.drags).length ? state : { drags: fresh };
    }),
  reset: () => set({ viewers: {}, drags: {}, connected: false }),
}));
