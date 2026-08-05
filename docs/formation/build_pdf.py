# -*- coding: utf-8 -*-
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    ListFlowable, ListItem, KeepTogether, Image
)
from reportlab.pdfgen import canvas as pdfcanvas
import os

SHOTS_DIR = os.path.join(os.path.dirname(__file__), "screenshots")
IMG_W, IMG_H = 900, 560  # native px of every generated illustration

BLUE = colors.HexColor("#1F4E79")
LIGHTBLUE = colors.HexColor("#DDEBF7")
GRAY = colors.HexColor("#F2F2F2")
GOLD = colors.HexColor("#B7950B")
GOLDBG = colors.HexColor("#FDEBD0")
DARKGRAY = colors.HexColor("#595959")

OUT = os.path.join(os.path.dirname(__file__), "GUIDE_FORMATION_COMPLET.pdf")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="CoverTitle", fontSize=28, leading=34, alignment=TA_CENTER, textColor=BLUE, fontName="Helvetica-Bold"))
styles.add(ParagraphStyle(name="CoverSubtitle", fontSize=18, leading=22, alignment=TA_CENTER, fontName="Helvetica-Bold"))
styles.add(ParagraphStyle(name="CoverItalic", fontSize=12, leading=16, alignment=TA_CENTER, fontName="Helvetica-Oblique"))
styles.add(ParagraphStyle(name="CoverMeta", fontSize=11, leading=15, alignment=TA_CENTER))
styles.add(ParagraphStyle(name="H1", fontSize=18, leading=22, spaceBefore=18, spaceAfter=8, textColor=BLUE, fontName="Helvetica-Bold"))
styles.add(ParagraphStyle(name="H2", fontSize=14, leading=18, spaceBefore=12, spaceAfter=6, textColor=BLUE, fontName="Helvetica-Bold"))
styles.add(ParagraphStyle(name="Body", fontSize=10.5, leading=15, spaceAfter=6, fontName="Helvetica"))
styles.add(ParagraphStyle(name="BodyItalicGray", fontSize=10, leading=14, spaceAfter=6, fontName="Helvetica-Oblique", textColor=DARKGRAY))
styles.add(ParagraphStyle(name="BulletBody", fontSize=10.5, leading=14, fontName="Helvetica"))
styles.add(ParagraphStyle(name="TableHeader", fontSize=10, leading=13, fontName="Helvetica-Bold", textColor=colors.white))
styles.add(ParagraphStyle(name="TableCell", fontSize=9.5, leading=13, fontName="Helvetica"))
styles.add(ParagraphStyle(name="Checklist", fontSize=10.5, leading=15, spaceAfter=4, fontName="Helvetica"))

story = []

def h1(text):
    story.append(Paragraph(text, styles["H1"]))

def h2(text):
    story.append(Paragraph(text, styles["H2"]))

def body(text):
    story.append(Paragraph(text, styles["Body"]))

def menu_note(text):
    story.append(Paragraph(text, styles["BodyItalicGray"]))

def bullets(items):
    story.append(ListFlowable(
        [ListItem(Paragraph(t, styles["BulletBody"]), spaceAfter=4) for t in items],
        bulletType="bullet", start="•", leftIndent=16,
    ))
    story.append(Spacer(1, 6))

def numbered(items):
    story.append(ListFlowable(
        [ListItem(Paragraph(t, styles["BulletBody"]), spaceAfter=4) for t in items],
        bulletType="1", leftIndent=16,
    ))
    story.append(Spacer(1, 6))

def screenshot_img(filename, caption):
    display_w = 14 * cm
    display_h = display_w * (IMG_H / IMG_W)
    img = Image(os.path.join(SHOTS_DIR, filename), width=display_w, height=display_h)
    img.hAlign = "CENTER"
    story.append(img)
    story.append(Spacer(1, 3))
    cap = Paragraph(caption, ParagraphStyle(name="Caption", parent=styles["BodyItalicGray"], alignment=TA_CENTER))
    story.append(cap)
    story.append(Spacer(1, 10))

