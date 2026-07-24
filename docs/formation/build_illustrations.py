# -*- coding: utf-8 -*-
"""
Génère des illustrations schématiques (mockups) des écrans décrits dans le
guide de formation. Ce ne sont PAS de vraies captures d'écran de
l'application — chaque image est étiquetée "ILLUSTRATION SCHÉMATIQUE".
Sortie : SVG (pour le web) + PNG (pour Word/PDF), dans docs/formation/screenshots/.
"""
import os
import html

OUTDIR = os.path.join(os.path.dirname(__file__), "screenshots")
os.makedirs(OUTDIR, exist_ok=True)

BLUE = "#1F4E79"
BLUE_LIGHT = "#DDEBF7"
BLUE_DARK = "#16385A"
GOLD = "#B7950B"
GOLD_LIGHT = "#FDEBD0"
INK = "#1A2430"
INK_SOFT = "#4A5568"
INK_FAINT = "#8592A3"
BORDER = "#D8DEE6"
BG = "#F7F8FA"
WHITE = "#FFFFFF"
GREEN = "#2E7D46"

W, H = 900, 560

def esc(s):
    return html.escape(str(s), quote=True)

def chrome(url):
    """Browser top chrome bar with fake traffic lights + url."""
    return f'''
  <rect x="0" y="0" width="{W}" height="34" rx="10" fill="#E4E7EC"/>
  <rect x="0" y="12" width="{W}" height="22" fill="#E4E7EC"/>
  <circle cx="18" cy="17" r="5" fill="#FF5F57"/>
  <circle cx="36" cy="17" r="5" fill="#FEBC2E"/>
  <circle cx="54" cy="17" r="5" fill="#28C840"/>
  <rect x="80" y="7" width="380" height="20" rx="10" fill="#FFFFFF" stroke="#CCD3DC"/>
  <text x="96" y="21" font-family="Consolas, monospace" font-size="11" fill="{INK_FAINT}">{esc(url)}</text>
'''

def watermark():
    return f'''
  <rect x="0" y="{H-30}" width="{W}" height="30" fill="#FFF7E6"/>
  <text x="{W/2}" y="{H-11}" font-family="Segoe UI, Arial" font-size="11" font-weight="700"
        fill="#8A6D1A" text-anchor="middle" letter-spacing="0.06em">
    ILLUSTRATION SCHÉMATIQUE — NE REPRÉSENTE PAS UNE CAPTURE RÉELLE DE L'APPLICATION
  </text>
'''

def field(x, y, w, label, value="", h=34):
    out = f'<text x="{x}" y="{y-6}" font-family="Segoe UI, Arial" font-size="11" fill="{INK_SOFT}">{esc(label)}</text>'
    out += f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{WHITE}" stroke="{BORDER}"/>'
    if value:
        out += f'<text x="{x+12}" y="{y+h/2+4}" font-family="Segoe UI, Arial" font-size="12.5" fill="{INK}">{esc(value)}</text>'
    return out

def button(x, y, w, h, label, primary=True):
    fill = BLUE if primary else WHITE
    txt = WHITE if primary else BLUE
    stroke = BLUE
    out = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="7" fill="{fill}" stroke="{stroke}"/>'
    out += f'<text x="{x+w/2}" y="{y+h/2+4}" font-family="Segoe UI, Arial" font-size="12.5" font-weight="600" fill="{txt}" text-anchor="middle">{esc(label)}</text>'
    return out

def checkbox(x, y, label, checked=False):
    box = f'<rect x="{x}" y="{y}" width="16" height="16" rx="3" fill="{BLUE if checked else WHITE}" stroke="{BLUE}"/>'
    if checked:
        box += f'<path d="M{x+3} {y+8} l4 4 l7 -8" stroke="white" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
    box += f'<text x="{x+24}" y="{y+13}" font-family="Segoe UI, Arial" font-size="12" fill="{INK}">{esc(label)}</text>'
    return box

