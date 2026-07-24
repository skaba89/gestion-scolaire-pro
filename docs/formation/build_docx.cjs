const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, AlignmentType, TableOfContents, PageBreak,
  LevelFormat, convertInchesToTwip, ImageRun
} = require("docx");
const fs = require("fs");
const path = require("path");

const SHOTS_DIR = path.join(__dirname, "screenshots");
// All generated illustrations are 900x560 px — fixed aspect ratio 45:28.
const IMG_W = 900, IMG_H = 560;

const BLUE = "1F4E79";
const LIGHTBLUE = "DDEBF7";
const GRAY = "F2F2F2";
const GOLD = "B7950B";
const GOLDBG = "FDEBD0";

function h1(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } });
}
function h2(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } });
}
function h3(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } });
}
function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, ...opts })],
  });
}
function pRuns(runs, opts = {}) {
  return new Paragraph({ spacing: { after: 120 }, ...opts, children: runs });
}
function bold(text) { return new TextRun({ text, bold: true }); }
function italic(text) { return new TextRun({ text, italics: true }); }

function bullet(text, level = 0) {
  return new Paragraph({
    text,
    numbering: { reference: "bullet-list", level },
    spacing: { after: 60 },
  });
}
function checklistItem(text) {
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: "☐  ", bold: true }),
      new TextRun({ text }),
    ],
  });
}

function screenshotImage(filename, caption) {
  const filePath = path.join(SHOTS_DIR, filename);
  const data = fs.readFileSync(filePath);
  const displayWidth = 480; // px in the doc, aspect ratio preserved
  const displayHeight = Math.round((IMG_H / IMG_W) * displayWidth);
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 60 },
      children: [
        new ImageRun({
          data,
          transformation: { width: displayWidth, height: displayHeight },
          type: "png",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: caption, italics: true, size: 19, color: "595959" })],
    }),
  ];
}

function screenshotPlaceholder(desc) {
  return new Paragraph({
    spacing: { before: 100, after: 200 },
    shading: { type: ShadingType.CLEAR, fill: GRAY },
    border: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
    },
    children: [
      new TextRun({ text: `📸  [CAPTURE : ${desc}]`, italics: true, color: "595959" }),
    ],
  });
}

function universityCallout(text) {
  return new Paragraph({
    spacing: { before: 100, after: 200 },
    shading: { type: ShadingType.CLEAR, fill: GOLDBG },
    border: {
      left: { style: BorderStyle.SINGLE, size: 24, color: GOLD },
    },
    indent: { left: 120 },
    children: [
      new TextRun({ text: "🎓 Spécifique Université — ", bold: true, color: GOLD }),
      new TextRun({ text }),
    ],
  });
}

function noteBox(text) {
  return new Paragraph({
    spacing: { before: 100, after: 200 },
    shading: { type: ShadingType.CLEAR, fill: LIGHTBLUE },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: BLUE } },
    indent: { left: 120 },
    children: [new TextRun({ text })],
  });
}

function makeTable(headerRow, rows, widths) {
  const totalWidth = 9000;
  const colWidths = widths || headerRow.map(() => Math.floor(totalWidth / headerRow.length));
  const mkCell = (text, isHeader, w) => new TableCell({
    width: { size: w, type: WidthType.DXA },
    shading: isHeader ? { type: ShadingType.CLEAR, fill: BLUE } : undefined,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [new Paragraph({
      children: [new TextRun({ text, bold: isHeader, color: isHeader ? "FFFFFF" : undefined })],
    })],
  });
  const tRows = [
    new TableRow({ children: headerRow.map((t, i) => mkCell(t, true, colWidths[i])), tableHeader: true }),
    ...rows.map(r => new TableRow({ children: r.map((t, i) => mkCell(t, false, colWidths[i])) })),
  ];
  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: tRows,
  });
}

function spacer() { return new Paragraph({ text: "", spacing: { after: 100 } }); }

const children = [];

// ---------- COVER PAGE ----------
children.push(
  new Paragraph({ text: "", spacing: { before: 2000 } }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "SchoolFlow Pro", bold: true, size: 56, color: BLUE })],
    spacing: { after: 200 },
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Guide de formation complet", bold: true, size: 36 })],
    spacing: { after: 400 },
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Étape par étape — ordre et hiérarchie des composants — tous types d'établissement", italics: true, size: 24 })],
    spacing: { after: 1200 },
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Public : administrateur d'établissement (Directeur / Admin) et formateur interne / support client", size: 22 })],
    spacing: { after: 200 },
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Portée : École primaire · Collège · Lycée · Université / Grandes écoles · Centre de formation", size: 22 })],
  }),
  new Paragraph({ children: [new PageBreak()] }),
);

