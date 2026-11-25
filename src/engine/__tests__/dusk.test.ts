import { describe, it, expect } from 'vitest';
import { balance } from '../../data/balance';
import { dusk } from '../../data/planets';
import { cards } from '../../data/cards';
import { newGame, type GameState } from '../state';
import { available, build, cost, install, pause } from '../build';
import { landOnDusk } from '../travel';
import { tick } from '../tick';
import { connectAll } from './helpers';
import { buy, deliverGoal, leaveMerchant, progress, draw } from '../merchant';
import { rates } from '../rates';
import { prepareBlueprint } from '../blueprints';
import { ports } from '../belts';
import { operatingRecipe, setRecipe } from '../recipes';
import { recordBlueprint, applyBlueprint } from '../blueprints';
import { restore, serialize, migrate } from '../save';
import { machineIds, definition } from '../../data/machines';

function landing() {
  const s = newGame();
  s.merchant.stage = 'finished';
  return landOnDusk(s);
}
describe('晨昏', () => {
  it('旧版通关档登陆，按仓位携款，空投翻倍，保留档案馆与记录仪', () => {
    const old = JSON.parse(serialize(newGame(), 10));
    old.version = 4;
    old.credits = 777;
    old.merchant.stage = 'finished';
    old.meta = { pods: 2, archive: true, recorder: true, slots: 1 };
    old.cards = ['airdrop'];
    for (const id of machineIds) if ((definition(id).tier ?? 1) >= 2) delete old.machines[id];
    delete old.stock.steel;
    const arrived = landOnDusk(migrate(old));
    expect(arrived.credits).toBe(300);
    expect(arrived.machines.crusher.count).toBe(4);
    expect(arrived.stock.stone).toBe(400);
    expect(arrived.gridCapacity).toBe(60);
    expect(arrived.cards).toEqual([]);
    expect(arrived.drawings).toHaveLength(1);
    expect(landOnDusk(arrived)).toBe(arrived);
    expect(restore(serialize(arrived, 100), 100).state).toEqual({ ...arrived, lastSavedAt: 100 });
  });
  it('星球解锁、基础设备折扣和煤矿上限同时约束建造与直购', () => {
    expect(available(newGame(), 'coal_plant')).toBe(false);
    let s = landing();
    s.stock.stone = 5000;
    s.credits = 5000;
    s.merchant.stage = 'docked';
    expect(cost(s, 'coal_drill').stone).toBe(30);
    s = build(s, 'coal_drill', Infinity);
    expect(s.machines.coal_drill.count).toBe(dusk.coalLimit);
    expect(buy(s, 'buy_machine', 'coal_drill')).toBe(s);
  });
  it('太阳日落断电，日出后下一步恢复，离线同样经历昼夜', () => {
    let s = landing();
    install(s, 'solar_station', {});
    install(s, 'iron_drill', {});
    s.timeSec = 119;
    s = tick(s, 1);
    expect(s.supply).toBe(6);
    s = tick(s, 1);
    expect(s.supply).toBe(0);
    expect(s.powerFactor).toBe(0);
    const night = s.stock.iron_ore;
    let online = s;
    for (let i = 0; i < 62; i++) online = tick(online, 1);
    expect(online.stock.iron_ore).toBeGreaterThan(night);
    expect(restore(serialize(s, 1000), 63000).state.stock).toEqual(online.stock);
  });
  it('蓝图队列等待材料，建成扣款，可跨保存恢复，取消后不再建', () => {
    let s = landing();
    s.meta.recorder = true;
    s.meta.slots = 1;
    s = recordBlueprint(s, '碎石组');
    s.stock.stone = 0;
    s = applyBlueprint(s, 0);
    const waiting = tick(s);
    expect(waiting.queue[0].count).toBe(2);
    const saved = restore(serialize(waiting, 100), 100).state;
    s = { ...saved, stock: { ...saved.stock, stone: 100 } };
    const paid = cost(s, 'crusher').stone!;
    s = tick(s);
    expect(s.machines.crusher.count).toBe(3);
    expect(s.queue[0].count).toBe(1);
    expect(s.stock.stone).toBeCloseTo(100 - paid + 2 * balance.step);
    expect(tick({ ...s, queue: [] }).machines.crusher.count).toBe(3);
  });
  it('黄金产线预热五分钟，再量五分钟，外部补 4 电后铝锭净产出 40/分', () => {
    let s = landing();
    for (const [id, count] of [
      ['coal_drill', 1],
      ['coal_plant', 3],
      ['electrolyzer', 4],
      ['bauxite_drill', 4],
    ] as const)
      for (let i = 0; i < count; i++) install(s, id, {});
    s.stock.coal = s.stock.bauxite = 500;
    s = connectAll(s);
    function minute(state: GameState) {
      for (let i = 0; i < 60; i++) {
        state = tick(state, 1);
        state = { ...state, powerFactor: Math.min(1, (state.supply + 4) / state.demand) };
      }
      return state;
    }
    for (let i = 0; i < 5; i++) s = minute(s);
    const before = { ...s.stock };
    for (let i = 0; i < 5; i++) s = minute(s);
    expect(s.supply).toBe(60);
    expect(s.demand).toBe(64);
    expect((s.stock.aluminum - before.aluminum) / 5).toBeCloseTo(40);
    expect(s.stock.coal).toBeCloseTo(before.coal);
    expect(s.stock.bauxite).toBeCloseTo(before.bauxite);
  });
  it('图纸切换不收费重建，精密车间保留机组，电弧卡改变实际耗煤耗电', () => {
    let s = landing();
    install(s, 'precision_shop', {});
    install(s, 'steel_furnace', {});
    expect(setRecipe(s, 'steel_furnace', 'arc_steel')).toBe(s);
    s.merchant.stage = 'docked';
    s.credits = 500;
    s = buy(s, 'blueprint_card', 'crusher', 'stone', 'arc_steel');
    expect(s.credits).toBe(275);
    s = setRecipe(s, 'steel_furnace', 'arc_steel');
    expect(operatingRecipe(s, 'steel_furnace')).toMatchObject({
      input: { iron_ingot: 30 },
      power: 12,
    });
    s = setRecipe(s, 'precision_shop', 'cnc');
    expect(s.machines.precision_shop.count).toBe(1);
    expect(
      ports('precision_shop', operatingRecipe(s, 'precision_shop')).filter((p) => !p.output),
    ).toHaveLength(3);
    s.cards = ['arc_furnace'];
    expect(operatingRecipe(s, 'furnace_iron').input.coal).toBeUndefined();
    expect(operatingRecipe(s, 'steel_furnace').power).toBe(8);
  });
  it('储能充放电、增发和余热，停机后去掉额定需求', () => {
    let s = landing();
    install(s, 'solar_station', {});
    install(s, 'iron_drill', {});
    s.cards = ['battery_bank', 'boost_power', 'heat_recovery'];
    s = tick(s, 60);
    expect(s.supply).toBeCloseTo(7.2);
    expect(s.storedPower).toBeCloseTo(6.2);
    s.timeSec = 120;
    s = tick(s, 60);
    expect(s.storedPower).toBeCloseTo(5.2);
    expect(s.powerFactor).toBe(1);
    s = pause(s, 'iron_drill', 1);
    expect(tick(s, 1).demand).toBe(0);
    expect(cards.battery_bank.capacity).toBe(200);
  });
  it('晨昏两次来访与临别特卖按序触发，目标件不进入收购清单', () => {
    let s = landing();
    Object.assign(s.stock, dusk.goal);
    s.seen.push('cnc', 'servo', 'machine_bed');
    s = deliverGoal(s);
    expect(progress(s)).toBe(1);
    expect(s.visits).toBe(1);
    s = leaveMerchant(s);
    expect(s.visits).toBe(2);
    expect(s.merchant.stage).toBe('docked');
    s = leaveMerchant(s);
    expect(s.merchant.stage).toBe('farewell');
    expect(Object.keys(s.merchant.prices)).toEqual(['stone']);
    expect(leaveMerchant(s).merchant.stage).toBe('finished');
    for (let i = 0; i < 20; i++) expect(draw(newGame(i))).not.toContain('superconductor');
  });
});

