# -*- coding: utf-8 -*-
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib import colors
from reportlab.lib.units import cm, inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
import os

# ── Font Registration ──
pdfmetrics.registerFont(TTFont('SimHei', '/usr/share/fonts/truetype/chinese/SimHei.ttf'))
pdfmetrics.registerFont(TTFont('Microsoft YaHei', '/usr/share/fonts/truetype/chinese/msyh.ttf'))
pdfmetrics.registerFont(TTFont('Times New Roman', '/usr/share/fonts/truetype/english/Times-New-Roman.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'))
pdfmetrics.registerFont(TTFont('SarasaMonoSC', '/usr/share/fonts/truetype/chinese/SarasaMonoSC-Regular.ttf'))

registerFontFamily('SimHei', normal='SimHei', bold='SimHei')
registerFontFamily('Microsoft YaHei', normal='Microsoft YaHei', bold='Microsoft YaHei')
registerFontFamily('Times New Roman', normal='Times New Roman', bold='Times New Roman')
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans')

# ── Colors ──
TABLE_HEADER_COLOR = colors.HexColor('#1F4E79')
TABLE_HEADER_TEXT = colors.white
TABLE_ROW_EVEN = colors.white
TABLE_ROW_ODD = colors.HexColor('#F5F5F5')
ACCENT_COLOR = colors.HexColor('#1F4E79')
STEP_BG = colors.HexColor('#EBF5FB')
WARN_BG = colors.HexColor('#FFF3CD')
OK_BG = colors.HexColor('#D4EDDA')

# ── Styles ──
cover_title = ParagraphStyle(
    'CoverTitle', fontName='Microsoft YaHei', fontSize=36, leading=44,
    alignment=TA_CENTER, spaceAfter=20, textColor=ACCENT_COLOR
)
cover_subtitle = ParagraphStyle(
    'CoverSubtitle', fontName='SimHei', fontSize=16, leading=24,
    alignment=TA_CENTER, spaceAfter=12, textColor=colors.HexColor('#555555')
)
cover_info = ParagraphStyle(
    'CoverInfo', fontName='SimHei', fontSize=12, leading=18,
    alignment=TA_CENTER, spaceAfter=8, textColor=colors.HexColor('#777777')
)
h1_style = ParagraphStyle(
    'H1', fontName='Microsoft YaHei', fontSize=20, leading=28,
    spaceBefore=18, spaceAfter=10, textColor=ACCENT_COLOR
)
h2_style = ParagraphStyle(
    'H2', fontName='Microsoft YaHei', fontSize=14, leading=20,
    spaceBefore=14, spaceAfter=8, textColor=colors.HexColor('#2C3E50')
)
body_style = ParagraphStyle(
    'Body', fontName='SimHei', fontSize=10.5, leading=18,
    alignment=TA_LEFT, spaceAfter=6, wordWrap='CJK'
)
body_en = ParagraphStyle(
    'BodyEN', fontName='Times New Roman', fontSize=10.5, leading=18,
    alignment=TA_JUSTIFY, spaceAfter=6
)
code_style = ParagraphStyle(
    'Code', fontName='SarasaMonoSC', fontSize=9, leading=14,
    alignment=TA_LEFT, spaceAfter=4, leftIndent=12,
    backColor=colors.HexColor('#F8F9FA'), textColor=colors.HexColor('#2C3E50'),
    borderPadding=(4, 8, 4, 8)
)
step_style = ParagraphStyle(
    'Step', fontName='Microsoft YaHei', fontSize=12, leading=18,
    alignment=TA_LEFT, spaceAfter=4, textColor=ACCENT_COLOR
)
warn_style = ParagraphStyle(
    'Warn', fontName='SimHei', fontSize=10, leading=16,
    alignment=TA_LEFT, spaceAfter=6, wordWrap='CJK',
    backColor=WARN_BG, borderPadding=(8, 8, 8, 8)
)
ok_style = ParagraphStyle(
    'OK', fontName='SimHei', fontSize=10, leading=16,
    alignment=TA_LEFT, spaceAfter=6, wordWrap='CJK',
    backColor=OK_BG, borderPadding=(8, 8, 8, 8)
)
tbl_header = ParagraphStyle(
    'TblH', fontName='SimHei', fontSize=9.5, leading=14,
    alignment=TA_CENTER, textColor=colors.white, wordWrap='CJK'
)
tbl_cell = ParagraphStyle(
    'TblC', fontName='SimHei', fontSize=9, leading=13,
    alignment=TA_LEFT, wordWrap='CJK'
)
tbl_cell_en = ParagraphStyle(
    'TblCE', fontName='Times New Roman', fontSize=9, leading=13,
    alignment=TA_LEFT
)
tbl_cell_code = ParagraphStyle(
    'TblCC', fontName='SarasaMonoSC', fontSize=8, leading=12,
    alignment=TA_LEFT
)
caption_style = ParagraphStyle(
    'Caption', fontName='SimHei', fontSize=9, leading=14,
    alignment=TA_CENTER, textColor=colors.HexColor('#666666'), spaceAfter=6
)

