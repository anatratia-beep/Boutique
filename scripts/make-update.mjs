// Prépare la mise à jour automatique à partir de dist/ (utilisé par GitHub Actions) :
//   out/web-<version>.json : tous les fichiers du logiciel (encodés en base64) ;
//   out/update.json        : version, adresse du paquet et signature.
// Le paquet est signé avec la clé privée des mises à jour (secret UPDATE_SIGNING_KEY, format PEM) :
// les applications vérifient la signature avec la clé publique avant d'installer quoi que ce soit.
// Usage : APP_VERSION=1.0.12 DOWNLOAD_REPO=owner/repo UPDATE_SIGNING_KEY="$(cat cle.pem)" node scripts/make-update.mjs [dist] [out]
import { createPrivateKey, sign } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// Version de la « coquille » (application Android / Windows / Mac) nécessaire pour ce paquet.
// À augmenter seulement si le logiciel a besoin d'une nouvelle installation complète.
export const SHELL = 1;

const dist = process.argv[2] || 'dist';
const out = process.argv[3] || 'out';
const version = process.env.APP_VERSION;
const repo = process.env.DOWNLOAD_REPO;
const pem = process.env.UPDATE_SIGNING_KEY;
if (!version || !repo || !pem) { console.error('APP_VERSION, DOWNLOAD_REPO et UPDATE_SIGNING_KEY sont nécessaires.'); process.exit(1); }

const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = {};
for (const f of walk(dist).sort()) {
  const rel = relative(dist, f).split(sep).join('/');
  if (/^assets\/app-[A-Z0-9]+\.(js|css)$/.test(rel)) continue; // anciens noms gardés pour le site web seulement
  files[rel] = readFileSync(f).toString('base64');
}
const name = `web-${version}.json`;
const body = Buffer.from(JSON.stringify({ version, shell: SHELL, files }), 'utf8');
const sig = sign('sha256', body, { key: createPrivateKey(pem), dsaEncoding: 'ieee-p1363' }).toString('base64url');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, name), body);
writeFileSync(join(out, 'update.json'), JSON.stringify({
  version, shell: SHELL, built: new Date().toISOString(),
  url: `https://github.com/${repo}/releases/download/v${version}/${name}`, sig,
}, null, 1));
console.log(`Mise à jour ${version} : ${Object.keys(files).length} fichiers, ${(body.length / 1e6).toFixed(1)} Mo`);
