import { balance as b } from '../data/balance';
import { cards } from '../data/cards';
import { rawItems, quantities, type ItemId, type Amounts } from '../data/items';
import { definition, machineIds, type MachineId } from '../data/machines';
import type { GameState } from './state';
export function usedGrid(s: GameState) {
  return machineIds.reduce(
    (sum, id) =>
      sum +
      s.machines[id].units.reduce(
        (n, u) => n + definition(id).fp * (u.heavy ? cards.heavy.footprint : 1),
        0,
      ),
    0,
  );
}
// SPEC-GAP: 设备在其建造材料都曾进入库存后解锁。拆除按实付材料返还，同种设备后建先拆。
export function available(s: GameState, id: MachineId) {
  return quantities(definition(id).cost).every(([item]) => s.seen.includes(item));
}
export function cost(s: GameState, id: MachineId, planet = 1): Amounts {
  const d = definition(id),
    g = d.costGroup ?? id;
  if (s.cards.includes('first_free') && !s.machines[id].built) return {};
  const count = machineIds
    .filter((m) => (definition(m).costGroup ?? m) === g)
    .reduce((n, m) => n + s.machines[m].count, 0);
  return Object.fromEntries(
    quantities(d.cost).map(([item, base]) => [
      item,
      Math.ceil(
        base * b.costGrowth ** count * (d.base ? b.baseDiscount ** (planet - 1) : 1) - b.epsilon,
      ),
    ]),
  );
}
export function fits(s: GameState, id: MachineId) {
  return (
    usedGrid(s) + definition(id).fp * (s.cards.includes('heavy') ? cards.heavy.footprint : 1) <=
    s.gridCapacity
  );
}
export function canBuild(s: GameState, id: MachineId) {
  return (
    available(s, id) &&
    fits(s, id) &&
    quantities(cost(s, id)).every(([k, n]) => s.stock[k] + b.epsilon >= n)
  );
}
export function install(s: GameState, id: MachineId, paid: Amounts) {
  const group = s.machines[id];
  group.units.push({ heavy: s.cards.includes('heavy'), cost: paid });
  group.count++;
  group.built++;
}
export function build(s: GameState, id: MachineId, count = 1) {
  const next = structuredClone(s);
  let made = 0;
  while (made < count && canBuild(next, id)) {
    const paid = cost(next, id);
    for (const [k, n] of quantities(paid)) next.stock[k] = Math.max(0, next.stock[k] - n);
    install(next, id, paid);
    made++;
  }
  return made ? next : s;
}
export function demolish(s: GameState, id: MachineId) {
  if (!s.machines[id].count) return s;
  const next = structuredClone(s),
    group = next.machines[id],
    last = group.units.pop()!;
  group.count--;
  group.paused = Math.min(group.paused, group.count);
  for (const [k, n] of quantities(last.cost))
    next.stock[k] += n * (s.cards.includes('modular') ? cards.modular.effect : b.refundRate);
  return next;
}
export function pause(s: GameState, id: MachineId, paused: number) {
  const n = structuredClone(s);
  n.machines[id].paused = Math.min(n.machines[id].count, Math.max(0, Math.trunc(paused)));
  return n;
}
export function mine(s: GameState, item: ItemId = 'stone') {
  const master = s.cards.includes('pick_master');
  if (!rawItems.includes(item) || !s.seen.includes(item) || (!master && item !== 'stone')) return s;
  return {
    ...s,
    mined: s.mined + 1,
    stock: {
      ...s.stock,
      [item]: s.stock[item] + b.mineAmount * (master ? cards.pick_master.effect : 1),
    },
  };
}