# ── Build PDF ──
output_path = '/home/z/my-project/download/guide-deploiement-render.pdf'
doc = SimpleDocTemplate(
    output_path, pagesize=A4,
    leftMargin=2*cm, rightMargin=2*cm, topMargin=2.2*cm, bottomMargin=2*cm,
    title='guide-deploiement-render',
    author='Z.ai', creator='Z.ai',
    subject='Guide de deploiement SchoolFlow Pro sur Render'
)

story = []

# ═══════════════════════════════════════════════════════════════════════
# COVER PAGE
# ═══════════════════════════════════════════════════════════════════════
story.append(Spacer(1, 100))
story.append(Paragraph('<b>SchoolFlow Pro</b>', cover_title))
story.append(Spacer(1, 16))
story.append(Paragraph('Guide de Deploiement sur Render', cover_subtitle))
story.append(Spacer(1, 40))
story.append(Paragraph('Backend API + PostgreSQL + Frontend', cover_info))
story.append(Spacer(1, 12))
story.append(Paragraph('Version 1.0 - Avril 2026', cover_info))
story.append(Spacer(1, 60))
story.append(Paragraph(
    'Ce guide explique comment deployer le backend (API FastAPI) et la base de donnees PostgreSQL '
    'sur Render, puis connecter le frontend deja deploye.',
    ParagraphStyle('CoverDesc', fontName='SimHei', fontSize=11, leading=18,
                   alignment=TA_CENTER, textColor=colors.HexColor('#555555'), wordWrap='CJK')
))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════
# SECTION 1: VUE D'ENSEMBLE
# ═══════════════════════════════════════════════════════════════════════
story.append(Paragraph('<b>1. Architecture de Deploiement</b>', h1_style))
story.append(Spacer(1, 6))
story.append(Paragraph(
    'SchoolFlow Pro est une application <font name="Times New Roman">SaaS</font> multi-tenant composee de trois parties : '
    'un frontend <font name="Times New Roman">React</font>, un backend <font name="Times New Roman">FastAPI (Python)</font>, '
    'et une base de donnees <font name="Times New Roman">PostgreSQL</font>. Actuellement, seul le frontend est deploye sur '
    '<font name="Times New Roman">Render</font>. Le login echoue avec une erreur <font name="Times New Roman">405</font> car '
    'il n\'y a aucun backend pour traiter les requetes <font name="Times New Roman">API</font>.',
    body_style
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    'Pour corriger cela, nous devons deployer deux services supplementaires sur <font name="Times New Roman">Render</font> : '
    'une base de donnees <font name="Times New Roman">PostgreSQL</font> geree et un service <font name="Times New Roman">Web</font> '
    'pour le backend <font name="Times New Roman">FastAPI</font>. Ensuite, nous configurerons le frontend pour pointer vers le backend.',
    body_style
))
story.append(Spacer(1, 12))

# Architecture table
arch_data = [
    [Paragraph('<b>Service</b>', tbl_header), Paragraph('<b>Runtim</b>', tbl_header),
     Paragraph('<b>Plan</b>', tbl_header), Paragraph('<b>Description</b>', tbl_header)],
    [Paragraph('schoolflow-db', tbl_cell_code), Paragraph('PostgreSQL', tbl_cell),
     Paragraph('Free', tbl_cell), Paragraph('Base de donnees geree par Render', tbl_cell)],
    [Paragraph('schoolflow-api', tbl_cell_code), Paragraph('Python 3.11', tbl_cell),
     Paragraph('Free', tbl_cell), Paragraph('Backend API FastAPI (dossier backend/)', tbl_cell)],
    [Paragraph('schoolflow-frontend', tbl_cell_code), Paragraph('Docker', tbl_cell),
     Paragraph('Free', tbl_cell), Paragraph('Frontend React (deja deploye)', tbl_cell)],
]
arch_table = Table(arch_data, colWidths=[3.2*cm, 2.5*cm, 2*cm, 9*cm])
arch_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
    ('TEXTCOLOR', (0, 0), (-1, 0), TABLE_HEADER_TEXT),
    ('BACKGROUND', (0, 1), (-1, 1), TABLE_ROW_EVEN),
    ('BACKGROUND', (0, 2), (-1, 2), TABLE_ROW_ODD),
    ('BACKGROUND', (0, 3), (-1, 3), TABLE_ROW_EVEN),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ('TOPPADDING', (0, 0), (-1, -1), 5),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
]))
story.append(Spacer(1, 6))
story.append(arch_table)
story.append(Spacer(1, 6))
story.append(Paragraph('Tableau 1 : Architecture cible sur Render', caption_style))
story.append(Spacer(1, 18))

