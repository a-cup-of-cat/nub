import { writeFileSync } from 'node:fs';
export const writeTimeline = (text) =>
  writeFileSync(new URL('../simulation-timeline.csv', import.meta.url), text, 'utf8');
