#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SchoolFlow Pro - Rapport d'Audit Complet de Bout en Bout
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, inch
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.lib import colors
from reportlab.platypus import (
    Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.platypus import SimpleDocTemplate
import os

# ─── Font Registration ───
pdfmetrics.registerFont(TTFont('Microsoft YaHei', '/usr/share/fonts/truetype/chinese/msyh.ttf'))
pdfmetrics.registerFont(TTFont('SimHei', '/usr/share/fonts/truetype/chinese/SimHei.ttf'))
pdfmetrics.registerFont(TTFont('Times New Roman', '/usr/share/fonts/truetype/english/Times-New-Roman.ttf'))
pdfmetrics.registerFont(TTFont('Calibri', '/usr/share/fonts/truetype/english/calibri-regular.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'))

registerFontFamily('Microsoft YaHei', normal='Microsoft YaHei', bold='Microsoft YaHei')
registerFontFamily('SimHei', normal='SimHei', bold='SimHei')
registerFontFamily('Times New Roman', normal='Times New Roman', bold='Times New Roman')
registerFontFamily('Calibri', normal='Calibri', bold='Calibri')

# ─── Colors ───
DARK_BLUE = colors.HexColor('#1F4E79')
LIGHT_BLUE = colors.HexColor('#D6E4F0')
ACCENT_RED = colors.HexColor('#C0392B')
ACCENT_ORANGE = colors.HexColor('#E67E22')
ACCENT_GREEN = colors.HexColor('#27AE60')
LIGHT_GRAY = colors.HexColor('#F5F5F5')
MEDIUM_GRAY = colors.HexColor('#999999')
TABLE_HEADER_COLOR = DARK_BLUE
TABLE_HEADER_TEXT = colors.white
TABLE_ROW_EVEN = colors.white
TABLE_ROW_ODD = LIGHT_GRAY

# ─── Styles ───
cover_title_style = ParagraphStyle(
    name='CoverTitle', fontName='SimHei', fontSize=36, leading=44,
    alignment=TA_CENTER, spaceAfter=24, textColor=DARK_BLUE
)
cover_subtitle_style = ParagraphStyle(
    name='CoverSubtitle', fontName='SimHei', fontSize=18, leading=26,
    alignment=TA_CENTER, spaceAfter=36, textColor=colors.HexColor('#2C3E50')
)
cover_info_style = ParagraphStyle(
    name='CoverInfo', fontName='SimHei', fontSize=13, leading=20,
    alignment=TA_CENTER, spaceAfter=12, textColor=MEDIUM_GRAY
)

h1_style = ParagraphStyle(
    name='H1', fontName='SimHei', fontSize=20, leading=28,
    spaceBefore=18, spaceAfter=10, textColor=DARK_BLUE
)
h2_style = ParagraphStyle(
    name='H2', fontName='SimHei', fontSize=15, leading=22,
    spaceBefore=14, spaceAfter=8, textColor=colors.HexColor('#2C3E50')
)
h3_style = ParagraphStyle(
    name='H3', fontName='SimHei', fontSize=12, leading=18,
    spaceBefore=10, spaceAfter=6, textColor=colors.HexColor('#34495E')
)

body_style = ParagraphStyle(
    name='Body', fontName='SimHei', fontSize=10.5, leading=18,
    alignment=TA_LEFT, spaceAfter=6, wordWrap='CJK',
    firstLineIndent=21
)
body_no_indent = ParagraphStyle(
    name='BodyNoIndent', fontName='SimHei', fontSize=10.5, leading=18,
    alignment=TA_LEFT, spaceAfter=6, wordWrap='CJK'
)

bullet_style = ParagraphStyle(
    name='Bullet', fontName='SimHei', fontSize=10, leading=16,
    alignment=TA_LEFT, spaceAfter=4, leftIndent=20, wordWrap='CJK',
    bulletIndent=8
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
tbl_cell_red = ParagraphStyle(
    name='TblCellRed', fontName='SimHei', fontSize=9, leading=13,
    alignment=TA_LEFT, textColor=ACCENT_RED, wordWrap='CJK'
)
tbl_cell_orange = ParagraphStyle(
    name='TblCellOrange', fontName='SimHei', fontSize=9, leading=13,
    alignment=TA_LEFT, textColor=ACCENT_ORANGE, wordWrap='CJK'
)
tbl_cell_green = ParagraphStyle(
    name='TblCellGreen', fontName='SimHei', fontSize=9, leading=13,
    alignment=TA_LEFT, textColor=ACCENT_GREEN, wordWrap='CJK'
)

caption_style = ParagraphStyle(
    name='Caption', fontName='SimHei', fontSize=9, leading=14,
    alignment=TA_CENTER, textColor=MEDIUM_GRAY, spaceAfter=6
)

# ─── TocDocTemplate ───
class TocDocTemplate(SimpleDocTemplate):
    def __init__(self, *args, **kwargs):
        SimpleDocTemplate.__init__(self, *args, **kwargs)
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
    """Create a styled table with standard colors."""
    data = []
    header_row = [Paragraph('<b>{}</b>'.format(h), tbl_header_style) for h in headers]
    data.append(header_row)
    for row in rows:
        data.append(row)

    if col_widths is None:
        page_w = A4[0] - 2.5*cm - 2.5*cm
        col_widths = [page_w / len(headers)] * len(headers)

    t = Table(data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ('TEXTCOLOR', (0, 0), (-1, 0), TABLE_HEADER_TEXT),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
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

def bullet(text, style=None):
    s = style or bullet_style
    return Paragraph('<bullet>•</bullet> {}'.format(text), s)

# ─── Build Document ───
output_path = '/home/z/my-project/download/SchoolFlow_Pro_Audit_Complet.pdf'
doc = TocDocTemplate(
    output_path, pagesize=A4,
    leftMargin=2.5*cm, rightMargin=2.5*cm,
    topMargin=2.5*cm, bottomMargin=2.5*cm,
    title='SchoolFlow Pro - Audit Complet de Bout en Bout',
    author='Z.ai', creator='Z.ai',
    subject='Audit complet du systeme de gestion scolaire SchoolFlow Pro - Backend, Frontend, Cohérence'
)

story = []
page_w = A4[0] - 2.5*cm - 2.5*cm

# ════════════════════════════════════════════
# COVER PAGE
# ════════════════════════════════════════════
story.append(Spacer(1, 100))
story.append(Paragraph('<b>SchoolFlow Pro</b>', cover_title_style))
story.append(Spacer(1, 20))
story.append(Paragraph('<b>Rapport d\'Audit Complet</b>', cover_subtitle_style))
story.append(Paragraph('De Bout en Bout - Backend, Frontend, Cohérence', cover_subtitle_style))
story.append(Spacer(1, 60))

# Summary box on cover
cover_data = [
    [Paragraph('<b>Métrique</b>', tbl_header_style), Paragraph('<b>Valeur</b>', tbl_header_style)],
    [Paragraph('Endpoints backend analysés', tbl_cell_style), Paragraph('80+ routes', tbl_cell_center)],
    [Paragraph('Composants frontend audités', tbl_cell_style), Paragraph('170+ composants', tbl_cell_center)],
    [Paragraph('Pages frontend', tbl_cell_style), Paragraph('100+ pages', tbl_cell_center)],
    [Paragraph('Modèles de base de données', tbl_cell_style), Paragraph('30+ modèles', tbl_cell_center)],
    [Paragraph('Issues critiques identifiés', tbl_cell_style), Paragraph('14', tbl_cell_center)],
    [Paragraph('Avertissements', tbl_cell_style), Paragraph('28+', tbl_cell_center)],
]
cover_tbl = Table(cover_data, colWidths=[page_w*0.55, page_w*0.45])
cover_tbl.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ('TOPPADDING', (0, 0), (-1, -1), 6),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ('BACKGROUND', (0, 1), (-1, 1), colors.white),
    ('BACKGROUND', (0, 2), (-1, 2), LIGHT_GRAY),
    ('BACKGROUND', (0, 3), (-1, 3), colors.white),
    ('BACKGROUND', (0, 4), (-1, 4), LIGHT_GRAY),
    ('BACKGROUND', (0, 5), (-1, 5), colors.white),
    ('BACKGROUND', (0, 6), (-1, 6), LIGHT_GRAY),
]))
story.append(cover_tbl)