# ═══════════════════════════════════════════════════════════════════════
# SECTION 2: ETAPE 1 - BASE DE DONNEES
# ═══════════════════════════════════════════════════════════════════════
story.append(Paragraph('<b>2. Etape 1 - Creer la Base de Donnees PostgreSQL</b>', h1_style))
story.append(Spacer(1, 8))
story.append(Paragraph(
    'Rendez-vous sur le <font name="Times New Roman">Dashboard Render</font> puis suivez ces etapes pour creer la base de donnees.',
    body_style
))
story.append(Spacer(1, 8))

steps_db = [
    ('2.1', 'Aller sur <font name="Times New Roman">https://dashboard.render.com</font> et se connecter avec votre compte <font name="Times New Roman">GitHub</font>.'),
    ('2.2', 'Cliquer sur le bouton <b>New +</b> en haut a droite, puis choisir <b>PostgreSQL</b> dans le menu.'),
    ('2.3', 'Remplir le formulaire de creation de la base de donnees :'),
]
for num, text in steps_db:
    story.append(Paragraph(f'<b>{num}</b>  {text}', step_style))
    story.append(Spacer(1, 4))

# DB form fields
db_fields = [
    [Paragraph('<b>Champ</b>', tbl_header), Paragraph('<b>Valeur a saisir</b>', tbl_header)],
    [Paragraph('Name', tbl_cell), Paragraph('schoolflow-db', tbl_cell_code)],
    [Paragraph('Database', tbl_cell), Paragraph('schoolflow', tbl_cell_code)],
    [Paragraph('User', tbl_cell), Paragraph('schoolflow', tbl_cell_code)],
    [Paragraph('Region', tbl_cell), Paragraph('Frankfurt (EU) - ou la plus proche', tbl_cell)],
    [Paragraph('PostgreSQL Version', tbl_cell), Paragraph('16 (par defaut)', tbl_cell)],
    [Paragraph('Plan', tbl_cell), Paragraph('Free (pour tester) ou Starter ($7/mo)', tbl_cell)],
]
db_table = Table(db_fields, colWidths=[4.5*cm, 12*cm])
db_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
    ('TEXTCOLOR', (0, 0), (-1, 0), TABLE_HEADER_TEXT),
    ('BACKGROUND', (0, 1), (-1, 1), TABLE_ROW_EVEN),
    ('BACKGROUND', (0, 2), (-1, 2), TABLE_ROW_ODD),
    ('BACKGROUND', (0, 3), (-1, 3), TABLE_ROW_EVEN),
    ('BACKGROUND', (0, 4), (-1, 4), TABLE_ROW_ODD),
    ('BACKGROUND', (0, 5), (-1, 5), TABLE_ROW_EVEN),
    ('BACKGROUND', (0, 6), (-1, 6), TABLE_ROW_ODD),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ('TOPPADDING', (0, 0), (-1, -1), 5),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
]))
story.append(Spacer(1, 6))
story.append(db_table)
story.append(Spacer(1, 6))
story.append(Paragraph('Tableau 2 : Configuration de la base de donnees PostgreSQL', caption_style))
story.append(Spacer(1, 8))

story.append(Paragraph('<b>2.4</b>  Cliquer sur <b>Create Database</b>. Render va provisionner la base en 1-2 minutes.', step_style))
story.append(Spacer(1, 6))
story.append(Paragraph(
    'Une fois la base creee, <font name="Times New Roman">Render</font> affiche une page avec les informations de connexion. '
    'Reperez le champ <b>External Database URL</b> qui ressemble a :',
    body_style
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    '<font name="SarasaMonoSC">postgresql://schoolflow:xxxxx@region-postgresql-render.com:5432/schoolflow</font>',
    code_style
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    '<b>Cette URL est votre DATABASE_URL.</b> Copiez-la, vous en aurez besoin pour l\'etape suivante. '
    'Notez aussi le <b>Internal Database URL</b> (utilise par les services Render entre eux, plus rapide et gratuit).',
    body_style
))
story.append(Spacer(1, 8))
story.append(Paragraph(
    '<b>ATTENTION - Plan Free :</b> La base de donnees gratuite est automatiquement supprimee apres 90 jours. '
    'Pour la production, choisissez le plan <font name="Times New Roman">Starter</font> a $7/mo.',
    warn_style
))
story.append(Spacer(1, 18))

