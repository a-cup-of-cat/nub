import React from 'react';
import { Crosshair, ScrollText, Ship, ArrowUpRight } from 'lucide-react';
import { zhCN as t } from '../../i18n/zh-CN';
import { balance as b } from '../../data/balance';
import { planets, frost } from '../../data/planets';
import { quantities } from '../../data/items';
import { canLaunch, launch, deliverGoal, progress, trading } from '../../engine/merchant';
import { resolveOrder } from '../../engine/orders';
import { Resource, fmt, time, percent } from '../common/display';
const stars = [
  { item: 'satellite', x: 16, y: 48 },
  { item: 'satellite', x: 38, y: 24 },
  { item: 'satellite', x: 69, y: 33 },
  { item: 'satellite', x: 89, y: 14 },
  { item: 'satellite', x: 125, y: 30 },
  { item: 'satellite', x: 147, y: 51 },
  { item: 'probe', x: 179, y: 32 },
  { item: 'probe', x: 209, y: 12 },
];
function StarChart({ delivered }) {
  const counts = { satellite: 0, probe: 0 };
  const nodes = stars.map((p) => ({ ...p, lit: ++counts[p.item] <= (delivered[p.item] ?? 0) }));
  return (
    <svg className="star-map" viewBox="0 0 225 65" aria-hidden="true">
      {nodes.slice(1).map((p, i) => (
        <line
          key={p.x}
          x1={nodes[i].x}
          y1={nodes[i].y}
          x2={p.x}
          y2={p.y}
          className={p.lit && nodes[i].lit ? 'lit' : ''}
        />
      ))}
      {nodes.map((p) =>
        p.item === 'probe' ? (
          <path
            key={p.x}
            className={'point ' + (p.lit ? 'lit' : '')}
            d={'M' + p.x + ' ' + (p.y - 5) + 'l4 5-4 5-4-5z'}
          />
        ) : (
          <circle key={p.x} cx={p.x} cy={p.y} r="3.6" className={'point ' + (p.lit ? 'lit' : '')} />
        ),
      )}
    </svg>
  );
}
export function Objectives({ s, act, onTrade }) {
  const launching = s.planetId === 'frost';
  const targets = quantities(planets[s.planetId].goal),
    p = progress(s);
  return (
    <>
      {trading(s) && (
        <button className="arrival" onClick={onTrade}>
          <Ship />
          {s.merchant.stage === 'farewell' ? t.ui.farewell : t.rusty.arrive}
          <ArrowUpRight size={16} />
        </button>
      )}
      <section className="panel goals">
        <div className="panel-heading">
          <Crosshair size={17} />
          <h2>{t.ui.goalHead}</h2>
        </div>
        <h3>{s.planetId === 'dusk' ? t.dusk.goal : (t.planets[s.planetId].goal ?? t.ui.goal)}</h3>
        <div className="progress-line">
          <span className="meter">
            <i style={{ width: percent(p) }} />
          </span>
          <code>{percent(p)}</code>
        </div>
        {launching && <StarChart delivered={s.goalDelivered} />}
        {launching && (
          <p className="launch-cost">
            {t.fuelCost} {frost.fuelPerLaunch} {t.items.rocket_fuel} · {t.fuelStock}{' '}
            {fmt(Math.floor(s.stock.rocket_fuel + b.epsilon))}
          </p>
        )}
        {targets.map(([id, n]) => (
          <div className="goal-row" key={id}>
            <Resource id={id} />
            <span>
              {t.items[id]}
              {launching && (
                <small>
                  {t.ui.stock} {fmt(Math.floor(s.stock[id] + b.epsilon))}
                </small>
              )}
            </span>
            <code>
              {fmt(s.goalDelivered[id] ?? 0)} <i>/ {n}</i>
            </code>
            <button
              disabled={
                launching ? !canLaunch(s, id) : s.stock[id] < 1 || (s.goalDelivered[id] ?? 0) >= n
              }
              aria-label={(launching ? t.launch : t.ui.submit) + t.items[id]}
              onClick={() => act((v) => (launching ? launch(v, id) : deliverGoal(v, id)))}
            >
              {launching ? t.launch : t.ui.submit}
            </button>
          </div>
        ))}
      </section>
      <section className="panel orders">
        <div className="panel-heading">
          <ScrollText size={17} />
          <h2>{t.ui.orders}</h2>
          <code>
            {s.orders.filter((x) => x.order).length} / {b.orderSlots}
          </code>
        </div>
        {s.orders.every((o) => !o.order && !o.cooldown) ? (
          <div className="empty-order">
            <ScrollText size={28} />
            <p>{t.ui.noOrders}</p>
          </div>
        ) : (
          s.orders.map(({ order: o, cooldown }, i) =>
            o ? (
              <div className="order" key={i}>
                <div>
                  <b>
                    {t.items[o.item]} ×{o.quantity}
                  </b>
                  <code className={o.remaining <= b.orderUrgent ? 'low' : ''}>
                    {time(o.remaining)}
                  </code>
                </div>
                <p>
                  {t.ui.credits} +{fmt(o.reward)} · {t.ui.stock} {fmt(s.stock[o.item])}
                </p>
                <button
                  disabled={s.stock[o.item] + b.epsilon < o.quantity}
                  onClick={() => act((v) => resolveOrder(v, i, true))}
                >
                  {t.ui.fulfill}
                </button>{' '}
                <button onClick={() => act((v) => resolveOrder(v, i, false))}>
                  {t.ui.abandon}
                </button>
              </div>
            ) : (
              <p key={i}>{cooldown ? t.ui.cooldown + ' ' + time(cooldown) : t.ui.await}</p>
            ),
          )
        )}
      </section>
    </>
  );
}