story.append(Spacer(1, 60))
story.append(Paragraph('Date : 9 avril 2026', cover_info_style))
story.append(Paragraph('Environnement : Render (Neon PostgreSQL)', cover_info_style))
story.append(Paragraph('Stack : React + Vite + TypeScript / FastAPI + SQLAlchemy', cover_info_style))
story.append(PageBreak())

# ════════════════════════════════════════════
# TABLE OF CONTENTS
# ════════════════════════════════════════════
toc = TableOfContents()
toc.levelStyles = [
    ParagraphStyle(name='TOC1', fontName='SimHei', fontSize=12, leftIndent=20, spaceBefore=6, leading=18),
    ParagraphStyle(name='TOC2', fontName='SimHei', fontSize=10, leftIndent=40, spaceBefore=3, leading=16),
]
story.append(Paragraph('<b>Table des Matières</b>', h1_style))
story.append(Spacer(1, 12))
story.append(toc)
story.append(PageBreak())

# ════════════════════════════════════════════
# 1. RESUME EXECUTIF
# ════════════════════════════════════════════
story.append(add_heading('<b>1. Résumé Exécutif</b>', h1_style, 0))

story.append(Paragraph(
    'SchoolFlow Pro est un système de gestion scolaire complet déployé sur Render, '
    'combinant un backend FastAPI/SQLAlchemy et un frontend React/Vite/TypeScript. Cette audit de bout en bout '
    'couvre l\'architecture backend, les composants frontend, et la cohérence entre les deux couches. '
    'L\'analyse a révélé un projet ambitieux avec une couverture fonctionnelle remarquable, '
    'mais présentant des problèmes critiques de sécurité, des incohérences '
    'de données entre frontend et backend, et un déficit de performance côté client.',
    body_style
))

story.append(add_heading('<b>1.1 Chiffres Clés</b>', h2_style, 1))

score_data = [
    [Paragraph('<b>Dimension</b>', tbl_header_style), Paragraph('<b>État</b>', tbl_header_style), Paragraph('<b>Détail</b>', tbl_header_style)],
    [Paragraph('Architecture Backend', tbl_cell_style), Paragraph('Bon', tbl_cell_green), Paragraph('FastAPI bien structuré, 80+ routes, multi-tenancy RLS', tbl_cell_style)],
    [Paragraph('Architecture Frontend', tbl_cell_style), Paragraph('Bon', tbl_cell_green), Paragraph('React Query + Zustand, 100+ pages lazy-loaded, i18n 5 langues', tbl_cell_style)],
    [Paragraph('Sécurité', tbl_cell_style), Paragraph('Critique', tbl_cell_red), Paragraph('Identifiants admin en dur, pas de complexité mot de passe, CORS *', tbl_cell_style)],
    [Paragraph('Cohérence FE/BE', tbl_cell_style), Paragraph('Critique', tbl_cell_red), Paragraph('30+ endpoints frontend sans backend, erreurs de payload MFA', tbl_cell_style)],
    [Paragraph('Performance Frontend', tbl_cell_style), Paragraph('Critique', tbl_cell_red), Paragraph('Bundle principal 1 Mo, double système d\'état, PWA désactivée', tbl_cell_style)],
    [Paragraph('Base de Données', tbl_cell_style), Paragraph('Attention', tbl_cell_orange), Paragraph('30+ tables en SQL brut hors Alembic, dérive schéma ORM/DDL', tbl_cell_style)],
    [Paragraph('Tests', tbl_cell_style), Paragraph('Attention', tbl_cell_orange), Paragraph('6 fichiers de tests, pas de CI automatisée', tbl_cell_style)],
]
story.append(make_table(
    ['Dimension', 'État', 'Détail'], score_data,
    [page_w*0.22, page_w*0.13, page_w*0.65]
))
story.append(Spacer(1, 6))
story.append(Paragraph('<b>Tableau 1.</b> Synthèse par dimension', caption_style))
story.append(Spacer(1, 12))

story.append(add_heading('<b>1.2 Classification des Issues</b>', h2_style, 1))

classif_data = [
    [Paragraph('<b>Sévérité</b>', tbl_header_style), Paragraph('<b>Nombre</b>', tbl_header_style), Paragraph('<b>Impact</b>', tbl_header_style)],
    [Paragraph('Critique', tbl_cell_red), Paragraph('14', tbl_cell_center), Paragraph('Bloque le fonctionnement en production, faille sécurité, crash', tbl_cell_style)],
    [Paragraph('Attention', tbl_cell_orange), Paragraph('28+', tbl_cell_center), Paragraph('Fragilité, dette technique, performance dégradée', tbl_cell_style)],
    [Paragraph('Positif', tbl_cell_green), Paragraph('22+', tbl_cell_center), Paragraph('Bonnes pratiques identifiées dans le code', tbl_cell_style)],
]
story.append(make_table(
    ['Sévérité', 'Nombre', 'Impact'], classif_data,
    [page_w*0.2, page_w*0.15, page_w*0.65]
))
story.append(Spacer(1, 6))
story.append(Paragraph('<b>Tableau 2.</b> Classification des issues par sévérité', caption_style))
story.append(Spacer(1, 18))

# ════════════════════════════════════════════
# 2. AUDIT BACKEND
# ════════════════════════════════════════════
story.append(add_heading('<b>2. Audit Backend</b>', h1_style, 0))

story.append(Paragraph(
    'Le backend SchoolFlow Pro est construit avec FastAPI et SQLAlchemy, suivant une architecture en couches '
    'standard (endpoints, CRUD, models, schemas). Il intègre un système multi-tenant avec Row-Level Security (RLS), '
    'un RBAC à 10 rôles, du logging structuré, et des métriques Prometheus. '
    'L\'audit a révélé des problèmes de sécurité critiques et une '
    'gestion de base de données hybride entre ORM et SQL brut.',
    body_style
))

story.append(add_heading('<b>2.1 Architecture et Structure</b>', h2_style, 1))

story.append(Paragraph(
    'Le backend est organisé en modules fonctionnels bien délimités : <font name="Times New Roman">academic/</font> '
    '(élèves, notes, présence), <font name="Times New Roman">core/</font> (auth, utilisateurs, tenants), '
    '<font name="Times New Roman">operational/</font> (RH, infrastructure, bibliothèque), et '
    '<font name="Times New Roman">finance/</font> (paiements). Le middleware stack est correctement ordonné : '
    'CORS en position externe, suivi de RequestID, Metrics, RateLimiting, Tenant, et Quota en position interne. '
    'Le système d\'alias de routes (<font name="Times New Roman">aliases.py</font>) assure la compatibilité '
    'entre les chemins frontend et backend, couvrant 16 routes critiques.',
    body_style
))

