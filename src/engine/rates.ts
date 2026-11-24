import { balance as b } from '../data/balance';
import { cards } from '../data/cards';
import { shop } from '../data/shop';
import { quantities, type Amounts, type ItemId } from '../data/items';
import { definition, machineIds, type MachineId } from '../data/machines';
import { operatingRecipe } from './recipes';
import { sockets } from './belts';
import { usedGrid } from './build';
import type { GameState } from './state';
export function rates(s: GameState, id: MachineId, empty = s.gridCapacity - usedGrid(s)) {
  const recipe = operatingRecipe(s, id),
    d = definition(id),
    g = s.machines[id],
    has = (c: keyof typeof cards) => s.cards.includes(c);
  const key =
    d.group === 'mining'
      ? 'boost_mining'
      : d.group === 'smelting'
        ? 'boost_smelting'
        : 'boost_assembly';
  let speed = d.group !== 'power' && has(key) ? cards[key].effect : 1;
  if (
    has('superconductor') &&
    s.demand > 0 &&
    s.supply >= s.demand * cards.superconductor.threshold
  )
    speed *= cards.superconductor.effect;
  if (has('automation_core')) speed *= cards.automation_core.effect;
  if (has('lean')) speed *= 1 + Math.min(cards.lean.max, empty * cards.lean.step);
  if (has('pioneer_horn') && s.timeSec < cards.pioneer_horn.minutes * b.minute)
    speed *= cards.pioneer_horn.effect;
  if (s.overtime > 0) speed *= shop.overtime.multiplier;
  const inputFactor = has('precision') && d.group !== 'mining' ? cards.precision.effect : 1;
  const outputFactor =
    (has('quantum_copy') ? cards.quantum_copy.effect : 1) *
    (recipe.power < 0 && has('boost_power') ? cards.boost_power.effect : 1);
  let throughput = 0;
  for (const unit of g.units.slice(0, g.count - g.paused)) {
    const factor = speed * (unit.heavy ? cards.heavy.effect : 1);
    throughput += Math.min(factor, (b.maxMultiplier * inputFactor) / outputFactor);
  }
  const scale = (a: Amounts, f: number): Amounts =>
    Object.fromEntries(quantities(a).map(([k, n]) => [k, n * f]));
  return {
    input: scale(recipe.input, throughput * inputFactor),
    power: recipe.power,
    generation: Math.max(0, -recipe.power) * throughput * outputFactor,
    output: scale(recipe.output, throughput * outputFactor),
  };
}
export function analysis(s: GameState) {
  const supply: Amounts = {},
    demand: Amounts = {};
  const empty = s.gridCapacity - usedGrid(s);
  for (const id of machineIds) {
    const r = rates(s, id, empty);
    for (const [k, n] of quantities(r.output)) supply[k] = (supply[k] ?? 0) + n;
    for (const [k, n] of quantities(r.input)) demand[k] = (demand[k] ?? 0) + n;
  }
  const shortages = quantities(demand)
    .filter(([, n]) => n > 0)
    .map(([item, n]) => {
      const producer = machineIds.find((id) => item in sockets(id).output)!;
      const ratio = (supply[item] ?? 0) / n;
      return {
        item,
        producer,
        ratio,
        extra: Math.max(
          0,
          Math.ceil(
            (n - (supply[item] ?? 0)) / (producer ? sockets(producer).output[item as ItemId]! : 1),
          ),
        ),
      };
    })
    .filter((v) => v.producer && v.ratio < b.bottleneckThreshold)
    .sort((a, b) => a.ratio - b.ratio);
  return { supply, demand, shortages };
}
