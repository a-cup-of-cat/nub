import { writeFileSync } from 'node:fs';
export const writeTimeline = (text, file = 'simulation-timeline.csv') =>
  writeFileSync(new URL('../' + file, import.meta.url), text, 'utf8');
