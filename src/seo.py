# Référencement (bilan SEO du 2/11) : titres et descriptions propres à chaque page, adresse canonique,
# bannière App Store (Safari sur iPhone), données structurées, sitemap.xml et robots.txt.
import html, json, re, datetime
APP_ID = '6820428780'
SITE = 'https://perfectrun.fr'

def _set(h, pat, new, count=1):
    out, n = re.subn(pat, lambda m: new, h, count=count)
    assert n, pat
    return out

def seo_pass(root, stats):
    villes = stats['CITIES_ET']
    pages = {
        'index.html': ('/', 'Parcours de course sur mesure en ville · PerfectRun',
                       f'Ton parcours de course sur mesure à {villes} : boucle ou trajet, distance, dénivelé, moins de feux. Gratuit, sans compte.',
                       f'PerfectRun · Ton parcours de course à {villes}'),
        'a-propos.html': ('/a-propos', 'Comment ça marche · PerfectRun',
                          'Comment PerfectRun trace tes parcours de course : moins de feux rouges, parcs et quais, dénivelé choisi, fontaines, parcours mythiques, guidage vocal.',
                          'Comment PerfectRun trace ton parcours de course'),
        'aide.html': ('/aide', 'Aide et contact · PerfectRun',
                      'Questions fréquentes sur PerfectRun (villes, compte, guidage écran verrouillé, effacer ses données) et formulaire pour écrire à l’auteur.',
                      'Aide et contact · PerfectRun'),
        'confidentialite.html': ('/confidentialite', 'Confidentialité · PerfectRun',
                                 'PerfectRun n’a pas de compte et ne garde rien sur un serveur : ta position et tes sorties restent sur ton téléphone. Ce qui est mesuré, et tes droits.',
                                 'Confidentialité · PerfectRun'),
        'app.html': ('/app', 'Créer un parcours de course · PerfectRun',
                     'Crée ton parcours de course en quelques secondes : boucle ou trajet, distance, dénivelé, moins de feux, parcs. Exporte-le en GPX ou suis-le avec le guidage.',
                     'Un parcours de course PerfectRun'),
    }
    for f, (path, title, desc, ogt) in pages.items():
        p = root / 'site' / f
        h = p.read_text(encoding='utf-8')
        e = lambda s: html.escape(s, quote=True)
        h = _set(h, r'<title>[^<]*</title>', f'<title>{e(title)}</title>')
        h = _set(h, r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{e(desc)}">')
        tags = [f'<link rel="canonical" href="{SITE}{path}">', f'<meta name="apple-itunes-app" content="app-id={APP_ID}">']
        if 'property="og:title"' in h:
            h = _set(h, r'<meta property="og:title" content="[^"]*">', f'<meta property="og:title" content="{e(ogt)}">')
            h = _set(h, r'<meta property="og:description" content="[^"]*">', f'<meta property="og:description" content="{e(desc)}">')
            h = _set(h, r'<meta property="og:url" content="[^"]*">', f'<meta property="og:url" content="{SITE}{path}">')
        else:  # l'app web : aperçu des liens longs envoyés avant les liens courts
            tags += [f'<meta property="og:title" content="{e(ogt)}">', f'<meta property="og:description" content="{e(desc)}">', '<meta property="og:type" content="website">',
                     f'<meta property="og:url" content="{SITE}{path}">', f'<meta property="og:image" content="{SITE}/og.jpg">', '<meta property="og:locale" content="fr_FR">', '<meta name="twitter:card" content="summary_large_image">']
        ld = None
        if f == 'index.html':
            ld = {'@context': 'https://schema.org', '@graph': [
                {'@type': 'WebSite', 'name': 'PerfectRun', 'url': SITE + '/', 'inLanguage': 'fr'},
                {'@type': 'MobileApplication', 'name': 'PerfectRun', 'operatingSystem': 'iOS', 'applicationCategory': 'HealthApplication',
                 'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'EUR'}, 'downloadUrl': f'https://apps.apple.com/fr/app/id{APP_ID}',
                 'installUrl': f'https://apps.apple.com/fr/app/id{APP_ID}', 'url': SITE + '/', 'inLanguage': 'fr', 'description': desc,
                 'author': {'@type': 'Person', 'name': 'Antoine Mariotti'}}]}
        if f == 'aide.html':  # questions fréquentes de la page d'aide
            sec = h[h.index('Questions fréquentes'):]; sec = sec[:sec.index('</ul>')]
            qa = []
            for li in re.findall(r'<li><b>(.*?)</b>(.*?)</li>', sec, re.S):
                q, a = (re.sub(r'<[^>]+>', '', html.unescape(x)).strip() for x in li)
                qa.append({'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}})
            if qa: ld = {'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': qa}
        if ld: tags.append('<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False).replace('</', '<\\/') + '</script>')
        h = h.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n' + '\n'.join(tags), 1)
        p.write_text(h, encoding='utf-8')
    today = datetime.date.today().isoformat()
    urls = ''.join(f'<url><loc>{SITE}{path}</loc><lastmod>{today}</lastmod></url>' for path, *_ in pages.values())
    (root / 'site' / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + urls + '</urlset>\n', encoding='utf-8')
    (root / 'site' / 'robots.txt').write_text(f'User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n', encoding='utf-8')
