import type { Amounts } from './items';
import { transport } from './transport';

// Integer batches match the basic factory recipes. Belts keep their existing crafting ratio.
export const recipes = {
  belt: { input: { stone: transport.craftStone }, yield: transport.craftYield },
  part: { input: { iron_ingot: 2 }, yield: 1 },
  copper_wire: { input: { copper_ingot: 1 }, yield: 2 },
} as const satisfies Record<string, { input: Amounts; yield: number }>;
export type CraftId = keyof typeof recipes;
export const craftIds = Object.keys(recipes) as CraftId[];
// SPEC-GAP: The belt assembler uses a standard assembly chassis and runs 15 batches per minute.
export const beltBatchesPerMinute = 15;
