import React from "react";
import { BarChart3, ClipboardList, Calendar, BookOpen } from "lucide-react";
import { ModuleDoc } from "./types";

export const getStudentDocs = (studentLabel: string): ModuleDoc[] => [
    {
        id: "student-dashboard",
        title: `Tableau de bord ${studentLabel}`,
        icon: <BarChart3 className="h-5 w-5" />,
        category: "student",
        description: "Aperçu de votre réussite.",
        features: ["Notes récentes", "Devoirs urgents", "Badges"],
        howToUse: ["Connectez-vous", "Vérifiez vos tâches du jour"],
        tips: ["Consultez vos points de gamification"]
    },
    {
        id: "student-grades",
        title: "Mes notes",
        icon: <ClipboardList className="h-5 w-5" />,
        category: "student",
        description: "Accès à vos résultats.",
        features: ["Notes par matière", "Classements", "Moyennes"],
        howToUse: ["Menu Notes", "Analysez vos points forts"],
        tips: ["Suivez votre progression trimestrielle"]
    },
    {
        id: "student-schedule",
        title: "Emploi du temps",
        icon: <Calendar className="h-5 w-5" />,
        category: "student",
        description: "Votre calendrier de cours.",
        features: ["Salles de classe", "Horaires", "Enseignants"],
        howToUse: ["Menu Emploi du temps", "Vérifiez vos salles"],
        tips: ["Vérifiez les changements de dernière minute"]
    },
    {
        id: "student-homework",
        title: "Devoirs",
        icon: <BookOpen className="h-5 w-5" />,
        category: "student",
        description: "Gestion des devoirs à faire.",
        features: ["Rendus en ligne", "Dates limites", "Supports de cours"],
        howToUse: ["Menu Devoirs", "Téléchargez les consignes", "Soumettez votre travail"],
        tips: ["Respectez bien les dates limites"]
    }
];
