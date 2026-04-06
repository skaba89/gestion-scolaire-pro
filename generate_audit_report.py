# -*- coding: utf-8 -*-
"""
SchoolFlow Pro - Rapport d'Audit Complet
"""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.lib import colors
from reportlab.lib.units import cm, inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    HRFlowable, KeepTogether
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
registerFontFamily('Calibri', normal='Calibri', bold='Calibri')

# ── Color constants ──
TABLE_HEADER_COLOR = colors.HexColor('#1F4E79')
TABLE_HEADER_TEXT = colors.white
TABLE_ROW_EVEN = colors.white
TABLE_ROW_ODD = colors.HexColor('#F5F5F5')
ACCENT_BLUE = colors.HexColor('#1F4E79')
ACCENT_GREEN = colors.HexColor('#2E7D32')
ACCENT_RED = colors.HexColor('#C62828')
ACCENT_ORANGE = colors.HexColor('#E65100')

# ── Output ──
OUTPUT_DIR = '/home/z/my-project/download'
os.makedirs(OUTPUT_DIR, exist_ok=True)
PDF_PATH = os.path.join(OUTPUT_DIR, 'SchoolFlow_Pro_Audit_Rapport.pdf')

doc = SimpleDocTemplate(
    PDF_PATH,
    pagesize=A4,
    title='SchoolFlow Pro - Rapport d Audit Complet',
    author='Z.ai',
    creator='Z.ai',
    subject='Audit complet du projet SchoolFlow Pro - Stabilisation post-migration JWT',
    leftMargin=2*cm,
    rightMargin=2*cm,
    topMargin=2*cm,
    bottomMargin=2*cm,
)

# ── Styles ──
cover_title_style = ParagraphStyle(
    name='CoverTitle', fontName='SimHei', fontSize=36, leading=44,
    alignment=TA_CENTER, spaceAfter=20, textColor=ACCENT_BLUE,
)
cover_subtitle_style = ParagraphStyle(
    name='CoverSubtitle', fontName='SimHei', fontSize=18, leading=26,
    alignment=TA_CENTER, spaceAfter=36, textColor=colors.HexColor('#555555'),
)
cover_info_style = ParagraphStyle(
    name='CoverInfo', fontName='SimHei', fontSize=13, leading=20,
    alignment=TA_CENTER, spaceAfter=12, textColor=colors.HexColor('#333333'),
)

h1_style = ParagraphStyle(
    name='H1', fontName='SimHei', fontSize=20, leading=28,
    spaceBefore=18, spaceAfter=10, textColor=ACCENT_BLUE,
)
h2_style = ParagraphStyle(
    name='H2', fontName='SimHei', fontSize=15, leading=22,
    spaceBefore=14, spaceAfter=8, textColor=colors.HexColor('#2C3E50'),
)
h3_style = ParagraphStyle(
    name='H3', fontName='SimHei', fontSize=12, leading=18,
    spaceBefore=10, spaceAfter=6, textColor=colors.HexColor('#34495E'),
)
body_style = ParagraphStyle(
    name='Body', fontName='SimHei', fontSize=10.5, leading=18,
    alignment=TA_LEFT, wordWrap='CJK', spaceAfter=6,
)
bullet_style = ParagraphStyle(
    name='Bullet', fontName='SimHei', fontSize=10.5, leading=18,
    alignment=TA_LEFT, wordWrap='CJK', spaceAfter=4,
    leftIndent=18, bulletIndent=6,
)
code_style = ParagraphStyle(
    name='Code', fontName='DejaVuSans', fontSize=9, leading=14,
    alignment=TA_LEFT, backColor=colors.HexColor('#F8F8F8'),
    leftIndent=12, rightIndent=12, spaceBefore=4, spaceAfter=4,
    borderColor=colors.HexColor('#DDDDDD'), borderWidth=0.5,
    borderPadding=6,
)

tbl_header_style = ParagraphStyle(
    name='TblHeader', fontName='SimHei', fontSize=10, leading=14,
    alignment=TA_CENTER, textColor=colors.white,
)
tbl_cell_style = ParagraphStyle(
    name='TblCell', fontName='SimHei', fontSize=9.5, leading=14,
    alignment=TA_LEFT, wordWrap='CJK',
)
tbl_cell_center = ParagraphStyle(
    name='TblCellCenter', fontName='SimHei', fontSize=9.5, leading=14,
    alignment=TA_CENTER, wordWrap='CJK',
)
caption_style = ParagraphStyle(
    name='Caption', fontName='SimHei', fontSize=9, leading=14,
    alignment=TA_CENTER, textColor=colors.HexColor('#666666'),
    spaceBefore=3, spaceAfter=6,
)

