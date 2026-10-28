// Écran d'activation (licence) et rappel avant expiration.
import { useEffect, useState } from 'react';
import { activate, applyLicenseName, deviceCode, frDate, licenseHeartbeat, licenseState, VENDOR_CONTACT, VENDOR_WHATSAPP, type LicenseState } from '../lib/license';
import { Button } from '../ui/kit';
import { Icon } from '../ui/icons';
import { AuthShell } from './Auth';
import { LangPicker } from '../ui/langPicker';

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* */ }
  try {
    const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
    const ok = document.execCommand('copy'); t.remove(); return ok;
  } catch { return false; }
}

export function DeviceCodeBox({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const text = `Code appareil : ${code}`;
    if ((navigator as any).share) { try { await (navigator as any).share({ text }); return; } catch { /* annulé */ } }
    if (await copy(code)) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };
  return (
    <div className="licence-code">
      <span className="small muted">Votre code appareil</span>
      <strong data-testid="device-code">{code}</strong>
      <div className="row" style={{ justifyContent: 'center' }}>
        <Button variant="ghost" type="button" icon="check" onClick={async () => { if (await copy(code)) { setCopied(true); setTimeout(() => setCopied(false), 2000); } }}>{copied ? 'Copié' : 'Copier'}</Button>
        {(navigator as any).share && <Button variant="ghost" type="button" icon="share" onClick={share}>Envoyer</Button>}
      </div>
    </div>
  );
}

export function ActivationScreen({ initial, onDone }: { initial: LicenseState; onDone: () => void }) {
  const [code, setCode] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initial.ok ? null : initial.message || null);
  useEffect(() => { void deviceCode().then(setCode); }, []);
  const expired = !initial.ok && initial.reason === 'expired';
  return (
    <AuthShell>
      <LangPicker compact />
      <div className="stack-s">
        <h2>{expired ? 'Licence expirée' : 'Activation'}</h2>
        <p className="muted">Ce logiciel est réservé aux clients ayant acheté une licence.</p>
      </div>
      <ol className="licence-steps small">
        <li>Envoyez ce <strong>code appareil</strong> au vendeur{VENDOR_CONTACT ? <> ({VENDOR_CONTACT})</> : null}.</li>
        <li>Collez ci-dessous la <strong>clé de licence</strong> reçue, puis touchez « Activer ».</li>
      </ol>
      {!initial.ok && initial.reason === 'revoked' && <div className="notice notice-danger"><Icon name="alert" /><span>{initial.message}</span></div>}
      {code && <DeviceCodeBox code={code} />}
      {code && VENDOR_WHATSAPP && (
        <a className="btn btn-ghost btn-block" href={`https://wa.me/${VENDOR_WHATSAPP}?text=${encodeURIComponent(`Bonjour, je souhaite ${expired ? 'renouveler' : 'activer'} ma licence Boutique. Mon code appareil : ${code}`)}`} target="_blank" rel="noopener">
          <Icon name="share" size={18} /><span>Envoyer le code par WhatsApp</span>
        </a>
      )}
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError(null);
        const s = await activate(key);
        setBusy(false);
        if (s.ok) onDone(); else setError(s.message);
      }}>
        <div className="field">
          <label htmlFor="licence-key">Clé de licence</label>
          <textarea id="licence-key" rows={4} value={key} onChange={(e) => setKey(e.target.value)} placeholder="BTQ-…" autoCapitalize="none" autoCorrect="off" spellCheck={false} style={{ fontFamily: 'ui-monospace, monospace', fontSize: '.8rem', wordBreak: 'break-all' }} />
        </div>
        {error && <div className="notice notice-danger"><Icon name="alert" /><span>{error}</span></div>}
        <Button type="submit" busy={busy} block icon="key" disabled={!key.trim()}>{busy ? 'Activation…' : 'Activer'}</Button>
      </form>
      <p className="small muted">Licence 1 appareil : Internet n'est pas nécessaire. Licence multi-appareils : Internet est nécessaire pour activer chaque appareil, puis pour synchroniser.</p>
    </AuthShell>
  );
}

