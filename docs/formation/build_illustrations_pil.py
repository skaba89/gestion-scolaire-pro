# -*- coding: utf-8 -*-
"""
Génère les mêmes illustrations schématiques directement en PNG via Pillow
(pas de dépendance cairo). Utilisé pour l'insertion dans Word et PDF.
Les SVG (pour le web) sont déjà générés par build_illustrations.py.
"""
import os
from PIL import Image, ImageDraw, ImageFont

OUTDIR = os.path.join(os.path.dirname(__file__), "screenshots")
os.makedirs(OUTDIR, exist_ok=True)

SCALE = 2  # supersample for crisper text, then downscale
W, H = 900 * SCALE, 560 * SCALE

FONT_DIR = "C:/Windows/Fonts/"

def font(name, size):
    return ImageFont.truetype(FONT_DIR + name, int(size * SCALE))

F_UI = "segoeui.ttf"
F_UI_B = "segoeuib.ttf"
F_SERIF_B = "georgiab.ttf"
F_MONO = "consola.ttf" if os.path.exists(FONT_DIR + "consola.ttf") else "arial.ttf"

BLUE = (31, 78, 121)
BLUE_LIGHT = (221, 235, 247)
BLUE_DARK = (22, 56, 90)
GOLD = (183, 149, 11)
GOLD_LIGHT = (253, 235, 208)
INK = (26, 36, 48)
INK_SOFT = (74, 85, 104)
INK_FAINT = (133, 146, 163)
BORDER = (216, 222, 230)
BG = (247, 248, 250)
WHITE = (255, 255, 255)
GREEN = (46, 125, 70)
RED = (192, 57, 43)


def new_canvas():
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)
    return img, d


def s(v):
    return v * SCALE


def rrect(d, xy, radius, **kw):
    d.rounded_rectangle([s(v) for v in xy], radius=s(radius), **kw)


def text(d, xy, txt, f, fill, anchor="la"):
    d.text((s(xy[0]), s(xy[1])), txt, font=f, fill=fill, anchor=anchor)


def chrome(d, url):
    rrect(d, (0, 0, 900, 34), 10, fill=(228, 231, 236))
    d.rectangle([s(0), s(12), s(900), s(34)], fill=(228, 231, 236))
    for i, col in enumerate([(255, 95, 87), (254, 188, 46), (40, 200, 64)]):
        d.ellipse([s(13 + i * 18), s(12), s(23 + i * 18), s(22)], fill=col)
    rrect(d, (80, 7, 460, 27), 10, fill=WHITE, outline=BORDER)
    text(d, (96, 17), url, font(F_MONO, 11), INK_FAINT, anchor="lm")


def watermark(d):
    d.rectangle([s(0), s(H / SCALE - 30), s(W / SCALE), s(H / SCALE)], fill=(255, 247, 230))
    msg = "ILLUSTRATION SCHÉMATIQUE — NE REPRÉSENTE PAS UNE CAPTURE RÉELLE DE L'APPLICATION"
    text(d, (900 / 2, H / SCALE - 15), msg, font(F_UI_B, 10.5), (138, 109, 26), anchor="mm")


def field(d, x, y, w, label, value="", h=34):
    text(d, (x, y - 8), label, font(F_UI, 11), INK_SOFT, anchor="lb")
    rrect(d, (x, y, x + w, y + h), 6, fill=WHITE, outline=BORDER)
    if value:
        text(d, (x + 12, y + h / 2), value, font(F_UI, 12.5), INK, anchor="lm")


def button(d, x, y, w, h, label, primary=True):
    fill = BLUE if primary else WHITE
    txt = WHITE if primary else BLUE
    rrect(d, (x, y, x + w, y + h), 7, fill=fill, outline=BLUE)
    text(d, (x + w / 2, y + h / 2), label, font(F_UI_B, 12.5), txt, anchor="mm")


def checkbox(d, x, y, label, checked=False):
    rrect(d, (x, y, x + 16, y + 16), 3, fill=(BLUE if checked else WHITE), outline=BLUE)
    if checked:
        d.line([s(x + 3), s(y + 8), s(x + 7), s(y + 12), s(x + 14), s(y + 4)], fill=WHITE, width=s(2), joint="curve")
    text(d, (x + 24, y + 8), label, font(F_UI, 12), INK, anchor="lm")


