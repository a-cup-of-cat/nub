import type { MachineId } from '../data/machines';
import type { SplitSetting } from './state';
type Requests = Partial<Record<MachineId, number>>;
export function allocate(
  stock: number,
  requests: Requests,
  setting: SplitSetting = { mode: 'default' },
): Requests {
  const ids = Object.keys(requests) as MachineId[],
    quota: Requests = {};
  let left = stock;
  if (setting.mode === 'priority') {
    for (const id of new Set([...setting.order, ...ids])) {
      if (!requests[id]) continue;
      quota[id] = Math.min(left, requests[id]!);
      left -= quota[id]!;
    }
    return quota;
  }
  for (const id of ids) {
    quota[id] =
      setting.mode === 'manual'
        ? Math.min(requests[id]!, stock * (setting.shares[id] ?? 0), left)
        : 0;
    left -= quota[id]!;
  }
  const unmet = ids.reduce((n, id) => n + requests[id]! - quota[id]!, 0);
  const fraction = unmet ? Math.min(1, left / unmet) : 0;
  for (const id of ids) quota[id]! += (requests[id]! - quota[id]!) * fraction;
  return quota;
}
