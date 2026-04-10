import React from "react";
import {
    BarChart3, GraduationCap, Users, Building, BookOpen, Calendar,
    ClipboardList, FileText, CreditCard, UserCheck, FileSearch,
    MessageSquare, Library, Video, Award, Briefcase, Settings
} from "lucide-react";
import { ModuleDoc } from "./types";

export const getAdminDocs = (
    studentLabel: string,
    studentsLabel: string,
    StudentLabel: string,
    StudentsLabel: string
): ModuleDoc[] => [
        {
            id: "dashboard",
            title: "Tableau de bord",
            icon: <BarChart3 className="h-5 w-5" />,
            category: "admin",
            description: "Vue d'ensemble des indicateurs clés de l'établissement avec statistiques en temps réel.",
            prerequisites: [
                "Compte administrateur actif",
                `Données de base configurées (${studentsLabel}, classes, enseignants)`
            ],
            features: [
                `Statistiques des effectifs (${studentsLabel}, enseignants, classes)`,
                "Graphiques de présence et d'assiduité",
                "Aperçu des finances et paiements",
                "Alertes et notifications importantes"
            ],
            stepByStep: [
                {
                    title: "Consulter les statistiques",
                    steps: [
                        "Connectez-vous avec vos identifiants administrateur",
                        "Le tableau de bord s'affiche automatiquement à la connexion",
                        `Les cartes en haut affichent : nombre d'${studentsLabel}, enseignants, classes actives`,
                        "Survolez les chiffres pour voir les détails",
                        "Cliquez sur une carte pour accéder au module correspondant"
                    ]
                }
            ],
            howToUse: [
                "Accédez au tableau de bord depuis le menu principal",
                "Consultez les cartes de statistiques pour un aperçu rapide",
                "Cliquez sur les graphiques pour plus de détails"
            ],
            tips: [
                "Consultez le tableau de bord quotidiennement",
                "Les alertes en rouge nécessitent une attention immédiate"
            ]
        },
        {
            id: "students",
            title: `Gestion des ${studentsLabel}`,
            icon: <GraduationCap className="h-5 w-5" />,
            category: "admin",
            description: `Gestion complète des dossiers ${studentsLabel}, inscriptions et affectations.`,
            prerequisites: [
                "Niveaux et classes créés",
                `Format de numéro d'${studentLabel} configuré`
            ],
            features: [
                `Création et modification des fiches ${studentsLabel}`,
                `Attribution automatique des numéros d'${studentLabel}`,
                "Import/export en masse",
                "Affectation aux classes"
            ],
            howToUse: [
                "Menu " + StudentsLabel + " > Liste",
                "Ajoutez ou importez des " + studentsLabel,
                "Affectez-les aux classes correspondantes"
            ],
            tips: [
                "Utilisez l'import CSV pour le gain de temps",
                "Les matricules sont générés automatiquement"
            ]
        },
        {
            id: "teachers",
            title: "Gestion des enseignants",
            icon: <Users className="h-5 w-5" />,
            category: "admin",
            description: "Administration du personnel enseignant, affectations et suivi.",
            features: [
                "Fiches enseignants complètes",
                "Affectation matières/classes",
                "Suivi des heures",
                "Gestion des remplacements"
            ],
            howToUse: [
                "Menu Enseignants",
                "Créez les comptes enseignants",
                "Gérez leurs affectations"
            ],
            tips: [
                "Un email est requis pour l'accès au portail",
                "Les affectations déterminent les droits d'accès"
            ]
        },
        {
            id: "classrooms",
            title: "Classes et niveaux",
            icon: <Building className="h-5 w-5" />,
            category: "admin",
            description: "Configuration de la structure académique.",
            features: [
                "Création de niveaux",
                "Gestion des classes",
                "Capacités et campus"
            ],
            howToUse: [
                "Créez d'abord les niveaux",
                "Ajoutez ensuite les classes associées"
            ],
            tips: [
                "La capacité aide à limiter les inscriptions"
            ]
        },
        {
            id: "subjects",
            title: "Matières",
            icon: <BookOpen className="h-5 w-5" />,
            category: "admin",
            description: "Configuration du catalogue de matières.",
            features: [
                "Coefficients de notation",
                "Couleurs emploi du temps",
                "Association aux niveaux"
            ],
            howToUse: [
                "Ajoutez vos matières",
                "Définissez les coefficients par défaut"
            ],
            tips: [
                "Les codes courts facilitent l'affichage"
            ]
        },
        {
            id: "schedule",
            title: "Emplois du temps",
            icon: <Calendar className="h-5 w-5" />,
            category: "admin",
            description: "Planification des cours par classe.",
            features: [
                "Vue hebdomadaire",
                "Génération automatique",
                "Vérification des conflits"
            ],
            howToUse: [
                "Sélectionnez une classe",
                "Ajoutez les cours sur la grille"
            ],
            tips: [
                "Le système détecte les chevauchements pour les enseignants"
            ]
        },
        {
            id: "grades",
            title: "Notes et évaluations",
            icon: <ClipboardList className="h-5 w-5" />,
            category: "admin",
            description: "Supervision des résultats scolaires.",
            features: [
                "Import de notes",
                "Calcul de moyennes",
                "Tableaux d'honneur"
            ],
            howToUse: [
                "Gérez les évaluations centralisées",
                "Suivez la saisie des enseignants"
            ],
            tips: [
                "Verrouillez les trimestres après validation"
            ]
        },
        {
            id: "reportcards",
            title: "Bulletins scolaires",
            icon: <FileText className="h-5 w-5" />,
            category: "admin",
            description: "Production des documents de fin de période.",
            features: [
                "Génération PDF en masse",
                "Modèles personnalisables",
                "Envoi par email"
            ],
            howToUse: [
                "Vérifiez les notes",
                "Lancez la génération par classe"
            ],
            tips: [
                "Configurez la signature du directeur"
            ]
        },
        {
            id: "finances",
            title: "Finances et facturation",
            icon: <CreditCard className="h-5 w-5" />,
            category: "admin",
            description: "Gestion comptable de la scolarité.",
            features: [
                "Facturation automatique",
                "Paiements Stripe",
                "Relances impayés"
            ],
            howToUse: [
                "Émettez les factures mensuelles ou annuelles",
                "Suivez les encaissements"
            ],
            tips: [
                "Utilisez les relances automatiques"
            ]
        },
        {
            id: "attendance",
            title: "Présences et absences",
            icon: <UserCheck className="h-5 w-5" />,
            category: "admin",
            description: "Contrôle de l'assiduité globale.",
            features: [
                "Alertes absences",
                "Scan QR badges",
                "Justificatifs"
            ],
            howToUse: [
                "Consultez les appels du jour",
                "Gérez les justificatifs reçus"
            ],
            tips: [
                "Le scan QR est idéal pour les entrées/sorties"
            ]
        },
        {
            id: "admissions",
            title: "Admissions",
            icon: <FileSearch className="h-5 w-5" />,
            category: "admin",
            description: `Gestion du recrutement des ${studentsLabel}.`,
            features: [
                "Portail candidature public",
                "Examen des dossiers",
                "Conversion en inscription"
            ],
            howToUse: [
                "Suivez les dépôts de dossiers",
                "Validez les inscriptions acceptées"
            ],
            tips: [
                "Les documents requis sont configurables"
            ]
        },
        {
            id: "messages",
            title: "Messagerie",
            icon: <MessageSquare className="h-5 w-5" />,
            category: "admin",
            description: "Hub de communication de l'établissement.",
            features: [
                "Envois groupés",
                "Historique sécurisé",
                "Filtres par rôle"
            ],
            howToUse: [
                "Communiquez avec les parents et personnel",
                "Suivez les échanges importants"
            ],
            tips: [
                "Les messages push sont prioritaires"
            ]
        },
        {
            id: "calendar",
            title: "Calendrier scolaire",
            icon: <Calendar className="h-5 w-5" />,
            category: "admin",
            description: "Agenda officiel de l'école.",
            features: [
                "Vacances et jours fériés",
                "Événements internes",
                "Séquences académiques"
            ],
            howToUse: [
                "Définissez les dates clés de l'année",
                "Publiez les événements"
            ],
            tips: [
                "Les périodes de vacances bloquent les appels"
            ]
        },
        {
            id: "library",
            title: "Bibliothèque",
            icon: <Library className="h-5 w-5" />,
            category: "admin",
            description: "Gestion du fonds documentaire.",
            features: [
                "Catalogue en ligne",
                "Prêts et retours",
                "Suivi des retards"
            ],
            howToUse: [
                "Référencez vos ouvrages",
                "Enregistrez les sorties"
            ],
            tips: [
                "Les alertes automatiques pour les retours"
            ]
        },
        {
            id: "elearning",
            title: "E-Learning",
            icon: <Video className="h-5 w-5" />,
            category: "admin",
            description: "Espace cours numériques.",
            features: [
                "Hébergement vidéos/PDF",
                "Quiz interactifs",
                `Progression ${studentsLabel}`
            ],
            howToUse: [
                "Importez les supports de cours",
                "Suivez l'assiduité numérique"
            ],
            tips: [
                "Idéal pour l'enseignement hybride"
            ]
        },
        {
            id: "gamification",
            title: "Gamification",
            icon: <Award className="h-5 w-5" />,
            category: "admin",
            description: "Système de récompense et motivation.",
            features: [
                "Gestion des badges",
                `Classements ${studentsLabel}`,
                "Défis académiques"
            ],
            howToUse: [
                "Configurez les paliers de points",
                "Accordez des distinctions"
            ],
            tips: [
                "Favorise l'engagement positif"
            ]
        },
        {
            id: "careers",
            title: "Carrières et stages",
            icon: <Briefcase className="h-5 w-5" />,
            category: "admin",
            description: "Orientation et insertion.",
            features: [
                "Bourse aux stages",
                "Mentorat alumni",
                "Réseau entreprises"
            ],
            howToUse: [
                "Diffusez les opportunités",
                `Mettez en relation ${studentsLabel} et mentors`
            ],
            tips: [
                "Excellent pour le prestige de l'école"
            ]
        },
        {
            id: "settings",
            title: "Paramètres",
            icon: <Settings className="h-5 w-5" />,
            category: "admin",
            description: "Configuration système centrale.",
            features: [
                "Logo et couleurs",
                "Règles métier",
                "Sauvegardes"
            ],
            howToUse: [
                "Ajustez le comportement de l'app",
                "Personnalisez l'interface"
            ],
            tips: [
                "Verrouillez les paramètres critiques"
            ]
        }
    ];
