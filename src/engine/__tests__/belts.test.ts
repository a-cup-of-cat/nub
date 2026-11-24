import { expect, it } from 'vitest';
import { newGame } from '../state';
import { install, demolish, build } from '../build';
import { tick } from '../tick';
import {
  network,
  carry,
  setBelts,
  quoteBelts,
  craftBelts,
  pairs,
  ports,
  footprint,
  trace,
  planSite,
} from '../belts';
import { serialize, restore, migrate } from '../save';
import { transport as cfg } from '../../data/transport';
import { definition, machineIds } from '../../data/machines';
import { connectAll } from './helpers';

const iron = pairs.find((p) => p.item === 'iron_ore' && p.target === 'furnace_iron')!;
const coal = pairs.find((p) => p.item === 'coal' && p.target === 'furnace_iron')!;
// Cells (grid units). Iron drill at (0,0): out-dock (5,2). Furnace at (20,0): iron in-dock (19,1),
// coal in-dock (19,3). Coal drill at its default (0,21): out-dock (5,23).
const lane = [
  { x: 12, y: 2 },
  { x: 12, y: 1 },
];
// Leaves and enters the docks from other sides, so it shares no segment with `lane`.
const bypass = [
  { x: 5, y: -2 },
  { x: 19, y: -2 },
];
const coalLane = [
  { x: 14, y: 23 },
  { x: 14, y: 3 },
];
function factory() {
  const s = newGame();
  for (const id of ['iron_drill', 'coal_drill', 'furnace_iron'] as const) install(s, id, {});
  s.ui = {
    nodePositions: {
      ...s.ui.nodePositions,
      iron_drill: { x: 0, y: 0 },
      furnace_iron: { x: 20 * cfg.cell, y: 0 },
      coal_drill: { x: 0, y: 21 * cfg.cell },
    },
  };
  s.stock.iron_ore = 500;
  s.stock.coal = 500;
  return s;
}
function laid() {
  const s = factory();
  s.stock.belt = 1000;
  return setBelts(setBelts(s, iron, [lane]), coal, [coalLane]);
}

it('每种输入原料各有一个接收口，输出口在右侧', () => {
  for (const id of machineIds) {
    const d = definition(id),
      { w, h } = footprint(id),
      list = ports(id);
    expect(list.filter((p) => !p.output).map((p) => p.item)).toEqual(Object.keys(d.input));
    expect(list.filter((p) => p.output).map((p) => p.item)).toEqual(Object.keys(d.output));
    const rows = list.filter((p) => !p.output).map((p) => p.y);
    expect(new Set(rows).size).toBe(rows.length);
    expect(list.every((p) => p.y > 0 && p.y < h && p.x === (p.output ? w : 0))).toBe(true);
  }
  expect(ports('furnace_iron').filter((p) => !p.output)).toHaveLength(2);
  expect(ports('chip_fab').filter((p) => !p.output)).toHaveLength(2);
});

it('铺带只按玩家画的横竖直线展开：斜线、穿过设备和折返都被拒绝', () => {
  const free = new Set<string>();
  expect(
    trace(
      [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 2 },
      ],
      free,
    ),
  ).toHaveLength(6);
  expect(
    trace(
      [
        { x: 0, y: 0 },
        { x: 2, y: 2 },
      ],
      free,
    ),
  ).toBeNull();
  expect(
    trace(
      [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
      ],
      new Set(['2,0']),
    ),
  ).toBeNull();
  expect(
    trace(
      [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 0, y: 0 },
      ],
      free,
    ),
  ).toBeNull();
  // A stroke through the furnace body is refused and leaves the state untouched.
  const s = factory();
  s.stock.belt = 1000;
  expect(setBelts(s, iron, [[{ x: 23, y: 2 }]])).toBe(s);
});

it('传送带用石头制造，铺设按节扣除，不够时拒绝，拆带返还', () => {
  const s = factory();
  expect(quoteBelts(s, iron, [lane])!.delta).toBe(17);
  expect(setBelts(s, iron, [lane])).toBe(s);
  s.stock.stone = 10;
  const crafted = craftBelts(s, 5);
  expect(crafted.stock.belt).toBe(5 * cfg.craftYield);
  expect(crafted.stock.stone).toBe(10 - 5 * cfg.craftStone);
  expect(craftBelts(s, 11)).toBe(s);
  const placed = setBelts(crafted, iron, [lane]);
  expect(placed.stock.belt).toBe(crafted.stock.belt - 17);
  expect(setBelts(placed, iron, []).stock.belt).toBe(crafted.stock.belt);
});