# ═══════════════════════════════════════════════════════════════════════
# SECTION 3: ETAPE 2 - BACKEND API
# ═══════════════════════════════════════════════════════════════════════
story.append(Paragraph('<b>3. Etape 2 - Deployer le Backend API</b>', h1_style))
story.append(Spacer(1, 8))
story.append(Paragraph(
    'Maintenant, nous allons creer un service <font name="Times New Roman">Web Service</font> pour heberger le backend '
    '<font name="Times New Roman">FastAPI</font>. Ce service executera le code Python du dossier <font name="Times New Roman">backend/</font> '
    'du depot <font name="Times New Roman">GitHub</font>.',
    body_style
))
story.append(Spacer(1, 8))

steps_api = [
    ('3.1', 'Sur le <font name="Times New Roman">Dashboard Render</font>, cliquer sur <b>New +</b> puis <b>Web Service</b>.'),
    ('3.2', 'Connecter votre compte <font name="Times New Roman">GitHub</font> si ce n\'est pas deja fait, puis selectionner le depot <font name="Times New Roman">skaba89/gestion-scolaire-pro</font>.'),
    ('3.3', 'Remplir la configuration du service :'),
]
for num, text in steps_api:
    story.append(Paragraph(f'<b>{num}</b>  {text}', step_style))
    story.append(Spacer(1, 4))

# API config table
api_fields = [
    [Paragraph('<b>Champ</b>', tbl_header), Paragraph('<b>Valeur</b>', tbl_header)],
    [Paragraph('Name', tbl_cell), Paragraph('schoolflow-api', tbl_cell_code)],
    [Paragraph('Region', tbl_cell), Paragraph('Frankfurt (EU)', tbl_cell)],
    [Paragraph('Branch', tbl_cell), Paragraph('main', tbl_cell_code)],
    [Paragraph('Root Directory', tbl_cell), Paragraph('backend', tbl_cell_code)],
    [Paragraph('Runtime', tbl_cell), Paragraph('Python 3', tbl_cell)],
    [Paragraph('Build Command', tbl_cell), Paragraph('pip install -r requirements.txt', tbl_cell_code)],
    [Paragraph('Start Command', tbl_cell), Paragraph('uvicorn app.main:app --host 0.0.0.0 --port $PORT', tbl_cell_code)],
    [Paragraph('Plan', tbl_cell), Paragraph('Free (pour tester)', tbl_cell)],
]
api_table = Table(api_fields, colWidths=[4*cm, 12.5*cm])
api_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
    ('TEXTCOLOR', (0, 0), (-1, 0), TABLE_HEADER_TEXT),
    *[('BACKGROUND', (0, i), (-1, i), TABLE_ROW_EVEN if i % 2 == 1 else TABLE_ROW_ODD) for i in range(1, 9)],
    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ('TOPPADDING', (0, 0), (-1, -1), 5),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
]))
story.append(Spacer(1, 6))
story.append(api_table)
story.append(Spacer(1, 6))
story.append(Paragraph('Tableau 3 : Configuration du service Backend API', caption_style))
story.append(Spacer(1, 12))

story.append(Paragraph('<b>3.4</b>  Configurer les <b>Variables d\'Environnement</b> (section Environment en bas de page) :', step_style))
story.append(Spacer(1, 6))

