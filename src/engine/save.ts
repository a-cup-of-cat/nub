import { balance as b } from '../data/balance';
import { cardIds } from '../data/cards';
import { itemIds } from '../data/items';
import { machineIds } from '../data/machines';
import { grit } from '../data/planets';
import { newGame, message, type GameState } from './state';
import { tick } from './tick';
export const saveKey = 'crashstar.grit';
type Obj = Record<string, unknown>;
const record = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const nonneg = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const integer = (v: unknown) => nonneg(v) && Number.isSafeInteger(v);
const member = (ids: readonly string[], v: unknown) => typeof v === 'string' && ids.includes(v);
const list = (v: unknown, ids: readonly string[]) =>
  Array.isArray(v) && new Set(v).size === v.length && v.every((k) => member(ids, k));
const amounts = (v: unknown, negative = false) =>
  record(v) &&
  Object.entries(v).every(
    ([k, n]) =>
      member(itemIds, k) && typeof n === 'number' && Number.isFinite(n) && (negative || n >= 0),
  );
function valid(s: Obj): boolean {
  if (
    s.planetId !== 'grit' ||
    s.version !== b.version ||
    s.powerFactor !== 1 ||
    !record(s.stock) ||
    !amounts(s.stock) ||
    !itemIds.every((id) => nonneg((s.stock as Obj)[id]))
  )
    return false;
  if (
    !['timeSec', 'credits', 'lastSavedAt', 'overtime'].every((k) => nonneg(s[k])) ||
    !['gridCapacity', 'mined', 'gridUpgrades', 'rngSeed', 'streak'].every((k) => integer(s[k]))
  )
    return false;
  if (
    !list(s.seen, itemIds) ||
    !list(s.valves, itemIds) ||
    !list(s.cards, cardIds) ||
    !amounts(s.net, true) ||
    !amounts(s.gross) ||
    !amounts(s.goalDelivered)
  )
    return false;
  if (
    !Object.entries(s.goalDelivered as Obj).every(
      ([k, v]) =>
        Object.hasOwn(grit.goal, k) &&
        integer(v) &&
        (v as number) <= grit.goal[k as keyof typeof grit.goal],
    )
  )
    return false;
  if (
    !record(s.machines) ||
    !machineIds.every((id) => {
      const g = (s.machines as Obj)[id];
      return (
        record(g) &&
        g.recipe === id &&
        integer(g.built) &&
        (g.built as number) >= (g.count as number) &&
        integer(g.count) &&
        integer(g.paused) &&
        (g.paused as number) <= (g.count as number) &&
        nonneg(g.utilization) &&
        g.utilization <= 1 &&
        (g.shortage === null || member(itemIds, g.shortage)) &&
        Array.isArray(g.units) &&
        g.units.length === g.count &&
        g.units.every((u) => record(u) && typeof u.heavy === 'boolean' && amounts(u.cost))
      );
    })
  )
    return false;
  const m = s.merchant,
    meta = s.meta,
    ui = s.ui;
  if (
    !record(m) ||
    !member(['away', 'docked', 'departed', 'farewell', 'finished'], m.stage) ||
    !list(m.offers, cardIds) ||
    typeof m.picked !== 'boolean' ||
    !integer(m.rerolls) ||
    ![m.sold, m.prices, m.blackSold].every((v) => amounts(v))
  )
    return false;
  if (
    !record(meta) ||
    !integer(meta.pods) ||
    !integer(meta.slots) ||
    typeof meta.recorder !== 'boolean' ||
    typeof meta.archive !== 'boolean'
  )
    return false;
  if (
    !record(ui) ||
    !record(ui.nodePositions) ||
    !Object.entries(ui.nodePositions).every(
      ([k, p]) =>
        member(machineIds, k) && record(p) && Number.isFinite(p.x) && Number.isFinite(p.y),
    )
  )
    return false;
  if (
    !record(s.splits) ||
    !Object.entries(s.splits).every(
      ([k, v]) =>
        member(itemIds, k) &&
        record(v) &&
        (v.mode === 'default' ||
          (v.mode === 'priority' && list(v.order, machineIds)) ||
          (v.mode === 'manual' &&
            record(v.shares) &&
            Object.entries(v.shares).every(
              ([id, n]) => member(machineIds, id) && nonneg(n) && n <= 1,
            ))),
    )
  )
    return false;
  return (
    Array.isArray(s.orders) &&
    s.orders.length === b.orderSlots &&
    s.orders.every(
      (slot) =>
        record(slot) &&
        nonneg(slot.cooldown) &&
        (slot.order === null ||
          (record(slot.order) &&
            member(itemIds, slot.order.item) &&
            integer(slot.order.quantity) &&
            nonneg(slot.order.reward) &&
            nonneg(slot.order.remaining))),
    ) &&
    Array.isArray(s.messages) &&
    s.messages.every(
      (msg) =>
        record(msg) &&
        member(['order', 'offline', 'arrival', 'repair'], msg.key) &&
        nonneg(msg.time) &&
        (msg.amount === undefined || nonneg(msg.amount)),
    )
  );
}
export function serialize(s: GameState, now: number) {
  return JSON.stringify({ ...s, lastSavedAt: now });
}
export function migrate(raw: unknown): GameState {
  if (!record(raw)) throw Error('save');
  let s = raw;
  // SPEC-GAP: v0 为未版本化的内部原型；保留已有字段，补入首版新增字段。
  if (s.version === 0 || s.version === undefined) {
    if (!record(s.stock) || s.planetId !== 'grit') throw Error('legacy');
    s = { ...newGame(), ...s, version: b.version };
  }
  if (!valid(s)) throw Error('save');
  return s as unknown as GameState;
}
export function restore(text: string, now: number) {
  let state = migrate(JSON.parse(text));
  const seconds = Math.min(b.offlineMax, Math.max(0, Math.floor((now - state.lastSavedAt) / b.ms)));
  const before = { ...state.stock };
  for (let i = 0; i < seconds; i += b.offlineStep)
    state = tick(state, Math.min(b.offlineStep, seconds - i), true);
  const gains = Object.fromEntries(itemIds.map((k) => [k, state.stock[k] - before[k]]));
  if (seconds > 0) message(state, 'offline', seconds);
  return { state: { ...state, lastSavedAt: now }, seconds, gains };
}
