// Paramètres : société, apparence, cloud, sauvegardes, système.
import { useEffect, useRef, useState } from 'react';
import { KIND_LABELS, SUGGESTED, payMethods, savePayMethods, type PayKind, type PayMethodDef } from '../lib/paymethods';
import { parseNum } from '../lib/catalog';
import { fmtMoney, curSym, moneyInputMode, parseMoney, CURRENCIES } from '../lib/currency';
import { audit, useCan } from '../lib/auth';
import { getMeta, newId, requeueAll, save, setMeta, useMeta, useTable, type BaseRecord } from '../lib/db';
import { boostDeadlineTime } from '../lib/boosts';
import { BRAND_SWATCHES, DEFAULT_COMPANY, resizeImage, useCompany, type ThemeMode } from '../lib/settings';
import { disconnectCloud, connectCloud, getCloud, syncNow, useSyncStatus, type SyncLogLine } from '../lib/sync';
import { backupFolderName, backupKey, canPickFolder, canShareFile, pickBackupFolder, saveBackupFile, setBackupPassword, unlockBackupPassword, type SavedBackup, cloudBackup, cloudCopyBlocker, copyLooksIncomplete, dataStats, labelCount, statsText, downloadBackup, factoryReset, fetchCloudBackup, listCloudBackups, readBackup, restoreBackup } from '../lib/backup';
import { Help, Badge, Button, Confirm, Empty, Modal, PageHead, PasswordField, Req, SelectField, TextField, fmtDateTime, timeAgo, toast, useRoute, navigate , IconButton } from '../ui/kit';
import { Icon } from '../ui/icons';
import { CloudFields } from './Auth';
import { Zones } from './Deliveries';
import { PrintersTab } from './Printers';
import { ClearDataCard, ToolsTab } from './Tools';
import { KEEP, deleteCloudBackup, pruneBackups } from '../lib/maintenance';
import { ConflictsCard, DevicesCard } from './SyncCards';
import { LicenseCard } from './License';
import { LangPicker } from '../ui/langPicker';
import { MODULES, moduleOn, setModule, type ModuleKey } from '../lib/modules';
import { tr } from '../lib/i18n';
import { applyPendingUpdate, checkForUpdate, isAndroidApp, DOWNLOAD_PAGE } from '../lib/liveUpdate';
import { CLOUD_ENABLED } from '../lib/license';
import { actionsSince, createRestorePoint, restorePoints, restoreToPoint, type RestorePoint } from '../lib/restorePoints';
import { loc } from '../lib/i18n';

const TABS = [
  { key: 'societe', label: 'Société', perm: 'settings.company' },
  { key: 'paiements', label: 'Moyens de paiement', perm: 'settings.company' },
  { key: 'fonctions', label: 'Fonctions', perm: 'settings.company' },
  { key: 'apparence', label: 'Apparence', perm: '' },
  { key: 'imprimantes', label: 'Imprimantes', perm: '' },
  { key: 'zones', label: 'Zones de livraison', perm: 'couriers.view', module: 'deliveries' as ModuleKey },
  ...(CLOUD_ENABLED ? [{ key: 'cloud', label: 'Cloud et synchronisation', perm: 'backup.manage' }] : []),
  { key: 'licence', label: 'Licence', perm: '' },
  { key: 'sauvegarde', label: 'Sauvegardes', perm: 'backup.manage' },
  { key: 'outils', label: 'Outils', perm: 'users.manage' },
  { key: 'systeme', label: 'Système', perm: 'system.admin' },
];

export function SettingsPage() {
  const can = useCan();
  const route = useRoute();
  useTable('settings');
  const tabs = TABS.filter((t) => (!t.perm || can(t.perm)) && (!('module' in t) || !t.module || moduleOn(t.module)));
  const current = tabs.find((t) => route.endsWith('/' + t.key)) ?? tabs[0];
  return (
    <>
      <PageHead title="Paramètres" />
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={t.key === current.key} onClick={() => navigate('/parametres/' + t.key)}>{t.label}</button>
        ))}
      </div>
      {current.key === 'societe' && <CompanyTab />}
      {current.key === 'paiements' && <PayMethodsTab />}
      {current.key === 'fonctions' && <ModulesTab />}
      {current.key === 'apparence' && <AppearanceTab />}
      {current.key === 'imprimantes' && <PrintersTab />}
      {current.key === 'zones' && <Zones />}
      {current.key === 'cloud' && <CloudTab />}
      {current.key === 'licence' && <div className="stack"><LicenseCard />{getCloud() && !CLOUD_ENABLED && <><DevicesCard /><ConflictsCard /></>}</div>}
      {current.key === 'sauvegarde' && <BackupTab />}
      {current.key === 'outils' && <ToolsTab />}
      {current.key === 'systeme' && <SystemTab />}
    </>
  );
}