# Environment variables table
env_fields = [
    [Paragraph('<b>Cle</b>', tbl_header), Paragraph('<b>Valeur</b>', tbl_header), Paragraph('<b>Note</b>', tbl_header)],
    [Paragraph('DATABASE_URL', tbl_cell_code), Paragraph('(voir etape 2.4)', tbl_cell), Paragraph('L\'External Database URL de Render', tbl_cell)],
    [Paragraph('DATABASE_URL_ASYNC', tbl_cell_code), Paragraph('(meme que DATABASE_URL)', tbl_cell), Paragraph('Meme URL, utilise pour les connexions async', tbl_cell)],
    [Paragraph('DATABASE_URL_SYNC', tbl_cell_code), Paragraph('(meme que DATABASE_URL)', tbl_cell), Paragraph('Meme URL, utilise pour les connexions sync', tbl_cell)],
    [Paragraph('SECRET_KEY', tbl_cell_code), Paragraph('(auto-genere)', tbl_cell), Paragraph('Cliquer "Generate" ou utiliser openssl rand -hex 32', tbl_cell)],
    [Paragraph('DEBUG', tbl_cell_code), Paragraph('false', tbl_cell_code), Paragraph('Desactiver le mode debug en production', tbl_cell)],
    [Paragraph('PYTHON_VERSION', tbl_cell_code), Paragraph('3.11.9', tbl_cell_code), Paragraph('Version Python stable (pas 3.14)', tbl_cell)],
    [Paragraph('PORT', tbl_cell_code), Paragraph('8000', tbl_cell_code), Paragraph('Port du serveur uvicorn', tbl_cell)],
    [Paragraph('BACKEND_CORS_ORIGINS', tbl_cell_code), Paragraph('(voir ci-dessous)', tbl_cell), Paragraph('URL du frontend (etape 4)', tbl_cell)],
]
env_table = Table(env_fields, colWidths=[4*cm, 5.5*cm, 7*cm])
env_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
    ('TEXTCOLOR', (0, 0), (-1, 0), TABLE_HEADER_TEXT),
    *[('BACKGROUND', (0, i), (-1, i), TABLE_ROW_EVEN if i % 2 == 1 else TABLE_ROW_ODD) for i in range(1, 9)],
    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 5),
    ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ('TOPPADDING', (0, 0), (-1, -1), 4),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
]))
story.append(Spacer(1, 6))
story.append(env_table)
story.append(Spacer(1, 6))
story.append(Paragraph('Tableau 4 : Variables d\'environnement du backend', caption_style))
story.append(Spacer(1, 8))

story.append(Paragraph(
    '<b>CORRIGER LE CORS (tres important) :</b> Dans le champ <font name="Times New Roman">BACKEND_CORS_ORIGINS</font>, '
    'mettez l\'URL exacte de votre frontend deploye. Par exemple :',
    body_style
))
story.append(Spacer(1, 4))
story.append(Paragraph(
    '<font name="SarasaMonoSC">https://gestion-scolaire-pro.onrender.com</font>',
    code_style
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    'Sans cela, le navigateur bloquera les requetes du frontend vers le backend pour des raisons de securite <font name="Times New Roman">CORS</font> '
    '(<font name="Times New Roman">Cross-Origin Resource Sharing</font>).',
    body_style
))
story.append(Spacer(1, 8))

story.append(Paragraph('<b>3.5</b>  Cliquer sur <b>Create Web Service</b>.', step_style))
story.append(Spacer(1, 6))
story.append(Paragraph(
    '<font name="Times New Roman">Render</font> va cloner le depot, installer les dependances Python, et lancer le serveur '
    '<font name="Times New Roman">uvicorn</font>. Les migrations <font name="Times New Roman">Alembic</font> s\'executeront '
    'automatiquement au demarrage grace au code dans <font name="Times New Roman">main.py</font>. '
    'Le deploiement prend environ 2-3 minutes.',
    body_style
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    'Une fois le deploiement termine, notez l\'URL de votre backend, par exemple :',
    body_style
))
story.append(Spacer(1, 4))
story.append(Paragraph(
    '<font name="SarasaMonoSC">https://schoolflow-api-xxxx.onrender.com</font>',
    code_style
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    'Pour verifier que le backend fonctionne, ouvrez cette URL dans votre navigateur. Vous devriez voir :',
    body_style
))
story.append(Spacer(1, 4))
story.append(Paragraph(
    '<font name="SarasaMonoSC">{"message": "SchoolFlow Pro API", "version": "1.0.0", "docs": "/docs"}</font>',
    code_style
))
story.append(Spacer(1, 8))

story.append(Paragraph(
    'Vous pouvez aussi tester le health check : <font name="SarasaMonoSC">https://schoolflow-api-xxxx.onrender.com/health/</font>',
    ok_style
))
story.append(Spacer(1, 18))

# ═══════════════════════════════════════════════════════════════════════
# SECTION 4: ETAPE 3 - CONNECTER LE FRONTEND
# ═══════════════════════════════════════════════════════════════════════
story.append(Paragraph('<b>4. Etape 3 - Connecter le Frontend au Backend</b>', h1_style))
story.append(Spacer(1, 8))
story.append(Paragraph(
    'Le frontend est deja deploye mais il essaie d\'utiliser <font name="Times New Roman">/api-proxy</font> qui ne fonctionne pas '
    'car il n\'y a pas de proxy <font name="Times New Roman">nginx</font> sur le service statique <font name="Times New Roman">Render</font>. '
    'Nous devons le configurer pour appeler directement le backend.',
    body_style
))
story.append(Spacer(1, 8))