story.append(add_heading('<b>2.2 Routes et Endpoints</b>', h2_style, 1))

story.append(Paragraph(
    'L\'analyse des 80+ routes enregistrées dans le <font name="Times New Roman">router.py</font> et les alias '
    'révèle une couverture CRUD complète pour la majorité des ressources principales '
    '(élèves, utilisateurs, notes, termes, niveaux, matières, campus, départements). '
    'Cependant, plusieurs ressources ne disposent que d\'opérations partielles, ce qui limite les '
    'fonctionnalités disponibles pour les utilisateurs.',
    body_style
))

crud_data = [
    [Paragraph('<b>Ressource</b>', tbl_header_style), Paragraph('<b>Liste</b>', tbl_header_style),
     Paragraph('<b>Détail</b>', tbl_header_style), Paragraph('<b>Créer</b>', tbl_header_style),
     Paragraph('<b>Modifier</b>', tbl_header_style), Paragraph('<b>Suppr.</b>', tbl_header_style)],
    [Paragraph('Élèves', tbl_cell_style), Paragraph('OK', tbl_cell_green), Paragraph('OK', tbl_cell_green), Paragraph('OK', tbl_cell_green), Paragraph('OK', tbl_cell_green), Paragraph('OK', tbl_cell_green)],
    [Paragraph('Notes', tbl_cell_style), Paragraph('OK', tbl_cell_green), Paragraph('OK', tbl_cell_green), Paragraph('OK', tbl_cell_green), Paragraph('OK', tbl_cell_green), Paragraph('OK', tbl_cell_green)],
    [Paragraph('Utilisateurs', tbl_cell_style), Paragraph('OK', tbl_cell_green), Paragraph('OK', tbl_cell_green), Paragraph('OK', tbl_cell_green), Paragraph('OK', tbl_cell_green), Paragraph('OK', tbl_cell_green)],
    [Paragraph('Paiements', tbl_cell_style), Paragraph('OK', tbl_cell_green), Paragraph('Manquant', tbl_cell_red), Paragraph('OK', tbl_cell_green), Paragraph('Manquant', tbl_cell_red), Paragraph('Manquant', tbl_cell_red)],
    [Paragraph('Salles', tbl_cell_style), Paragraph('OK', tbl_cell_green), Paragraph('Manquant', tbl_cell_red), Paragraph('OK', tbl_cell_green), Paragraph('Manquant', tbl_cell_red), Paragraph('Manquant', tbl_cell_red)],
    [Paragraph('Classes', tbl_cell_style), Paragraph('OK', tbl_cell_green), Paragraph('Manquant', tbl_cell_red), Paragraph('OK', tbl_cell_green), Paragraph('Manquant', tbl_cell_red), Paragraph('Manquant', tbl_cell_red)],
    [Paragraph('Inscriptions', tbl_cell_style), Paragraph('OK', tbl_cell_green), Paragraph('Manquant', tbl_cell_red), Paragraph('OK', tbl_cell_green), Paragraph('Manquant', tbl_cell_red), Paragraph('Manquant', tbl_cell_red)],
    [Paragraph('Factures', tbl_cell_style), Paragraph('OK', tbl_cell_green), Paragraph('Manquant', tbl_cell_red), Paragraph('OK', tbl_cell_green), Paragraph('OK', tbl_cell_green), Paragraph('OK', tbl_cell_green)],
]
cw5 = [page_w*0.22, page_w*0.13, page_w*0.13, page_w*0.17, page_w*0.17, page_w*0.18]
story.append(make_table(['Ressource', 'Liste', 'Détail', 'Créer', 'Modifier', 'Suppr.'], crud_data, cw5))
story.append(Spacer(1, 6))
story.append(Paragraph('<b>Tableau 3.</b> Couverture CRUD par ressource backend', caption_style))
story.append(Spacer(1, 12))

story.append(add_heading('<b>2.3 Données Fictives et Stubs</b>', h2_style, 1))

story.append(Paragraph(
    'Trois endpoints critiques renvoient des données fictives au lieu de réelles, ce qui signifie '
    'que les fonctionnalités correspondantes sont non fonctionnelles en production. Le passerelle de paiement '
    'retourne une URL factice, la vérification OTP MFA ne réellement pas d\'emails, et la déconnexion '
    'globale ne révoque aucun token. Ces stubs représentent un risque sérieux car ils donnent '
    'l\'illusion d\'un fonctionnement correct alors que les opérations sensibles échouent silencieusement.',
    body_style
))

stub_data = [
    [Paragraph('<b>Endpoint</b>', tbl_header_style), Paragraph('<b>Fichier</b>', tbl_header_style), Paragraph('<b>Problème</b>', tbl_header_style)],
    [Paragraph('POST /payments/intent/', tbl_cell_style), Paragraph('payments.py:636', tbl_cell_style), Paragraph('URL de paiement fictive (mock gateway)', tbl_cell_red)],
    [Paragraph('POST /auth/otp/request/', tbl_cell_style), Paragraph('mfa.py:342', tbl_cell_style), Paragraph('Ne réellement pas d\'email OTP', tbl_cell_red)],
    [Paragraph('POST /auth/logout-all/', tbl_cell_style), Paragraph('auth.py:140', tbl_cell_style), Paragraph('Ne révoque pas les tokens JWT', tbl_cell_red)],
]
story.append(make_table(['Endpoint', 'Fichier', 'Problème'], stub_data, [page_w*0.3, page_w*0.2, page_w*0.5]))
story.append(Spacer(1, 6))
story.append(Paragraph('<b>Tableau 4.</b> Endpoints avec données fictives ou stubs', caption_style))
story.append(Spacer(1, 12))

story.append(add_heading('<b>2.4 Sécurité</b>', h2_style, 1))

story.append(Paragraph(
    'L\'audit de sécurité révèle des vulnérabilités critiques qui doivent être '
    'corrigées immédiatement. Le système dispose d\'une bonne base avec JWT, bcrypt, rate-limiting, '
    'et RBAC, mais plusieurs failles compromettent la sécurité globale. Les identifiants administrateur '
    'sont codés en dur dans le code source, le bootstrap expose le mot de passe en clair via l\'API, et il n\'y '
    'a aucune validation de complexité pour les mots de passe.',
    body_style
))

sec_data = [
    [Paragraph('<b>Issue</b>', tbl_header_style), Paragraph('<b>Sévérité</b>', tbl_header_style), Paragraph('<b>Détail</b>', tbl_header_style)],
    [Paragraph('Identifiants admin en dur', tbl_cell_red), Paragraph('Critique', tbl_cell_center), Paragraph('admin@schoolflow.local / Admin@123456 dans main.py:779 et auth.py:167', tbl_cell_style)],
    [Paragraph('Bootstrap expose mot de passe', tbl_cell_red), Paragraph('Critique', tbl_cell_center), Paragraph('L\'endpoint /auth/bootstrap/ retourne le mot de passe en clair dans la réponse API', tbl_cell_style)],
    [Paragraph('Pas de complexité mot de passe', tbl_cell_red), Paragraph('Critique', tbl_cell_center), Paragraph('ChangePasswordRequest accepte n\'importe quelle chaîne sans validation', tbl_cell_style)],
    [Paragraph('CORS * avec credentials', tbl_cell_orange), Paragraph('Attention', tbl_cell_center), Paragraph('origins=["*"] + allow_credentials=True bloqué par les navigateurs', tbl_cell_style)],
    [Paragraph('TENANT_ADMIN = wildcard "*"', tbl_cell_orange), Paragraph('Attention', tbl_cell_center), Paragraph('Mêmes permissions que SUPER_ADMIN, peut supprimer des données RGPD', tbl_cell_style)],
    [Paragraph('python-jose non maintenu', tbl_cell_orange), Paragraph('Attention', tbl_cell_center), Paragraph('Bibliothèque avec CVE connues, migrer vers PyJWT recommandé', tbl_cell_style)],
    [Paragraph('/uploads/ sans auth', tbl_cell_orange), Paragraph('Attention', tbl_cell_center), Paragraph('Fichiers statiques accessibles sans authentification', tbl_cell_style)],
    [Paragraph('Traceback en production', tbl_cell_red), Paragraph('Critique', tbl_cell_center), Paragraph('Si DEBUG=True, stack trace complète exposé au client (tenants.py:237)', tbl_cell_style)],
]
story.append(make_table(['Issue', 'Sévérité', 'Détail'], sec_data, [page_w*0.28, page_w*0.13, page_w*0.59]))
story.append(Spacer(1, 6))
story.append(Paragraph('<b>Tableau 5.</b> Issues de sécurité identifiées', caption_style))
story.append(Spacer(1, 12))