def breadcrumb(x, y, steps, active_idx):
    out = ""
    cx = x
    for i, s in enumerate(steps):
        color = BLUE if i <= active_idx else INK_FAINT
        weight = "700" if i == active_idx else "400"
        out += f'<circle cx="{cx}" cy="{y}" r="9" fill="{BLUE if i <= active_idx else WHITE}" stroke="{BLUE if i<=active_idx else BORDER}"/>'
        out += f'<text x="{cx}" y="{y+4}" font-family="Segoe UI" font-size="10" fill="{"white" if i<=active_idx else INK_FAINT}" text-anchor="middle">{i+1}</text>'
        out += f'<text x="{cx+16}" y="{y+4}" font-family="Segoe UI" font-size="11.5" font-weight="{weight}" fill="{color}">{esc(s)}</text>'
        cx += 24 + len(s) * 7 + 30
        if i < len(steps) - 1:
            out += f'<line x1="{cx-30}" y1="{y}" x2="{cx-6}" y2="{y}" stroke="{BORDER}" stroke-width="2"/>'
    return out

def svg_header(title):
    return f'''<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg">
  <title>{esc(title)}</title>
  <rect x="0" y="0" width="{W}" height="{H}" fill="{WHITE}" stroke="{BORDER}"/>
'''

def svg_footer():
    return "</svg>"

def save(name, content):
    path = os.path.join(OUTDIR, f"{name}.svg")
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return path


# ---------------------------------------------------------------
# PUBLIC / ONBOARDING CARD LAYOUT
# ---------------------------------------------------------------

def public_card(title, url, body_svg, breadcrumb_steps=None, active_idx=0):
    s = svg_header(title)
    s += chrome(url)
    s += f'<rect x="0" y="34" width="{W}" height="{H-64}" fill="{BG}"/>'
    card_x, card_y, card_w, card_h = 140, 74, W - 280, H - 150
    s += f'<rect x="{card_x}" y="{card_y}" width="{card_w}" height="{card_h}" rx="14" fill="{WHITE}" stroke="{BORDER}"/>'
    s += f'<rect x="{card_x}" y="{card_y}" width="{card_w}" height="6" rx="3" fill="{BLUE}"/>'
    s += f'<text x="{card_x+30}" y="{card_y+42}" font-family="Georgia, serif" font-size="19" font-weight="700" fill="{INK}">{esc(title)}</text>'
    if breadcrumb_steps:
        s += breadcrumb(card_x + 30, card_y + 68, breadcrumb_steps, active_idx)
    s += body_svg
    s += watermark()
    s += svg_footer()
    return s


# ---------------------------------------------------------------
# ADMIN LAYOUT (sidebar + content)
# ---------------------------------------------------------------

SIDEBAR_SECTIONS = [
    ("Vue d'ensemble", ["Tableau de bord", "Analytiques"]),
    ("Gestion Académique", ["Admissions", "Élèves", "Enseignants", "Notes"]),
    ("Structure", ["Années académiques", "Trimestres", "Niveaux", "Classes", "Matières", "Campus", "Départements"]),
    ("Planification", ["Emploi du temps", "Calendrier"]),
    ("Présences", ["Badges", "Présence en direct"]),
    ("Finances", ["Finances", "Inventaire"]),
    ("Administration", ["Utilisateurs", "Paramètres"]),
]

def admin_shell(title, url, active_section, active_item, content_svg, tenant="Lycée Excellence de Conakry"):
    s = svg_header(title)
    s += chrome(url)
    sidebar_w = 210
    s += f'<rect x="0" y="34" width="{sidebar_w}" height="{H-34}" fill="{WHITE}" stroke="{BORDER}"/>'
    s += f'<rect x="0" y="34" width="{sidebar_w}" height="46" fill="{BLUE_DARK}"/>'
    s += f'<text x="16" y="63" font-family="Georgia, serif" font-size="13" font-weight="700" fill="white">{esc(tenant)}</text>'
    y = 96
    for sec, items in SIDEBAR_SECTIONS:
        is_active_sec = sec == active_section
        s += f'<text x="16" y="{y}" font-family="Segoe UI" font-size="9.5" font-weight="700" letter-spacing="0.05em" fill="{INK_FAINT}">{esc(sec.upper())}</text>'
        y += 16
        for it in items:
            is_active = is_active_sec and it == active_item
            if is_active:
                s += f'<rect x="8" y="{y-12}" width="{sidebar_w-16}" height="20" rx="5" fill="{BLUE_LIGHT}"/>'
            color = BLUE if is_active else INK_SOFT
            weight = "700" if is_active else "400"
            s += f'<text x="20" y="{y+2}" font-family="Segoe UI" font-size="10.5" font-weight="{weight}" fill="{color}">{esc(it)}</text>'
            y += 20
        y += 6
        if y > H - 20:
            break
    # content area
    cx = sidebar_w
    cw = W - sidebar_w
    s += f'<rect x="{cx}" y="34" width="{cw}" height="{H-34}" fill="{BG}"/>'
    s += f'<rect x="{cx}" y="34" width="{cw}" height="44" fill="{WHITE}" stroke="{BORDER}"/>'
    crumb = f"{active_section} / {active_item}"
    s += f'<text x="{cx+24}" y="61" font-family="Segoe UI" font-size="13" font-weight="700" fill="{INK}">{esc(active_item)}</text>'
    s += f'<text x="{W-24}" y="61" font-family="Segoe UI" font-size="10" fill="{INK_FAINT}" text-anchor="end">{esc(crumb)}</text>'
    s += content_svg
    s += watermark()
    s += svg_footer()
    return s