def screenshot(desc):
    t = Table([[Paragraph(f"📸 &nbsp;[CAPTURE : {desc}]", styles["BodyItalicGray"])]], colWidths=[16.5 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), GRAY),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#BFBFBF")),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(t)
    story.append(Spacer(1, 10))

def callout(text, university=True):
    bg = GOLDBG if university else LIGHTBLUE
    bar = GOLD if university else BLUE
    prefix = "<b>🎓 Spécifique Université — </b>" if university else ""
    t = Table([[Paragraph(prefix + text, styles["Body"])]], colWidths=[16.5 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("LINEBEFORE", (0, 0), (0, -1), 3, bar),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(t)
    story.append(Spacer(1, 10))

def data_table(header, rows, col_widths):
    data = [[Paragraph(h, styles["TableHeader"]) for h in header]]
    for r in rows:
        data.append([Paragraph(c, styles["TableCell"]) for c in r])
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BLUE),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CCCCCC")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GRAY]),
    ]))
    story.append(t)
    story.append(Spacer(1, 10))

def checklist(items):
    for t in items:
        story.append(Paragraph("&#9744;&nbsp;&nbsp;" + t, styles["Checklist"]))
    story.append(Spacer(1, 8))

# ================= COVER =================
story.append(Spacer(1, 6 * cm))
story.append(Paragraph("Academy Guinéenne", styles["CoverTitle"]))
story.append(Spacer(1, 0.4 * cm))
story.append(Paragraph("Guide de formation complet", styles["CoverSubtitle"]))
story.append(Spacer(1, 0.6 * cm))
story.append(Paragraph("Étape par étape — ordre et hiérarchie des composants — tous types d'établissement", styles["CoverItalic"]))
story.append(Spacer(1, 2.5 * cm))
story.append(Paragraph("Public : administrateur d'établissement (Directeur / Admin) et formateur interne / support client", styles["CoverMeta"]))
story.append(Spacer(1, 0.3 * cm))
story.append(Paragraph("Portée : École primaire · Collège · Lycée · Université / Grandes écoles · Centre de formation", styles["CoverMeta"]))
story.append(PageBreak())

# ================= SOMMAIRE =================
h1("Sommaire")
toc_items = [
    "1. Les 5 types d'établissement et leur terminologie",
    "2. Créer son compte et son établissement (inscription)",
    "3. Onboarding guidé (4 étapes obligatoires)",
    "4. Le tableau de bord",
    "5. Structure académique — l'ordre hiérarchique à respecter",
    "6. Gestion académique quotidienne",
    "7. Planification",
    "8. Présences",
    "9. Finances",
    "10. Apprentissage",
    "11. Vie étudiante",
    "12. Communication",
    "13. Administration",
    "14. Checklist de mise en route par type d'établissement",
    "Annexes",
]
numbered(toc_items)
callout(
    "les images de ce guide sont des schémas illustratifs (mockups dessinés fidèles à la "
    "disposition des écrans décrits), pas de vraies captures d'écran — l'outil de capture "
    "n'était pas disponible au moment de la rédaction. Chaque image porte un bandeau "
    "« ILLUSTRATION SCHÉMATIQUE ». Voir l'Annexe C pour les remplacer par de vraies captures.",
    university=False,
)
story.append(PageBreak())

