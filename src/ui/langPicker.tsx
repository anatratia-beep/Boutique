// Choix de la langue de l'interface (français / anglais), propre à cet appareil.
import { getLang, setLang, type Lang } from '../lib/i18n';

const LANGS: { id: Lang; label: string }[] = [
  { id: 'fr', label: 'Français' },
  { id: 'en', label: 'English' },
];

export function LangPicker({ compact }: { compact?: boolean }) {
  const cur = getLang();
  return (
    <div className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: compact ? 'center' : undefined }} data-no-translate role="group" aria-label={cur === 'en' ? 'Language' : 'Langue'}>
      {LANGS.map((l) => (
        <button key={l.id} type="button" className={`btn ${cur === l.id ? 'btn-primary' : 'btn-ghost'}${compact ? ' btn-sm' : ''}`} aria-pressed={cur === l.id}
          onClick={() => { if (l.id === cur) return; setLang(l.id); location.reload(); }}>
          {l.label}
        </button>
      ))}
    </div>
  );
}
