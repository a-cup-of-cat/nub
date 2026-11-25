import { balance as b } from '../data/balance';
import { rank, machineLimit } from '../data/planets';
import { cards } from '../data/cards';
import { rawItems, quantities, type ItemId, type Amounts } from '../data/items';
import { definition, machineIds, type MachineId } from '../data/machines';
import type { GameState } from './state';
import { network } from './belts';
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
  return (
    (definition(id).tier ?? 1) <= rank[s.planetId] &&
    quantities(definition(id).cost).every(([item]) => s.seen.includes(item))
  );
}
export function cost(s: GameState, id: MachineId, planet = rank[s.planetId] as number): Amounts {
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
export function gridFits(s: GameState, id: MachineId) {
  return (
    usedGrid(s) + definition(id).fp * (s.cards.includes('heavy') ? cards.heavy.footprint : 1) <=
    s.gridCapacity
  );
}
// A group's first machine needs a clear site on the canvas; later units join the same node.
export function sited(s: GameState, id: MachineId) {
  return s.machines[id].count > 0 || !!network(s).sited[id];
}
export function fits(s: GameState, id: MachineId) {
  return s.machines[id].count < machineLimit(s.planetId, id) && sited(s, id) && gridFits(s, id);
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
  // The first unit freezes the resolved site: from now on the node only leaves by demolition.
  if (!group.count)
    s.ui = { ...s.ui, nodePositions: { ...s.ui.nodePositions, [id]: network(s).positions[id] } };
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
  if (!group.count) {
    const before = network(s);
    for (const pair of before.active) {
      if (pair.source === id || pair.target === id) delete next.belts[pair.key];
    }
    delete next.ui.nodePositions[id];
    const released = before.pieces.size - network(next).pieces.size;
    next.stock.belt += released;
    if (released > 0 && !next.seen.includes('belt')) next.seen.push('belt');
  }
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
