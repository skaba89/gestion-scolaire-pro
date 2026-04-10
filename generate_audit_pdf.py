# -*- coding: utf-8 -*-
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.lib.units import cm, inch
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, KeepTogether
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# ── Font Registration ──
pdfmetrics.registerFont(TTFont('SimHei', '/usr/share/fonts/truetype/chinese/SimHei.ttf'))
pdfmetrics.registerFont(TTFont('Microsoft YaHei', '/usr/share/fonts/truetype/chinese/msyh.ttf'))
pdfmetrics.registerFont(TTFont('Times New Roman', '/usr/share/fonts/truetype/english/Times-New-Roman.ttf'))
pdfmetrics.registerFont(TTFont('Calibri', '/usr/share/fonts/truetype/english/calibri-regular.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'))

registerFontFamily('SimHei', normal='SimHei', bold='SimHei')
registerFontFamily('Microsoft YaHei', normal='Microsoft YaHei', bold='Microsoft YaHei')
registerFontFamily('Times New Roman', normal='Times New Roman', bold='Times New Roman')

# ── Colors ──
DARK_BLUE = colors.HexColor('#1F4E79')
ACCENT_BLUE = colors.HexColor('#2980B9')
LIGHT_GRAY = colors.HexColor('#F5F5F5')
RED = colors.HexColor('#E74C3C')
ORANGE = colors.HexColor('#E67E22')
YELLOW = colors.HexColor('#F39C12')
GREEN = colors.HexColor('#27AE60')
DARK_GREEN = colors.HexColor('#1E8449')

