import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
    useMFAFactors,
    useEnrollMFA,
    useChallengeAndVerifyMFA,
    useUnenrollMFA
} from "@/hooks/queries/use2FA";
import { QRCodeSVG } from 'qrcode.react';
import { toast } from "sonner";
import {
    User,
    Shield,
    Mail,
    Phone,
    Lock,
    Key,
    RefreshCw,
    AlertTriangle,
    CheckCircle2,
    Copy,
    Loader2,
    Download
} from "lucide-react";
import { useExportData } from "@/hooks/useExportData";
import { resolveUploadUrl } from "@/utils/url";
import { BackupCodes } from "@/components/auth/BackupCodes";
import { generateBackupCodes } from "@/queries/mfaBackupCodes";

export default function ProfileSettings() {
    const { profile } = useAuth();
    const { tenant } = useTenant();

    // MFA State
    const { data: mfaFactors, isLoading: isLoadingFactors } = useMFAFactors();
    const enrollMFA = useEnrollMFA();
    const verifyMFA = useChallengeAndVerifyMFA();
    const unenrollMFA = useUnenrollMFA();
    const { exportData, isExporting } = useExportData();

    const [isEnrollmentOpen, setIsEnrollmentOpen] = useState(false);
    const [enrollmentData, setEnrollmentData] = useState<any>(null);
    const [verificationCode, setVerificationCode] = useState("");
    const [backupCodes, setBackupCodes] = useState<string[]>([]);
    const [showBackupCodes, setShowBackupCodes] = useState(false);

    // Check if TOTP is enabled (verified factor)
    const totpFactor = mfaFactors?.totp?.find((f: any) => f.status === 'verified');
    const is2FAEnabled = !!totpFactor;

    const handleToggle2FA = async (enabled: boolean) => {
        if (enabled) {
            // Start Enrollment
            try {
                const data = await enrollMFA.mutateAsync();
                setEnrollmentData(data);
                setIsEnrollmentOpen(true);
                setVerificationCode("");
            } catch (error) {
                // Error handled in hook
            }
        } else {
            // Disable MFA
            if (totpFactor) {
                if (window.confirm("Êtes-vous sûr de vouloir désactiver l'authentification à deux facteurs ? Votre compte sera moins sécurisé.")) {
                    unenrollMFA.mutate(totpFactor.id);
                }
            }
        }
    };

    const handleVerifyCode = async () => {
        if (!enrollmentData || !verificationCode) return;

        try {
            await verifyMFA.mutateAsync({
                factorId: enrollmentData.id,
                code: verificationCode
            });
            setIsEnrollmentOpen(false);
            setEnrollmentData(null);
        } catch (error) {
            // Error handled in hook
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("Copié dans le presse-papier");
    };

    const handleGenerateBackupCodes = async () => {
        try {
            const codes = await generateBackupCodes();
            setBackupCodes(codes);
            setShowBackupCodes(true);
            toast.success("Codes de récupération générés avec succès");
        } catch (error: any) {
            toast.error("Erreur lors de la génération des codes: " + error.message);
        }
    };

    const handleRegenerateBackupCodes = async () => {
        if (window.confirm("Êtes-vous sûr de vouloir régénérer vos codes de récupération ? Les anciens codes ne fonctionneront plus.")) {
            await handleGenerateBackupCodes();
        }
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold">Paramètres du profil</h1>
                <p className="text-muted-foreground">Gérez vos informations personnelles et la sécurité de votre compte</p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {/* User Info Card */}
                <Card className="md:col-span-1">
                    <CardHeader className="text-center">
                        <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 border-2 border-primary/20">
                            {profile?.avatar_url ? (
                                <img src={resolveUploadUrl(profile.avatar_url)} alt="Avatar" className="w-full h-full rounded-full object-cover" />
                            ) : (
                                <User className="w-12 h-12 text-primary" />
                            )}
                        </div>
                        <CardTitle>{profile?.first_name} {profile?.last_name}</CardTitle>
                        <CardDescription>{profile?.email}</CardDescription>
                        <div className="mt-2 flex justify-center gap-2">
                            <Badge variant="secondary" className="capitalize">
                                {tenant?.name || "Membre"}
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Button variant="outline" className="w-full gap-2">
                            <RefreshCw className="w-4 h-4" />
                            Changer d'avatar
                        </Button>
                    </CardContent>
                </Card>

                {/* Settings Details */}
                <div className="md:col-span-2 space-y-6">
                    {/* General Information */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <User className="w-5 h-5 text-primary" />
                                Informations générales
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="firstName">Prénom</Label>
                                    <Input id="firstName" value={profile?.first_name || ""} readOnly className="bg-muted/30" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="lastName">Nom</Label>
                                    <Input id="lastName" value={profile?.last_name || ""} readOnly className="bg-muted/30" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input id="email" value={profile?.email || ""} readOnly className="pl-10 bg-muted/30" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="phone">Téléphone</Label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input id="phone" value={profile?.phone || "Non renseigné"} readOnly className="pl-10 bg-muted/30" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Security & 2FA */}
                    <Card className="border-primary/20 shadow-sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Shield className="w-5 h-5 text-primary" />
                                Sécurité du compte
                            </CardTitle>
                            <CardDescription>
                                Protégez votre accès avec l'authentification à deux facteurs
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center justify-between p-4 rounded-lg bg-primary/5 border border-primary/10">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <Lock className="w-4 h-4 text-primary" />
                                        <span className="font-semibold text-primary">Authentification à deux facteurs (2FA)</span>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        Ajoutez une couche de sécurité supplémentaire via une application (Google Authenticator, Authy).
                                    </p>
                                </div>
                                <Switch
                                    checked={is2FAEnabled}
                                    onCheckedChange={handleToggle2FA}
                                    disabled={isLoadingFactors || enrollMFA.isPending || unenrollMFA.isPending}
                                />
                            </div>

                            {is2FAEnabled ? (
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="flex items-center gap-2 p-3 text-sm text-green-700 bg-green-50 border border-green-100 rounded-md">
                                        <CheckCircle2 className="w-4 h-4" />
                                        Votre compte est protégé par 2FA.
                                    </div>

                                    {/* Backup Codes Section */}
                                    <div className="p-4 rounded-lg bg-muted/30 border border-muted">
                                        <div className="flex items-center justify-between mb-3">
                                            <div>
                                                <h4 className="font-semibold text-sm">Codes de récupération</h4>
                                                <p className="text-xs text-muted-foreground">
                                                    Utilisez ces codes si vous perdez l'accès à votre appareil 2FA
                                                </p>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={handleGenerateBackupCodes}
                                                className="gap-2"
                                            >
                                                <Key className="w-4 h-4" />
                                                {backupCodes.length > 0 ? 'Régénérer' : 'Générer'}
                                            </Button>
                                        </div>

                                        {showBackupCodes && backupCodes.length > 0 && (
                                            <BackupCodes
                                                codes={backupCodes}
                                                onRegenerate={handleRegenerateBackupCodes}
                                            />
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-start gap-3 p-3 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-md">
                                    <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                                    <div>
                                        <p className="font-medium">2FA non activé</p>
                                        <p className="opacity-80">Nous vous conseillons vivement d'activer le 2FA pour protéger vos données scolaires sensibles.</p>
                                    </div>
                                </div>
                            )}

                            <Separator />

                            <div className="space-y-4 pt-2">
                                <Label>Mot de passe</Label>
                                <Button variant="outline" className="w-full gap-2">
                                    <Key className="w-4 h-4" />
                                    Modifier le mot de passe
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Privacy & Data Export */}
                    <Card className="border-primary/20 shadow-sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Shield className="w-5 h-5 text-primary" />
                                Confidentialité et Données
                            </CardTitle>
                            <CardDescription>
                                Gérez vos données personnelles et exercez vos droits (RGPD)
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-muted">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <Download className="w-4 h-4 text-primary" />
                                        <span className="font-semibold text-primary">Export des données</span>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        Téléchargez une copie de toutes vos données personnelles (Profil, Notes, Historique).
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    onClick={exportData}
                                    disabled={isExporting}
                                >
                                    {isExporting ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Export en cours...
                                        </>
                                    ) : (
                                        <>
                                            <Download className="mr-2 h-4 w-4" />
                                            Exporter mes données (JSON)
                                        </>
                                    )}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Enrollment Dialog */}
            <Dialog open={isEnrollmentOpen} onOpenChange={setIsEnrollmentOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Configuration 2FA</DialogTitle>
                        <DialogDescription>
                            Scannez le QR code avec votre application d'authentification (Google Authenticator, Microsoft Authenticator, etc.)
                        </DialogDescription>
                    </DialogHeader>

                    {enrollmentData && (
                        <div className="flex flex-col items-center justify-center py-4 space-y-4">
                            <div className="p-4 bg-white rounded-lg shadow-sm border">
                                <QRCodeSVG value={enrollmentData.totp.uri} size={192} />
                            </div>

                            <div className="w-full space-y-2">
                                <Label className="text-xs text-muted-foreground text-center block">
                                    Si vous ne pouvez pas scanner, copiez ce code :
                                </Label>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 p-2 bg-muted rounded text-xs font-mono text-center">
                                        {enrollmentData.totp.secret}
                                    </code>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(enrollmentData.totp.secret)}>
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <Separator />

                            <div className="w-full space-y-2">
                                <Label>Code de validation</Label>
                                <Input
                                    placeholder="000 000"
                                    className="text-center text-lg tracking-widest"
                                    value={verificationCode}
                                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    maxLength={6}
                                />
                                <p className="text-xs text-muted-foreground text-center">
                                    Entrez le code à 6 chiffres généré par votre application
                                </p>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEnrollmentOpen(false)}>Annuler</Button>
                        <Button onClick={handleVerifyCode} disabled={!verificationCode || verifyMFA.isPending}>
                            {verifyMFA.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Vérifier et Activer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
