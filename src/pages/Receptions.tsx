// Réceptions : arrivée de la marchandise commandée, entrée en stock au coût d'achat.
import { useMemo, useState } from 'react';
import { curSym, currency, moneyInputMode } from '../lib/currency';
import { useCan, currentUser } from '../lib/auth';
import { get, useTable } from '../lib/db';
import { fmtAr, fmtNum, nextNumber, parseNum, PURCHASE_STATUS, stockOf, todayYmd, useCatalog, variantLabel, type Product, type Purchase, type Variant } from '../lib/catalog';
import { computeReception, lastRate, MODE_LABEL, purchaseQty, purchaseReceivedQty, transitTotalAr, UNIT_LABEL, validateReception, type Allocation, type Reception, type Supplier, type TransitInvoice } from '../lib/purchases';
import { PurchasingTabs } from './ImportExport';
import { Badge, Button, Confirm, Empty, IconButton, PageHead, SelectField, TextField, fmtDate, fmtDateTime, navigate, toast, useRoute, useKeep } from '../ui/kit';
import { ListDates, applyDates, defaultPeriod, type ListOrder, type Period } from '../ui/period';
import { cancelReception } from '../lib/corrections';
import { Icon } from '../ui/icons';
import { Thumb } from './Products';

export function ReceptionsPage() {
  const route = useRoute();
  const seg = route.split('/')[2]?.split('?')[0];
  if (seg === 'nouvelle') {
    const m = /commande=([^&]+)/.exec(route);
    return <NewReception preselect={m?.[1]} />;
  }
  if (seg) return <ReceptionDetail id={seg} />;
  return <ReceptionList />;
}

