import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import fr from './locales/fr.json';
import en from './locales/en.json';
import es from './locales/es.json';
import ar from './locales/ar.json';

const readableFallbacks: Record<string, string> = {
    // ── Portal / shell ───────────────────────────────────────────────────────
    'portal.adminSpace': 'Espace Admin',
    'portal.teacherSpace': 'Espace Enseignant',
    'portal.studentSpace': 'Espace Étudiant',
    'portal.parentSpace': 'Espace Parent',

    // ── Navigation principale ───────────────────────────────────────────────
    'nav.overview': 'Vue d’ensemble',
    'nav.dashboard': 'Tableau de bord',
    'nav.analytics': 'Analyses',
    'nav.aiInsights': 'Insights IA',
    'nav.strategicAnalysis': 'Analyse stratégique',
    'nav.ministryReporting': 'Reporting ministériel',
    'nav.establishments': 'Établissements',
    'nav.guides': 'Guides',
    'nav.testingGuide': 'Guide de test',
    'nav.universityGuide': 'Guide universitaire',
    'nav.academicManagement': 'Gestion académique',
    'nav.admissions': 'Admissions',
    'nav.students': 'Étudiants',
    'nav.enrollments': 'Inscriptions',
    'nav.teachers': 'Enseignants',
    'nav.grades': 'Notes',
    'nav.reportCards': 'Bulletins',
    'nav.certificates': 'Certificats',
    'nav.structure': 'Structure',
    'nav.academicYears': 'Années académiques',
    'nav.terms': 'Périodes',
    'nav.levels': 'Niveaux',
    'nav.classrooms': 'Classes',
    'nav.subjects': 'Matières',
    'nav.campuses': 'Campus',
    'nav.departments': 'Départements',
    'nav.planning': 'Planification',
    'nav.schedule': 'Emploi du temps',
    'nav.calendar': 'Calendrier',
    'nav.bookings': 'Réservations',
    'nav.events': 'Événements',
    'nav.attendance': 'Présences',
    'nav.badges': 'Badges',
    'nav.liveAttendance': 'Présence en direct',
    'nav.teacherHours': 'Heures enseignants',
    'nav.financesSection': 'Finances',
    'nav.finances': 'Finances',
    'nav.accountingExports': 'Exports comptables',
    'nav.learning': 'Apprentissage',
    'nav.elearning': 'E-learning',
    'nav.library': 'Bibliothèque',
    'nav.gamification': 'Gamification',
    'nav.studentLife': 'Vie étudiante',
    'nav.clubs': 'Clubs',
    'nav.careers': 'Carrières & Stages',
    'nav.alumniMentors': 'Mentors alumni',
    'nav.alumniRequests': 'Demandes alumni',
    'nav.communication': 'Communication',
    'nav.messages': 'Messages',
    'nav.announcements': 'Annonces',
    'nav.administration': 'Administration',
    'nav.users': 'Utilisateurs',
    'nav.hr': 'Ressources humaines',
    'nav.security': 'Sécurité',
    'nav.exports': 'Exports',
    'nav.auditLogs': 'Journaux d’audit',
    'nav.settings': 'Paramètres',

    // ── Dashboard admin ─────────────────────────────────────────────────────
    'dashboard.hello': 'Bonjour,',
    'dashboard.welcomeTenant': 'Bienvenue dans le tableau de bord de',
    'dashboard.welcomeNoTenant': 'Bienvenue {{name}}',
    'dashboard.noTenantDesc': 'Créez ou sélectionnez un établissement pour commencer.',
    'dashboard.createTenantTitle': 'Créer un établissement',
    'dashboard.createTenantDesc': 'Configurez votre premier établissement pour démarrer.',
    'dashboard.createTenantBtn': 'Créer un établissement',
    'dashboard.statStudents': '{{label}} inscrits',
    'dashboard.statPendingAdmissions': 'Demandes d’admission en attente',
    'dashboard.statPendingInvoices': 'Factures en attente',
    'dashboard.statAcademicYear': 'Année académique',
    'dashboard.quickActions': 'Actions rapides',
    'dashboard.quickAdmissions': 'Admissions',
    'dashboard.quickGrades': 'Notes',
    'dashboard.quickFinances': 'Finances',
    'dashboard.setupAcademicYearTitle': 'Année académique à configurer',
    'dashboard.setupAcademicYearDesc': 'Définissez l’année académique courante pour activer les statistiques et les rapports.',
    'dashboard.setupAcademicYearBtn': 'Configurer l’année académique',
    'dashboard.studentsByLevel': 'Effectifs par niveau',
    'dashboard.attendanceDistribution': 'Répartition des présences',
    'dashboard.recentActivities': 'Activités récentes',
    'dashboard.noData': 'Aucune donnée disponible',
    'dashboard.noRecentActivity': 'Aucune activité récente',
    'dashboard.noNewEnrollment': 'Aucune nouvelle inscription',
    'dashboard.noPendingInvoice': 'Aucune facture en attente',
    'dashboard.viewAllActivities': 'Voir toutes les activités',

    // ── Widgets dashboard ───────────────────────────────────────────────────
    'security.title': 'Sécurité système',
    'security.noCriticalThreat': 'Aucune menace critique détectée récemment.',
    'studentsAtRisk.title': 'Réussite académique',
    'studentsAtRisk.noData': 'Aucune donnée suffisante pour le moment.',

    // ── Ministry reporting ──────────────────────────────────────────────────
    'ministryDashboard.title': 'Reporting ministériel',
    'ministryDashboard.subtitle': 'Tableau de bord et conformité ministérielle',
    'ministryDashboard.refresh': 'Actualiser',
    'ministryDashboard.refreshSuccess': 'Données ministérielles actualisées',
    'ministryDashboard.refreshError': 'Échec de l’actualisation',
    'ministryDashboard.exporting': 'Export en cours...',
    'ministryDashboard.exportCsv': 'Exporter (CSV)',
    'ministryDashboard.exportSuccess': 'Export CSV réussi',
    'ministryDashboard.exportError': 'Erreur lors de l’export',
    'ministryDashboard.printMen': 'Imprimer',
    'ministryDashboard.tabDashboard': 'Tableau de bord',
    'ministryDashboard.tabCompliance': 'Conformité & Indicateurs',
    'ministryDashboard.loadingKpis': 'Chargement des indicateurs...',
    'ministryDashboard.loadingMen': 'Chargement des informations ministérielles...',
    'ministryDashboard.totalStudents': 'Effectif total',
    'ministryDashboard.activeEnrollments': 'Inscriptions actives',
    'ministryDashboard.attendanceRate': 'Taux de présence',
    'ministryDashboard.academicAverage': 'Moyenne académique',
    'ministryDashboard.overallAverage': 'Moyenne globale',
    'ministryDashboard.collectionRate': 'Taux de recouvrement',
    'ministryDashboard.levelStats': 'Effectifs par niveau',
    'ministryDashboard.levelStatsDesc': 'Répartition des {{students}} par niveau',
    'ministryDashboard.colLevel': 'Niveau',
    'ministryDashboard.colTotal': 'Total',
    'ministryDashboard.colBoys': 'Masculin',
    'ministryDashboard.colGirls': 'Féminin',
    'ministryDashboard.colGirlsPct': '% Féminin',
    'ministryDashboard.colAvg': 'Moyenne /20',
    'ministryDashboard.genderTitle': 'Répartition par genre',
    'ministryDashboard.genderDesc': 'Étudiants',
    'ministryDashboard.boys': 'Masculin',
    'ministryDashboard.girls': 'Féminin',
    'ministryDashboard.financialFlows': 'Performances financières',
    'ministryDashboard.financialFlowsDesc': 'Recettes collectées',
    'ministryDashboard.revenueCollected': 'Recettes collectées',
    'ministryDashboard.totalExpected': 'Recettes totales attendues',
    'ministryDashboard.remaining': 'Solde restant',
    'ministryDashboard.complianceScore': 'Score de conformité ministérielle',
    'ministryDashboard.complianceFilledOf': '{{filled}} sur {{total}} informations renseignées',
    'ministryDashboard.complianceMissingFields': '{{count}} champ(s) manquant(s)',
    'ministryDashboard.compliant': 'Conforme',
    'ministryDashboard.incomplete': 'Incomplet',
    'ministryDashboard.officialId': 'Identification officielle',
    'ministryDashboard.fieldAgreement': 'Numéro d’agrément',
    'ministryDashboard.fieldLegalStatus': 'Statut juridique',
    'ministryDashboard.fieldCycle': 'Cycle d’enseignement',
    'ministryDashboard.fieldOpeningDate': 'Date d’ouverture',
    'ministryDashboard.selectPlaceholder': 'Sélectionner...',
    'ministryDashboard.adminLocation': 'Localisation administrative',
    'ministryDashboard.fieldRegion': 'Région académique',
    'ministryDashboard.fieldPrefecture': 'Préfecture',
    'ministryDashboard.fieldCommune': 'Commune / Sous-préfecture',
    'ministryDashboard.fieldInspection': 'Inspection de district',
    'ministryDashboard.infrastructure': 'Infrastructure',
    'ministryDashboard.fieldCapacity': 'Capacité d’accueil',
    'ministryDashboard.fieldRooms': 'Nombre de salles',
    'ministryDashboard.whyTitle': 'Pourquoi ces informations ?',
    'ministryDashboard.whyDesc': 'Ces données servent au reporting officiel et au suivi institutionnel.',
    'ministryDashboard.whyReason1': 'Déclaration statistique annuelle',
    'ministryDashboard.whyReason2': 'Suivi des effectifs',
    'ministryDashboard.whyReason3': 'Renouvellement d’agrément',
    'ministryDashboard.whyReason4': 'Rapports aux partenaires éducatifs',
    'ministryDashboard.whyRequired': 'Les champs marqués',
    'ministryDashboard.whyRequiredSuffix': 'sont obligatoires.',
    'ministryDashboard.saving': 'Enregistrement...',
    'ministryDashboard.saveMen': 'Enregistrer les informations',
    'ministryDashboard.saveSuccess': 'Informations enregistrées',
    'ministryDashboard.saveError': 'Erreur lors de l’enregistrement',
    'ministryDashboard.generateSheet': 'Générer la fiche officielle',
    'ministryDashboard.onboarding.kpiTitle': 'Indicateurs clés',
    'ministryDashboard.onboarding.kpiContent': 'Suivez ici les indicateurs principaux de l’établissement.',
    'ministryDashboard.onboarding.complianceTitle': 'Conformité ministérielle',
    'ministryDashboard.onboarding.complianceContent': 'Renseignez les informations demandées par l’administration éducative.',
};

