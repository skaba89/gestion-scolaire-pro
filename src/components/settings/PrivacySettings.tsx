import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Download, Trash2, AlertTriangle, Shield, FileJson, Globe, CheckCircle2, ExternalLink, Server, Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { gdprService } from "@/lib/gdpr-service";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// ── Country compliance data ────────────────────────────────────────────────────

interface CountryCompliance {
  code: string;
  name: string;
  flag: string;
  authority: string;
  law: string;
  link: string;
  requirements: string[];
  status: "compliant" | "partial" | "check";
}

const AFRICAN_COMPLIANCE: CountryCompliance[] = [
  {
    code: "GN",
    name: "Guinée",
    flag: "🇬🇳",
    authority: "ANPD — Autorité Nationale de Protection des Données",
    law: "Loi L/2016/037/AN sur la cybersécurité et protection des données",
    link: "https://www.anpd.gov.gn",
    requirements: [
      "Déclaration préalable auprès de l'ANPD",
      "Consentement explicite pour données sensibles",
      "Droit d'accès, rectification et suppression",
      "Notification de violation sous 72h",
    ],
    status: "compliant",
  },
  {
    code: "SN",
    name: "Sénégal",
    flag: "🇸🇳",
    authority: "CDP — Commission de Protection des Données Personnelles",
    law: "Loi n°2008-12 du 25 janvier 2008",
    link: "https://www.cdp.sn",
    requirements: [
      "Déclaration obligatoire à la CDP",
      "DPO requis pour traitement à grande échelle",
      "Consentement préalable et informé",
      "Durée de conservation limitée",
    ],
    status: "compliant",
  },
  {
    code: "CI",
    name: "Côte d'Ivoire",
    flag: "🇨🇮",
    authority: "ARTCI — Autorité de Régulation des Télécommunications / TIC",
    law: "Loi n°2013-450 du 19 juin 2013",
    link: "https://www.artci.ci",
    requirements: [
      "Déclaration auprès de l'ARTCI",
      "Finalité déterminée et légitime",
      "Sécurité des données par chiffrement",
      "Transfert hors CEDEAO encadré",
    ],
    status: "compliant",
  },
  {
    code: "ML",
    name: "Mali",
    flag: "🇲🇱",
    authority: "CIL — Commission Informatique et Libertés",
    law: "Loi n°2013-015 du 21 mai 2013",
    link: "https://www.cil.ml",
    requirements: [
      "Déclaration des fichiers à la CIL",
      "Consentement de la personne concernée",
      "Mesures de sécurité appropriées",
    ],
    status: "compliant",
  },
  {
    code: "BF",
    name: "Burkina Faso",
    flag: "🇧🇫",
    authority: "CIL-BF — Commission de l'Informatique et des Libertés",
    law: "Loi n°010-2004/AN du 20 avril 2004",
    link: "https://www.cil.bf",
    requirements: [
      "Formalités préalables auprès de la CIL",
      "Finalité légitime et proportionnée",
      "Information des personnes concernées",
    ],
    status: "partial",
  },
  {
    code: "CM",
    name: "Cameroun",
    flag: "🇨🇲",
    authority: "ANTIC — Agence Nationale des TIC",
    law: "Loi n°2010/012 du 21 décembre 2010",
    link: "https://www.antic.cm",
    requirements: [
      "Agrément de l'ANTIC",
      "Hébergement local recommandé",
      "Sécurité et confidentialité des données",
    ],
    status: "partial",
  },
  {
    code: "TG",
    name: "Togo",
    flag: "🇹🇬",
    authority: "HAAC — Haute Autorité de l'Audiovisuel et de la Communication",
    law: "Loi n°2019-014 relative aux données personnelles",
    link: "https://www.haac.tg",
    requirements: [
      "Déclaration préalable",
      "Consentement explicite",
      "Droit à l'oubli",
    ],
    status: "compliant",
  },
  {
    code: "MA",
    name: "Maroc",
    flag: "🇲🇦",
    authority: "CNDP — Commission Nationale de contrôle de protection des Données",
    law: "Loi n°09-08 du 18 février 2009",
    link: "https://www.cndp.ma",
    requirements: [
      "Déclaration et autorisation selon le traitement",
      "DPO désigné pour les grandes organisations",
      "Transfert hors Maroc autorisé sous conditions",
    ],
    status: "check",
  },
];

const statusConfig = {
  compliant: { label: "Conforme", className: "border-green-500 text-green-700 bg-green-50" },
  partial: { label: "Partiel", className: "border-orange-400 text-orange-700 bg-orange-50" },
  check: { label: "À vérifier", className: "border-blue-400 text-blue-700 bg-blue-50" },
};

// ── DPA Generator ──────────────────────────────────────────────────────────────

