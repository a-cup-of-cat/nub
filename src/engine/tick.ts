import { balance as b } from '../data/balance';
import { quantities, itemIds, inventory, type ItemId } from '../data/items';
import { machineIds, type MachineId } from '../data/machines';
import type { GameState } from './state';
import { carry } from './belts';
import { allocate } from './allocation';
import { rates } from './rates';
import { usedGrid } from './build';
import { settlePower } from './power';
import { advanceQueue } from './blueprints';
import { advanceOrders } from './orders';
export function tick(s: GameState, dt: number = b.step, offline = false): GameState {
  if (!Number.isFinite(dt) || dt <= 0) return s;
  const n = {
    ...s,
    stock: { ...s.stock },
    machines: { ...s.machines },
    seen: [...s.seen],
    gross: inventory(),
    net: inventory(),
    powerFactor: 1,
    beltFlow: {} as Record<string, number>,
  };
  const active = machineIds.filter((id) => s.machines[id].count > s.machines[id].paused),
    empty = s.gridCapacity - usedGrid(s);
  const requests: Partial<Record<ItemId, Partial<Record<MachineId, number>>>> = {};
  const factor = dt / b.minute;
  const plan = active.map((id) => {
    const r = rates(s, id, empty);
    const power = r.power > 0 ? s.powerFactor : 1;
    for (const [item, rate] of quantities(r.input))
      (requests[item] ??= {})[id] = rate * factor * power;
    return { id, ...r, power };
  });
  const { allowed, perLane, belts } = carry(s, requests, factor);
  const quotas: typeof requests = {};
  for (const item of itemIds)
    if (requests[item]) quotas[item] = allocate(s.stock[item], allowed[item]!, s.splits[item]);
  for (const id of machineIds)
    if (!active.includes(id) && s.machines[id].utilization)
      n.machines[id] = { ...s.machines[id], utilization: 0, shortage: null };
  for (const { id, input, output, power } of plan) {
    let efficiency = 1,
      shortage: ItemId | null = null;
    for (const [item, rate] of quantities(input)) {
      const ratio = power ? (quotas[item]?.[id] ?? 0) / (rate * factor * power) : 1;
      if (ratio < efficiency) {
        efficiency = ratio;
        shortage = item;
      }
    }
    efficiency *= power;
    n.machines[id] = {
      ...s.machines[id],
      utilization: efficiency,
      beltLimited:
        !!shortage &&
        (allowed[shortage]?.[id] ?? 0) + b.epsilon < (requests[shortage]?.[id] ?? 0) &&
        (quotas[shortage]?.[id] ?? 0) + b.epsilon >= (allowed[shortage]?.[id] ?? 0),
      shortage: efficiency < 1 - b.epsilon ? shortage : null,
    };
    for (const [item, rate] of quantities(input)) n.net[item] -= rate * efficiency;
    for (const [item, rate] of quantities(output)) {
      const actual = rate * efficiency;
      n.gross[item] += actual;
      n.net[item] += actual;
      if (actual > 0 && !n.seen.includes(item)) n.seen.push(item);
    }
  }
  for (const belt of belts) {
    const { item, target } = belt.pair,
      carried = allowed[item]?.[target] ?? 0;
    const actual =
      n.machines[target].utilization * (plan.find((p) => p.id === target)?.input[item] ?? 0);
    n.beltFlow[belt.id] = carried ? (actual * (perLane[belt.id] ?? 0)) / carried : 0;
  }
  for (const item of itemIds) n.stock[item] = Math.max(0, s.stock[item] + n.net[item] * factor);
  if (s.planetId === 'dusk')
    settlePower(
      s,
      n,
      dt,
      Object.fromEntries(
        plan.filter((row) => row.generation).map((row) => [row.id, row.generation]),
      ),
    );
  n.timeSec += dt;
  n.overtime = Math.max(0, s.overtime - dt);
  if (!offline) {
    n.orders = s.orders.map((slot) => ({ ...slot, order: slot.order ? { ...slot.order } : null }));
    advanceOrders(n, dt);
  }
  return offline ? n : advanceQueue(n);
}
