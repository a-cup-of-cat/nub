import type { BeltOverrides } from './belts';
import { balance } from '../data/balance';
import { inventory, type Amounts, type ItemId } from '../data/items';
import { machineIds, type MachineId } from '../data/machines';
import type { CardId } from '../data/cards';
import type { RecipeId, Drawing } from '../data/recipes';
import { grit, type PlanetId } from '../data/planets';
export type SplitSetting =
  | { mode: 'default' }
  | { mode: 'manual'; shares: Partial<Record<MachineId, number>> }
  | { mode: 'priority'; order: MachineId[] };
export interface Unit {
  cost: Amounts;
  heavy: boolean;
}
export interface Group {
  built: number;
  count: number;
  paused: number;
  recipe: RecipeId;
  units: Unit[];
  utilization: number;
  shortage: ItemId | null;
  beltLimited?: boolean;
}
export interface Order {
  item: ItemId;
  quantity: number;
  reward: number;
  remaining: number;
}
export interface Slot {
  order: Order | null;
  cooldown: number;
}
export interface Merchant {
  stage: 'away' | 'docked' | 'departed' | 'farewell' | 'finished';
  offers: CardId[];
  picked: boolean;
  rerolls: number;
  prices: Amounts;
  sold: Amounts;
  blackSold: Amounts;
}
export type QueueEntry = { id: MachineId; count: number; recipe: RecipeId };
export interface Blueprint {
  name: string;
  machines: Partial<Record<MachineId, { count: number; recipe: RecipeId }>>;
  splits: Partial<Record<ItemId, SplitSetting>>;
}
export interface GameState {
  version: number;
  planetId: PlanetId;
  supply: number;
  demand: number;
  storedPower: number;
  batterySeconds: number;
  visits: number;
  drawings: Drawing[];
  queue: QueueEntry[];
  timeSec: number;
  rngSeed: number;
  stock: Record<ItemId, number>;
  seen: ItemId[];
  machines: Record<MachineId, Group>;
  belts: BeltOverrides;
  beltFlow: Record<string, number>;
  splits: Partial<Record<ItemId, SplitSetting>>;
  gridCapacity: number;
  powerFactor: number;
  credits: number;
  cards: CardId[];
  orders: Slot[];
  streak: number;
  merchant: Merchant;
  goalDelivered: Amounts;
  meta: {
    pods: number;
    archive: boolean;
    recorder: boolean;
    slots: number;
    blueprints: Blueprint[];
  };
  gridUpgrades: number;
  valves: ItemId[];
  overtime: number;
  lastSavedAt: number;
  ui: { nodePositions: Partial<Record<MachineId, { x: number; y: number }>> };
  mined: number;
  gross: Amounts;
  net: Amounts;
  messages: { key: 'order' | 'arrival' | 'repair' | 'offline'; time: number; amount?: number }[];
}
export function newGame(seed: number = balance.seed): GameState {
  const machines = Object.fromEntries(
    machineIds.map((recipe) => [
      recipe,
      {
        recipe,
        built: 0,
        count: 0,
        paused: 0,
        units: [] as Unit[],
        utilization: 0,
        shortage: null,
      },
    ]),
  ) as GameState['machines'];
  return {
    version: balance.version,
    planetId: 'grit',
    supply: 0,
    demand: 0,
    storedPower: 0,
    batterySeconds: 0,
    visits: 0,
    drawings: [],
    queue: [],
    timeSec: 0,
    rngSeed: seed,
    stock: inventory(),
    seen: ['stone'],
    machines,
    belts: {},
    beltFlow: {},
    splits: {},
    gridCapacity: grit.grid,
    powerFactor: 1,
    credits: 0,
    cards: [],
    orders: Array.from({ length: balance.orderSlots }, () => ({ order: null, cooldown: 0 })),
    streak: 0,
    merchant: {
      stage: 'away',
      offers: [],
      picked: false,
      rerolls: 0,
      prices: {},
      sold: {},
      blackSold: {},
    },
    goalDelivered: {},
    meta: { pods: 0, archive: false, recorder: false, slots: 0, blueprints: [] },
    gridUpgrades: 0,
    valves: [],
    overtime: 0,
    lastSavedAt: 0,
    ui: { nodePositions: {} },
    mined: 0,
    gross: {},
    net: {},
    messages: [],
  };
}
export function message(s: GameState, key: GameState['messages'][number]['key'], amount?: number) {
  s.messages = [...s.messages, { key, time: s.timeSec, amount }].slice(-balance.messageLimit);
}
export function random(s: GameState) {
  s.rngSeed = (s.rngSeed + 0x6d2b79f5) >>> 0;
  let n = s.rngSeed;
  n = Math.imul(n ^ (n >>> 15), n | 1);
  n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
  return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
}
