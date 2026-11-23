import { describe, it, expect } from 'vitest';
import { balance as b } from '../../data/balance';
import { itemIds } from '../../data/items';
import { goldenLine, type MachineId } from '../../data/machines';
import { newGame } from '../state';
import { cost, build, canBuild, install, demolish, mine, usedGrid, pause } from '../build';
import { allocate } from '../allocation';
import { rates } from '../rates';
import { tick } from '../tick';

describe('灰砾生产与建造', () => {
  it('从空仓手挖十次，建碎石机，六十秒产出六十石头', () => {
    let s = newGame();
    for (let i = 0; i < 10; i++) s = mine(s);
    expect(s.stock.stone).toBe(10);
    const built = build(s, 'crusher');
    expect(built.stock.stone).toBe(0);
    expect(s.machines.crusher.count).toBe(0);
    expect(tick(built, 60).stock.stone).toBe(60);
    expect(built.stock.stone).toBe(0);
  });
  it('熔炉共享涨价，星球折扣在材料取整之前应用', () => {
    let s = newGame();
    s.stock.stone = 200;
    s = build(s, 'furnace_iron');
    expect(cost(s, 'furnace_copper')).toEqual({ stone: 88 });
    expect(cost(s, 'furnace_copper', 2)).toEqual({ stone: 66 });
    s = build(s, 'furnace_copper');
    expect(demolish(s, 'furnace_iron').stock.stone).toBe(s.stock.stone + 40);
    expect(demolish(s, 'furnace_copper').stock.stone).toBe(s.stock.stone + 44);
  });
  it('批量建造逐台涨价，满格阻止建造，暂停不释放格子', () => {
    let s = newGame();
    s.stock.stone = 1000;
    s.gridCapacity = 2;
    s = build(s, 'crusher', Infinity);
    expect(s.stock.stone).toBe(979);
    expect(canBuild(s, 'iron_drill')).toBe(false);
    s = pause(s, 'crusher', 1);
    expect(usedGrid(s)).toBe(2);
    expect(tick(s, 60).stock.stone).toBe(1039);
    s = demolish(s, 'crusher');
    expect(usedGrid(s)).toBe(1);
    expect(s.stock.stone).toBe(984.5);
  });
  it('按步初库存配额，缺一种原料时其余配额留仓', () => {
    const s = newGame();
    install(s, 'furnace_iron', {});
    install(s, 'furnace_copper', {});
    install(s, 'coal_drill', {});
    s.stock.coal = 10;
    s.stock.iron_ore = 30;
    s.stock.copper_ore = 3;
    const n = tick(s, 60);
    expect(n.stock.iron_ingot).toBe(15);
    expect(n.stock.copper_ingot).toBe(3);
    expect(n.stock.coal).toBe(34);
    expect(n.powerFactor).toBe(1);
  });
  it('默认、手动再分配、优先队列遵守库存和需求', () => {
    const req = { furnace_iron: 90, furnace_copper: 10 };
    expect(allocate(50, req)).toEqual({ furnace_iron: 45, furnace_copper: 5 });
    expect(
      allocate(50, req, { mode: 'manual', shares: { furnace_iron: 0.2, furnace_copper: 0.8 } }),
    ).toEqual({ furnace_iron: 40, furnace_copper: 10 });
    expect(allocate(50, req, { mode: 'priority', order: ['furnace_copper'] })).toEqual({
      furnace_copper: 10,
      furnace_iron: 40,
    });
  });
  it('速度、复制和精密合计封顶三倍；重型只影响新机器', () => {
    let s = newGame();
    install(s, 'assembler', {});
    s.cards = ['heavy'];
    install(s, 'assembler', {});
    expect(usedGrid(s)).toBe(3);
    s.cards.push('boost_assembly', 'precision', 'pioneer_horn', 'automation_core', 'quantum_copy');
    s.overtime = 60;
    const r = rates(s, 'assembler');
    expect(r.output.part! / (2 * 15) / 0.8).toBeCloseTo(b.maxMultiplier);
    expect(r.input.iron_ingot).toBeGreaterThan(0);
  });
  it('首台免费只生效一次，拆除后重新建造要付费', () => {
    const s = newGame();
    s.cards = ['first_free'];
    const first = build(s, 'crusher');
    expect(first.machines.crusher.count).toBe(1);
    expect(cost(demolish(first, 'crusher'), 'crusher')).toEqual({ stone: 10 });
  });
  it('灰砾黄金配比预热五分钟，再测五分钟，芯片每分钟五枚，中间库存稳定', () => {
    let s = newGame();
    for (const id of itemIds) s.stock[id] = 500;
    for (const [id, n] of Object.entries(goldenLine))
      for (let i = 0; i < n!; i++) install(s, id as MachineId, {});
    const fiveMinutes = 5 * b.minute;
    for (let i = 0; i < fiveMinutes / b.step; i++) s = tick(s);
    const snapshot = { ...s.stock };
    for (let i = 0; i < fiveMinutes / b.step; i++) s = tick(s);
    expect((s.stock.chip - snapshot.chip) / 5).toBeCloseTo(5, 7);
    for (const id of itemIds.filter((k) => k !== 'chip'))
      expect(s.stock[id]).toBeCloseTo(snapshot[id], 7);
  });
});