story.append(add_heading('<b>2.5 Base de Données</b>', h2_style, 1))

story.append(Paragraph(
    'La gestion de la base de données présente une problématique majeure : 30+ tables opérationnelles '
    'sont créées via du SQL brut dans la fonction <font name="Times New Roman">_ensure_operational_tables()</font> '
    '(lignes 143-712 de <font name="Times New Roman">main.py</font>), en dehors de tout système de migration Alembic. '
    'Cette approche crée une dérive de schéma entre les modèles ORM et la structure réelle en base. '
    'Par exemple, le modèle <font name="Times New Roman">Invoice</font> définit des colonnes '
    '(subtotal, tax_amount, discount_amount, currency, description, pdf_url) qui n\'existent pas dans la table DDL. '
    'De plus, plusieurs modèles manquent de contraintes d\'unicité scoped par tenant, ce qui peut '
    'entraîner des doublons dans un environnement multi-tenant.',
    body_style
))

db_data = [
    [Paragraph('<b>Modèle</b>', tbl_header_style), Paragraph('<b>Problème</b>', tbl_header_style)],
    [Paragraph('Invoice (ORM vs DDL)', tbl_cell_red), Paragraph('Le modèle a 6 colonnes (subtotal, tax, discount, currency, description, pdf_url) absentes du DDL', tbl_cell_style)],
    [Paragraph('Attendance', tbl_cell_style), Paragraph('Pas d\'index composite sur (student_id, date), requêtes de recherche lentes', tbl_cell_style)],
    [Paragraph('AcademicYear', tbl_cell_style), Paragraph('Pas de contrainte unique sur (tenant_id, code)', tbl_cell_style)],
    [Paragraph('Enrollment', tbl_cell_style), Paragraph('Pas de contrainte unique sur (student_id, class_id, academic_year_id)', tbl_cell_style)],
    [Paragraph('Subject, Department, Level', tbl_cell_style), Paragraph('Pas d\'unicité scoped par tenant - doublons possibles', tbl_cell_style)],
    [Paragraph('UserRole', tbl_cell_style), Paragraph('Pas de FK ondelete, pas d\'index sur user_id - rôles orphelins', tbl_cell_style)],
    [Paragraph('30+ tables opérationnelles', tbl_cell_red), Paragraph('Créées via SQL brut hors Alembic, pas de traçabilité des migrations', tbl_cell_style)],
]
story.append(make_table(['Modèle', 'Problème'], db_data, [page_w*0.3, page_w*0.7]))
story.append(Spacer(1, 6))
story.append(Paragraph('<b>Tableau 6.</b> Issues de la base de données', caption_style))
story.append(Spacer(1, 12))

story.append(add_heading('<b>2.6 Dépendances et Configuration</b>', h2_style, 1))

story.append(Paragraph(
    'Les dépendances backend sont gérées via <font name="Times New Roman">requirements.txt</font> avec des contraintes '
    'de version supérieures et inférieures, ce qui est une bonne pratique. Cependant, '
    '<font name="Times New Roman">python-jose</font> (utilise pour le JWT) est une bibliothèque non maintenue '
    'avec des CVE connues, et la présence simultanée de <font name="Times New Roman">httpx</font> et '
    '<font name="Times New Roman">requests</font> est redondante. Le fichier <font name="Times New Roman">.env.example</font> '
    'est complet mais manque certaines variables documentées dans le code (BOOTSTRAP_SECRET, BACKEND_URL). '
    'L\'événement <font name="Times New Roman">@app.on_event("startup")</font> est déprécié '
    'au profit du pattern <font name="Times New Roman">lifespan</font>, et aucun événement de shutdown '
    'n\'est défini pour nettoyer les connexions.',
    body_style
))

# ════════════════════════════════════════════
# 3. AUDIT FRONTEND
# ════════════════════════════════════════════
story.append(add_heading('<b>3. Audit Frontend</b>', h1_style, 0))

story.append(Paragraph(
    'Le frontend est une application React 18 avec Vite, TypeScript, et un écosystème riche : '
    'TanStack React Query pour le serveur state, Zustand pour le client state, Tailwind CSS avec shadcn/ui, '
    'React Hook Form + Zod pour la validation, i18next pour 5 langues, Framer Motion pour les animations, '
    'et Capacitor 8 pour le mobile. L\'architecture est modulaire et bien organisée avec plus de 170 composants '
    'et 100+ pages, toutes lazy-loaded.',
    body_style
))

story.append(add_heading('<b>3.1 Routes et Navigation</b>', h2_style, 1))

story.append(Paragraph(
    'Le système de routage est complet avec des gardes basés sur les rôles pour chaque type '
    'd\'utilisateur (admin, teacher, parent, student, alumni, department head, super admin). Toutes les 100+ pages '
    'sont chargées en mode lazy via <font name="Times New Roman">React.lazy()</font> avec un fallback '
    '<font name="Times New Roman">Suspense</font>. Le MFA est correctement intégré comme porte '
    'd\'accès obligatoire. Le routing inclut également des pages publiques (landing, admissions, programmes) '
    'avec des slugs de tenant dynamiques.',
    body_style
))

route_data = [
    [Paragraph('<b>Layout</b>', tbl_header_style), Paragraph('<b>Rôles autorisés</b>', tbl_header_style), Paragraph('<b>Pages</b>', tbl_header_style)],
    [Paragraph('SuperAdminLayout', tbl_cell_style), Paragraph('SUPER_ADMIN', tbl_cell_style), Paragraph('Dashboard, Tenants, CreateTenant', tbl_cell_style)],
    [Paragraph('AdminLayout', tbl_cell_style), Paragraph('6 rôles', tbl_cell_style), Paragraph('65+ pages (students, grades, finances, HR, etc.)', tbl_cell_style)],
    [Paragraph('TeacherLayout', tbl_cell_style), Paragraph('TEACHER', tbl_cell_style), Paragraph('8 pages (dashboard, classes, grades, attendance, homework)', tbl_cell_style)],
    [Paragraph('ParentLayout', tbl_cell_style), Paragraph('PARENT', tbl_cell_style), Paragraph('8 pages (dashboard, children, report cards, invoices)', tbl_cell_style)],
    [Paragraph('StudentLayout', tbl_cell_style), Paragraph('STUDENT', tbl_cell_style), Paragraph('7 pages (dashboard, grades, schedule, homework)', tbl_cell_style)],
    [Paragraph('Public', tbl_cell_style), Paragraph('Public', tbl_cell_style), Paragraph('Landing, admissions, programmes, calendrier, contact', tbl_cell_style)],
]
story.append(make_table(['Layout', 'Rôles', 'Pages'], route_data, [page_w*0.22, page_w*0.2, page_w*0.58]))
story.append(Spacer(1, 6))
story.append(Paragraph('<b>Tableau 7.</b> Routes par layout et rôle', caption_style))
story.append(Spacer(1, 12))