it('拆带只切断对应输入，即使库存充足也停工；重新铺设后恢复', () => {
  const s = laid(),
    cut = setBelts(s, iron, []),
    stopped = tick(cut, 60);
  expect(stopped.stock.iron_ingot).toBe(0);
  expect(stopped.stock.coal).toBe(530);
  expect(stopped.machines.furnace_iron.beltLimited).toBe(true);
  const restored = tick(setBelts(stopped, iron, [lane]), 60);
  expect(restored.stock.iron_ingot).toBe(30);
  expect(restored.beltFlow[iron.key + '#0']).toBe(30);
  expect(cut.belts[iron.key]).toEqual([]);
});

it('单路限流，同段共用，不共段的并行带一路可翻倍', () => {
  const s = laid(),
    req = { iron_ore: { furnace_iron: 120 } };
  const rate = (lanes: (typeof lane)[]) =>
    carry(setBelts(s, iron, lanes), req, 1).allowed.iron_ore!.furnace_iron;
  expect(rate([lane])).toBe(cfg.capacityPerMinute);
  expect(rate([lane, lane])).toBe(cfg.capacityPerMinute);
  expect(rate([lane, bypass])).toBe(2 * cfg.capacityPerMinute);
});

it('停掉上游仍可用其出料口发库存，拆掉最后一台即断开并退回带料', () => {
  const s = laid();
  s.machines.iron_drill.paused = 1;
  expect(tick(s, 60).stock.iron_ingot).toBe(30);
  const gone = demolish(s, 'iron_drill');
  expect(tick(gone, 60).stock.iron_ingot).toBe(0);
  expect(gone.belts[iron.key]).toBeUndefined();
  expect(gone.stock.belt).toBe(s.stock.belt + 17);
});

it('建成的设备固定不动；未建设备避开已铺带面，建造时锁定位置', () => {
  const s = laid();
  expect(planSite(s, 'iron_drill', { x: -640, y: 0 })).toBe(s);
  // The crusher's default site (0,0) is taken by the iron drill, so it resolves elsewhere.
  const ghost = network(s).positions.crusher;
  expect(ghost).not.toEqual({ x: 0, y: 0 });
  expect(network(s).sited.crusher).toBe(true);
  // Planning onto the laid iron belt (row 2, x 5..12) is refused; open ground is accepted.
  expect(planSite(s, 'crusher', { x: 6 * cfg.cell, y: 0 })).toBe(s);
  const planned = planSite(s, 'crusher', { x: -20 * cfg.cell, y: 40 * cfg.cell });
  expect(planned.ui.nodePositions.crusher).toEqual({ x: -20 * cfg.cell, y: 40 * cfg.cell });
  planned.stock.stone = 10;
  const built = build(planned, 'crusher');
  expect(built.machines.crusher.count).toBe(1);
  expect(built.ui.nodePositions.crusher).toEqual({ x: -20 * cfg.cell, y: 40 * cfg.cell });
  expect(planSite(built, 'crusher', { x: -40 * cfg.cell, y: 40 * cfg.cell })).toBe(built);
});

it('旧版存档免费补带路；手铺折点、已拆路线与离线约束可往返', () => {
  const s = factory(),
    v1 = JSON.parse(serialize(s, 1000));
  v1.version = 1;
  delete v1.belts;
  delete v1.beltFlow;
  delete v1.stock.belt;
  delete v1.machines.belt_assembler;
  const upgraded = migrate(v1);
  expect(upgraded.stock).toEqual(s.stock);
  expect(upgraded.stock.belt).toBe(0);
  expect(network(upgraded).belts).toHaveLength(2);
  expect(network(upgraded).belts.every((b) => b.cells)).toBe(true);
  expect(restore(serialize(upgraded, 1000), 1000).state.belts).toEqual(upgraded.belts);
  const cut = setBelts(laid(), iron, []);
  const result = restore(serialize(cut, 1000), 61000);
  expect(result.gains.iron_ingot).toBe(0);
  expect(result.state.belts[iron.key]).toEqual([]);
  expect(() =>
    migrate({ ...JSON.parse(serialize(s, 1000)), belts: { [iron.key]: [[{ x: 0.5, y: 0 }]] } }),
  ).toThrow();
});

it('拆掉一个煤支路，另一座熔炉仍可用同一份库存供料', () => {
  const s = laid();
  install(s, 'furnace_copper', {});
  install(s, 'copper_drill', {});
  s.ui = {
    nodePositions: {
      ...s.ui.nodePositions,
      furnace_copper: { x: 20 * cfg.cell, y: 10 * cfg.cell },
      copper_drill: { x: 0, y: 10 * cfg.cell },
    },
  };
  s.stock.copper_ore = 100;
  const n = tick(setBelts(connectAll(s), coal, []), 60);
  expect(n.stock.iron_ingot).toBe(0);
  expect(n.stock.copper_ingot).toBe(30);
});