// ---------- TOC ----------
children.push(
  h1("Sommaire"),
  new TableOfContents("Sommaire", { hyperlink: true, headingStyleRange: "1-3" }),
  new Paragraph({ children: [new PageBreak()] }),
);

// ---------- INTRO NOTE ----------
children.push(
  noteBox("Note sur les illustrations : les images de ce guide sont des schémas illustratifs (mockups dessinés fidèles à la disposition des écrans décrits), pas de vraies captures d'écran — l'outil de capture n'était pas disponible au moment de la rédaction. Chaque image porte un bandeau \"ILLUSTRATION SCHÉMATIQUE\". Voir l'Annexe C pour les remplacer par de vraies captures plus tard."),
);

// ---------- 1. TYPES D'ETABLISSEMENT ----------
children.push(h1("1. Les 5 types d'établissement et leur terminologie"));
children.push(p("À la création du compte, vous choisissez un type d'établissement. Ce choix ne se limite pas à une étiquette : il change automatiquement le vocabulaire utilisé partout dans l'application, pour que l'interface parle le langage de votre métier."));
children.push(makeTable(
  ["Type choisi à l'inscription", "Vocabulaire utilisé dans toute la plateforme"],
  [
    ["École primaire", "Élève · Classe · Matière · Trimestre · Niveau · Coefficient"],
    ["Collège", "Élève · Classe · Matière · Trimestre · Niveau · Coefficient"],
    ["Lycée", "Élève · Classe · Matière · Trimestre · Niveau · Coefficient"],
    ["Centre de formation", "Élève · Classe · Matière · Trimestre · Niveau · Coefficient"],
    ["Université / Grandes écoles", "Étudiant · Groupe / Amphi · Unité d'Enseignement (UE) · Semestre · Niveau/Année · Crédits (ECTS)"],
  ],
  [3200, 5800]
));
children.push(spacer());
children.push(p("En résumé, il n'existe que deux familles de vocabulaire : « scolaire » (École primaire, Collège, Lycée, Centre de formation) et « enseignement supérieur » (Université / Grandes écoles). Ce guide utilise systématiquement la notation Terme scolaire / Terme université partout où le mot change, par exemple Classe / Groupe."));
children.push(universityCallout("un encart de ce type signale, tout au long du document, les étapes qui diffèrent réellement entre les deux familles d'établissement."));

// ---------- 2. INSCRIPTION ----------
children.push(h1("2. Créer son compte et son établissement (inscription)"));
children.push(p("URL publique : /inscription"));
children.push(...screenshotImage("01-inscription.png", "Étape 1 du formulaire : nom de l'établissement, type (menu déroulant des 5 types), et pays."));
children.push(p("L'inscription se fait en 3 étapes, affichées en haut de la page (Votre établissement → Votre compte → Confirmation). Il est impossible de sauter une étape."));

children.push(h2("Étape 1 — Votre établissement"));
children.push(bullet("Nom de l'établissement — texte libre, ex. « Lycée Excellence de Conakry ». Il sert de nom d'affichage partout (en-tête, bulletins, reçus)."));
children.push(bullet("Type d'établissement — menu déroulant : École primaire, Collège, Lycée, Université / Grandes écoles, Centre de formation. Ce choix est structurant et ne devrait pas être changé après coup sans accompagnement du support."));
children.push(bullet("Pays — pré-rempli 🇬🇳 Guinée."));
children.push(bullet("Cliquer Continuer."));

children.push(h2("Étape 2 — Votre compte"));
children.push(p("Renseigner l'identité du premier administrateur (vous) : prénom, nom, email, mot de passe. Ce compte devient Administrateur de l'établissement (TENANT_ADMIN) — le rôle avec tous les droits sur cet établissement."));

children.push(h2("Étape 3 — Confirmation"));
children.push(p("Récapitulatif, puis validation. À la validation :"));
children.push(bullet("L'établissement est créé avec un essai Pro gratuit de 30 jours, sans carte bancaire."));
children.push(bullet("Un slug unique est généré à partir du nom (ex. lycee-excellence-conakry) — identifiant dans l'URL de votre espace : /{slug}/admin."));
children.push(bullet("Vous êtes connecté automatiquement et redirigé vers l'onboarding. Toute correction ultérieure se fait dans Administration → Paramètres."));

