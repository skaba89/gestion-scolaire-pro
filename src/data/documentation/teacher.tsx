import React from "react";
import { BarChart3, ClipboardList, UserCheck, BookOpen } from "lucide-react";
import { ModuleDoc } from "./types";

export const getTeacherDocs = (studentLabel: string, studentsLabel: string): ModuleDoc[] => [
    {
        id: "teacher-dashboard",
        title: "Tableau de bord enseignant",
        icon: <BarChart3 className="h-5 w-5" />,
        category: "teacher",
        description: "Vue d'ensemble des classes, cours et tâches de l'enseignant.",
        features: ["Classes affectées", "Cours du jour", "Devoirs à corriger"],
        howToUse: ["Connectez-vous", "Consultez vos indicateurs du jour"],
        tips: ["Mise à jour automatique en temps réel"]
    },
    {
        id: "teacher-grades",
        title: "Saisie des notes",
        icon: <ClipboardList className="h-5 w-5" />,
        category: "teacher",
        description: "Saisie et gestion des notes pour les classes affectées.",
        features: ["Création d'évaluations", "Saisie rapide", `Appréciations par ${studentLabel}`],
        howToUse: ["Menu Notes", "Sélectionnez classe/matière", "Saisissez les notes"],
        tips: ["Les moyennes se calculent automatiquement"]
    },
    {
        id: "teacher-attendance",
        title: `Appel des ${studentsLabel}`,
        icon: <UserCheck className="h-5 w-5" />,
        category: "teacher",
        description: "Gestion des présences lors des cours.",
        features: ["Appel par cours", "Retards", "Justificatifs"],
        howToUse: ["Menu Présences", "Sélectionnez le cours", "Marquez les états"],
        tips: ["Notification parent immédiate en cas d'absence"]
    },
    {
        id: "teacher-homework",
        title: "Devoirs et travaux",
        icon: <BookOpen className="h-5 w-5" />,
        category: "teacher",
        description: "Création et suivi des devoirs.",
        features: ["Dépôt de fichiers", "Date limite", "Notation en ligne"],
        howToUse: ["Menu Devoirs", "Créez une tâche", `Corrigez les rendus des ${studentsLabel}`],
        tips: ["Les fichiers joints aident à la compréhension"]
    }
];
