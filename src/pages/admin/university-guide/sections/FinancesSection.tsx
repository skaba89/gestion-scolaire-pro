import { CreditCard, Wallet, FileCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoBox, StepList } from "../components/GuideComponents";

export const FinancesSection = () => {
    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold">Gestion financière et scolarité</h2>

            <h3 className="text-xl font-semibold">Configuration des frais</h3>

            <StepList steps={[
                "Menu: Finances → Configuration des frais",
                "Créez les différents types de frais (Scolarité, Inscription, Bibliothèque, etc.)",
                "Associez les montants par niveau/filière",
                "Définissez les dates limites de paiement"
            ]} />

            <h3 className="text-xl font-semibold mt-8">Facturation</h3>

            <p className="text-muted-foreground">
                Le système génère automatiquement les factures selon la configuration :
            </p>

            <StepList steps={[
                "Génération automatique lors de l'inscription",
                "Émission manuelle de factures ponctuelles si nécessaire",
                "Envoi automatique par email aux parents"
            ]} />

            <h3 className="text-xl font-semibold mt-8">Gestion des paiements</h3>

            <div className="grid md:grid-cols-3 gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Wallet className="h-4 w-4" />
                            Paiement Guichet
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground text-left">
                        Encaissement physique à l'université, enregistrement par le comptable.
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <CreditCard className="h-4 w-4" />
                            Paiement en ligne
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground text-left">
                        Paiement par Mobile Money ou Carte via le portail étudiant/parent.
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <FileCheck className="h-4 w-4" />
                            Bourses
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground text-left">
                        Application de réductions ou exemptions pour les boursiers.
                    </CardContent>
                </Card>
            </div>

            <h3 className="text-xl font-semibold mt-8">Suivi des impayés</h3>

            <InfoBox type="warning">
                Le système peut restreindre l'accès à certaines fonctionnalités (ex: voir les notes)
                si l'étudiant est en situation d'impayé au-delà d'un certain seuil.
            </InfoBox>

            <StepList steps={[
                "Menu: Finances → État des recouvrements",
                "Filtrez par département ou classe",
                "Générez des rappels de paiement automatiques",
                "Exportez les rapports pour la comptabilité"
            ]} />
        </div>
    );
};