// ---------- 3. ONBOARDING ----------
children.push(h1("3. Onboarding guidé (4 étapes obligatoires)"));
children.push(p("L'onboarding s'affiche automatiquement après l'inscription, à l'adresse /{slug}/admin/onboarding, et tant qu'il n'est pas terminé, il réapparaît à chaque connexion de l'administrateur — c'est volontaire, pour garantir qu'aucun établissement ne reste à moitié configuré."));
children.push(p("Le fil d'Ariane en haut de la page affiche les 4 étapes : Identité → Niveaux → Matières → Signature."));

children.push(h2("Étape 1 — Identité"));
children.push(...screenshotImage("02-onboarding-identite.png", "Le fil d'Ariane (1/4) confirme l'étape Identité : nom de l'école et devise."));
children.push(bullet("Nom de l'école — repris de l'inscription, modifiable."));
children.push(bullet("Devise principale — pré-remplie Franc Guinéen (GNF FG), modifiable selon le pays réel de l'établissement."));

children.push(h2("Étape 2 — Niveaux"));
children.push(...screenshotImage("03-onboarding-niveaux.png", "Ici, seul « Lycée » est coché — crée automatiquement 2nde/1ère/Terminale dans Structure → Niveaux."));
children.push(p("Question posée : « Quels cycles d'enseignement proposez-vous ? » avec des cases à cocher :"));
children.push(bullet("Maternelle (PS, MS, GS)"));
children.push(bullet("Primaire (CP, CE1, CE2, CM1, CM2)"));
children.push(bullet("Collège (6ème, 5ème, 4ème, 3ème)"));
children.push(bullet("Lycée (2nde, 1ère, Terminale)"));
children.push(bullet("Université (Licence, Master, Doctorat)"));
children.push(p("Important : ces cases ne sont pas filtrées automatiquement par le type d'établissement choisi à l'inscription — un lycée peut par exemple cocher aussi « Collège » s'il héberge les deux cycles. Cocher tous les cycles réellement enseignés. C'est cette sélection qui crée automatiquement les niveaux de base dans Structure → Niveaux."));
children.push(universityCallout("pour un établissement supérieur, cocher uniquement « Université » ; les niveaux Licence/Master/Doctorat seront ensuite affinés en Années/Niveaux dans la Structure académique."));

children.push(h2("Étape 3 — Matières"));
children.push(...screenshotImage("04-onboarding-matieres.png", "Cocher les matières principales — le reste s'ajoute ensuite dans Structure → Matières."));
children.push(p("Sélection des matières principales parmi une liste commune (Mathématiques, Français, Anglais, Histoire-Géo, SVT, Physique-Chimie, EPS, Arts Plastiques). Cette sélection pré-remplit Structure → Matières — d'autres matières/UE pourront être ajoutées librement ensuite."));

children.push(h2("Étape 4 — Signature"));
children.push(...screenshotImage("05-onboarding-signature.png", "Dernière étape avant le tableau de bord : nom du directeur et signature manuscrite."));
children.push(bullet("Nom du Directeur / Responsable — texte libre."));
children.push(bullet("Signature manuscrite — à tracer à la souris (ou au doigt sur tablette/mobile). Bouton Effacer pour recommencer."));
children.push(bullet("Cliquer Terminer."));
children.push(p("À la validation : la signature est stockée de façon sécurisée, l'onboarding est marqué terminé (il ne réapparaîtra plus), et vous êtes redirigé vers le tableau de bord."));

