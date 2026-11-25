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
export const redsand = {
  id: 'redsand',
  grid: 80,
  goal: { lds: 50, rocket_fuel: 100, rcu: 30 },
  waterLimit: 6,
} as const;
export const frost = {
  id: 'frost',
  grid: 100,
  goal: { satellite: 6, probe: 2 },
  fuelPerLaunch: 20,
  loadFactor: 1.5,
} as const;
export const planets = { grit, dusk, redsand, frost };
export const rank = { grit: 1, dusk: 2, redsand: 3, frost: 4 } as const;
export const destination: Partial<Record<PlanetId, PlanetId>> = {
  grit: 'dusk',
  dusk: 'redsand',
  redsand: 'frost',
};
const quarterVisits = [0.25, 0.5, 0.75] as const;
export type PlanetId = keyof typeof planets;
export const visits = {
  grit: [grit.visitProgress],
  dusk: dusk.visits,
  redsand: quarterVisits,
  frost: quarterVisits,
};

export const marketFactor = (id: PlanetId) => dusk.priceFactor ** (rank[id] - 1);
export const machineLimit = (planet: PlanetId, id: string) =>
  planet === 'dusk' && id === 'coal_drill'
    ? dusk.coalLimit
    : planet === 'redsand' && id === 'water_pump'
      ? redsand.waterLimit
      : Infinity;
