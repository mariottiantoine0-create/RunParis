// Copie le site (../site) dans www/ pour l'application iPhone (D-85).
// L'app ouvre directement app.html (pas d'accueil) ; la police Archivo est embarquée pour marcher hors connexion.
const fs = require('fs'), path = require('path');
const SITE = path.join(__dirname, '..', 'site'), WWW = path.join(__dirname, 'www');
fs.rmSync(WWW, { recursive: true, force: true }); fs.mkdirSync(path.join(WWW, 'fonts'), { recursive: true });
const DATA = ['meta.json', 'graph.bin', 'green.txt', 'races.json', 'sights.json', 'metro.json', 'trees.txt', 'fountains.json', 'parks.json', 'dark.txt', 'private.txt'];
for (const f of DATA) fs.copyFileSync(path.join(SITE, f), path.join(WWW, f));
for (const f of fs.readdirSync(path.join(__dirname, 'fonts'))) fs.copyFileSync(path.join(__dirname, 'fonts', f), path.join(WWW, 'fonts', f));
let html = fs.readFileSync(path.join(SITE, 'app.html'), 'utf8');
const FACE = `<style>
@font-face{font-family:'Archivo';src:url(fonts/archivo-latin-wdth-normal.woff2) format('woff2');font-weight:100 900;font-stretch:62% 125%;font-display:swap;unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:'Archivo';src:url(fonts/archivo-latin-ext-wdth-normal.woff2) format('woff2');font-weight:100 900;font-stretch:62% 125%;font-display:swap;unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
</style>`;
html = html.replace(/<link rel="preconnect"[^>]*>\s*/g, '').replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/, FACE);
if (/fonts\.googleapis/.test(html)) throw new Error('lien Google Fonts restant');
fs.writeFileSync(path.join(WWW, 'index.html'), html);
console.log('www prêt :', fs.readdirSync(WWW).length, 'fichiers');