// ---------- 4. DASHBOARD ----------
children.push(h1("4. Le tableau de bord"));
children.push(...screenshotImage("06-dashboard.png", "Le menu latéral (à gauche) est la carte de navigation de tout ce guide."));
children.push(p("C'est la page d'accueil de l'espace admin (/{slug}/admin). Elle affiche :"));
children.push(bullet("Un message de bienvenue personnalisé."));
children.push(bullet("Des cartes chiffrées : élèves/étudiants inscrits, candidatures en attente, factures en attente, année scolaire courante, taux de présence, moyenne générale."));
children.push(bullet("Des graphiques : effectifs par niveau, répartition des présences, moyennes par classe."));
children.push(bullet("Un bloc « Réussite Académique » (analyse IA) et « Sécurité Système »."));
children.push(bullet("Des actions rapides : Admissions, Élèves, Notes, Finances."));
children.push(bullet("Tant qu'aucune année scolaire n'est définie comme courante, un bandeau « Configurez votre année scolaire » invite à commencer par le point suivant."));
children.push(p("Le menu latéral gauche est organisé en sections, dans cet ordre exact — celui que ce guide suit du chapitre 5 au chapitre 13 :"));
children.push(pRuns([bold("Vue d'ensemble · Guides · Gestion Académique · Structure (Années → Trimestres → Niveaux → Classes → Matières → Campus → Départements) · Planification · Présences · Finances · Apprentissage · Vie Étudiante · Communication · Administration.")]));
children.push(noteBox("Dans le menu, la section « Structure » regroupe la configuration de base, tandis que « Gestion Académique » (juste au-dessus) regroupe les usages quotidiens (élèves, notes...). Il faut impérativement terminer toute la section Structure avant d'utiliser Gestion Académique."));

// ---------- 5. STRUCTURE ACADEMIQUE ----------
children.push(h1("5. Structure académique — l'ordre hiérarchique à respecter"));
children.push(pRuns([bold("C'est la partie la plus importante de ce guide.")], {}));
children.push(p("Chaque élément dépend du précédent ; les configurer dans le désordre provoque des listes vides ou des erreurs (ex. impossible de créer une classe sans niveau, impossible de créer un niveau sans année académique active)."));

const hierarchySteps = [
  "1. Année académique — fondation, tout en dépend",
  "2. Trimestres / Semestres — découpent l'année",
  "3. Niveaux (scolaire) / Niveaux-Année (université)",
  "4. Classes (scolaire) / Groupes-Amphis (université)",
  "5. Matières (scolaire) / Unités d'Enseignement — UE (université)",
  "6. Campus — sites physiques, optionnel (multi-sites)",
  "7. Départements — unités organisationnelles, surtout université",
];
hierarchySteps.forEach(s => children.push(new Paragraph({
  spacing: { after: 60 },
  children: [new TextRun({ text: s, bold: true })],
})));
children.push(spacer());

children.push(h2("5.1 Années académiques"));
children.push(italic_p("Menu : Structure → Années académiques"));
children.push(p("C'est la fondation absolue de toute la plateforme : présences, notes, factures, emplois du temps — tout est rattaché à une année académique. Sans année académique active/courante, la plupart des autres écrans restent vides ou bloqués."));
children.push(pRuns([bold("Étapes :")]));
children.push(bullet("Créer une nouvelle année (ex. « 2026-2027 »), avec dates de début et de fin."));
children.push(bullet("La marquer comme année courante — c'est elle qui apparaît par défaut partout dans l'application."));
children.push(bullet("Une seule année peut être courante à la fois."));
children.push(...screenshotImage("07-structure-annees.png", "« 2026-2027 » est marquée Courante — utilisée par défaut partout dans l'application."));
children.push(universityCallout("la logique est identique ; une « année académique » université correspond en général à une année universitaire, ensuite subdivisée en semestres plutôt qu'en trimestres."));

children.push(h2("5.2 Trimestres / Semestres"));
children.push(italic_p("Menu : Structure → Trimestres (libellé affiché : Trimestres en scolaire, Semestres en université)"));
children.push(p("Découpe l'année académique active en périodes d'évaluation. Prérequis : une année académique doit exister."));
children.push(bullet("Établissement scolaire : généralement 3 trimestres."));
children.push(bullet("Université : généralement 2 semestres."));
children.push(p("Chaque période a une date de début et de fin, utilisées ensuite pour le calcul des moyennes et la génération des bulletins."));
children.push(...screenshotImage("08-structure-trimestres.png", "3 trimestres couvrant toute l'année, sans trou ni chevauchement de dates."));

children.push(h2("5.3 Niveaux"));
children.push(italic_p("Menu : Structure → Niveaux (libellé affiché : Niveau en scolaire, Niveau / Année en université)"));
children.push(p("Les niveaux cochés à l'étape 2 de l'onboarding apparaissent ici pré-créés. C'est ici qu'on les affine :"));
children.push(bullet("Établissement scolaire : ex. CP, CE1, 6ème, 5ème, 2nde, 1ère, Terminale."));
children.push(bullet("Université : ex. Licence 1, Licence 2, Licence 3, Master 1, Master 2."));
children.push(p("Prérequis : une année académique active. Chaque niveau créé ici devient ensuite disponible pour créer des classes/groupes."));
children.push(...screenshotImage("09-structure-niveaux.png", "Ces niveaux proviennent du cycle coché à l'onboarding — effectif affiché une fois les élèves inscrits."));