def table_block(x, y, w, headers, rows, col_widths=None, row_h=30, header_h=32):
    n = len(headers)
    if not col_widths:
        col_widths = [w / n] * n
    out = f'<rect x="{x}" y="{y}" width="{w}" height="{header_h}" fill="{BLUE}"/>'
    cx = x
    for i, htext in enumerate(headers):
        out += f'<text x="{cx+12}" y="{y+header_h/2+4}" font-family="Segoe UI" font-size="10.5" font-weight="700" fill="white">{esc(htext)}</text>'
        cx += col_widths[i]
    ry = y + header_h
    for ridx, row in enumerate(rows):
        rowfill = WHITE if ridx % 2 == 0 else "#F0F3F7"
        out += f'<rect x="{x}" y="{ry}" width="{w}" height="{row_h}" fill="{rowfill}" stroke="{BORDER}" stroke-width="0.5"/>'
        cx = x
        for i, cell in enumerate(row):
            out += f'<text x="{cx+12}" y="{ry+row_h/2+4}" font-family="Segoe UI" font-size="10.5" fill="{INK}">{esc(cell)}</text>'
            cx += col_widths[i]
        ry += row_h
    out += f'<rect x="{x}" y="{y}" width="{w}" height="{ry-y}" fill="none" stroke="{BORDER}"/>'
    return out

def kpi_card(x, y, w, h, label, value, color=BLUE):
    out = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{WHITE}" stroke="{BORDER}"/>'
    out += f'<rect x="{x}" y="{y}" width="5" height="{h}" rx="2" fill="{color}"/>'
    out += f'<text x="{x+18}" y="{y+24}" font-family="Segoe UI" font-size="10" fill="{INK_FAINT}">{esc(label)}</text>'
    out += f'<text x="{x+18}" y="{y+h-14}" font-family="Georgia, serif" font-size="22" font-weight="700" fill="{INK}">{esc(value)}</text>'
    return out


illustrations = {}

# ---------------- 1. Inscription ----------------
body = ""
body += field(170, 172, 460, "Nom de l'établissement *", "Lycée Excellence de Conakry")
body += field(170, 236, 300, "Type d'établissement *", "Lycée ▾")
body += field(490, 236, 140, "Pays *", "🇬🇳 Guinée")
body += button(170, 300, 140, 40, "Continuer")
illustrations["01-inscription"] = public_card(
    "Créer votre établissement", "app.schoolflow.pro/inscription", body,
    breadcrumb_steps=["Votre établissement", "Votre compte", "Confirmation"], active_idx=0,
)

# ---------------- 2. Onboarding — Identité ----------------
body = ""
body += field(170, 174, 460, "Nom de l'école", "Lycée Excellence de Conakry")
body += field(170, 238, 300, "Devise principale", "Franc Guinéen (GNF FG) ▾")
body += button(170, 300, 120, 40, "Suivant")
illustrations["02-onboarding-identite"] = public_card(
    "Configuration de l'Établissement", "app.schoolflow.pro/lycee-excellence/admin/onboarding", body,
    breadcrumb_steps=["Identité", "Niveaux", "Matières", "Signature"], active_idx=0,
)