# ================= 1 =================
h1("1. Les 5 types d'établissement et leur terminologie")
body("À la création du compte, vous choisissez un type d'établissement. Ce choix ne se limite pas à une étiquette : il change automatiquement le vocabulaire utilisé partout dans l'application, pour que l'interface parle le langage de votre métier.")
data_table(
    ["Type choisi à l'inscription", "Vocabulaire utilisé dans toute la plateforme"],
    [
        ["École primaire", "Élève · Classe · Matière · Trimestre · Niveau · Coefficient"],
        ["Collège", "Élève · Classe · Matière · Trimestre · Niveau · Coefficient"],
        ["Lycée", "Élève · Classe · Matière · Trimestre · Niveau · Coefficient"],
        ["Centre de formation", "Élève · Classe · Matière · Trimestre · Niveau · Coefficient"],
        ["Université / Grandes écoles", "Étudiant · Groupe / Amphi · Unité d'Enseignement (UE) · Semestre · Niveau/Année · Crédits (ECTS)"],
    ],
    [6 * cm, 10.5 * cm],
)
body("En résumé, il n'existe que deux familles de vocabulaire : « scolaire » (École primaire, Collège, Lycée, Centre de formation) et « enseignement supérieur » (Université / Grandes écoles). Ce guide utilise systématiquement la notation <b>Terme scolaire / Terme université</b> partout où le mot change, par exemple <b>Classe / Groupe</b>.")
callout("un encart de ce type signale, tout au long du document, les étapes qui diffèrent réellement entre les deux familles d'établissement.")

# ================= 2 =================
h1("2. Créer son compte et son établissement (inscription)")
body("URL publique : <b>/inscription</b>")
screenshot_img("01-inscription.png", "Étape 1 du formulaire : nom de l'établissement, type (menu déroulant des 5 types), et pays.")
body("L'inscription se fait en 3 étapes, affichées en haut de la page (Votre établissement → Votre compte → Confirmation). Il est impossible de sauter une étape.")

h2("Étape 1 — Votre établissement")
bullets([
    "<b>Nom de l'établissement</b> — texte libre, ex. « Lycée Excellence de Conakry ». Il sert de nom d'affichage partout (en-tête, bulletins, reçus).",
    "<b>Type d'établissement</b> — menu déroulant : École primaire, Collège, Lycée, Université / Grandes écoles, Centre de formation. Ce choix est structurant et ne devrait pas être changé après coup sans accompagnement du support.",
    "<b>Pays</b> — pré-rempli 🇬🇳 Guinée.",
    "Cliquer <b>Continuer</b>.",
])

h2("Étape 2 — Votre compte")
body("Renseigner l'identité du premier administrateur (vous) : prénom, nom, email, mot de passe. Ce compte devient <b>Administrateur de l'établissement (TENANT_ADMIN)</b> — le rôle avec tous les droits sur cet établissement.")

h2("Étape 3 — Confirmation")
body("Récapitulatif, puis validation. À la validation :")
bullets([
    "L'établissement est créé avec un <b>essai Pro gratuit de 30 jours</b>, sans carte bancaire.",
    "Un <b>slug</b> unique est généré à partir du nom (ex. lycee-excellence-conakry) — identifiant dans l'URL de votre espace : /{slug}/admin.",
    "Vous êtes connecté automatiquement et redirigé vers l'onboarding. Toute correction ultérieure se fait dans Administration → Paramètres.",
])
story.append(PageBreak())

# ================= 3 =================
h1("3. Onboarding guidé (4 étapes obligatoires)")
body("L'onboarding s'affiche automatiquement après l'inscription, à l'adresse /{slug}/admin/onboarding, et <b>tant qu'il n'est pas terminé, il réapparaît à chaque connexion</b> de l'administrateur — c'est volontaire, pour garantir qu'aucun établissement ne reste à moitié configuré.")
body("Le fil d'Ariane en haut de la page affiche les 4 étapes : <b>Identité → Niveaux → Matières → Signature</b>.")

h2("Étape 1 — Identité")
screenshot_img("02-onboarding-identite.png", "Le fil d'Ariane (1/4) confirme l'étape Identité : nom de l'école et devise.")
bullets([
    "Nom de l'école — repris de l'inscription, modifiable.",
    "Devise principale — pré-remplie Franc Guinéen (GNF FG), modifiable selon le pays réel de l'établissement.",
])

