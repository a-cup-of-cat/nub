import React, { useEffect, useRef, useState } from 'react';
import { Ship, ShoppingBag, Ticket, X } from 'lucide-react';
import { zhCN as t } from '../../i18n/zh-CN';
import { cards } from '../../data/cards';
import { carryLimit } from '../../engine/travel';
import { items } from '../../data/items';
import { drawings } from '../../data/recipes';
import { shop } from '../../data/shop';
import { machineIds } from '../../data/machines';
import { available } from '../../engine/build';
import {
  buy,
  choose,
  purchasable,
  price,
  reroll,
  rerollCost,
  salePrice,
  sell,
  leaveMerchant,
} from '../../engine/merchant';
import { fmt, fmtPrice } from '../common/display';
export function Sales({ s, act, black = false }) {
  const [amount, setAmount] = useState({});
  const pool = black
    ? s.seen.filter((id) => items[id].value !== null)
    : Object.keys(s.merchant.prices);
  return (
    <section>
      <h3>{black ? t.ui.black : t.ui.market}</h3>
      {pool.map((id) => {
        const qty = Number(amount[id] ?? 1),
          max = Math.floor(s.stock[id]);
        return (
          <div className="sale" key={id}>
            <div>
              <b>{t.items[id]}</b>
              <small>
                {t.ui.price} {fmtPrice(salePrice(s, id, black))} · {t.ui.stock} {fmt(s.stock[id])}
              </small>
            </div>
            <input
              aria-label={t.items[id] + t.ui.qty}
              type="number"
              min={1}
              max={max}
              value={amount[id] ?? 1}
              onChange={(e) => setAmount({ ...amount, [id]: e.target.value })}
            />
            <button
              disabled={!Number.isSafeInteger(qty) || qty < 1 || qty > max}
              onClick={() => act((v) => sell(v, id, qty, black))}
            >
              {t.ui.sell}
            </button>
            <button
              disabled={!max}
              onClick={() => act((v) => sell(v, id, Math.floor(v.stock[id]), black))}
            >
              {t.ui.sellAll}
            </button>
          </div>
        );
      })}
    </section>
  );
}
export function Trade({ s, act, onClose }) {
  const dialog = useRef(null),
    [machine, setMachine] = useState('crusher'),
    [drawing, setDrawing] = useState(drawings.find((d) => !s.drawings.includes(d)) ?? drawings[0]),
    [item, setItem] = useState(s.seen[0]),
    [confirm, setConfirm] = useState(false);
  const fare = s.merchant.stage === 'farewell';
  useEffect(() => {
    dialog.current.showModal();
    return () => dialog.current?.close();
  }, []);
  const close = () => {
    if (!fare && !s.merchant.picked && !confirm) {
      setConfirm(true);
      return;
    }
    act(leaveMerchant);
    onClose();
  };
  return (
    <dialog
      ref={dialog}
      className="merchant-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (fare) onClose();
        else close();
      }}
    >
      <header className="dialog-head">
        <Ship />
        <h2>{t.rusty.ship}</h2>
        <span className="tag">{fare ? t.ui.farewell : t.ui.aboard}</span>
        <button className="icon-only" aria-label={t.ui.close} onClick={fare ? onClose : close}>
          <X />
        </button>
      </header>
      <p className="merchant-quote">{fare ? t.rusty.farewellSale : t.rusty.firstMeet}</p>
      <div className="credit">
        <Ticket size={16} />
        {t.ui.credits} <b>{fmt(s.credits)}</b>
      </div>
      {fare && s.planetId !== 'frost' && (
        <p>
          {t.dusk.carry} {fmt(Math.min(carryLimit(s), s.credits))} / {fmt(carryLimit(s))} ·{' '}
          {t.dusk.carryHint}
        </p>
      )}
      {!fare && (
        <section>
          <div className="section-heading">
            <h3>{t.ui.cards}</h3>
            <button
              disabled={s.merchant.picked || s.credits < rerollCost(s)}
              onClick={() => act(reroll)}
            >
              {t.ui.reroll} · {fmt(rerollCost(s))}
            </button>
          </div>
          <div className="card-offers">
            {s.merchant.offers.map((id) => {
              const d = cards[id],
                txt = t.cards[id];
              return (
                <button
                  className={'offer ' + d.tier}
                  key={id}
                  onClick={() => act((v) => choose(v, id))}
                  disabled={s.merchant.picked}
                >
                  <small>
                    {t.tiers[d.tier]} {d.family && t.families[d.family]}
                  </small>
                  <b>{txt[0]}</b>
                  <span>{txt[1]}</span>
                  {txt[2] && <i>{txt[2]}</i>}
                  <strong>{s.cards.includes(id) ? t.ui.picked : t.ui.choose}</strong>
                </button>
              );
            })}
          </div>
        </section>
      )}
      <section>
        <h3>
          <ShoppingBag size={16} /> {t.ui.shop}
        </h3>
        {Object.keys(shop)
          .filter(
            (p) => s.planetId !== 'grit' || !['blueprint_card', 'emergency_battery'].includes(p),
          )
          .map((p) => (
            <div className="product" key={p}>
              <label>
                {t.shop[p]}
                {p === 'blueprint_card' && (
                  <select
                    aria-label={t.shop.blueprint_card}
                    value={drawing}
                    onChange={(e) => setDrawing(e.target.value)}
                  >
                    {drawings.map((d) => (
                      <option key={d} value={d} disabled={s.drawings.includes(d)}>
                        {t.dusk[d]}
                      </option>
                    ))}
                  </select>
                )}
                {p === 'buy_machine' && (
                  <select
                    aria-label={t.ui.selectMachine}
                    value={machine}
                    onChange={(e) => setMachine(e.target.value)}
                  >
                    {machineIds
                      .filter((id) => available(s, id))
                      .map((id) => (
                        <option key={id} value={id}>
                          {t.machines[id]}
                        </option>
                      ))}
                  </select>
                )}
                {p === 'valve' && (
                  <select
                    aria-label={t.ui.selectItem}
                    value={item}
                    onChange={(e) => setItem(e.target.value)}
                  >
                    {s.seen.map((id) => (
                      <option key={id} value={id}>
                        {t.items[id]}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              <button
                disabled={!purchasable(s, p, machine, item, drawing)}
                onClick={() => act((v) => buy(v, p, machine, item, drawing))}
              >
                {t.ui.buy} · {fmt(price(s, p, machine))}
              </button>
            </div>
          ))}
      </section>
      <Sales {...{ s, act }} />
      <footer>
        {confirm && !s.merchant.picked && <span>{t.ui.chooseBefore}</span>}
        <button className="primary" onClick={close}>
          {fare
            ? s.planetId === 'grit'
              ? t.ui.finish
              : (t.planets[s.planetId].fare ?? t.dusk.fare)
            : confirm && !s.merchant.picked
              ? t.ui.skip
              : t.ui.depart}
        </button>
      </footer>
    </dialog>
  );
}
