import React from 'react';
import { Crosshair, ScrollText, Ship, ArrowUpRight } from 'lucide-react';
import { zhCN as t } from '../../i18n/zh-CN';
import { balance as b } from '../../data/balance';
import { grit } from '../../data/planets';
import { quantities } from '../../data/items';
import { deliverGoal, progress, trading } from '../../engine/merchant';
import { resolveOrder } from '../../engine/orders';
import { Resource, fmt, time, percent } from '../common/display';
export function Objectives({ s, act, onTrade }) {
  const targets = quantities(grit.goal),
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
        <h3>{t.ui.goal}</h3>
        <div className="progress-line">
          <span className="meter">
            <i style={{ width: percent(p) }} />
          </span>
          <code>{percent(p)}</code>
        </div>
        {targets.map(([id, n]) => (
          <div className="goal-row" key={id}>
            <Resource id={id} />
            <span>{t.items[id]}</span>
            <code>
              {fmt(s.goalDelivered[id] ?? 0)} <i>/ {n}</i>
            </code>
            <button
              disabled={s.stock[id] < 1 || (s.goalDelivered[id] ?? 0) >= n}
              aria-label={t.ui.submit + t.items[id]}
              onClick={() => act((v) => deliverGoal(v, id))}
            >
              {t.ui.submit}
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
