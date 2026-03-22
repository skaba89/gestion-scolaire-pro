import { Settings } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoBox, StepList } from "../components/GuideComponents";

export const SetupSection = () => {
    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold">Configuration de l'université</h2>

            <h3 className="text-xl font-semibold">1. Création de l'établissement</h3>

            <InfoBox type="info">
                Seul un Super Administrateur peut créer un nouvel établissement universitaire.
                Contactez l'administrateur système si vous n'avez pas accès.
            </InfoBox>

            <StepList steps={[
                "Connectez-vous avec un compte Super Admin",
                "Accédez à 'Établissements' dans le menu principal",
                "Cliquez sur 'Nouvel établissement'",
                "Remplissez les informations : Nom de l'université, Slug unique (ex: universite-dakar), Type: Université",
                "Uploadez le logo officiel de l'université",
                "Activez l'établissement et sauvegardez"
            ]} />

            <h3 className="text-xl font-semibold mt-8">2. Configuration de l'année académique</h3>

            <StepList steps={[
                "Menu: Admin → Années académiques",
                "Créez l'année en cours (ex: 2024-2025)",
                "Définissez les dates de début et fin",
                "Cochez 'Année courante' pour l'activer"
            ]} />

            <h3 className="text-xl font-semibold mt-8">3. Configuration des semestres</h3>

            <p className="text-muted-foreground">
                Les universités fonctionnent généralement en semestres. Créez 2 semestres par année :
            </p>

            <div className="grid md:grid-cols-2 gap-4 mt-4 text-left">
                <Card className="border-l-4 border-l-primary">
                    <CardHeader>
                        <CardTitle className="text-base">Semestre 1</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        <p>Septembre - Janvier</p>
                        <p>Examens : Décembre/Janvier</p>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-secondary">
                    <CardHeader>
                        <CardTitle className="text-base">Semestre 2</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        <p>Février - Juin</p>
                        <p>Examens : Mai/Juin</p>
                    </CardContent>
                </Card>
            </div>

            <h3 className="text-xl font-semibold mt-8">4. Création des niveaux universitaires</h3>

            <p className="text-muted-foreground">
                Pour une université, créez les niveaux suivants selon le système LMD :
            </p>

            <div className="bg-muted/50 p-4 rounded-lg mt-4 text-left">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b">
                            <th className="text-left py-2">Niveau</th>
                            <th className="text-left py-2">Nom complet</th>
                            <th className="text-left py-2">Cycle</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="border-b"><td className="py-2">L1</td><td>Licence 1ère année</td><td>Licence</td></tr>
                        <tr className="border-b"><td className="py-2">L2</td><td>Licence 2ème année</td><td>Licence</td></tr>
                        <tr className="border-b"><td className="py-2">L3</td><td>Licence 3ème année</td><td>Licence</td></tr>
                        <tr className="border-b"><td className="py-2">M1</td><td>Master 1ère année</td><td>Master</td></tr>
                        <tr className="border-b"><td className="py-2">M2</td><td>Master 2ème année</td><td>Master</td></tr>
                        <tr><td className="py-2">D</td><td>Doctorat</td><td>Doctorat</td></tr>
                    </tbody>
                </table>
            </div>

            <InfoBox type="tip">
                Les niveaux sont automatiquement pré-remplis si vous avez sélectionné "Université"
                comme type d'établissement lors de la création.
            </InfoBox>
        </div>
    );
};