it('应急电池供电一分钟，超导检测过剩，余热按开工率返电', () => {
  let s = landing();
  s.merchant.stage = 'docked';
  s.credits = 100;
  s = buy(s, 'emergency_battery');
  expect(s.credits).toBe(40);
  install(s, 'iron_drill', {});
  install(s, 'furnace_iron', {});
  install(s, 'coal_drill', {});
  s.stock.iron_ore = s.stock.coal = 100;
  s = connectAll(s);
  s.cards = ['heat_recovery', 'superconductor'];
  s = tick(s, 1);
  expect(s.supply).toBeCloseTo(52);
  expect(rates(s, 'iron_drill').output.iron_ore).toBeCloseTo(30 * cards.superconductor.effect);
  s = tick(s, 59);
  expect(s.batterySeconds).toBe(0);
  s = tick(s, 1);
  expect(s.supply).toBeCloseTo(2);
  expect(s.powerFactor).toBeLessThan(1);
});
it('应用蓝图列出不适用的机组和图纸，未安装阀门时保持默认分配', () => {
  const s = landing();
  s.meta.recorder = true;
  s.meta.slots = 1;
  const bp = {
    name: '钢铁',
    machines: {
      steel_furnace: { count: 1, recipe: 'arc_steel' },
      coal_drill: { count: 8, recipe: 'coal_drill' },
    },
    splits: { coal: { mode: 'priority', order: ['steel_furnace'] } },
  } as const;
  s.meta.blueprints = [{ ...bp, splits: { coal: { mode: 'priority', order: ['steel_furnace'] } } }];
  const plan = prepareBlueprint(s, s.meta.blueprints[0]);
  expect(plan.skipped).toEqual(expect.arrayContaining(['coal_drill', 'steel_furnace']));
  const next = applyBlueprint(s, 0);
  expect(next.queue[0].count).toBe(6);
  expect(next.splits.coal).toBeUndefined();
});
