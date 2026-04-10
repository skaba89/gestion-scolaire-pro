import { GraduationCap } from "lucide-react";
import { InfoBox, StepList, ScreenshotCard } from "../components/GuideComponents";
import parentDashboard from "@/assets/docs/parent-dashboard.png";

export const StudentsSection = () => {
    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold">Inscription et gestion des étudiants</h2>

            <h3 className="text-xl font-semibold">Inscription d'un nouvel étudiant</h3>

            <StepList steps={[
                "Menu: Admin → Étudiants → Nouveau",
                "Remplissez les informations personnelles (nom, prénom, date de naissance)",
                "Sélectionnez la filière et le niveau (ex: INFO - L1)",
                "Sélectionnez la classe/groupe",
                "Uploadez la photo d'identité",
                "Renseignez les informations du tuteur/parent",
                "Activez 'Créer un compte automatiquement' si souhaité",
                "Sauvegardez"
            ]} />

            <h3 className="text-xl font-semibold mt-8">Import en masse</h3>

            <p className="text-muted-foreground">
                Pour importer plusieurs étudiants à la fois :
            </p>

            <StepList steps={[
                "Menu: Admin → Étudiants → Import CSV/Excel",
                "Téléchargez le modèle de fichier",
                "Remplissez le fichier avec vos données",
                "Uploadez le fichier complété",
                "Vérifiez la correspondance des colonnes",
                "Validez l'import"
            ]} />

            <InfoBox type="tip">
                Le matricule étudiant est généré automatiquement selon le format configuré
                dans les paramètres (ex: 2024-INFO-0001).
            </InfoBox>

            <h3 className="text-xl font-semibold mt-8">Inscriptions administratives</h3>

            <p className="text-muted-foreground">
                L'inscription administrative lie un étudiant à une année académique et une classe :
            </p>

            <StepList steps={[
                "Menu: Admin → Inscriptions",
                "Sélectionnez l'étudiant",
                "Choisissez l'année académique",
                "Sélectionnez la classe de destination",
                "Ajoutez les frais d'inscription si applicable",
                "Validez l'inscription"
            ]} />

            <h3 className="text-xl font-semibold mt-8">Liaison Parent-Étudiant</h3>

            <StepList steps={[
                "Ouvrez la fiche de l'étudiant",
                "Accédez à l'onglet 'Parents liés'",
                "Cliquez sur 'Associer un parent'",
                "Recherchez le parent existant ou créez-en un nouveau",
                "Définissez la relation (Père, Mère, Tuteur)",
                "Sauvegardez"
            ]} />

            <ScreenshotCard
                src={parentDashboard}
                alt="Tableau de bord parent"
                caption="Figure 5: Le parent peut suivre le parcours de son enfant depuis son espace dédié"
            />
        </div>
    );
};
