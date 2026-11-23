import { expect, it } from 'vitest';
import { newGame } from '../state';
import { install, demolish } from '../build';
import { tick } from '../tick';
import { network, carry, setBelts, pairs, routeCells } from '../belts';
import { serialize, restore, migrate } from '../save';
import { transport as cfg } from '../../data/transport';
const iron = pairs.find((p) => p.item === 'iron_ore' && p.target === 'furnace_iron')!;
const bypass = [
  { x: 9, y: 1 },
  { x: 19, y: 1 },
];
function factory() {
  const s = newGame();
  for (const id of ['iron_drill', 'coal_drill', 'furnace_iron'] as const) install(s, id, {});
  s.ui.nodePositions.iron_drill = { x: 0, y: 0 };
  s.ui.nodePositions.furnace_iron = { x: 640, y: 0 };
  s.stock.iron_ore = 500;
  s.stock.coal = 500;
  return s;
}
it('带路由连续正交格组成；中途指定折点，绕过设备，拒绝厂房内的折点', () => {
  const s = factory(),
    g = network(s),
    path = routeCells(g.positions, iron, bypass, g.blocked)!;
  expect(path).toEqual(expect.arrayContaining(bypass));
  expect(
    path.every((p, i) => !i || Math.abs(p.x - path[i - 1].x) + Math.abs(p.y - path[i - 1].y) === 1),
  ).toBe(true);
  expect(setBelts(s, iron, [[{ x: 1, y: 1 }]])).toBe(s);
  expect(s.belts).toEqual({});
});
it('拆带只切断对应输入，即使库存充足也停工；重新铺设后恢复', () => {
  const s = factory(),
    cut = setBelts(s, iron, []),
    stopped = tick(cut, 60);
  expect(stopped.stock.iron_ingot).toBe(0);
  expect(stopped.stock.coal).toBe(530);
  expect(stopped.machines.furnace_iron.beltLimited).toBe(true);
  const restored = tick(setBelts(stopped, iron, [bypass]), 60);
  expect(restored.stock.iron_ingot).toBe(30);
  expect(restored.beltFlow[iron.key + '#0']).toBe(30);
  expect(cut.belts[iron.key]).toEqual([]);
});
it('单路限流，同段共用，不重叠的并行带一路可翻倍', () => {
  const s = factory(),
    req = { iron_ore: { furnace_iron: 120 } };
  const rate = (lanes: (typeof bypass)[]) =>
    carry(setBelts(s, iron, lanes), req, 1).allowed.iron_ore!.furnace_iron;
  expect(rate([[]])).toBe(cfg.capacityPerMinute);
  expect(rate([[], []])).toBe(cfg.capacityPerMinute);
  expect(rate([[], bypass])).toBe(2 * cfg.capacityPerMinute);
});
it('停掉上游仍可用其出料口发库存，拆掉最后一个出料口即断开', () => {
  const s = factory();
  s.machines.iron_drill.paused = 1;
  expect(tick(s, 60).stock.iron_ingot).toBe(30);
  const gone = demolish(s, 'iron_drill');
  expect(tick(gone, 60).stock.iron_ingot).toBe(0);
});
it('旧版存档补默认带路；手铺折点、已拆路线与离线约束可往返', () => {
  const s = factory(),
    v1 = JSON.parse(serialize(s, 1000));
  v1.version = 1;
  delete v1.belts;
  delete v1.beltFlow;
  const upgraded = migrate(v1);
  expect(upgraded.stock).toEqual(s.stock);
  expect(upgraded.ui).toEqual(s.ui);
  expect(network(upgraded).belts.length).toBe(2);
  const laid = setBelts(upgraded, iron, [bypass]);
  expect(restore(serialize(laid, 1000), 1000).state.belts).toEqual(laid.belts);
  const cut = setBelts(laid, iron, []);
  const result = restore(serialize(cut, 1000), 61000);
  expect(result.gains.iron_ingot).toBe(0);
  expect(result.state.belts[iron.key]).toEqual([]);
  expect(() => migrate({ ...s, belts: { [iron.key]: [[{ x: 0.5, y: 0 }]] } })).toThrow();
});

it('移动设备挡住手铺折点后线路报阻，移开后按原折点恢复', () => {
  const s = setBelts(factory(), iron, [bypass]);
  install(s, 'crusher', {});
  const blocked = {
    ...s,
    ui: { nodePositions: { ...s.ui.nodePositions, crusher: { x: 9 * cfg.cell, y: 0 } } },
  };
  expect(network(blocked).belts.find((b) => b.pair.key === iron.key)?.cells).toBeNull();
  expect(tick(blocked, 60).stock.iron_ingot).toBe(0);
  const clear = {
    ...blocked,
    ui: { nodePositions: { ...blocked.ui.nodePositions, crusher: { x: -640, y: 320 } } },
  };
  expect(tick(clear, 60).stock.iron_ingot).toBe(30);
});
it('拆掉一个煤支路，另一座熔炉仍可用同一份库存供料', () => {
  const s = factory();
  install(s, 'furnace_copper', {});
  install(s, 'copper_drill', {});
  s.stock.copper_ore = 100;
  const branch = pairs.find((p) => p.item === 'coal' && p.target === 'furnace_iron')!;
  const n = tick(setBelts(s, branch, []), 60);
  expect(n.stock.iron_ingot).toBe(0);
  expect(n.stock.copper_ingot).toBe(30);
});