h2("Étape 2 — Niveaux")
screenshot_img("03-onboarding-niveaux.png", "Ici, seul « Lycée » est coché — crée automatiquement 2nde/1ère/Terminale dans Structure → Niveaux.")
body("Question posée : « Quels cycles d'enseignement proposez-vous ? » avec des cases à cocher :")
bullets(["Maternelle (PS, MS, GS)", "Primaire (CP, CE1, CE2, CM1, CM2)", "Collège (6ème, 5ème, 4ème, 3ème)", "Lycée (2nde, 1ère, Terminale)", "Université (Licence, Master, Doctorat)"])
body("<b>Important</b> : ces cases ne sont pas filtrées automatiquement par le type d'établissement choisi à l'inscription — un lycée peut par exemple cocher aussi « Collège » s'il héberge les deux cycles. Cocher tous les cycles réellement enseignés. C'est cette sélection qui crée automatiquement les niveaux de base dans Structure → Niveaux.")
callout("pour un établissement supérieur, cocher uniquement « Université » ; les niveaux Licence/Master/Doctorat seront ensuite affinés en Années/Niveaux dans la Structure académique.")

h2("Étape 3 — Matières")
screenshot_img("04-onboarding-matieres.png", "Cocher les matières principales — le reste s'ajoute ensuite dans Structure → Matières.")
body("Sélection des matières principales parmi une liste commune (Mathématiques, Français, Anglais, Histoire-Géo, SVT, Physique-Chimie, EPS, Arts Plastiques). Cette sélection pré-remplit Structure → Matières.")

h2("Étape 4 — Signature")
screenshot_img("05-onboarding-signature.png", "Dernière étape avant le tableau de bord : nom du directeur et signature manuscrite.")
bullets([
    "Nom du Directeur / Responsable — texte libre.",
    "Signature manuscrite — à tracer à la souris (ou au doigt). Bouton Effacer pour recommencer.",
    "Cliquer <b>Terminer</b>.",
])
body("À la validation : la signature est stockée de façon sécurisée, l'onboarding est marqué terminé (il ne réapparaîtra plus), et vous êtes redirigé vers le tableau de bord.")
story.append(PageBreak())

# ================= 4 =================
h1("4. Le tableau de bord")
screenshot_img("06-dashboard.png", "Le menu latéral (à gauche) est la carte de navigation de tout ce guide.")
body("C'est la page d'accueil de l'espace admin (/{slug}/admin). Elle affiche :")
bullets([
    "Un message de bienvenue personnalisé.",
    "Des cartes chiffrées : élèves/étudiants inscrits, candidatures en attente, factures en attente, année scolaire courante, taux de présence, moyenne générale.",
    "Des graphiques : effectifs par niveau, répartition des présences, moyennes par classe.",
    "Un bloc « Réussite Académique » (analyse IA) et « Sécurité Système ».",
    "Des actions rapides : Admissions, Élèves, Notes, Finances.",
    "Tant qu'aucune année scolaire n'est définie comme courante, un bandeau « Configurez votre année scolaire » invite à commencer par la Structure académique.",
])
body("Le menu latéral gauche est organisé en sections, dans cet ordre exact — celui que ce guide suit du chapitre 5 au chapitre 13 :")
body("<b>Vue d'ensemble · Guides · Gestion Académique · Structure (Années → Trimestres → Niveaux → Classes → Matières → Campus → Départements) · Planification · Présences · Finances · Apprentissage · Vie Étudiante · Communication · Administration.</b>")
callout("Dans le menu, la section « Structure » regroupe la configuration de base, tandis que « Gestion Académique » (juste au-dessus) regroupe les usages quotidiens. Il faut impérativement terminer toute la section Structure avant d'utiliser Gestion Académique.", university=False)
story.append(PageBreak())