story.append(add_heading('<b>3.2 Performance et Bundle</b>', h2_style, 1))

story.append(Paragraph(
    'L\'analyse du bundle de production révèle un problème critique de performance. Le chunk principal '
    '<font name="Times New Roman">index.js</font> pèse 1 031 Ko (335 Ko gzippé), ce qui bloque le chargement '
    'initial de la page. Ce bundle contient React, React Router, l\'ensemble des primitives Radix UI, TanStack Query, '
    'Lucide Icons, Framer Motion, et d\'autres dépendances. jsPDF (358 Ko) semble chargé de manière '
    'eager alors qu\'il n\'est utilisé que dans quelques pages d\'export. Le '
    '<font name="Times New Roman">chunkSizeWarningLimit</font> est fixé à 2 000 Ko, masquant ces alertes légitimes.',
    body_style
))

bundle_data = [
    [Paragraph('<b>Chunk</b>', tbl_header_style), Paragraph('<b>Taille</b>', tbl_header_style), Paragraph('<b>Gzip</b>', tbl_header_style), Paragraph('<b>Problème</b>', tbl_header_style)],
    [Paragraph('index.js', tbl_cell_red), Paragraph('1 031 Ko', tbl_cell_center), Paragraph('335 Ko', tbl_cell_center), Paragraph('Vendor monolithique, bloque le FCP', tbl_cell_style)],
    [Paragraph('jspdf.es.min.js', tbl_cell_orange), Paragraph('358 Ko', tbl_cell_center), Paragraph('118 Ko', tbl_cell_center), Paragraph('Chargé eager, devrait être lazy', tbl_cell_style)],
    [Paragraph('generateCategoricalChart.js', tbl_cell_style), Paragraph('350 Ko', tbl_cell_center), Paragraph('99 Ko', tbl_cell_center), Paragraph('Recharts - devrait être un chunk partagé', tbl_cell_style)],
    [Paragraph('QRScanner.js', tbl_cell_style), Paragraph('338 Ko', tbl_cell_center), Paragraph('101 Ko', tbl_cell_center), Paragraph('Lazy-loaded - correct', tbl_cell_green)],
    [Paragraph('Settings.js', tbl_cell_orange), Paragraph('134 Ko', tbl_cell_center), Paragraph('31 Ko', tbl_cell_center), Paragraph('Page trop lourde, nécessite du code-splitting', tbl_cell_style)],
]
story.append(make_table(['Chunk', 'Taille', 'Gzip', 'Problème'], bundle_data, [page_w*0.28, page_w*0.15, page_w*0.13, page_w*0.44]))
story.append(Spacer(1, 6))
story.append(Paragraph('<b>Tableau 8.</b> Analyse des chunks du bundle', caption_style))
story.append(Spacer(1, 12))

story.append(add_heading('<b>3.3 Gestion d\'État</b>', h2_style, 1))

story.append(Paragraph(
    'Le frontend utilise un système hybride pour la gestion d\'état, combinant React Context (AuthContext, '
    'TenantContext, ThemeContext) avec des stores Zustand (authStore, userStore, tenantStore, notificationStore, appStore). '
    'Ce double système est problématique car les données d\'authentification et de tenant existent '
    'simultanément dans les deux systèmes. Le <font name="Times New Roman">StoreProvider</font> est encore '
    'inclus dans <font name="Times New Roman">App.tsx</font>, créant de la duplication d\'état et une '
    'confusion pour les développeurs. Les stores Zustand sont marqués comme dépréciés '
    'mais toujours actifs, et le <font name="Times New Roman">session: null</font> dans AuthContext est un champ mort '
    'issu de la migration Supabase.',
    body_style
))

story.append(add_heading('<b>3.4 Composants et Fonctionnalités</b>', h2_style, 1))

story.append(Paragraph(
    'Sur les 100+ pages analysées, environ 90% sont pleinement fonctionnelles avec des appels API réels. '
    'Les modules critiques (tableau de bord, élèves, notes, présence, emplois du temps, finances, RH, '
    'bibliothèque, inventaire, clubs, sondages) sont tous connectés au backend. Cependant, le module e-learning '
    'renvoie des données vides car les endpoints backend sont des stubs, et les profils alumni sont partiellement '
    'implémentés. Le système de badges contient 23 marqueurs TODO dans le composant '
    '<font name="Times New Roman">BatchBadgePrint.tsx</font>, et le composant d\'onboarding '
    '<font name="Times New Roman">StructureStep.tsx</font> en contient 21.',
    body_style
))

comp_data = [
    [Paragraph('<b>Statut</b>', tbl_header_style), Paragraph('<b>Pages</b>', tbl_header_style), Paragraph('<b>Exemples</b>', tbl_header_style)],
    [Paragraph('Fonctionnel', tbl_cell_green), Paragraph('~90%', tbl_cell_center), Paragraph('Dashboard, Students, Grades, Attendance, Schedule, Finances, HR', tbl_cell_style)],
    [Paragraph('Partiel', tbl_cell_orange), Paragraph('~5%', tbl_cell_center), Paragraph('Alumni (profils vides), Careers (backend partiel)', tbl_cell_style)],
    [Paragraph('Stub', tbl_cell_red), Paragraph('~3%', tbl_cell_center), Paragraph('E-learning (courses, modules, enrollments - données vides)', tbl_cell_style)],
    [Paragraph('Dev-only', tbl_cell_orange), Paragraph('~2%', tbl_cell_center), Paragraph('TestingDashboard (/admin/testing) - accessible en production', tbl_cell_style)],
]
story.append(make_table(['Statut', 'Pages', 'Exemples'], comp_data, [page_w*0.15, page_w*0.12, page_w*0.73]))
story.append(Spacer(1, 6))
story.append(Paragraph('<b>Tableau 9.</b> Statut des composants frontend', caption_style))
story.append(Spacer(1, 12))

story.append(add_heading('<b>3.5 TypeScript et Qualité du Code</b>', h2_style, 1))

story.append(Paragraph(
    'La compilation TypeScript réussit sans erreur (<font name="Times New Roman">tsc --noEmit</font>), et le '
    'build Vite se termine en 14 secondes. Cependant, le <font name="Times New Roman">tsconfig.json</font> désactive '
    'des vérifications importantes : <font name="Times New Roman">noImplicitAny</font> est '
    '<font name="Times New Roman">false</font>, ce qui permet des variables non typées, et '
    '<font name="Times New Roman">noUnusedLocals</font> est <font name="Times New Roman">false</font>, permettant '
    'du code mort. Plus de 100 marqueurs TODO/FIXME/HACK sont disséminés dans le code, '
    'représentant une dette technique significative. Le shim Supabase '
    '(133 lignes) est toujours présent malgré la migration complète vers l\'API propriétaire, '
    'alourdissant inutilement le bundle.',
    body_style
))

# ════════════════════════════════════════════
# 4. AUDIT COHERENCE FE/BE
# ════════════════════════════════════════════
story.append(add_heading('<b>4. Audit de Cohérence Frontend-Backend</b>', h1_style, 0))

