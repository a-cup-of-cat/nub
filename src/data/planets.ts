export const grit = {
  id: 'grit',
  grid: 40,
  goal: { chip: 50, circuit: 100, part: 200 },
  visitProgress: 0.5,
} as const;

export const dusk = {
  id: 'dusk',
  grid: 60,
  goal: { machine_bed: 10, servo: 20, cnc: 10 },
  visits: [0.33, 0.66],
  day: 120,
  night: 60,
  coalLimit: 6,
  landingCrushers: 2,
  landingStone: 200,
  carryBase: 100,
  priceFactor: 1.5,
  targetMinutes: [40, 70],
} as const;
export const planets = { grit, dusk };
export type PlanetId = keyof typeof planets;
export const visits = { grit: [grit.visitProgress], dusk: dusk.visits };