children.push(h2("5.4 Classes / Groupes"));
children.push(italic_p("Menu : Structure → Classes (libellé affiché : Classe en scolaire, Groupe / Amphi en université)"));
children.push(p("Prérequis : au moins un niveau créé. Une classe/groupe est toujours rattachée à un niveau précis."));
children.push(bullet("Établissement scolaire : ex. « 6ème A », « Terminale D »."));
children.push(bullet("Université : ex. « Licence 3 Info — Groupe A », « Amphi Droit L1 »."));
children.push(p("C'est dans cette classe/groupe que les élèves/étudiants seront ensuite inscrits."));
children.push(...screenshotImage("10-structure-classes.png", "Chaque classe est rattachée à un niveau existant (colonne Niveau)."));

children.push(h2("5.5 Matières / Unités d'Enseignement (UE)"));
children.push(italic_p("Menu : Structure → Matières (libellé affiché : Matières en scolaire, Modules / UE en université)"));
children.push(p("Les matières cochées à l'étape 3 de l'onboarding sont pré-créées ; on peut en ajouter d'autres ici. Chaque matière/UE peut se voir attribuer :"));
children.push(bullet("Un coefficient (établissement scolaire)."));
children.push(bullet("Des crédits ECTS (université)."));
children.push(bullet("Un ou plusieurs enseignants référents."));
children.push(...screenshotImage("11-structure-matieres.png", "Le coefficient pondère la moyenne générale de l'élève."));

children.push(h2("5.6 Campus"));
children.push(italic_p("Menu : Structure → Campus"));
children.push(p("Optionnel, à utiliser uniquement si l'établissement possède plusieurs sites physiques. Chaque campus déclaré peut ensuite être associé à des classes/groupes et à des salles, pour distinguer l'emploi du temps et les ressources par site. Si l'établissement n'a qu'un seul site, cette section peut être laissée vide."));
children.push(...screenshotImage("12-structure-campus.png", "Exemple à deux sites : le nombre de classes rattachées permet de vérifier la répartition."));

children.push(h2("5.7 Départements"));
children.push(italic_p("Menu : Structure → Départements"));
children.push(p("Unités organisationnelles internes, transversales aux niveaux/classes."));
children.push(universityCallout("c'est ici que la notion prend tout son sens : Département d'Informatique, Département de Droit, Département de Médecine, etc. Chaque enseignant et chaque UE peut être rattaché à un département."));
children.push(p("Pour un établissement scolaire, cette section reste utilisable mais est le plus souvent laissée de côté, ou utilisée pour regrouper les enseignants par discipline."));
children.push(...screenshotImage("13-structure-departements.png", "Chaque département a un responsable désigné et des enseignants rattachés."));

children.push(noteBox("✅ Une fois les 7 points de cette section configurés dans l'ordre, la Structure académique est complète. Toutes les fonctionnalités du menu Gestion Académique deviennent alors pleinement utilisables."));

// ---------- 6-13 remaining sections ----------
children.push(h1("6. Gestion académique quotidienne"));
children.push(italic_p("Menu : section Gestion Académique. Prérequis : Structure académique complète (chapitre 5)."));
children.push(p("Ordre logique d'usage recommandé :"));
[
  "Admissions — enregistrer et traiter les candidatures entrantes (avant l'inscription définitive).",
  "Élèves / Étudiants — fiche de chaque apprenant : identité, contacts, parent(s)/tuteur(s), documents.",
  "Listes de Classe / Listes d'Inscriptions — vue consolidée des effectifs par classe/groupe.",
  "Inscriptions — rattacher formellement un élève/étudiant à une classe/groupe pour l'année académique courante.",
  "Enseignants — fiches enseignants, rattachement aux matières/UE et aux classes/groupes qu'ils encadrent.",
  "Notes — saisie des notes par matière/UE et par période (trimestre/semestre).",
  "Bulletins — génération automatique à partir des notes saisies, au format PDF.",
  "Certificats — génération de certificats de scolarité et autres attestations.",
  "Scan Présence — présence rapide par scan de badge/QR code.",
].forEach((t, i) => children.push(new Paragraph({ text: `${i + 1}. ${t}`, spacing: { after: 80 } })));
children.push(...screenshotImage("14-gestion-eleves.png", "Le filtre par classe permet de retrouver rapidement un effectif précis."));