story.append(Paragraph(
    'Cet axe de l\'audit vérifie l\'alignement entre les appels API du frontend et les routes effectivement '
    'exposées par le backend, les contrats de données, le flux d\'authentification, et les '
    'mécanismes de gestion d\'erreurs. L\'analyse révèle un nombre important d\'appels frontend '
    'orphelins qui pointent vers des endpoints backend inexistants, ainsi qu\'un problème de format de réponse '
    'd\'erreur qui rend les messages d\'erreur invisibles pour l\'utilisateur.',
    body_style
))

story.append(add_heading('<b>4.1 Endpoints Frontend Orphelins</b>', h2_style, 1))

story.append(Paragraph(
    'L\'analyse croisée des services frontend et du router backend a identifié plus de 30 appels API '
    'qui n\'ont pas de route correspondante sur le backend. Ces appels se répartissent en plusieurs catégories : '
    'endpoints manquants pour le portail parent, endpoints de features avancées non implémentés, '
    'et incohérences de chemin. Chaque appel orphelin génère une erreur 404 silencieuse en production.',
    body_style
))

orphan_data = [
    [Paragraph('<b>Catégorie</b>', tbl_header_style), Paragraph('<b>Endpoints manquants</b>', tbl_header_style), Paragraph('<b>Impact</b>', tbl_header_style)],
    [Paragraph('Auth', tbl_cell_red), Paragraph('POST /auth/register/', tbl_cell_style), Paragraph('Inscription auto impossible (signUp 404)', tbl_cell_style)],
    [Paragraph('MFA', tbl_cell_red), Paragraph('POST /mfa/verify-otp/ (mauvais payload: token au lieu de code)', tbl_cell_style), Paragraph('Vérification MFA échoue au login', tbl_cell_style)],
    [Paragraph('Paiements', tbl_cell_red), Paragraph('GET/POST/PUT/DELETE /payment-schedules/', tbl_cell_style), Paragraph('PaymentScheduleManager complètement cassé', tbl_cell_style)],
    [Paragraph('Factures', tbl_cell_red), Paragraph('POST /send-notification-email, POST /send-invoice-email', tbl_cell_style), Paragraph('Envoi d\'emails de facture impossible', tbl_cell_style)],
    [Paragraph('Portail Parent (7)', tbl_cell_orange), Paragraph('/parents/risk-scores/, /parents/report-cards/generate/, /parents/payments/create/, /parents/invoices/pdf/, /parents/payment-schedules/, /parents/appointments/', tbl_cell_style), Paragraph('Fonctionnalités parent limitées', tbl_cell_style)],
    [Paragraph('Teacher (3)', tbl_cell_orange), Paragraph('/school-life/appointment-slots/, check-ins/assignments/, check-ins/sessions/', tbl_cell_style), Paragraph('Créneaux et sessions non fonctionnels', tbl_cell_style)],
    [Paragraph('Features (8+)', tbl_cell_orange), Paragraph('/subject-preferred-rooms, /teacher-assignments, /gamification/*, /shared-notes/*, /careers/', tbl_cell_style), Paragraph('Features avancées en 404', tbl_cell_style)],
    [Paragraph('Analytics (2)', tbl_cell_style), Paragraph('/analytics/cash-flow-forecast/, /analytics/ministry-kpis/', tbl_cell_style), Paragraph('KPIs avancés manquants', tbl_cell_style)],
]
story.append(make_table(['Catégorie', 'Endpoints manquants', 'Impact'], orphan_data, [page_w*0.14, page_w*0.5, page_w*0.36]))
story.append(Spacer(1, 6))
story.append(Paragraph('<b>Tableau 10.</b> Endpoints frontend sans route backend', caption_style))
story.append(Spacer(1, 12))

story.append(add_heading('<b>4.2 Contrats de Données</b>', h2_style, 1))

story.append(Paragraph(
    'Les contrats de données principaux (login, utilisateurs, élèves, factures) sont alignés '
    'entre le frontend et le backend. Cependant, plusieurs dérives de noms de champs et de structure de '
    'réponse ont été identifiées. La réponse d\'erreur est particulièrement '
    'problématique : le backend envoie <font name="Times New Roman">{ error, message, request_id }</font> '
    'mais le frontend lit <font name="Times New Roman">error.response.data.detail</font>, ce qui affiche '
    '"undefined" dans les toasts d\'erreur. La pagination utilise un format globalement cohérent '
    '(page/page_size) mais avec des clés de réponse incohérentes entre endpoints.',
    body_style
))

contract_data = [
    [Paragraph('<b>Issue</b>', tbl_header_style), Paragraph('<b>Backend</b>', tbl_header_style), Paragraph('<b>Frontend attend</b>', tbl_header_style)],
    [Paragraph('Erreur custom', tbl_cell_red), Paragraph('{ error, message, request_id }', tbl_cell_style), Paragraph('error.response.data.detail (undefined)', tbl_cell_style)],
    [Paragraph('avatar_url vs photo_url', tbl_cell_orange), Paragraph('Retourne "avatar_url"', tbl_cell_style), Paragraph('Certains services mappent manuellement vers "photo_url"', tbl_cell_style)],
    [Paragraph('Clé pagination', tbl_cell_orange), Paragraph('Incohérent: items vs invoices vs []', tbl_cell_style), Paragraph('Attend items + total uniforme', tbl_cell_style)],
    [Paragraph('Invoice.updated_at', tbl_cell_style), Paragraph('Absent de la réponse liste', tbl_cell_style), Paragraph('Défini dans le type TypeScript', tbl_cell_style)],
    [Paragraph('AcademicYear.code', tbl_cell_style), Paragraph('Colonne existe en DB', tbl_cell_style), Paragraph('Pas dans le type TypeScript frontend', tbl_cell_style)],
]
story.append(make_table(['Issue', 'Backend', 'Frontend attend'], contract_data, [page_w*0.22, page_w*0.39, page_w*0.39]))
story.append(Spacer(1, 6))
story.append(Paragraph('<b>Tableau 11.</b> Incohérences des contrats de données', caption_style))
story.append(Spacer(1, 12))

story.append(add_heading('<b>4.3 Flux d\'Authentification</b>', h2_style, 1))

story.append(Paragraph(
    'Le flux d\'authentification principal (login, stockage token, rafraîchissement 401, déconnexion) '
    'fonctionne correctement. Le multi-tenant est bien géré via le header '
    '<font name="Times New Roman">X-Tenant-ID</font> et l\'extraction depuis le JWT. Cependant, deux points de '
    'rupture existent : l\'inscription auto (<font name="Times New Roman">POST /auth/register/</font>) n\'a pas '
    'de backend, et la vérification MFA envoie le champ <font name="Times New Roman">token</font> alors que '
    'le backend attend <font name="Times New Roman">code</font>. Ces deux bugs empêchent respectivement '
    'la création de compte public et la connexion avec MFA activé.',
    body_style
))

story.append(add_heading('<b>4.4 Multi-tenancy et CORS</b>', h2_style, 1))

story.append(Paragraph(
    'L\'isolation multi-tenant est correctement implémentée avec RLS PostgreSQL, extraction du tenant '
    'via JWT et header <font name="Times New Roman">X-Tenant-ID</font>, et middleware de tenant. Le SUPER_ADMIN '
    'peut switcher de tenant via le dropdown. La configuration CORS utilise des origins par défaut '
    '<font name="Times New Roman">["*"]</font> qui, combinées à <font name="Times New Roman">allow_credentials=True</font>, '
    'sont rejetées par les navigateurs modernes. En production Render, les origins sont correctement '
    'configurées via la variable d\'environnement <font name="Times New Roman">BACKEND_CORS_ORIGINS</font>.',
    body_style
))

