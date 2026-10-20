// Langue de l'interface (français par défaut, anglais en option).
// Le logiciel est écrit en français ; en anglais, une couche de traduction remplace les textes affichés
// (écran, attributs d'accessibilité, titres, boîtes de dialogue) et ceux des impressions, fichiers Excel et messages,
// à partir d'un dictionnaire (lib/i18n/en.ts) : textes fixes et modèles avec trous ({0}, {1}…).
import { EN } from './i18n/en';

export type Lang = 'fr' | 'en';
const KEY = 'boutique.lang';
let lang: Lang = 'fr';

export const getLang = () => lang;
/** Format des nombres et dates selon la langue. */
export const loc = () => (lang === 'en' ? 'en-GB' : 'fr-FR');

export function initialLang(): Lang {
  try { const v = localStorage.getItem(KEY); if (v === 'fr' || v === 'en') return v; } catch { /* */ }
  return 'fr'; // français par défaut ; l'anglais se choisit sur l'écran d'activation ou dans Paramètres → Apparence
}

// ---------- Dictionnaire ----------
const norm = (s: string) => s.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
const exact = new Map<string, string>();
const patterns: { re: RegExp; out: string; sep: boolean }[] = [];
const memo = new Map<string, string>();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let built = false;
function build() {
  if (built) return; built = true;
  for (const [fr, en] of Object.entries(EN)) {
    if (!en) continue;
    const k = norm(fr);
    const holes = /\{\d+\}/.test(k);
    if (fr === en) {
      // Modèle identique dans les deux langues (« {0} — {1} ») : gardé seulement s'il n'est fait que de séparateurs,
      // pour traduire chaque morceau ; un texte fixe identique n'a pas besoin d'entrée.
      if (!holes || /[A-Za-zÀ-ÿ]/.test(k.replace(/\{\d+\}/g, '')) || !/\S/.test(k.replace(/\{\d+\}/g, ''))) continue;
    }
    if (holes) {
      // « Montant ({0}) » → /^Montant \((.+?)\)$/ ; les trous sont repris dans l'ordre de la traduction.
      // Un trou collé à une lettre (« compte{1} », « enregistré{1} ») n'est qu'une terminaison courte (s, e, x…).
      const parts = k.split(/\{(\d+)\}/);
      let src = '^';
      for (let i = 0; i < parts.length; i++) {
        if (i % 2 === 0) { src += esc(parts[i]); continue; }
        const glued = /[A-Za-zÀ-ÿ]$/.test(parts[i - 1]) || /^[A-Za-zÀ-ÿ]/.test(parts[i + 1] ?? '');
        // « {0} articles », « {0} vente(s) » : le trou est un nombre.
        const count = !glued && i === 1 && parts[0] === '' && /^ [a-zà-ÿ]+(\(s\)|s|x)(?=[\s.,·)]|$)/.test(parts[i + 1] ?? '');
        src += glued ? '(\\S{0,3}?)' : count ? '([\\d\\s.,−-]+?)' : '([\\s\\S]*?)';
      }
      src += '$';
      const order = k.match(/\{(\d+)\}/g)!.map((x) => Number(x.slice(1, -1)));
      const out = en.replace(/\{(\d+)\}/g, (_, n) => `\u0000${order.indexOf(Number(n)) + 1}\u0000`);
      // Modèle fait seulement de séparateurs (« {0} — {1} », « {0} : {1} ») : traduit les morceaux, en dernier recours.
      const sep = !/[A-Za-zÀ-ÿ]/.test(k.replace(/\{\d+\}/g, ''));
      patterns.push({ re: new RegExp(src), out, sep });
    } else exact.set(k, en);
  }
  patterns.sort((a, b) => b.re.source.length - a.re.source.length); // les modèles les plus précis d'abord
}

/** Traduit un texte (s'il est connu) ; sinon le rend tel quel. Garde les espaces autour. */
export function tr(s: string): string {
  if (lang === 'fr' || !s || !/[A-Za-zÀ-ÿ]/.test(s)) return s;
  build();
  const k = norm(s);
  const lead = s.match(/^\s*/)![0], trail = s.match(/\s*$/)![0];
  const hit = exact.get(k);
  if (hit != null) return lead + hit + trail;
  const cached = memo.get(k);
  if (cached != null) return cached === k ? s : lead + cached + trail;
  // Tous les modèles qui conviennent sont essayés ; on garde celui qui laisse le moins de texte non traduit
  // (à égalité : un vrai modèle plutôt qu'un simple découpage sur les séparateurs, puis le plus précis).
  let res = k, bestLeft = Infinity, bestSep = true;
  for (const p of patterns) {
    const m = p.re.exec(k);
    if (!m) continue;
    let left = 0;
    const out = p.out.replace(/\u0000(\d+)\u0000/g, (_, i) => {
      const part = m[Number(i)] ?? ''; const t = tr(part);
      if (t === part && /[A-Za-zÀ-ÿ]{2}/.test(part)) left += part.length;
      return t;
    });
    if (out === k) continue;
    if (p.sep && left >= k.replace(/[^A-Za-zÀ-ÿ]/g, '').length) continue; // découpage qui ne traduit rien
    if (left < bestLeft || (left === bestLeft && bestSep && !p.sep)) { res = out; bestLeft = left; bestSep = p.sep; if (!left && !p.sep) break; }
  }
  if (memo.size > 20000) memo.clear();
  memo.set(k, res);
  return res === k ? s : lead + res + trail;
}
/** Libellé éventuellement suivi d'un nombre entre parenthèses : « Livraisons (3) ». */
function trLabel(s: string) {
  const t = tr(s);
  if (t !== s) return t;
  const m = /^(.*?)\s*\(([^()]*)\)$/.exec(s);
  if (m) { const b = tr(m[1]); if (b !== m[1]) return `${b} (${tr(m[2])})`; }
  return s;
}
/** Une ligne de message : puces et gras WhatsApp (*…*) gardés, « Libellé : valeur » traduit morceau par morceau. */
function trLine(line: string) {
  const m = /^([\s*_•·>–\-━\p{Extended_Pictographic}\u{FE0F}]*)(.*?)([\s*_━]*)$/u.exec(line)!;
  const [, pre, core, post] = m;
  if (!core) return line;
  // « Libellé : valeur » : d'abord le libellé seul (la valeur est souvent un montant ou un nom).
  const i = core.indexOf(' : ');
  if (i > 0) {
    const label = core.slice(0, i), lab = trLabel(label);
    if (lab !== label) return `${pre}${lab}: ${tr(core.slice(i + 3))}${post}`;
  }
  const t = tr(line);
  if (t !== line) return t;
  const c = tr(core);
  return c !== core ? pre + c + post : i > 0 ? `${pre}${core.slice(0, i)}: ${tr(core.slice(i + 3))}${post}` : pre + trLabel(core) + post;
}
/** Traduit un texte de plusieurs lignes (messages WhatsApp, impressions) ligne par ligne. */
export const trLines = (s: string) => (lang === 'fr' ? s : s.split('\n').map(trLine).join('\n'));