# ---------------- 3. Onboarding — Niveaux ----------------
body = '<text x="170" y="168" font-family="Segoe UI" font-size="12" fill="' + INK_SOFT + '">Quels cycles d’enseignement proposez-vous ?</text>'
cycles = ["Maternelle (PS, MS, GS)", "Primaire (CP, CE1, CE2, CM1, CM2)", "Collège (6ème, 5ème, 4ème, 3ème)", "Lycée (2nde, 1ère, Terminale)", "Université (Licence, Master, Doctorat)"]
y = 190
for i, c in enumerate(cycles):
    body += checkbox(170, y, c, checked=(i == 3))
    y += 30
body += button(170, y + 14, 120, 40, "Suivant")
illustrations["03-onboarding-niveaux"] = public_card(
    "Structure Pédagogique", "app.schoolflow.pro/lycee-excellence/admin/onboarding", body,
    breadcrumb_steps=["Identité", "Niveaux", "Matières", "Signature"], active_idx=1,
)

# ---------------- 4. Onboarding — Matières ----------------
body = '<text x="170" y="168" font-family="Segoe UI" font-size="12" fill="' + INK_SOFT + '">Sélectionnez les matières principales enseignées.</text>'
subjects = ["Mathématiques", "Français", "Anglais", "Histoire-Géo", "SVT", "Physique-Chimie", "EPS", "Arts Plastiques"]
y = 192
col2_x = 420
for i, s in enumerate(subjects):
    xx = 170 if i < 4 else col2_x
    yy = 192 + (i % 4) * 30
    body += checkbox(xx, yy, s, checked=(i < 3))
body += button(170, 330, 120, 40, "Suivant")
illustrations["04-onboarding-matieres"] = public_card(
    "Matières Enseignées", "app.schoolflow.pro/lycee-excellence/admin/onboarding", body,
    breadcrumb_steps=["Identité", "Niveaux", "Matières", "Signature"], active_idx=2,
)

# ---------------- 5. Onboarding — Signature ----------------
body = field(170, 176, 460, "Nom du Directeur / Responsable", "Aissatou Diallo")
body += f'<text x="170" y="250" font-family="Segoe UI" font-size="11" fill="{INK_SOFT}">Signature manuscrite</text>'
body += f'<rect x="170" y="256" width="460" height="110" rx="8" fill="{WHITE}" stroke="{BORDER}" stroke-dasharray="4,3"/>'
body += f'<path d="M195 330 C 230 290, 260 350, 300 310 S 360 280, 400 320 S 460 300, 500 315" stroke="{BLUE}" stroke-width="2.5" fill="none" stroke-linecap="round"/>'
body += button(170, 386, 100, 34, "Effacer", primary=False)
body += button(400, 440, 160, 42, "Terminer")
illustrations["05-onboarding-signature"] = public_card(
    "Signature & Engagement", "app.schoolflow.pro/lycee-excellence/admin/onboarding", body,
    breadcrumb_steps=["Identité", "Niveaux", "Matières", "Signature"], active_idx=3,
)

# ---------------- 6. Dashboard ----------------
content = ""
kpis = [("Élèves Inscrits", "612"), ("Candidatures", "18"), ("Factures en attente", "42"), ("Taux présence (30j)", "94%")]
kx = SIDEBAR_SECTIONS and 234
for i, (lab, val) in enumerate(kpis):
    content += kpi_card(234 + i * 165, 96, 150, 76, lab, val, color=[BLUE, GOLD, "#C0392B", GREEN][i])
content += f'<rect x="234" y="192" width="330" height="200" rx="10" fill="{WHITE}" stroke="{BORDER}"/>'
content += f'<text x="250" y="216" font-family="Segoe UI" font-size="11.5" font-weight="700" fill="{INK}">Effectifs par niveau</text>'
bar_vals = [40, 70, 55, 90, 60]
for i, v in enumerate(bar_vals):
    content += f'<rect x="{260+i*55}" y="{372-v}" width="34" height="{v}" rx="3" fill="{BLUE}" opacity="0.8"/>'