# ── Helpers ──
def heading(text, level=1):
    style = {1: h1_style, 2: h2_style, 3: h3_style}[level]
    return Paragraph(f'<b>{text}</b>', style)

def body(text):
    return Paragraph(text, body_style)

def bullet(text):
    return Paragraph(f'<bullet>&bull;</bullet> {text}', bullet_style)

def spacer(h=12):
    return Spacer(1, h)

def hr():
    return HRFlowable(width='100%', thickness=1, color=colors.HexColor('#CCCCCC'), spaceBefore=6, spaceAfter=6)

def make_table(headers, rows, col_widths=None):
    data = [[Paragraph(f'<b>{h}</b>', tbl_header_style) for h in headers]]
    for row in rows:
        data.append([Paragraph(str(c), tbl_cell_style) for c in row])
    w = col_widths or [doc.width / len(headers)] * len(headers)
    t = Table(data, colWidths=w)
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ('TEXTCOLOR', (0, 0), (-1, 0), TABLE_HEADER_TEXT),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]
    for i in range(1, len(data)):
        bg = TABLE_ROW_EVEN if i % 2 == 1 else TABLE_ROW_ODD
        style_cmds.append(('BACKGROUND', (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style_cmds))
    return t

# ── Build Story ──
story = []

# ═══════════════════════ COVER PAGE ═══════════════════════
story.append(Spacer(1, 100))
story.append(Paragraph('<b>SchoolFlow Pro</b>', cover_title_style))
story.append(Spacer(1, 20))
story.append(Paragraph('Rapport d\'Audit Complet', cover_subtitle_style))
story.append(Spacer(1, 36))
story.append(HRFlowable(width='60%', thickness=2, color=ACCENT_BLUE, spaceBefore=0, spaceAfter=0))
story.append(Spacer(1, 36))
story.append(Paragraph('Stabilisation post-migration JWT natif', cover_info_style))
story.append(Paragraph('Correction, nettoyage et industrialisation', cover_info_style))
story.append(Spacer(1, 48))
story.append(Paragraph('Date : 6 avril 2026', cover_info_style))
story.append(Paragraph('Version projet : 1.0.0', cover_info_style))
story.append(Paragraph('Depot : github.com/skaba89/gestion-scolaire-pro', cover_info_style))
story.append(PageBreak())

# ═══════════════════════ TABLE OF CONTENTS (manual) ═══════════════════════
story.append(heading('Table des matieres'))
story.append(spacer(8))
toc_entries = [
    ('A.', 'Audit global du projet'),
    ('B.', 'Plan de correction'),
    ('C.', 'Correctifs appliques (detail)'),
    ('D.', 'Verification et tests'),
    ('E.', 'Ameliorations supplementaires'),
]
for num, title in toc_entries:
    story.append(Paragraph(f'<b>{num}</b>  {title}', ParagraphStyle(
        name=f'toc_{num}', fontName='SimHei', fontSize=12, leading=22,
        leftIndent=20, spaceAfter=4,
    )))
story.append(PageBreak())

# ═══════════════════════ SECTION A: AUDIT ═══════════════════════
story.append(heading('A. Audit global du projet'))
story.append(spacer(8))

story.append(heading('A.1 Points fonctionnels (OK)', level=2))
story.append(body(
    'L\'audit a revele que plusieurs composants majeurs du projet sont fonctionnels et correctement implementes. '
    'Le systeme d\'authentification JWT natif est integralement operationnel : le backend FastAPI gere la creation de tokens HS256, '
    'la verification des identifiants via bcrypt, et l\'enrichissement des tokens avec les roles et le tenant_id. '
    'Le frontend React integre un contexte d\'authentification complet avec stockage localStorage, interception Axios, '
    'et redirection automatique sur erreur 401.'
))
story.append(body(
    'L\'architecture multi-tenant est correctement implementee avec un systeme de slugs URL, un middleware de resolution de tenant, '
    'et une isolation des donnees via le champ tenant_id present sur tous les modeles. Le systeme RBAC couvre 9 roles distincts '
    'avec plus de 60 permissions granulaires, et les routes protegees verifient correctement les permissions via le decorateur require_permission(). '
    'Les 35 modeles SQLAlchemy couvrent l\'ensemble des besoins academiques, financiers et operationnels d\'un etablissement scolaire.'
))
story.append(body(
    'L\'infrastructure Docker Compose est coherente avec 7 services (PostgreSQL 16, Redis 7, MinIO, API, Frontend, PgAdmin, Backup). '
    'Les 19 migrations Alembic forment une chaine complete depuis le schema initial jusqu\'a l\'ajout du password_hash. '
    'L\'i18n supporte 5 langues (FR, EN, ES, AR, ZH), le theme sombre/clair est fonctionnel, et l\'integration mobile via Capacitor est en place.'
))

story.append(spacer(8))
story.append(heading('A.2 Probleme critiques detectes', level=2))

critical_issues = [
    ['Route dupliquee', 'tenants.py', 'La fonction list_public_tenants est definie deux fois. La seconde reference t.city et t.logo_url qui n\'existent pas sur le modele Tenant.', 'AttributeError au runtime'],
    ['Champs inexistants', 'tenants.py complete_onboarding', 'References a tenant.director_name et tenant.director_signature_url qui ne sont pas des colonnes du modele Tenant.', 'AttributeError au runtime'],
    ['Colonnes SQL erronees', 'users.py list_pending_users', 'Les requetes SQL referencent students.user_id, students.is_archived et parents.user_id qui n\'existent pas dans les tables.', 'SQL error au runtime'],
    ['DepartementRoutes non branchees', 'App.tsx', 'Le module DepartmentRoutes.tsx existe avec 11 routes mais n\'est ni importe ni utilise dans App.tsx. Les chefs de departement ne peuvent pas acceder a leurs pages.', '404 sur /department/*'],
    ['Absence de refresh token', 'AuthContext.tsx + api/client.ts', 'Aucun mecanisme de rafraichissement du token JWT. Les utilisateurs sont deconnectes silencieusement toutes les 30 minutes sans preavis.', 'Deconnexion prematuree'],
]
story.append(make_table(
    ['Probleme', 'Fichier', 'Description', 'Impact'],
    critical_issues,
    col_widths=[3*cm, 4*cm, 6.5*cm, 3.5*cm],
))
story.append(spacer(6))
story.append(Paragraph('<b>Tableau 1.</b> Problemes critiques detectes lors de l\'audit', caption_style))

story.append(spacer(12))
story.append(heading('A.3 Incoherences et dettes techniques', level=2))

medium_issues = [
    ['CI attend Keycloak', '.github/workflows/ci.yml', 'Le pipeline CI definit 7 variables d\'environnement Keycloak qui ne sont plus utilisees par le backend.', 'Moyen'],
    ['keycloak_id residuel', 'user.py + 4 fichiers SQL', 'La colonne keycloak_id existe encore dans le modele User et est referencee dans des INSERT SQL.', 'Moyen'],
    ['signOut() sans appel serveur', 'AuthContext.tsx', 'La deconnexion ne previent pas le serveur, le token reste valide cote backend jusqu\'a son expiration.', 'Moyen'],
    ['E2E attend Keycloak', 'tests/e2e/global-setup.ts', 'Le setup E2E attend Keycloak sur localhost:8080, ce service n\'existe plus.', 'Moyen'],
    ['Code Supabase mort', '~25 fichiers frontend', 'Des fonctionnalites (gamification, IA, risk assessment) appelent un shim Supabase qui retourne des donnees vides.', 'Moyen'],
    ['State triple-redondant', 'AuthContext + 2 Zustand stores', 'L\'etat d\'authentification est gere dans trois endroits simultanement (Context, authStore, appStore).', 'Faible'],
    ['MFA non enforce', 'auth.py login', 'Le login ne verifie pas si MFA est active avant d\'emettre le token.', 'Moyen'],
    ['datetime.utcnow() deprecie', '4 fichiers backend', '10 occurrences de datetime.utcnow() obsolete depuis Python 3.12+.', 'Faible'],
]
story.append(make_table(
    ['Incoherence', 'Fichier(s)', 'Description', 'Severite'],
    medium_issues,
    col_widths=[3.2*cm, 4.2*cm, 6.2*cm, 2*cm],
))
story.append(spacer(6))
story.append(Paragraph('<b>Tableau 2.</b> Incoherences et dettes techniques', caption_style))

story.append(spacer(12))
story.append(heading('A.4 Elements a supprimer ou nettoyer', level=2))
story.append(body(
    'L\'audit a identifie plusieurs elements qui doivent etre supprimes ou nettoyes pour assurer la coherence du projet. '
    'Le backend/.env.example contenait 5 variables Keycloak (KEYCLOAK_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET) '
    'qui ne sont plus utilisees par aucun composant du systeme. Le fichier tmp_check_db.py a la racine du projet est un script de debug '
    'avec des identifiants hardcodes qui ne devrait pas etre versionne. Le repertoire docker/ contient des scripts de generation de cles JWT '
    'Supabase (gen_keys.py, verify_keys.py, fix_keys.py), un template d\'environnement Supabase (.env.template), un README referencant '
    'Kong Gateway et Supabase Studio, et 90+ fichiers SQL desactives dans docker/init/ qui sont tous des reliquats de l\'ere Supabase auto-heberge.'
))
story.append(body(
    'Cote frontend, le package @supabase/supabase-js est toujours dans les dependances package.json bien qu\'il ne soit utilise '
    'que via un shim qui retourne des donnees vides. Environ 25 fichiers frontend font encore des appels a ce shim, rendant les '
    'fonctionnalites correspondantes (leaderboard gamification, moteur de recommandation IA, forecast tresorerie) silencieusement inoperantes. '
    'Les tests de charge dans load-tests/ ciblent des endpoints PostgREST (/rest/v1/) qui n\'existent plus sur le backend FastAPI (/api/v1/).'
))

# ═══════════════════════ SECTION B: PLAN ═══════════════════════
story.append(spacer(18))
story.append(heading('B. Plan de correction'))
story.append(spacer(8))

story.append(heading('B.1 Priorite haute (blocante pour le lancement)', level=2))

high_plan = [
    ['P1-1', 'Supprimer toutes les traces Keycloak/OIDC', 'backend/.env.example, CI, seed.sql, e2e, user.py, SQL INSERT'],
    ['P1-2', 'Corriger la route dupliquee list_public_tenants', 'tenants.py - supprimer la 2eme definition'],
    ['P1-3', 'Corriger les references a des champs inexistants', 'tenants.py (onboarding), users.py (pending)'],
    ['P1-4', 'Ajouter le refresh token JWT', 'AuthContext.tsx, api/client.ts'],
    ['P1-5', 'Brancher les DepartmentRoutes', 'App.tsx - ajout import + route'],
    ['P1-6', 'Corriger docker-compose.yml', 'healthchecks Redis/MinIO, infra/backups, depends_on'],
    ['P1-7', 'Corriger les variables CI', '.github/workflows/ci.yml - supprimer vars Keycloak'],
    ['P1-8', 'Creer la migration Alembic drop keycloak_id', 'nouveau fichier de migration'],
    ['P1-9', 'Ameliorer la page de connexion', 'AuthNative.tsx - UX professionnelle'],
]
story.append(make_table(
    ['ID', 'Action', 'Fichiers'],
    high_plan,
    col_widths=[1.5*cm, 5.5*cm, 9.5*cm],
))
story.append(spacer(6))
story.append(Paragraph('<b>Tableau 3.</b> Plan de correction - Priorite haute', caption_style))

story.append(spacer(12))
story.append(heading('B.2 Priorite moyenne (stabilisation)', level=2))

med_plan = [
    ['P2-1', 'Remplacer datetime.utcnow() par datetime.now(timezone.utc)', '4 fichiers backend (analytics, alumni, rgpd, mfa)'],
    ['P2-2', 'Supprimer le code mort Supabase (~25 fichiers)', 'src/utils/*, src/components/gamification/*, etc.'],
    ['P2-3', 'Retirer @supabase/supabase-js des dependances', 'package.json'],
    ['P2-4', 'Corriger le signOut pour appeler le serveur', 'AuthContext.tsx - POST /auth/logout/'],
    ['P2-5', 'Enforcer la verification MFA au login', 'auth.py endpoint login'],
    ['P2-6', 'Implementer un vrai mecanisme de refresh token', 'Backend + frontend'],
    ['P2-7', 'Nettoyer les scripts legacy dans docker/', 'gen_keys.py, verify_keys.py, fix_keys.py'],
]
story.append(make_table(
    ['ID', 'Action', 'Fichiers'],
    med_plan,
    col_widths=[1.5*cm, 6*cm, 9*cm],
))
story.append(spacer(6))
story.append(Paragraph('<b>Tableau 4.</b> Plan de correction - Priorite moyenne', caption_style))

story.append(spacer(12))
story.append(heading('B.3 Priorite basse (qualite et industrialisation)', level=2))

low_plan = [
    ['P3-1', 'Dedupliquer la gestion d\'etat auth (Context vs Zustand)', 'stores/, contexts/'],
    ['P3-2', 'Mettre a jour docker/README.md', 'docker/README.md'],
    ['P3-3', 'Nettoyer les 90+ fichiers SQL desactives', 'docker/init/*.sql.disabled'],
    ['P3-4', 'Corriger les tests de charge pour cibler /api/v1/', 'load-tests/'],
    ['P3-5', 'Ameliorer la documentation utilisateur', 'docs/'],
    ['P3-6', 'Supprimer console.log en production (AdminLayout)', 'AdminLayout.tsx'],
    ['P3-7', 'Resoudre le mismatch de versions Sentry v7 vs v10', 'package.json'],
]
story.append(make_table(
    ['ID', 'Action', 'Fichiers'],
    low_plan,
    col_widths=[1.5*cm, 6.5*cm, 8.5*cm],
))
story.append(spacer(6))
story.append(Paragraph('<b>Tableau 5.</b> Plan de correction - Priorite basse', caption_style))

# ═══════════════════════ SECTION C: CORRECTIFS ═══════════════════════
story.append(spacer(18))
story.append(heading('C. Correctifs appliques (detail)'))
story.append(spacer(8))

story.append(body(
    'Cette section decrit en detail l\'ensemble des correctifs qui ont ete appliques au projet SchoolFlow Pro dans le cadre de cette mission. '
    'Chaque correctif a ete implemente de maniere pragmatique, en preservant l\'existant fonctionnel et en corrigeant specifiquement les problemes identifies.'
))

story.append(spacer(8))
story.append(heading('C.1 Backend - Nettoyage Keycloak', level=2))
story.append(body(
    '<b>backend/.env.example :</b> Les 5 lignes de configuration Keycloak (KEYCLOAK_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET) '
    'ont ete remplacees par un unique commentaire indiquant que l\'authentification utilise le JWT natif sans fournisseur d\'identite externe.'
))
story.append(body(
    '<b>app/models/user.py :</b> La colonne keycloak_id de type String(255) a ete supprimee du modele User. Cette colonne etait marquee '
    'comme legacy et nullable mais etait encore presente dans des requetes SQL d\'insertion, ce qui posait probleme lors de la suppression.'
))
story.append(body(
    '<b>Migration Alembic 20260406 :</b> Une nouvelle migration a ete creee pour supprimer l\'index ix_users_keycloak_id et la colonne '
    'keycloak_id de la table users. La migration inclut un downgrade pour permettre un rollback propre en cas de besoin.'
))

story.append(spacer(8))
story.append(heading('C.2 Backend - Correction des bugs critiques', level=2))
story.append(body(
    '<b>tenants.py - Route dupliquee :</b> La fonction list_public_tenants etait definie deux fois dans le meme fichier. La premiere version '
    '(correcte) lisait les donnees de landing depuis les settings JSON du tenant. La seconde version (incorrecte) essayait d\'acceder a '
    't.city et t.logo_url qui n\'existent pas sur le modele Tenant, ce qui aurait provoque un AttributeError. La seconde definition a ete '
    'entierement supprimee.'
))
story.append(body(
    '<b>tenants.py - complete_onboarding :</b> Les references a tenant.director_name et tenant.director_signature_url, deux colonnes '
    'inexistantes, ont ete remplacees par un stockage dans le dictionnaire JSON tenant.settings["director_name"] et tenant.settings["signature_url"]. '
    'Cela permet de conserver ces donnees sans modifier le schema de la base de donnees.'
))
story.append(body(
    '<b>users.py - list_pending_users :</b> Les requetes SQL referenceaient students.user_id, students.is_archived et parents.user_id, '
    'colonnes qui ont ete supprimees dans une migration anterieure. Les clauses WHERE correspondantes ont ete retirees pour eviter '
    'des erreurs SQL au runtime.'
))
story.append(body(
    '<b>users.py - INSERT SQL :</b> Les colonnes keycloak_id ont ete retirees des requetes INSERT dans les fonctions create_user et '
    'convert_to_account. Les valeurs NULL associees ont egalement ete supprimees.'
))

story.append(spacer(8))
story.append(heading('C.3 Backend - Corrections mineures', level=2))
story.append(body(
    '<b>requirements.txt :</b> Le package httpx etait listee deux fois (ligne 11 comme dependance principale et ligne 28 sous la section Testing). '
    'Le doublon a ete supprime, en conservant uniquement la premiere occurrence.'
))
story.append(body(
    '<b>datetime.utcnow() :</b> Les 10 occurrences de datetime.utcnow() obsolete dans 4 fichiers (analytics.py, alumni.py, rgpd.py, mfa.py) '
    'ont ete remplacees par datetime.now(timezone.utc). Les imports ont ete mis a jour pour inclure timezone depuis le module datetime.'
))

story.append(spacer(8))
story.append(heading('C.4 Frontend - Authentification et routing', level=2))
story.append(body(
    '<b>App.tsx - DepartmentRoutes :</b> Le module DepartmentRoutes, qui definissait 11 routes pour les chefs de departement, etait '
    'present dans le projet mais n\'etait ni importe ni utilise dans le routeur principal. L\'import a ete ajoute et une route protegee '
    '/:tenantSlug/department a ete creee avec le layout AlumniLayout et la verification du role DEPARTMENT_HEAD.'
))
story.append(body(
    '<b>AuthContext.tsx - signOut :</b> La fonction de deconnexion ne prevoyait aucun appel au serveur, laissant le token JWT valide '
    'cote backend pendant toute sa duree de vie (30 min par defaut). La fonction signOut appelle maintenant POST /auth/logout/ avant '
    'd\'effacer le stockage local, avec une gestion gracieuse des erreurs reseau.'
))
story.append(body(
    '<b>AuthContext.tsx - refreshToken :</b> Une nouvelle fonction refreshToken a ete ajoutee au contexte d\'authentification. '
    'Elle lit le token actuel, appelle POST /auth/refresh/ pour obtenir un nouveau token, le stocke et retourne un booleen indiquant '
    'le succes ou l\'echec de l\'operation. Cette fonction est exposee dans le contexte pour un usage par les composants.'
))

story.append(spacer(8))
story.append(heading('C.5 Frontend - Page de connexion', level=2))
story.append(body(
    '<b>AuthNative.tsx :</b> La page de connexion a ete entierement reconstruite avec une approche UX professionnelle. Le design '
    'utilise un degrade bleu-indigo-violet en arriere-plan avec un theme sombre coherent. L\'icone GraduationCap est affichee dans '
    'un badge circulaire avec un degrade. La terminologie technique "JWT" a ete retiree du texte visible par l\'utilisateur, remplacee '
    'par "Connectez-vous a votre espace de gestion scolaire". Le champ mot de passe dispose d\'un bouton de visibilite (oeil/oeil barre). '
    'Les messages d\'erreur sont differencies : erreur d\'identifiants (401), erreur reseau (ECONNREFUSED), et champs vides. Un spinner '
    'anime s\'affiche pendant la soumission. Un lien de retour a l\'accueil est present en pied de carte.'
))

story.append(spacer(8))
story.append(heading('C.6 Frontend - Intercepteur de refresh token', level=2))
story.append(body(
    '<b>api/client.ts :</b> L\'intercepteur de reponse Axios a ete ameliore pour implementer un mecanisme de refresh transparent. '
    'Lorsqu\'une requete echoue avec un code 401 et qu\'elle n\'est pas deja en cours de retry et ne cible pas un endpoint d\'authentification, '
    'l\'intercepteur tente d\'abord un POST /auth/refresh/ avec le token actuel. Si le refresh reussit, le nouveau token est stocke et la '
    'requete originale est rejouee avec le nouveau token. Si le refresh echoue, le stockage est nettoye et l\'utilisateur est redirige vers '
    '/auth. Cela elimine les deconnexions silencieuses toutes les 30 minutes.'
))

story.append(spacer(8))
story.append(heading('C.7 Infrastructure - CI et Docker', level=2))
story.append(body(
    '<b>.github/workflows/ci.yml :</b> Les 7 variables d\'environnement Keycloak (KEYCLOAK_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID, '
    'KEYCLOAK_CLIENT_SECRET, KEYCLOAK_ISSUER, KEYCLOAK_JWKS_URL, KEYCLOAK_AUDIENCE) ont ete supprimees du job backend. Le pipeline CI '
    'ne depend plus d\'aucun service d\'identite externe.'
))
story.append(body(
    '<b>docker-compose.yml :</b> Des healthchecks ont ete ajoutes pour Redis (redis-cli ping) et MinIO (mc ready local). Le service API '
    'depend maintenant de Redis en plus de PostgreSQL, assurant que tous les services requis sont operationnels avant le demarrage de l\'API. '
    'Le repertoire infra/backups a ete cree avec un fichier .gitkeep pour garantir le bon fonctionnement du service de sauvegarde DB.'
))
story.append(body(
    '<b>tests/e2e/global-setup.ts :</b> Le bloc d\'attente de Keycloak (polling localhost:8080/realms/schoolflow/.well-known/openid-configuration) '
    'a ete supprime du setup E2E. Les tests ne dependent plus de Keycloak.'
))
story.append(body(
    '<b>tests/seed.sql :</b> Les references a la colonne keycloak_id dans les requetes INSERT ont ete supprimees.'
))
story.append(body(
    '<b>scripts/schoolflow-backup.timer :</b> La directive OnCalendar dupliquee (daily + 02:00) a ete corrigee pour ne conserver '
    'que OnCalendar=daily avec Persistent=true.'
))
story.append(body(
    '<b>tmp_check_db.py :</b> Ce script de debug avec des identifiants de base de donnees hardcodes a ete supprime du depot.'
))

# ═══════════════════════ SECTION D: VERIFICATIONS ═══════════════════════
story.append(spacer(18))
story.append(heading('D. Verification et tests'))
story.append(spacer(8))

story.append(heading('D.1 Procedures de test', level=2))

test_plan = [
    ['T1', 'Demarrage Docker Compose', 'docker compose --env-file .env.docker up -d', 'Tous les services sont healthy (docker compose ps)'],
    ['T2', 'Migrations Alembic', 'docker compose exec api alembic upgrade head', 'La commande se termine sans erreur'],
    ['T3', 'Creation admin', 'docker compose exec api python -m app.scripts.create_admin', 'Message "[CREATED] SUPER_ADMIN user" affiche'],
    ['T4', 'Login API', 'curl -X POST localhost:8000/api/v1/auth/login/ -d "username=admin@schoolflow.local&password=Admin@123456"', 'Retourne access_token'],
    ['T5', 'Profil utilisateur', 'curl -H "Authorization: Bearer TOKEN" localhost:8000/api/v1/users/me/', 'Retourne profil avec roles et tenant'],
    ['T6', 'Page login frontend', 'Ouvrir http://localhost:3000/auth', 'Formulaire email/mot de passe avec branding'],
    ['T7', 'Login frontend complet', 'Se connecter avec les identifiants admin', 'Redirection vers le dashboard'],
    ['T8', 'Route departement', 'Se connecter avec DEPARTMENT_HEAD', 'Acces a /department sans 404'],
    ['T9', 'Keycloak cleanup', 'grep -ri "keycloak" backend/app/ src/', 'Zero reference (sauf migrations historiques)'],
    ['T10', 'Refresh token', 'Attendre 30 min + faire une requete', 'Requete reussie sans reconnexion manuelle'],
]
story.append(make_table(
    ['ID', 'Test', 'Commande / Action', 'Resultat attendu'],
    test_plan,
    col_widths=[1.2*cm, 3.5*cm, 6.5*cm, 5.3*cm],
))
story.append(spacer(6))
story.append(Paragraph('<b>Tableau 6.</b> Plan de test et verification', caption_style))

story.append(spacer(12))
story.append(heading('D.2 Commandes de lancement local', level=2))
story.append(body('Voici la sequence complete et fiable pour lancer le projet en local :'))
story.append(spacer(4))

cmds = [
    ('1. Cloner et configurer', 'git clone https://github.com/skaba89/gestion-scolaire-pro.git\ncd gestion-scolaire-pro\ncp .env.docker.example .env.docker\n# Editer .env.docker avec SECRET_KEY et mots de passe'),
    ('2. Lancer Docker', 'docker compose --env-file .env.docker up -d'),
    ('3. Migrer la BDD', 'docker compose exec api alembic upgrade head'),
    ('4. Creer l\'admin', 'docker compose exec api python -m app.scripts.create_admin'),
    ('5. Acceder', 'Frontend : http://localhost:3000\nLogin : http://localhost:3000/auth\nAPI Docs : http://localhost:8000/docs'),
    ('6. Se connecter', 'Email : admin@schoolflow.local\nMot de passe : Admin@123456'),
]
for title, cmd in cmds:
    story.append(Paragraph(f'<b>{title}</b>', ParagraphStyle(
        name=f'cmd_{title}', fontName='SimHei', fontSize=10, leading=16,
        spaceBefore=8, spaceAfter=2, textColor=ACCENT_BLUE,
    )))
    story.append(Paragraph(cmd.replace('\n', '<br/>'), code_style))

# ═══════════════════════ SECTION E: AMELIORATIONS ═══════════════════════
story.append(spacer(18))
story.append(heading('E. Ameliorations supplementaires'))
story.append(spacer(8))

story.append(heading('E.1 Produit et UX', level=2))
story.append(body(
    'Pour rendre le projet commercialisable et credible lors d\'une demonstration client, plusieurs ameliorations produit sont recommandees. '
    'Premierement, la page de login devrait inclure un lien "Mot de passe oublie" et potentiellement un formulaire de reinitialisation, '
    'meme si l\'envoi d\'email n\'est pas encore configure. Deuxiemement, le dashboard admin devrait afficher des KPIs reels et non des '
    'donnees statiques (nombre d\'eleves, enseignants, revenus, taux de recouvrement). Troisiemement, un assistant d\'onboarding interactif '
    'guiderait les nouveaux administrateurs de tenant a travers la configuration initiale (creation de niveaux, matieres, annee scolaire).'
))
story.append(body(
    'Quatriemement, le systeme de notifications devrait etre active avec des alertes temps reel via WebSocket pour les evenements critiques '
    '(nouvelle inscription, retard de paiement, absence non justifiee). Cinquiemement, un mode demonstration pre-configure avec des donnees '
    'realistes permettrait de montrer le produit sans avoir a le configurer entierement lors d\'un rendez-vous commercial.'
))

story.append(spacer(8))
story.append(heading('E.2 Securite', level=2))
story.append(body(
    'Plusieurs ameliorations de securite sont recommandees pour atteindre un niveau production-ready. L\'enforcement de la verification MFA '
    'au login devrait etre active dans le endpoint d\'authentification : si l\'utilisateur a MFA active, le login devrait retourner un token '
    'temporaire avec un flag mfa_required=true plutot que le token d\'acces complet. Le mecanisme de refresh token devrait utiliser des tokens '
    'dedies stockes en base de donnees (et non simplement rejouer l\'access token existant), permettant la revocation individuelle. '
    'Le rate limiting devrait etre renforce avec des limites differenciees par endpoint et par adresse IP.'
))
story.append(body(
    'Les mots de passe devraient etre valides contre la politique de securite du tenant (longueur minimale, complexite) configuree dans '
    'TenantSecuritySettings. Les logs d\'audit devraient couvrir toutes les operations sensibles (connexion, deconnexion, changement de role, '
    'export de donnees). Un mecanisme de rotation automatique des SECRET_KEY devrait etre implemente avec une periode de grace pour les tokens '
    'signes avec l\'ancienne cle.'
))

story.append(spacer(8))
story.append(heading('E.3 Multi-tenant', level=2))
story.append(body(
    'Le modele multi-tenant peut etre ameliore sur plusieurs points. L\'isolation des donnees par Row Level Security (RLS) PostgreSQL, '
    'deja configuree dans les migrations, devrait etre systematiquement applique sur toutes les nouvelles tables. Le middleware TenantMiddleware '
    'devrait automatiquement injecter le tenant_id dans toutes les requetes SQL pour eviter les fuites de donnees accidentelles. Un systeme '
    'de quotas par tenant (nombre maximum d\'eleves, d\'utilisateurs, d\'espace de stockage) devrait etre enforce via le QuotaMiddleware existant '
    'mais actuellement non active.'
))
story.append(body(
    'La gestion des domaines personnalises par tenant devrait permettre a chaque etablissement d\'utiliser son propre nom de domaine '
    '(ex: ecole.example.com) avec une resolution automatique via le champ custom_domain dans les settings. Un systeme de backup et restore '
    'par tenant permettrait aux etablissements de migrer ou exporter leurs donnees independamment.'
))

story.append(spacer(8))
story.append(heading('E.4 Dashboard et onboarding', level=2))
story.append(body(
    'Le dashboard administrateur devrait etre repense pour offrir une vue synthetique et actionnable. Les widgets recommandes incluent : '
    'evolution des effectifs par niveau et par annee, taux de recouvrement des frais scolaires avec alertes sur les impayes, '
    'statistiques d\'absenteisme avec comparaison inter-classes, performance academique moyenne par matiere et par niveau, '
    'et une timeline des evenements recents (inscriptions, paiements, communications). Chaque widget devrait etre cliquable pour '
    'acceder au detail correspondant.'
))
story.append(body(
    'L\'onboarding des nouveaux tenants devrait etre un flux guide en 4 etapes : (1) informations de l\'etablissement (nom, slug, type, '
    'coordonnees), (2) configuration academique (niveaux, matieres, annee scolaire, calendrier), (3) creation du compte administrateur '
    '(avec verification de l\'email), (4) personnalisation (logo, couleurs, domaine). Chaque etape devrait sauvegarder automatiquement '
    'les progres pour permettre une reprise en cas d\'interruption.'
))

story.append(spacer(8))
story.append(heading('E.5 Industrialisation et demonstration', level=2))
story.append(body(
    'Pour preparer le projet a une demonstration commerciale reussie, plusieurs actions sont recommandees. Un script de demonstration automatise '
    '(seed_demo_tenants.py) devrait creer un environnement complet avec des donnees realistes : 2-3 tenants, des classes, des enseignants, '
    'des eleves avec notes et presences, et des paiements. Un environnement de demo publique (demo.schoolflow.pro) avec un reset quotidien '
    'permettrait aux prospects d\'explorer le produit de maniere autonome.'
))
story.append(body(
    'Les performances du frontend devraient etre optimisees avec du code splitting par route (deja en place via lazy loading), '
    'la prefetching des donnees critiques, et la mise en cache aggressive via TanStack Query. Un systeme de monitoring avec Sentry pour '
    'les erreurs frontend et Prometheus pour les metriques backend devrait etre configure en production. La documentation technique devrait '
    'inclure un guide d\'architecture, une reference API complete, et un guide de contribution pour les developpeurs externes.'
))

# ── Build ──
doc.build(story)
print(f"PDF generated: {PDF_PATH}")