# ════════════════════════════════════════════
# 5. BONNES PRATIQUES
# ════════════════════════════════════════════
story.append(add_heading('<b>5. Bonnes Pratiques Identifiées</b>', h1_style, 0))

story.append(Paragraph(
    'Malgré les issues identifiées, le projet démontre de nombreuses bonnes pratiques qui '
    'témoignent d\'une architecture solide et d\'une réflexion sérieuse sur la qualité.',
    body_style
))

bp_data = [
    [Paragraph('<b>Domaine</b>', tbl_header_style), Paragraph('<b>Pratique</b>', tbl_header_style)],
    [Paragraph('Backend', tbl_cell_style), Paragraph('RBAC complet avec 10 rôles et permissions granulaires', tbl_cell_green)],
    [Paragraph('Backend', tbl_cell_style), Paragraph('Multi-tenancy avec RLS PostgreSQL et ContextVar pour l\'isolation', tbl_cell_green)],
    [Paragraph('Backend', tbl_cell_style), Paragraph('Logging structuré JSON avec contexte de requête', tbl_cell_green)],
    [Paragraph('Backend', tbl_cell_style), Paragraph('Métriques Prometheus avec normalisation des chemins', tbl_cell_green)],
    [Paragraph('Backend', tbl_cell_style), Paragraph('Rate limiting (100/min global, 5/min login)', tbl_cell_green)],
    [Paragraph('Backend', tbl_cell_style), Paragraph('Audit logging sur toutes les opérations d\'écriture', tbl_cell_green)],
    [Paragraph('Backend', tbl_cell_style), Paragraph('16 routes alias pour compatibilité frontend', tbl_cell_green)],
    [Paragraph('Frontend', tbl_cell_style), Paragraph('100+ pages lazy-loaded avec Suspense', tbl_cell_green)],
    [Paragraph('Frontend', tbl_cell_style), Paragraph('5 langues (fr, en, es, ar, zh) via i18next', tbl_cell_green)],
    [Paragraph('Frontend', tbl_cell_style), Paragraph('Mobile-ready avec Capacitor 8 + PWA', tbl_cell_green)],
    [Paragraph('Frontend', tbl_cell_style), Paragraph('Error boundaries au niveau app et content', tbl_cell_green)],
    [Paragraph('Frontend', tbl_cell_style), Paragraph('Monitoring Sentry intégré', tbl_cell_green)],
    [Paragraph('Transversal', tbl_cell_style), Paragraph('Pagination cohérente (page/page_size)', tbl_cell_green)],
    [Paragraph('Transversal', tbl_cell_style), Paragraph('Upload/Download via MinIO avec presigned URLs', tbl_cell_green)],
    [Paragraph('Transversal', tbl_cell_style), Paragraph('Messaging en temps réel via polling (WebSocket disponible)', tbl_cell_green)],
]
story.append(make_table(['Domaine', 'Pratique'], bp_data, [page_w*0.15, page_w*0.85]))
story.append(Spacer(1, 6))
story.append(Paragraph('<b>Tableau 12.</b> Bonnes pratiques identifiées', caption_style))
story.append(Spacer(1, 18))

# ════════════════════════════════════════════
# 6. PLAN DE CORRECTION PRIORITAIRE
# ════════════════════════════════════════════
story.append(add_heading('<b>6. Plan de Correction Prioritaire</b>', h1_style, 0))

story.append(Paragraph(
    'Le plan ci-dessous classe les corrections par ordre de priorité, en estimant l\'effort requis et '
    'l\'impact sur la stabilité du système en production.',
    body_style
))

story.append(add_heading('<b>6.1 P0 - Critique (Bloquant production)</b>', h2_style, 1))

p0_data = [
    [Paragraph('<b>#</b>', tbl_header_style), Paragraph('<b>Action</b>', tbl_header_style), Paragraph('<b>Fichiers</b>', tbl_header_style), Paragraph('<b>Effort</b>', tbl_header_style)],
    [Paragraph('1', tbl_cell_center), Paragraph('Supprimer identifiants admin en dur, utiliser uniquement des variables d\'environnement', tbl_cell_style), Paragraph('main.py, auth.py', tbl_cell_style), Paragraph('2h', tbl_cell_center)],
    [Paragraph('2', tbl_cell_center), Paragraph('Retirer le mot de passe de la réponse bootstrap', tbl_cell_style), Paragraph('auth.py:280', tbl_cell_style), Paragraph('0.5h', tbl_cell_center)],
    [Paragraph('3', tbl_cell_center), Paragraph('Ajouter validation complexité mot de passe (min 8 chars, majuscule, chiffre, spécial)', tbl_cell_style), Paragraph('auth.py, schemas', tbl_cell_style), Paragraph('1h', tbl_cell_center)],
    [Paragraph('4', tbl_cell_center), Paragraph('Corriger payload MFA verify-otp (token vers code)', tbl_cell_style), Paragraph('AuthContext.tsx:216', tbl_cell_style), Paragraph('0.5h', tbl_cell_center)],
    [Paragraph('5', tbl_cell_center), Paragraph('Standardiser format erreur (ajouter "detail" dans les réponses backend)', tbl_cell_style), Paragraph('exceptions.py', tbl_cell_style), Paragraph('1h', tbl_cell_center)],
    [Paragraph('6', tbl_cell_center), Paragraph('Ajouter endpoint /auth/register/ ou supprimer signUp du frontend', tbl_cell_style), Paragraph('auth.py BE / AuthContext FE', tbl_cell_style), Paragraph('3h', tbl_cell_center)],
    [Paragraph('7', tbl_cell_center), Paragraph('Créer endpoints CRUD /payment-schedules/', tbl_cell_style), Paragraph('Nouveau fichier endpoint', tbl_cell_style), Paragraph('4h', tbl_cell_center)],
    [Paragraph('8', tbl_cell_center), Paragraph('Supprimer traceback en production (DEBUG check)', tbl_cell_style), Paragraph('tenants.py:237', tbl_cell_style), Paragraph('0.5h', tbl_cell_center)],
]
story.append(make_table(['#', 'Action', 'Fichiers', 'Effort'], p0_data, [page_w*0.05, page_w*0.55, page_w*0.25, page_w*0.15]))
story.append(Spacer(1, 6))
story.append(Paragraph('<b>Tableau 13.</b> Actions P0 - Critiques', caption_style))
story.append(Spacer(1, 12))

story.append(add_heading('<b>6.2 P1 - Haute Priorité</b>', h2_style, 1))