content += f'<rect x="580" y="192" width="290" height="200" rx="10" fill="{WHITE}" stroke="{BORDER}"/>'
content += f'<text x="596" y="216" font-family="Segoe UI" font-size="11.5" font-weight="700" fill="{INK}">Présences (30 derniers jours)</text>'
content += f'<circle cx="725" cy="300" r="60" fill="none" stroke="{BORDER}" stroke-width="18"/>'
content += f'<circle cx="725" cy="300" r="60" fill="none" stroke="{GREEN}" stroke-width="18" stroke-dasharray="320 377" transform="rotate(-90 725 300)"/>'
content += f'<text x="725" y="306" font-family="Georgia" font-size="20" font-weight="700" fill="{INK}" text-anchor="middle">94%</text>'
illustrations["06-dashboard"] = admin_shell(
    "Tableau de bord", "app.schoolflow.pro/lycee-excellence/admin", "Vue d'ensemble", "Tableau de bord", content
)

# ---------------- 7-13. Structure académique screens ----------------
def structure_screen(fname, item, headers, rows, cta_label, note=None):
    content = table_block(234, 96, 636, headers, rows)
    content += button(234, 96 + 32 + len(rows) * 30 + 20, 220, 38, cta_label)
    if note:
        content += f'<text x="234" y="{96 + 32 + len(rows)*30 + 84}" font-family="Segoe UI" font-size="10.5" fill="{INK_FAINT}">{esc(note)}</text>'
    illustrations[fname] = admin_shell(item, f"app.schoolflow.pro/lycee-excellence/admin/{fname.split('-',1)[1]}", "Structure", item, content)

structure_screen(
    "07-structure-annees", "Années académiques",
    ["Année", "Début", "Fin", "Statut"],
    [["2025-2026", "01/09/2025", "30/06/2026", "Archivée"], ["2026-2027", "01/09/2026", "30/06/2027", "★ Courante"]],
    "+ Nouvelle année académique",
)
structure_screen(
    "08-structure-trimestres", "Trimestres",
    ["Période", "Début", "Fin"],
    [["Trimestre 1", "01/09/2026", "20/12/2026"], ["Trimestre 2", "05/01/2027", "28/03/2027"], ["Trimestre 3", "12/04/2027", "30/06/2027"]],
    "+ Nouveau trimestre",
    note="Vue université : Semestre 1 / Semestre 2 à la place des 3 trimestres.",
)
structure_screen(
    "09-structure-niveaux", "Niveau",
    ["Niveau", "Cycle", "Effectif"],
    [["6ème", "Collège", "84"], ["5ème", "Collège", "79"], ["2nde", "Lycée", "112"], ["Terminale", "Lycée", "96"]],
    "+ Nouveau niveau",
)
structure_screen(
    "10-structure-classes", "Classe",
    ["Classe", "Niveau", "Capacité"],
    [["6ème A", "6ème", "40"], ["6ème B", "6ème", "42"], ["Terminale D", "Terminale", "38"]],
    "+ Nouvelle classe",
)
structure_screen(
    "11-structure-matieres", "Matières",
    ["Matière", "Coefficient", "Enseignant(s)"],
    [["Mathématiques", "5", "M. Camara"], ["Français", "4", "Mme Baldé"], ["Physique-Chimie", "3", "M. Sylla"]],
    "+ Nouvelle matière",
)
structure_screen(
    "12-structure-campus", "Campus",
    ["Campus", "Adresse", "Classes rattachées"],
    [["Campus Principal", "Conakry, Kaloum", "18"], ["Annexe Ratoma", "Conakry, Ratoma", "6"]],
    "+ Nouveau campus",
)
structure_screen(
    "13-structure-departements", "Départements",
    ["Département", "Responsable", "Enseignants"],
    [["Département Scientifique", "M. Sylla", "9"], ["Département Littéraire", "Mme Baldé", "7"]],
    "+ Nouveau département",
    note="Vue université : Département d'Informatique, de Droit, de Médecine…",
)

