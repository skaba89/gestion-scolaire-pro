import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, Mail, RefreshCw, AlertTriangle } from "lucide-react";
import { useSend2FACode, useVerify2FACode } from "@/hooks/queries/use2FA";

interface TwoFactorVerifyProps {
    onVerified: () => void;
    onCancel?: () => void;
}

export const TwoFactorVerify = ({ onVerified, onCancel }: TwoFactorVerifyProps) => {
    const [code, setCode] = useState("");
    const [useBackupCode, setUseBackupCode] = useState(false);
    const [trustDevice, setTrustDevice] = useState(false);
    const [attempts, setAttempts] = useState(0);

    const sendCodeMutation = useSend2FACode();
    const verifyCodeMutation = useVerify2FACode();

    const handleVerify = async () => {
        try {
            await verifyCodeMutation.mutateAsync({ code });

            // If trustDevice is true, save device fingerprint
            if (trustDevice) {
                const { supabase } = await import("@/integrations/supabase/client");
                const { user } = await supabase.auth.getUser();

                if (user.user) {
                    const fingerprint = btoa(navigator.userAgent + navigator.language + screen.colorDepth);
                    const expiresAt = new Date();
                    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

                    await supabase.from("trusted_devices").insert({
                        user_id: user.user.id,
                        device_name: navigator.userAgent.split(') ')[0].split(' (')[1] || "Unknown Device",
                        device_fingerprint: fingerprint,
                        expires_at: expiresAt.toISOString()
                    });
                }
            }

            onVerified();
        } catch (error) {
            setAttempts(prev => prev + 1);
            setCode("");
        }
    };

    const handleResendCode = async () => {
        await sendCodeMutation.mutateAsync();
        setCode("");
    };

    const isLocked = attempts >= 5;

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                        <Shield className="w-6 h-6 text-primary" />
                    </div>
                    <CardTitle>Vérification en deux étapes</CardTitle>
                    <CardDescription>
                        {useBackupCode
                            ? "Entrez un code de récupération"
                            : "Entrez le code envoyé à votre email"}
                    </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                    {isLocked && (
                        <Alert variant="destructive">
                            <AlertTriangle className="w-4 h-4" />
                            <AlertDescription>
                                Trop de tentatives échouées. Veuillez réessayer dans 15 minutes.
                            </AlertDescription>
                        </Alert>
                    )}

                    {!isLocked && (
                        <>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">
                                    {useBackupCode ? "Code de récupération" : "Code de vérification"}
                                </label>
                                <Input
                                    type="text"
                                    placeholder={useBackupCode ? "XXXX-XXXX-XXXX" : "000000"}
                                    value={code}
                                    onChange={(e) => {
                                        if (useBackupCode) {
                                            setCode(e.target.value.toUpperCase());
                                        } else {
                                            setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                                        }
                                    }}
                                    className="text-center text-2xl tracking-widest font-mono"
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && code.length >= 6) {
                                            handleVerify();
                                        }
                                    }}
                                />
                                {!useBackupCode && (
                                    <p className="text-xs text-muted-foreground text-center">
                                        Le code expire dans 5 minutes
                                    </p>
                                )}
                            </div>

                            {attempts > 0 && (
                                <Alert variant="destructive">
                                    <AlertDescription>
                                        Code incorrect. {5 - attempts} tentative(s) restante(s).
                                    </AlertDescription>
                                </Alert>
                            )}

                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="trust-device"
                                    checked={trustDevice}
                                    onCheckedChange={(checked) => setTrustDevice(checked as boolean)}
                                />
                                <label
                                    htmlFor="trust-device"
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                    Faire confiance à cet appareil pendant 30 jours
                                </label>
                            </div>

                            <Button
                                onClick={handleVerify}
                                disabled={
                                    (useBackupCode ? code.length < 12 : code.length !== 6) ||
                                    verifyCodeMutation.isPending
                                }
                                className="w-full"
                            >
                                {verifyCodeMutation.isPending ? "Vérification..." : "Vérifier"}
                            </Button>

                            <div className="space-y-2">
                                {!useBackupCode && (
                                    <Button
                                        variant="outline"
                                        onClick={handleResendCode}
                                        disabled={sendCodeMutation.isPending}
                                        className="w-full"
                                    >
                                        <RefreshCw className={`w-4 h-4 mr-2 ${sendCodeMutation.isPending ? "animate-spin" : ""}`} />
                                        Renvoyer le code
                                    </Button>
                                )}

                                <Button
                                    variant="ghost"
                                    onClick={() => {
                                        setUseBackupCode(!useBackupCode);
                                        setCode("");
                                    }}
                                    className="w-full"
                                >
                                    {useBackupCode
                                        ? "Utiliser un code par email"
                                        : "Utiliser un code de récupération"}
                                </Button>

                                {onCancel && (
                                    <Button
                                        variant="ghost"
                                        onClick={onCancel}
                                        className="w-full text-muted-foreground"
                                    >
                                        Annuler
                                    </Button>
                                )}
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};
