#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SchoolFlow Pro - Audit Complet et Detaille
Rapport PDF - Avril 2026
"""

import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.lib import colors
from reportlab.lib.units import cm, inch, mm
from reportlab.platypus import (
    Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, HRFlowable
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.platypus import SimpleDocTemplate
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# ============================================================
# FONT REGISTRATION
# ============================================================
pdfmetrics.registerFont(TTFont('SimHei', '/usr/share/fonts/truetype/chinese/SimHei.ttf'))
pdfmetrics.registerFont(TTFont('Microsoft YaHei', '/usr/share/fonts/truetype/chinese/msyh.ttf'))
pdfmetrics.registerFont(TTFont('Times New Roman', '/usr/share/fonts/truetype/english/Times-New-Roman.ttf'))
pdfmetrics.registerFont(TTFont('Calibri', '/usr/share/fonts/truetype/english/calibri-regular.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'))

registerFontFamily('Times New Roman', normal='Times New Roman', bold='Times New Roman')
registerFontFamily('SimHei', normal='SimHei', bold='SimHei')
registerFontFamily('Microsoft YaHei', normal='Microsoft YaHei', bold='Microsoft YaHei')
registerFontFamily('Calibri', normal='Calibri', bold='Calibri')

# ============================================================
# COLOR CONSTANTS
# ============================================================
TABLE_HEADER_COLOR = colors.HexColor('#1F4E79')
TABLE_HEADER_TEXT = colors.white
TABLE_ROW_EVEN = colors.white
TABLE_ROW_ODD = colors.HexColor('#F5F5F5')
ACCENT_BLUE = colors.HexColor('#2E75B6')
ACCENT_RED = colors.HexColor('#C00000')
ACCENT_ORANGE = colors.HexColor('#ED7D31')
ACCENT_GREEN = colors.HexColor('#00B050')
ACCENT_YELLOW = colors.HexColor('#FFC000')
DARK_BG = colors.HexColor('#1B2838')
COVER_BG = colors.HexColor('#0D1B2A')

# ============================================================
# STYLE DEFINITIONS
# ============================================================
# Cover styles
cover_title_style = ParagraphStyle(
    name='CoverTitle', fontName='SimHei', fontSize=36, leading=44,
    alignment=TA_CENTER, textColor=colors.white, spaceAfter=12
)
cover_subtitle_style = ParagraphStyle(
    name='CoverSubtitle', fontName='SimHei', fontSize=18, leading=26,
    alignment=TA_CENTER, textColor=colors.HexColor('#90CAF9'), spaceAfter=8
)
cover_info_style = ParagraphStyle(
    name='CoverInfo', fontName='SimHei', fontSize=13, leading=20,
    alignment=TA_CENTER, textColor=colors.HexColor('#B0BEC5'), spaceAfter=6
)

# TOC styles
toc_h1_style = ParagraphStyle(
    name='TOCH1', fontName='SimHei', fontSize=13, leading=22,
    leftIndent=20, spaceBefore=4, spaceAfter=2, wordWrap='CJK'
)
toc_h2_style = ParagraphStyle(
    name='TOCH2', fontName='SimHei', fontSize=11, leading=18,
    leftIndent=45, spaceBefore=2, spaceAfter=1, wordWrap='CJK'
)

# Section heading styles
h1_style = ParagraphStyle(
    name='H1', fontName='SimHei', fontSize=20, leading=28,
    textColor=colors.HexColor('#1F4E79'), spaceBefore=18, spaceAfter=10,
    wordWrap='CJK'
)
h2_style = ParagraphStyle(
    name='H2', fontName='SimHei', fontSize=15, leading=22,
    textColor=colors.HexColor('#2E75B6'), spaceBefore=14, spaceAfter=8,
    wordWrap='CJK'
)
h3_style = ParagraphStyle(
    name='H3', fontName='SimHei', fontSize=12.5, leading=18,
    textColor=colors.HexColor('#404040'), spaceBefore=10, spaceAfter=6,
    wordWrap='CJK'
)

# Body text
body_style = ParagraphStyle(
    name='Body', fontName='SimHei', fontSize=10.5, leading=18,
    alignment=TA_LEFT, wordWrap='CJK', spaceAfter=4, firstLineIndent=0
)
body_indent_style = ParagraphStyle(
    name='BodyIndent', fontName='SimHei', fontSize=10.5, leading=18,
    alignment=TA_LEFT, wordWrap='CJK', spaceAfter=4, leftIndent=15
)

# Table styles
tbl_header_style = ParagraphStyle(
    name='TblHeader', fontName='SimHei', fontSize=9.5, leading=14,
    alignment=TA_CENTER, textColor=colors.white, wordWrap='CJK'
)
tbl_cell_style = ParagraphStyle(
    name='TblCell', fontName='SimHei', fontSize=9, leading=13,
    alignment=TA_LEFT, wordWrap='CJK'
)
tbl_cell_center = ParagraphStyle(
    name='TblCellCenter', fontName='SimHei', fontSize=9, leading=13,
    alignment=TA_CENTER, wordWrap='CJK'
)

# Caption
caption_style = ParagraphStyle(
    name='Caption', fontName='SimHei', fontSize=9, leading=14,
    alignment=TA_CENTER, textColor=colors.HexColor('#666666'), wordWrap='CJK'
)

# Status badge styles
status_ok = ParagraphStyle(name='StatusOK', fontName='SimHei', fontSize=9, leading=13, alignment=TA_CENTER, textColor=colors.HexColor('#006100'))
status_warn = ParagraphStyle(name='StatusWarn', fontName='SimHei', fontSize=9, leading=13, alignment=TA_CENTER, textColor=colors.HexColor('#9C6500'))
status_err = ParagraphStyle(name='StatusErr', fontName='SimHei', fontSize=9, leading=13, alignment=TA_CENTER, textColor=colors.HexColor('#9C0006'))
status_partial = ParagraphStyle(name='StatusPartial', fontName='SimHei', fontSize=9, leading=13, alignment=TA_CENTER, textColor=colors.HexColor('#0054A6'))


# ============================================================
# CUSTOM DOC TEMPLATE FOR TOC
# ============================================================
class TocDocTemplate(SimpleDocTemplate):
    def __init__(self, *args, **kwargs):
        SimpleDocTemplate.__init__(self, *args, **kwargs)
        self.page_count_offset = 0

    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            self.notify('TOCEntry', (level, text, self.page))


def add_heading(text, style, level=0):
    p = Paragraph(text, style)
    p.bookmark_name = text
    p.bookmark_level = level
    p.bookmark_text = text
    return p


def make_table(headers, rows, col_widths=None):
    """Create a styled table with alternating rows."""
    data = [[Paragraph(f'<b>{h}</b>', tbl_header_style) for h in headers]]
    for row in rows:
        data.append([Paragraph(str(c), tbl_cell_style) if not isinstance(c, Paragraph) else c for c in row])

    if col_widths is None:
        col_widths = [460 / len(headers)] * len(headers)

    t = Table(data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ('TEXTCOLOR', (0, 0), (-1, 0), TABLE_HEADER_TEXT),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CCCCCC')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        bg = TABLE_ROW_EVEN if i % 2 == 1 else TABLE_ROW_ODD
        style_cmds.append(('BACKGROUND', (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style_cmds))
    return t


def make_score_table(headers, rows, col_widths=None):
    """Table with colored status cells."""
    data = [[Paragraph(f'<b>{h}</b>', tbl_header_style) for h in headers]]
    status_map = {
        '100%': (status_ok, ACCENT_GREEN),
        '90%': (status_partial, ACCENT_BLUE),
        '85%': (status_warn, ACCENT_ORANGE),
        '80%': (status_warn, ACCENT_ORANGE),
        '75%': (status_warn, ACCENT_ORANGE),
        '70%': (status_warn, ACCENT_ORANGE),
        '0%': (status_err, ACCENT_RED),
        'N/A': (status_err, ACCENT_RED),
    }
    for row in rows:
        styled_row = []
        for c in row:
            if isinstance(c, Paragraph):
                styled_row.append(c)
            else:
                s = str(c)
                if s in status_map:
                    sty, _ = status_map[s]
                    styled_row.append(Paragraph(f'<b>{s}</b>', sty))
                else:
                    styled_row.append(Paragraph(s, tbl_cell_center))
        data.append(styled_row)

    if col_widths is None:
        col_widths = [460 / len(headers)] * len(headers)

    t = Table(data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ('TEXTCOLOR', (0, 0), (-1, 0), TABLE_HEADER_TEXT),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CCCCCC')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        bg = TABLE_ROW_EVEN if i % 2 == 1 else TABLE_ROW_ODD
        style_cmds.append(('BACKGROUND', (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style_cmds))
    return t


# ============================================================
# MAIN PDF GENERATION
# ============================================================
def build_report():
    output_path = '/home/z/my-project/download/SchoolFlow_Pro_Audit_Avance_Avril2026.pdf'

    doc = TocDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
        title='SchoolFlow Pro - Audit Complet et Avance',
        author='Z.ai',
        creator='Z.ai',
        subject='Audit fonctionnel complet de SchoolFlow Pro - Analyse par role, module et fonctionnalite'
    )

    story = []
    W = doc.width  # usable width

    # ========================================================
    # COVER PAGE
    # ========================================================
    # Dark cover background via a full-page table
    cover_bg_data = [['']]
    cover_bg = Table(cover_bg_data, colWidths=[W + 4*cm], rowHeights=[A4[1] - 3*cm])
    cover_bg.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COVER_BG),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))

    story.append(Spacer(1, 100))
    story.append(Paragraph('<b>SchoolFlow Pro</b>', cover_title_style))
    story.append(Spacer(1, 16))
    story.append(Paragraph('Audit Complet et Avance', ParagraphStyle(
        name='CoverTitle2', fontName='SimHei', fontSize=28, leading=36,
        alignment=TA_CENTER, textColor=colors.HexColor('#64B5F6')
    )))
    story.append(Spacer(1, 24))
    story.append(HRFlowable(width='40%', thickness=2, color=ACCENT_BLUE, spaceAfter=24, spaceBefore=12))
    story.append(Paragraph('Fonction par fonction | Module par module | Role par role', cover_subtitle_style))
    story.append(Spacer(1, 12))
    story.append(Paragraph('Bouton par bouton | Action par action | Page par page', cover_subtitle_style))
    story.append(Spacer(1, 60))
    story.append(Paragraph('Analyse comparative avec les meilleurs concurrents du marche', cover_info_style))
    story.append(Paragraph('Axes d\'amelioration et plan d\'evolution strategique', cover_info_style))
    story.append(Spacer(1, 50))
    story.append(Paragraph('<b>Date :</b> 9 Avril 2026', cover_info_style))
    story.append(Paragraph('<b>Version :</b> v0.0.1 (Pre-production)', cover_info_style))
    story.append(Paragraph('<b>Classification :</b> Confidentiel', ParagraphStyle(
        name='CoverConf', fontName='SimHei', fontSize=12, leading=18,
        alignment=TA_CENTER, textColor=colors.HexColor('#EF5350')
    )))
    story.append(PageBreak())

    # ========================================================
    # TABLE OF CONTENTS
    # ========================================================
    story.append(Paragraph('<b>Table des Matieres</b>', h1_style))
    story.append(Spacer(1, 12))
    toc = TableOfContents()
    toc.levelStyles = [toc_h1_style, toc_h2_style]
    story.append(toc)
    story.append(PageBreak())

    # ========================================================
    # 1. RESUME EXECUTIF
    # ========================================================
    story.append(add_heading('<b>1. Resume Executif</b>', h1_style, 0))
    story.append(Paragraph(
        "SchoolFlow Pro est une plateforme de gestion scolaire multi-tenant de nouvelle generation, concue pour "
        "les ecoles, universites et centres de formation en Afrique francophone. Le systeme est deploye sur Render "
        "avec un backend FastAPI (Python) et un frontend React/Vite (TypeScript). Cette audit realise le 9 avril 2026 "
        "constitue une analyse exhaustive et sans precedent du projet, couvrant chaque fonctionnalite, chaque module, "
        "chaque page, chaque menu, chaque bouton et chaque action de bout en bout pour l'ensemble des sept roles "
        "utilisateurs.", body_style))
    story.append(Spacer(1, 8))

    story.append(add_heading('<b>1.1 Chiffres Cles du Projet</b>', h2_style, 1))
    kpi_data = [
        ['109', 'Routes frontales', '34', 'Modeles de donnees'],
        ['150+', 'Endpoints API backend', '10', 'Roles utilisateurs'],
        ['300+', 'Composants React', '90+', 'Permissions granulaires'],
        ['47', 'Hooks personnalises', '22', 'Fichiers de migration'],
        ['5', 'Langues supportees', '6', 'Middlewares securite'],
    ]
    kpi_table = Table(
        [[Paragraph(f'<b>{kpi_data[i][0]}</b>', ParagraphStyle(name=f'kpi_v_{i}', fontName='SimHei', fontSize=22, leading=28, alignment=TA_CENTER, textColor=ACCENT_BLUE)),
          Paragraph(kpi_data[i][1], ParagraphStyle(name=f'kpi_l_{i}', fontName='SimHei', fontSize=9, leading=13, alignment=TA_CENTER)),
          Paragraph(f'<b>{kpi_data[i][2]}</b>', ParagraphStyle(name=f'kpi_v2_{i}', fontName='SimHei', fontSize=22, leading=28, alignment=TA_CENTER, textColor=ACCENT_BLUE)),
          Paragraph(kpi_data[i][3], ParagraphStyle(name=f'kpi_l2_{i}', fontName='SimHei', fontSize=9, leading=13, alignment=TA_CENTER))]
         for i in range(5)],
        colWidths=[W*0.18, W*0.32, W*0.18, W*0.32]
    )
    kpi_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LINEAFTER', (1, 0), (1, -1), 0.5, colors.HexColor('#E0E0E0')),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 12))

    story.append(add_heading('<b>1.2 Score Global de Maturite</b>', h2_style, 1))
    score_rows = [
        ['Administrateur', '68 routes', '87%'],
        ['Enseignant', '8 routes', '82%'],
        ['Parent', '9 routes', '80%'],
        ['Eleve / Etudiant', '7 routes', '85%'],
        ['Alumni', '4 routes', '75%'],
        ['Chef de Departement', '11 routes', '78%'],
        ['Super Administrateur', '3 routes', '90%'],
        ['Backend API', '150+ endpoints', '84%'],
        ['Securite', '6 middlewares', '72%'],
    ]
    story.append(make_score_table(
        ['Interface / Module', 'Etendue', 'Score de Maturite'],
        score_rows,
        col_widths=[W*0.35, W*0.30, W*0.35]
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>Tableau 1.</b> Score de maturite par interface et module', caption_style))
    story.append(Spacer(1, 12))

    story.append(Paragraph(
        "Le score global de maturite du projet est estime a <b>82%</b>. Ce chiffre masque cependant des disparites "
        "importantes entre les modules. Les modules academiques (gestion des eleves, notes, presences) atteignent "
        "un niveau de maturite eleve grace a des endpoints backend complets et une integration frontend solide. "
        "En revanche, les modules e-learning, la collaboration temps reel, les paiements en ligne et certaines "
        "fonctionnalites avancees restent a l'etat de squelettes ou de bouchons qui ne fonctionnent pas en production.", body_style))
    story.append(Spacer(1, 8))

    story.append(add_heading('<b>1.3 Problematiques Majeures Identifiees</b>', h2_style, 1))
    major_issues = [
        ['CRITIQUE', '7 vulnerabilites de securite', 'CORS ouvert, injection SQL potentielle, JWT non verifie dans middleware, mots de passe en clair dans les reponses API'],
        ['CRITIQUE', '10 fonctionnalites completement non operationnelles', 'E-learning, tempe reel, sessions actives, inscriptions evenements, profils alumni, et plus'],
        ['HAUT', '9 endpoints manquants', 'PUT/DELETE salles, programmes, inscriptions, changement mot de passe utilisateur'],
        ['HAUT', '7 endpoints avec donnees factices', 'Previsions tresorerie, KPIs operations, intention de paiement, generation AI legacy'],
        ['MOYEN', '15+ problemes de validation', 'Dict non valides en entree, roles non enumeres, pagination SQL absente sur certains endpoints'],
        ['MOYEN', '20 features manquantes vs concurrents', 'Mobile Money, generation automatique d\'emploi du temps, SMS, examen en ligne, releves officiels'],
    ]
    story.append(make_table(
        ['Severite', 'Categorie', 'Details'],
        major_issues,
        col_widths=[W*0.12, W*0.30, W*0.58]
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>Tableau 2.</b> Synthese des problematiques majeures identifiees', caption_style))
    story.append(Spacer(1, 18))

    # ========================================================
    # 2. AUDIT PAR ROLE UTILISATEUR
    # ========================================================
    story.append(add_heading('<b>2. Audit Detaille par Role Utilisateur</b>', h1_style, 0))
    story.append(Paragraph(
        "Cette section analyse chaque role utilisateur de bout en bout, en examinant chaque page, chaque menu, "
        "chaque bouton et chaque action disponible. L'objectif est d'identifier precisement ce qui fonctionne a 100%, "
        "ce qui fonctionne partiellement, ce qui est en erreur, et ce qui est completement manquant. Chaque role est "
        "teste selon un parcours utilisateur realiste, depuis la connexion jusqu'aux actions les plus avancees.", body_style))
    story.append(Spacer(1, 12))

    # --- 2.1 ADMINISTRATEUR ---
    story.append(add_heading('<b>2.1 Role Administrateur (TENANT_ADMIN / DIRECTOR)</b>', h2_style, 1))
    story.append(Paragraph(
        "L'interface administrateur est la plus complete du systeme, avec 68 routes accessibles selon les permissions. "
        "Le menu lateral est organise en 11 sections principales, chacune filtree par permissions. Le tableau de bord "
        "principal offre une vue d'ensemble avec des KPIs academiques et financiers. L'administrateur dispose d'un "
        "acces total a la gestion academique, financiere, structurelle, et administrative de l'etablissement.", body_style))
    story.append(Spacer(1, 8))

    story.append(add_heading('<b>2.1.1 Tableau de Bord Principal</b>', h3_style, 1))
    admin_dashboard_rows = [
        ['Vue d\'ensemble KPIs', 'Statistiques generales (eleves, enseignants, revenus)', 'Fonctionne', 'pendingAdmissions toujours a 0 (TODO)'],
        ['Graphiques financiers', 'Revenus, tendances, creances', 'Partiel', 'Donnees statiques sur DecisionDashboard (14.2k euros hardcodes)'],
        ['Graphiques academiques', 'Reussite, moyennes, eleves en risque', 'Fonctionne', 'Chartes de distribution des notes OK'],
        ['Alertes IA', 'Recommandations AI dynamiques', 'Partiel', 'Impacts hardcodes ("30% reduction echec")'],
        ['Previsions tresorerie', 'Cash-flow forecast', 'Non fonctionnel', 'Endpoint retourne des donnees factices [5000, 5200, 5500]'],
        ['Notifications', 'Centre de notifications intelligent', 'Fonctionne', 'Push notifications fonctionnelles'],
    ]
    story.append(make_table(
        ['Element', 'Description', 'Statut', 'Remarques'],
        admin_dashboard_rows,
        col_widths=[W*0.20, W*0.30, W*0.15, W*0.35]
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>Tableau 3.</b> Audit du Tableau de Bord Administrateur', caption_style))
    story.append(Spacer(1, 10))

    story.append(add_heading('<b>2.1.2 Gestion Academique</b>', h3_style, 1))
    academic_rows = [
        ['Admissions', 'CRUD complet + machine a etats', 'Fonctionne', '5 etats: BROUILLON > SOUMIS > ETUDE > ACCEPTE > CONVERTI'],
        ['Eleves', 'CRUD + import/export + recherche', 'Fonctionne', 'Photo upload, liaison parent, pre-inscription rapide'],
        ['Listes de classes', 'Visualisation par classe', 'Fonctionne', 'Filtres avances disponibles'],
        ['Enseignants', 'Assignation classes/matieres', 'Fonctionne', 'Dashboard enseignant dedie'],
        ['Notes', 'Saisie, consultation, bulletins', 'Fonctionne', 'Moyennes calculees, graphiques d\'evolution'],
        ['Bulletins', 'Generation PDF', 'Partiel', 'jsPDF utilise mais certains champs manquent'],
        ['Certificats', 'Generation documents', 'Partiel', 'Templates de base disponibles'],
        ['Inscriptions', 'Gestion des inscriptions', 'Fonctionne', 'Statistiques d\'inscription disponibles'],
        ['Emploi du temps', 'Grille horaire + generation', 'Partiel', 'Pas de generation automatique (competiteur cle)'],
        ['Calendrier scolaire', 'Evenements et jours off', 'Fonctionne', 'Vue publique disponible'],
        ['Presences (badges)', 'QR Code + badge + check-in', 'Fonctionne', 'Scanner QR, historique, notifications'],
        ['Presences en direct', 'Suivi temps reel', 'Partiel', 'Temps reel desactive (Supabase migre)'],
    ]
    story.append(make_table(
        ['Fonctionnalite', 'Description', 'Statut', 'Remarques'],
        academic_rows,
        col_widths=[W*0.18, W*0.28, W*0.14, W*0.40]
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>Tableau 4.</b> Audit Gestion Academique', caption_style))
    story.append(Spacer(1, 10))

    story.append(add_heading('<b>2.1.3 Gestion Financiere</b>', h3_style, 1))
    finance_rows = [
        ['Facturation', 'Creation, envoi, suivi', 'Fonctionne', 'Items JSON, statuts DRAFT a PAID'],
        ['Paiements', 'Enregistrement + annulation', 'Fonctionne', 'Reference auto, atomicite DB'],
        ['Frais de scolarite', 'Types de frais CRUD', 'Fonctionne', 'Configuration flexible'],
        ['Relances', 'Envoi de rappels', 'Fonctionne', 'Endpoint send-reminders OK'],
        ['Paiement en ligne', 'Mobile Money / Carte', 'Non fonctionnel', 'Endpoint mock, pas d\'integration Orange Money/Wave/MTN'],
        ['Prévisions tresorerie', 'Cash-flow forecast', 'Non fonctionnel', 'Donnees hardcodes [5000, 5200, 5500]'],
        ['Export comptable', 'Export donnees financieres', 'Partiel', 'Page presente mais fonctionnalite limitee'],
        ['Sponsorships', 'Gestion des parrainages', 'Non fonctionnel', '4 TODO dans le code, page squelette'],
        ['Inventaire', 'Stock + commandes', 'Fonctionne', 'Categories, articles, ajustements'],
        ['Commandes', 'Passation + historique', 'Fonctionne', 'Panier, reception, historique'],
    ]
    story.append(make_table(
        ['Fonctionnalite', 'Description', 'Statut', 'Remarques'],
        finance_rows,
        col_widths=[W*0.18, W*0.28, W*0.14, W*0.40]
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>Tableau 5.</b> Audit Gestion Financiere', caption_style))
    story.append(Spacer(1, 10))

    story.append(add_heading('<b>2.1.4 Modules Transversaux (Admin)</b>', h3_style, 1))
    cross_rows = [
        ['E-learning', 'Cours, modules, quiz', 'Non fonctionnel', 'Queries retournent []. Modules geres en state local (perdus au refresh)'],
        ['Bibliotheque', 'Livres, categories, prets', 'Fonctionne', 'CRUD complet backend'],
        ['Marketplace', 'Place de marche', 'Partiel', 'Page presente mais fonctionnalite embryonnaire'],
        ['Gamification', 'Badges, classement, points', 'Partiel', 'Systeme de badges OK, stats totalPoints = 0'],
        ['Clubs', 'Clubs et activites', 'Partiel', 'CRUD OK, 4 TODO dans dialogs'],
        ['Carrieres', 'Offres et stages', 'Fonctionne', 'Pipeline offres disponible'],
        ['Alumni mentors', 'Programme mentorat', 'Non fonctionnel', '"Coming soon" dans l\'interface'],
        ['Messages', 'Messagerie interne', 'Fonctionne', 'Composeur admin, groupes, externes, emojis'],
        ['Annonces', 'Communications', 'Fonctionne', 'CRUD complet'],
        ['Forums', 'Forums de discussion', 'Partiel', 'CRUD backend OK, UI basique'],
        ['Sondages', 'Questionnaires', 'Partiel', 'CRUD backend OK, UI basique'],
        ['Incidents', 'Signalements', 'Fonctionne', 'CRUD + liaison eleve'],
        ['Signatures electroniques', 'Validation documents', 'Non fonctionnel', '6 TODO, page squelette'],
        ['Visio-conferences', 'Reunions en ligne', 'Non fonctionnel', '2 TODO, page placeholder'],
        ['Reservations salles', 'Booking system', 'Partiel', '6 TODO dans le code'],
        ['RH / Personnel', 'Employes, contrats, conges', 'Partiel', 'CRUD OK, pagination fake (utilise array.length)'],
        ['Utilisateurs', 'Gestion comptes', 'Fonctionne', 'CRUD + roles + reset password'],
        ['Audit logs', 'Journal d\'audit', 'Partiel', 'Pagination cassee (total = array.length)'],
        ['RGPD', 'Conformite donnees', 'Partiel', 'Export/Suppression OK, consentements = 0'],
        ['Parametres', 'Configuration etablissement', 'Fonctionne', 'Branding, securite, notation, horaires'],
        ['Onboarding', 'Assistant initialisation', 'Fonctionne', 'Wizard 4 etapes complet'],
    ]
    story.append(make_table(
        ['Module', 'Description', 'Statut', 'Remarques'],
        cross_rows,
        col_widths=[W*0.18, W*0.24, W*0.14, W*0.44]
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>Tableau 6.</b> Audit Modules Transversaux Administrateur', caption_style))
    story.append(Spacer(1, 18))

    # --- 2.2 ENSEIGNANT ---
    story.append(add_heading('<b>2.2 Role Enseignant (TEACHER)</b>', h2_style, 1))
    story.append(Paragraph(
        "L'interface enseignant comprend 8 routes principales avec un tableau de bord dedie. L'enseignant peut "
        "gerer ses classes, saisir des notes, enregistrer les presences, attribuer des devoirs, consulter son emploi "
        "du temps et communiquer avec les parents et l'administration. Le layout est optimise avec une navigation "
        "mobile a 5 elements (Accueil, Classes, Notes, Presences, Messages).", body_style))
    story.append(Spacer(1, 8))

    teacher_rows = [
        ['Tableau de bord', 'KPIs personnels, emploi du temps du jour', 'Partiel', 'pendingHomework = 0 (placeholder), dashboard stats non implementes'],
        ['Mes Classes', 'Liste classes assignees + detail', 'Fonctionne', 'Acces aux eleves et matieres par classe'],
        ['Notes', 'Saisie + modification notes', 'Fonctionne', 'Par evaluation, par eleve, calcul moyennes'],
        ['Presences', 'Enregistrement par seance', 'Fonctionne', 'Check-in par classe, stats d\'assiduite'],
        ['Presences seance', 'Session attendance dediee', 'Fonctionne', 'Stats par seance, export possible'],
        ['Devoirs', 'Creation + suivi devoirs', 'Partiel', 'HomeworkForm existe mais backend limité'],
        ['Messages', 'Communication parents/admin', 'Fonctionne', 'Messagerie interne complete'],
        ['Creneaux rendez-vous', 'Gestion disponibilites', 'Partiel', 'Page presente, fonctionnalite basique'],
        ['Emploi du temps', 'Visualisation horaire', 'Fonctionne', 'Grille horaire avec filtres'],
    ]
    story.append(make_table(
        ['Page', 'Fonctionnalites', 'Statut', 'Remarques'],
        teacher_rows,
        col_widths=[W*0.18, W*0.28, W*0.14, W*0.40]
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>Tableau 7.</b> Audit Interface Enseignant', caption_style))
    story.append(Spacer(1, 18))

    # --- 2.3 PARENT ---
    story.append(add_heading('<b>2.3 Role Parent (PARENT)</b>', h2_style, 1))
    story.append(Paragraph(
        "L'interface parent offre 9 routes pour suivre la scolarite des enfants. Le parent peut consulter les notes, "
        "les bulletins, les factures, les presences et communiquer avec l'etablissement. Le tableau de bord presente "
        "une grille d'enfants avec des statistiques par enfant. La navigation mobile est organisee en 5 elements "
        "(Accueil, Enfants, Factures, Bulletins, Messages).", body_style))
    story.append(Spacer(1, 8))

    parent_rows = [
        ['Tableau de bord', 'Vue enfants + statistiques', 'Fonctionne', 'Grille enfants, infos par enfant, stats globales'],
        ['Mes Enfants', 'Liste + detail par enfant', 'Fonctionne', 'Infos academiques et financieres par enfant'],
        ['Detail enfant', 'Notes, presences, devoirs', 'Fonctionne', 'Acces complet aux donnees de l\'enfant'],
        ['Statistiques', 'Analyse performance enfants', 'Partiel', 'Dashboard analytics limite'],
        ['Bulletins', 'Consultation bulletins', 'Fonctionne', 'Acces aux bulletins PDF'],
        ['Factures', 'Consultation + paiement', 'Fonctionne', 'Liste factures, statuts paiement'],
        ['Messages non lus', 'Compteur messages', 'Non fonctionnel', 'Retourne toujours 0 (TODO: Phase 3)'],
        ['Pre-inscription', 'Inscription en ligne', 'Fonctionne', 'Formulaire accessible'],
        ['Rendez-vous', 'Prise de rendez-vous', 'Partiel', 'Page presente, fonctionnalite basique'],
    ]
    story.append(make_table(
        ['Page', 'Fonctionnalites', 'Statut', 'Remarques'],
        parent_rows,
        col_widths=[W*0.18, W*0.28, W*0.14, W*0.40]
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>Tableau 8.</b> Audit Interface Parent', caption_style))
    story.append(Spacer(1, 18))

    # --- 2.4 ELEVE ---
    story.append(add_heading('<b>2.4 Role Eleve / Etudiant (STUDENT)</b>', h2_style, 1))
    story.append(Paragraph(
        "L'interface eleve dispose de 7 routes principales. L'eleve peut consulter ses notes, ses devoirs, "
        "son emploi du temps, les offres de stages et communiquer avec ses enseignants. Le systeme de terminologie "
        "dynamique adapte automatiquement 'eleve' en 'etudiant' pour les etablissements de type universite. "
        "Le badge numerique est un element de gamification qui motive l'assiduite.", body_style))
    story.append(Spacer(1, 8))

    student_rows = [
        ['Tableau de bord', 'Stats, emploi du temps, notes recentes', 'Fonctionne', 'Widget stats, schedule du jour, quick links'],
        ['Mes Notes', 'Consultation notes + moyennes', 'Fonctionne', 'Table des notes, graphiques'],
        ['Devoirs', 'Liste + soumission', 'Partiel', 'Visualisation OK, soumission en ligne limitee'],
        ['Emploi du temps', 'Grille horaire personnelle', 'Fonctionne', 'Filtre par jour/semaine'],
        ['Carrieres et stages', 'Offres disponibles', 'Fonctionne', 'Pipeline d\'offres accessible'],
        ['Messages', 'Communication enseignants', 'Fonctionne', 'Messagerie interne'],
        ['Pre-inscription', 'Reinscription', 'Fonctionne', 'Formulaire accessible'],
    ]
    story.append(make_table(
        ['Page', 'Fonctionnalites', 'Statut', 'Remarques'],
        student_rows,
        col_widths=[W*0.18, W*0.28, W*0.14, W*0.40]
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>Tableau 9.</b> Audit Interface Eleve / Etudiant', caption_style))
    story.append(Spacer(1, 18))

    # --- 2.5 ALUMNI ---
    story.append(add_heading('<b>2.5 Role Alumni</b>', h2_style, 1))
    story.append(Paragraph(
        "L'interface alumni est la plus reduite avec seulement 4 routes. Le dashboard, les demandes de documents, "
        "la messagerie et les carrieres constituent l'essentiel de l'experience alumni. Le programme de mentorat, "
        "qui serait un differenciateur fort, est affiche comme 'coming soon' et n'est pas du tout implemente. "
        "Les profils alumni ne sont pas accessibles depuis l'interface admin (endpoint manquant).", body_style))
    story.append(Spacer(1, 8))

    alumni_rows = [
        ['Tableau de bord', 'Vue d\'ensemble alumni', 'Partiel', 'Basique, stats limitees'],
        ['Demandes de documents', 'Releves, certificats', 'Partiel', 'Interface existe mais profils alumni retournent []'],
        ['Messages', 'Communication etablissement', 'Fonctionne', 'Messagerie interne OK'],
        ['Carrieres', 'Offres et reseautage', 'Non fonctionnel', 'Mentorat en "coming soon"'],
    ]
    story.append(make_table(
        ['Page', 'Fonctionnalites', 'Statut', 'Remarques'],
        alumni_rows,
        col_widths=[W*0.18, W*0.28, W*0.14, W*0.40]
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>Tableau 10.</b> Audit Interface Alumni', caption_style))
    story.append(Spacer(1, 18))

    # --- 2.6 CHEF DE DEPARTEMENT ---
    story.append(add_heading('<b>2.6 Role Chef de Departement (DEPARTMENT_HEAD)</b>', h2_style, 1))
    story.append(Paragraph(
        "L'interface chef de departement dispose de 11 routes, ce qui en fait la troisieme interface la plus etendue. "
        "Elle couvre la gestion des classes, des enseignants, des examens, des presences, de l'emploi du temps et "
        "des rapports. Le chef de departement a un acces restreint aux donnees de son departement uniquement, grace "
        "au systeme d'isolation multi-tenant.", body_style))
    story.append(Spacer(1, 8))

    dept_rows = [
        ['Tableau de bord', 'KPIs departement', 'Partiel', 'Stats basiques, pourrait etre enrichi'],
        ['Classes', 'Gestion classes departement', 'Fonctionne', 'CRUD complet'],
        ['Eleves', 'Liste eleves departement', 'Fonctionne', 'Filtres et recherche'],
        ['Enseignants', 'Equipe enseignante', 'Fonctionne', 'Assignations et stats'],
        ['Examens', 'Gestion examens', 'Fonctionne', 'CRUD evaluations'],
        ['Presences', 'Suivi assiduite', 'Fonctionne', 'Stats par classe'],
        ['Emploi du temps', 'Planning departement', 'Fonctionne', 'Grille horaire'],
        ['Calendrier examens', 'Planning evaluations', 'Fonctionne', 'Vue calendaire'],
        ['Messages', 'Communication', 'Fonctionne', 'Messagerie interne'],
        ['Rapports', 'Rapports departement', 'Partiel', 'Exportable mais basique'],
        ['Historique alertes', 'Journal alertes', 'Fonctionne', 'Consultation historique'],
    ]
    story.append(make_table(
        ['Page', 'Fonctionnalites', 'Statut', 'Remarques'],
        dept_rows,
        col_widths=[W*0.18, W*0.28, W*0.14, W*0.40]
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>Tableau 11.</b> Audit Interface Chef de Departement', caption_style))
    story.append(Spacer(1, 18))

    # --- 2.7 SUPER ADMIN ---
    story.append(add_heading('<b>2.7 Role Super Administrateur (SUPER_ADMIN)</b>', h2_style, 1))
    story.append(Paragraph(
        "Le super administrateur dispose de 3 routes et peut gerer l'ensemble des etablissements (tenants). "
        "Il peut creer de nouveaux etablissements, consulter les statistiques globales et acceder au dashboard "
        "dedie. Le super admin contourne les restrictions multi-tenant via le header X-Tenant-ID, ce qui "
        "constitue a la fois une fonctionnalite necessaire et un risque de securite si non correctement valide.", body_style))
    story.append(Spacer(1, 8))

    sa_rows = [
        ['Dashboard global', 'Statistiques tous tenants', 'Partiel', 'Tenant stats hardcodes a 0 (students: 0, users: 0)'],
        ['Liste etablissements', 'Gestion multi-tenant', 'Fonctionne', 'CRUD complet, onboarding wizard'],
        ['Nouvel etablissement', 'Creation + admin', 'Fonctionne', 'Wizard complet avec initialisation auto'],
        ['Stats globales', 'Aggregate statistics', 'Partiel', 'Endpoint existe mais stats par tenant = 0'],
    ]
    story.append(make_table(
        ['Page', 'Fonctionnalites', 'Statut', 'Remarques'],
        sa_rows,
        col_widths=[W*0.18, W*0.28, W*0.14, W*0.40]
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>Tableau 12.</b> Audit Interface Super Administrateur', caption_style))
    story.append(Spacer(1, 18))

    # ========================================================
    # 3. AUDIT BACKEND API
    # ========================================================
    story.append(add_heading('<b>3. Audit Backend API</b>', h1_style, 0))
    story.append(Paragraph(
        "Le backend FastAPI comprend plus de 150 endpoints repartis en trois categories principales : endpoints "
        "core (auth, users, tenants, analytics, audit, MFA, storage, notifications, RGPD, AI), endpoints academiques "
        "(students, grades, attendance, academic years, campuses, levels, subjects, departments, terms, assessments, "
        "teachers) et endpoints operationnels/financiers (infrastructure, HR, school-life, parents, admissions, "
        "schedule, communication, inventory, library, clubs, incidents, surveys). L'audit a revele des problemes "
        "critiques de securite, des endpoints manquants et des implementations incompletes.", body_style))
    story.append(Spacer(1, 12))

    story.append(add_heading('<b>3.1 Vulnerabilites de Securite Critiques</b>', h2_style, 1))
    security_rows = [
        ['CORS ouvert avec credentials', 'origins = ["*"] + allow_credentials=True par defaut', 'CRITIQUE', 'Tout site web peut faire des requetes avec credentials. Pas de validation en production.'],
        ['Injection SQL potentielle', 'users.py:655 - nom de table dynamique sans validation', 'CRITIQUE', 'body.type utilise dans f-string SQL sans verification prealable'],
        ['Mot de passe en clair dans reponse', 'POST /users/{id}/reset-password/ retourne temp_password', 'CRITIQUE', 'Expose le mot de passe dans les logs, historique navigateur'],
        ['JWT non verifie dans middleware', 'TenantMiddleware utilise get_unverified_claims()', 'CRITIQUE', 'Un JWT forge peut injecter un tenant_id arbitraire'],
        ['Cross-tenant access', 'SUPER_ADMIN peut injecter X-Tenant-ID sans verification', 'CRITIQUE', 'Pas de verification que le tenant_id existe reellement en DB'],
        ['Pas de changement mot de passe', 'Endpoint /auth/change-password/ absent', 'HAUT', 'Les utilisateurs ne peuvent pas changer leur propre mot de passe'],
        ['Pas de validation force mot de passe', 'SecuritySettings existent mais jamais appliquees', 'HAUT', 'mots de passe de 1 caractere acceptes'],
        ['DEBUG = True par defaut', 'os.getenv("DEBUG", "True")', 'HAUT', 'Docs API exposes, tracebacks visibles si variable non definie'],
        ['Credentiels admin hardcodes', 'Admin@123456 dans le code source', 'MOYEN', 'Mot de passe par defaut predicable'],
        ['WebSocket sans auth', 'Accepte tout tenant_id/user_id', 'HAUT', 'Pas de verification JWT pour les connexions WebSocket'],
    ]
    story.append(make_table(
        ['Vulnerabilite', 'Description', 'Severite', 'Impact'],
        security_rows,
        col_widths=[W*0.22, W*0.32, W*0.12, W*0.34]
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>Tableau 13.</b> Vulnerabilites de securite identifiees', caption_style))
    story.append(Spacer(1, 12))

    story.append(add_heading('<b>3.2 Endpoints Manquants ou Incomplets</b>', h2_style, 1))
    missing_rows = [
        ['PUT /infrastructure/classrooms/{id}/', 'Modification salle de classe', 'CRITIQUE', 'Frontend appelle, backend ne repond pas'],
        ['DELETE /infrastructure/classrooms/{id}/', 'Suppression salle de classe', 'CRITIQUE', 'Frontend appelle, backend ne repond pas'],
        ['PUT /infrastructure/rooms/{id}/', 'Modification salle', 'HAUT', 'CRUD incomplet'],
        ['DELETE /infrastructure/rooms/{id}/', 'Suppression salle', 'HAUT', 'CRUD incomplet'],
        ['PUT /infrastructure/programs/{id}/', 'Modification programme', 'HAUT', 'CRUD incomplet'],
        ['DELETE /infrastructure/programs/{id}/', 'Suppression programme', 'HAUT', 'CRUD incomplet'],
        ['POST /auth/change-password/', 'Changement mot de passe', 'CRITIQUE', 'Page frontend existe, pas de backend'],
        ['GET /users/profiles/?role=ALUMNI', 'Profils alumni', 'HAUT', 'Retourne tableau vide'],
        ['GET /analytics/elearning/courses/', 'Liste cours e-learning', 'HAUT', 'Backend non implemente'],
        ['POST /academic/courses/lessons/quiz/', 'Quiz e-learning', 'HAUT', 'Backend non implemente'],
        ['GET /tenants/{id}/stats/', 'Stats tenant pour SA', 'HAUT', 'Retourne des zeros'],
    ]
    story.append(make_table(
        ['Endpoint', 'Description', 'Severite', 'Impact'],
        missing_rows,
        col_widths=[W*0.30, W*0.25, W*0.12, W*0.33]
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>Tableau 14.</b> Endpoints manquants ou incomplets', caption_style))
    story.append(Spacer(1, 12))

    story.append(add_heading('<b>3.3 Endpoints avec Donnees Fictives</b>', h2_style, 1))
    mock_rows = [
        ['POST /ai/generate/', 'Generation contenu AI (legacy)', 'Retourne des chaines mock de quiz/resume'],
        ['GET /analytics/operational-kpis/', 'KPIs operationnels', 'totalTeacherHours = 0, activeTeachers = 0'],
        ['POST /analytics/cash-flow-forecast/', 'Previsions tresorerie', 'Retourne [5000, 5200, 5500]'],
        ['POST /payments/{id}/pay/', 'Paiement en ligne', 'URL mock: https://mock-payment-gateway.schoolflow.pro'],
        ['GET /rgpd/stats/', 'Statistiques RGPD', 'totalConsents = 0 (pas de gestion consentements)'],
        ['GET /school-life/gamification/stats/', 'Stats gamification', 'totalPoints = 0, totalStudents = 0'],
    ]
    story.append(make_table(
        ['Endpoint', 'Description', 'Donnees Fictives'],
        mock_rows,
        col_widths=[W*0.28, W*0.28, W*0.44]
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>Tableau 15.</b> Endpoints retournant des donnees factices', caption_style))
    story.append(Spacer(1, 18))

    # ========================================================
    # 4. AUDIT FRONTAL - STUBS ET PROBLEMES
    # ========================================================
    story.append(add_heading('<b>4. Audit Frontend - Stubs et Fonctionnalites Cassees</b>', h1_style, 0))
    story.append(Paragraph(
        "L'audit du frontend a identifie 9 commentaires TODO, 12+ implementations de type stub, 6+ fonctionnalites "
        "desactivees (retournant null ou tableau vide), 7+ valeurs hardcodees et 5+ interfaces en 'coming soon'. "
        "Ces problemes sont repartis dans plusieurs modules critiques et affectent directement l'experience utilisateur "
        "en production.", body_style))
    story.append(Spacer(1, 12))

    story.append(add_heading('<b>4.1 Fonctionnalites Completement Non Operationnelles</b>', h2_style, 1))
    stubs_rows = [
        ['E-learning (3 queries)', 'Course list, modules, enrollments retournent []', 'CRITIQUE', 'Donnees perdues au refresh (state local uniquement)'],
        ['Temps reel presence', 'RealtimePresence retourne null', 'CRITIQUE', 'Migre de Supabase, pas de remplacement'],
        ['Temps reel notes partagees', 'SharedNotes subscription desactivee', 'HAUT', 'Notes ne se mettent pas a jour entre utilisateurs'],
        ['Sync admin temps reel', 'Realtime sync desactivee dans AdminLayout', 'HAUT', 'Dashboard ne rafraichit pas automatiquement'],
        ['Sessions actives', 'Retourne tableau vide', 'CRITIQUE', 'Page Securite > Sessions ne montre rien'],
        ['Compteur messages parent', 'Retourne toujours 0', 'CRITIQUE', 'Parents ne voient jamais de messages non lus'],
        ['Stats enseignant dashboard', 'pendingHomework = 0 placeholder', 'HAUT', 'Dashboard enseignant incomplet'],
        ['Inscriptions evenements', 'Retourne tableau vide', 'CRITIQUE', 'Pas de suivi des inscriptions aux evenements'],
        ['Profils alumni', 'Retourne tableau vide', 'CRITIQUE', 'Gestion des demandes de documents cassee'],
    ]
    story.append(make_table(
        ['Fonctionnalite', 'Comportement reel', 'Severite', 'Impact Utilisateur'],
        stubs_rows,
        col_widths=[W*0.20, W*0.30, W*0.12, W*0.38]
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>Tableau 16.</b> Fonctionnalites completement non operationnelles', caption_style))
    story.append(Spacer(1, 12))

    story.append(add_heading('<b>4.2 Valeurs Hardcodees et Donnees Statiques</b>', h2_style, 1))
    hardcoded_rows = [
        ['Dashboard admin', 'pendingAdmissions = 0', 'Toujours 0, meme avec des admissions en attente'],
        ['Dashboard KPI', 'Evolution notes = []', 'Graphique toujours vide'],
        ['Dashboard KPI', 'Charge enseignants = []', 'Graphique toujours vide'],
        ['Dashboard KPI', 'Inscriptions par classe ignore la reponse API', 'Fetch OK mais retourne [] au lieu des donnees'],
        ['DecisionDashboard', '14.2k euros bourses', 'Valeur statique jamais mise a jour'],
        ['DecisionDashboard', '+12.5% vs an dernier', 'Pourcentage hardcode'],
        ['DecisionDashboard', 'Score efficacite 8.4', 'Fallback hardcode si pas de donnees'],
        ['AI Insights', 'Impacts: "30% reduction", "15% presence"', 'Pourcentages fictifs dans les recommandations'],
        ['SuperAdmin', 'Tenant stats: students=0, users=0', 'Jamais mis a jour avec les vraies donnees'],
        ['StatsWidget', 'Eleves: 1247, Enseignants: 86', 'Donnees de demo si pas de props'],
    ]
    story.append(make_table(
        ['Emplacement', 'Valeur Hardcodee', 'Consequence'],
        hardcoded_rows,
        col_widths=[W*0.22, W*0.38, W*0.40]
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>Tableau 17.</b> Valeurs hardcodees identifiees', caption_style))
    story.append(Spacer(1, 18))

    # ========================================================
    # 5. ANALYSE CONCURRENTIELLE
    # ========================================================
    story.append(add_heading('<b>5. Analyse Concurrentielle</b>', h1_style, 0))
    story.append(Paragraph(
        "L'analyse concurrentielle a couvert 15 solutions majeures du marche, reparties en quatre categories : "
        "SIS commerciaux globaux (PowerSchool, Schoology, SchoolMint, Gradelink, Veracross, Infinite Campus, "
        "Blackbaud), ERP universitaires (Ellucian Banner, Oracle Student Cloud, Unit4, OpenEduCat), solutions "
        "open source (OpenSIS, Gibbon, RosarioSIS, Fedena) et solutions Africa francophone (Skolae, Pronote, "
        "ENT, Kosy School, Educore). L'analyse a permis d'identifier 20 fonctionnalites cles manquantes chez "
        "SchoolFlow Pro par rapport aux meilleurs concurrents.", body_style))
    story.append(Spacer(1, 12))

    story.append(add_heading('<b>5.1 Positionnement Concurrentiel</b>', h2_style, 1))
    competitor_rows = [
        ['PowerSchool', 'Global', 'Complet', '70-100k$/an', 'Leader mondial, tres complet'],
        ['Schoology (PowerSchool)', 'Global', 'LMS + SIS', '10-120$/el/an', 'Excellent LMS integre'],
        ['SchoolMint', 'Global', 'Admissions', 'Variable', 'Specialise admissions/recrutement'],
        ['Pronote', 'France', 'Complet', 'Gratuit ecoles', 'Leader France, tres mature'],
        ['Ellucian Banner', 'Universite', 'ERP complet', 'Très cher', 'Standard universites mondiales'],
        ['OpenSIS', 'Open Source', 'SIS de base', 'Gratuit', 'Base solide mais UI datee'],
        ['Fedena', 'Open Source', 'Multi-module', 'Gratuit/Payant', 'Populaire pays en developpement'],
        ['Skolae', 'Afrique francophone', 'Gestion scolaire', 'Variable', 'Concurent direct regional'],
        ['SchoolFlow Pro', 'Afrique francophone', 'SaaS multi-tenant', 'Non defini', 'Approche SaaS moderne, mobile-first'],
    ]
    story.append(make_table(
        ['Solution', 'Marche', 'Type', 'Prix', 'Note'],
        competitor_rows,
        col_widths=[W*0.16, W*0.16, W*0.16, W*0.16, W*0.36]
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>Tableau 18.</b> Positionnement concurrentiel', caption_style))
    story.append(Spacer(1, 12))

    story.append(add_heading('<b>5.2 Fonctionnalites Cles Manquantes vs Concurrents</b>', h2_style, 1))
    missing_features = [
        ['1', 'Paiement Mobile Money', 'Orange Money, Wave, MTN MoMo', 'CRITIQUE', 'Parents africains dependent du mobile money'],
        ['2', 'Generation automatique emploi du temps', 'Algorithme de contraintes', 'CRITIQUE', 'Tache la plus douloureuse pour les admins'],
        ['3', 'Systeme SMS', 'Notifications par SMS', 'CRITIQUE', 'Internet non fiable - SMS atteint tous les parents'],
        ['4', 'Devoirs et devoirs en ligne', 'Assignation + soumission + notation', 'CRITIQUE', 'Feature educative de base absente'],
        ['5', 'Examen en ligne / Quiz', 'Moteur d\'evaluation en ligne', 'CRITIQUE', 'Necessite post-COVID pour universites'],
        ['6', 'Generation releves de notes officiels', 'Transcripts officiels', 'CRITIQUE', 'Bloquant pour universites'],
        ['7', 'Biometrie (pointage)', 'Empreinte/visage pour presences', 'HAUTE', 'Reduit le buddy-punching'],
        ['8', 'Gestion transport scolaire', 'Itineraires + suivi bus GPS', 'HAUTE', 'Securite enfants, suivi parents'],
        ['9', 'Gestion internat/dortoirs', 'Chambres, affectations', 'HAUTE', 'Requis pour universites avec campus'],
        ['10', 'Bourses et aide financiere', 'Gestion bourses/subventions', 'HAUTE', 'Nombreux etudiants africains dependent de l\'aide'],
        ['11', 'Dossiers medicaux', 'Sante eleves, vaccins', 'HAUTE', 'Conformite post-COVID'],
        ['12', 'Gestion cantine', 'Repas, menus, Paiement', 'HAUTE', 'Operations quotidiennes ecoles'],
        ['13', 'LMS complet (contenu de cours)', 'Video, documents, SCORM', 'MOYENNE', 'Ecart majeur vs Schoology/Moodle'],
        ['14', 'Detection plagiat', 'Verification originalite', 'MOYENNE', 'Soumissions universitaires'],
        ['15', 'Apprentissage adaptatif', 'Parcours personnalises IA', 'MOYENNE', 'Differentiateur futur'],
        ['16', 'Portail developpeur API', 'Documentation API publique', 'MOYENNE', 'Ecosysteme et integrations'],
        ['17', 'Constructeur de dashboards', 'Dashboards personnalises', 'MOYENNE', 'Personnalisation et adherence'],
        ['18', 'Suivi GPS bus', 'Localisation temps reel', 'MOYENNE', 'Feature de securite pour parents'],
        ['19', 'Multi-devise / CFA', 'Support FCFA, USD, EUR', 'MOYENNE', 'Specificite marche africain'],
        ['20', 'Mode hors-ligne avance', 'Sync offline complet', 'MOYENNE', 'Zones a connectivite limitee'],
    ]
    story.append(make_table(
        ['N.', 'Feature', 'Details', 'Priorite', 'Justification'],
        missing_features,
        col_widths=[W*0.04, W*0.20, W*0.28, W*0.12, W*0.36]
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>Tableau 19.</b> Top 20 fonctionnalites manquantes vs concurrents', caption_style))
    story.append(Spacer(1, 12))

    story.append(add_heading('<b>5.3 Avantages Competitifs de SchoolFlow Pro</b>', h2_style, 1))
    advantages = [
        "Concu en francais en premier - contrairement a PowerSchool ou Schoology qui sont anglais-centriques",
        "Architecture multi-tenant SaaS moderne - chaque etablissement est isole avec ses propres donnees",
        "Approche mobile-first avec PWA et application native Capacitor (Android/iOS)",
        "Gamification integree (badges, classements, points) - unique dans le marche SIS africain",
        "IA integree (Groq) pour insights, recommandations et analyse de risques",
        "Marketplace pour ressources pedagogiques - concept innovant peu present chez les concurrents",
        "Conformite RGPD native - export et suppression de donnees personnelles",
        "Check-in QR code et badges numeriques - moderne et pratique",
        "Terminologie dynamique (eleve/etudiant) - s'adapte au type d'etablissement automatiquement",
        "Onboarding wizard - initialisation guidee en 4 etapes",
        "Architecture de securite avancee - JWT, MFA, audit logging, rate limiting, isolation tenant",
        "i18n 5 langues (FR, EN, ES, AR, ZH) - couverture linguistique large pour l'Afrique",
    ]
    for adv in advantages:
        story.append(Paragraph(f"  +  {adv}", body_indent_style))
    story.append(Spacer(1, 18))

    # ========================================================
    # 6. AXES D'AMELIORATION
    # ========================================================
    story.append(add_heading('<b>6. Axes d\'Amelioration et Plan d\'Evolution</b>', h1_style, 0))
    story.append(Paragraph(
        "Sur la base de l'audit complet, nous proposons un plan d'evolution structure en 4 phases. Ce plan vise "
        "a atteindre 100% de maturite fonctionnelle tout en integrant les fonctionnalites cles identifiees dans "
        "l'analyse concurrentielle. Chaque phase est estimee en termes d'effort et d'impact commercial.", body_style))
    story.append(Spacer(1, 12))

    story.append(add_heading('<b>6.1 Phase 1 - Securite et Corrections Critiques (2-3 semaines)</b>', h2_style, 1))
    story.append(Paragraph(
        "Cette phase est absolument prioritaire et doit etre realisee avant toute demonstration commerciale. "
        "Les vulnerabilites de securite identifiees representent un risque majeur pour la credibilite du produit "
        "et la protection des donnees des utilisateurs.", body_style))
    story.append(Spacer(1, 6))

    phase1_rows = [
        ['S1', 'Corriger CORS en production', 'Ajouter validation BACKEND_CORS_ORIGINS obligatoire', '2h'],
        ['S2', 'Valider nom de table dans convert', 'Ajouter check type in ("student", "parent")', '1h'],
        ['S3', 'Ne pas retourner mot de passe en clair', 'Envoyer par email au lieu de la reponse API', '3h'],
        ['S4', 'Verifier JWT dans TenantMiddleware', 'Remplacer get_unverified_claims par verification', '4h'],
        ['S5', 'Valider X-Tenant-ID pour SUPER_ADMIN', 'Verifier existence du tenant en DB', '2h'],
        ['S6', 'Ajouter endpoint changement mot de passe', 'POST /auth/change-password/ avec validation', '4h'],
        ['S7', 'Enforcer validation force mot de passe', 'Appliquer TenantSecuritySettings sur creation/reset', '3h'],
        ['S8', 'Corriger DEBUG default True', 'Changer par defaut a False', '0.5h'],
        ['S9', 'Fixer enrollmentByClass', 'Retourner response.data au lieu de []', '0.5h'],
        ['S10', 'Fixer pagination auditLogs', 'Utiliser le total du serveur', '1h'],
        ['S11', 'Ajouter PUT/DELETE classrooms', 'Completer le CRUD infrastructure', '4h'],
        ['S12', 'Supprimer valeurs hardcodees DecisionDashboard', 'Connecter aux vrais KPIs', '6h'],
    ]
    story.append(make_table(
        ['ID', 'Action', 'Detail', 'Effort'],
        phase1_rows,
        col_widths=[W*0.06, W*0.28, W*0.52, W*0.14]
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>Tableau 20.</b> Phase 1 - Corrections critiques', caption_style))
    story.append(Spacer(1, 12))

    story.append(add_heading('<b>6.2 Phase 2 - Fonctionnalites Operationnelles (3-4 semaines)</b>', h2_style, 1))
    story.append(Paragraph(
        "Cette phase vise a rendre toutes les pages et fonctionnalites existantes pleinement operationnelles. "
        "L'objectif est de transformer les squelettes et stubs en fonctionnalites completes avec des vraies "
        "donnees dynamiques.", body_style))
    story.append(Spacer(1, 6))

    phase2_rows = [
        ['F1', 'Implementer backend e-learning', 'Cours, modules, lecons, quiz - schema DB + endpoints', '40h'],
        ['F2', 'Implementer stats dashboard enseignant', 'Connecter pendingHomework, KPIs reels', '8h'],
        ['F3', 'Connecter parent unread messages', 'Migrer vers API communication', '4h'],
        ['F4', 'Implementer sessions actives', 'Tracking JWT avec Redis', '12h'],
        ['F5', 'Implementer inscriptions evenements', 'Backend + frontend complet', '8h'],
        ['F6', 'Implementer profils alumni', 'Endpoint GET /users/profiles/?role=ALUMNI', '6h'],
        ['F7', 'Implementer stats tenant pour SuperAdmin', 'Agregations par tenant', '8h'],
        ['F8', 'Remplacer donnees mock analytics', 'Requetes SQL reelles pour tous les KPIs', '16h'],
        ['F9', 'Implementer pagination RH backend', 'Ajouter OFFSET/LIMIT + COUNT sur tous endpoints HR', '8h'],
        ['F10', 'Completer validation Pydantic', 'Schemas pour tous les endpoints dict-accepting', '12h'],
        ['F11', 'Implementer preview emploi du temps classes', 'Composant SchedulePreview dans ClassDetailModal', '8h'],
        ['F12', 'Implementer mentorat alumni', 'Systeme de matching mentor-mentore', '20h'],
    ]
    story.append(make_table(
        ['ID', 'Action', 'Detail', 'Effort'],
        phase2_rows,
        col_widths=[W*0.06, W*0.30, W*0.50, W*0.14]
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>Tableau 21.</b> Phase 2 - Fonctionnalites operationnelles', caption_style))
    story.append(Spacer(1, 12))

    story.append(add_heading('<b>6.3 Phase 3 - Integration Mobile Money et SMS (4-6 semaines)</b>', h2_style, 1))
    story.append(Paragraph(
        "Cette phase est critique pour le marche africain. Le paiement mobile money et les notifications SMS "
        "sont des fonctionnalites indispensables pour l'adoption du produit dans les ecoles et universites "
        "francophones d'Afrique. Sans ces integrations, le systeme reste inutilisable pour une grande majorite "
        "de parents qui n'ont pas de carte bancaire et n'ont pas un acces internet fiable.", body_style))
    story.append(Spacer(1, 6))

    phase3_rows = [
        ['M1', 'Integrer Orange Money', 'API Orange Money pour paiements factures', '40h'],
        ['M2', 'Integrer Wave', 'API Wave pour paiements Senegal', '24h'],
        ['M3', 'Integrer MTN Mobile Money', 'API MTN MoMo pour paiements', '40h'],
        ['M4', 'Systeme SMS notifications', 'Integrateur SMS (Twilio/Infobip/AfricaTalking)', '32h'],
        ['M5', 'Webhooks paiement', 'Gestion callbacks asynchrones des paiements', '16h'],
        ['M6', 'Releves de notes officiels', 'Generation PDF officiels avec tampon et signature', '24h'],
        ['M7', 'Systeme de devoirs complet', 'Assignation, soumission, notation, feedback', '40h'],
        ['M8', 'Moteur examens en ligne', 'QCM, reponses courtes, minutage, anti-triche', '60h'],
    ]
    story.append(make_table(
        ['ID', 'Action', 'Detail', 'Effort'],
        phase3_rows,
        col_widths=[W*0.06, W*0.30, W*0.50, W*0.14]
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>Tableau 22.</b> Phase 3 - Integrations cles marche africain', caption_style))
    story.append(Spacer(1, 12))

    story.append(add_heading('<b>6.4 Phase 4 - Differentiateurs et Evolution (6-8 semaines)</b>', h2_style, 1))
    story.append(Paragraph(
        "Cette phase vise a developper les fonctionnalites qui differencieront SchoolFlow Pro de la concurrence "
        "et renforceront sa position sur le marche africain. Il s'agit d'investissements strategiques a moyen terme "
        "qui augmenteront la valeur percue du produit et la fidelisation des etablissements.", body_style))
    story.append(Spacer(1, 6))

    phase4_rows = [
        ['D1', 'Generation automatique emplois du temps', 'Algorithme de contraintes (enseignant, salle, horaire)', '80h'],
        ['D2', 'Gestion transport scolaire', 'Itineraires, suivi GPS, notifications parents', '60h'],
        ['D3', 'Gestion internat', 'Chambres, affectations, reglement, visiteurs', '48h'],
        ['D4', 'Bourses et aide financiere', 'Criteres, attribution, suivi, reporting', '32h'],
        ['D5', 'Dossiers medicaux', 'Vaccins, allergies, visites medicales', '24h'],
        ['D6', 'Gestion cantine', 'Menus, tickets, Paiement, allergies', '32h'],
        ['D7', 'Temps reel WebSocket complet', 'Presence, notes, notifications en temps reel', '40h'],
        ['D8', 'LMS avance (contenu video)', 'Upload video, SCORM, progression', '60h'],
        ['D9', 'Mode hors-ligne avance', 'Sync bidirectionnelle, queue offline', '40h'],
        ['D10', 'Portail API developpeur', 'Documentation OpenAPI, sandbox, webhooks', '48h'],
    ]
    story.append(make_table(
        ['ID', 'Action', 'Detail', 'Effort'],
        phase4_rows,
        col_widths=[W*0.06, W*0.30, W*0.50, W*0.14]
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>Tableau 23.</b> Phase 4 - Differentiateurs strategiques', caption_style))
    story.append(Spacer(1, 18))

    # ========================================================
    # 7. SYNTHESE ET RECOMMANDATIONS
    # ========================================================
    story.append(add_heading('<b>7. Synthese et Recommandations Strategiques</b>', h1_style, 0))
    story.append(Paragraph(
        "SchoolFlow Pro est un projet ambitieux avec une architecture moderne et une couverture fonctionnelle "
        "impressionnante pour un produit en version pre-production. Le systeme couvre deja la quasi-totalite des "
        "besoins de gestion scolaire de base, avec des fonctionnalites avancees comme l'IA, la gamification et "
        "le multi-tenant SaaS qui sont rares dans les solutions du marche africain.", body_style))
    story.append(Spacer(1, 8))

    story.append(Paragraph(
        "Cependant, l'audit a revele des problemes significatifs qui doivent etre adresses avant toute "
        "commercialisation. Les vulnerabilites de securite sont le risque le plus imminent : un CORS ouvert "
        "avec credentials, un middleware qui ne verifie pas les JWT, et des mots de passe en clair dans les "
        "reponses API suffiraient a discrediter le produit lors d'une demonstration. Les 10 fonctionnalites "
        "completement non operationnelles (e-learning, temps reel, sessions actives, etc.) doivent soit etre "
        "completement implementees soit clairement retirees de l'interface pour eviter de frustrer les utilisateurs.", body_style))
    story.append(Spacer(1, 8))

    story.append(Paragraph(
        "L'analyse concurrentielle montre que SchoolFlow Pro a un positionnement unique grace a son approche "
        "SaaS multi-tenant, mobile-first, avec IA integree et gamification. Mais pour penetrer serieusement le "
        "marche africain, les integrations Mobile Money (Orange Money, Wave, MTN MoMo) et les notifications SMS "
        "sont absolument indispensables. L'absence de ces fonctionnalites dans un produit destine a l'Afrique "
        "francophone est un obstacle majeur a l'adoption.", body_style))
    story.append(Spacer(1, 8))

    story.append(Paragraph(
        "Nous recommandons de suivre le plan en 4 phases defini dans la section 6, en priorisant la Phase 1 "
        "(securite) pour les 2-3 prochaines semaines, suivie de la Phase 2 (fonctionnalites) pour atteindre "
        "un produit presentable commercialement. Les Phases 3 et 4 pourront etre lancees en parallele une fois "
        "les corrections critiques validees, avec un focus particulier sur Mobile Money et SMS qui sont les "
        "facteurs cles de succes sur le marche cible.", body_style))
    story.append(Spacer(1, 12))

    story.append(add_heading('<b>7.1 Estimation de l\'Effort Total</b>', h2_style, 1))
    effort_rows = [
        ['Phase 1 - Securite et Corrections Critiques', '12 correctifs', '35 heures', '2-3 semaines'],
        ['Phase 2 - Fonctionnalites Operationnelles', '12 fonctionnalites', '150 heures', '3-4 semaines'],
        ['Phase 3 - Mobile Money et SMS', '8 integrations', '276 heures', '4-6 semaines'],
        ['Phase 4 - Differentiateurs', '10 evolutions', '464 heures', '6-8 semaines'],
        ['Total', '42 actions', '925 heures', '15-21 semaines'],
    ]
    story.append(make_table(
        ['Phase', 'Nombre d\'actions', 'Effort estime', 'Duree'],
        effort_rows,
        col_widths=[W*0.35, W*0.20, W*0.20, W*0.25]
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>Tableau 24.</b> Estimation de l\'effort total par phase', caption_style))
    story.append(Spacer(1, 18))

    # ========================================================
    # BUILD PDF
    # ========================================================
    doc.multiBuild(story)
    print(f"PDF genere avec succes : {output_path}")
    return output_path


if __name__ == '__main__':
    output = build_report()