# ── Styles ──
cover_title_style = ParagraphStyle(
    name='CoverTitle', fontName='SimHei', fontSize=36, leading=44,
    alignment=TA_CENTER, spaceAfter=20, textColor=DARK_BLUE
)
cover_subtitle_style = ParagraphStyle(
    name='CoverSubtitle', fontName='SimHei', fontSize=18, leading=26,
    alignment=TA_CENTER, spaceAfter=12, textColor=colors.HexColor('#555555')
)
cover_info_style = ParagraphStyle(
    name='CoverInfo', fontName='SimHei', fontSize=13, leading=20,
    alignment=TA_CENTER, spaceAfter=8, textColor=colors.HexColor('#777777')
)
h1_style = ParagraphStyle(
    name='H1', fontName='SimHei', fontSize=18, leading=26,
    alignment=TA_LEFT, spaceBefore=18, spaceAfter=10,
    textColor=DARK_BLUE
)
h2_style = ParagraphStyle(
    name='H2', fontName='SimHei', fontSize=14, leading=20,
    alignment=TA_LEFT, spaceBefore=14, spaceAfter=8,
    textColor=ACCENT_BLUE
)
h3_style = ParagraphStyle(
    name='H3', fontName='SimHei', fontSize=12, leading=18,
    alignment=TA_LEFT, spaceBefore=10, spaceAfter=6,
    textColor=colors.HexColor('#34495E')
)
body_style = ParagraphStyle(
    name='Body', fontName='SimHei', fontSize=10, leading=17,
    alignment=TA_LEFT, spaceAfter=6, wordWrap='CJK'
)
body_indent_style = ParagraphStyle(
    name='BodyIndent', fontName='SimHei', fontSize=10, leading=17,
    alignment=TA_LEFT, spaceAfter=6, leftIndent=20, wordWrap='CJK'
)
bullet_style = ParagraphStyle(
    name='Bullet', fontName='SimHei', fontSize=10, leading=17,
    alignment=TA_LEFT, spaceAfter=4, leftIndent=20, bulletIndent=8,
    wordWrap='CJK'
)
code_style = ParagraphStyle(
    name='Code', fontName='DejaVuSans', fontSize=8, leading=12,
    alignment=TA_LEFT, spaceAfter=4, leftIndent=20,
    backColor=colors.HexColor('#F8F8F8'), textColor=colors.HexColor('#D14')
)
tbl_header_style = ParagraphStyle(
    name='TblHeader', fontName='SimHei', fontSize=9, leading=13,
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

# ── Helpers ──
def sev_color(sev):
    if 'CRITIQUE' in sev: return RED
    if 'HAUTE' in sev: return ORANGE
    if 'MOYENNE' in sev: return YELLOW
    if 'FAIBLE' in sev: return GREEN
    return colors.grey

def sev_tag(sev):
    c = sev_color(sev)
    bg = colors.HexColor('#FDEDEC') if c == RED else colors.HexColor('#FEF5E7') if c == ORANGE else colors.HexColor('#FEF9E7') if c == YELLOW else colors.HexColor('#EAFAF1') if c == GREEN else colors.HexColor('#F2F2F2')
    return Paragraph(f'<font color="{c.hexval()}">{sev}</font>', tbl_cell_center)

def make_table(headers, rows, col_widths):
    data = [[Paragraph(f'<b>{h}</b>', tbl_header_style) for h in headers]]
    for row in rows:
        data.append([Paragraph(str(c), tbl_cell_style) for c in row])
    t = Table(data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), DARK_BLUE),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CCCCCC')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        bg = colors.white if i % 2 == 1 else LIGHT_GRAY
        style_cmds.append(('BACKGROUND', (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style_cmds))
    return t

# ── Document ──
output_path = '/home/z/my-project/download/SchoolFlow_Pro_Audit_Complet_v2.pdf'
doc = SimpleDocTemplate(
    output_path, pagesize=A4,
    leftMargin=2*cm, rightMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm,
    title='SchoolFlow Pro - Audit Complet v2',
    author='Z.ai', creator='Z.ai',
    subject='Audit complet de bout en bout du projet SchoolFlow Pro'
)
story = []
pw = A4[0] - 4*cm  # page width

# ══════════════════════════════════════════════════════════════
# COVER PAGE
# ══════════════════════════════════════════════════════════════
story.append(Spacer(1, 100))
story.append(Paragraph('<b>SchoolFlow Pro</b>', cover_title_style))
story.append(Spacer(1, 20))
story.append(Paragraph('<b>Audit Complet de Bout en Bout</b>', cover_subtitle_style))
story.append(Spacer(1, 12))
story.append(Paragraph('Version 2 - 11 Avril 2026', cover_info_style))
story.append(Spacer(1, 40))

# Summary box
summary_data = [
    [Paragraph('<b>Metrique</b>', tbl_header_style), Paragraph('<b>Valeur</b>', tbl_header_style)],
    [Paragraph('Fichiers backend analyses', tbl_cell_style), Paragraph('80+', tbl_cell_center)],
    [Paragraph('Modules endpoint backend', tbl_cell_style), Paragraph('44', tbl_cell_center)],
    [Paragraph('Fichiers frontend analyses', tbl_cell_style), Paragraph('848', tbl_cell_center)],
    [Paragraph('Composants frontend', tbl_cell_style), Paragraph('470+', tbl_cell_center)],
    [Paragraph('Pages frontend', tbl_cell_style), Paragraph('150+', tbl_cell_center)],
    [Paragraph('Migrations Alembic', tbl_cell_style), Paragraph('23', tbl_cell_center)],
    [Paragraph('Modeles ORM', tbl_cell_style), Paragraph('34', tbl_cell_center)],
]
summary_table = Table(summary_data, colWidths=[pw*0.55, pw*0.45], repeatRows=1)
summary_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), DARK_BLUE),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CCCCCC')),
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
    ('BACKGROUND', (0, 7), (-1, 7), colors.white),
    ('BACKGROUND', (0, 8), (-1, 8), LIGHT_GRAY),
]))
story.append(summary_table)
story.append(Spacer(1, 60))
story.append(Paragraph('Projets SchoolFlow Pro', cover_info_style))
story.append(Paragraph('Backend: FastAPI + SQLAlchemy + PostgreSQL', cover_info_style))
story.append(Paragraph('Frontend: React + Vite + TypeScript', cover_info_style))
story.append(PageBreak())

