import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, Loader2, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";
import { requestEmailOTP, verifyEmailOTP, getRemainingOTPAttempts } from "@/queries/emailOtp";

interface EmailOTPInputProps {
    email: string;
    onSuccess: () => void;
    onCancel?: () => void;
}

export const EmailOTPInput = ({ email, onSuccess, onCancel }: EmailOTPInputProps) => {
    const [code, setCode] = useState("");
    const [isRequesting, setIsRequesting] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [otpSent, setOtpSent] = useState(false);
    const [remaining, setRemaining] = useState(3);
    const [countdown, setCountdown] = useState(0);

    useEffect(() => {
        loadRemainingAttempts();
    }, []);

    useEffect(() => {
        if (countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [countdown]);

    const loadRemainingAttempts = async () => {
        const attempts = await getRemainingOTPAttempts();
        setRemaining(attempts);
    };

    const handleRequestOTP = async () => {
        if (remaining === 0) {
            toast.error("Limite atteinte. Veuillez patienter 1 heure.");
            return;
        }

        setIsRequesting(true);
        try {
            const result = await requestEmailOTP(email);
            setOtpSent(true);
            setRemaining(result.remaining);
            setCountdown(600); // 10 minutes
            toast.success("Code envoyé par email", {
                description: `Vérifiez votre boîte de réception. ${result.remaining} tentative(s) restante(s).`
            });
        } catch (error: any) {
            toast.error("Erreur", {
                description: error.message || "Impossible d'envoyer le code"
            });
        } finally {
            setIsRequesting(false);
        }
    };

    const handleVerify = async () => {
        if (code.length !== 6) {
            toast.error("Le code doit contenir 6 chiffres");
            return;
        }

        setIsVerifying(true);
        try {
            const valid = await verifyEmailOTP(code);
            if (valid) {
                toast.success("Code vérifié avec succès");
                onSuccess();
            } else {
                toast.error("Code invalide ou expiré", {
                    description: "Vérifiez le code ou demandez-en un nouveau"
                });
                setCode("");
            }
        } catch (error: any) {
            toast.error("Erreur de vérification", {
                description: error.message
            });
        } finally {
            setIsVerifying(false);
        }
    };

    const formatCountdown = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="space-y-4">
            <Alert>
                <Mail className="w-4 h-4" />
                <AlertDescription>
                    Un code à 6 chiffres sera envoyé à <strong>{email}</strong>
                </AlertDescription>
            </Alert>

            {!otpSent ? (
                <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div className="flex items-center gap-2 text-sm">
                            <Clock className="w-4 h-4 text-muted-foreground" />
                            <span>Tentatives restantes : <strong>{remaining}/3</strong></span>
                        </div>
                    </div>

                    <Button
                        onClick={handleRequestOTP}
                        disabled={isRequesting || remaining === 0}
                        className="w-full gap-2"
                        size="lg"
                    >
                        {isRequesting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Envoi en cours...
                            </>
                        ) : (
                            <>
                                <Mail className="w-4 h-4" />
                                Recevoir un code par email
                            </>
                        )}
                    </Button>

                    {onCancel && (
                        <Button
                            variant="outline"
                            onClick={onCancel}
                            className="w-full"
                        >
                            Annuler
                        </Button>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    <Alert className="bg-green-50 border-green-200">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <AlertDescription className="text-green-800">
                            Code envoyé ! Vérifiez votre boîte de réception.
                            {countdown > 0 && (
                                <span className="block mt-1 font-semibold">
                                    Expire dans {formatCountdown(countdown)}
                                </span>
                            )}
                        </AlertDescription>
                    </Alert>

                    <div className="space-y-2">
                        <Label htmlFor="otp-code">Code de vérification</Label>
                        <Input
                            id="otp-code"
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="123456"
                            maxLength={6}
                            className="text-center text-2xl font-mono tracking-widest"
                            autoFocus
                            onKeyPress={(e) => {
                                if (e.key === 'Enter' && code.length === 6) {
                                    handleVerify();
                                }
                            }}
                        />
                        <p className="text-xs text-muted-foreground text-center">
                            Entrez le code à 6 chiffres reçu par email
                        </p>
                    </div>

                    <Button
                        onClick={handleVerify}
                        disabled={isVerifying || code.length !== 6}
                        className="w-full gap-2"
                        size="lg"
                    >
                        {isVerifying ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Vérification...
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="w-4 h-4" />
                                Vérifier le code
                            </>
                        )}
                    </Button>

                    <div className="flex items-center justify-between text-sm">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setOtpSent(false);
                                setCode("");
                            }}
                            disabled={remaining === 0}
                        >
                            Renvoyer un code
                        </Button>
                        {onCancel && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onCancel}
                            >
                                Annuler
                            </Button>
                        )}
                    </div>

                    {remaining === 0 && (
                        <Alert variant="destructive">
                            <AlertTriangle className="w-4 h-4" />
                            <AlertDescription>
                                Limite de 3 codes par heure atteinte. Veuillez patienter avant de demander un nouveau code.
                            </AlertDescription>
                        </Alert>
                    )}
                </div>
            )}
        </div>
    );
};
