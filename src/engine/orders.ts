import { balance as b } from '../data/balance';
import { cards } from '../data/cards';
import { items, itemIds } from '../data/items';
import { message, random, type GameState, type Order } from './state';
const roundOrder = (n: number) => Math.round(n / b.orderRound) * b.orderRound;
export function generateOrder(s: GameState): Order | null {
  const pool = itemIds.filter((id) => items[id].shape !== 'ore' && (s.gross[id] ?? 0) > b.epsilon);
  if (!pool.length) return null;
  const item = pool[Math.floor(random(s) * pool.length)],
    rate = s.gross[item]!;
  const base = Math.max(b.orderMin, roundOrder(rate * b.orderMinutes));
  const bulk = s.cards.includes('bulk_contract'),
    quantity = base * (bulk ? cards.bulk_contract.quantity : 1);
  let reward = (base * items[item].value) / b.orderDivisor;
  if (bulk) reward *= cards.bulk_contract.reward;
  if (s.cards.includes('order_bonus')) reward *= cards.order_bonus.effect;
  if (s.cards.includes('regular'))
    reward *= 1 + Math.min(cards.regular.max, s.streak * cards.regular.step);
  return {
    item,
    quantity,
    reward: roundOrder(reward),
    remaining: Math.max(b.orderMinTime, (quantity / rate) * b.minute * b.orderTimeFactor),
  };
}
export function advanceOrders(s: GameState, dt: number) {
  for (const slot of s.orders) {
    if (slot.order) {
      slot.order.remaining -= dt;
      if (slot.order.remaining <= b.epsilon) {
        slot.cooldown = b.orderPenalty;
        slot.order = null;
        s.streak = 0;
      }
      continue;
    }
    slot.cooldown = Math.max(0, slot.cooldown - dt);
    if (slot.cooldown <= b.epsilon) slot.order = generateOrder(s);
  }
}
export function resolveOrder(s: GameState, index: number, deliver: boolean) {
  const order = s.orders[index]?.order;
  if (!order || (deliver && s.stock[order.item] + b.epsilon < order.quantity)) return s;
  const n = structuredClone(s);
  n.orders[index] = { order: null, cooldown: deliver ? b.orderRefill : b.orderPenalty };
  if (deliver) {
    n.stock[order.item] = Math.max(0, n.stock[order.item] - order.quantity);
    n.credits += order.reward;
    n.streak++;
    message(n, 'order', order.reward);
  } else n.streak = 0;
  return n;
}
