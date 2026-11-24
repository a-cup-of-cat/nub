import { balance as b } from '../data/balance';
import { cards, cardIds, powerCards, type CardId } from '../data/cards';
import { items, quantities, rawItems, type ItemId } from '../data/items';
import type { MachineId } from '../data/machines';
import { shop, type Product } from '../data/shop';
import { drawings, variants, type Drawing } from '../data/recipes';
import { planets, visits, dusk } from '../data/planets';
import { available, cost, fits, install } from './build';
import { message, random, type GameState } from './state';
function goalWeight(id: ItemId) {
  if (id !== 'machine_bed' && id !== 'servo' && id !== 'cnc') return 0;
  const recipe = variants[id];
  return (
    quantities(recipe.input).reduce((v, [k, n]) => v + n * (items[k].value ?? 0), 0) /
    quantities(recipe.output)[0][1]
  );
}
export function progress(s: GameState) {
  let value = 0,
    total = 0;
  for (const [id, goal] of quantities(planets[s.planetId].goal)) {
    const weight = items[id].value ?? goalWeight(id);
    value += (s.goalDelivered[id] ?? 0) * weight;
    total += goal * weight;
  }
  return value / total;
}
export function draw(s: GameState) {
  const pool = cardIds.filter(
      (id) => !s.cards.includes(id) && (s.planetId === 'dusk' || !powerCards.includes(id)),
    ),
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
  if (!farewell) s.visits++;
  m.stage = farewell ? 'farewell' : 'docked';
  m.picked = farewell;
  m.rerolls = 0;
  m.offers = farewell ? [] : draw(s);
  m.prices = {};
  m.sold = {};
  const pool = s.seen.filter((k) => items[k].value !== null),
    count = b.buyListMin + Math.floor(random(s) * (b.buyListMax - b.buyListMin + 1));
  for (let i = 0; i < count && pool.length; i++) {
    const item = pool.splice(Math.floor(random(s) * pool.length), 1)[0];
    m.prices[item] =
      ((items[item].value ?? 0) / b.priceDivisor) * (b.buyMin + random(s) * (b.buyMax - b.buyMin));
  }
  message(s, farewell ? 'repair' : 'arrival');
}
export function deliverGoal(s: GameState, item?: ItemId) {
  const n = structuredClone(s);
  let changed = false;
  for (const [id, target] of quantities(planets[s.planetId].goal)) {
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
  nextVisit(n);
  return n;
}
function nextVisit(s: GameState) {
  if (s.merchant.stage !== 'away' && s.merchant.stage !== 'departed') return;
  const threshold = visits[s.planetId][s.visits];
  if (threshold !== undefined && progress(s) >= threshold) arrive(s, false);
  else if (progress(s) >= 1) arrive(s, true);
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
  nextVisit(n);
  return n;
}
export const rerollCost = (s: GameState) =>
  (s.planetId === 'dusk' ? dusk.priceFactor : 1) *
  b.reroll *
  b.rerollGrowth ** (s.cards.includes('haggle') ? 0 : s.merchant.rerolls);
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
        quantities(cost(s, id)).reduce((sum, [k, n]) => sum + (items[k].value ?? 0) * n, 0) /
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
    (s.planetId === 'dusk' && !['bp_slot', 'bp_recorder', 'archive', 'supply_pod'].includes(p)
      ? dusk.priceFactor
      : 1) *
    (s.cards.includes('haggle') ? cards.haggle.effect : 1) *
    (s.merchant.stage === 'farewell' ? b.clearance : 1)
  );
}
export function purchasable(
  s: GameState,
  p: Product,
  id: MachineId = 'crusher',
  item: ItemId = 'stone',
  drawing: Drawing = drawings[0],
) {
  if (!trading(s) || s.credits + b.epsilon < price(s, p, id)) return false;
  switch (p) {
    case 'blueprint_card':
      return s.planetId === 'dusk' && drawings.includes(drawing) && !s.drawings.includes(drawing);
    case 'emergency_battery':
      return s.planetId === 'dusk' && !s.batterySeconds;
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
export function buy(
  s: GameState,
  p: Product,
  id: MachineId = 'crusher',
  item: ItemId = 'stone',
  drawing: Drawing = drawings[0],
) {
  if (!purchasable(s, p, id, item, drawing)) return s;
  const n = structuredClone(s);
  n.credits = Math.max(0, n.credits - price(s, p, id));
  switch (p) {
    case 'blueprint_card':
      n.drawings.push(drawing);
      break;
    case 'emergency_battery':
      n.batterySeconds = shop.emergency_battery.seconds;
      break;
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
      ? (items[item].value ?? 0) / b.priceDivisor
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
