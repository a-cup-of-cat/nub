import { balance as b } from '../src/data/balance';
import { dusk } from '../src/data/planets';
import { type MachineId } from '../src/data/machines';
import { quantities } from '../src/data/items';
import { build, canBuild, mine, pause } from '../src/engine/build';
import {
  autoLane,
  bends,
  routeCells,
  craftBelts,
  network,
  quoteBelts,
  setBelts,
} from '../src/engine/belts';
import { rates } from '../src/engine/rates';
import { transport } from '../src/data/transport';
import { choose, deliverGoal, leaveMerchant, progress } from '../src/engine/merchant';
import { setRecipe, operatingRecipe } from '../src/engine/recipes';
import { landOnDusk } from '../src/engine/travel';
import { tick } from '../src/engine/tick';
import type { GameState } from '../src/engine/state';

// The pilot builds from landing supplies, keeping one workshop and changing its recipe.
export function simulateDusk(previous: GameState) {
  let s = landOnDusk(previous);
  if (s.planetId !== 'dusk') throw Error('landing');
  const rows = ['seconds,event,progress,power,bed,servo,cnc'];
  const log = (event: string) =>
    rows.push(
      [
        s.timeSec.toFixed(1),
        event,
        progress(s).toFixed(4),
        s.powerFactor.toFixed(3),
        ...Object.keys(dusk.goal).map((k) => s.goalDelivered[k as keyof typeof dusk.goal] ?? 0),
      ].join(','),
    );
  const plan: MachineId[] = [
    'coal_drill',
    'coal_plant',
    'iron_drill',
    'furnace_iron',
    'copper_drill',
    'furnace_copper',
    'coal_drill',
    'iron_drill',
    'furnace_iron',
    'assembler',
    'wire_drawer',
    'circuit_fab',
    'quartz_drill',
    'wafer_fab',
    'steel_furnace',
    'coal_drill',
    'coal_plant',
    'wire_drawer',
    'circuit_fab',
    'chip_fab',
    'bauxite_drill',
    'electrolyzer',
    'motor_fab',
    'coal_plant',
    'precision_shop',
  ];
  let index = 0;
  log('landing');
  while (s.timeSec < b.botLimit && s.merchant.stage !== 'finished') {
    for (let i = 0; i < Math.round(b.botInterval / b.step); i++) {
      if (i % Math.round(1 / (b.botClicksPerSecond * b.step)) === 0) s = mine(s);
      s = tick(s);
    }
    if (index < plan.length && canBuild(s, plan[index])) {
      s = build(s, plan[index]);
      log('build_' + plan[index++]);
    }
    // Stop stockpiling finished intermediates while other branches need the shared feed.
    for (const [id, item, limit] of [
      ['assembler', 'part', 110],
      ['steel_furnace', 'steel', 290],
      ['chip_fab', 'chip', 110],
      ['motor_fab', 'motor', 40],
    ] as const) {
      const g = s.machines[id],
        paused = s.stock[item] >= limit ? g.count : 0;
      if (paused !== g.paused) s = pause(s, id, paused);
    }
    if (s.machines.precision_shop.count) {
      const recipe = quantities(dusk.goal).find(([k, n]) => (s.goalDelivered[k] ?? 0) < n)?.[0];
      if (recipe === 'machine_bed' || recipe === 'servo' || recipe === 'cnc')
        s = setRecipe(s, 'precision_shop', recipe);
    }
    for (const pair of network(s).active) {
      if (!(pair.item in operatingRecipe(s, pair.target).input)) continue;
      const demand = rates(s, pair.target).input[pair.item] ?? 0;
      const wanted = Math.min(
        transport.maxBeltsPerPair,
        Math.ceil(demand / transport.capacityPerMinute - b.epsilon),
      );
      while ((s.belts[pair.key] ?? []).length < wanted) {
        const net = network(s);
        let via = autoLane(s, pair);
        if (!via && !s.belts[pair.key]?.length) {
          const shared = routeCells(net.positions, pair, [], net.blocked);
          if (shared) via = bends(shared);
        }
        if (!via) break;
        const lanes = [...(s.belts[pair.key] ?? []), via];
        const quote = quoteBelts(s, pair, lanes);
        if (!quote) break;
        const missing = quote.delta - Math.floor(s.stock.belt + b.epsilon);
        if (missing > 0) s = craftBelts(s, Math.ceil(missing / transport.craftYield));
        const laid = setBelts(s, pair, lanes);
        if (laid === s) break;
        s = laid;
        log('belt_' + pair.key);
      }
    }
    const before = progress(s);
    s = deliverGoal(s);
    if (progress(s) > before) log('deliver');
    if (s.merchant.stage === 'docked') {
      s = choose(s, s.merchant.offers[0]);
      s = leaveMerchant(s);
      log('visit');
    }
    if (s.merchant.stage === 'farewell') {
      s = leaveMerchant(s);
      log('finished');
    }
  }
  return { state: s, rows };
}
