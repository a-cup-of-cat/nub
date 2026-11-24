import { definition, type MachineId } from './machines';
import type { Amounts } from './items';
export const variants = {
  machine_bed: {
    machine: 'precision_shop',
    input: { steel: 20, aluminum: 10 },
    output: { machine_bed: 1 },
    power: 4,
  },
  servo: {
    machine: 'precision_shop',
    input: { motor: 4, chip: 4 },
    output: { servo: 2 },
    power: 4,
  },
  cnc: {
    machine: 'precision_shop',
    input: { chip: 4, circuit: 6, copper_wire: 10 },
    output: { cnc: 1 },
    power: 4,
  },
  arc_steel: {
    machine: 'steel_furnace',
    input: { iron_ingot: 30 },
    output: { steel: 15 },
    power: 12,
  },
  plastic_circuit: {
    machine: 'circuit_fab',
    input: { copper_wire: 15, plastic: 5 },
    output: { circuit: 5 },
    power: 2,
  },
} as const satisfies Record<
  string,
  { machine: MachineId; input: Amounts; output: Amounts; power: number }
>;
export type Variant = keyof typeof variants;
export type RecipeId = MachineId | Variant;
export const drawings = ['arc_steel', 'plastic_circuit'] as const;
export type Drawing = (typeof drawings)[number];
export const isDrawing = (r: string): r is Drawing => drawings.some((v) => v === r);
export const choices = (id: MachineId) =>
  (Object.keys(variants) as Variant[]).filter((k) => variants[k].machine === id);
export const recipeFits = (id: MachineId, r: unknown) =>
  r === id || choices(id).some((k) => k === r);
export function baseRecipe(
  id: MachineId,
  r: RecipeId,
): { input: Amounts; output: Amounts; power: number } {
  return r in variants && recipeFits(id, r) ? variants[r as Variant] : definition(id);
}
