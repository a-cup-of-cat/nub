export const shop = {
  grid_plus: { price: 80, growth: 1.3, amount: 4 },
  overtime: { price: 60, multiplier: 1.5, minutes: 10 },
  supply_crate: { price: 50, amount: 200 },
  buy_machine: { divisor: 5 },
  valve: { price: 40, growth: 1.2 },
  supply_pod: { price: 200, amount: 100 },
  archive: { price: 300 },
  bp_recorder: { price: 250, slots: 1 },
  bp_slot: { price: 150, increment: 50 },
} as const;
export type Product = keyof typeof shop;