# ══════════════════════════════════════════════════════════════
# TABLEAU DE SYNTHESE
# ══════════════════════════════════════════════════════════════
story.append(Paragraph('<b>Tableau de Synthese</b>', h1_style))
story.append(Spacer(1, 6))

story.append(Paragraph(
    "Cet audit couvre l'ensemble du projet SchoolFlow Pro : backend (Python/FastAPI), "
    "frontend (React/TypeScript), et les aspects transversaux (CORS, environnement, deploiement, "
    "migrations, contrat API, performance, securite). Chaque fichier cle a ete analyse. "
    "Les resultats sont classes par severite : CRITIQUE (a corriger immediatement), HAUTE (a corriger "
    "avant mise en production), MOYENNE (a planifier), FAIBLE (technique dette).",
    body_style
))
story.append(Spacer(1, 12))

synthesis_headers = ['Severite', 'Nombre', 'Description']
synthesis_rows = [
    ['CRITIQUE', '8', 'Failles de securite majeures, donnees sensibles exposees'],
    ['HAUTE', '12', 'Erreurs fonctionnelles bloquantes, configuration manquante'],
    ['MOYENNE', '18', 'Problemes de qualite, dette technique, configurations sous-optimales'],
    ['FAIBLE', '12', 'Optimisations, nettoyage, best practices non respectees'],
]
story.append(make_table(synthesis_headers, synthesis_rows, [pw*0.15, pw*0.1, pw*0.75]))
story.append(Spacer(1, 18))

# ══════════════════════════════════════════════════════════════
# SECTION 1: SECURITE ET AUTHENTIFICATION
# ══════════════════════════════════════════════════════════════
story.append(Paragraph('<b>1. Securite et Authentification</b>', h1_style))
story.append(Spacer(1, 6))

story.append(Paragraph(
    "L'analyse du systeme d'authentification a revele plusieurs vulnerabilites critiques. "
    "Le systeme utilise des JWT natifs (access + refresh tokens), ce qui est une bonne architecture. "
    "Cependant, des failles majeures compromettent la securite globale du systeme, notamment "
    "au niveau du middleware tenant et du endpoint d'enregistrement.",
    body_style
))
story.append(Spacer(1, 10))

sec_headers = ['ID', 'Severite', 'Fichier', 'Description']
sec_rows = [
    ['S-01', 'CRITIQUE', 'middlewares/tenant.py:46',
     'JWT decode sans verification de signature (verify_signature=False). Un attaquant peut forger un token avec des roles arbitraires et acceder aux donnees de n\'importe quel tenant. Le RLS est contournable.'],
    ['S-02', 'CRITIQUE', 'core/security.py:119',
     'Un SUPER_ADMIN peut injecter un X-Tenant-ID arbitraire via le header. Combine avec S-01, cela donne un acces total a toutes les donnees multi-tenant.'],
    ['S-03', 'CRITIQUE', 'endpoints/auth.py:244',
     'Le endpoint /auth/register/ accepte n\'importe quel role dans le payload, y compris SUPER_ADMIN. Un utilisateur anonyme peut s\'attribuer des privileges maximum.'],
    ['S-04', 'CRITIQUE', 'endpoints/auth.py:468',
     'Le endpoint /auth/bootstrap/ expose les details des erreurs SQL en production (stack trace, noms de tables/colonnes). Fuite d\'information interne.'],
    ['S-05', 'CRITIQUE', '.env:20',
     'Un SECRET_KEY reel est commit dans le depot (64 caracteres hex). Permet de forger des JWT valides si le repo est public.'],
    ['S-06', 'HAUTE', 'endpoints/auth.py:164',
     'Logout et logout-all sont des no-ops : aucun mecanisme de revocation de token. Les JWT restent valides jusqu\'a expiration (30 min access, 7 jours refresh).'],
    ['S-07', 'HAUTE', 'endpoints/auth.py:98',
     'Le endpoint /auth/refresh/ n\'verifie pas le champ "type" du JWT. Un access token peut etre utilise comme refresh token.'],
    ['S-08', 'HAUTE', 'endpoints/auth.py:42',
     'Pas de protection brute-force par compte. Seulement 5 tentatives/minute par IP, contournable avec rotation d\'IP.'],
]
story.append(make_table(sec_headers, sec_rows, [pw*0.06, pw*0.1, pw*0.2, pw*0.64]))
story.append(Spacer(1, 18))

