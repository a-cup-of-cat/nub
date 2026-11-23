import { expect, it } from 'vitest';
import {
  choose,
  draw,
  deliverGoal,
  leaveMerchant,
  progress,
  buy,
  price,
  sell,
  reroll,
  salePrice,
} from '../merchant';
import { generateOrder, resolveOrder, advanceOrders } from '../orders';
import { newGame } from '../state';
import { serialize, migrate, restore } from '../save';
import { build, install } from '../build';
import { tick } from '../tick';
import { balance as b } from '../../data/balance';
function visitor() {
  const s = newGame();
  s.stock.chip = 50;
  s.stock.circuit = 100;
  s.seen.push('chip', 'circuit');
  s.credits = 1000;
  return deliverGoal(s);
}
it('订单只取实际生产加工品，固定种子可重现，成功与放弃分别冷却', () => {
  const a = newGame(),
    c = newGame();
  a.gross = c.gross = { iron_ore: 30, part: 15, circuit: 5 };
  const o = generateOrder(a)!;
  expect(o).toEqual(generateOrder(c));
  expect(['part', 'circuit']).toContain(o.item);
  expect(o.quantity % 5).toBe(0);
  expect(o.remaining).toBe(360);
  a.orders[0].order = o;
  a.stock[o.item] = o.quantity;
  const n = resolveOrder(a, 0, true);
  expect(n.stock[o.item]).toBe(0);
  expect(n.credits).toBe(o.reward);
  expect(n.orders[0].cooldown).toBe(30);
  expect(resolveOrder(a, 0, false).orders[0].cooldown).toBe(120);
  advanceOrders(a, 361);
  expect(a.orders[0]).toEqual({ order: null, cooldown: 120 });
});
it('交付按价值计进度，普通来访只有一次，免费卡互斥，临别打折后结局', () => {
  let s = visitor();
  expect(progress(s)).toBeCloseTo(3700 / 4500);
  expect(s.merchant.stage).toBe('docked');
  expect(new Set(s.merchant.offers).size).toBe(3);
  s = reroll(s);
  expect(s.credits).toBe(990);
  s = choose(s, s.merchant.offers[0]);
  expect(s.cards).toHaveLength(1);
  expect(choose(s, s.merchant.offers[1])).toBe(s);
  s = leaveMerchant(s);
  s.stock.part = 200;
  s = deliverGoal(s);
  expect(s.merchant.stage).toBe('farewell');
  expect(progress(s)).toBe(1);
  expect(s.merchant.offers).toEqual([]);
  expect(price(s, 'grid_plus')).toBeCloseTo(
    80 * 0.7 * (s.cards.includes('cheap_grid') ? 0.7 : 1) * (s.cards.includes('haggle') ? 0.75 : 1),
  );
  expect(leaveMerchant(s).merchant.stage).toBe('finished');
});
it('一次交付跨过两个门槛仍保留两次不同的停靠', () => {
  const s = newGame();
  s.stock.part = 200;
  s.stock.circuit = 100;
  s.stock.chip = 50;
  const n = deliverGoal(s);
  expect(n.merchant.stage).toBe('docked');
  expect(leaveMerchant(n).merchant.stage).toBe('farewell');
});
it('每五十件降价，批售等价于分批交易，黑市单独计数', () => {
  let s = visitor();
  s.merchant.prices.stone = 1;
  s.stock.stone = 500;
  const sold = sell(s, 'stone', 500);
  expect(sold.credits - s.credits).toBeCloseTo(325);
  expect(salePrice(sold, 'stone')).toBe(0.5);
  let split = s;
  for (let i = 0; i < 10; i++) split = sell(split, 'stone', 50);
  expect(split.credits).toBeCloseTo(sold.credits);
  s = leaveMerchant(s);
  s.cards = ['black_market'];
  expect(sell(s, 'stone', 50, true).merchant.blackSold.stone).toBe(50);
  expect(sell(s, 'stone', 1)).toBe(s);
});
it('货架购买生效，永久商品、重复购买与资金不足受限', () => {
  let s = visitor();
  s = buy(s, 'grid_plus');
  expect(s.gridCapacity).toBe(44);
  s = buy(s, 'buy_machine', 'crusher');
  expect(s.machines.crusher.count).toBe(1);
  s = buy(s, 'supply_crate');
  expect(s.stock.stone).toBe(200);
  s = buy(s, 'overtime');
  expect(s.overtime).toBe(600);
  expect(buy(s, 'overtime')).toBe(s);
  s = buy(s, 'archive');
  expect(buy(s, 'archive')).toBe(s);
  s = buy(s, 'bp_recorder');
  expect(s.meta.slots).toBe(1);
  s.credits = 0;
  expect(buy(s, 'bp_slot')).toBe(s);
});
it('亲和抽卡不重复且排除已拥有卡', () => {
  const s = newGame();
  s.cards = ['lean', 'merchant_friend'];
  const offers = draw(s);
  expect(offers).toHaveLength(4);
  expect(offers).not.toContain('lean');
});
it('存档往返、版本迁移及损坏拒绝', () => {
  const s = newGame();
  s.ui.nodePositions.crusher = { x: 12, y: -4 };
  const raw = JSON.parse(serialize(s, 100));
  expect(restore(JSON.stringify(raw), 100).state).toEqual(raw);
  delete raw.version;
  delete raw.ui;
  expect(migrate(raw).ui.nodePositions).toEqual({});
  expect(() => migrate({ ...raw, version: 99 })).toThrow();
  expect(() => migrate({ ...raw, stock: { stone: 'x' } })).toThrow();
});
it('离线封顶两小时，只补生产；订单、来访和随机种子冻结', () => {
  let s = visitor();
  s = build({ ...s, stock: { ...s.stock, stone: 10 } }, 'crusher');
  s.orders[0].order = { item: 'part', quantity: 5, reward: 5, remaining: 30 };
  s.orders[1].cooldown = 40;
  const r = restore(serialize(s, 1000), 1000 + b.ms * (b.offlineMax + 600));
  expect(r.seconds).toBe(b.offlineMax);
  expect(r.gains.stone).toBeCloseTo(b.offlineMax);
  expect(r.state.orders).toEqual(s.orders);
  expect(r.state.merchant).toEqual(s.merchant);
  expect(r.state.rngSeed).toBe(s.rngSeed);
  expect(restore(serialize(s, 2000), 1000).seconds).toBe(0);
});
it('相同输入产生相同模拟，输入状态未被修改', () => {
  const s = newGame();
  install(s, 'crusher', {});
  const original = structuredClone(s);
  expect(tick(s)).toEqual(tick(s));
  expect(s).toEqual(original);
});