# ================= 5 =================
h1("5. Structure académique — l'ordre hiérarchique à respecter")
body("<b>C'est la partie la plus importante de ce guide.</b> Chaque élément dépend du précédent ; les configurer dans le désordre provoque des listes vides ou des erreurs (ex. impossible de créer une classe sans niveau, impossible de créer un niveau sans année académique active).")
numbered([
    "<b>Année académique</b> — fondation, tout en dépend",
    "<b>Trimestres / Semestres</b> — découpent l'année",
    "<b>Niveaux</b> (scolaire) / <b>Niveaux-Année</b> (université)",
    "<b>Classes</b> (scolaire) / <b>Groupes-Amphis</b> (université)",
    "<b>Matières</b> (scolaire) / <b>Unités d'Enseignement — UE</b> (université)",
    "<b>Campus</b> — sites physiques, optionnel (multi-sites)",
    "<b>Départements</b> — unités organisationnelles, surtout université",
])

h2("5.1 Années académiques")
menu_note("Menu : Structure → Années académiques")
body("C'est la fondation absolue de toute la plateforme : présences, notes, factures, emplois du temps — tout est rattaché à une année académique. Sans année académique active/courante, la plupart des autres écrans restent vides ou bloqués.")
bullets([
    "Créer une nouvelle année (ex. « 2026-2027 »), avec dates de début et de fin.",
    "La marquer comme <b>année courante</b> — c'est elle qui apparaît par défaut partout dans l'application.",
    "Une seule année peut être courante à la fois.",
])
screenshot_img("07-structure-annees.png", "« 2026-2027 » est marquée Courante — utilisée par défaut partout dans l'application.")
callout("la logique est identique ; une « année académique » université correspond en général à une année universitaire, ensuite subdivisée en semestres plutôt qu'en trimestres.")

h2("5.2 Trimestres / Semestres")
menu_note("Menu : Structure → Trimestres (libellé affiché : Trimestres en scolaire, Semestres en université)")
body("Découpe l'année académique active en périodes d'évaluation. <b>Prérequis : une année académique doit exister.</b>")
bullets(["Établissement scolaire : généralement 3 trimestres.", "Université : généralement 2 semestres."])
body("Chaque période a une date de début et de fin, utilisées ensuite pour le calcul des moyennes et la génération des bulletins.")
screenshot_img("08-structure-trimestres.png", "3 trimestres couvrant toute l'année, sans trou ni chevauchement de dates.")

h2("5.3 Niveaux")
menu_note("Menu : Structure → Niveaux (libellé affiché : Niveau en scolaire, Niveau / Année en université)")
body("Les niveaux cochés à l'étape 2 de l'onboarding apparaissent ici pré-créés. C'est ici qu'on les affine :")
bullets(["Établissement scolaire : ex. CP, CE1, 6ème, 5ème, 2nde, 1ère, Terminale.", "Université : ex. Licence 1, Licence 2, Licence 3, Master 1, Master 2."])
body("<b>Prérequis : une année académique active.</b> Chaque niveau créé ici devient ensuite disponible pour créer des classes/groupes.")
screenshot_img("09-structure-niveaux.png", "Ces niveaux proviennent du cycle coché à l'onboarding.")

h2("5.4 Classes / Groupes")
menu_note("Menu : Structure → Classes (libellé affiché : Classe en scolaire, Groupe / Amphi en université)")
body("<b>Prérequis : au moins un niveau créé.</b> Une classe/groupe est toujours rattachée à un niveau précis.")
bullets(["Établissement scolaire : ex. « 6ème A », « Terminale D ».", "Université : ex. « Licence 3 Info — Groupe A », « Amphi Droit L1 »."])
body("C'est dans cette classe/groupe que les élèves/étudiants seront ensuite inscrits.")
screenshot_img("10-structure-classes.png", "Chaque classe est rattachée à un niveau existant (colonne Niveau).")
story.append(PageBreak())