function generateDPA(schoolName: string, schoolEmail: string, country: string): string {
  const date = new Date().toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  });
  return `ACCORD DE TRAITEMENT DES DONNÉES (ATD / DPA)

Entre les soussignés :
  - SchoolFlow Pro SaaS, éditeur de la plateforme (ci-après « le Sous-traitant »)
  - ${schoolName} (ci-après « le Responsable du traitement »), ${schoolEmail}

Pays d'opération : ${country || "Afrique de l'Ouest"}
Date : ${date}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ARTICLE 1 — OBJET ET DURÉE

1.1 Le présent accord encadre les conditions dans lesquelles le Sous-traitant
traite les données personnelles pour le compte du Responsable du traitement
dans le cadre de la fourniture de la plateforme de gestion scolaire SchoolFlow Pro.

1.2 Le présent accord prend effet à la date de signature et demeure en vigueur
pendant toute la durée du contrat de service.

ARTICLE 2 — NATURE DES TRAITEMENTS

Le Sous-traitant est autorisé à traiter, pour le compte du Responsable du
traitement, les données à caractère personnel nécessaires pour :
  - La gestion des inscriptions et des dossiers scolaires
  - La gestion des notes, bulletins et relevés de notes
  - La gestion financière (factures, paiements)
  - La communication entre l'établissement et les familles
  - L'analyse statistique et les rapports institutionnels

Catégories de personnes concernées :
  - Élèves / étudiants (mineurs et majeurs)
  - Parents et tuteurs légaux
  - Enseignants et personnel administratif

ARTICLE 3 — OBLIGATIONS DU SOUS-TRAITANT

Le Sous-traitant s'engage à :
  3.1 Ne traiter les données qu'aux seules fins de l'exécution du service.
  3.2 Garantir la confidentialité des données par chiffrement AES-256 au repos
      et TLS 1.3 en transit.
  3.3 Ne pas sous-traiter sans accord préalable écrit du Responsable.
  3.4 Notifier toute violation de données dans les 72 heures.
  3.5 Effacer ou retourner les données à la fin du contrat.
  3.6 Coopérer avec les autorités de contrôle (ANPD, CDP, ARTCI, CIL, etc.).

ARTICLE 4 — LOCALISATION DES DONNÉES

Les données sont hébergées dans des centres de données conformes aux
exigences des législations africaines applicables. Une option
d'hébergement local (on-premise) ou en cloud africain est disponible.

Serveurs principaux : Union Européenne (ISO 27001)
Option Afrique : disponible sur demande (OVH Dakar, AWS Afrique du Sud)

ARTICLE 5 — DURÉE DE CONSERVATION

  - Données scolaires (notes, bulletins) : 10 ans après la fin de scolarité
  - Données financières (factures, paiements) : 10 ans (obligation légale)
  - Données de connexion et logs : 12 mois
  - Données marketing / communications : jusqu'au retrait du consentement

ARTICLE 6 — DROITS DES PERSONNES CONCERNÉES

Les personnes concernées bénéficient des droits suivants, exercés auprès
du Responsable du traitement :
  - Droit d'accès (article 15 RGPD / équivalents africains)
  - Droit de rectification
  - Droit à l'effacement (sauf obligation légale de conservation)
  - Droit à la portabilité (export JSON ou CSV)
  - Droit d'opposition

ARTICLE 7 — TRANSFERTS INTERNATIONAUX

Tout transfert de données hors du territoire national est encadré par des
clauses contractuelles types ou des garanties appropriées conformément aux
réglementations locales applicables.

ARTICLE 8 — AUDIT ET CONFORMITÉ

Le Responsable du traitement a le droit de mener ou faire mener des audits
de conformité, après préavis de 30 jours. Le Sous-traitant s'engage à
coopérer pleinement.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Fait en deux exemplaires originaux.

Pour le Responsable du traitement :          Pour le Sous-traitant :
${schoolName}                                SchoolFlow Pro SaaS

Signature : ________________________         Signature : ________________________

Nom : _____________________________          Nom : _____________________________

Date : ____________________________          Date : ____________________________
`;
}

// ── Main Component ─────────────────────────────────────────────────────────────