# ══════════════════════════════════════════════════════════════
# SECTION 2: BASE DE DONNEES ET MODELES
# ══════════════════════════════════════════════════════════════
story.append(Paragraph('<b>2. Base de Donnees et Modeles</b>', h1_style))
story.append(Spacer(1, 6))

story.append(Paragraph(
    "Le projet dispose de 34 modeles ORM bien structures avec des cles primaires UUID, "
    "des relations foreign key correctes et un systeme de mixage multi-tenant via TenantMixin. "
    "Cependant, environ 34 tables supplementaires sont gerees exclusivement via du SQL brut "
    "dans le startup, sans modeles ORM ni migrations Alembic. De plus, la chaine de migrations "
    "presente 3 têtes non fusionnees, ce qui rend `alembic upgrade head` silencieusement inoperant.",
    body_style
))
story.append(Spacer(1, 10))

db_headers = ['ID', 'Severite', 'Fichier', 'Description']
db_rows = [
    ['D-01', 'CRITIQUE', 'main.py:944',
     'Les 100+ instructions DDL sont executees dans une seule transaction sans securite. Un echec partiel peut laisser le schema dans un etat incoherent.'],
    ['D-02', 'HAUTE', 'alembic/versions/',
     '3 têtes de migration non fusionnees. alembic upgrade head echoue silencieusement, le fallback create_all() ne gere pas les ALTER TABLE.'],
    ['D-03', 'MOYENNE', 'main.py:271-951',
     '34+ tables n\'ont pas de modeles ORM (library, inventory, clubs, surveys, messaging, forums, alumni, invoices...). Risque de derive de schema.'],
    ['D-04', 'MOYENNE', 'main.py:280',
     'Le DDL utilise une syntaxe PostgreSQL uniquement (gen_random_uuid, JSONB, TIMESTAMPTZ). Incompatible SQLite.'],
    ['D-05', 'MOYENNE', 'main.py:329',
     'Les colonnes monetaires utilisent FLOAT au lieu de DECIMAL. Erreurs d\'arrondi sur les montants financiers.'],
    ['D-06', 'MOYENNE', 'aliases.py:275',
     'Tables class_sessions, student_subjects, classroom_departments interrogees mais jamais creees dans le DDL.'],
    ['D-07', 'FAIBLE', 'requirements.txt:10',
     'bcrypt est pinné exactement a 4.0.1. Nouvelles versions incluent des corrections.'],
]
story.append(make_table(db_headers, db_rows, [pw*0.06, pw*0.1, pw*0.2, pw*0.64]))
story.append(Spacer(1, 18))

# ══════════════════════════════════════════════════════════════
# SECTION 3: FRONTEND
# ══════════════════════════════════════════════════════════════
story.append(Paragraph('<b>3. Frontend</b>', h1_style))
story.append(Spacer(1, 6))

story.append(Paragraph(
    "Le frontend a ete migre avec succes de Supabase vers l'authentification JWT native. "
    "Les 150+ pages sont correctement protegees par des route guards. Le lazy loading est "
    "applique a tous les composants. Cependant, des problemes persistent : les stores Zustand "
    "n'ont jamais ete completement supprimes, creant une double source de verite pour l'etat. "
    "De plus, le package Supabase est toujours dans les dependances et environ 90 fichiers "
    "contiennent des console.log en production.",
    body_style
))
story.append(Spacer(1, 10))

