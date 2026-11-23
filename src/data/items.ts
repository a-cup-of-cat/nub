export const items = {
  stone: { value: 0.2, shape: 'ore' },
  iron_ore: { value: 1, shape: 'ore' },
  copper_ore: { value: 1, shape: 'ore' },
  coal: { value: 1, shape: 'ore' },
  quartz: { value: 1, shape: 'ore' },
  iron_ingot: { value: 2, shape: 'ingot' },
  copper_ingot: { value: 2, shape: 'ingot' },
  part: { value: 4, shape: 'part' },
  copper_wire: { value: 1.5, shape: 'part' },
  wafer: { value: 4, shape: 'electronic' },
  circuit: { value: 12, shape: 'electronic' },
  chip: { value: 50, shape: 'electronic' },
} as const;
export type ItemId = keyof typeof items;
export type Amounts = Partial<Record<ItemId, number>>;
export const itemIds = Object.keys(items) as ItemId[];
export const rawItems = itemIds.filter((id) => items[id].shape === 'ore');
export function quantities(amounts: Amounts) {
  return Object.entries(amounts) as [ItemId, number][];
}
export function inventory(): Record<ItemId, number> {
  return Object.fromEntries(itemIds.map((id) => [id, 0])) as Record<ItemId, number>;
}