// ---------- Traduction de l'écran ----------
const ATTRS = ['placeholder', 'aria-label', 'title', 'alt', 'data-label'];
const original = new WeakMap<Node, string>();         // texte français d'origine de chaque nœud traduit
const originalAttr = new WeakMap<Element, Record<string, string>>();
let observer: MutationObserver | null = null;

function translateText(n: Text) {
  const cur = n.data;
  const prev = original.get(n);
  // React a remis un texte (français) : on le reprend comme nouvel original.
  const fr = prev != null && cur === tr(prev) ? prev : cur;
  original.set(n, fr);
  const en = tr(fr);
  if (en !== cur) n.data = en;
}
function translateAttrs(el: Element) {
  let saved = originalAttr.get(el);
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v == null) continue;
    const prev = saved?.[a];
    const fr = prev != null && v === tr(prev) ? prev : v;
    (saved ??= {})[a] = fr;
    const en = tr(fr);
    if (en !== v) el.setAttribute(a, en);
  }
  if (saved) originalAttr.set(el, saved);
}
function translateTree(root: Node) {
  if (root.nodeType === 3) { translateText(root as Text); return; }
  if (root.nodeType !== 1) return;
  const el = root as Element;
  if (el.closest('[data-no-translate], textarea, script, style, [contenteditable="true"]')) return;
  translateAttrs(el);
  const w = (el.ownerDocument || document).createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeType === 1 && (n as Element).matches('[data-no-translate], textarea, script, style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let n: Node | null;
  while ((n = w.nextNode())) { if (n.nodeType === 3) translateText(n as Text); else translateAttrs(n as Element); }
}
/** Traduit un autre document (impression A4 dans un cadre) — sans effet en français. */
export function translateDom(root: Element) { if (lang === 'en') { translateTree(root); root.ownerDocument.documentElement.lang = 'en'; } }
/** Remet le français partout (passage de l'anglais au français sans recharger). */
function restoreTree(root: Element) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = w.nextNode())) {
    if (n.nodeType === 3) { const fr = original.get(n); if (fr != null) (n as Text).data = fr; }
    else { const s = originalAttr.get(n as Element); if (s) for (const [a, v] of Object.entries(s)) (n as Element).setAttribute(a, v); }
  }
}

let titleFr = '';
function translateTitle() { const t = document.title; if (t !== tr(titleFr)) titleFr = t; const en = tr(titleFr); if (en !== t) document.title = en; }

export function setLang(l: Lang) {
  lang = l;
  try { localStorage.setItem(KEY, l); } catch { /* */ }
  document.documentElement.lang = l;
  observer?.disconnect(); observer = null;
  if (l === 'fr') { restoreTree(document.body); if (titleFr) document.title = titleFr; return; }
  translateTree(document.body); translateTitle();
  observer = new MutationObserver((list) => {
    observer!.disconnect();
    for (const m of list) {
      if (m.type === 'characterData') translateText(m.target as Text);
      else if (m.type === 'attributes') translateAttrs(m.target as Element);
      else m.addedNodes.forEach((n) => translateTree(n));
    }
    translateTitle();
    observer!.observe(document.body, OBS);
    observer!.observe(document.head, { childList: true, subtree: true, characterData: true });
  });
  observer.observe(document.body, OBS);
  observer.observe(document.head, { childList: true, subtree: true, characterData: true });
}
const OBS: MutationObserverInit = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS };

/** Boîtes de dialogue du navigateur (confirmation, alerte) traduites aussi. */
export function patchDialogs() {
  const w = window as any;
  const c = w.confirm?.bind(w), a = w.alert?.bind(w), p = w.prompt?.bind(w);
  if (c) w.confirm = (m?: string) => c(m == null ? m : trLines(String(m)));
  if (a) w.alert = (m?: string) => a(m == null ? m : trLines(String(m)));
  if (p) w.prompt = (m?: string, d?: string) => p(m == null ? m : trLines(String(m)), d);
}
