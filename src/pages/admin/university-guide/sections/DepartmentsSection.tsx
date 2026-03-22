import { Building2, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InfoBox, StepList, ScreenshotCard } from "../components/GuideComponents";
import departmentDashboard from "@/assets/docs/department-dashboard.png";

export const DepartmentsSection = () => {
    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold">Départements et filières</h2>

            <p className="text-muted-foreground">
                Les départements sont les unités organisationnelles principales de l'université.
                Chaque département peut avoir plusieurs filières et est géré par un Chef de département.
            </p>

            <h3 className="text-xl font-semibold">Créer un département</h3>

            <StepList steps={[
                "Menu: Admin → Départements",
                "Cliquez sur 'Nouveau département'",
                "Remplissez: Nom (ex: Sciences Informatiques), Code (ex: INFO)",
                "Optionnel: Désignez un Chef de département",
                "Sauvegardez"
            ]} />

            <h3 className="text-xl font-semibold mt-8">Exemple de structure universitaire</h3>

            <div className="space-y-4 text-left">
                {[
                    {
                        name: "Département Sciences Informatiques",
                        code: "INFO",
                        filieres: ["Génie Logiciel", "Réseaux & Systèmes", "Intelligence Artificielle", "Cybersécurité"]
                    },
                    {
                        name: "Département Sciences Économiques",
                        code: "ECO",
                        filieres: ["Économie", "Gestion", "Finance", "Marketing"]
                    },
                    {
                        name: "Département Lettres & Sciences Humaines",
                        code: "LSH",
                        filieres: ["Lettres Modernes", "Histoire", "Philosophie", "Sociologie"]
                    }
                ].map((dept, index) => (
                    <Card key={index}>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Badge>{dept.code}</Badge>
                                {dept.name}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground mb-2">Filières :</p>
                            <div className="flex flex-wrap gap-2">
                                {dept.filieres.map((f, i) => (
                                    <Badge key={i} variant="outline">{f}</Badge>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <h3 className="text-xl font-semibold mt-8">Associer les classes aux départements</h3>

            <InfoBox type="warning">
                Chaque classe (groupe d'étudiants) doit être associée à un département pour
                que le Chef de département puisse la gérer. Sans cette association, la classe
                ne sera visible que par l'administration centrale.
            </InfoBox>

            <StepList steps={[
                "Menu: Admin → Classes",
                "Ouvrez une classe existante ou créez-en une nouvelle",
                "Dans le champ 'Département', sélectionnez le département concerné",
                "Sauvegardez"
            ]} />

            <ScreenshotCard
                src={departmentDashboard}
                alt="Tableau de bord département"
                caption="Figure 2: Interface du Chef de département avec vue sur ses classes et étudiants"
            />
        </div>
    );
};
