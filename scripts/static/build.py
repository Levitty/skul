"""Build the marketing site as plain files for shared hosting.

Input: the rendered markup captured from the running site (mk.html,
mk-class.html, boards.json). Output: a folder that can be uploaded as-is to
any web host's document root, and a zip of the same.

    SITE_URL=https://<host> python3 scripts/static/build.py <capture-dir> <out-dir> [app-url] [whatsapp] [email]

app-url is where "Sign in" should go (the Tutagora app); until it is known
the link points at "#". whatsapp (international format, digits only) and
email replace the placeholders in app/(marketing)/contact.ts.
"""
import json
import os
import re
import shutil
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MK = os.path.join(ROOT, "app", "(marketing)")
HERE = os.path.dirname(os.path.abspath(__file__))

cap = sys.argv[1]
out = sys.argv[2]
app = sys.argv[3].rstrip("/") if len(sys.argv) > 3 and sys.argv[3] != "-" else ""
whatsapp = sys.argv[4] if len(sys.argv) > 4 else ""
email = sys.argv[5] if len(sys.argv) > 5 else ""
PLACEHOLDER_WA = "254759240692"
PLACEHOLDER_MAIL = "consulting@tutagora.com"

SITE = os.environ.get("SITE_URL", "https://tutagora.com").rstrip("/")
TITLE = "Tutagora · School management software for Kenyan schools"
DESC = "School management system for private schools in Kenya. Fees on M-Pesa, parents on WhatsApp, HR and payroll, report cards and the books, on one record for the whole school."
CLASS_TITLE = "The class · How Tutagora runs a school as one record"
CLASS_DESC = "Nine short periods on how a school runs as one record: the learner at the centre, fees collected on M-Pesa, parents reached on WhatsApp, staff and payroll, and a Monday briefing for the director."
KEYWORDS = "school management system Kenya, school management software Kenya, school fees management software, M-Pesa school fees, school ERP Kenya, parent communication WhatsApp school, school HR and payroll software, report card software Kenya, private school software Nairobi"


def links(html):
    html = re.sub(r'<div class="mk[^"]*">', '<div class="mk">', html, 1)
    html = html.replace('href="/class"', 'href="/class/"')
    if app:
        html = html.replace('href="/login"', f'href="{app}/"').replace('href="/signup"', f'href="{app}/"')
    else:
        html = html.replace('href="/login"', 'href="#"').replace('href="/signup"', 'href="#"')
    if whatsapp:
        html = html.replace(PLACEHOLDER_WA, whatsapp)
    if email:
        html = html.replace(PLACEHOLDER_MAIL, email).replace(PLACEHOLDER_MAIL.replace("@", "&#x40;"), email)
    return html


def page(title, desc, path, body, scripts):
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="keywords" content="{KEYWORDS}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<link rel="canonical" href="{SITE}{path}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Tutagora">
<meta property="og:locale" content="en_KE">
<meta property="og:url" content="{SITE}{path}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="{SITE}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Tutagora. Manage your school with confidence.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{desc}">
<meta name="twitter:image" content="{SITE}/og.png">
<meta name="theme-color" content="#0b0b0b">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-icon.svg">
<link rel="preload" href="/assets/fonts/Geist-Variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
{body}
{''.join(f'<script src="/assets/{s}"></script>' for s in scripts)}
</body>
</html>
"""


css = open(os.path.join(MK, "marketing.css")).read()
site_css = """@font-face{font-family:"Geist";font-style:normal;font-weight:300 700;font-display:swap;src:url(/assets/fonts/Geist-Variable.woff2) format("woff2")}
@font-face{font-family:"Caveat";font-style:normal;font-weight:400 700;font-display:swap;src:url(/assets/fonts/Caveat-Variable.woff2) format("woff2")}
html{color-scheme:dark}
body{margin:0;background:#0b0b0b;color:#f2f2f0}
.mk{--font-geist:"Geist";--font-hand:"Caveat"}
.mk h1,.mk h2,.mk h3,.mk p{margin-top:0}
.mk ul,.mk ol{margin:0;padding:0}
""" + css

home = links(open(os.path.join(cap, "mk.html")).read())
klass = links(open(os.path.join(cap, "mk-class.html")).read())
boards = open(os.path.join(cap, "boards.json")).read()
class_js = open(os.path.join(HERE, "class.js")).read().replace("__BOARDS__", boards)

shutil.rmtree(out, ignore_errors=True)
os.makedirs(os.path.join(out, "assets", "fonts"))
os.makedirs(os.path.join(out, "class"))
open(os.path.join(out, "assets", "site.css"), "w").write(site_css)
open(os.path.join(out, "assets", "board.js"), "w").write(open(os.path.join(HERE, "board.js")).read())
open(os.path.join(out, "assets", "home.js"), "w").write(open(os.path.join(HERE, "home.js")).read())
open(os.path.join(out, "assets", "class.js"), "w").write(class_js)
for f in ("Geist-Variable.woff2", "Caveat-Variable.woff2"):
    shutil.copy(os.path.join(MK, "fonts", f), os.path.join(out, "assets", "fonts", f))
for f in ("icon.svg", "apple-icon.svg", "og.png"):
    shutil.copy(os.path.join(ROOT, "public", f), os.path.join(out, f))
today = __import__("datetime").date.today().isoformat()
open(os.path.join(out, "sitemap.xml"), "w").write(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    f'<url><loc>{SITE}/</loc><lastmod>{today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>\n'
    f'<url><loc>{SITE}/class/</loc><lastmod>{today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>\n'
    "</urlset>\n"
)
open(os.path.join(out, "robots.txt"), "w").write(f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n")
open(os.path.join(out, "index.html"), "w").write(page(TITLE, DESC, "/", home, ["board.js", "home.js"]))
open(os.path.join(out, "class", "index.html"), "w").write(page(CLASS_TITLE, CLASS_DESC, "/class/", klass, ["board.js", "class.js"]))

zip_path = out.rstrip("/") + ".zip"
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
    for d, _, fs in os.walk(out):
        for f in fs:
            p = os.path.join(d, f)
            z.write(p, os.path.relpath(p, out))
total = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(out) for f in fs)
print("built", out, f"{total/1024:.0f} KB", "zip", zip_path, f"{os.path.getsize(zip_path)/1024:.0f} KB")
