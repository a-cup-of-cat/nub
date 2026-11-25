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
  belt: { value: 0.05, shape: 'component' },
  bauxite: { value: 1, shape: 'ore' },
  glass: { value: 2.5, shape: 'ingot' },
  aluminum: { value: 4, shape: 'ingot' },
  steel: { value: 6, shape: 'ingot' },
  motor: { value: 22, shape: 'component' },
  solar_panel: { value: 25, shape: 'component' },
  machine_bed: { value: null, shape: 'component' },
  servo: { value: null, shape: 'component' },
  cnc: { value: null, shape: 'electronic' },
  plastic: { value: 3, shape: 'ingot' },
  water: { value: 0.5, shape: 'fluid' },
  oil: { value: 1, shape: 'fluid' },
  rocket_fuel: { value: 2.5, shape: 'fluid' },
  lds: { value: 80, shape: 'component' },
  rcu: { value: 460, shape: 'electronic' },
  titanium_ore: { value: 2, shape: 'ore' },
  rare_earth: { value: 4, shape: 'ore' },
  titanium_alloy: { value: 10, shape: 'ingot' },
  sensor: { value: 135, shape: 'electronic' },
  satellite: { value: null, shape: 'component' },
  probe: { value: null, shape: 'component' },
} as const;
export type ItemId = keyof typeof items;
export type Amounts = Partial<Record<ItemId, number>>;
export const itemIds = Object.keys(items) as ItemId[];
export const rawItems = itemIds.filter(
  (id) => items[id].shape === 'ore' || id === 'water' || id === 'oil',
);
export function quantities(amounts: Amounts) {
  return Object.entries(amounts) as [ItemId, number][];
}
export function inventory(): Record<ItemId, number> {
  return Object.fromEntries(itemIds.map((id) => [id, 0])) as Record<ItemId, number>;
}
