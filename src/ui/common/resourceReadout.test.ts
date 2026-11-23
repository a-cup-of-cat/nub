import { it, expect } from 'vitest';
import { rateText, sampleInventory } from './resourceReadout';
import { newGame } from '../../engine/state';
it('快产按秒，慢产按分，净消耗保留负号', () => {
  expect([120, 60, 30, -50, -90, 0].map((n) => rateText(n))).toEqual([
    '2/秒',
    '1/秒',
    '30/分',
    '-50/分',
    '-1.5/秒',
    '0/秒',
  ]);
});
it('一秒只出一组读数，毛产量与净变化分别按经过时间取平均', () => {
  const read = sampleInventory(),
    s = newGame();
  s.gross.stone = 120;
  s.net.stone = 0;
  expect(read(s, 0.25)).toBeUndefined();
  s.gross.stone = 0;
  s.net.stone = -60;
  s.stock.stone = 17;
  const snapshot = read(s, 0.75)!;
  expect(snapshot.gross.stone).toBe(30);
  expect(snapshot.net.stone).toBe(-45);
  expect(snapshot.stock.stone).toBe(17);
  s.stock.stone = 20;
  expect(snapshot.stock.stone).toBe(17);
});