children.push(h1("7. Planification"));
children.push(italic_p("Menu : section Planification."));
children.push(bullet("Emploi du temps — construction des créneaux hebdomadaires par classe/groupe, matière/UE et enseignant. Prérequis : Structure académique complète + enseignants rattachés."));
children.push(bullet("Calendrier — événements et jours fériés/non travaillés, configuré au niveau de l'établissement."));
children.push(bullet("Réservations — réservation de salles/ressources (amphis, laboratoires, terrains de sport)."));
children.push(bullet("Événements — événements ponctuels (réunions parents-professeurs, sorties, cérémonies)."));
children.push(...screenshotImage("15-planification-edt.png", "Grille hebdomadaire : jours en colonnes, créneaux horaires en lignes."));

children.push(h1("8. Présences"));
children.push(italic_p("Menu : section Présences."));
children.push(bullet("Badges — génération/gestion des badges (QR code) élèves/étudiants et enseignants."));
children.push(bullet("Présence en direct — tableau de bord temps réel des présences du jour, par classe/groupe."));
children.push(bullet("Heures Enseignants — suivi des heures effectuées par les enseignants."));
children.push(...screenshotImage("16-presences-direct.png", "Les compteurs Présents / Absents / Retards se mettent à jour en temps réel."));

children.push(h1("9. Finances"));
children.push(italic_p("Menu : section Finances."));
children.push(bullet("Finances (frais, factures, paiements) — définir les types de frais (inscription, mensualité, cantine...), en GNF ou devise locale. Émettre des factures, encaisser les paiements, imprimer les reçus PDF."));
children.push(bullet("Inventaire — suivi du matériel/stock de l'établissement."));
children.push(bullet("Réception Commandes — réception des commandes fournisseurs liées à l'inventaire."));
children.push(bullet("Exports Comptables — export des données financières pour la comptabilité externe."));
children.push(...screenshotImage("17-finances-facture.png", "Les suggestions de frais évitent de ressaisir le libellé et le montant à chaque facture."));

children.push(h1("10. Apprentissage"));
children.push(italic_p("Menu : section Apprentissage (certains modules marqués Bêta)."));
children.push(bullet("E-learning (Bêta) — cours en ligne, ressources pédagogiques numériques."));
children.push(bullet("Bibliothèque — gestion des ouvrages physiques/numériques et des emprunts."));
children.push(bullet("Marketplace Éducatif (Bêta) — place de marché de ressources pédagogiques."));
children.push(bullet("Gamification (Bêta) — badges de réussite et mécaniques de motivation."));
children.push(noteBox("Les modules marqués Bêta sont fonctionnels mais en amélioration continue — à présenter avec cette précision lors d'une formation client."));

children.push(h1("11. Vie étudiante"));
children.push(italic_p("Menu : section Vie Étudiante (modules majoritairement Bêta)."));
children.push(bullet("Clubs (Bêta) — clubs et activités extrascolaires/parascolaires."));
children.push(bullet("Carrières & Stages (Bêta) — offres de stages et suivi de l'insertion professionnelle."));
children.push(bullet("Mentors Alumni (Bêta) — mise en relation anciens élèves/étudiants ↔ apprenants actuels."));
children.push(bullet("Requêtes Alumni (Bêta) — demandes émanant des anciens (attestations, coordonnées...)."));
children.push(universityCallout("cette section est en pratique surtout pertinente pour l'enseignement supérieur (réseau alumni, stages professionnels), mais reste accessible à tous les types d'établissement."));

children.push(h1("12. Communication"));
children.push(italic_p("Menu : section Communication."));
children.push(bullet("Messages — messagerie interne entre administration, enseignants, élèves/étudiants et parents."));
children.push(bullet("Annonces — diffusion d'annonces générales à toute la communauté ou à un public ciblé."));
children.push(...screenshotImage("18-communication-annonces.png", "Le champ Public ciblé restreint l'annonce à une classe précise plutôt qu'à tout l'établissement."));

