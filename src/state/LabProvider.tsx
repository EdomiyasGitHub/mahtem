import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from 'react';
import { type LabAction, type LabState, type Task, initialLabState, labReducer } from './lab.ts';
import { type EdgeKey, edgeDrawnEntry } from './chain.ts';

interface LabContextValue {
  readonly state: LabState;
  /** Run one bench operation; failures are recorded, never thrown into the UI. */
  readonly run: (task: Task, operation: () => Promise<LabAction>) => Promise<void>;
  readonly reset: () => void;
  /** Record that the Trust chain screen has drawn a verified edge (logged once). */
  readonly drawEdge: (key: Exclude<EdgeKey, 'root-self'>) => void;
}

const LabContext = createContext<LabContextValue | null>(null);

export function LabProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(labReducer, initialLabState);

  const run = useCallback(async (task: Task, operation: () => Promise<LabAction>) => {
    dispatch({ type: 'started', task });
    try {
      dispatch(await operation());
    } catch (e) {
      dispatch({ type: 'failed', task, message: e instanceof Error ? e.message : 'The operation failed.' });
    }
  }, []);

  const reset = useCallback(() => dispatch({ type: 'reset' }), []);
  const drawEdge = useCallback(
    (key: Exclude<EdgeKey, 'root-self'>) => dispatch({ type: 'edge-drawn', key, entry: edgeDrawnEntry(key) }),
    [],
  );
  const value = useMemo(() => ({ state, run, reset, drawEdge }), [state, run, reset, drawEdge]);
  return <LabContext.Provider value={value}>{children}</LabContext.Provider>;
}

export function useLab(): LabContextValue {
  const ctx = useContext(LabContext);
  if (!ctx) throw new Error('useLab must be used inside <LabProvider>');
  return ctx;
}