p1_data = [
    [Paragraph('<b>#</b>', tbl_header_style), Paragraph('<b>Action</b>', tbl_header_style), Paragraph('<b>Fichiers</b>', tbl_header_style), Paragraph('<b>Effort</b>', tbl_header_style)],
    [Paragraph('9', tbl_cell_center), Paragraph('Migrer python-jose vers PyJWT', tbl_cell_style), Paragraph('security.py, requirements.txt', tbl_cell_style), Paragraph('4h', tbl_cell_center)],
    [Paragraph('10', tbl_cell_center), Paragraph('Restreindre permissions TENANT_ADMIN (retirer wildcard "*")', tbl_cell_style), Paragraph('security.py:111', tbl_cell_style), Paragraph('2h', tbl_cell_center)],
    [Paragraph('11', tbl_cell_center), Paragraph('Réconcilier schéma Invoice ORM vs DDL', tbl_cell_style), Paragraph('payment.py model + main.py DDL', tbl_cell_style), Paragraph('3h', tbl_cell_center)],
    [Paragraph('12', tbl_cell_center), Paragraph('Ajouter endpoints manquants portail parent (7 endpoints)', tbl_cell_style), Paragraph('Nouveaux endpoints', tbl_cell_style), Paragraph('8h', tbl_cell_center)],
    [Paragraph('13', tbl_cell_center), Paragraph('Ajouter endpoints manquants teacher (appointment-slots, sessions)', tbl_cell_style), Paragraph('school_life.py, schedule.py', tbl_cell_style), Paragraph('6h', tbl_cell_center)],
    [Paragraph('14', tbl_cell_center), Paragraph('Scinder le bundle vendor (react-vendor, ui-vendor, chart-vendor, pdf-vendor)', tbl_cell_style), Paragraph('vite.config.ts', tbl_cell_style), Paragraph('4h', tbl_cell_center)],
    [Paragraph('15', tbl_cell_center), Paragraph('Supprimer stores Zustand dépréciés', tbl_cell_style), Paragraph('stores/, StoreProvider, App.tsx', tbl_cell_style), Paragraph('6h', tbl_cell_center)],
    [Paragraph('16', tbl_cell_center), Paragraph('Configurer CORS production (supprimer origins=["*"])', tbl_cell_style), Paragraph('main.py:100', tbl_cell_style), Paragraph('1h', tbl_cell_center)],
]
story.append(make_table(['#', 'Action', 'Fichiers', 'Effort'], p1_data, [page_w*0.05, page_w*0.55, page_w*0.25, page_w*0.15]))
story.append(Spacer(1, 6))
story.append(Paragraph('<b>Tableau 14.</b> Actions P1 - Haute priorité', caption_style))
story.append(Spacer(1, 12))

story.append(add_heading('<b>6.3 P2 - Moyenne Priorité</b>', h2_style, 1))

p2_data = [
    [Paragraph('<b>#</b>', tbl_header_style), Paragraph('<b>Action</b>', tbl_header_style), Paragraph('<b>Fichiers</b>', tbl_header_style), Paragraph('<b>Effort</b>', tbl_header_style)],
    [Paragraph('17', tbl_cell_center), Paragraph('Migrer 30+ tables SQL brut vers Alembic', tbl_cell_style), Paragraph('main.py DDL vers migrations', tbl_cell_style), Paragraph('16h', tbl_cell_center)],
    [Paragraph('18', tbl_cell_center), Paragraph('Ajouter événement shutdown pour nettoyage connexions', tbl_cell_style), Paragraph('main.py', tbl_cell_style), Paragraph('2h', tbl_cell_center)],
    [Paragraph('19', tbl_cell_center), Paragraph('Migrer @app.on_event("startup") vers lifespan', tbl_cell_style), Paragraph('main.py:715', tbl_cell_style), Paragraph('3h', tbl_cell_center)],
    [Paragraph('20', tbl_cell_center), Paragraph('Activer PWA en production', tbl_cell_style), Paragraph('vite.config.ts', tbl_cell_style), Paragraph('2h', tbl_cell_center)],
    [Paragraph('21', tbl_cell_center), Paragraph('Activer noImplicitAny et noUnusedLocals dans tsconfig', tbl_cell_style), Paragraph('tsconfig.json', tbl_cell_style), Paragraph('8h', tbl_cell_center)],
    [Paragraph('22', tbl_cell_center), Paragraph('Supprimer shim Supabase (133 lignes mortes)', tbl_cell_style), Paragraph('integrations/supabase/', tbl_cell_style), Paragraph('1h', tbl_cell_center)],
    [Paragraph('23', tbl_cell_center), Paragraph('Standardiser clés pagination (items + total uniforme)', tbl_cell_style), Paragraph('Tous endpoints paginés', tbl_cell_style), Paragraph('4h', tbl_cell_center)],
    [Paragraph('24', tbl_cell_center), Paragraph('Ajouter contraintes d\'unicité scoped par tenant sur les modèles clés', tbl_cell_style), Paragraph('models/', tbl_cell_style), Paragraph('3h', tbl_cell_center)],
    [Paragraph('25', tbl_cell_center), Paragraph('Réduire les 100+ TODO/FIXME dans le code', tbl_cell_style), Paragraph('Multi-fichiers', tbl_cell_style), Paragraph('20h+', tbl_cell_center)],
]
story.append(make_table(['#', 'Action', 'Fichiers', 'Effort'], p2_data, [page_w*0.05, page_w*0.55, page_w*0.25, page_w*0.15]))
story.append(Spacer(1, 6))
story.append(Paragraph('<b>Tableau 15.</b> Actions P2 - Moyenne priorité', caption_style))
story.append(Spacer(1, 18))

# ════════════════════════════════════════════
# 7. ESTIMATION GLOBALE
# ════════════════════════════════════════════
story.append(add_heading('<b>7. Estimation Globale</b>', h1_style, 0))

est_data = [
    [Paragraph('<b>Priorité</b>', tbl_header_style), Paragraph('<b>Nombre d\'actions</b>', tbl_header_style), Paragraph('<b>Effort estimé</b>', tbl_header_style), Paragraph('<b>Impact</b>', tbl_header_style)],
    [Paragraph('P0 - Critique', tbl_cell_red), Paragraph('8', tbl_cell_center), Paragraph('~13 heures', tbl_cell_center), Paragraph('Débloque la production, corrige les failles sécurité', tbl_cell_style)],
    [Paragraph('P1 - Haute', tbl_cell_orange), Paragraph('8', tbl_cell_center), Paragraph('~34 heures', tbl_cell_center), Paragraph('Sécurité renforcée, performance améliorée, features parent/teacher', tbl_cell_style)],
    [Paragraph('P2 - Moyenne', tbl_cell_style), Paragraph('9', tbl_cell_center), Paragraph('~59 heures', tbl_cell_center), Paragraph('Dette technique réduite, qualité code, stabilité long terme', tbl_cell_style)],
    [Paragraph('<b>Total</b>', tbl_cell_style), Paragraph('<b>25 actions</b>', tbl_cell_style), Paragraph('<b>~106 heures</b>', tbl_cell_style), Paragraph('', tbl_cell_style)],
]
story.append(make_table(['Priorité', 'Actions', 'Effort', 'Impact'], est_data, [page_w*0.18, page_w*0.17, page_w*0.2, page_w*0.45]))
story.append(Spacer(1, 6))
story.append(Paragraph('<b>Tableau 16.</b> Estimation globale de l\'effort de correction', caption_style))
story.append(Spacer(1, 18))

story.append(Paragraph(
    'Cet audit révèle un projet SchoolFlow Pro avec une couverture fonctionnelle impressionnante '
    'et une architecture globalement saine, mais nécessitant des corrections urgentes en matière de '
    'sécurité et de cohérence frontend-backend. Les 8 actions P0 (estimées à 13 heures) '
    'devraient être traitées en priorité absolue pour sécuriser le déploiement de production '
    'et restaurer la confiance dans les fonctionnalités critiques. Les actions P1 et P2 peuvent être '
    'planifiées dans un roadmap de développement itératif sur les 3 prochains mois.',
    body_style
))

# ─── Build ───
doc.multiBuild(story)
print("PDF built successfully:", output_path)