children.push(h1("13. Administration"));
children.push(italic_p("Menu : section Administration — réservée aux profils avec droits étendus."));
[
  "Utilisateurs — gestion des comptes (créer, désactiver, changer de rôle) : Directeur, Chef de Département, Enseignant, Élève/Étudiant, Parent, Personnel, Comptable, Secrétaire...",
  "Ressources Humaines — dossiers du personnel, contrats, congés, fiches de paie.",
  "Sécurité — paramètres de sécurité du compte établissement (politique de mot de passe, sessions actives, MFA).",
  "Exports — export de données (élèves, notes...) au format standard.",
  "Import de données — import en masse (ex. import CSV d'une liste d'élèves existante).",
  "Journal d'audit — historique des actions sensibles, à des fins de traçabilité.",
  "Qualité des Données — détection d'incohérences (doublons, champs manquants).",
  "Pages publiques — personnalisation des pages publiques de l'établissement.",
  "Paramètres — réglages généraux : logo, couleurs, langue par défaut, position du menu, et tout ce qui n'a pas été figé à l'inscription.",
].forEach((t, i) => children.push(new Paragraph({ text: `${i + 1}. ${t}`, spacing: { after: 80 } })));
children.push(...screenshotImage("19-administration-parametres.png", "La couleur principale choisie ici se répercute automatiquement sur toute l'interface."));

// ---------- 14. CHECKLIST ----------
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h1("14. Checklist de mise en route par type d'établissement"));

children.push(h2("École primaire / Collège / Lycée / Centre de formation"));
[
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
].forEach(t => children.push(checklistItem(t)));

children.push(h2("Université / Grandes écoles"));
[
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
].forEach(t => children.push(checklistItem(t)));

// ---------- ANNEXES ----------
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h1("Annexes"));

children.push(h2("Annexe A — Glossaire terminologie scolaire ↔ université"));
children.push(makeTable(
  ["Concept", "Terme scolaire", "Terme université"],
  [
    ["Période d'évaluation", "Trimestre", "Semestre"],
    ["Unité de contenu", "Matière", "Unité d'Enseignement (UE) / Module"],
    ["Palier de progression", "Niveau", "Niveau / Année"],
    ["Groupe d'apprenants", "Classe", "Groupe / Amphi"],
    ["Apprenant", "Élève", "Étudiant"],
    ["Pondération", "Coefficient", "Crédits (ECTS)"],
  ],
  [3000, 3000, 3000]
));
children.push(spacer());

children.push(h2("Annexe B — Pour aller plus loin"));
children.push(bullet("docs/DEMO_SCRIPT.md — trame de démonstration commerciale de 20 minutes, complément court après ce guide complet."));
children.push(bullet("docs/user-guides/ — fiches courtes existantes (années académiques, classes/salles, emploi du temps, comptes élèves)."));

children.push(h2("Annexe C — Remplacer les illustrations par de vraies captures d'écran"));
children.push(p("Les 19 images de ce guide sont des schémas illustratifs (docs/formation/screenshots/), générés par build_illustrations_pil.py. Pour les remplacer par de vraies captures :"));
[
  "Se connecter à un établissement de démonstration (idéalement un de type scolaire et un de type université, pour illustrer les variantes).",
  "Naviguer jusqu'à l'écran correspondant (le titre au-dessus de chaque image indique l'écran exact).",
  "Faire une capture d'écran pleine page (desktop, 1280×800 recommandé pour la cohérence du document).",
  "Remplacer le fichier docs/formation/screenshots/NN-nom.png correspondant par la vraie capture, en conservant le même nom de fichier, puis régénérer ce document.",
].forEach((t, i) => children.push(new Paragraph({ text: `${i + 1}. ${t}`, spacing: { after: 80 } })));

function italic_p(text) {
  return new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text, italics: true, color: "595959" })] });
}

const doc = new Document({
  numbering: {
    config: [
      {
        reference: "bullet-list",
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 260 } } } },
        ],
      },
    ],
  },
  styles: {
    default: {
      document: { run: { font: "Calibri", size: 22 } },
    },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { bold: true, size: 32, color: BLUE }, paragraph: { outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { bold: true, size: 26, color: BLUE }, paragraph: { outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { bold: true, size: 24, color: "2E75B6" }, paragraph: { outlineLevel: 2 } },
    ],
  },
  sections: [
    {
      properties: {
        page: { size: { width: 11906, height: 16838 } }, // A4
      },
      children,
    },
  ],
});

Packer.toBuffer(doc).then(buf => {
  const out = path.join(__dirname, "GUIDE_FORMATION_COMPLET.docx");
  fs.writeFileSync(out, buf);
  console.log("Written:", out, buf.length, "bytes");
});
