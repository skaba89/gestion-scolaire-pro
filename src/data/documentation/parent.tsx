import React from "react";
import { BarChart3, ClipboardList, CreditCard, MessageSquare } from "lucide-react";
import { ModuleDoc } from "./types";

export const getParentDocs = (studentLabel: string = "élève"): ModuleDoc[] => [
    {
        id: "parent-dashboard",
        title: "Tableau de bord parent",
        icon: <BarChart3 className="h-5 w-5" />,
        category: "parent",
        description: "Suivi de la scolarité de vos enfants.",
        features: ["Notes récentes", "Absences", "Devoirs"],
        howToUse: ["Connectez-vous", "Changez d'enfant si nécessaire"],
        tips: ["Consultez régulièrement les alertes"]
    },
    {
        id: "parent-grades",
        title: "Notes de mes enfants",
        icon: <ClipboardList className="h-5 w-5" />,
        category: "parent",
        description: "Consultation des résultats scolaires.",
        features: ["Moyennes", "Classement classe", "Évolution graphique"],
        howToUse: ["Menu Notes", "Sélectionnez le trimestre"],
        tips: [`Le graphique montre la tendance de l'${studentLabel}`]
    },
    {
        id: "parent-invoices",
        title: "Factures et paiements",
        icon: <CreditCard className="h-5 w-5" />,
        category: "parent",
        description: "Paiement des frais de scolarité.",
        features: ["Paiement Stripe", "Historique", "Téléchargement reçus"],
        howToUse: ["Menu Factures", "Réglez en ligne par carte"],
        tips: ["Paiement sécurisé et instantané"]
    },
    {
        id: "parent-messages",
        title: "Communication",
        icon: <MessageSquare className="h-5 w-5" />,
        category: "parent",
        description: "Échanges avec l'école.",
        features: ["Messages directs", "Notifications", "Historique"],
        howToUse: ["Menu Messages", "Contactez les enseignants"],
        tips: ["Historique complet des échanges conservé"]
    }
];