# ---------------- 14. Gestion académique — Élèves ----------------
content = f'<rect x="234" y="96" width="636" height="34" rx="7" fill="{WHITE}" stroke="{BORDER}"/>'
content += f'<text x="246" y="118" font-family="Segoe UI" font-size="11" fill="{INK_FAINT}">🔍 Rechercher un élève…</text>'
content += f'<rect x="750" y="96" width="120" height="34" rx="7" fill="{BLUE_LIGHT}" stroke="{BLUE}"/>'
content += f'<text x="810" y="118" font-family="Segoe UI" font-size="10.5" fill="{BLUE_DARK}" text-anchor="middle">Filtre : Terminale D</text>'
content += table_block(234, 144, 636, ["Nom", "Classe", "Statut", "Contact parent"],
                        [["Diallo Aissatou", "Terminale D", "Actif", "622 00 11 22"],
                         ["Bah Mamadou", "Terminale D", "Actif", "628 33 44 55"],
                         ["Camara Fatoumata", "Terminale D", "Actif", "620 66 77 88"]])
illustrations["14-gestion-eleves"] = admin_shell(
    "Élèves", "app.schoolflow.pro/lycee-excellence/admin/students", "Gestion Académique", "Élèves", content
)

# ---------------- 15. Planification — Emploi du temps ----------------
content = f'<text x="234" y="112" font-family="Segoe UI" font-size="11.5" font-weight="700" fill="{INK}">Classe : Terminale D — Semaine du 12/01/2027</text>'
days = ["Lun", "Mar", "Mer", "Jeu", "Ven"]
gx, gy, cw, rh = 234, 130, 120, 40
content += f'<rect x="{gx-70}" y="{gy}" width="70" height="{rh}" fill="{BLUE_DARK}"/>'
for i, d in enumerate(days):
    content += f'<rect x="{gx+i*cw}" y="{gy}" width="{cw}" height="{rh}" fill="{BLUE}"/>'
    content += f'<text x="{gx+i*cw+cw/2}" y="{gy+rh/2+4}" font-family="Segoe UI" font-size="11" font-weight="700" fill="white" text-anchor="middle">{esc(d)}</text>'
slots = ["8h-9h", "9h-10h", "10h-11h", "11h-12h"]
courses = {
    (0,0): ("Maths", BLUE_LIGHT), (0,1): ("Physique", GOLD_LIGHT), (0,3): ("Français", BLUE_LIGHT),
    (1,1): ("Anglais", GOLD_LIGHT), (1,2): ("SVT", BLUE_LIGHT), (2,0): ("Maths", BLUE_LIGHT),
    (3,2): ("Histoire", GOLD_LIGHT), (4,1): ("EPS", BLUE_LIGHT), (4,3): ("Philo", GOLD_LIGHT),
}
for r, s in enumerate(slots):
    yy = gy + rh + r * rh
    content += f'<rect x="{gx-70}" y="{yy}" width="70" height="{rh}" fill="{WHITE}" stroke="{BORDER}"/>'
    content += f'<text x="{gx-62}" y="{yy+rh/2+4}" font-family="Segoe UI" font-size="10" fill="{INK_FAINT}">{esc(s)}</text>'
    for c in range(5):
        xx = gx + c * cw
        content += f'<rect x="{xx}" y="{yy}" width="{cw}" height="{rh}" fill="{WHITE}" stroke="{BORDER}"/>'
        if (c, r) in courses:
            label, fill = courses[(c, r)]
            content += f'<rect x="{xx+4}" y="{yy+4}" width="{cw-8}" height="{rh-8}" rx="4" fill="{fill}"/>'
            content += f'<text x="{xx+cw/2}" y="{yy+rh/2+4}" font-family="Segoe UI" font-size="10" fill="{INK}" text-anchor="middle">{esc(label)}</text>'
illustrations["15-planification-edt"] = admin_shell(
    "Emploi du temps", "app.schoolflow.pro/lycee-excellence/admin/schedule", "Planification", "Emploi du temps", content
)

# ---------------- 16. Présences en direct ----------------
content = ""
kpis = [("Présents", "540", GREEN), ("Absents", "58", "#C0392B"), ("Retards", "14", GOLD)]
for i, (lab, val, col) in enumerate(kpis):
    content += kpi_card(234 + i * 216, 96, 200, 76, lab, val, color=col)
