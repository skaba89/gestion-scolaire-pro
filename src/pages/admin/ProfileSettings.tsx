import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
    const { t } = useTranslation();
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
                if (window.confirm(t("profileSettings.disable2FAConfirm"))) {
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
        toast.success(t("profileSettings.copied"));
    };

    const handleGenerateBackupCodes = async () => {
        try {
            const codes = await generateBackupCodes();
            setBackupCodes(codes);
            setShowBackupCodes(true);
            toast.success(t("profileSettings.backupCodesGenerated"));
        } catch (error: any) {
            toast.error(t("profileSettings.backupCodesError") + error.message);
        }
    };

    const handleRegenerateBackupCodes = async () => {
        if (window.confirm(t("profileSettings.regenCodesConfirm"))) {
            await handleGenerateBackupCodes();
        }
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold">{t("profileSettings.pageTitle")}</h1>
                <p className="text-muted-foreground">{t("profileSettings.pageSubtitle")}</p>
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
                            {t("profileSettings.changeAvatar")}
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
                                {t("profileSettings.generalInfo")}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="firstName">{t("profileSettings.firstName")}</Label>
                                    <Input id="firstName" value={profile?.first_name || ""} readOnly className="bg-muted/30" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="lastName">{t("profileSettings.lastName")}</Label>
                                    <Input id="lastName" value={profile?.last_name || ""} readOnly className="bg-muted/30" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">{t("profileSettings.email")}</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input id="email" value={profile?.email || ""} readOnly className="pl-10 bg-muted/30" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="phone">{t("profileSettings.phone")}</Label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input id="phone" value={profile?.phone || t("profileSettings.phoneNotSet")} readOnly className="pl-10 bg-muted/30" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Security & 2FA */}
                    <Card className="border-primary/20 shadow-sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Shield className="w-5 h-5 text-primary" />
                                {t("profileSettings.securityTitle")}
                            </CardTitle>
                            <CardDescription>
                                {t("profileSettings.securityDesc")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center justify-between p-4 rounded-lg bg-primary/5 border border-primary/10">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <Lock className="w-4 h-4 text-primary" />
                                        <span className="font-semibold text-primary">{t("profileSettings.twoFALabel")}</span>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        {t("profileSettings.twoFADesc")}
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
                                        {t("profileSettings.protectedBy2FA")}
                                    </div>

                                    {/* Backup Codes Section */}
                                    <div className="p-4 rounded-lg bg-muted/30 border border-muted">
                                        <div className="flex items-center justify-between mb-3">
                                            <div>
                                                <h4 className="font-semibold text-sm">{t("profileSettings.backupCodesTitle")}</h4>
                                                <p className="text-xs text-muted-foreground">
                                                    {t("profileSettings.backupCodesDesc")}
                                                </p>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={handleGenerateBackupCodes}
                                                className="gap-2"
                                            >
                                                <Key className="w-4 h-4" />
                                                {backupCodes.length > 0 ? t("profileSettings.regenerate") : t("profileSettings.generate")}
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
                                        <p className="font-medium">{t("profileSettings.twoFADisabled")}</p>
                                        <p className="opacity-80">{t("profileSettings.twoFADisabledDesc")}</p>
                                    </div>
                                </div>
                            )}

                            <Separator />

                            <div className="space-y-4 pt-2">
                                <Label>{t("profileSettings.passwordLabel")}</Label>
                                <Button variant="outline" className="w-full gap-2">
                                    <Key className="w-4 h-4" />
                                    {t("profileSettings.changePassword")}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Privacy & Data Export */}
                    <Card className="border-primary/20 shadow-sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Shield className="w-5 h-5 text-primary" />
                                {t("profileSettings.privacyTitle")}
                            </CardTitle>
                            <CardDescription>
                                {t("profileSettings.privacyDesc")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-muted">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <Download className="w-4 h-4 text-primary" />
                                        <span className="font-semibold text-primary">{t("profileSettings.exportTitle")}</span>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        {t("profileSettings.exportDesc")}
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
                                            {t("profileSettings.exporting")}
                                        </>
                                    ) : (
                                        <>
                                            <Download className="mr-2 h-4 w-4" />
                                            {t("profileSettings.exportButton")}
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
                        <DialogTitle>{t("profileSettings.setup2FATitle")}</DialogTitle>
                        <DialogDescription>
                            {t("profileSettings.setup2FADesc")}
                        </DialogDescription>
                    </DialogHeader>

                    {enrollmentData && (
                        <div className="flex flex-col items-center justify-center py-4 space-y-4">
                            <div className="p-4 bg-white rounded-lg shadow-sm border">
                                <QRCodeSVG value={enrollmentData.totp.uri} size={192} />
                            </div>

                            <div className="w-full space-y-2">
                                <Label className="text-xs text-muted-foreground text-center block">
                                    {t("profileSettings.cantScanLabel")}
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
                                <Label>{t("profileSettings.verificationCodeLabel")}</Label>
                                <Input
                                    placeholder="000 000"
                                    className="text-center text-lg tracking-widest"
                                    value={verificationCode}
                                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    maxLength={6}
                                />
                                <p className="text-xs text-muted-foreground text-center">
                                    {t("profileSettings.verificationCodeHint")}
                                </p>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEnrollmentOpen(false)}>{t("profileSettings.cancel")}</Button>
                        <Button onClick={handleVerifyCode} disabled={!verificationCode || verifyMFA.isPending}>
                            {verifyMFA.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {t("profileSettings.verifyAndActivate")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