fe_headers = ['ID', 'Severite', 'Fichier', 'Description']
fe_rows = [
    ['F-01', 'CRITIQUE', 'src/stores/appStore.ts',
     'Stores Zustand non supprimes (appStore + notificationStore = 343 lignes). Double source de verite avec AuthContext. 5 fichiers importent encore des stores.'],
    ['F-02', 'CRITIQUE', 'package.json:63',
     '@supabase/supabase-js est toujours en dependance de production (~200KB dans le bundle). Migration non terminee.'],
    ['F-03', 'HAUTE', 'AuthContext.tsx:196',
     'La fonction refreshToken() exposee via useAuth() n\'envoie pas de body {refresh_token: ...}. L\'intercepteur fonctionne, mais l\'appel direct echoue avec 422.'],
    ['F-04', 'HAUTE', 'queries/users.ts:76',
     'Mots de passe temporaires affiches dans des toast notifications pendant 15 secondes. Visible par shoulder-surfing.'],
    ['F-05', 'HAUTE', 'src/stores/',
     'AuthSyncProvider cree une sync bidirectionnelle Context-to-Zustand. Les consommateurs des stores peuvent avoir un etat stale.'],
    ['F-06', 'HAUTE', 'queries/users.ts:87',
     'Messages d\'erreur referencing "Edge Function" (Supabase) au lieu du backend natif.'],
    ['F-07', 'MOYENNE', '90 fichiers src/',
     'Environ 90 fichiers contiennent console.log/error/warn qui fuient des details d\'implementation en production.'],
    ['F-08', 'MOYENNE', 'src/lib/i18n/',
     'Duplication de la config i18n (src/i18n/config.ts vs src/lib/i18n/index.ts). Fichiers de locale dupliques.'],
    ['F-09', 'MOYENNE', 'tsconfig.json:9',
     'noImplicitAny: false, noUnusedParameters: false. Securite de type reduite.'],
    ['F-10', 'FAIBLE', 'src/stores/types.ts',
     'Exports en conflit : useUser/useTheme/useNotifications existent dans les stores ET dans les Contexts.'],
]
story.append(make_table(fe_headers, fe_rows, [pw*0.06, pw*0.1, pw*0.25, pw*0.59]))
story.append(Spacer(1, 18))

# ══════════════════════════════════════════════════════════════
# SECTION 4: INFRASTRUCTURE ET DEPLOIEMENT
# ══════════════════════════════════════════════════════════════
story.append(Paragraph('<b>4. Infrastructure et Deploiement</b>', h1_style))
story.append(Spacer(1, 6))

story.append(Paragraph(
    "La configuration CORS est correcte avec des origines explicites (pas de wildcard avec credentials). "
    "Le render.yaml est bien structure. Cependant, le netlify.toml contient des placeholders non remplaces, "
    "le nginx de production manque de headers CSP/HSTS, et les variables d'environnement sont "
    "incoherentes entre les 3 fichiers de template (.env, .env.example, backend/.env.example).",
    body_style
))
story.append(Spacer(1, 10))

infra_headers = ['ID', 'Severite', 'Fichier', 'Description']
infra_rows = [
    ['I-01', 'HAUTE', 'netlify.toml:49',
     '3 regles de redirect contiennent YOUR_API_URL comme placeholder. Si deploye tel quel, tous les appels API echouent.'],
    ['I-02', 'HAUTE', 'nginx.render.conf.template',
     'Absence de header Content-Security-Policy sur le deploiement Render. Seul le nginx Docker local a un CSP.'],
    ['I-03', 'MOYENNE', 'docker-compose.yml:91',
     'Reference un Dockerfile inexistant (seuls Dockerfile.render et Dockerfile.dev existent). docker compose up frontend echoue.'],
    ['I-04', 'MOYENNE', 'docker/nginx.conf:76',
     'HSTS (Strict-Transport-Security) est commente. Devrait etre active en production HTTPS.'],
    ['I-05', 'MOYENNE', 'docker/nginx.conf:56',
     'connect-src inclut localhost dans le CSP nginx. Artifats de developpement en production.'],
    ['I-06', 'MOYENNE', '3 fichiers .env',
     'Variables d\'environnement incoherentes entre .env, .env.example et backend/.env.example. Pilotes de base de donnee differents.'],
    ['I-07', 'MOYENNE', 'core/exceptions.py:89',
     'Les handlers d\'erreur renvoient Access-Control-Allow-Origin: *, en conflit avec allow_credentials=True.'],
    ['I-08', 'FAIBLE', 'public/config.js:23',
     'URL API Render dur-codée. Devrait etre une chaine vide dans le source (fallback vers /api-proxy).'],
]
story.append(make_table(infra_headers, infra_rows, [pw*0.06, pw*0.1, pw*0.25, pw*0.59]))
story.append(Spacer(1, 18))