export const PrivacySettings = () => {
  const { user, signOut } = useAuth();
  const { tenant } = useTenant();
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleExportData = async () => {
    if (!user) return;
    setIsExporting(true);
    try {
      const data = await gdprService.exportUserData(user.id);
      gdprService.downloadDataAsJson(data, `donnees-${new Date().toISOString().split("T")[0]}.json`);
      toast({ title: "Export réussi", description: "Vos données ont été téléchargées." });
    } catch {
      toast({ title: "Erreur", description: "Impossible d'exporter vos données.", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setIsDeleting(true);
    try {
      await gdprService.deleteAccount(user.id);
      toast({ title: "Compte supprimé", description: "Votre compte a été anonymisé." });
      setTimeout(() => signOut(), 2000);
    } catch {
      toast({ title: "Erreur", description: "Impossible de supprimer votre compte.", variant: "destructive" });
      setIsDeleting(false);
    }
  };

  const downloadDPA = () => {
    const dpa = generateDPA(
      tenant?.name || "Établissement",
      tenant?.email || "",
      tenant?.country || "Afrique de l'Ouest",
    );
    const blob = new Blob([dpa], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DPA_SchoolFlow_${(tenant?.name || "ecole").replace(/\s+/g, "_")}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: "DPA téléchargé",
      description: "Accord de Traitement des Données prêt à signer",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold tracking-tight">Confidentialité & Conformité</h2>
      </div>

      {/* ── RGPD / Data portability ───────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Export des données personnelles</CardTitle>
          <CardDescription>
            Conformément aux législations africaines et au RGPD, vous pouvez récupérer
            une copie de vos données au format JSON.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleExportData} disabled={isExporting} variant="outline" className="gap-2">
            {isExporting
              ? <span className="loading loading-spinner loading-xs" />
              : <FileJson className="h-4 w-4" />
            }
            {isExporting ? "Préparation..." : "Télécharger mes données (JSON)"}
          </Button>
        </CardContent>
      </Card>

      {/* ── DPA ──────────────────────────────────────────────────────── */}
      <Card className="border-blue-200">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Lock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <CardTitle>Accord de Traitement des Données (DPA)</CardTitle>
              <CardDescription>
                Document légal requis pour les marchés publics et les contrats avec l'État
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-blue-50 border border-blue-100 text-sm text-blue-700 space-y-1">
            <p className="font-medium">Ce document inclut :</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              <li>Finalités et bases légales du traitement</li>
              <li>Mesures de sécurité (chiffrement AES-256, TLS 1.3)</li>
              <li>Durées de conservation par catégorie de données</li>
              <li>Droits des personnes concernées (accès, rectification, suppression)</li>
              <li>Conditions de transfert international</li>
              <li>Procédure de notification de violation (72h)</li>
            </ul>
          </div>
          <Button onClick={downloadDPA} className="gap-2">
            <Download className="w-4 h-4" />
            Télécharger le DPA (TXT)
          </Button>
        </CardContent>
      </Card>

      {/* ── African country compliance ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <Globe className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <CardTitle>Conformité réglementaire africaine</CardTitle>
              <CardDescription>
                Référentiel des autorités de protection des données par pays
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-4">
            {AFRICAN_COMPLIANCE.map((c) => {
              const status = statusConfig[c.status];
              return (
                <div key={c.code} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{c.flag}</span>
                      <div>
                        <p className="font-semibold">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.authority}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={status.className}>
                      {status.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground italic">{c.law}</p>
                  <ul className="space-y-1">
                    {c.requirements.map((req, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                        {req}
                      </li>
                    ))}
                  </ul>
                  <a
                    href={c.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    {c.authority} <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── On-premise / sovereignty ──────────────────────────────────── */}
      <Card className="border-indigo-200">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Server className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <CardTitle>Souveraineté des données</CardTitle>
              <CardDescription>
                Options d'hébergement pour les contrats gouvernementaux
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                title: "Cloud mutualisé",
                desc: "Infrastructure partagée hébergée en Europe (ISO 27001). Idéal pour les écoles privées.",
                badge: "Disponible",
                badgeClass: "border-green-500 text-green-700 bg-green-50",
              },
              {
                title: "Cloud africain",
                desc: "Hébergement en Afrique (OVH Dakar, AWS Cape Town). Données physiquement sur le continent.",
                badge: "Sur demande",
                badgeClass: "border-blue-500 text-blue-700 bg-blue-50",
              },
              {
                title: "On-premise",
                desc: "Déploiement sur les serveurs de l'État ou de l'établissement. Docker Compose fourni.",
                badge: "Contrat gov.",
                badgeClass: "border-indigo-500 text-indigo-700 bg-indigo-50",
              },
            ].map((opt) => (
              <div key={opt.title} className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">{opt.title}</p>
                  <Badge variant="outline" className={opt.badgeClass + " text-xs"}>{opt.badge}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{opt.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 rounded-md bg-indigo-50 border border-indigo-200 text-xs text-indigo-700">
            <strong>Pour les marchés publics :</strong> Un guide de déploiement on-premise avec Docker Compose
            est disponible sur demande. Contactez{" "}
            <a href="mailto:gov@schoolflow.pro" className="underline font-medium">gov@schoolflow.pro</a>.
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* ── Danger zone ───────────────────────────────────────────────── */}
      <Card className="border-destructive/20">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Zone de Danger
          </CardTitle>
          <CardDescription>Actions irréversibles concernant votre compte.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Attention</AlertTitle>
            <AlertDescription>
              La suppression anonymise vos données personnelles de façon irréversible.
              Les données académiques (notes, bulletins) sont conservées pour l'obligation légale.
            </AlertDescription>
          </Alert>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Supprimer mon compte</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Êtes-vous absolument sûr ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Cette action est irréversible. Vos données personnelles seront effacées ou anonymisées.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAccount}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={isDeleting}
                >
                  {isDeleting ? "Suppression..." : "Oui, supprimer"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
};
