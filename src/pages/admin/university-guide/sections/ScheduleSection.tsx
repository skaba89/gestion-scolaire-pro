import { Calendar, Clock } from "lucide-react";
import { InfoBox, StepList } from "../components/GuideComponents";

export const ScheduleSection = () => {
    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold">Emploi du temps et présence</h2>

            <h3 className="text-xl font-semibold">Création de l'emploi du temps</h3>

            <StepList steps={[
                "Menu: Admin → Emploi du temps",
                "Sélectionnez une classe et la semaine concernée",
                "Cliquez sur un créneau horaire vide",
                "Sélectionnez: Matière, Enseignant, Salle",
                "Activez 'Récurrence hebdomadaire' si nécessaire",
                "Sauvegardez"
            ]} />

            <h3 className="text-xl font-semibold mt-8">Salles de cours</h3>

            <p className="text-muted-foreground">
                Avant de créer l'emploi du temps, configurez vos salles :
            </p>

            <StepList steps={[
                "Menu: Admin → Campus & Salles",
                "Ajoutez les bâtiments et les salles",
                "Définissez la capacité de chaque salle",
                "Spécifiez le type (Amphi, Salle de TD, Laboratoire)"
            ]} />

            <h3 className="text-xl font-semibold mt-8">Gestion des présences</h3>

            <p className="text-muted-foreground">
                La présence est prise par l'enseignant au début de chaque cours :
            </p>

            <StepList steps={[
                "L'enseignant accède à son compte",
                "Sélectionne son cours actuel sur le tableau de bord",
                "Clique sur 'Appel / Présence'",
                "Coche les absences ou retards",
                "Valide l'appel"
            ]} />

            <InfoBox type="info">
                Les parents reçoivent une notification instantanée en cas d'absence
                non justifiée si l'option est activée.
            </InfoBox>

            <h3 className="text-xl font-semibold mt-8">Justification d'absence</h3>

            <StepList steps={[
                "L'étudiant ou le parent dépose un justificatif (PDF/Photo) dans son espace",
                "L'administration reçoit une alerte",
                "Validation ou refus du justificatif par l'Admin",
                "Mise à jour automatique des statistiques de l'étudiant"
            ]} />
        </div>
    );
};