def breadcrumb(d, x, y, steps, active_idx):
    cx = x
    for i, st in enumerate(steps):
        active = i <= active_idx
        d.ellipse([s(cx - 9), s(y - 9), s(cx + 9), s(y + 9)], fill=(BLUE if active else WHITE), outline=(BLUE if active else BORDER))
        text(d, (cx, y), str(i + 1), font(F_UI, 10), (WHITE if active else INK_FAINT), anchor="mm")
        text(d, (cx + 16, y), st, font(F_UI_B if i == active_idx else F_UI, 11.5), (BLUE if active else INK_FAINT), anchor="lm")
        cx += 24 + len(st) * 7 + 30
        if i < len(steps) - 1:
            d.line([s(cx - 30), s(y), s(cx - 6), s(y)], fill=BORDER, width=s(2))


def table_block(d, x, y, w, headers, rows, col_widths=None, row_h=30, header_h=32):
    n = len(headers)
    if not col_widths:
        col_widths = [w / n] * n
    rrect_flat = lambda a, b, c, e, **k: d.rectangle([s(a), s(b), s(c), s(e)], **k)
    rrect_flat(x, y, x + w, y + header_h, fill=BLUE)
    cx = x
    for i, h in enumerate(headers):
        text(d, (cx + 12, y + header_h / 2), h, font(F_UI_B, 10.5), WHITE, anchor="lm")
        cx += col_widths[i]
    ry = y + header_h
    for ridx, row in enumerate(rows):
        rowfill = WHITE if ridx % 2 == 0 else (240, 243, 247)
        rrect_flat(x, ry, x + w, ry + row_h, fill=rowfill, outline=BORDER)
        cx = x
        for i, cell in enumerate(row):
            text(d, (cx + 12, ry + row_h / 2), cell, font(F_UI, 10.5), INK, anchor="lm")
            cx += col_widths[i]
        ry += row_h
    d.rectangle([s(x), s(y), s(x + w), s(ry)], outline=BORDER)
    return ry


def kpi_card(d, x, y, w, h, label, value, color=BLUE):
    rrect(d, (x, y, x + w, y + h), 10, fill=WHITE, outline=BORDER)
    d.rectangle([s(x), s(y), s(x + 5), s(y + h)], fill=color)
    text(d, (x + 18, y + 24), label, font(F_UI, 10), INK_FAINT, anchor="lm")
    text(d, (x + 18, y + h - 14), value, font(F_SERIF_B, 22), INK, anchor="lm")


