import { expect, it } from 'vitest';
import { craft, craftableBatches } from '../crafting';
import { recipes, type CraftId } from '../../data/crafting';
import { quantities } from '../../data/items';
import { install } from '../build';
import { connectAll } from './helpers';
import { network, setBelts } from '../belts';
import { newGame } from '../state';
import { tick } from '../tick';
import { migrate, restore, serialize } from '../save';

it.each(Object.keys(recipes) as CraftId[])('手作 %s 按整批扣料，失败时保留原库存', (id) => {
  const s = newGame(),
    recipe = recipes[id];
  for (const [item, count] of quantities(recipe.input)) s.stock[item] = 2 * count + 0.25;
  expect(craftableBatches(s, id)).toBe(2);
  for (const invalid of [0, 0.5, 3, Infinity]) expect(craft(s, id, invalid)).toBe(s);
  const made = craft(s, id, 2);
  expect(made.stock[id]).toBe(2 * recipe.yield);
  expect(s.stock[id]).toBe(0);
  expect(made.seen).toContain(id);
  for (const [item] of quantities(recipe.input)) expect(made.stock[item]).toBe(0.25);
});

it('组装机由石头供料，在线和离线按同一配方生产传送带，断带即停', () => {
  const s = newGame();
  install(s, 'crusher', {});
  install(s, 'belt_assembler', {});
  s.machines.crusher.paused = 1;
  s.stock.stone = 15;
  const connected = connectAll(s);
  const online = tick(connected, 60);
  expect(online.stock.belt - connected.stock.belt).toBe(60);
  expect(online.stock.stone).toBe(0);
  expect(online.seen).toContain('belt');
  expect(restore(serialize(connected, 1000), 61000).state.stock).toEqual(online.stock);
  const pair = network(connected).active.find((p) => p.target === 'belt_assembler')!;
  const cut = setBelts(connected, pair, []);
  expect(tick(cut, 60).stock).toEqual(cut.stock);
});

it('v3 迁移保留手铺路线，只迁入一次已有的散装带', () => {
  const s = newGame();
  install(s, 'iron_drill', {});
  install(s, 'furnace_iron', {});
  const old = JSON.parse(serialize(connectAll(s), 1000));
  old.version = 3;
  old.beltStock = 23;
  delete old.stock.belt;
  delete old.machines.belt_assembler;
  const migrated = migrate(old);
  expect(migrated.belts).toEqual(old.belts);
  expect(migrated.stock.belt).toBe(23);
  expect(migrated.machines.belt_assembler.count).toBe(0);
  expect(migrated.seen).toContain('belt');
  expect(migrated).not.toHaveProperty('beltStock');
  expect(restore(serialize(migrated, 1000), 1000).state).toEqual(migrated);
});
