import { BookOpen } from "lucide-react";
import { InfoBox, StepList } from "../components/GuideComponents";

export const AcademicsSection = () => {
    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold">Matières, cours et évaluations</h2>

            <h3 className="text-xl font-semibold">Configuration des matières</h3>

            <StepList steps={[
                "Menu: Admin → Matières",
                "Créez les matières pour chaque filière",
                "Définissez le coefficient (importance dans la moyenne)",
                "Associez à un ou plusieurs niveaux"
            ]} />

            <div className="bg-muted/50 p-4 rounded-lg mt-4 text-left">
                <h4 className="font-medium mb-3">Exemple: Matières L1 Informatique</h4>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b">
                            <th className="text-left py-2">Matière</th>
                            <th className="text-left py-2">Coef.</th>
                            <th className="text-left py-2">Crédits</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="border-b"><td className="py-2">Algorithmique</td><td>4</td><td>6</td></tr>
                        <tr className="border-b"><td className="py-2">Programmation C</td><td>4</td><td>6</td></tr>
                        <tr className="border-b"><td className="py-2">Mathématiques</td><td>3</td><td>4</td></tr>
                        <tr className="border-b"><td className="py-2">Anglais technique</td><td>2</td><td>3</td></tr>
                        <tr><td className="py-2">Architecture des ordinateurs</td><td>3</td><td>4</td></tr>
                    </tbody>
                </table>
            </div>

            <h3 className="text-xl font-semibold mt-8">Affectation des enseignants</h3>

            <StepList steps={[
                "Menu: Admin → Enseignants",
                "Sélectionnez un enseignant",
                "Cliquez sur 'Gérer les affectations'",
                "Associez les matières et les classes qu'il enseigne",
                "Sauvegardez"
            ]} />

            <h3 className="text-xl font-semibold mt-8">Saisie des notes</h3>

            <p className="text-muted-foreground">
                Les enseignants saisissent les notes depuis leur interface :
            </p>

            <StepList steps={[
                "Connexion en tant qu'enseignant",
                "Menu: Notes → Nouvelle évaluation",
                "Sélectionnez: Classe, Matière, Type (CC, Examen, TP)",
                "Définissez le barème (/20) et le coefficient",
                "Saisissez les notes pour chaque étudiant",
                "Publiez les notes"
            ]} />

            <InfoBox type="warning">
                Une fois publiées, les notes sont visibles par les étudiants et les parents.
                Assurez-vous de vérifier avant publication.
            </InfoBox>

            <h3 className="text-xl font-semibold mt-8">Génération des bulletins</h3>

            <StepList steps={[
                "Menu: Admin → Bulletins",
                "Sélectionnez la classe et le semestre",
                "Cliquez sur 'Générer les bulletins'",
                "Ajoutez les appréciations générales",
                "Signez électroniquement",
                "Publiez ou imprimez"
            ]} />
        </div>
    );
};
