import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Copy, Check, AlertTriangle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BackupCodesProps {
    codes: string[];
    onRegenerate?: () => void;
}

export const BackupCodes = ({ codes, onRegenerate }: BackupCodesProps) => {
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const { toast } = useToast();

    const handleDownload = () => {
        const content = `CODES DE RÉCUPÉRATION
=====================================

⚠️  IMPORTANT : Conservez ces codes en lieu sûr !

Chaque code ne peut être utilisé qu'une seule fois.
Si vous perdez l'accès à votre appareil d'authentification,
vous pourrez utiliser ces codes pour vous connecter.

CODES :
${codes.map((code, i) => `${i + 1}. ${code}`).join('\n')}

Date de génération : ${new Date().toLocaleString('fr-FR')}
`;

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `schoolflow-backup-codes-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast({
            title: "Codes téléchargés",
            description: "Conservez ce fichier en lieu sûr",
        });
    };

    const handleCopyAll = async () => {
        const text = codes.join('\n');
        await navigator.clipboard.writeText(text);

        toast({
            title: "Codes copiés",
            description: "Tous les codes ont été copiés dans le presse-papiers",
        });
    };

    const handleCopyCode = async (code: string, index: number) => {
        await navigator.clipboard.writeText(code);
        setCopiedIndex(index);

        setTimeout(() => setCopiedIndex(null), 2000);

        toast({
            title: "Code copié",
            description: `Code ${index + 1} copié dans le presse-papiers`,
        });
    };

    return (
        <Card className="border-amber-200 bg-amber-50/50">
            <CardHeader>
                <div className="flex items-start justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-amber-600" />
                            Codes de Récupération
                        </CardTitle>
                        <CardDescription className="mt-2">
                            Conservez ces codes en lieu sûr. Chaque code ne peut être utilisé qu'une seule fois.
                        </CardDescription>
                    </div>
                    {onRegenerate && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onRegenerate}
                            className="gap-2"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Régénérer
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Important</AlertTitle>
                    <AlertDescription>
                        <ul className="list-disc list-inside space-y-1 mt-2">
                            <li>Téléchargez ou imprimez ces codes immédiatement</li>
                            <li>Stockez-les dans un endroit sécurisé (coffre-fort, gestionnaire de mots de passe)</li>
                            <li>Ne les partagez avec personne</li>
                            <li>Chaque code ne fonctionne qu'une seule fois</li>
                        </ul>
                    </AlertDescription>
                </Alert>

                <div className="grid grid-cols-2 gap-3">
                    {codes.map((code, index) => (
                        <div
                            key={index}
                            className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:border-primary transition-colors"
                        >
                            <code className="font-mono text-lg font-semibold text-gray-900">
                                {code}
                            </code>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCopyCode(code, index)}
                                className="h-8 w-8 p-0"
                            >
                                {copiedIndex === index ? (
                                    <Check className="w-4 h-4 text-green-600" />
                                ) : (
                                    <Copy className="w-4 h-4" />
                                )}
                            </Button>
                        </div>
                    ))}
                </div>

                <div className="flex gap-2 pt-4">
                    <Button onClick={handleDownload} className="flex-1 gap-2">
                        <Download className="w-4 h-4" />
                        Télécharger les codes
                    </Button>
                    <Button onClick={handleCopyAll} variant="outline" className="flex-1 gap-2">
                        <Copy className="w-4 h-4" />
                        Copier tous les codes
                    </Button>
                </div>

                <p className="text-sm text-muted-foreground text-center">
                    Ces codes ne seront plus affichés après cette page. Assurez-vous de les sauvegarder maintenant.
                </p>
            </CardContent>
        </Card>
    );
};
