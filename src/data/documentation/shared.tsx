import React from "react";
import { GraduationCap, FileText, Building, Users } from "lucide-react";
import { ModuleDoc } from "./types";

export const getAlumniDocs = (studentLabel: string): ModuleDoc[] => [
    {
        id: "alumni-dashboard",
        title: `Espace ancien ${studentLabel}`,
        icon: <GraduationCap className="h-5 w-5" />,
        category: "alumni",
        description: "Portail dédié aux diplômés.",
        features: ["Réseau alumni", "Demandes administratives"],
        howToUse: ["Accédez à votre compte", "Restez en contact avec l'école"],
        tips: ["Mettez à jour vos informations de carrière"]
    },
    {
        id: "alumni-documents",
        title: "Demandes de documents",
        icon: <FileText className="h-5 w-5" />,
        category: "alumni",
        description: "Obtention de documents certifiés.",
        features: ["Relevés de notes", "Attestations de réussite"],
        howToUse: ["Menu Documents", "Faites votre demande en ligne"],
        tips: ["Précisez bien l'usage du document"]
    }
];

export const getDepartmentDocs = (studentsLabel: string = "élèves"): ModuleDoc[] => [
    {
        id: "department-dashboard",
        title: "Tableau de bord département",
        icon: <Building className="h-5 w-5" />,
        category: "department",
        description: "Gestion pédagogique du département.",
        features: ["Stats par matière", "Charge horaire enseignants"],
        howToUse: ["Supervisez les classes du département"],
        tips: ["Vérifiez la cohérence des programmes"]
    }
];
