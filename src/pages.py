# Pages publiques simples (D-112) : confidentialité et aide/contact, demandées par l'App Store.
# Elles reprennent l'en-tête, le pied de page et les styles de a-propos.html déjà construite.
import re
PAGE_CSS = """
.page{max-width:760px;margin:0 auto;padding:112px 24px 72px}
.page h1{font-stretch:75%;font-weight:800;font-size:clamp(38px,5vw,52px);line-height:1;margin:0 0 10px}
.page .lead{color:var(--muted);font-size:17px;margin:0 0 28px}
.page h2{font-size:20px;font-weight:800;margin:32px 0 8px}
.page p,.page li{font-size:16px;line-height:1.55}
.page ul{padding-left:20px;margin:8px 0}
.page li{margin:4px 0}
.page form{display:flex;flex-direction:column;gap:14px;margin-top:12px}
.page label{display:flex;flex-direction:column;gap:6px;font-weight:700;font-size:14px}
.page input,.page select,.page textarea{font:inherit;font-weight:400;font-size:16px;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--field);color:var(--ink)}
.page .hp{position:absolute;left:-9999px}
.page .msg{font-weight:700}
"""
def build_pages(a, root):
    head = a[:a.index('<main>')]
    foot = a[a.index('</main>'):]
    foot = re.sub(r"if \(matchMedia\('\(max-width: 760px\)'\)\.matches\) document\.querySelector\('\.map svg'\)[^\n]*\n", '', foot)
    foot = re.sub(r'// km markers appear[\s\S]*?\}\)\(\);\n', '', foot)
    head = head.replace('</style>', PAGE_CSS + '</style>', 1)
    def page(slug, title, body):
        h = re.sub(r'<title>[^<]*</title>', f'<title>Perfect Run · {title}</title>', head, count=1)
        h = h.replace('href="#fonctions"', 'href="a-propos.html#fonctions"').replace('href="#comment"', 'href="a-propos.html#comment"')
        (root / 'site' / f'{slug}.html').write_text(h + '<main class="page">\n' + body + '\n' + foot, encoding='utf-8')
    page('confidentialite', 'Confidentialité', """<h1>Confidentialité</h1>
<p class="lead">Perfect Run n’a pas de compte et ne garde rien sur un serveur. Cette page vaut pour le site perfectrun.fr et l’application iPhone. Mise à jour : 16 octobre 2026.</p>
<h2>Ce qui reste sur ton téléphone</h2>
<ul><li>Ta position, utilisée pour partir de là où tu es et pendant le suivi d’un parcours. Elle n’est jamais envoyée.</li><li>Tes sorties (« Mes parcours »), ton départ « Chez moi » et tes réglages.</li><li>Tes photos : l’image de ta sortie est créée dans le téléphone.</li></ul>
<h2>Ce qui quitte ton téléphone</h2>
<ul><li>« Signaler un problème » : ton message, ton e-mail si tu le donnes, et le parcours si tu le joins. Ils sont envoyés par e-mail à l’éditeur, via Cloudflare, et ne servent qu’à te répondre et à corriger l’app.</li><li>« Envoyer le parcours » : le lien contient le tracé, rien d’autre.</li><li>La recherche d’une adresse avec numéro (« 12 rue … ») : le texte tapé est envoyé au service d’adresses de l’IGN, sans ta position ni identifiant. Sans numéro, la recherche reste dans l’app.</li><li>La mesure d’audience : des compteurs anonymes (voir ci-dessous).</li></ul>
<h2>Mesure d’audience</h2>
<p>GoatCounter compte les visites et les actions (export, suivi, envoi…) sur le site et dans l’application, sans cookie, sans compte et sans te suivre d’un site ou d’une app à l’autre. Ta position, tes parcours et tes photos n’y sont jamais envoyés. Pas de publicité, pas de revente de données.</p>
<h2>Tes droits</h2>
<p>Dans l’application, tout s’efface avec « Effacer mes données » (menu, À propos) ou en supprimant l’app. Sur le site, tout s’efface en vidant les données de perfectrun.fr dans ton navigateur. Pour un message que tu as envoyé (accès, correction, suppression), écris via la page <a href="aide.html">Aide et contact</a>.</p>
<h2>Éditeur</h2>
<p>Antoine Mariotti, particulier. Site hébergé par Cloudflare, Inc., 101 Townsend Street, San Francisco, CA 94107, États-Unis.</p>""")
    page('aide', 'Aide et contact', """<h1>Aide et contact</h1>
<p class="lead">Une question, un passage impossible, une idée ? Écris ici : le message arrive directement à Antoine, l’auteur de Perfect Run.</p>
<h2>Questions fréquentes</h2>
<ul><li><b>Quelles villes ?</b> Paris, Lyon, Bordeaux et Nantes, avec leurs communes voisines.</li><li><b>Faut-il un compte ?</b> Non. Tout reste sur ton téléphone.</li><li><b>Le guidage marche-t-il écran verrouillé ?</b> Oui, dans l’application, si tu autorises la position « Toujours » pendant la course.</li><li><b>Un parcours passe par un endroit fermé ?</b> Les parcours sont indicatifs : respecte la signalisation et dis-le-nous ci-dessous, avec le kilomètre.</li><li><b>Effacer mes données ?</b> Menu, À propos, « Effacer mes données », ou supprime l’app. Voir aussi la page <a href="confidentialite.html">Confidentialité</a>.</li></ul>
<h2>Écrire à Perfect Run</h2>
<form id="contact">
<label>Sujet<select name="type"><option>Question</option><option>Passage impossible ou dangereux</option><option>Problème d’affichage ou bug</option><option>Idée d’amélioration</option><option>Autre</option></select></label>
<label>Message<textarea name="message" rows="5" required></textarea></label>
<label>Ton e-mail (facultatif, pour te répondre)<input type="email" name="email" autocomplete="email"></label>
<label class="hp" aria-hidden="true">Ne pas remplir<input name="bot-field" tabindex="-1" autocomplete="off"></label>
<button class="btn primary" type="submit">Envoyer</button>
<p class="msg" id="contact-msg" role="status"></p>
</form>
<script>
document.getElementById('contact').onsubmit = async e => {
  e.preventDefault(); const f = e.target, m = document.getElementById('contact-msg'), b = f.querySelector('button');
  const body = new URLSearchParams(new FormData(f)); body.set('page', location.href); b.disabled = true;
  try { const r = await fetch('/api/signalement', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }); if (!r.ok) throw new Error(r.status); f.reset(); m.textContent = 'Merci, ton message a bien été envoyé.'; }
  catch (err) { m.textContent = 'Envoi impossible pour le moment. Réessaie dans un instant.'; }
  finally { b.disabled = false; }
};
</script>""")
