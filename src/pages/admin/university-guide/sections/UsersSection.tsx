import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InfoBox, StepList, ScreenshotCard } from "../components/GuideComponents";
import teacherDashboard from "@/assets/docs/teacher-dashboard.png";
import studentDashboard from "@/assets/docs/student-dashboard.png";

export const UsersSection = () => {
    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold">Types d'utilisateurs</h2>

            <div className="grid gap-4 text-left">
                {[
                    {
                        role: "SUPER_ADMIN",
                        label: "Super Administrateur",
                        description: "Gestion globale de la plateforme, création d'universités",
                        color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                    },
                    {
                        role: "TENANT_ADMIN",
                        label: "Administrateur",
                        description: "Gestion complète de l'université (étudiants, finances, paramètres)",
                        color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
                    },
                    {
                        role: "DIRECTOR",
                        label: "Directeur",
                        description: "Supervision globale, rapports, décisions stratégiques",
                        color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400"
                    },
                    {
                        role: "DEPARTMENT_HEAD",
                        label: "Chef de département",
                        description: "Gestion de son département : classes, enseignants, examens",
                        color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                    },
                    {
                        role: "TEACHER",
                        label: "Enseignant",
                        description: "Gestion des cours, notes, présences de ses classes",
                        color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                    },
                    {
                        role: "STUDENT",
                        label: "Étudiant",
                        description: "Consultation des notes, emploi du temps, devoirs",
                        color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                    },
                    {
                        role: "PARENT",
                        label: "Parent/Tuteur",
                        description: "Suivi du parcours de l'étudiant, factures, communication",
                        color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
                    },
                    {
                        role: "ALUMNI",
                        label: "Alumni",
                        description: "Réseau des anciens, mentorat, demandes de documents",
                        color: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400"
                    }
                ].map((user, index) => (
                    <Card key={index} className="flex items-center p-4 gap-4">
                        <Badge className={user.color}>{user.role}</Badge>
                        <div>
                            <p className="font-medium">{user.label}</p>
                            <p className="text-sm text-muted-foreground">{user.description}</p>
                        </div>
                    </Card>
                ))}
            </div>

            <h3 className="text-xl font-semibold mt-8">Créer un compte utilisateur</h3>

            <StepList steps={[
                "Menu: Admin → Utilisateurs → Nouveau",
                "Remplissez: Email, Prénom, Nom",
                "Sélectionnez le rôle approprié",
                "Pour un Chef de département: associez-le à son département",
                "Activez 'Envoyer les identifiants par email'",
                "Sauvegardez"
            ]} />

            <InfoBox type="info">
                Un mot de passe temporaire sera généré et envoyé par email.
                L'utilisateur devra le changer à sa première connexion.
            </InfoBox>

            <div className="grid md:grid-cols-2 gap-4 mt-8">
                <ScreenshotCard
                    src={teacherDashboard}
                    alt="Tableau de bord enseignant"
                    caption="Figure 3: Interface enseignant"
                />
                <ScreenshotCard
                    src={studentDashboard}
                    alt="Tableau de bord étudiant"
                    caption="Figure 4: Interface étudiant"
                />
            </div>
        </div>
    );
};
