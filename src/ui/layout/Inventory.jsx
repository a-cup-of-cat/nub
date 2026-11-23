import React, { useState, useEffect, memo } from 'react';
import { Boxes } from 'lucide-react';
import { zhCN as t } from '../../i18n/zh-CN';
import { balance } from '../../data/balance';
import { useGame } from '../../store/game';
import { fmt, Resource } from '../common/display';
import { rateText, readout, sampleInventory } from '../common/resourceReadout';
export const Inventory = memo(function Inventory() {
  const [open, setOpen] = useState(true);
  const [snapshot, setSnapshot] = useState(() => readout(useGame.getState().game));
  useEffect(() => {
    let sample = sampleInventory();
    return useGame.subscribe((curr, prev) => {
      if (curr.offline !== prev.offline && curr.game !== prev.game) {
        sample = sampleInventory();
        setSnapshot(readout(curr.game));
        return;
      }
      const v = sample(curr.game, curr.game.timeSec - prev.game.timeSec);
      if (v) setSnapshot(v);
    });
  }, []);
  return (
    <section className="inventory-panel panel">
      <header className="panel-heading">
        <Boxes size={18} />
        <h2>{t.ui.inventory}</h2>
        <button className="inventory-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? t.ui.collapse : t.ui.expand}
        </button>
      </header>
      {open && (
        <div className="stock-grid">
          {snapshot.seen.map((id) => (
            <div key={id} className="stock-card">
              <div>
                <Resource id={id} />
                <strong>{t.items[id]}</strong>
                <code>{fmt(Math.floor(snapshot.stock[id] + balance.epsilon))}</code>
              </div>
              <dl>
                <div>
                  <dt>{t.ui.production}</dt>
                  <dd>{rateText(snapshot.gross[id] ?? 0)}</dd>
                </div>
                <div>
                  <dt>{t.ui.net}</dt>
                  <dd className={(snapshot.net[id] ?? 0) < 0 ? 'low' : ''}>
                    {rateText(snapshot.net[id] ?? 0, true)}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}
    </section>
  );
});
