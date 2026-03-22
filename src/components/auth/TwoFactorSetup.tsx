import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Mail, Key, CheckCircle2, Copy, Download } from "lucide-react";
import { useEnable2FA, useSend2FACode, useVerify2FACode } from "@/hooks/queries/use2FA";
import { toast } from "sonner";

interface TwoFactorSetupProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onComplete?: () => void;
}

export const TwoFactorSetup = ({ open, onOpenChange, onComplete }: TwoFactorSetupProps) => {
    const [step, setStep] = useState(1);
    const [verificationCode, setVerificationCode] = useState("");
    const [backupCodes, setBackupCodes] = useState<string[]>([]);

    const enable2FAMutation = useEnable2FA();
    const sendCodeMutation = useSend2FACode();
    const verifyCodeMutation = useVerify2FACode();

    const handleSendCode = async () => {
        const result = await sendCodeMutation.mutateAsync();
        // In development, show the code
        if (result.code) {
            toast.info(`Code de développement: ${result.code}`);
        }
        setStep(3);
    };

    const handleVerifyCode = async () => {
        try {
            await verifyCodeMutation.mutateAsync({ code: verificationCode });

            // Enable 2FA and get backup codes
            const result = await enable2FAMutation.mutateAsync();
            setBackupCodes(result.backupCodes);
            setStep(4);
        } catch (error) {
            // Error handled by mutation
        }
    };

    const handleCopyBackupCodes = () => {
        const text = backupCodes.join("\n");
        navigator.clipboard.writeText(text);
        toast.success("Codes copiés dans le presse-papiers");
    };

    const handleDownloadBackupCodes = () => {
        const text = backupCodes.join("\n");
        const blob = new Blob([text], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "schoolflow-backup-codes.txt";
        link.click();
        URL.revokeObjectURL(url);
        toast.success("Codes téléchargés");
    };

    const handleComplete = () => {
        onOpenChange(false);
        onComplete?.();
        // Reset state
        setStep(1);
        setVerificationCode("");
        setBackupCodes([]);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Shield className="w-5 h-5" />
                        Configuration de l'authentification à deux facteurs
                    </DialogTitle>
                    <DialogDescription>
                        Étape {step} sur 4
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    {/* Step 1: Introduction */}
                    {step === 1 && (
                        <div className="space-y-4">
                            <Alert>
                                <Shield className="w-4 h-4" />
                                <AlertDescription>
                                    L'authentification à deux facteurs (2FA) ajoute une couche de sécurité supplémentaire à votre compte.
                                </AlertDescription>
                            </Alert>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-lg">Pourquoi activer la 2FA ?</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <div className="flex items-start gap-2">
                                        <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
                                        <div>
                                            <p className="font-medium">Protection renforcée</p>
                                            <p className="text-sm text-muted-foreground">
                                                Même si quelqu'un connaît votre mot de passe, il ne pourra pas accéder à votre compte
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
                                        <div>
                                            <p className="font-medium">Alertes de connexion</p>
                                            <p className="text-sm text-muted-foreground">
                                                Vous serez averti de toute tentative de connexion suspecte
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
                                        <div>
                                            <p className="font-medium">Codes de récupération</p>
                                            <p className="text-sm text-muted-foreground">
                                                Des codes de secours vous permettent de récupérer l'accès si nécessaire
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Button onClick={() => setStep(2)} className="w-full">
                                Continuer
                            </Button>
                        </div>
                    )}

                    {/* Step 2: Choose method */}
                    {step === 2 && (
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                                Choisissez votre méthode de vérification préférée
                            </p>

                            <div className="grid gap-4">
                                <Card
                                    className="cursor-pointer hover:border-primary transition-colors"
                                    onClick={handleSendCode}
                                >
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2 text-lg">
                                            <Mail className="w-5 h-5" />
                                            Email
                                        </CardTitle>
                                        <CardDescription>
                                            Recevez un code à 6 chiffres par email à chaque connexion
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex items-center justify-between">
                                            <div className="text-sm text-muted-foreground">
                                                ✅ Simple et rapide<br />
                                                ✅ Aucune application requise
                                            </div>
                                            <Button>Choisir</Button>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="opacity-50">
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2 text-lg">
                                            <Key className="w-5 h-5" />
                                            Application d'authentification
                                        </CardTitle>
                                        <CardDescription>
                                            Utilisez Google Authenticator, Authy, ou une autre app TOTP
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex items-center justify-between">
                                            <div className="text-sm text-muted-foreground">
                                                🔒 Plus sécurisé<br />
                                                ⏱️ Disponible prochainement
                                            </div>
                                            <Button disabled>Bientôt</Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            <Button variant="outline" onClick={() => setStep(1)} className="w-full">
                                Retour
                            </Button>
                        </div>
                    )}

                    {/* Step 3: Verify code */}
                    {step === 3 && (
                        <div className="space-y-4">
                            <Alert>
                                <Mail className="w-4 h-4" />
                                <AlertDescription>
                                    Un code de vérification a été envoyé à votre adresse email
                                </AlertDescription>
                            </Alert>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Code de vérification</label>
                                <Input
                                    type="text"
                                    placeholder="000000"
                                    value={verificationCode}
                                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                    maxLength={6}
                                    className="text-center text-2xl tracking-widest font-mono"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Le code expire dans 5 minutes
                                </p>
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    onClick={handleVerifyCode}
                                    disabled={verificationCode.length !== 6 || verifyCodeMutation.isPending}
                                    className="flex-1"
                                >
                                    {verifyCodeMutation.isPending ? "Vérification..." : "Vérifier"}
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={handleSendCode}
                                    disabled={sendCodeMutation.isPending}
                                >
                                    Renvoyer
                                </Button>
                            </div>

                            <Button variant="ghost" onClick={() => setStep(2)} className="w-full">
                                Retour
                            </Button>
                        </div>
                    )}

                    {/* Step 4: Backup codes */}
                    {step === 4 && (
                        <div className="space-y-4">
                            <Alert>
                                <Key className="w-4 h-4" />
                                <AlertDescription>
                                    <strong>Important :</strong> Sauvegardez ces codes de récupération dans un endroit sûr.
                                    Ils vous permettront d'accéder à votre compte si vous perdez l'accès à votre email.
                                </AlertDescription>
                            </Alert>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-lg">Codes de récupération</CardTitle>
                                    <CardDescription>
                                        Chaque code ne peut être utilisé qu'une seule fois
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="bg-muted p-4 rounded-lg font-mono text-sm space-y-1">
                                        {backupCodes.map((code, index) => (
                                            <div key={index} className="flex items-center justify-between">
                                                <span>{code}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex gap-2 mt-4">
                                        <Button
                                            variant="outline"
                                            onClick={handleCopyBackupCodes}
                                            className="flex-1"
                                        >
                                            <Copy className="w-4 h-4 mr-2" />
                                            Copier
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={handleDownloadBackupCodes}
                                            className="flex-1"
                                        >
                                            <Download className="w-4 h-4 mr-2" />
                                            Télécharger
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>

                            <Alert variant="destructive">
                                <AlertDescription>
                                    ⚠️ Ces codes ne seront plus affichés. Assurez-vous de les sauvegarder maintenant.
                                </AlertDescription>
                            </Alert>

                            <Button onClick={handleComplete} className="w-full">
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                Terminer la configuration
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
