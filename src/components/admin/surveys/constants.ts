import { Users } from "lucide-react";

export const audienceConfig = {
    all: { label: "Tous", icon: Users },
    students: { label: "Étudiants", icon: Users },
    teachers: { label: "Enseignants", icon: Users },
    parents: { label: "Parents", icon: Users },
    staff: { label: "Personnel", icon: Users },
};

export const getSurveyStatus = (survey: any) => {
    const now = new Date();
    if (!survey.is_active) return { label: "Inactif", color: "bg-gray-500" };
    if (survey.ends_at && new Date(survey.ends_at) < now) return { label: "Terminé", color: "bg-blue-500" };
    if (survey.starts_at && new Date(survey.starts_at) > now) return { label: "Planifié", color: "bg-yellow-500" };
    return { label: "En cours", color: "bg-green-500" };
};