function CompanyTab() {
  const c = useCompany();
  const [form, setForm] = useState(c);
  const [base, setBase] = useState(c);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof c) => (v: string) => setForm({ ...form, [k]: v });
  // La fiche arrive d'un autre appareil pendant que la page est ouverte : le formulaire suit, tant qu'on n'a rien modifié.
  useEffect(() => {
    if (c.updatedAt === base.updatedAt) return;
    if (JSON.stringify(form) === JSON.stringify(base)) setForm(c);
    setBase(c);
  }, [c.updatedAt]);
  return (
    <div className="card stack">
      {c.updatedAt > '2001' && <p className="small muted">Dernière modification : {fmtDateTime(c.updatedAt)}{c._by ? ` par ${c._by}` : ''}. Sur chaque appareil, ces informations doivent être identiques après la synchronisation.</p>}
      <div className="row" style={{ alignItems: 'center', gap: 16 }}>
        <div className="logo-preview">{form.logo ? <img src={form.logo} alt="Logo" /> : <Icon name="store" size={32} />}</div>
        <div className="stack-s">
          <div className="row">
            <Button variant="ghost" icon="upload" onClick={() => fileRef.current?.click()}>{form.logo ? 'Changer le logo' : 'Ajouter un logo'}</Button>
            {form.logo && <Button variant="quiet" onClick={() => setForm({ ...form, logo: undefined })}>Retirer</Button>}
          </div>
          <p className="small muted">PNG ou JPG. Il apparaît sur l'écran de connexion, le menu et les tickets.</p>
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try { setForm({ ...form, logo: await resizeImage(f) }); } catch (err: any) { toast(err.message, 'error'); }
          e.target.value = '';
        }} />
      </div>
      <div className="grid-2">
        <TextField label="Nom de la société" required value={form.name} onChange={set('name')} />
        <TextField label="Slogan (facultatif)" value={form.slogan ?? ''} onChange={set('slogan')} />
        <TextField label="Téléphone" value={form.phone ?? ''} onChange={set('phone')} type="tel" />
        <TextField label="Adresse" value={form.address ?? ''} onChange={set('address')} />
        <TextField label="NIF" value={form.nif ?? ''} onChange={set('nif')} />
        <TextField label="STAT" value={form.stat ?? ''} onChange={set('stat')} />
        <TextField label="WhatsApp du patron (récapitulatif)" value={form.bossPhone ?? ''} onChange={set('bossPhone')} type="tel" placeholder="034 00 000 00" />
        <TextField label="WhatsApp du gérant (récapitulatif du jour)" value={form.managerPhone ?? ''} onChange={set('managerPhone')} type="tel" placeholder="034 00 000 00" />
        <TextField label="E-mail du patron (facultatif)" value={form.bossEmail ?? ''} onChange={set('bossEmail')} type="email" />
        <TextField label="Indicatif téléphonique du pays" value={form.dialCode ?? ''} onChange={(v) => setForm({ ...form, dialCode: v.replace(/[^\d]/g, '').slice(0, 4) })} inputMode="numeric" placeholder="261" hint="Pour les liens WhatsApp. Ex. 261 Madagascar, 33 France, 221 Sénégal, 225 Côte d’Ivoire." />
      </div>
      <TextField label="Message en bas du ticket de caisse" value={form.ticketFooter ?? ''} onChange={set('ticketFooter')} />
      <SelectField label="Verrouillage automatique après inactivité" value={String(form.autoLockMinutes)} onChange={(v) => setForm({ ...form, autoLockMinutes: Number(v) })}
        options={[5, 10, 15, 30, 60, 120, 0].map((m) => ({ value: String(m), label: m ? `${m} minutes` : 'Jamais' }))} />
      <div className="card stack" style={{ background: 'var(--surface-2)' }}>
        <div><h3>Horaires d'ouverture</h3><Help>Les commandes reçues en dehors de ces horaires sont marquées « hors heures » et attendent l'ouverture pour être préparées. Les commandes sont acceptées tous les jours.</Help></div>
        {[1, 2, 3, 4, 5, 6, 0].map((d) => {
          const h = (form.hours ?? DEFAULT_COMPANY.hours!)[String(d)];
          const setH = (v: { open: string; close: string } | null) => setForm({ ...form, hours: { ...(form.hours ?? DEFAULT_COMPANY.hours!), [String(d)]: v } });
          return (
            <div key={d} className="row hours-row">
              <span style={{ width: 90 }}><strong>{['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][d]}</strong></span>
              <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={!!h} onChange={(e) => setH(e.target.checked ? { open: '08:00', close: '17:00' } : null)} /> Ouvert</label>
              {h && <><input className="cell-input" style={{ width: 110 }} type="time" aria-label="Ouverture" value={h.open} onChange={(e) => setH({ ...h, open: e.target.value })} /> à <input className="cell-input" style={{ width: 110 }} type="time" aria-label="Fermeture" value={h.close} onChange={(e) => setH({ ...h, close: e.target.value })} /></>}
            </div>
          );
        })}
      </div>
      <div className="grid-2">
        <TextField label="Commandes après la fermeture : lundi → vendredi à partir de" type="time" value={form.weekdayFrom || '17:30'} onChange={(v) => setForm({ ...form, weekdayFrom: v || undefined })}
          hint="Saisie à partir de cette heure : la date de commande devient le lendemain." />
        <TextField label="Samedi à partir de" type="time" value={form.weekendFrom || '17:00'} onChange={(v) => setForm({ ...form, weekendFrom: v || undefined })}
          hint="Saisie le samedi à partir de cette heure, ou le dimanche : la date de commande devient le lundi." />
      </div>
      {moduleOn('boosts') && <div className="card stack" style={{ background: 'var(--surface-2)' }}>
        <div><h3>Compte boost : heure limite</h3><Help>Les boosts tournent tous les jours : le compte boost doit être fait chaque jour, dimanche compris, avant cette heure (le jour même). Après, le responsable reçoit une alerte et le gérant et le super-admin sont prévenus. Vide = heure de fermeture.</Help></div>
        {[1, 2, 3, 4, 5, 6, 0].map((d) => {
          const def = boostDeadlineTime({ ...form, boostDeadlines: {} } as any, d);
          return (
            <div key={d} className="row hours-row">
              <span style={{ width: 90 }}><strong>{['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][d]}</strong></span>
              <span className="small">avant</span>
              <input className="cell-input" style={{ width: 110 }} type="time" aria-label={`Heure limite compte boost ${['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][d]}`} value={form.boostDeadlines?.[String(d)] || def} onChange={(e) => setForm({ ...form, boostDeadlines: { ...(form.boostDeadlines ?? {}), [String(d)]: e.target.value } })} />
              {!(form.hours ?? DEFAULT_COMPANY.hours!)[String(d)] && <span className="small muted">jour fermé : compte fait le jour même</span>}
            </div>
          );
        })}
      </div>}
      <div className="stack-s">
        <div className="grid-2">
          <SelectField label="Devise de la boutique" value={form.currency || 'MGA'} onChange={(v) => setForm({ ...form, currency: v, currencySymbol: '' })}
            options={CURRENCIES.map((x) => ({ value: x.code, label: `${tr(x.name)} — ${x.symbol}${x.decimals ? tr(' (avec centimes)') : ''}` }))} />
          <TextField label="Symbole affiché (facultatif)" value={form.currencySymbol ?? ''} onChange={set('currencySymbol')} placeholder={CURRENCIES.find((x) => x.code === (form.currency || 'MGA'))?.symbol} maxLength={6} hint="Laissez vide pour le symbole habituel." />
        </div>
        {(form.currency || 'MGA') !== (c.currency || 'MGA') && <div className="notice"><Icon name="alert" /><span>Changer de devise ne convertit pas les montants déjà saisis (prix, ventes, caisse). À faire de préférence avant de commencer.</span></div>}
      </div>
      <div className="grid-2">
        <TextField label={`Objectif de chiffre d’affaires par jour (${curSym()})`} value={form.targetDay ? String(form.targetDay) : ''} onChange={(v) => setForm({ ...form, targetDay: parseMoney(v) || undefined })} inputMode={moneyInputMode()} hint="Facultatif : une barre de progression s’affiche sur l’accueil et dans le rapport du jour." />
        <TextField label={`Objectif de chiffre d’affaires par mois (${curSym()})`} value={form.targetMonth ? String(form.targetMonth) : ''} onChange={(v) => setForm({ ...form, targetMonth: parseMoney(v) || undefined })} inputMode={moneyInputMode()} hint="Facultatif : progression du mois, avec le rythme à tenir." />
      </div>
      {moduleOn('boosts') && <TextField label={`Taux du dollar pour les boosts (${curSym()})`} value={String(form.usdRate ?? 4700)} onChange={(v) => setForm({ ...form, usdRate: parseNum(v) || 0 })} inputMode="decimal" hint="Sert à convertir la dépense des boosts ($) dans la devise de la boutique, dans le tableau de la semaine et le récapitulatif mensuel." />}
      <SelectField label="Vente interne (employés) : prix de revient arrondi" value={String(form.internalRounding ?? 1)} onChange={(v) => setForm({ ...form, internalRounding: Number(v) || 1 })}
        options={[1, 50, 100, 500, 1000].map((n) => ({ value: String(n), label: n === 1 ? `à l’unité supérieure (ex. 2 562,5 → ${fmtMoney(2563)})` : `aux ${fmtMoney(n)} supérieurs (ex. 2 563 → ${fmtMoney(Math.ceil(2563 / n) * n)})` }))} />
      <div className="row">
        <Button busy={busy} disabled={!form.name.trim()} onClick={async () => {
          setBusy(true);
          // Seuls les champs réellement modifiés sur cet écran sont envoyés : un appareil qui n'avait pas encore reçu
          // le nouveau nom (ou la nouvelle adresse) ne peut plus l'écraser avec l'ancienne valeur en enregistrant autre chose.
          const { createdAt, updatedAt, _f, _v, _by, _dev, ...data } = { ...form, name: form.name.trim() } as any;
          const changed: Record<string, any> = {};
          for (const k of new Set([...Object.keys(data), ...Object.keys(base)])) {
            if (['createdAt', 'updatedAt', '_f', '_v', '_by', '_dev', 'id'].includes(k)) continue;
            if (JSON.stringify((data as any)[k]) !== JSON.stringify((base as any)[k])) changed[k] = (data as any)[k];
          }
          if (!Object.keys(changed).length) { setBusy(false); toast('Aucune modification'); return; }
          await save('settings', { ...changed, id: 'company' }, { force: true });
          const names: Record<string, string> = { name: 'nom', address: 'adresse', phone: 'téléphone', logo: 'logo', slogan: 'slogan', hours: 'horaires', boostDeadlines: 'heures du compte boost', ticketFooter: 'message du ticket' };
          await audit('Paramètres', `Informations de la société modifiées : ${Object.keys(changed).map((k) => names[k] ?? k).join(', ')}${changed.name ? ` (nouveau nom : ${changed.name})` : ''}`, 'settings', 'company');
          setBase({ ...base, ...changed });
          syncNow().catch(() => {});
          setBusy(false);
          toast('Informations enregistrées — envoyées aux autres appareils');
        }}>Enregistrer</Button>
      </div>
    </div>
  );
}

export function ThemePicker() {
  const theme = useMeta<ThemeMode>('theme', 'auto');
  return (
    <div className="segmented" role="group" aria-label="Thème">
      {([['auto', 'Automatique', 'monitor'], ['light', 'Clair', 'sun'], ['dark', 'Sombre', 'moon']] as const).map(([k, label, icon]) => (
        <button key={k} type="button" aria-pressed={theme === k} onClick={() => setMeta('theme', k)}>
          <Icon name={icon} size={16} />{label}
        </button>
      ))}
    </div>
  );
}

/** Moyens de paiement de la boutique : chacun a son compte en trésorerie. On les désactive, on ne les supprime pas. */
function PayMethodsTab() {
  useTable('settings');
  const saved = payMethods();
  const [list, setList] = useState<PayMethodDef[]>(saved);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const changed = JSON.stringify(list) !== JSON.stringify(saved);
  const up = (i: number, patch: Partial<PayMethodDef>) => setList(list.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 1 || j >= list.length) return; const n = [...list]; [n[i], n[j]] = [n[j], n[i]]; setList(n); };
  const add = () => {
    const label = name.trim(); if (!label) return;
    if (list.some((m) => m.label.toLowerCase() === label.toLowerCase())) return toast('Ce moyen existe déjà (réactivez-le s’il est désactivé).', 'error');
    const kind: PayKind = /carte|card|visa/i.test(label) ? 'card' : /virement|banque|bank|chèque|cheque/i.test(label) ? 'bank' : /paypal/i.test(label) ? 'other' : 'mobile';
    setList([...list, { id: 'pm_' + newId().replace(/[^a-z0-9]/gi, '').slice(-8).toLowerCase(), label, kind, active: true }]); setName('');
  };
  return (
    <div className="card stack">
      <div><h2>Moyens de paiement</h2><p className="small muted">Ceux que vos clients utilisent : ils sont proposés à chaque encaissement et ont chacun leur compte dans la trésorerie. Un moyen déjà utilisé ne se supprime pas : désactivez-le, l’historique garde son nom.</p></div>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Nom</th><th>Type</th><th>Actif</th><th>Ordre</th></tr></thead>
        <tbody>
          {list.map((m, i) => (
            <tr key={m.id}>
              <td><input className="cell-input" aria-label={`Nom du moyen ${i + 1}`} value={m.label} onChange={(e) => up(i, { label: e.target.value })} maxLength={30} /></td>
              <td>{m.id === 'cash' ? <span className="small muted">Espèces</span> : (
                <select className="cell-input" aria-label={`Type du moyen ${m.label}`} value={m.kind} onChange={(e) => up(i, { kind: e.target.value as PayKind })}>
                  {(Object.keys(KIND_LABELS) as PayKind[]).filter((k) => k !== 'cash').map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
                </select>)}</td>
              <td>{m.id === 'cash' ? <span className="small muted">toujours</span> : <input type="checkbox" aria-label={`${m.label} actif`} checked={m.active} onChange={(e) => up(i, { active: e.target.checked })} />}</td>
              <td>{m.id !== 'cash' && <div className="row" style={{ gap: 4 }}><IconButton icon="chevronUp" label={`Monter ${m.label}`} onClick={() => move(i, -1)} disabled={i <= 1} /><IconButton icon="chevronDown" label={`Descendre ${m.label}`} onClick={() => move(i, 1)} disabled={i === list.length - 1} /></div>}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 200 }}><TextField label="Ajouter un moyen" value={name} onChange={setName} list="pm-suggest" placeholder="Ex. Wave, MTN MoMo, Carte bancaire…" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} /></div>
        <datalist id="pm-suggest">{SUGGESTED.filter((x) => !list.some((m) => m.label.toLowerCase() === x.toLowerCase())).map((x) => <option key={x} value={x} />)}</datalist>
        <Button variant="ghost" icon="plus" onClick={add} disabled={!name.trim()}>Ajouter</Button>
      </div>
      <div className="row">
        <Button icon="check" busy={busy} disabled={!changed || list.some((m) => !m.label.trim())} onClick={async () => {
          setBusy(true);
          try { await savePayMethods(list.map((m) => ({ ...m, label: m.label.trim() }))); toast('Moyens de paiement enregistrés'); } catch (e: any) { toast(e.message, 'error'); }
          setBusy(false);
        }}>Enregistrer</Button>
        {changed && <Button variant="quiet" onClick={() => setList(saved)}>Annuler les changements</Button>}
      </div>
    </div>
  );
}

/** Fonctions activables : chaque boutique garde seulement ce dont elle a besoin. */
function ModulesTab() {
  useTable('settings');
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <div className="card stack">
      <div><h3>Fonctions du logiciel</h3><p className="muted small">La vente en boutique, le stock, les achats, les clients, les dépenses, la caisse et les rapports sont toujours là. Activez en plus seulement ce dont votre boutique a besoin : les menus apparaissent ou disparaissent aussitôt, sur tous les appareils. Rien n’est effacé quand vous désactivez une fonction.</p></div>
      <ul className="list">
        {MODULES.map((m) => {
          const parentOff = !!m.needs && !moduleOn(m.needs);
          const on = moduleOn(m.key);
          return (
            <li key={m.key} className="list-item" style={{ padding: '12px 0' }}>
              <div className="list-item-main">
                <strong>{m.label}</strong>
                <p className="small muted">{m.description}{parentOff ? ` (nécessite « ${MODULES.find((x) => x.key === m.needs)!.label} »)` : ''}</p>
              </div>
              <label className="switch">
                <input type="checkbox" role="switch" aria-label={m.label} checked={on} disabled={parentOff || busy === m.key}
                  onChange={async (e) => { setBusy(m.key); try { await setModule(m.key, e.target.checked); await audit('Fonctions', `${m.label} : ${e.target.checked ? 'activée' : 'désactivée'}`); } finally { setBusy(null); } }} />
                <span>{on ? 'Activée' : 'Désactivée'}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AppearanceTab() {
  const can = useCan();
  const c = useCompany();
  return (
    <div className="stack">
      <div className="card stack">
        <div><h3>Langue</h3><p className="muted small">Langue des écrans, des tickets et des messages. Ce choix ne concerne que cet appareil.</p></div>
        <LangPicker />
      </div>
      <div className="card stack">
        <div><h3>Thème</h3><p className="muted small">Automatique suit le réglage clair/sombre du téléphone ou de l'ordinateur. Ce choix ne concerne que cet appareil.</p></div>
        <ThemePicker />
      </div>
      {can('settings.company') && (
        <div className="card stack">
          <div><h3>Couleur de la société</h3><p className="muted small">Utilisée pour le menu, les boutons et l'écran de connexion, sur tous les appareils.</p></div>
          <div className="swatches">
            {BRAND_SWATCHES.map((s) => (
              <button key={s.hex} className="swatch" style={{ background: s.hex }} aria-pressed={c.brandColor.toLowerCase() === s.hex.toLowerCase()} title={s.name} aria-label={s.name}
                onClick={async () => { await save('settings', { id: 'company', brandColor: s.hex }); }}>
                {c.brandColor.toLowerCase() === s.hex.toLowerCase() && <Icon name="check" size={18} />}
              </button>
            ))}
            <label className="swatch" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }} title="Autre couleur">
              <input type="color" value={c.brandColor} style={{ opacity: 0, width: 0, height: 0 }} aria-label="Choisir une autre couleur"
                onChange={(e) => save('settings', { id: 'company', brandColor: e.target.value })} />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

function CloudTab() {
  const status = useSyncStatus();
  const cloud = useMeta<any>('cloud', null);
  const deviceName = useMeta<string>('deviceName', '');
  const [name, setName] = useState(deviceName);
  const [form, setForm] = useState({ url: '', key: '', email: '', pwd: '' });
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const labels: Record<string, [string, 'ok' | 'warn' | 'danger' | 'neutral']> = {
    ok: ['Synchronisé', 'ok'], syncing: ['Synchronisation…', 'warn'], offline: ['Hors connexion', 'danger'], error: ['Erreur', 'danger'], off: ['Non relié', 'neutral'],
  };
  const [label, tone] = labels[status.state];

  return (
    <div className="stack">
      <div className="card stack">
        <div className="row-between">
          <h3>État</h3>
          <Badge tone={tone}>{label}</Badge>
        </div>
        {cloud ? (
          <>
            <p className="small muted">Relié à <strong>{cloud.url.replace('https://', '')}</strong> avec le compte {cloud.email}. Dernière synchronisation : {timeAgo(status.lastSync)}.</p>
            <p className="small">{status.pending ? `${status.pending} modification(s) en attente d'envoi.` : 'Toutes les modifications de cet appareil sont envoyées.'}</p>
            {status.error && status.state === 'error' && <div className="notice notice-danger"><Icon name="alert" /><span>{status.error}</span></div>}
            <div className="row">
              <Button icon="refresh" onClick={() => syncNow()}>Synchroniser maintenant</Button>
              <Button variant="ghost" onClick={() => setConfirmOff(true)}>Délier cet appareil</Button>
            </div>
          </>
        ) : (
          <>
            <Help>Sans cloud, les données restent uniquement sur cet appareil. Reliez-le pour partager les données entre tous les téléphones et ordinateurs, et les mettre à l'abri.</Help>
            <form className="stack" onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try { await connectCloud(form.url, form.key, form.email, form.pwd); await audit('Cloud', 'Appareil relié au cloud'); toast('Appareil relié au cloud'); }
              catch (err: any) { toast(err.message, 'error'); }
              finally { setBusy(false); }
            }}>
              <CloudFields url={form.url} setUrl={(url) => setForm({ ...form, url })} k={form.key} setK={(key) => setForm({ ...form, key })}
                email={form.email} setEmail={(email) => setForm({ ...form, email })} pwd={form.pwd} setPwd={(pwd) => setForm({ ...form, pwd })} />
              <div><Button type="submit" busy={busy} icon="cloud" disabled={!form.url || !form.key || !form.email || !form.pwd}>Relier au cloud</Button></div>
            </form>
          </>
        )}
      </div>
      <div className="card stack">
        <div><h3>Cet appareil</h3><p className="muted small">Un nom pour reconnaître l'appareil dans le journal d'activité.</p></div>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 240px' }}><TextField label="Nom de l'appareil" value={name} onChange={setName} placeholder="Exemple : Téléphone caisse" /></div>
          <Button variant="ghost" onClick={async () => { await setMeta('deviceName', name.trim()); toast('Nom enregistré'); }}>Enregistrer</Button>
        </div>
      </div>
      {cloud && <ConflictsCard />}
      {cloud && <DevicesCard />}
      {cloud && <SyncHistoryCard />}
      <VersionAndResync />
      <div className="card stack-s small">
        <h3>Travailler sans Internet</h3>
        <p>Tout ce que vous saisissez est d’abord enregistré sur cet appareil : vous pouvez continuer à travailler sans connexion. Les modifications attendent dans une file d’envoi (« {status.pending} en attente ») et partent toutes seules dès que la connexion revient.</p>
        <p className="muted">Les modifications des différents appareils sont fusionnées information par information : deux vendeurs qui modifient des choses différentes d’une même commande gardent tous les deux leurs modifications. Un même envoi répété ne crée jamais de doublon.</p>
      </div>
      {confirmOff && <Confirm title="Délier cet appareil" confirmLabel="Délier"
        message={<p>Cet appareil ne se synchronisera plus. Les données restent sur l'appareil.{status.pending ? ` Attention : ${status.pending} modification(s) ne sont pas encore envoyées.` : ''}</p>}
        onClose={() => setConfirmOff(false)} onConfirm={async () => { await audit('Cloud', 'Appareil délié du cloud'); await syncNow(); await disconnectCloud(); toast('Appareil délié'); }} />}
    </div>
  );
}

/** Sauvegarde en fichier : mot de passe défini une fois, dossier choisi sur ordinateur, Partager sur téléphone. */
function FileBackupCard() {
  const can = useCan();
  const lastFile = useMeta<string | null>('lastFileBackup', null);
  useMeta('backupDir', null);
  useTable('settings');
  const key = backupKey();
  const folder = backupFolderName();
  const [setting, setSetting] = useState(false);
  const [doing, setDoing] = useState(false);
  const [saved, setSaved] = useState<SavedBackup | null>(null);
  return (
    <div className="card stack">
      <div className="row-between">
        <div><h3>Fichier de sauvegarde</h3><p className="muted small">Un fichier avec toutes les données, à garder ailleurs (clé USB, Google Drive, e-mail).</p></div>
        <Badge tone={lastFile ? 'ok' : 'warn'}>Dernière : {lastFile ? fmtDateTime(lastFile) : 'jamais'}</Badge>
      </div>
      <div className="kv-row">
        <div><span className="small muted">Mot de passe des sauvegardes</span><strong>{key ? `Défini${key.setByName ? ` par ${key.setByName}` : ''}${key.setAt ? ` le ${fmtDateTime(key.setAt)}` : ''}` : 'Pas encore défini'}</strong></div>
        {canPickFolder() && <div><span className="small muted">Dossier des sauvegardes (cet ordinateur)</span><strong>{folder ?? 'Téléchargements'}</strong></div>}
      </div>
      <div className="row">
        <Button icon="download" onClick={() => { setSaved(null); setDoing(true); }}>Faire une sauvegarde</Button>
        {canPickFolder() && <Button variant="ghost" icon="inbox" onClick={async () => { try { const n = await pickBackupFolder(); toast(`Les sauvegardes iront dans « ${n} »`); } catch (e: any) { if (e?.name !== 'AbortError') toast(e?.message ?? 'Dossier non choisi', 'error'); } }}>{folder ? 'Changer de dossier' : 'Choisir le dossier'}</Button>}
        {can('backup.manage') && <Button variant="ghost" icon="key" onClick={() => setSetting(true)}>{key ? 'Changer le mot de passe des sauvegardes' : 'Définir le mot de passe des sauvegardes'}</Button>}
      </div>
      {!canPickFolder() && <Help>Sur téléphone, le fichier va dans « Téléchargements » ; le bouton « Partager » permet ensuite de l’envoyer sur Google Drive, WhatsApp ou par e-mail.</Help>}
      {saved && <div className="notice notice-ok" style={{ flexWrap: 'wrap', alignItems: 'center' }}><Icon name="check" /><span style={{ flex: '1 1 220px' }}>{saved.where === 'folder' ? <>Enregistré dans le dossier <strong>{saved.folder}</strong> : {saved.name}</> : <>Enregistré dans <strong>Téléchargements</strong> : {saved.name}</>}</span>
        {canShareFile(saved.file) && <Button variant="ghost" icon="share" onClick={() => (navigator as any).share({ files: [saved.file], title: saved.name }).catch(() => {})}>Partager</Button>}</div>}
      {doing && <DoBackupModal onClose={() => setDoing(false)} onDone={(r) => { setDoing(false); setSaved(r); }} />}
      {setting && <SetBackupPwdModal onClose={() => setSetting(false)} />}
    </div>
  );
}

function DoBackupModal({ onClose, onDone }: { onClose: () => void; onDone: (r: SavedBackup) => void }) {
  const key = backupKey();
  const [login, setLogin] = useState('');
  const [bpwd, setBpwd] = useState('');
  const [need, setNeed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async (protect: boolean) => {
    setBusy(true); setErr(null);
    try {
      const pwd = protect ? await unlockBackupPassword(login, bpwd || undefined) : undefined;
      onDone(await saveBackupFile(pwd));
    } catch (e: any) { if (e?.code === 'NEED') setNeed(true); setErr(e?.message ?? String(e)); setBusy(false); }
  };
  return (
    <Modal title="Faire une sauvegarde" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button>{key ? <Button busy={busy} disabled={!login} onClick={() => go(true)}>Sauvegarder</Button> : <Button busy={busy} onClick={() => go(false)}>Sauvegarder sans protection</Button>}</>}>
      <div className="stack">
        {key ? <>
          <p className="small muted">Le fichier est protégé par le mot de passe des sauvegardes. Confirmez simplement avec <strong>votre mot de passe de connexion</strong>.</p>
          <PasswordField label="Votre mot de passe de connexion" required value={login} onChange={setLogin} autoFocus />
          {need && <PasswordField label="Mot de passe des sauvegardes (une seule fois sur ce compte)" required value={bpwd} onChange={setBpwd} autoComplete="off" hint="Donné par l’admin. Ensuite, votre mot de passe de connexion suffira." />}
        </> : <div className="notice"><Icon name="alert" /><span>Aucun mot de passe des sauvegardes n’est défini : le fichier ne sera <strong>pas protégé</strong>. Un admin peut le définir une fois pour toutes (bouton « Définir le mot de passe des sauvegardes »).</span></div>}
        {err && <div className="notice notice-danger"><Icon name="alert" /><span>{err}</span></div>}
      </div>
    </Modal>
  );
}

function SetBackupPwdModal({ onClose }: { onClose: () => void }) {
  const [a, setA] = useState(''); const [b, setB] = useState(''); const [login, setLogin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <Confirm title="Mot de passe des sauvegardes" confirmLabel="Enregistrer" onClose={onClose}
      onConfirm={async () => { if (a !== b) throw new Error('Les deux mots de passe ne sont pas identiques.'); try { await setBackupPassword(a, login); toast('Mot de passe des sauvegardes enregistré'); } catch (e: any) { setErr(e.message); throw e; } }}
      message={<div className="stack-s">
        <p className="small">Défini <strong>une seule fois</strong>. Il sera demandé pour <strong>restaurer</strong> un fichier : notez-le en lieu sûr, il est impossible de le retrouver. Les autres personnes autorisées le saisiront une fois, puis leur mot de passe de connexion suffira.</p>
        <PasswordField label="Nouveau mot de passe des sauvegardes" required value={a} onChange={setA} autoComplete="new-password" />
        <PasswordField label="Le même, une deuxième fois" required value={b} onChange={setB} autoComplete="new-password" />
        <PasswordField label="Votre mot de passe de connexion" required value={login} onChange={setLogin} />
        {err && <p className="small neg">{err}</p>}
      </div>} />
  );
}

function BackupTab() {
  const can = useCan();
  const lastFile = useMeta<string | null>('lastFileBackup', null);
  const lastCloud = useMeta<string | null>('lastCloudBackup', null);
  const [busy, setBusy] = useState('');
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [cloudList, setCloudList] = useState<any[] | null>(null);
  const skip = useMeta<{ at: string; why: string } | null>('autoBackupSkip', null);
  const [pick, setPick] = useState<{ label: string; data: Record<string, BaseRecord[]> } | null>(null);
  const hasCloud = !!getCloud();

  return (
    <div className="stack">
      <FileBackupCard />

      <div className="card stack" style={!CLOUD_ENABLED && !hasCloud ? { display: 'none' } : undefined}>
        <div className="row-between">
          <div><h3>Copies dans le cloud</h3><p className="muted small">Faites automatiquement chaque jour par l'appareil d'un admin ou du gérant. On garde les {KEEP.daily} dernières quotidiennes, {KEEP.weekly} hebdomadaires et {KEEP.monthly} mensuelles ; les plus anciennes sont effacées toutes seules. Les copies manuelles ne sont jamais effacées automatiquement.</p></div>
          {hasCloud && <Badge tone={lastCloud ? 'ok' : 'warn'}>Dernière : {timeAgo(lastCloud ?? undefined)}</Badge>}
        </div>
        {hasCloud ? (
          <div className="row">
            <Button icon="cloud" busy={busy === 'cloud'} onClick={async () => {
              setBusy('cloud');
              try {
                const why = await cloudCopyBlocker();
                if (why && !confirm(`Attention : ${why}. La copie risque d’être incomplète. La faire quand même ?`)) { setBusy(''); return; }
                const st = await cloudBackup('Manuelle'); toast(`Copie enregistrée et vérifiée (${st.total.toLocaleString(loc())} fiches)`);
              } catch (e: any) { toast(e.message, 'error'); }
              setBusy('');
            }}>Copier maintenant dans le cloud</Button>
            {can('system.admin') && <Button variant="ghost" busy={busy === 'list'} onClick={async () => {
              setBusy('list');
              try { setCloudList(await listCloudBackups()); } catch (e: any) { toast(e.message, 'error'); }
              setBusy('');
            }}>Voir les copies</Button>}
          </div>
        ) : <p className="small">Reliez l'appareil au cloud (onglet « Cloud et synchronisation ») pour activer les copies automatiques.</p>}
        {hasCloud && <p className="small muted">Contrôle : une copie n’est faite qu’après une synchronisation complète (cet appareil doit avoir toutes les données du cloud), puis elle est relue pour vérifier qu’elle est bien enregistrée. Données actuelles : {statsText(dataStats())}.</p>}
        {hasCloud && skip?.why && <p className="small" style={{ color: 'var(--warn-ink, #8a5a00)' }}>{fmtDateTime(skip.at)} — {skip.why}</p>}
      </div>

      {(can('system.admin') || can('records.correct')) && <RestorePointsCard />}

      {can('system.admin') && (
        <div className="card stack">
          <div><h3>Restaurer</h3><p className="muted small">Remet les données d'une sauvegarde. L'état actuel est d'abord téléchargé automatiquement, par précaution.</p></div>
          <div><Button variant="ghost" icon="upload" onClick={() => setRestoreOpen(true)}>Restaurer depuis un fichier</Button></div>
        </div>
      )}

      {cloudList && (
        <Modal title="Copies dans le cloud" onClose={() => setCloudList(null)} wide footer={<Button variant="ghost" onClick={async () => { try { const n = await pruneBackups(); setCloudList(await listCloudBackups()); toast(n ? `${n} ancienne(s) copie(s) effacée(s)` : 'Rien à nettoyer'); } catch (e: any) { toast(e.message, 'error'); } }}>Nettoyer les anciennes copies automatiques</Button>}>
          {cloudList.length === 0 ? <Empty icon="cloud" title="Aucune copie pour l'instant" /> : (
            <ul className="list">
              {cloudList.map((b) => (
                <li key={b.id} className="list-item">
                  <div className="list-item-main">
                    <p className="list-item-title">{fmtDateTime(b.created_at)}</p>
                    <p className="small muted">{b.label}{b.device ? ` · ${b.device}` : ''}</p>
                    {copyLooksIncomplete(b.label) && <p className="small"><Badge tone="danger">Copie incomplète</Badge> {labelCount(b.label)?.toLocaleString(loc())} fiches seulement, contre {dataStats().total.toLocaleString(loc())} aujourd’hui : faite par un appareil pas encore synchronisé. Ne pas restaurer.</p>}
                    {labelCount(b.label) === null && <p className="small muted">Ancienne copie (nombre de fiches non noté) : il s’affiche avant de restaurer.</p>}
                  </div>
                  <Button variant="ghost" onClick={async () => {
                    try { setPick({ label: `la copie cloud du ${fmtDateTime(b.created_at)}`, data: await fetchCloudBackup(b.id) }); setCloudList(null); }
                    catch (e: any) { toast(e.message, 'error'); }
                  }}>Restaurer</Button>
                  <IconButton icon="trash" label="Supprimer cette copie" onClick={async () => {
                    if (!confirm(`Supprimer la copie du ${fmtDateTime(b.created_at)} ?`)) return;
                    try { await deleteCloudBackup(b.id, b.label); setCloudList(cloudList.filter((x) => x.id !== b.id)); toast('Copie supprimée'); } catch (e: any) { toast(e.message, 'error'); }
                  }} />
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
      {restoreOpen && <RestoreFileModal onClose={() => setRestoreOpen(false)} onReady={(p) => { setRestoreOpen(false); setPick(p); }} />}
      {pick && <RestoreConfirm pick={pick} onClose={() => setPick(null)} />}
    </div>
  );
}

/** Points de restauration automatiques : revenir au moment d'avant une erreur (super-admin). */
function RestorePointsCard() {
  const can = useCan();
  useMeta('restorePoints', []); useTable('audit');
  const points = restorePoints();
  const [open, setOpen] = useState<RestorePoint | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="card stack">
      <div className="row-between">
        <div><h3>Points de restauration</h3><p className="muted small">Copies automatiques de toutes les données, faites chaque jour et juste avant chaque action risquée (annulation, correction, suppression, inventaire, import, restauration). Les {points.length ? points.length : ''} dernières sont gardées sur cet appareil. En cas d’erreur, le super-admin peut revenir au moment d’avant : il voit d’abord toutes les actions faites depuis, par qui et quand. Le journal d’activité, lui, n’est jamais effacé.</p></div>
        <Button variant="ghost" busy={busy} onClick={async () => { setBusy(true); const p = await createRestorePoint('Manuel'); setBusy(false); toast(p ? 'Point de restauration créé' : 'Impossible de créer le point (place insuffisante ?)', p ? 'info' : 'error'); }}>Créer un point maintenant</Button>
      </div>
      {points.length === 0 ? <p className="small muted">Aucun point pour l’instant : le premier est créé automatiquement aujourd’hui.</p> : (
        <ul className="list">{points.map((p) => { const n = actionsSince(p.at); const hi = n.filter((a) => a.level === 'high').length; return (
          <li key={p.id} className="list-item">
            <div className="list-item-main"><span className="list-item-title">{fmtDateTime(p.at)} — {p.reason}</span>
              <p className="small muted">{p.byName ? `par ${p.byName} · ` : ''}{n.length} action(s) depuis{hi ? ` dont ${hi} importante(s)` : ''} · {p.counts.orders ?? 0} vente(s)/commande(s), {p.counts.products ?? 0} article(s)</p></div>
            <Button variant="ghost" onClick={() => setOpen(p)}>{can('system.admin') ? 'Voir / revenir' : 'Voir'}</Button>
          </li>); })}</ul>
      )}
      {open && <RestorePointModal p={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function RestorePointModal({ p, onClose }: { p: RestorePoint; onClose: () => void }) {
  const can = useCan();
  const acts = actionsSince(p.at);
  const byUser = new Map<string, typeof acts>();
  for (const a of acts) { const k = a.userName || '—'; if (!byUser.has(k)) byUser.set(k, []); byUser.get(k)!.push(a); }
  const [confirm, setConfirm] = useState(false);
  return (
    <Modal title={`Point du ${fmtDateTime(p.at)}`} wide onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Fermer</Button>
      {can('system.admin') && <Button variant="danger" onClick={() => setConfirm(true)}>Revenir à ce point</Button>}</>}>
      <div className="stack">
        <p>{p.reason}{p.byName ? ` · ${p.byName}` : ''}. <strong>{acts.length} action(s)</strong> ont été faites depuis : si vous revenez à ce point, leurs effets sur les données sont annulés (elles restent visibles dans le journal).</p>
        {[...byUser.entries()].map(([u, list]) => (
          <div key={u} className="stack-s"><strong>{u} — {list.length} action(s)</strong>
            <ul className="list small">{list.slice(0, 30).map((a) => <li key={a.id} className="list-item"><span className="num muted" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(a.at)}</span><span className="list-item-main"><strong>{a.action}</strong> — {a.details}</span>{a.level === 'high' && <Badge tone="danger">Important</Badge>}</li>)}</ul>
            {list.length > 30 && <p className="small muted">+ {list.length - 30} autre(s)…</p>}
          </div>
        ))}
      </div>
      {confirm && <Confirm title="Revenir à ce point de restauration ?" danger confirmLabel="Revenir à ce point" typeToConfirm="RESTAURER" onClose={() => setConfirm(false)}
        message={<div className="stack-s"><p>Toutes les données (ventes, stock, trésorerie, articles…) redeviennent celles du {fmtDateTime(p.at)}, sur tous les appareils reliés au cloud. Les {acts.length} action(s) faites depuis sont perdues et devront être ressaisies si elles étaient justes.</p><p className="small">Un nouveau point « avant de revenir » est créé d’abord : vous pourrez annuler ce retour.</p></div>}
        onConfirm={async () => { await restoreToPoint(p.id); toast('Données remises au point choisi'); onClose(); }} />}
    </Modal>
  );
}

function RestoreFileModal({ onClose, onReady }: { onClose: () => void; onReady: (p: { label: string; data: Record<string, BaseRecord[]> }) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [pwd, setPwd] = useState('');
  const [needPwd, setNeedPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return;
    file.text().then((t) => { try { setNeedPwd(!!JSON.parse(t).encrypted); } catch { setError("Ce fichier n'est pas une sauvegarde Trésor en ligne."); } });
  }, [file]);
  return (
    <Modal title="Restaurer depuis un fichier" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button disabled={!file || (needPwd && !pwd)} onClick={async () => {
          try {
            let r;
            try { r = await readBackup(file!, pwd || undefined); }
            catch (e1) {
              // Le mot de passe de connexion peut aussi servir : il débloque le mot de passe des sauvegardes.
              if (!needPwd || !backupKey()) throw e1;
              let unlocked: string;
              try { unlocked = await unlockBackupPassword(pwd); } catch { throw e1; }
              r = await readBackup(file!, unlocked);
            }
            onReady({ label: `la sauvegarde du ${fmtDateTime(r.meta.createdAt)} (${r.meta.company})`, data: r.data });
          }
          catch (e: any) { setError(e.message); }
        }}>Continuer</Button></>}>
      <div className="stack">
        <div className="field"><label htmlFor="bk-file">Fichier .tsena<Req /></label><input id="bk-file" type="file" accept=".tsena,application/json" onChange={(e) => { setError(null); setFile(e.target.files?.[0] ?? null); }} /></div>
        {needPwd && <PasswordField label="Mot de passe des sauvegardes (ou votre mot de passe de connexion)" required value={pwd} onChange={setPwd} />}
        {error && <div className="notice notice-danger"><Icon name="alert" /><span>{error}</span></div>}
      </div>
    </Modal>
  );
}

function RestoreConfirm({ pick, onClose }: { pick: { label: string; data: Record<string, BaseRecord[]> }; onClose: () => void }) {
  const [mode, setMode] = useState<'replace' | 'merge'>('replace');
  const counts = Object.entries(pick.data).map(([t, rows]) => `${rows.filter((r) => !r.deleted).length} ${t}`).join(', ');
  const there = dataStats(pick.data), here = dataStats();
  const small = here.total > 50 && there.total < here.total * 0.8;
  return (
    <Confirm title="Confirmer la restauration" danger confirmLabel="Restaurer" typeToConfirm="RESTAURER" onClose={onClose}
      onConfirm={async () => { await restoreBackup(pick.data, mode, pick.label); toast('Restauration terminée'); }}
      message={
        <div className="stack">
          <p>Vous allez restaurer {pick.label}.</p>
          <p className="small muted">Contenu : {counts}.</p>
          <p className="small">Cette sauvegarde : {statsText(there)}.<br />Aujourd’hui : {statsText(here)}.</p>
          {small && <p className="small" style={{ color: 'var(--danger)' }}><strong>Attention : cette sauvegarde contient beaucoup moins de données qu’aujourd’hui.</strong> Elle a sans doute été faite par un appareil pas encore synchronisé. Choisissez plutôt « Fusionner », ou une autre copie.</p>}
          <SelectField label="Méthode" value={mode} onChange={(v) => setMode(v as any)} options={[
            { value: 'replace', label: 'Remplacer : revenir exactement à la sauvegarde' },
            { value: 'merge', label: 'Fusionner : ajouter ce qui manque, garder le reste' },
          ]} />
          <p className="small">La restauration est envoyée à tous les appareils reliés au cloud.</p>
        </div>
      } />
  );
}

/** Historique de synchronisation de cet appareil : envois, réceptions, conflits, erreurs. */
function SyncHistoryCard() {
  const log = useMeta<SyncLogLine[]>('syncLog', []);
  const [all, setAll] = useState(false);
  const shown = all ? log : log.slice(0, 8);
  return (
    <div className="card stack-s">
      <div><h3>Historique de synchronisation</h3><p className="small muted">Ce que cet appareil a envoyé et reçu (seulement quand il y avait quelque chose).</p></div>
      {log.length === 0 ? <p className="small muted">Rien pour l’instant.</p> : (
        <ul className="list">{shown.map((l, i) => (
          <li key={i} className="list-item" style={{ padding: '8px 4px' }}>
            <span className="small num" style={{ minWidth: 120 }}>{fmtDateTime(l.at)}</span>
            <span className="list-item-main small">{l.error ? <span className="neg">Échec : {l.error}</span> : <>{l.sent} envoyé(s), {l.received} reçu(s){l.conflicts ? <>, <strong className="neg">{l.conflicts} conflit(s)</strong></> : ', 0 conflit'}</>}</span>
          </li>
        ))}</ul>
      )}
      {log.length > 8 && <button type="button" className="link-btn" style={{ paddingLeft: 0 }} onClick={() => setAll(!all)}>{all ? 'Voir moins' : `Voir tout (${log.length})`}</button>}
    </div>
  );
}

/** Vérifie tout de suite s'il existe une version plus récente en ligne, l'installe et recharge l'application. */
async function checkNow() {
  if (isAndroidApp()) {
    toast('Recherche d’une mise à jour…', 'info');
    const r = await checkForUpdate();
    if (r === 'none') toast('Vous avez déjà la dernière version', 'info');
    else if (r === 'ready') { toast('Nouvelle version téléchargée : redémarrage…', 'info'); setTimeout(() => void applyPendingUpdate(), 1200); }
    else if (r === 'shell') toast(`Une nouvelle version de l'application est à installer : ${DOWNLOAD_PAGE}`, 'info');
    else toast('Pas de connexion : impossible de chercher une mise à jour', 'error');
    return;
  }
  if (/Electron/.test(navigator.userAgent)) { toast('Les mises à jour arrivent toutes seules : elles s’installent au prochain démarrage du logiciel.', 'info'); return; }
  try {
    const v = await (await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' })).json();
    if (!v?.built || v.built === __BUILD_DATE__) { toast('Vous avez déjà la dernière version', 'info'); return; }
    toast('Nouvelle version trouvée : installation…', 'info');
    const reg = await navigator.serviceWorker?.getRegistration();
    if (!reg) { location.reload(); return; }
    await reg.update();
    const sw = reg.waiting ?? reg.installing;
    if (!sw) { location.reload(); return; }
    if (sw.state === 'installed') { sw.postMessage('skipWaiting'); return; }
    sw.addEventListener('statechange', () => { if (sw.state === 'installed') sw.postMessage('skipWaiting'); else if (sw.state === 'redundant') location.reload(); });
  } catch { toast('Pas de connexion : impossible de chercher une mise à jour', 'error'); }
}

/** Version de l'application et réparation de la synchronisation (onglets Cloud et Système). */
function VersionAndResync() {
  const [resyncOpen, setResyncOpen] = useState(false);
  return (
    <>
      <div className="card stack">
        <div><h3>Version</h3><p className="small muted">Trésor en ligne {__APP_VERSION__} — construite le {fmtDateTime(__BUILD_DATE__)}.</p></div>
        <div className="row">
          <Button variant="ghost" icon="refresh" onClick={checkNow}>Chercher une mise à jour</Button>
        </div>
      </div>
      <div className="card stack">
        <div><h3>Réparer la synchronisation</h3><Help>Retélécharge toutes les données du cloud et renvoie toutes celles de cet appareil. À utiliser si un appareil semble ne pas avoir les mêmes données que les autres.</Help></div>
        <div><Button variant="ghost" icon="refresh" onClick={() => setResyncOpen(true)}>Tout resynchroniser</Button></div>
      </div>
      {resyncOpen && <Confirm title="Tout resynchroniser" confirmLabel="Lancer" onClose={() => setResyncOpen(false)}
        message={<p>Toutes les données vont être échangées à nouveau avec le cloud. Cela peut prendre une minute.</p>}
        onConfirm={async () => {
          if (!getCloud()) throw new Error("Cet appareil n'est pas relié au cloud.");
          await requeueAll();
          await setMeta('lastRev', 0);
          await syncNow();
          await audit('Système', 'Resynchronisation complète');
          toast('Resynchronisation terminée');
        }} />}
    </>
  );
}

function SystemTab() {
  const [resetOpen, setResetOpen] = useState(false);
  return (
    <div className="stack">
      <VersionAndResync />
      <ClearDataCard />
      <div className="card stack" style={{ borderColor: 'var(--danger)' }}>
        <div><h3>Remettre à l'état d'origine</h3><Help>Efface toutes les données et tous les comptes sur tous les appareils, et remet le compte super-admin avec son mot de passe d'origine. Une sauvegarde est faite juste avant.</Help></div>
        <div><Button variant="danger" icon="trash" onClick={() => setResetOpen(true)}>Remettre à l'état d'origine</Button></div>
      </div>
      {resetOpen && <Confirm title="Remettre à l'état d'origine" danger confirmLabel="Tout effacer" typeToConfirm="EFFACER" onClose={() => setResetOpen(false)}
        message={<div className="stack-s"><p><strong>Cette action efface tout</strong> : utilisateurs, paramètres et toutes les données, sur tous les appareils reliés.</p><p className="small muted">Un fichier de sauvegarde est téléchargé juste avant{getMeta('cloud', null) ? ' et une copie est faite dans le cloud' : ''}.</p></div>}
        onConfirm={async () => { await factoryReset(); }} />}
    </div>
  );
}