function ReceptionList() {
  const can = useCan();
  const recs = useTable<Reception>('receptions');
  const [order, setOrder] = useKeep<ListOrder>('recs.order', 'new');
  const [period, setPeriod] = useKeep<Period>('recs.period', defaultPeriod('all'));
  const sorted = applyDates([...recs].sort((a, b) => b.number.localeCompare(a.number)), (r) => r.date || r.createdAt, period, order);
  return (
    <>
      <PageHead title="Achats et réceptions" subtitle="Arrivées de marchandise"
        actions={can('purchases.receive') && <Button icon="plus" onClick={() => navigate('/receptions/nouvelle')}>Nouvelle réception</Button>} />
      <PurchasingTabs current="receptions" />
      <div className="card"><ListDates period={period} onPeriod={setPeriod} order={order} onOrder={setOrder} what="Date de réception" /></div>
      <div className="card card-flush">
        {sorted.length === 0 ? <Empty icon="download" title={recs.length ? 'Aucune réception sur cette période' : 'Aucune réception pour l’instant'}><p className="small">Quand une commande arrive, enregistrez-la ici : les pièces entrent en stock.</p></Empty> : (
          <ul className="list">
            {sorted.map((r) => (
              <li key={r.id}>
                <a className="list-item list-link" href={`#/receptions/${r.id}`}>
                  <span className="avatar"><Icon name="download" size={18} /></span>
                  <div className="list-item-main">
                    <span className="list-item-title">{r.number} · {fmtDate(r.date)}</span>
                    <p className="small muted">{r.purchaseIds.map((id) => get<Purchase>('purchases', id)?.number).filter(Boolean).join(', ')}</p>
                  </div>
                  <div className="list-item-side">
                    <strong className="num">{fmtNum(r.items.reduce((s, i) => s + i.qty, 0))} pcs</strong>
                    {can('costs.view') && r.transitTotalAr > 0 && <span className="small muted">Frais {fmtAr(r.transitTotalAr)}</span>}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

// Pas de facture de transport : le coût de revient = prix d'achat (+ frais et remise saisis dans l'achat).
const NO_INVOICE: TransitInvoice = { mode: 'sea', billedQty: 0, tariff: 0, tariffCurrency: 'MGA', fx: 1, otherFees: [] };

function NewReception({ preselect }: { preselect?: string }) {
  const can = useCan();
  const showCost = can('costs.view');
  const { purchases } = useCatalog();
  useTable('suppliers');
  const open = purchases.filter((p) => !['received', 'cancelled'].includes(p.status)).sort((a, b) => a.date.localeCompare(b.date));
  const [selected, setSelected] = useState<string[]>(preselect ? [preselect] : []);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [date, setDate] = useState(todayYmd());
  const allocation: Allocation = 'quantity';
  const [notes, setNotes] = useState('');
  const [confirm, setConfirm] = useState(false);

  const chosen = open.filter((p) => selected.includes(p.id));
  const key = (p: Purchase, lineId: string) => `${p.id}:${lineId}`;
  const entries = chosen.flatMap((p) => p.lines.map((l) => {
    const rest = Math.max(0, l.qtyOrdered - (l.qtyReceived || 0));
    const raw = qty[key(p, l.id)];
    return { purchase: p, line: l, rest, qty: raw == null ? rest : parseNum(raw) ?? 0 };
  }));
  const invoice = NO_INVOICE;
  const { items, total } = useMemo(() => computeReception(entries, invoice, allocation), [JSON.stringify(entries.map((e) => [e.line.id, e.qty])), JSON.stringify(invoice), allocation, selected.join()]);
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const missingFx = false;

  return (
    <>
      <div className="row"><Button variant="quiet" icon="chevronRight" className="back-btn" onClick={() => navigate('/receptions')}>Réceptions</Button></div>
      <PageHead title="Nouvelle réception" subtitle="Choisissez les achats arrivés et vérifiez les quantités reçues." />

      <div className="card stack">
        <h2>1. Achats arrivés</h2>
        {open.length === 0 ? <Empty icon="list" title="Aucun achat en attente"><Button variant="ghost" onClick={() => navigate('/achats')}>Voir les achats</Button></Empty> : (
          <ul className="list">
            {open.map((p) => {
              const on = selected.includes(p.id);
              return (
                <li key={p.id} className="list-item" style={{ padding: '10px 0' }}>
                  <input type="checkbox" className="perm-check" checked={on} aria-label={`Choisir ${p.number}`} onChange={() => setSelected(on ? selected.filter((x) => x !== p.id) : [...selected, p.id])} />
                  <div className="list-item-main">
                    <div className="row" style={{ gap: 8 }}><strong>{p.number}</strong><Badge tone={PURCHASE_STATUS[p.status].tone}>{PURCHASE_STATUS[p.status].label}</Badge></div>
                    <p className="small muted">{fmtDate(p.date)} · {get<Supplier>('suppliers', p.supplierId || '')?.name || 'Fournisseur non indiqué'} · {fmtNum(purchaseQty(p) - purchaseReceivedQty(p))} pièce(s) attendue(s)</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {chosen.length > 0 && (
        <>
          <div className="card card-flush">
            <div className="card-pad"><h2>2. Quantités reçues</h2><p className="small muted">Pré-rempli avec ce qui est attendu. Corrigez s’il manque des pièces.</p></div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Article</th><th className="t-num">Attendu</th><th style={{ width: 110 }}>Reçu</th></tr></thead>
                <tbody>
                  {entries.filter((e) => e.rest > 0).map((e) => {
                    const v = get<Variant>('variants', e.line.variantId); const prod = v && get<Product>('products', v.productId);
                    return (
                      <tr key={key(e.purchase, e.line.id)}>
                        <td><div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}><Thumb src={prod?.photo} size={32} /><div><strong>{prod?.code}</strong> {variantLabel(v)}<div className="small muted">{e.purchase.number} · en stock : {v ? stockOf(v.id) : 0}</div></div></div></td>
                        <td className="t-num num">{e.rest}</td>
                        <td><input className="cell-input" inputMode="numeric" aria-label="Reçu" value={qty[key(e.purchase, e.line.id)] ?? String(e.rest)} onChange={(ev) => setQty({ ...qty, [key(e.purchase, e.line.id)]: ev.target.value })} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card"><TextField label="Date de réception" type="date" value={date} onChange={setDate} /></div>

          {showCost && items.length > 0 && (
            <div className="card card-flush">
              <div className="card-pad"><h2>3. Coût de revient</h2></div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Article</th><th className="t-num">Qté</th><th className="t-num">Coût de revient ({curSym()})</th><th className="t-num">PV détail</th><th className="t-num">Marge</th></tr></thead>
                  <tbody>
                    {items.map((i) => {
                      const v = get<Variant>('variants', i.variantId); const prod = v && get<Product>('products', v.productId);
                      const pv = v?.priceRetail ?? prod?.priceRetail;
                      const m = pv ? (pv - i.unitCost) / pv : undefined;
                      return (
                        <tr key={i.purchaseId + i.lineId}>
                          <td><strong>{prod?.code}</strong> {variantLabel(v)}</td>
                          <td className="t-num num">{i.qty}</td>
                          <td className="t-num"><strong>{fmtAr(i.unitCost)}</strong></td>
                          <td className="t-num">{fmtAr(pv)}</td>
                          <td className={`t-num ${m != null && m < 0.2 ? 'neg' : ''}`}>{m != null ? `${Math.round(m * 100)} %` : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot><tr className="t-total"><td>Total</td><td className="t-num">{fmtNum(totalQty)}</td><td className="t-num">{fmtAr(items.reduce((s, i) => s + i.qty * i.unitCost, 0))}</td><td colSpan={2}></td></tr></tfoot>
                </table>
              </div>
            </div>
          )}

          <div className="card stack">
            <TextField label="Remarques (manquants, abîmés…)" value={notes} onChange={setNotes} />
            <div className="row-between">
              <p className="small muted">{fmtNum(totalQty)} pièce(s) vont entrer en stock.</p>
              <Button icon="check" disabled={!totalQty || missingFx} onClick={() => setConfirm(true)}>Valider la réception</Button>
            </div>
          </div>
        </>
      )}

      {confirm && <Confirm title="Valider la réception" confirmLabel="Valider" onClose={() => setConfirm(false)}
        message={<p>{fmtNum(totalQty)} pièce(s) vont entrer en stock. Le coût moyen des articles sera mis à jour.</p>}
        onConfirm={async () => {
          const rec = await validateReception({
            number: nextNumber('REC', 'receptions'), date, purchaseIds: chosen.map((p) => p.id), invoice, allocation,
            transitTotalAr: total, items, notes: notes.trim() || undefined, userName: currentUser()?.fullName,
          });
          toast(`Réception ${rec.number} enregistrée`);
          navigate('/receptions/' + rec.id);
        }} />}
    </>
  );
}

function CancelReceptionButton({ r }: { r: Reception }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  return (<>
    <Button variant="danger" icon="x" onClick={() => setOpen(true)}>Annuler la réception (erreur)</Button>
    {open && <Confirm title={`Annuler ${r.number}`} danger confirmLabel="Annuler la réception" onClose={() => setOpen(false)}
      message={<div className="stack-s"><p>Les {r.items.reduce((s, i) => s + i.qty, 0)} pièce(s) entrées par cette réception sont retirées exactement du stock, et les quantités reçues des achats sont remises. Tout reste dans l’historique.</p><TextField label="Raison" value={reason} onChange={setReason} required /></div>}
      onConfirm={async () => { if (!reason.trim()) throw new Error('Indiquez la raison.'); await cancelReception(r, reason.trim()); toast('Réception annulée : stock corrigé'); }} />}
  </>);
}

function ReceptionDetail({ id }: { id: string }) {
  const can = useCan();
  useCatalog();
  const recs = useTable<Reception>('receptions');
  const r = recs.find((x) => x.id === id);
  if (!r) return <Empty icon="download" title="Réception introuvable"><Button variant="ghost" onClick={() => navigate('/receptions')}>Retour</Button></Empty>;
  const showCost = can('costs.view');
  const inv = r.invoice;
  const qty = r.items.reduce((s, i) => s + i.qty, 0);
  const rc = r as Reception & { cancelled?: boolean; cancelledAt?: string; cancelledBy?: string; cancelReason?: string };
  return (
    <>
      <div className="row"><Button variant="quiet" icon="chevronRight" className="back-btn" onClick={() => navigate('/receptions')}>Réceptions</Button></div>
      <div className="card stack">
        <div className="row" style={{ gap: 8 }}><h1 style={{ fontSize: '1.6rem' }}>{r.number}</h1>{rc.cancelled ? <Badge tone="danger">Annulée</Badge> : <Badge tone="ok">Entrée en stock</Badge>}
          {!rc.cancelled && can('records.correct') && <CancelReceptionButton r={r} />}</div>
        {rc.cancelled && <div className="notice notice-danger"><Icon name="alert" /><span>Réception annulée le {fmtDateTime(rc.cancelledAt)} par {rc.cancelledBy} : {rc.cancelReason}. Les pièces ont été retirées du stock.</span></div>}
        <p className="muted">{fmtDate(r.date)}{r.userName ? ` · par ${r.userName}` : ''} · {r.purchaseIds.map((pid) => { const p = get<Purchase>('purchases', pid); return p ? <a key={pid} href={`#/achats/${pid}`} style={{ marginRight: 8 }}>{p.number}</a> : null; })}</p>
        <div className="kv-row">
          <div><span className="small muted">Pièces reçues</span><strong className="num">{fmtNum(qty)}</strong></div>
          {r.transitTotalAr > 0 && <div><span className="small muted">Mode</span><strong>{MODE_LABEL[inv.mode]}</strong></div>}
          {showCost && r.transitTotalAr > 0 && <div><span className="small muted">Facturé</span><strong className="num">{fmtNum(inv.billedQty, 3)} {UNIT_LABEL[inv.mode]} × {fmtNum(inv.tariff, 2)} {inv.tariffCurrency}</strong></div>}
          {showCost && r.transitTotalAr > 0 && inv.tariffCurrency !== 'MGA' && <div><span className="small muted">Taux</span><strong className="num">1 {inv.tariffCurrency} = {fmtNum(inv.fx, 2)} {curSym()}</strong></div>}
          {showCost && r.transitTotalAr > 0 && <div><span className="small muted">Total transit et frais</span><strong className="num">{fmtAr(r.transitTotalAr)}</strong></div>}
          {r.transitTotalAr > 0 && <div><span className="small muted">Répartition</span><strong>{r.allocation === 'value' ? 'Par valeur' : 'Par quantité'}</strong></div>}
        </div>
        {showCost && inv.otherFees.length > 0 && <p className="small">Autres frais : {inv.otherFees.map((f) => `${f.label} ${fmtAr(f.amount)}`).join(' · ')}</p>}
        {r.notes && <p className="small">{r.notes}</p>}
      </div>
      <div className="card card-flush">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Article</th><th className="t-num">Qté</th>{showCost && <>{r.transitTotalAr > 0 && <><th className="t-num">Achat</th><th className="t-num">Transit</th></>}<th className="t-num">Coût de revient</th></>}</tr></thead>
            <tbody>
              {r.items.map((i) => {
                const v = get<Variant>('variants', i.variantId); const prod = v && get<Product>('products', v.productId);
                return (
                  <tr key={i.purchaseId + i.lineId}>
                    <td><strong>{prod?.code}</strong> {prod?.name} — {variantLabel(v)}</td>
                    <td className="t-num num">{i.qty}</td>
                    {showCost && <>{r.transitTotalAr > 0 && <><td className="t-num">{fmtAr(i.goodsUnitAr)}</td><td className="t-num">{fmtAr(i.transitUnitAr)}</td></>}<td className="t-num"><strong>{fmtAr(i.unitCost)}</strong></td></>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
