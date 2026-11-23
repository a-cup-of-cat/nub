import { create } from 'zustand';
import { balance as b } from '../data/balance';
import { newGame, type GameState } from '../engine/state';
import { tick } from '../engine/tick';
import { restore, serialize, saveKey } from '../engine/save';
type Notice = 'saved' | 'invalid' | 'badLocal' | 'saveFail' | '';
let initial = newGame(),
  notice: Notice = '',
  offline: ReturnType<typeof restore> | null = null;
try {
  const raw = localStorage.getItem(saveKey);
  if (raw) {
    offline = restore(raw, Date.now());
    initial = offline.state;
  }
} catch {
  notice = 'badLocal';
}
interface Session {
  game: GameState;
  notice: Notice;
  offline: typeof offline;
  act: (fn: (s: GameState) => GameState) => void;
  importSave: (raw: string) => boolean;
}
let allowWrite = notice !== 'badLocal';
export const useGame = create<Session>((set) => ({
  game: initial,
  notice,
  offline,
  act: (fn) => set((current) => ({ game: fn(current.game) })),
  importSave: (raw) => {
    try {
      const result = restore(raw, Date.now());
      allowWrite = true;
      set({ game: result.state, offline: result, notice: 'saved' });
      save();
      return true;
    } catch {
      set({ notice: 'invalid' });
      return false;
    }
  },
}));
export function save() {
  if (!allowWrite) return;
  try {
    localStorage.setItem(saveKey, serialize(useGame.getState().game, Date.now()));
  } catch {
    useGame.setState({ notice: 'saveFail' });
  }
}
export function startClock() {
  let last = performance.now(),
    carry = 0,
    hiddenAt: number | null = null;
  function advance() {
    if (document.hidden) return;
    const now = performance.now();
    carry += (now - last) / b.ms;
    last = now;
    const steps = Math.floor(carry / b.step);
    if (!steps) return;
    carry -= steps * b.step;
    useGame.getState().act((s) => {
      for (let i = 0; i < steps; i++) s = tick(s);
      return s;
    });
  }
  function visibility() {
    if (document.hidden) {
      hiddenAt = Date.now();
      save();
    } else {
      last = performance.now();
      carry = 0;
      if (hiddenAt !== null) {
        const r = restore(serialize(useGame.getState().game, hiddenAt), Date.now());
        useGame.setState({ game: r.state, offline: r });
        hiddenAt = null;
        save();
      }
    }
  }
  const timer = setInterval(advance, b.step * b.ms),
    writer = setInterval(() => {
      if (!document.hidden) save();
    }, b.saveEvery * b.ms);
  window.addEventListener('pagehide', saveOnExit);
  document.addEventListener('visibilitychange', visibility);
  function saveOnExit() {
    if (hiddenAt === null) save();
  }
  return () => {
    clearInterval(timer);
    clearInterval(writer);
    window.removeEventListener('pagehide', saveOnExit);
    document.removeEventListener('visibilitychange', visibility);
  };
}