const humanizeMissingKey = (key: string): string => {
    const lastSegment = key.split('.').pop() || key;
    const label = lastSegment
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[-_]/g, ' ')
        .trim();

    if (!label) return key;
    return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
};

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            fr: { translation: fr },
            en: { translation: en },
            es: { translation: es },
            ar: { translation: ar },
        },
        supportedLngs: ['fr', 'en', 'es', 'ar'],
        nonExplicitSupportedLngs: true,
        // Normalize 'fr-FR' → 'fr', 'en-US' → 'en', etc.
        load: 'languageOnly',
        cleanCode: true,
        fallbackLng: 'fr',
        lng: 'fr',
        debug: false,
        returnNull: false,
        returnEmptyString: false,
        // Synchronous init — resources are bundled, no async loading needed
        initImmediate: false,
        interpolation: {
            escapeValue: false,
        },
        react: {
            // CRITICAL: Disable Suspense to prevent race conditions where
            // components render before i18n is fully initialized, causing
            // raw translation keys to display instead of translated text.
            useSuspense: false,
        },
        detection: {
            order: ['localStorage', 'navigator'],
            caches: ['localStorage'],
            lookupLocalStorage: 'i18nextLng',
        },
        parseMissingKeyHandler: (key) => readableFallbacks[key] || humanizeMissingKey(key),
    });

export default i18n;