h2("5.5 Matières / Unités d'Enseignement (UE)")
menu_note("Menu : Structure → Matières (libellé affiché : Matières en scolaire, Modules / UE en université)")
body("Les matières cochées à l'étape 3 de l'onboarding sont pré-créées ; on peut en ajouter d'autres ici. Chaque matière/UE peut se voir attribuer :")
bullets(["Un coefficient (établissement scolaire).", "Des crédits ECTS (université).", "Un ou plusieurs enseignants référents."])
screenshot_img("11-structure-matieres.png", "Le coefficient pondère la moyenne générale de l'élève.")

h2("5.6 Campus")
menu_note("Menu : Structure → Campus")
body("Optionnel, à utiliser uniquement si l'établissement possède plusieurs sites physiques. Chaque campus déclaré peut ensuite être associé à des classes/groupes et à des salles, pour distinguer l'emploi du temps et les ressources par site. Si l'établissement n'a qu'un seul site, cette section peut être laissée vide.")
screenshot_img("12-structure-campus.png", "Exemple à deux sites : le nombre de classes rattachées permet de vérifier la répartition.")

h2("5.7 Départements")
menu_note("Menu : Structure → Départements")
body("Unités organisationnelles internes, transversales aux niveaux/classes.")
callout("c'est ici que la notion prend tout son sens : Département d'Informatique, Département de Droit, Département de Médecine, etc. Chaque enseignant et chaque UE peut être rattaché à un département.")
body("Pour un établissement scolaire, cette section reste utilisable mais est le plus souvent laissée de côté, ou utilisée pour regrouper les enseignants par discipline.")
screenshot_img("13-structure-departements.png", "Chaque département a un responsable désigné et des enseignants rattachés.")
callout("✅ Une fois les 7 points de cette section configurés dans l'ordre, la Structure académique est complète. Toutes les fonctionnalités du menu Gestion Académique deviennent alors pleinement utilisables.", university=False)
story.append(PageBreak())

# ================= 6-13 =================
h1("6. Gestion académique quotidienne")
menu_note("Menu : section Gestion Académique. Prérequis : Structure académique complète (chapitre 5).")
numbered([
    "<b>Admissions</b> — enregistrer et traiter les candidatures entrantes (avant l'inscription définitive).",
    "<b>Élèves / Étudiants</b> — fiche de chaque apprenant : identité, contacts, parent(s)/tuteur(s), documents.",
    "<b>Listes de Classe / Listes d'Inscriptions</b> — vue consolidée des effectifs par classe/groupe.",
    "<b>Inscriptions</b> — rattacher formellement un élève/étudiant à une classe/groupe pour l'année académique courante.",
    "<b>Enseignants</b> — fiches enseignants, rattachement aux matières/UE et aux classes/groupes qu'ils encadrent.",
    "<b>Notes</b> — saisie des notes par matière/UE et par période.",
    "<b>Bulletins</b> — génération automatique à partir des notes saisies, au format PDF.",
    "<b>Certificats</b> — génération de certificats de scolarité et autres attestations.",
    "<b>Scan Présence</b> — présence rapide par scan de badge/QR code.",
])
screenshot_img("14-gestion-eleves.png", "Le filtre par classe permet de retrouver rapidement un effectif précis.")

h1("7. Planification")
menu_note("Menu : section Planification.")
bullets([
    "<b>Emploi du temps</b> — créneaux hebdomadaires par classe/groupe, matière/UE et enseignant. Prérequis : Structure complète + enseignants rattachés.",
    "<b>Calendrier</b> — événements et jours fériés/non travaillés.",
    "<b>Réservations</b> — réservation de salles/ressources (amphis, laboratoires, terrains de sport).",
    "<b>Événements</b> — événements ponctuels (réunions parents-professeurs, sorties, cérémonies).",
])
screenshot_img("15-planification-edt.png", "Grille hebdomadaire : jours en colonnes, créneaux horaires en lignes.")

