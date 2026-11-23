import { balance as b } from '../../data/balance';
import { zhCN } from '../../i18n/zh-CN';
import { transport } from '../../data/transport';
import { inventory, itemIds, type Amounts } from '../../data/items';
import type { GameState } from '../../engine/state';
export function rateUnits(perMinute: number) {
  if (Math.abs(perMinute) < b.epsilon) return { value: 0, unit: 'second' as const };
  if (Math.abs(perMinute) >= transport.perSecondThreshold * b.minute - b.epsilon)
    return { value: perMinute / b.minute, unit: 'second' as const };
  return { value: perMinute, unit: 'minute' as const };
}
const compact = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });
const precise = new Intl.NumberFormat('zh-CN', { maximumSignificantDigits: 2 });
export function rateText(n: number, signed = false) {
  const { value, unit } = rateUnits(n);
  const shown =
    value !== 0 && Math.abs(value) < 0.1 ? precise.format(value) : compact.format(value);
  return (signed && value > 0 ? '+' : '') + shown + zhCN.ui[unit];
}
export const readout = (s: GameState, gross: Amounts = s.gross, net: Amounts = s.net) => ({
  seen: [...s.seen],
  stock: { ...s.stock },
  gross: { ...gross },
  net: { ...net },
});
export function sampleInventory() {
  let elapsed = 0,
    gross = inventory(),
    net = inventory();
  return (s: GameState, dt: number) => {
    if (dt <= 0) return;
    for (const id of itemIds) {
      gross[id] += (s.gross[id] ?? 0) * dt;
      net[id] += (s.net[id] ?? 0) * dt;
    }
    elapsed += dt;
    if (elapsed + b.epsilon < transport.readoutSeconds) return;
    for (const id of itemIds) {
      gross[id] /= elapsed;
      net[id] /= elapsed;
    }
    const snapshot = readout(s, gross, net);
    elapsed = 0;
    gross = inventory();
    net = inventory();
    return snapshot;
  };
}