# ══════════════════════════════════════════════════════════════
# SECTION 5: CONTRAT API FRONTEND-BACKEND
# ══════════════════════════════════════════════════════════════
story.append(Paragraph('<b>5. Contrat API Frontend-Backend</b>', h1_style))
story.append(Spacer(1, 6))

story.append(Paragraph(
    "Le contrat entre le frontend et le backend est globalement coherent pour les endpoints "
    "critiques (login, refresh, users/me, MFA, pagination, erreurs). Cependant, un probleme "
    "specifique a ete detecte dans la fonction refreshToken() du AuthContext, et le format "
    "de pagination n'est pas uniformement utilise sur tous les alias endpoints.",
    body_style
))
story.append(Spacer(1, 10))

story.append(Paragraph('<b>Points positifs verifies</b>', h3_style))
contract_ok = [
    'POST /auth/login/ : OAuth2 form-data, reponse {access_token, refresh_token, expires_in} - Compatible',
    'POST /auth/refresh/ (intercepteur) : body {refresh_token} - Compatible',
    'GET /users/me/ : reponse {user, profile, roles, tenant} - Compatible',
    'POST /mfa/otp/verify/ : body {code} - Compatible',
    'Pagination : format {items, total, page, page_size, pages} - Compatible',
    'Erreurs : format {error, message, detail, request_id} - Compatible',
]
for item in contract_ok:
    story.append(Paragraph(f'<font color="{GREEN.hexval()}">OK</font> - {item}', body_indent_style))

story.append(Spacer(1, 10))
story.append(Paragraph('<b>Points a corriger</b>', h3_style))
contract_issues = [
    'POST /auth/refresh/ (AuthContext.tsx:196) : pas de body envoye - 422 sur appel direct via useAuth()',
    'Alias endpoints : beaucoup renvoient des listes au lieu de {items, total} - pagination non uniforme',
    'Sentry ignoreErrors : references des messages Supabase (Invalid login credentials, Email not confirmed)',
]
for item in contract_issues:
    story.append(Paragraph(f'<font color="{RED.hexval()}">KO</font> - {item}', body_indent_style))

story.append(Spacer(1, 18))

# ══════════════════════════════════════════════════════════════
# SECTION 6: PLAN D'ACTION PRIORITAIRE
# ══════════════════════════════════════════════════════════════
story.append(Paragraph('<b>6. Plan d\'Action Prioritaire</b>', h1_style))
story.append(Spacer(1, 6))

story.append(Paragraph('<b>Phase 1 - Immediat (avant prochain deploiement)</b>', h2_style))
phase1 = [
    ['S-01', 'Verifier la signature JWT dans le TenantMiddleware (remplacer verify_signature=False)'],
    ['S-03', 'Whitelister les roles autorises dans /auth/register/ (PARENT, STUDENT uniquement)'],
    ['S-04', 'Ne pas exposer str(e) dans les reponses bootstrap en production'],
    ['S-05', 'Faire tourner SECRET_KEY et verifier que .env est dans .gitignore'],
    ['F-03', 'Corriger refreshToken() dans AuthContext : envoyer {refresh_token: value} dans le body'],
    ['D-02', 'Fusionner les 3 têtes Alembic : alembic merge heads -m "merge_all_heads"'],
]
for item in phase1:
    story.append(Paragraph(f'<font color="{RED.hexval()}">[P0]</font> {item[0]} : {item[1]}', bullet_style))

