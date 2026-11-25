import { expect, it } from 'vitest';
import { frost, redsand, type PlanetId } from '../../data/planets';
import { definition, machineIds, type MachineId } from '../../data/machines';
import { itemIds } from '../../data/items';
import { newGame, type GameState } from '../state';
import { available, build, cost, demolish, install } from '../build';
import { landNext } from '../travel';
import { deliverGoal, launch, leaveMerchant, progress, buy } from '../merchant';
import { operatingRecipe, setRecipe } from '../recipes';
import { pairs, ports, setBelts } from '../belts';
import { tick } from '../tick';
import { migrate, restore, serialize } from '../save';
import { connectAll } from './helpers';

function landing(planet: PlanetId) {
  let s = newGame();
  while (s.planetId !== planet) {
    s.merchant.stage = 'finished';
    s = landNext(s);
  }
  return s;
}
function installGroup(s: GameState, id: MachineId, n: number) {
  for (let i = 0; i < n; i++) install(s, id, {});
}
it('晨昏旧通关档迁移，按顺序登陆赤沙与霜原，本地生产状态重置', () => {
  const s = landing('dusk');
  s.merchant.stage = 'finished';
  s.credits = 550;
  s.meta.pods = 2;
  s.meta.archive = true;
  s.stock.plastic = 4;
  s.goalDelivered = { machine_bed: 10, servo: 20, cnc: 10 };
  const old = JSON.parse(serialize(s, 0));
  old.version = 5;
  for (const id of machineIds) if ((definition(id).tier ?? 1) >= 3) delete old.machines[id];
  for (const id of [
    'water',
    'oil',
    'rocket_fuel',
    'lds',
    'rcu',
    'titanium_ore',
    'rare_earth',
    'titanium_alloy',
    'sensor',
    'satellite',
    'probe',
  ])
    delete old.stock[id];
  const upgraded = migrate(old);
  expect(upgraded.stock.plastic).toBe(4);
  expect(upgraded.goalDelivered).toEqual(s.goalDelivered);
  const red = landNext(upgraded);
  expect(red.planetId).toBe('redsand');
  expect(red.gridCapacity).toBe(80);
  expect(red.credits).toBe(300);
  expect(red.meta).toEqual(s.meta);
  expect(red.drawings).toHaveLength(1);
  expect(red.stock.stone).toBe(200);
  expect(red.stock.plastic).toBe(0);
  expect(landNext(red)).toBe(red);
  red.merchant.stage = 'finished';
  const ice = landNext(red);
  expect(ice.planetId).toBe('frost');
  expect(ice.gridCapacity).toBe(100);
  ice.merchant.stage = 'finished';
  expect(landNext(ice)).toBe(ice);
  expect(() => migrate({ ...old, version: 6 })).toThrow();
});
it('水源六处限制普通建造和商人直购，拆除释放水源，霜原解除上限', () => {
  const s = landing('redsand');
  s.seen.push('steel');
  s.stock.steel = 10000;
  s.credits = 10000;
  s.merchant.stage = 'docked';
  expect(cost(s, 'iron_drill').stone).toBe(23);
  const full = build(s, 'water_pump', 10);
  expect(full.machines.water_pump.count).toBe(6);
  expect(buy(full, 'buy_machine', 'water_pump')).toBe(full);
  expect(build(demolish(full, 'water_pump'), 'water_pump').machines.water_pump.count).toBe(6);
  expect(available({ ...s, planetId: 'dusk' }, 'water_pump')).toBe(false);
  expect(build({ ...full, planetId: 'frost' }, 'water_pump').machines.water_pump.count).toBe(7);
});
it.each(['redsand', 'frost'] as const)('%s 黄金配比，预热五分钟再测五分钟', (planet) => {
  let s = landing(planet);
  const goal = planet === 'redsand' ? 'plastic' : 'titanium_alloy';
  if (planet === 'redsand') {
    installGroup(s, 'oil_pump', 2);
    installGroup(s, 'water_pump', 2);
    installGroup(s, 'refinery', 2);
    installGroup(s, 'fuel_plant', 1);
    installGroup(s, 'solar_station', 3);
    s.stock.water = s.stock.oil = 500;
  } else {
    installGroup(s, 'titanium_drill', 2);
    installGroup(s, 'bauxite_drill', 1);
    installGroup(s, 'electrolyzer', 1);
    installGroup(s, 'ti_furnace', 1);
    s.stock.aluminum = s.stock.titanium_ore = s.stock.bauxite = 500;
  }
  s = connectAll(s);
  const advance = () => {
    for (let i = 0; i < 300; i++) {
      s = tick(s, 1);
      if (planet === 'frost') {
        expect(s.demand).toBe(45);
        s = { ...s, powerFactor: Math.min(1, 45 / s.demand) };
      }
    }
  };
  advance();
  const before = { ...s.stock };
  advance();
  expect((s.stock[goal] - before[goal]) / 5).toBeCloseTo(planet === 'redsand' ? 20 : 10, 5);
  if (planet === 'redsand')
    expect((s.stock.rocket_fuel - before.rocket_fuel) / 5).toBeCloseTo(10, 5);
  for (const item of planet === 'redsand'
    ? (['oil', 'water'] as const)
    : (['titanium_ore', 'bauxite', 'aluminum'] as const))
    expect(s.stock[item]).toBeCloseTo(before[item], 6);
});
it('塑料电路必须接通炼油厂，拔掉塑料带停止生产，原有端口保留', () => {
  let s = landing('redsand');
  for (const id of ['refinery', 'wire_drawer', 'circuit_fab'] as const) install(s, id, {});
  s.drawings = ['plastic_circuit'];
  s = setRecipe(s, 'circuit_fab', 'plastic_circuit');
  s.stock.plastic = 50;
  s.stock.copper_wire = 150;
  s = connectAll(s);
  const pair = pairs.find((p) => p.target === 'circuit_fab' && p.item === 'plastic')!;
  expect(tick(s, 60).stock.circuit).toBeCloseTo(5);
  expect(tick(setBelts(s, pair, []), 60).stock.circuit).toBe(0);
  expect(
    ports('circuit_fab', operatingRecipe(s, 'circuit_fab'))
      .filter((p) => !p.output)
      .map((p) => p.item),
  ).toContain('plastic');
});
it('霜原切换总装配方与离线生产，切换后保留已铺带', () => {
  let s = landing('frost');
  for (const id of [
    'space_assembly',
    'solar_panel_fab',
    'sensor_fab',
    'ti_furnace',
    'rcu_fab',
    'fuel_plant',
  ] as const)
    install(s, id, {});
  for (const id of machineIds)
    if (id !== 'space_assembly') s.machines[id].paused = s.machines[id].count;
  installGroup(s, 'solar_station', 2);
  for (const id of itemIds) s.stock[id] = 100;
  s = connectAll(s);
  const before = serialize(s, 1000);
  const online = tick(s, 120);
  expect(online.stock.satellite).toBe(101);
  expect(online.demand).toBe(9);
  const probe = setRecipe(s, 'space_assembly', 'probe');
  expect(probe.belts).toEqual(s.belts);
  expect(
    ports('space_assembly', operatingRecipe(probe, 'space_assembly')).filter((p) => !p.output),
  ).toHaveLength(3);
  expect(restore(serialize(probe, 1000), 121000).gains.probe).toBeCloseTo(1);
  expect(restore(before, 121000).gains.satellite).toBeCloseTo(1);
});
it('每次发射恰好扣一架与 20 燃料；缺料、重复和离线不会推进星图', () => {
  let s = landing('frost');
  s.stock.satellite = 9;
  s.stock.probe = 1.5;
  s.stock.rocket_fuel = 19.5;
  expect(launch(s, 'probe')).toBe(s);
  expect(deliverGoal(s)).toBe(s);
  expect(launch(s, 'chip')).toBe(s);
  s.stock.rocket_fuel = 200;
  s.stock.probe = 2;
  const before = structuredClone(s.stock);
  s = launch(s, 'probe');
  expect(s.stock.probe).toBe(1);
  expect(s.stock.rocket_fuel).toBe(before.rocket_fuel - 20);
  expect(progress(s)).toBeGreaterThan(0);
  s = restore(serialize(s, 1000), 11000).state;
  expect(s.goalDelivered).toEqual({ probe: 1 });
  for (let i = 0; i < 6; i++) s = launch(s, 'satellite');
  expect(launch(s, 'satellite')).toBe(s);
  s = launch(s, 'probe');
  expect(progress(s)).toBe(1);
  expect(s.stock.rocket_fuel).toBe(40);
  expect(s.goalDelivered).toEqual(frost.goal);
  while (s.merchant.stage === 'docked') s = leaveMerchant(s);
  expect(s.visits).toBe(3);
  expect(s.merchant.stage).toBe('farewell');
  expect(leaveMerchant(s).merchant.stage).toBe('finished');
  const red = landing('redsand');
  Object.assign(red.stock, redsand.goal);
  expect(launch(red, 'satellite')).toBe(red);
  expect(progress(deliverGoal(red))).toBe(1);
});
