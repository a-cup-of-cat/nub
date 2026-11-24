import { simulateDusk } from './dusk';
import { dusk } from '../src/data/planets';
import { balance as b } from '../src/data/balance';
import { definition, goldenLine, machineIds, type MachineId } from '../src/data/machines';
import { quantities } from '../src/data/items';
import { build, canBuild, cost, mine, usedGrid } from '../src/engine/build';
import { newGame } from '../src/engine/state';
import { analysis, rates } from '../src/engine/rates';
import { autoLane, craftBelts, network, quoteBelts, setBelts } from '../src/engine/belts';
import { transport as cfg } from '../src/data/transport';
import { deliverGoal, progress, choose, leaveMerchant } from '../src/engine/merchant';
import { tick } from '../src/engine/tick';
import { writeTimeline } from './timeline.mjs';

export function simulate() {
  let s = newGame(),
    checks = 0;
  const rows = ['seconds,event,progress,used_grid,capacity,part,circuit,chip'];
  const log = (event: string) =>
    rows.push(
      [
        s.timeSec.toFixed(1),
        event,
        progress(s).toFixed(5),
        usedGrid(s),
        s.gridCapacity,
        s.stock.part.toFixed(2),
        s.stock.circuit.toFixed(2),
        s.stock.chip.toFixed(2),
      ].join(','),
    );
  const targets = { crusher: 1, ...goldenLine };
  while (s.timeSec < b.botLimit && s.merchant.stage !== 'finished') {
    for (let step = 0; step < Math.round(b.botInterval / b.step); step++) {
      if (step % Math.round(1 / (b.botClicksPerSecond * b.step)) === 0) s = mine(s);
      s = tick(s);
    }
    checks++;
    const flows = analysis(s);
    const bottlenecks = flows.shortages
      .filter((v) => v.ratio < 1 - b.epsilon)
      .map((v) => v.producer);
    // Include construction bottlenecks when a balanced chain consumes its entire output.
    const missing = machineIds.filter((id) => s.machines[id].count < (targets[id] ?? 0));
    for (const next of missing) {
      for (const [item, need] of quantities(cost(s, next))) {
        if (
          s.stock[item] + b.epsilon < need &&
          (flows.supply[item] ?? 0) > 0 &&
          (flows.supply[item] ?? 0) - (flows.demand[item] ?? 0) <= b.epsilon
        ) {
          const producer = machineIds.find((id) => item in definition(id).output)!;
          if (!bottlenecks.includes(producer)) bottlenecks.push(producer);
        }
      }
    }
    const candidates = new Set<MachineId>([...bottlenecks, ...machineIds]);
    for (const id of candidates) {
      if (
        (bottlenecks.includes(id) || s.machines[id].count < (targets[id] ?? 0)) &&
        canBuild(s, id)
      ) {
        s = build(s, id);
        log('build_' + id);
      }
    }
    // Lay belts like a player would: enough independent lanes for each link's full demand,
    // crafting belt pieces from stone when the stockpile runs short.
    for (const pair of network(s).active) {
      const demand = rates(s, pair.target).input[pair.item] ?? 0,
        wanted = Math.min(
          cfg.maxBeltsPerPair,
          Math.max(1, Math.ceil(demand / cfg.capacityPerMinute - b.epsilon)),
        );
      while ((s.belts[pair.key] ?? []).length < wanted) {
        const via = autoLane(s, pair),
          lanes = [...(s.belts[pair.key] ?? []), ...(via ? [via] : [])];
        const quote = via && quoteBelts(s, pair, lanes);
        if (!quote) break;
        const missing = quote.delta - Math.floor(s.stock.belt + b.epsilon);
        if (missing > 0) s = craftBelts(s, Math.ceil(missing / cfg.craftYield));
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
      const card = s.merchant.offers[0];
      s = choose(s, card);
      log('card_' + card);
      s = leaveMerchant(s);
    }
    if (s.merchant.stage === 'farewell') {
      s = leaveMerchant(s);
      log('finished');
    }
    if (checks % Math.round(b.minute / b.botInterval) === 0) log('minute');
  }
  return { state: s, rows };
}
const { state, rows } = simulate();
writeTimeline(rows.join('\n') + '\n');
const minutes = state.timeSec / b.minute;
console.log(
  `灰砾模拟：${minutes.toFixed(2)} 分钟；进度 ${(progress(state) * 100).toFixed(1)}%；时间线 simulation-timeline.csv`,
);
console.log('交付', Object.fromEntries(quantities(state.goalDelivered)));
if (minutes < b.targetMin || minutes > b.targetMax || state.merchant.stage !== 'finished')
  console.warn('警告：未达到规格中的通关时间范围，请策划复核。');

if (state.merchant.stage === 'finished') {
  const result = simulateDusk(state);
  writeTimeline(result.rows.join('\n') + '\n', 'simulation-dusk.csv');
  const elapsed = result.state.timeSec / b.minute;
  console.log(
    '晨昏模拟',
    elapsed.toFixed(2),
    '分钟',
    result.state.goalDelivered,
    '进度',
    progress(result.state),
  );
  if (
    elapsed < dusk.targetMinutes[0] ||
    elapsed > dusk.targetMinutes[1] ||
    result.state.merchant.stage !== 'finished'
  )
    console.warn('警告：晨昏未达到 40–70 分钟验收范围。');
}
