import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Shield, Smartphone, Copy, Check, Trash2, Mail, RefreshCw, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useTenant } from '@/contexts/TenantContext';
import {
    useMFAStatus,
    useToggleMFA,
    useRequestOTP,
    useVerifyOTP,
    useGenerateBackupCodes,
    useBackupCodes
} from '@/hooks/queries/use2FA';

export const SecuritySettings: React.FC = () => {
    const { user } = useAuth();
    const { tenant } = useTenant();

    const { data: mfaStatus, isLoading: isLoadingStatus } = useMFAStatus();
    const toggleMfa = useToggleMFA();
    const requestOtp = useRequestOTP();
    const verifyOtp = useVerifyOTP();
    const generateBackupCodes = useGenerateBackupCodes();
    const { data: backupCodes } = useBackupCodes();

    const [isSetupOpen, setIsSetupOpen] = useState(false);
    const [verificationCode, setVerificationCode] = useState('');
    const [showBackupCodes, setShowBackupCodes] = useState(false);
    const [lastGeneratedCodes, setLastGeneratedCodes] = useState<string[]>([]);

    const handleStartSetup = async () => {
        try {
            await requestOtp.mutateAsync();
            setIsSetupOpen(true);
        } catch (error) {
            // Error handled by mutation
        }
    };

    const handleVerifyAndEnable = async () => {
        try {
            const res = await verifyOtp.mutateAsync(verificationCode);
            if (res.valid) {
                await toggleMfa.mutateAsync(true);
                setIsSetupOpen(false);
                setVerificationCode('');
                // Offer to generate backup codes
                const codesRes = await generateBackupCodes.mutateAsync();
                setLastGeneratedCodes(codesRes.codes);
                setShowBackupCodes(true);
            }
        } catch (error) {
            // Error handled by mutation
        }
    };

    const handleDisableMFA = async () => {
        if (!confirm("Voulez-vous vraiment désactiver la double authentification ? Cela rendra votre compte moins sécurisé.")) return;
        try {
            await toggleMfa.mutateAsync(false);
            setShowBackupCodes(false);
        } catch (error) {
            // Error handled by mutation
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Shield className="w-5 h-5 text-blue-600" />
                        <CardTitle>Sécurité du compte</CardTitle>
                    </div>
                    <CardDescription>Gérez vos préférences de sécurité et la double authentification.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="space-y-1">
                            <Label className="text-base font-medium">Double Authentification (MFA)</Label>
                            <p className="text-sm text-gray-500">Ajoutez une couche de sécurité supplémentaire via code envoyé par email.</p>
                        </div>
                        <Switch
                            checked={mfaStatus?.enabled || false}
                            onCheckedChange={(checked) => {
                                if (checked) handleStartSetup();
                                else handleDisableMFA();
                            }}
                            disabled={isLoadingStatus || toggleMfa.isPending}
                        />
                    </div>

                    {isSetupOpen && (
                        <div className="p-6 border rounded-lg bg-slate-50 space-y-6 animate-in fade-in slide-in-from-top-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-100 rounded-lg">
                                    <Mail className="w-5 h-5 text-blue-600" />
                                </div>
                                <h3 className="text-lg font-medium">Vérification de l'email</h3>
                            </div>
                            
                            <p className="text-sm text-muted-foreground">
                                Un code de vérification à 6 chiffres a été envoyé à <strong>{user?.email}</strong>. 
                                Veuillez le saisir ci-dessous pour activer le MFA.
                            </p>

                            <div className="max-w-xs space-y-4">
                                <div className="space-y-2">
                                    <Label>Code de vérification</Label>
                                    <Input
                                        placeholder="000000"
                                        value={verificationCode}
                                        onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        className="text-center text-2xl tracking-[0.5em] font-mono h-12"
                                    />
                                </div>
                                <Button
                                    className="w-full"
                                    onClick={handleVerifyAndEnable}
                                    disabled={verificationCode.length !== 6 || verifyOtp.isPending}
                                >
                                    {verifyOtp.isPending ? "Vérification..." : "Vérifier et Activer"}
                                </Button>
                                <div className="flex justify-between gap-2">
                                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => requestOtp.mutate()}>
                                        Renvoyer le code
                                    </Button>
                                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => setIsSetupOpen(false)}>
                                        Annuler
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {mfaStatus?.enabled && (
                        <div className="space-y-4">
                            <Alert className="bg-green-50 text-green-800 border-green-200">
                                <Check className="h-4 w-4" />
                                <AlertTitle>Sécurisé</AlertTitle>
                                <AlertDescription>
                                    La double authentification est active. Un code vous sera demandé lors de vos prochaines connexions.
                                </AlertDescription>
                            </Alert>

                            <Card className="border-dashed border-2">
                                <CardHeader className="pb-3">
                                    <div className="flex justify-between items-center">
                                        <CardTitle className="text-md">Codes de secours</CardTitle>
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            onClick={() => generateBackupCodes.mutate()}
                                            disabled={generateBackupCodes.isPending}
                                        >
                                            <RefreshCw className={`w-3 h-3 mr-2 ${generateBackupCodes.isPending ? 'animate-spin' : ''}`} />
                                            Régénérer
                                        </Button>
                                    </div>
                                    <CardDescription>
                                        Utilisez ces codes si vous n'avez plus accès à votre boîte email. 
                                        Chaque code ne peut être utilisé qu'une seule fois.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {showBackupCodes && lastGeneratedCodes.length > 0 ? (
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-2 gap-2 font-mono text-sm bg-muted p-4 rounded-lg border">
                                                {lastGeneratedCodes.map((code, i) => (
                                                    <div key={i} className="flex justify-between items-center group">
                                                        <span>{code}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="flex gap-2">
                                                <Button size="sm" variant="outline" className="w-full" onClick={() => {
                                                    navigator.clipboard.writeText(lastGeneratedCodes.join('\n'));
                                                    toast.success("Codes copiés");
                                                }}>
                                                    <Copy className="w-3 h-3 mr-2" /> Copier
                                                </Button>
                                                <Button size="sm" variant="outline" className="w-full" onClick={() => window.print()}>
                                                    Imprimer
                                                </Button>
                                            </div>
                                            <Alert variant="destructive" className="py-2">
                                                <AlertTriangle className="h-4 w-4" />
                                                <AlertDescription className="text-xs">
                                                    Assurez-vous de stocker ces codes dans un endroit sûr. Ils ne seront plus affichés.
                                                </AlertDescription>
                                            </Alert>
                                        </div>
                                    ) : (
                                        <Button variant="link" className="px-0" onClick={() => {
                                            if (confirm("Générer de nouveaux codes ? Les anciens ne fonctionneront plus.")) {
                                                generateBackupCodes.mutate().then(res => {
                                                    setLastGeneratedCodes(res.codes);
                                                    setShowBackupCodes(true);
                                                });
                                            }
                                        }}>
                                            Afficher les codes de secours
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