h1("8. Présences")
menu_note("Menu : section Présences.")
bullets([
    "<b>Badges</b> — génération/gestion des badges (QR code) élèves/étudiants et enseignants.",
    "<b>Présence en direct</b> — tableau de bord temps réel des présences du jour.",
    "<b>Heures Enseignants</b> — suivi des heures effectuées par les enseignants.",
])
screenshot_img("16-presences-direct.png", "Les compteurs Présents / Absents / Retards se mettent à jour en temps réel.")
story.append(PageBreak())

h1("9. Finances")
menu_note("Menu : section Finances.")
bullets([
    "<b>Finances</b> (frais, factures, paiements) — définir les frais (inscription, mensualité, cantine...) en GNF. Émettre des factures, encaisser, imprimer les reçus PDF.",
    "<b>Inventaire</b> — suivi du matériel/stock.",
    "<b>Réception Commandes</b> — réception des commandes fournisseurs.",
    "<b>Exports Comptables</b> — export des données financières.",
])
screenshot_img("17-finances-facture.png", "Les suggestions de frais évitent de ressaisir le libellé et le montant à chaque facture.")

h1("10. Apprentissage")
menu_note("Menu : section Apprentissage (certains modules marqués Bêta).")
bullets([
    "<b>E-learning</b> (Bêta) — cours en ligne, ressources pédagogiques numériques.",
    "<b>Bibliothèque</b> — gestion des ouvrages et des emprunts.",
    "<b>Marketplace Éducatif</b> (Bêta) — place de marché de ressources pédagogiques.",
    "<b>Gamification</b> (Bêta) — badges de réussite et mécaniques de motivation.",
])
callout("Les modules marqués Bêta sont fonctionnels mais en amélioration continue — à présenter avec cette précision lors d'une formation client.", university=False)

h1("11. Vie étudiante")
menu_note("Menu : section Vie Étudiante (modules majoritairement Bêta).")
bullets([
    "<b>Clubs</b> (Bêta) — clubs et activités extrascolaires/parascolaires.",
    "<b>Carrières & Stages</b> (Bêta) — offres de stages et insertion professionnelle.",
    "<b>Mentors Alumni</b> (Bêta) — mise en relation anciens ↔ apprenants actuels.",
    "<b>Requêtes Alumni</b> (Bêta) — demandes émanant des anciens.",
])
callout("cette section est en pratique surtout pertinente pour l'enseignement supérieur (réseau alumni, stages professionnels), mais reste accessible à tous les types d'établissement.")

h1("12. Communication")
menu_note("Menu : section Communication.")
bullets([
    "<b>Messages</b> — messagerie interne entre administration, enseignants, élèves/étudiants et parents.",
    "<b>Annonces</b> — diffusion d'annonces générales ou ciblées.",
])
screenshot_img("18-communication-annonces.png", "Le champ Public ciblé restreint l'annonce à une classe précise.")
story.append(PageBreak())

h1("13. Administration")
menu_note("Menu : section Administration — réservée aux profils avec droits étendus.")
numbered([
    "<b>Utilisateurs</b> — gestion des comptes et des rôles (Directeur, Chef de Département, Enseignant, Élève/Étudiant, Parent, Personnel, Comptable, Secrétaire...).",
    "<b>Ressources Humaines</b> — dossiers du personnel, contrats, congés, fiches de paie.",
    "<b>Sécurité</b> — politique de mot de passe, sessions actives, MFA.",
    "<b>Exports</b> — export de données au format standard.",
    "<b>Import de données</b> — import en masse (ex. CSV d'élèves).",
    "<b>Journal d'audit</b> — historique des actions sensibles.",
    "<b>Qualité des Données</b> — détection d'incohérences.",
    "<b>Pages publiques</b> — personnalisation des pages publiques.",
    "<b>Paramètres</b> — logo, couleurs, langue par défaut, position du menu, etc.",
])
screenshot_img("19-administration-parametres.png", "La couleur principale choisie ici se répercute automatiquement sur toute l'interface.")
story.append(PageBreak())