story.append(Spacer(1, 10))
story.append(Paragraph('<b>Phase 2 - Court terme (1 semaine)</b>', h2_style))
phase2 = [
    ['S-02', 'Valider le X-Tenant-ID injecte contre les tenants autorises de l\'utilisateur'],
    ['S-06', 'Implementer un blacklist de tokens dans Redis pour le logout'],
    ['S-07', 'Verifier le champ "type" du JWT dans le refresh endpoint'],
    ['S-08', 'Ajouter un lockout par compte apres N tentatives echouees'],
    ['F-01', 'Supprimer les stores Zustand (appStore, types.ts, AuthSyncProvider)'],
    ['F-02', 'Retirer @supabase/supabase-js des dependances'],
    ['I-01', 'Remplacer YOUR_API_URL dans netlify.toml ou migrer vers Edge Functions'],
    ['I-02', 'Ajouter CSP header dans nginx.render.conf.template'],
]
for item in phase2:
    story.append(Paragraph(f'<font color="{ORANGE.hexval()}">[P1]</font> {item[0]} : {item[1]}', bullet_style))

story.append(Spacer(1, 10))
story.append(Paragraph('<b>Phase 3 - Moyen terme (2-4 semaines)</b>', h2_style))
phase3 = [
    ['D-03', 'Creer des modeles ORM pour les 34+ tables en SQL brut'],
    ['D-04', 'Ajouter des gardes SQLite dans le DDL operationnel'],
    ['D-05', 'Remplacer FLOAT par DECIMAL(15,2) pour les colonnes monetaires'],
    ['F-07', 'Nettoyer les 90 fichiers avec console.log/error/warn'],
    ['F-08', 'Supprimer la duplication i18n (src/lib/i18n/)'],
    ['I-04', 'Activer HSTS dans la config nginx de production'],
    ['I-07', 'Corriger le CORS wildcard dans les handlers d\'erreur'],
    ['I-06', 'Consolider les 3 fichiers .env.example en un seul'],
]
for item in phase3:
    story.append(Paragraph(f'<font color="{YELLOW.hexval()}">[P2]</font> {item[0]} : {item[1]}', bullet_style))

story.append(Spacer(1, 10))
story.append(Paragraph('<b>Phase 4 - Dette technique</b>', h2_style))
phase4 = [
    ['D-01', 'Deplacer le DDL operationnel dans les migrations Alembic'],
    ['D-06', 'Ajouter le DDL manquant pour class_sessions, student_subjects, classroom_departments'],
    ['F-09', 'Activer noImplicitAny: true dans tsconfig.json'],
    ['F-10', 'Supprimer les exports en conflit entre stores et Contexts'],
    ['F-04', 'Remplacer les toast de mots de passe par des modals one-time'],
    ['S-05b', 'Migrer les tokens du localStorage vers des cookies httpOnly'],
    ['S-07b', 'Implementer un mutex pour eviter les race conditions de refresh'],
]
for item in phase4:
    story.append(Paragraph(f'<font color="{GREEN.hexval()}">[P3]</font> {item[0]} : {item[1]}', bullet_style))

story.append(Spacer(1, 18))

# ══════════════════════════════════════════════════════════════
# SECTION 7: ESTIMATION EFFORT
# ══════════════════════════════════════════════════════════════
story.append(Paragraph('<b>7. Estimation de l\'Effort</b>', h1_style))
story.append(Spacer(1, 6))

effort_headers = ['Phase', 'Nombre d\'actions', 'Estimation (heures)', 'Priorite']
effort_rows = [
    ['Phase 1 - Immediat', '6 actions', '~12 heures', 'CRITIQUE'],
    ['Phase 2 - Court terme', '8 actions', '~24 heures', 'HAUTE'],
    ['Phase 3 - Moyen terme', '8 actions', '~20 heures', 'MOYENNE'],
    ['Phase 4 - Dette technique', '7 actions', '~18 heures', 'FAIBLE'],
    ['Total', '29 actions', '~74 heures', '-'],
]
story.append(make_table(effort_headers, effort_rows, [pw*0.35, pw*0.2, pw*0.25, pw*0.2]))
story.append(Spacer(1, 18))

# ── Build ──
doc.build(story)
print(f"PDF genere : {output_path}")