story.append(Paragraph('<b>4.1 - Methode A (recommandee) : Via le Dashboard Render</b>', h2_style))
story.append(Spacer(1, 4))
steps_fe = [
    ('a', 'Aller sur le <font name="Times New Roman">Dashboard Render</font> et ouvrir le service <b>schoolflow-frontend</b> (votre frontend actuel).'),
    ('b', 'Aller dans la section <b>Environment</b>.'),
    ('c', 'Ajouter ou modifier la variable :'),
]
for num, text in steps_fe:
    story.append(Paragraph(f'<b>{num}.</b>  {text}', step_style))
    story.append(Spacer(1, 2))

story.append(Paragraph(
    '<font name="SarasaMonoSC">VITE_API_URL = https://schoolflow-api-xxxx.onrender.com</font>',
    code_style
))
story.append(Spacer(1, 4))
story.append(Paragraph(
    '(Remplacez <font name="Times New Roman">xxxx</font> par l\'identifiant reel de votre backend.)',
    body_style
))
story.append(Spacer(1, 4))
story.append(Paragraph('<b>d.</b>  Render va automatiquement relancer le build du frontend avec la nouvelle URL.', step_style))
story.append(Spacer(1, 4))
story.append(Paragraph('<b>e.</b>  Attendre 2-3 minutes que le deploiement soit termine.', step_style))
story.append(Spacer(1, 12))

story.append(Paragraph('<b>4.2 - Methode B (rapide, sans rebuild) : Via le Shell Render</b>', h2_style))
story.append(Spacer(1, 4))
story.append(Paragraph(
    'Si vous ne voulez pas refaire un build complet, vous pouvez modifier le fichier de configuration au runtime :',
    body_style
))
story.append(Spacer(1, 4))
steps_shell = [
    ('a', 'Sur le service frontend dans Render, cliquer sur <b>Shell</b> (en haut a droite).'),
    ('b', 'Taper la commande suivante pour editer le fichier de config :'),
]
for num, text in steps_shell:
    story.append(Paragraph(f'<b>{num}.</b>  {text}', step_style))
    story.append(Spacer(1, 2))

story.append(Paragraph(
    '<font name="SarasaMonoSC">nano dist/config.js</font>',
    code_style
))
story.append(Spacer(1, 4))
story.append(Paragraph('<b>c.</b>  Modifier le fichier pour mettre l\'URL de votre backend :', step_style))
story.append(Spacer(1, 4))
story.append(Paragraph(
    '<font name="SarasaMonoSC">window.__SCHOOLFLOW_CONFIG__ = {<br/>'
    '  API_URL: "https://schoolflow-api-xxxx.onrender.com",<br/>'
    '};</font>',
    code_style
))
story.append(Spacer(1, 4))
story.append(Paragraph('<b>d.</b>  Sauvegarder (<font name="Times New Roman">Ctrl+X</font>, puis <font name="Times New Roman">O</font>, puis <font name="Times New Roman">Entree</font>).', step_style))
story.append(Spacer(1, 4))
story.append(Paragraph(
    'Le changement est immediat - pas besoin de rebuild. Mais attention : il sera efface au prochain deploiement. '
    'Utilisez aussi la Methode A pour le rendre permanent.',
    warn_style
))
story.append(Spacer(1, 18))

# ═══════════════════════════════════════════════════════════════════════
# SECTION 5: ETAPE 4 - CREER LE SUPER ADMIN
# ═══════════════════════════════════════════════════════════════════════
story.append(Paragraph('<b>5. Etape 4 - Creer le Super Admin</b>', h1_style))
story.append(Spacer(1, 8))
story.append(Paragraph(
    'Maintenant que le backend tourne, vous devez creer le compte super administrateur pour pouvoir vous connecter. '
    'Les migrations <font name="Times New Roman">Alembic</font> ont cree toutes les tables automatiquement, '
    'mais il n\'y a pas encore d\'utilisateur dans la base.',
    body_style
))
story.append(Spacer(1, 8))

