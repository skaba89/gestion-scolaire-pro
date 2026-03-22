import { FileText, Award, CreditCard, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoBox, StepList, ScreenshotCard } from "../components/GuideComponents";
import alumniDashboard from "@/assets/docs/alumni-dashboard.png";

export const DocumentsSection = () => {
    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold">Documents et certificats</h2>

            <div className="grid md:grid-cols-2 gap-4 text-left">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Bulletins & relevés
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        Génération de documents académiques à partir des notes (PDF imprimable / partageable).
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Award className="h-4 w-4" />
                            Attestations & certificats
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        Attestations de scolarité, certificats, documents administratifs, signatures.
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <CreditCard className="h-4 w-4" />
                            Factures & reçus
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        Factures générées pour les étudiants, envoi email et historique des paiements.
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            Demandes Alumni
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        Les alumni peuvent demander diplômes, relevés, attestations et suivre le statut de traitement.
                    </CardContent>
                </Card>
            </div>

            <h3 className="text-xl font-semibold mt-8">Générer un bulletin / relevé (PDF)</h3>
            <StepList
                steps={[
                    "Menu: Admin → Bulletins",
                    "Choisissez l'année académique et le semestre/trimètre",
                    "Sélectionnez la classe (ou l'étudiant)",
                    "Cliquez sur 'Générer'",
                    "Téléchargez / imprimez le PDF"
                ]}
            />

            <h3 className="text-xl font-semibold mt-8">Créer une attestation / certificat</h3>
            <StepList
                steps={[
                    "Menu: Admin → Certificats",
                    "Choisissez le type de document",
                    "Sélectionnez l'étudiant",
                    "Vérifiez les informations et signatures",
                    "Générez puis imprimez / exportez en PDF"
                ]}
            />

            <InfoBox type="tip">
                Pour enregistrer ce guide (ou n'importe quelle page) en PDF : cliquez sur “Télécharger PDF”
                puis, dans la fenêtre d'impression, choisissez “Enregistrer en PDF”.
            </InfoBox>

            <ScreenshotCard
                src={alumniDashboard}
                alt="Espace Alumni - demandes de documents"
                caption="Figure 6: Exemple d'espace Alumni avec demandes de documents"
            />
        </div>
    );
};