# ================= 14 =================
h1("14. Checklist de mise en route par type d'établissement")
h2("École primaire / Collège / Lycée / Centre de formation")
checklist([
    "Inscription avec le bon type d'établissement",
    "Onboarding complet : identité, cycles cochés, matières, signature",
    "Année académique créée et marquée courante",
    "3 trimestres créés",
    "Niveaux vérifiés/complétés",
    "Classes créées pour chaque niveau",
    "Matières + coefficients définis",
    "Campus déclaré si plusieurs sites",
    "Élèves inscrits dans leurs classes",
    "Enseignants créés et rattachés aux matières/classes",
    "Emploi du temps construit",
    "Frais scolaires configurés en GNF",
])
h2("Université / Grandes écoles")
checklist([
    "Inscription avec le type « Université / Grandes écoles »",
    "Onboarding complet : cycle « Université » coché",
    "Année académique créée et marquée courante",
    "2 semestres créés",
    "Niveaux/Années créés (L1, L2, L3, M1, M2...)",
    "Groupes/Amphis créés par niveau",
    "UE/Modules + crédits ECTS définis",
    "Campus déclaré si plusieurs facultés/sites",
    "Départements créés (Informatique, Droit, Médecine...)",
    "Étudiants inscrits dans leurs groupes",
    "Enseignants rattachés aux UE et départements",
    "Emploi du temps construit",
    "Frais universitaires configurés",
])
story.append(PageBreak())

# ================= ANNEXES =================
h1("Annexes")
h2("Annexe A — Glossaire terminologie scolaire ↔ université")
data_table(
    ["Concept", "Terme scolaire", "Terme université"],
    [
        ["Période d'évaluation", "Trimestre", "Semestre"],
        ["Unité de contenu", "Matière", "Unité d'Enseignement (UE) / Module"],
        ["Palier de progression", "Niveau", "Niveau / Année"],
        ["Groupe d'apprenants", "Classe", "Groupe / Amphi"],
        ["Apprenant", "Élève", "Étudiant"],
        ["Pondération", "Coefficient", "Crédits (ECTS)"],
    ],
    [5.5 * cm, 5.5 * cm, 5.5 * cm],
)

h2("Annexe B — Pour aller plus loin")
bullets([
    "docs/DEMO_SCRIPT.md — trame de démonstration commerciale de 20 minutes.",
    "docs/user-guides/ — fiches courtes existantes (années académiques, classes/salles, emploi du temps, comptes élèves).",
])

h2("Annexe C — Remplacer les illustrations par de vraies captures d'écran")
body("Les 19 images de ce guide sont des schémas illustratifs (docs/formation/screenshots/), générés par build_illustrations_pil.py. Pour les remplacer par de vraies captures :")
numbered([
    "Se connecter à un établissement de démonstration (un scolaire, un université).",
    "Naviguer jusqu'à l'écran correspondant (le titre au-dessus de chaque image indique l'écran exact).",
    "Faire une capture d'écran pleine page (desktop, 1280×800 recommandé).",
    "Remplacer le fichier docs/formation/screenshots/NN-nom.png correspondant par la vraie capture, en conservant le même nom, puis régénérer ce PDF.",
])

# ================= HEADER/FOOTER =================
def add_page_number(c: pdfcanvas.Canvas, doc):
    c.saveState()
    c.setFont("Helvetica", 8)
    c.setFillColor(DARKGRAY)
    c.drawString(2 * cm, 1.2 * cm, "Academy Guinéenne — Guide de formation complet")
    c.drawRightString(A4[0] - 2 * cm, 1.2 * cm, f"Page {doc.page}")
    c.restoreState()

doc = SimpleDocTemplate(
    OUT, pagesize=A4,
    leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2 * cm, bottomMargin=2 * cm,
    title="Academy Guinéenne — Guide de formation complet",
)
doc.build(story, onFirstPage=lambda c, d: None, onLaterPages=add_page_number)
print("Written:", OUT)
