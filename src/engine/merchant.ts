import { balance as b } from '../data/balance';
import { cards, cardIds, type CardId } from '../data/cards';
import { items, quantities, rawItems, type ItemId } from '../data/items';
import type { MachineId } from '../data/machines';
import { shop, type Product } from '../data/shop';
import { grit } from '../data/planets';
import { available, cost, fits, install } from './build';
import { message, random, type GameState } from './state';
export function progress(s: GameState) {
  let value = 0,
    total = 0;
  for (const [id, goal] of quantities(grit.goal)) {
    value += (s.goalDelivered[id] ?? 0) * items[id].value;
    total += goal * items[id].value;
  }
  return value / total;
}
export function draw(s: GameState) {
  const pool = cardIds.filter((id) => !s.cards.includes(id)),
    offers: CardId[] = [];
  const count = s.cards.includes('merchant_friend') ? b.extraCardCount : b.cardCount;
  while (pool.length && offers.length < count) {
    const weights = pool.map((id) => {
      const card = cards[id];
      return (
        b.rareWeights[card.tier] *
        (card.family && s.cards.some((c) => cards[c].family === card.family) ? b.affinity : 1)
      );
    });
    let pick = random(s) * weights.reduce((a, v) => a + v, 0);
    let i = 0;
    while (i < weights.length - 1 && pick >= weights[i]) pick -= weights[i++];
    offers.push(pool.splice(i, 1)[0]);
  }
  return offers;
}
function arrive(s: GameState, farewell: boolean) {
  const m = s.merchant;
  m.stage = farewell ? 'farewell' : 'docked';
  m.picked = farewell;
  m.rerolls = 0;
  m.offers = farewell ? [] : draw(s);
  m.prices = {};
  m.sold = {};
  const pool = [...s.seen],
    count = b.buyListMin + Math.floor(random(s) * (b.buyListMax - b.buyListMin + 1));
  for (let i = 0; i < count && pool.length; i++) {
    const item = pool.splice(Math.floor(random(s) * pool.length), 1)[0];
    m.prices[item] =
      (items[item].value / b.priceDivisor) * (b.buyMin + random(s) * (b.buyMax - b.buyMin));
  }
  message(s, farewell ? 'repair' : 'arrival');
}
export function deliverGoal(s: GameState, item?: ItemId) {
  const n = structuredClone(s);
  let changed = false;
  for (const [id, target] of quantities(grit.goal)) {
    if (item && id !== item) continue;
    const paid = n.goalDelivered[id] ?? 0,
      amount = Math.min(Math.floor(n.stock[id] + b.epsilon), target - paid);
    if (amount > 0) {
      n.stock[id] = Math.max(0, n.stock[id] - amount);
      n.goalDelivered[id] = paid + amount;
      changed = true;
    }
  }
  if (!changed) return s;
  // SPEC-GAP: 若一次交付跨过两个门槛，先保留普通来访，关闭后立即进入临别特卖。
  if (n.merchant.stage === 'away' && progress(n) >= grit.visitProgress) arrive(n, false);
  else if (n.merchant.stage === 'departed' && progress(n) >= 1) arrive(n, true);
  return n;
}
export const trading = (s: GameState) =>
  s.merchant.stage === 'docked' || s.merchant.stage === 'farewell';
export function leaveMerchant(s: GameState) {
  if (!trading(s)) return s;
  const n = structuredClone(s);
  if (n.merchant.stage === 'farewell') {
    n.merchant.stage = 'finished';
    return n;
  }
  n.merchant.stage = 'departed';
  if (progress(n) >= 1) arrive(n, true);
  return n;
}
export const rerollCost = (s: GameState) =>
  b.reroll * b.rerollGrowth ** (s.cards.includes('haggle') ? 0 : s.merchant.rerolls);