def save(img, name):
    small = img.resize((W // SCALE, H // SCALE), Image.LANCZOS)
    path = os.path.join(OUTDIR, f"{name}.png")
    small.save(path, "PNG")
    return path


SIDEBAR_SECTIONS = [
    ("Vue d'ensemble", ["Tableau de bord", "Analytiques"]),
    ("Gestion Académique", ["Admissions", "Élèves", "Enseignants", "Notes"]),
    ("Structure", ["Années académiques", "Trimestres", "Niveaux", "Classes", "Matières", "Campus", "Départements"]),
    ("Planification", ["Emploi du temps", "Calendrier"]),
    ("Présences", ["Badges", "Présence en direct"]),
    ("Finances", ["Finances", "Inventaire"]),
    ("Administration", ["Utilisateurs", "Paramètres"]),
]


def public_card(name, title, url, draw_body, breadcrumb_steps=None, active_idx=0):
    img, d = new_canvas()
    chrome(d, url)
    d.rectangle([s(0), s(34), s(900), s(H / SCALE)], fill=BG)
    card_x, card_y, card_w, card_h = 140, 74, 900 - 280, 560 - 150
    rrect(d, (card_x, card_y, card_x + card_w, card_y + card_h), 14, fill=WHITE, outline=BORDER)
    d.rectangle([s(card_x), s(card_y), s(card_x + card_w), s(card_y + 6)], fill=BLUE)
    text(d, (card_x + 30, card_y + 30), title, font(F_SERIF_B, 19), INK, anchor="lm")
    if breadcrumb_steps:
        breadcrumb(d, card_x + 30, card_y + 68, breadcrumb_steps, active_idx)
    draw_body(d)
    watermark(d)
    save(img, name)


def admin_shell(name, title, url, active_section, active_item, draw_content, tenant="Lycée Excellence de Conakry"):
    img, d = new_canvas()
    chrome(d, url)
    sidebar_w = 210
    d.rectangle([s(0), s(34), s(sidebar_w), s(560)], fill=WHITE, outline=BORDER)
    d.rectangle([s(0), s(34), s(sidebar_w), s(80)], fill=BLUE_DARK)
    text(d, (16, 57), tenant, font(F_SERIF_B, 13), WHITE, anchor="lm")
    y = 96
    for sec, items in SIDEBAR_SECTIONS:
        is_active_sec = sec == active_section
        text(d, (16, y), sec.upper(), font(F_UI_B, 9.5), INK_FAINT, anchor="lm")
        y += 16
        for it in items:
            is_active = is_active_sec and it == active_item
            if is_active:
                rrect(d, (8, y - 10, sidebar_w - 8, y + 10), 5, fill=BLUE_LIGHT)
            color = BLUE if is_active else INK_SOFT
            fnt = font(F_UI_B, 10.5) if is_active else font(F_UI, 10.5)
            text(d, (20, y), it, fnt, color, anchor="lm")
            y += 20
        y += 6
        if y > 545:
            break
    cx, cw = sidebar_w, 900 - sidebar_w
    d.rectangle([s(cx), s(34), s(900), s(560)], fill=BG)
    d.rectangle([s(cx), s(34), s(900), s(78)], fill=WHITE, outline=BORDER)
    text(d, (cx + 24, 56), active_item, font(F_UI_B, 13), INK, anchor="lm")
    text(d, (900 - 24, 56), f"{active_section} / {active_item}", font(F_UI, 10), INK_FAINT, anchor="rm")
    draw_content(d)
    watermark(d)
    save(img, name)


# ---------------- 1. Inscription ----------------
def b1(d):
    field(d, 170, 172, 460, "Nom de l'établissement *", "Lycée Excellence de Conakry")
    field(d, 170, 236, 300, "Type d'établissement *", "Lycée ▾")
    field(d, 490, 236, 140, "Pays *", "🇬🇳 Guinée")
    button(d, 170, 300, 140, 40, "Continuer")
public_card("01-inscription", "Créer votre établissement", "app.schoolflow.pro/inscription", b1,
            ["Votre établissement", "Votre compte", "Confirmation"], 0)

# ---------------- 2. Onboarding — Identité ----------------
def b2(d):
    field(d, 170, 174, 460, "Nom de l'école", "Lycée Excellence de Conakry")
    field(d, 170, 238, 300, "Devise principale", "Franc Guinéen (GNF FG) ▾")
    button(d, 170, 300, 120, 40, "Suivant")
public_card("02-onboarding-identite", "Configuration de l'Établissement",
            "app.schoolflow.pro/lycee-excellence/admin/onboarding", b2,
            ["Identité", "Niveaux", "Matières", "Signature"], 0)

# ---------------- 3. Onboarding — Niveaux ----------------
def b3(d):
    text(d, (170, 168), "Quels cycles d'enseignement proposez-vous ?", font(F_UI, 12), INK_SOFT, anchor="lm")
    cycles = ["Maternelle (PS, MS, GS)", "Primaire (CP, CE1, CE2, CM1, CM2)", "Collège (6ème, 5ème, 4ème, 3ème)",
              "Lycée (2nde, 1ère, Terminale)", "Université (Licence, Master, Doctorat)"]
    y = 190
    for i, c in enumerate(cycles):
        checkbox(d, 170, y, c, checked=(i == 3))
        y += 30
    button(d, 170, y + 14, 120, 40, "Suivant")
public_card("03-onboarding-niveaux", "Structure Pédagogique",
            "app.schoolflow.pro/lycee-excellence/admin/onboarding", b3,
            ["Identité", "Niveaux", "Matières", "Signature"], 1)

# ---------------- 4. Onboarding — Matières ----------------
def b4(d):
    text(d, (170, 168), "Sélectionnez les matières principales enseignées.", font(F_UI, 12), INK_SOFT, anchor="lm")
    subjects = ["Mathématiques", "Français", "Anglais", "Histoire-Géo", "SVT", "Physique-Chimie", "EPS", "Arts Plastiques"]
    for i, sub in enumerate(subjects):
        xx = 170 if i < 4 else 420
        yy = 192 + (i % 4) * 30
        checkbox(d, xx, yy, sub, checked=(i < 3))
    button(d, 170, 330, 120, 40, "Suivant")
public_card("04-onboarding-matieres", "Matières Enseignées",
            "app.schoolflow.pro/lycee-excellence/admin/onboarding", b4,
            ["Identité", "Niveaux", "Matières", "Signature"], 2)

# ---------------- 5. Onboarding — Signature ----------------
def b5(d):
    field(d, 170, 176, 460, "Nom du Directeur / Responsable", "Aissatou Diallo")
    text(d, (170, 242), "Signature manuscrite", font(F_UI, 11), INK_SOFT, anchor="lm")
    rrect(d, (170, 256, 630, 366), 8, outline=BORDER)
    d.line([s(195), s(330), s(230), s(290), s(260), s(350), s(300), s(310), s(340), s(280), s(400), s(320), s(460), s(300), s(500), s(315)],
           fill=BLUE, width=int(s(2.5)), joint="curve")
    button(d, 170, 386, 100, 34, "Effacer", primary=False)
    button(d, 400, 440, 160, 42, "Terminer")
public_card("05-onboarding-signature", "Signature & Engagement",
            "app.schoolflow.pro/lycee-excellence/admin/onboarding", b5,
            ["Identité", "Niveaux", "Matières", "Signature"], 3)

# ---------------- 6. Dashboard ----------------
def c6(d):
    kpis = [("Élèves Inscrits", "612", BLUE), ("Candidatures", "18", GOLD), ("Factures en attente", "42", RED), ("Taux présence (30j)", "94%", GREEN)]
    for i, (lab, val, col) in enumerate(kpis):
        kpi_card(d, 234 + i * 165, 96, 150, 76, lab, val, color=col)
    rrect(d, (234, 192, 564, 392), 10, fill=WHITE, outline=BORDER)
    text(d, (250, 210), "Effectifs par niveau", font(F_UI_B, 11.5), INK, anchor="lm")
    for i, v in enumerate([40, 70, 55, 90, 60]):
        d.rectangle([s(260 + i * 55), s(372 - v), s(260 + i * 55 + 34), s(372)], fill=BLUE)
    rrect(d, (580, 192, 870, 392), 10, fill=WHITE, outline=BORDER)
    text(d, (596, 210), "Présences (30 derniers jours)", font(F_UI_B, 11.5), INK, anchor="lm")
    d.ellipse([s(665), s(240), s(785), s(360)], outline=BORDER, width=s(18))
    d.arc([s(665), s(240), s(785), s(360)], start=-90, end=210, fill=GREEN, width=s(18))
    text(d, (725, 300), "94%", font(F_SERIF_B, 20), INK, anchor="mm")
admin_shell("06-dashboard", "Tableau de bord", "app.schoolflow.pro/lycee-excellence/admin",
            "Vue d'ensemble", "Tableau de bord", c6)

# ---------------- 7-13. Structure académique ----------------
def structure_screen(fname, item, headers, rows, cta_label, note=None):
    def content(d):
        ry = table_block(d, 234, 96, 636, headers, rows)
        button(d, 234, ry + 20, 240, 38, cta_label)
        if note:
            text(d, (234, ry + 78), note, font(F_UI, 10.5), INK_FAINT, anchor="lm")
    admin_shell(fname, item, f"app.schoolflow.pro/lycee-excellence/admin/{fname.split('-',1)[1]}",
                "Structure", item, content)

structure_screen("07-structure-annees", "Années académiques",
                  ["Année", "Début", "Fin", "Statut"],
                  [["2025-2026", "01/09/2025", "30/06/2026", "Archivée"], ["2026-2027", "01/09/2026", "30/06/2027", "★ Courante"]],
                  "+ Nouvelle année académique")
structure_screen("08-structure-trimestres", "Trimestres",
                  ["Période", "Début", "Fin"],
                  [["Trimestre 1", "01/09/2026", "20/12/2026"], ["Trimestre 2", "05/01/2027", "28/03/2027"], ["Trimestre 3", "12/04/2027", "30/06/2027"]],
                  "+ Nouveau trimestre",
                  note="Vue université : Semestre 1 / Semestre 2 à la place des 3 trimestres.")
structure_screen("09-structure-niveaux", "Niveau",
                  ["Niveau", "Cycle", "Effectif"],
                  [["6ème", "Collège", "84"], ["5ème", "Collège", "79"], ["2nde", "Lycée", "112"], ["Terminale", "Lycée", "96"]],
                  "+ Nouveau niveau")
structure_screen("10-structure-classes", "Classe",
                  ["Classe", "Niveau", "Capacité"],
                  [["6ème A", "6ème", "40"], ["6ème B", "6ème", "42"], ["Terminale D", "Terminale", "38"]],
                  "+ Nouvelle classe")
structure_screen("11-structure-matieres", "Matières",
                  ["Matière", "Coefficient", "Enseignant(s)"],
                  [["Mathématiques", "5", "M. Camara"], ["Français", "4", "Mme Baldé"], ["Physique-Chimie", "3", "M. Sylla"]],
                  "+ Nouvelle matière")
structure_screen("12-structure-campus", "Campus",
                  ["Campus", "Adresse", "Classes rattachées"],
                  [["Campus Principal", "Conakry, Kaloum", "18"], ["Annexe Ratoma", "Conakry, Ratoma", "6"]],
                  "+ Nouveau campus")
structure_screen("13-structure-departements", "Départements",
                  ["Département", "Responsable", "Enseignants"],
                  [["Département Scientifique", "M. Sylla", "9"], ["Département Littéraire", "Mme Baldé", "7"]],
                  "+ Nouveau département",
                  note="Vue université : Département d'Informatique, de Droit, de Médecine…")

# ---------------- 14. Gestion académique — Élèves ----------------
def c14(d):
    rrect(d, (234, 96, 870, 130), 7, fill=WHITE, outline=BORDER)
    text(d, (246, 113), "🔍 Rechercher un élève…", font(F_UI, 11), INK_FAINT, anchor="lm")
    table_block(d, 234, 144, 636, ["Nom", "Classe", "Statut", "Contact parent"],
                [["Diallo Aissatou", "Terminale D", "Actif", "622 00 11 22"],
                 ["Bah Mamadou", "Terminale D", "Actif", "628 33 44 55"],
                 ["Camara Fatoumata", "Terminale D", "Actif", "620 66 77 88"]])
admin_shell("14-gestion-eleves", "Élèves", "app.schoolflow.pro/lycee-excellence/admin/students",
            "Gestion Académique", "Élèves", c14)

# ---------------- 15. Planification — Emploi du temps ----------------
def c15(d):
    text(d, (234, 108), "Classe : Terminale D — Semaine du 12/01/2027", font(F_UI_B, 11.5), INK, anchor="lm")
    days = ["Lun", "Mar", "Mer", "Jeu", "Ven"]
    gx, gy, cw, rh = 234, 130, 120, 40
    d.rectangle([s(gx - 70), s(gy), s(gx), s(gy + rh)], fill=BLUE_DARK)
    for i, day in enumerate(days):
        d.rectangle([s(gx + i * cw), s(gy), s(gx + (i + 1) * cw), s(gy + rh)], fill=BLUE)
        text(d, (gx + i * cw + cw / 2, gy + rh / 2), day, font(F_UI_B, 11), WHITE, anchor="mm")
    slots = ["8h-9h", "9h-10h", "10h-11h", "11h-12h"]
    courses = {(0, 0): "Maths", (0, 1): "Physique", (0, 3): "Français", (1, 1): "Anglais", (1, 2): "SVT",
               (2, 0): "Maths", (3, 2): "Histoire", (4, 1): "EPS", (4, 3): "Philo"}
    for r, sl in enumerate(slots):
        yy = gy + rh + r * rh
        d.rectangle([s(gx - 70), s(yy), s(gx), s(yy + rh)], fill=WHITE, outline=BORDER)
        text(d, (gx - 62, yy + rh / 2), sl, font(F_UI, 10), INK_FAINT, anchor="lm")
        for c in range(5):
            xx = gx + c * cw
            d.rectangle([s(xx), s(yy), s(xx + cw), s(yy + rh)], fill=WHITE, outline=BORDER)
            if (c, r) in courses:
                label = courses[(c, r)]
                fill = GOLD_LIGHT if (c + r) % 2 else BLUE_LIGHT
                rrect(d, (xx + 4, yy + 4, xx + cw - 4, yy + rh - 4), 4, fill=fill)
                text(d, (xx + cw / 2, yy + rh / 2), label, font(F_UI, 10), INK, anchor="mm")
admin_shell("15-planification-edt", "Emploi du temps", "app.schoolflow.pro/lycee-excellence/admin/schedule",
            "Planification", "Emploi du temps", c15)

# ---------------- 16. Présences en direct ----------------
def c16(d):
    kpis = [("Présents", "540", GREEN), ("Absents", "58", RED), ("Retards", "14", GOLD)]
    for i, (lab, val, col) in enumerate(kpis):
        kpi_card(d, 234 + i * 216, 96, 200, 76, lab, val, color=col)
    table_block(d, 234, 192, 636, ["Élève", "Classe", "Heure de scan", "Statut"],
                [["Diallo Aissatou", "Terminale D", "07:58", "✔ Présent"],
                 ["Bah Mamadou", "6ème A", "08:12", "⚠ Retard"],
                 ["Camara Fatoumata", "5ème B", "—", "✘ Absent"]])
admin_shell("16-presences-direct", "Présence en direct", "app.schoolflow.pro/lycee-excellence/admin/live-attendance",
            "Présences", "Présence en direct", c16)

# ---------------- 17. Finances — Facture ----------------
def c17(d):
    field(d, 234, 118, 300, "Élève", "Diallo Aissatou — Terminale D")
    field(d, 550, 118, 220, "Type de frais", "Mensualité — Janvier")
    text(d, (234, 180), "Suggestions de frais", font(F_UI, 11), INK_SOFT, anchor="lm")
    rrect(d, (234, 196, 384, 226), 15, fill=BLUE_LIGHT, outline=BLUE)
    text(d, (309, 211), "Frais d'inscription", font(F_UI, 10.5), BLUE_DARK, anchor="mm")
    rrect(d, (394, 196, 524, 226), 15, fill=WHITE, outline=BORDER)
    text(d, (459, 211), "Cantine", font(F_UI, 10.5), INK_SOFT, anchor="mm")
    field(d, 234, 250, 220, "Montant (GNF)", "350 000 GNF")
    button(d, 234, 314, 160, 40, "Émettre la facture")
    button(d, 410, 314, 190, 40, "Encaisser un paiement", primary=False)
admin_shell("17-finances-facture", "Finances", "app.schoolflow.pro/lycee-excellence/admin/finances",
            "Finances", "Finances", c17)

# ---------------- 18. Communication — Annonces ----------------
def c18(d):
    field(d, 234, 118, 636, "Titre de l'annonce", "Réunion parents-professeurs — Trimestre 2")
    text(d, (234, 178), "Message", font(F_UI, 11), INK_SOFT, anchor="lm")
    rrect(d, (234, 188, 870, 278), 6, fill=WHITE, outline=BORDER)
    text(d, (248, 204), "La réunion parents-professeurs du 2e trimestre se tiendra le...", font(F_UI, 11), INK_SOFT, anchor="lm")
    field(d, 234, 300, 300, "Public ciblé", "Toutes les classes ▾")
    button(d, 234, 366, 160, 40, "Publier l'annonce")
admin_shell("18-communication-annonces", "Annonces", "app.schoolflow.pro/lycee-excellence/admin/announcements",
            "Administration", "Utilisateurs", c18)

# ---------------- 19. Administration — Paramètres ----------------
def c19(d):
    field(d, 234, 118, 300, "Nom de l'établissement", "Lycée Excellence de Conakry")
    field(d, 234, 182, 300, "Langue par défaut", "Français ▾")
    text(d, (234, 238), "Couleur principale", font(F_UI, 11), INK_SOFT, anchor="lm")
    for i, col in enumerate([BLUE, GOLD, GREEN, RED]):
        d.ellipse([s(250 + i * 40 - 14), s(266 - 14), s(250 + i * 40 + 14), s(266 + 14)], fill=col, outline=INK if i == 0 else None)
    field(d, 600, 118, 260, "Position du menu", "Gauche ▾")
    button(d, 234, 320, 160, 40, "Enregistrer")
admin_shell("19-administration-parametres", "Paramètres", "app.schoolflow.pro/lycee-excellence/admin/settings",
            "Administration", "Paramètres", c19)

print("19 illustrations PNG générées dans", OUTDIR)