/** Bandeau discret dans les 7 derniers jours d'une licence à durée limitée (vérifié toutes les heures). */
export function LicenseWatch() {
  const [s, setS] = useState<LicenseState | null>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const run = async () => {
      if ((await licenseHeartbeat()) === 'revoked') { location.reload(); return; }
      const st = await licenseState();
      if (!st.ok) { location.reload(); return; } // expirée pendant l'utilisation : retour à l'écran d'activation
      setS(st);
    };
    void run();
    const t = setInterval(run, 3600_000);
    return () => clearInterval(t);
  }, []);
  if (!s || !s.ok || s.daysLeft === null || s.daysLeft > 7 || hidden) return null;
  return (
    <div className="licence-bar" role="status">
      <Icon name="clock" size={18} />
      <span>{s.daysLeft === 0 ? 'Votre licence expire ce soir.' : `Votre licence expire dans ${s.daysLeft} jour${s.daysLeft > 1 ? 's' : ''} (${frDate(s.info.expires)}).`} Contactez le vendeur pour la renouveler.</span>
      <button className="icon-btn" aria-label="Masquer" onClick={() => setHidden(true)}><Icon name="x" size={16} /></button>
    </div>
  );
}

/** Carte « Licence » dans les paramètres : état, code appareil, remplacement de la clé. */
export function LicenseCard() {
  const [s, setS] = useState<LicenseState | null>(null);
  const [code, setCode] = useState('');
  const [key, setKey] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { void licenseState().then(setS); void deviceCode().then(setCode); }, []);
  return (
    <div className="card stack">
      <div>
        <h2>Licence</h2>
        {s?.ok && <p className="small">
          Client : <strong>{s.info.client || '—'}</strong><br />
          {s.info.version === 2 ? <>Offre multi-appareils : <strong>{s.info.seats} appareil{s.info.seats > 1 ? 's' : ''}</strong>, <strong>{s.info.users ? `${s.info.users} compte${s.info.users > 1 ? 's' : ''}` : 'comptes illimités'}</strong>, synchronisés<br /></> : <>Offre 1 appareil, hors ligne<br /></>}
          {s.info.expires ? <>Valable jusqu'au <strong>{frDate(s.info.expires)}</strong>{s.daysLeft !== null && <> ({s.daysLeft} jour{s.daysLeft > 1 ? 's' : ''} restant{s.daysLeft > 1 ? 's' : ''})</>}</> : <>Licence <strong>à vie</strong></>}
          {s.info.id && <><br /><span className="muted">N° {s.info.id}</span></>}
        </p>}
      </div>
      {code && <DeviceCodeBox code={code} />}
      <form className="stack-s" onSubmit={async (e) => {
        e.preventDefault();
        setMsg({ ok: true, text: 'Vérification…' });
        const r = await activate(key);
        if (r.ok) { setS(r); setKey(''); await applyLicenseName(); setMsg({ ok: true, text: 'Nouvelle clé enregistrée.' }); }
        else setMsg({ ok: false, text: r.message });
      }}>
        <div className="field">
          <label htmlFor="licence-new">Renouveler ou changer d'offre : coller la nouvelle clé</label>
          <textarea id="licence-new" rows={3} value={key} onChange={(e) => setKey(e.target.value)} placeholder="BTQ-…" spellCheck={false} style={{ fontFamily: 'ui-monospace, monospace', fontSize: '.8rem', wordBreak: 'break-all' }} />
        </div>
        {msg && <div className={`notice ${msg.ok ? 'notice-ok' : 'notice-danger'}`}><Icon name={msg.ok ? 'check' : 'alert'} /><span>{msg.text}</span></div>}
        <div><Button type="submit" icon="key" disabled={!key.trim()}>Enregistrer la clé</Button></div>
      </form>
    </div>
  );
}
