// Choix de la langue de l'interface, propre à cet appareil.
import { chooseLang, getLang, LANGS } from '../lib/i18n';

export function LangPicker({ compact }: { compact?: boolean }) {
  const cur = getLang();
  return (
    <div className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: compact ? 'center' : undefined }} data-no-translate role="group" aria-label="Langue / Language">
      {LANGS.filter((l) => !l.soon).map((l) => (
        <button key={l.id} type="button" lang={l.id} className={`btn ${cur === l.id ? 'btn-primary' : 'btn-ghost'}${compact ? ' btn-sm' : ''}`} aria-pressed={cur === l.id}
          onClick={() => { if (l.id !== cur) chooseLang(l.id); }}>
          {l.label}
        </button>
      ))}
    </div>
  );
}