export function reroll(s: GameState) {
  const price = rerollCost(s);
  if (s.merchant.stage !== 'docked' || s.merchant.picked || s.credits < price) return s;
  const n = structuredClone(s);
  n.credits -= price;
  n.merchant.rerolls++;
  n.merchant.offers = draw(n);
  return n;
}
export function choose(s: GameState, id: CardId) {
  if (s.merchant.stage !== 'docked' || s.merchant.picked || !s.merchant.offers.includes(id))
    return s;
  const n = structuredClone(s);
  n.cards.push(id);
  n.merchant.picked = true;
  return n;
}
export function price(s: GameState, p: Product, id: MachineId = 'crusher') {
  let v: number;
  switch (p) {
    case 'grid_plus':
      v =
        shop[p].price *
        shop[p].growth ** s.gridUpgrades *
        (s.cards.includes('cheap_grid') ? cards.cheap_grid.effect : 1);
      break;
    case 'buy_machine':
      v =
        quantities(cost(s, id)).reduce((sum, [k, n]) => sum + items[k].value * n, 0) /
        shop[p].divisor;
      break;
    case 'valve':
      v = shop[p].price * shop[p].growth ** s.valves.length;
      break;
    case 'bp_slot':
      v = shop[p].price + Math.max(0, s.meta.slots - shop.bp_recorder.slots) * shop[p].increment;
      break;
    default:
      v = shop[p].price;
  }
  return (
    v *
    (s.cards.includes('haggle') ? cards.haggle.effect : 1) *
    (s.merchant.stage === 'farewell' ? b.clearance : 1)
  );
}
export function purchasable(
  s: GameState,
  p: Product,
  id: MachineId = 'crusher',
  item: ItemId = 'stone',
) {
  if (!trading(s) || s.credits + b.epsilon < price(s, p, id)) return false;
  switch (p) {
    case 'buy_machine':
      return available(s, id) && fits(s, id);
    case 'valve':
      return s.seen.includes(item) && !s.valves.includes(item);
    case 'archive':
      return !s.meta.archive;
    case 'bp_recorder':
      return !s.meta.recorder;
    case 'bp_slot':
      return s.meta.recorder;
    case 'overtime':
      return s.overtime <= 0;
    default:
      return true;
  }
}
export function buy(s: GameState, p: Product, id: MachineId = 'crusher', item: ItemId = 'stone') {
  if (!purchasable(s, p, id, item)) return s;
  const n = structuredClone(s);
  n.credits = Math.max(0, n.credits - price(s, p, id));
  switch (p) {
    case 'grid_plus':
      n.gridCapacity += shop[p].amount;
      n.gridUpgrades++;
      break;
    case 'buy_machine':
      install(n, id, cost(s, id));
      break;
    case 'overtime':
      n.overtime = shop[p].minutes * b.minute;
      break;
    case 'supply_crate':
      for (const k of rawItems) if (s.seen.includes(k)) n.stock[k] += shop[p].amount;
      break;
    case 'valve':
      n.valves.push(item);
      n.splits[item] = { mode: 'priority', order: [] };
      break;
    case 'supply_pod':
      n.meta.pods++;
      break;
    case 'archive':
      n.meta.archive = true;
      break;
    case 'bp_recorder':
      n.meta.recorder = true;
      n.meta.slots = shop[p].slots;
      break;
    case 'bp_slot':
      n.meta.slots++;
      break;
  }
  return n;
}
export function salePrice(
  s: GameState,
  item: ItemId,
  black = false,
  sold = (black ? s.merchant.blackSold : s.merchant.sold)[item] ?? 0,
) {
  const base = black
    ? s.cards.includes('black_market')
      ? items[item].value / b.priceDivisor
      : 0
    : trading(s)
      ? (s.merchant.prices[item] ?? 0)
      : 0;
  return base * Math.max(b.priceFloor, 1 - b.priceDrop * Math.floor(sold / b.priceStep));
}
export function sell(s: GameState, item: ItemId, amount: number, black = false) {
  if (
    !Number.isFinite(amount) ||
    amount < 1 ||
    Math.floor(s.stock[item] + b.epsilon) < Math.floor(amount) ||
    !salePrice(s, item, black)
  )
    return s;
  const n = structuredClone(s),
    ledger = black ? n.merchant.blackSold : n.merchant.sold;
  let left = Math.floor(amount),
    sold = ledger[item] ?? 0;
  n.stock[item] = Math.max(0, n.stock[item] - left);
  while (left) {
    const atFloor = Math.floor(sold / b.priceStep) * b.priceDrop >= 1 - b.priceFloor;
    const batch = atFloor ? left : Math.min(left, b.priceStep - (sold % b.priceStep));
    n.credits += batch * salePrice(n, item, black, sold);
    sold += batch;
    left -= batch;
  }
  ledger[item] = sold;
  return n;
}