content += table_block(234, 192, 636, ["Élève", "Classe", "Heure de scan", "Statut"],
                        [["Diallo Aissatou", "Terminale D", "07:58", "✔ Présent"],
                         ["Bah Mamadou", "6ème A", "08:12", "⚠ Retard"],
                         ["Camara Fatoumata", "5ème B", "—", "✘ Absent"]])
illustrations["16-presences-direct"] = admin_shell(
    "Présence en direct", "app.schoolflow.pro/lycee-excellence/admin/live-attendance", "Présences", "Présence en direct", content
)

# ---------------- 17. Finances — Facture ----------------
content = field(234, 118, 300, "Élève", "Diallo Aissatou — Terminale D")
content += field(550, 118, 220, "Type de frais", "Mensualité — Janvier")
content += f'<text x="234" y="188" font-family="Segoe UI" font-size="11" fill="{INK_SOFT}">Suggestions de frais</text>'
content += f'<rect x="234" y="196" width="150" height="30" rx="15" fill="{BLUE_LIGHT}" stroke="{BLUE}"/>'
content += f'<text x="309" y="216" font-family="Segoe UI" font-size="10.5" fill="{BLUE_DARK}" text-anchor="middle">Frais d’inscription</text>'
content += f'<rect x="394" y="196" width="130" height="30" rx="15" fill="{WHITE}" stroke="{BORDER}"/>'
content += f'<text x="459" y="216" font-family="Segoe UI" font-size="10.5" fill="{INK_SOFT}" text-anchor="middle">Cantine</text>'
content += field(234, 250, 220, "Montant (GNF)", "350 000 GNF")
content += button(234, 314, 160, 40, "Émettre la facture")
content += button(410, 314, 190, 40, "Encaisser un paiement", primary=False)
illustrations["17-finances-facture"] = admin_shell(
    "Finances", "app.schoolflow.pro/lycee-excellence/admin/finances", "Finances", "Finances", content
)

# ---------------- 18. Communication — Annonces ----------------
content = field(234, 118, 636, "Titre de l'annonce", "Réunion parents-professeurs — Trimestre 2")
content += f'<text x="234" y="182" font-family="Segoe UI" font-size="11" fill="{INK_SOFT}">Message</text>'
content += f'<rect x="234" y="188" width="636" height="90" rx="6" fill="{WHITE}" stroke="{BORDER}"/>'
content += f'<text x="248" y="212" font-family="Segoe UI" font-size="11" fill="{INK_SOFT}">La réunion parents-professeurs du 2e trimestre se tiendra le...</text>'
content += field(234, 300, 300, "Public ciblé", "Toutes les classes ▾")
content += button(234, 366, 160, 40, "Publier l'annonce")
illustrations["18-communication-annonces"] = admin_shell(
    "Annonces", "app.schoolflow.pro/lycee-excellence/admin/announcements", "Administration", "Utilisateurs", content
)

# ---------------- 19. Administration — Paramètres ----------------
content = field(234, 118, 300, "Nom de l'établissement", "Lycée Excellence de Conakry")
content += field(234, 182, 300, "Langue par défaut", "Français ▾")
content += f'<text x="234" y="246" font-family="Segoe UI" font-size="11" fill="{INK_SOFT}">Couleur principale</text>'
for i, col in enumerate([BLUE, GOLD, GREEN, "#C0392B"]):
    content += f'<circle cx="{250+i*40}" cy="266" r="14" fill="{col}" stroke="{"black" if i==0 else "none"}"/>'
content += field(600, 118, 260, "Position du menu", "Gauche ▾")
content += button(234, 320, 160, 40, "Enregistrer")
illustrations["19-administration-parametres"] = admin_shell(
    "Paramètres", "app.schoolflow.pro/lycee-excellence/admin/settings", "Administration", "Paramètres", content
)

# ---------------- WRITE SVGs ----------------
paths = {}
for name, svg in illustrations.items():
    paths[name] = save(name, svg)

print(f"{len(paths)} illustrations SVG générées dans {OUTDIR}")

# ---------------- RASTERIZE TO PNG ----------------
from svglib.svglib import svg2rlg
from reportlab.graphics import renderPM

for name, path in paths.items():
    drawing = svg2rlg(path)
    png_path = path.replace(".svg", ".png")
    renderPM.drawToFile(drawing, png_path, fmt="PNG", dpi=150)

print("PNG générés.")