story.append(Paragraph('<b>5.1</b>  Ouvrir le <b>Shell</b> du service <font name="Times New Roman">schoolflow-api</font> sur Render.', step_style))
story.append(Spacer(1, 6))
story.append(Paragraph('<b>5.2</b>  Lancer le script de creation du super admin :', step_style))
story.append(Spacer(1, 4))
story.append(Paragraph(
    '<font name="SarasaMonoSC">python -m app.scripts.create_admin</font>',
    code_style
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    'Le script va creer automatiquement le super administrateur avec les identifiants suivants :',
    body_style
))
story.append(Spacer(1, 4))

creds_data = [
    [Paragraph('<b>Champ</b>', tbl_header), Paragraph('<b>Valeur</b>', tbl_header)],
    [Paragraph('Email', tbl_cell), Paragraph('admin@schoolflow.local', tbl_cell_code)],
    [Paragraph('Mot de passe', tbl_cell), Paragraph('Admin@123456', tbl_cell_code)],
    [Paragraph('Role', tbl_cell), Paragraph('super_admin', tbl_cell_code)],
    [Paragraph('Tenant', tbl_cell), Paragraph('Aucun (super admin global)', tbl_cell)],
]
creds_table = Table(creds_data, colWidths=[4.5*cm, 12*cm])
creds_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
    ('TEXTCOLOR', (0, 0), (-1, 0), TABLE_HEADER_TEXT),
    ('BACKGROUND', (0, 1), (-1, 1), TABLE_ROW_EVEN),
    ('BACKGROUND', (0, 2), (-1, 2), TABLE_ROW_ODD),
    ('BACKGROUND', (0, 3), (-1, 3), TABLE_ROW_EVEN),
    ('BACKGROUND', (0, 4), (-1, 4), TABLE_ROW_ODD),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ('TOPPADDING', (0, 0), (-1, -1), 5),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
]))
story.append(Spacer(1, 6))
story.append(creds_table)
story.append(Spacer(1, 6))
story.append(Paragraph('Tableau 5 : Identifiants du super administrateur', caption_style))
story.append(Spacer(1, 8))

story.append(Paragraph(
    '<b>IMPORTANT :</b> Changez le mot de passe immediatement apres la premiere connexion '
    'pour des raisons de securite.',
    warn_style
))
story.append(Spacer(1, 18))

# ═══════════════════════════════════════════════════════════════════════
# SECTION 6: ETAPE 5 - TEST
# ═══════════════════════════════════════════════════════════════════════
story.append(Paragraph('<b>6. Etape 5 - Tester le Login</b>', h1_style))
story.append(Spacer(1, 8))
story.append(Paragraph(
    'Une fois toutes les etapes terminees, voici comment verifier que tout fonctionne correctement :',
    body_style
))
story.append(Spacer(1, 8))

test_steps = [
    ('6.1', 'Ouvrir votre frontend : <font name="Times New Roman">https://gestion-scolaire-pro.onrender.com</font>'),
    ('6.2', 'Vous devriez voir la page de connexion (login).'),
    ('6.3', 'Saisir les identifiants du super admin : email <font name="Times New Roman">admin@schoolflow.local</font> et mot de passe <font name="Times New Roman">Admin@123456</font>.'),
    ('6.4', 'Cliquer sur <b>Se connecter</b>.'),
    ('6.5', 'Si tout est configure correctement, vous serez redirige vers le tableau de bord admin.'),
]
for num, text in test_steps:
    story.append(Paragraph(f'<b>{num}</b>  {text}', step_style))
    story.append(Spacer(1, 4))
story.append(Spacer(1, 12))

story.append(Paragraph('<b>En cas de probleme, ouvrez la console du navigateur (F12) et verifiez :</b>', h2_style))
story.append(Spacer(1, 6))

debug_data = [
    [Paragraph('<b>Erreur</b>', tbl_header), Paragraph('<b>Cause probable</b>', tbl_header), Paragraph('<b>Solution</b>', tbl_header)],
    [Paragraph('405 Method Not Allowed', tbl_cell), Paragraph('Frontend non connecte au backend', tbl_cell),
     Paragraph('Verifiez VITE_API_URL ou config.js', tbl_cell)],
    [Paragraph('CORS error', tbl_cell), Paragraph('BACKEND_CORS_ORIGINS mal configure', tbl_cell),
     Paragraph('Ajoutez l\'URL du frontend dans le backend', tbl_cell)],
    [Paragraph('401 Unauthorized', tbl_cell), Paragraph('Mauvais identifiants', tbl_cell),
     Paragraph('Utilisez admin@schoolflow.local', tbl_cell)],
    [Paragraph('500 Internal Server', tbl_cell), Paragraph('Erreur backend (logs)', tbl_cell),
     Paragraph('Verifiez les logs Render', tbl_cell)],
    [Paragraph('Network Error', tbl_cell), Paragraph('Backend pas encore demarre', tbl_cell),
     Paragraph('Attendez la fin du deploiement', tbl_cell)],
]
debug_table = Table(debug_data, colWidths=[3.5*cm, 5.5*cm, 7.5*cm])
debug_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
    ('TEXTCOLOR', (0, 0), (-1, 0), TABLE_HEADER_TEXT),
    *[('BACKGROUND', (0, i), (-1, i), TABLE_ROW_EVEN if i % 2 == 1 else TABLE_ROW_ODD) for i in range(1, 6)],
    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 5),
    ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ('TOPPADDING', (0, 0), (-1, -1), 4),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
]))
story.append(Spacer(1, 6))
story.append(debug_table)
story.append(Spacer(1, 6))
story.append(Paragraph('Tableau 6 : Guide de debogage des erreurs courantes', caption_style))
story.append(Spacer(1, 18))

