// Liste les textes d'interface du code qui n'ont pas encore de traduction anglaise dans public/i18n/<langue>.json.
// Usage : node scripts/i18n-missing.cjs [src] [langue]   (nécessite le paquet « typescript »)
// Les textes affichés sont relevés grâce à l'analyseur TypeScript (chaînes, modèles `…${x}…` → {0}, textes JSX).
const ts = require('typescript');
const fs = require('fs'); const path = require('path');
const ROOT = process.argv[2] || require('path').join(__dirname, '..', 'src');
const SKIP = new Set(['changelog.ts', 'i18n.ts', 'en.ts']);
const FRW = /\b(de|la|le|les|des|du|à|et|en|par|pour|sur|avec|une|un|pas|ne|aucun|aucune|au|aux|ce|cette|ces|son|sa|ses|vos|votre|est|sont|ou|dans|plus|tout|tous|ici|déjà)\b/i;
// Attributs JSX qui ne sont pas du texte affiché.
const NON_TEXT_ATTRS = new Set(['className', 'key', 'type', 'id', 'htmlFor', 'role', 'name', 'inputMode', 'autoComplete', 'variant', 'icon', 'tone', 'href', 'rel', 'target', 'value', 'mode', 'accept', 'pattern', 'src', 'method', 'list', 'dir', 'lang', 'step', 'min', 'max', 'autoCapitalize', 'autoCorrect', 'enterKeyHint', 'data-testid', 'form', 'sizes']);
function isUi(t) {
  const s = t.replace(/\{\d+\}/g, ' ').trim();
  if (s.length < 2 || !/[A-Za-zÀ-ÿ]{2}/.test(s)) return false;
  if (/^(https?:|#\/|\.{0,2}\/|data:|mailto:|tel:)/.test(s)) return false;
  if (/^[\w$.\-]+$/.test(s) && !/[À-ÿ]/.test(s)) return /^[A-ZÀ-Ý][a-zà-ÿ]/.test(s); // mot isolé avec majuscule
  if (/^[a-z0-9\-_ :./%()#,+*]+$/.test(s) && !FRW.test(s)) return false;  // classes CSS, clés, formats
  if (/^(\d|\s|[-+.,:;%()/])+$/.test(s)) return false;
  if (/\bvar\(--|^[a-z-]+:\s|rgba?\(|^#[0-9a-f]{3,8}$|\bfont:|\bpx\b.*;|^@/i.test(s)) return false;
  return true;
}
const texts = {};
const add = (t, f) => { t = t.replace(/\s+/g, ' ').trim(); if (isUi(t) && !(t in texts)) texts[t] = f; };
function tmpl(node) {
  // Modèle : partie fixe + trous ; un trou qui est lui-même un modèle ou une chaîne est extrait à part.
  let out = node.head.text; node.templateSpans.forEach((sp, i) => { out += `{${i}}` + sp.literal.text; });
  return out;
}
function isNonUiContext(node) {
  const p = node.parent;
  if (!p) return false;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p)) return true;
  if (ts.isJsxAttribute(p) && NON_TEXT_ATTRS.has(p.name.getText())) return true;
  if (ts.isJsxExpression(p) && p.parent && ts.isJsxAttribute(p.parent) && NON_TEXT_ATTRS.has(p.parent.name.getText())) return true;
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true;
  if (ts.isPropertyAssignment(p) && p.name === node) return true;
  if (ts.isLiteralTypeNode(p)) return true;
  if (ts.isCallExpression(p) && /^(querySelector|querySelectorAll|getElementById|setMeta|getMeta|useMeta|useTable|all|get|save|addEventListener|removeEventListener|setItem|getItem|removeItem|setProperty|startsWith|endsWith|includes|split|join|replace|match|test|localeCompare|toLocaleString|toLocaleDateString|toLocaleTimeString|padStart|navigate|createElement|setAttribute|getAttribute|fetch|postMessage|indexOf)$/.test(p.expression.getText().split('.').pop())) return true;
  if (ts.isBinaryExpression(p) && /===|!==|==|!=/.test(p.operatorToken.getText())) return true;
  if (ts.isCaseClause(p)) return true;
  return false;
}
function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) { walk(full); continue; }
    if (!/\.(ts|tsx)$/.test(f) || SKIP.has(f)) continue;
    const rel = path.relative(ROOT, full);
    const sf = ts.createSourceFile(full, fs.readFileSync(full, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node) => {
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !isNonUiContext(node)) add(node.text, rel);
      else if (ts.isTemplateExpression(node) && !isNonUiContext(node)) add(tmpl(node), rel);
      else if (ts.isJsxText(node)) add(node.text, rel);
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
}
walk(ROOT);
const lang = process.argv[3] || 'en';
const EN = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'public', 'i18n', `${lang}.json`), 'utf8'));
const missing = Object.keys(texts).filter((k) => !(k in EN));
for (const k of missing) console.log(`${texts[k]}\t${k}`);
console.error(`${missing.length} texte(s) sans traduction (certains sont des noms de fichiers ou des clés d'import, à ignorer).`);
