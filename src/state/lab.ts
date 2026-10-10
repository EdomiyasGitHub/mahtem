/** Lab session state: everything lives in memory and disappears on reload or reset. */
import type { Diploma } from '../documents/diploma.ts';
import type { LedgerEntry, RootParty, SignedDiploma, SubordinateParty } from './operations.ts';

export type Task = 'root' | 'ministry-request' | 'ministry-certify' | 'university-request' | 'university-certify' | 'sign' | 'whole-lab';

export interface LabState {
  readonly root: RootParty | null;
  readonly ministry: SubordinateParty | null;
  readonly university: SubordinateParty | null;
  readonly signed: SignedDiploma | null;
  readonly ledger: readonly LedgerEntry[];
  /** Chain edges already drawn (and logged) on the Trust chain screen. */
  readonly drawnEdges: readonly string[];
  readonly busy: Task | null;
  readonly error: { readonly task: Task; readonly message: string } | null;
}

export const initialLabState: LabState = {
  root: null,
  ministry: null,
  university: null,
  signed: null,
  ledger: [],
  drawnEdges: [],
  busy: null,
  error: null,
};

export type LabAction =
  | { type: 'started'; task: Task }
  | { type: 'root-created'; root: RootParty; entries: readonly LedgerEntry[] }
  | { type: 'ministry-updated'; ministry: SubordinateParty; entries: readonly LedgerEntry[] }
  | { type: 'university-updated'; university: SubordinateParty; entries: readonly LedgerEntry[] }
  | { type: 'diploma-signed'; signed: SignedDiploma; entries: readonly LedgerEntry[] }
  | { type: 'lab-built'; root: RootParty; ministry: SubordinateParty; university: SubordinateParty; entries: readonly LedgerEntry[] }
  | { type: 'edge-drawn'; key: string; entry: LedgerEntry }
  | { type: 'failed'; task: Task; message: string }
  | { type: 'reset' };

/** Newest first, capped so a long session cannot grow without bound. */
const log = (state: LabState, entries: readonly LedgerEntry[]) => [...[...entries].reverse(), ...state.ledger].slice(0, 200);

export function labReducer(state: LabState, action: LabAction): LabState {
  switch (action.type) {
    case 'started':
      return { ...state, busy: action.task, error: null };
    case 'root-created':
      return { ...state, busy: null, root: action.root, ledger: log(state, action.entries) };
    case 'ministry-updated':
      return { ...state, busy: null, ministry: action.ministry, ledger: log(state, action.entries) };
    case 'university-updated':
      return { ...state, busy: null, university: action.university, ledger: log(state, action.entries) };
    case 'diploma-signed':
      return { ...state, busy: null, signed: action.signed, ledger: log(state, action.entries) };
    case 'lab-built':
      return { ...state, busy: null, root: action.root, ministry: action.ministry, university: action.university, ledger: log(state, action.entries) };
    case 'edge-drawn':
      // Each edge is drawn, and logged, once.
      return state.drawnEdges.includes(action.key)
        ? state
        : { ...state, drawnEdges: [...state.drawnEdges, action.key], ledger: log(state, [action.entry]) };
    case 'failed':
      return { ...state, busy: null, error: { task: action.task, message: action.message } };
    case 'reset':
      return initialLabState;
  }
}

/** Where the bench is: the next action available, in course order. */
export type Stage = 'root' | 'ministry-request' | 'ministry-certify' | 'university-request' | 'university-certify' | 'sign' | 'done';

export function currentStage(s: LabState): Stage {
  if (!s.root) return 'root';
  if (!s.ministry) return 'ministry-request';
  if (!s.ministry.certificate) return 'ministry-certify';
  if (!s.university) return 'university-request';
  if (!s.university.certificate) return 'university-certify';
  if (!s.signed) return 'sign';
  return 'done';
}

export type DiplomaDraft = Diploma;