# ═══════════════════════════════════════════════════════════════════════
# SECTION 7: RESUME RAPIDE
# ═══════════════════════════════════════════════════════════════════════
story.append(Paragraph('<b>7. Resume des Etapes</b>', h1_style))
story.append(Spacer(1, 8))
story.append(Paragraph(
    'Voici le recapitulatif complet des actions a effectuer sur <font name="Times New Roman">Render</font> pour deployer '
    'l\'ensemble de l\'application <font name="Times New Roman">SchoolFlow Pro</font> :',
    body_style
))
story.append(Spacer(1, 8))

summary_data = [
    [Paragraph('<b>Etape</b>', tbl_header), Paragraph('<b>Action</b>', tbl_header), Paragraph('<b>Lieu</b>', tbl_header), Paragraph('<b>Duree</b>', tbl_header)],
    [Paragraph('1', tbl_cell), Paragraph('Creer PostgreSQL (schoolflow-db)', tbl_cell), Paragraph('Render Dashboard', tbl_cell), Paragraph('2 min', tbl_cell)],
    [Paragraph('2', tbl_cell), Paragraph('Creer Web Service (schoolflow-api) avec env vars', tbl_cell), Paragraph('Render Dashboard', tbl_cell), Paragraph('5 min + 3 min build', tbl_cell)],
    [Paragraph('3', tbl_cell), Paragraph('Configurer VITE_API_URL dans le frontend', tbl_cell), Paragraph('Render Dashboard ou Shell', tbl_cell), Paragraph('1 min + 3 min rebuild', tbl_cell)],
    [Paragraph('4', tbl_cell), Paragraph('Creer le super admin via le Shell', tbl_cell), Paragraph('Shell Render', tbl_cell), Paragraph('1 min', tbl_cell)],
    [Paragraph('5', tbl_cell), Paragraph('Tester le login sur le frontend', tbl_cell), Paragraph('Navigateur', tbl_cell), Paragraph('1 min', tbl_cell)],
]
summary_table = Table(summary_data, colWidths=[1.5*cm, 7.5*cm, 4.5*cm, 3*cm])
summary_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
    ('TEXTCOLOR', (0, 0), (-1, 0), TABLE_HEADER_TEXT),
    *[('BACKGROUND', (0, i), (-1, i), TABLE_ROW_EVEN if i % 2 == 1 else TABLE_ROW_ODD) for i in range(1, 6)],
    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 5),
    ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ('TOPPADDING', (0, 0), (-1, -1), 4),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
]))
story.append(Spacer(1, 6))
story.append(summary_table)
story.append(Spacer(1, 6))
story.append(Paragraph('Tableau 7 : Recapitulatif des etapes de deploiement', caption_style))
story.append(Spacer(1, 18))

story.append(Paragraph(
    'Temps total estime : environ <b>15-20 minutes</b> si vous avez deja un compte <font name="Times New Roman">Render</font> '
    'avec le depot <font name="Times New Roman">GitHub</font> connecte. La majeure partie du temps est attendue pendant les '
    'deploiements automatiques.',
    body_style
))
story.append(Spacer(1, 8))
story.append(Paragraph(
    '<b>Cout : Le plan Free de Render</b> suffit pour tester. Pour la production, prevoir environ <b>$14/mo</b> '
    '(<font name="Times New Roman">$7</font> pour le backend <font name="Times New Roman">Starter</font> + '
    '<font name="Times New Roman">$7</font> pour la base de donnees <font name="Times New Roman">Starter</font>). '
    'Le frontend reste gratuit.',
    ok_style
))

# ── Build ──
doc.build(story)
print(f'PDF genere: {output_path}')
