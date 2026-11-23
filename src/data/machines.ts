import type { Amounts } from './items';
type Definition = {
  group: 'mining' | 'smelting' | 'assembly' | 'advanced';
  input: Amounts;
  output: Amounts;
  power: number;
  cost: Amounts;
  fp: number;
  costGroup?: string;
  base: boolean;
};
export const machines = {
  crusher: {
    group: 'mining',
    input: {},
    output: { stone: 60 },
    power: 0,
    cost: { stone: 10 },
    fp: 1,
    base: true,
  },
  iron_drill: {
    group: 'mining',
    input: {},
    output: { iron_ore: 30 },
    power: 1,
    cost: { stone: 40 },
    fp: 1,
    base: true,
  },
  copper_drill: {
    group: 'mining',
    input: {},
    output: { copper_ore: 30 },
    power: 1,
    cost: { stone: 40 },
    fp: 1,
    base: true,
  },
  coal_drill: {
    group: 'mining',
    input: {},
    output: { coal: 30 },
    power: 0,
    cost: { stone: 40 },
    fp: 1,
    base: true,
  },
  quartz_drill: {
    group: 'mining',
    input: {},
    output: { quartz: 20 },
    power: 1,
    cost: { stone: 60, iron_ingot: 10 },
    fp: 1,
    base: true,
  },
  furnace_iron: {
    group: 'smelting',
    costGroup: 'furnace',
    input: { iron_ore: 30, coal: 10 },
    output: { iron_ingot: 30 },
    power: 2,
    cost: { stone: 80 },
    fp: 2,
    base: true,
  },
  furnace_copper: {
    group: 'smelting',
    costGroup: 'furnace',
    input: { copper_ore: 30, coal: 10 },
    output: { copper_ingot: 30 },
    power: 2,
    cost: { stone: 80 },
    fp: 2,
    base: true,
  },
  assembler: {
    group: 'assembly',
    input: { iron_ingot: 30 },
    output: { part: 15 },
    power: 1,
    cost: { iron_ingot: 30 },
    fp: 1,
    base: true,
  },
  wire_drawer: {
    group: 'assembly',
    input: { copper_ingot: 15 },
    output: { copper_wire: 30 },
    power: 1,
    cost: { iron_ingot: 20, copper_ingot: 10 },
    fp: 1,
    base: true,
  },
  circuit_fab: {
    group: 'advanced',
    input: { part: 5, copper_wire: 20 },
    output: { circuit: 5 },
    power: 2,
    cost: { iron_ingot: 40, part: 20 },
    fp: 2,
    base: true,
  },
  wafer_fab: {
    group: 'advanced',
    input: { quartz: 20, coal: 10 },
    output: { wafer: 10 },
    power: 2,
    cost: { stone: 100, iron_ingot: 30 },
    fp: 2,
    base: true,
  },
  chip_fab: {
    group: 'advanced',
    input: { circuit: 15, wafer: 10 },
    output: { chip: 5 },
    power: 3,
    cost: { part: 60, circuit: 40 },
    fp: 4,
    base: true,
  },
} as const satisfies Record<string, Definition>;
export type MachineId = keyof typeof machines;
export const machineIds = Object.keys(machines) as MachineId[];
export function definition(id: MachineId): Definition {
  return machines[id];
}
export const goldenLine: Partial<Record<MachineId, number>> = {
  iron_drill: 1,
  copper_drill: 1,
  coal_drill: 1,
  quartz_drill: 1,
  furnace_iron: 1,
  furnace_copper: 1,
  assembler: 1,
  wire_drawer: 2,
  circuit_fab: 3,
  wafer_fab: 1,
  chip_fab: 1,
};
