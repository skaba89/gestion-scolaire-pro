import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Shield, Cookie, BarChart, Mail, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useConsentCheck } from '@/hooks/useConsentCheck';

interface ConsentType {
    type: 'ESSENTIAL' | 'ANALYTICS' | 'MARKETING' | 'DATA_PROCESSING' | 'MEDICAL_DATA' | 'FINANCIAL_DATA';
    label: string;
    description: string;
    icon: React.ReactNode;
    required: boolean;
}

const CONSENT_TYPES: ConsentType[] = [
    {
        type: 'ESSENTIAL',
        label: 'Cookies essentiels',
        description: 'Nécessaires au fonctionnement de la plateforme (authentification, sécurité). Ces cookies ne peuvent pas être désactivés.',
        icon: <Shield className="h-5 w-5" />,
        required: true,
    },
    {
        type: 'ANALYTICS',
        label: 'Analyse et performance',
        description: 'Nous permettent de comprendre comment vous utilisez la plateforme pour améliorer votre expérience.',
        icon: <BarChart className="h-5 w-5" />,
        required: false,
    },
    {
        type: 'MARKETING',
        label: 'Marketing',
        description: 'Utilisés pour vous proposer du contenu personnalisé et des communications adaptées à vos besoins.',
        icon: <Mail className="h-5 w-5" />,
        required: false,
    },
    {
        type: 'DATA_PROCESSING',
        label: 'Traitement des données',
        description: 'Consentement pour le traitement de vos données personnelles conformément à notre politique de confidentialité.',
        icon: <FileText className="h-5 w-5" />,
        required: false,
    },
];

const CONSENT_VERSION = '1.0';

interface ConsentManagerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConsentGiven?: () => void;
}

export function ConsentManager({ open, onOpenChange, onConsentGiven }: ConsentManagerProps) {
    const [consents, setConsents] = useState<Record<string, boolean>>({
        ESSENTIAL: true, // Always true
        ANALYTICS: false,
        MARKETING: false,
        DATA_PROCESSING: false,
    });
    const [loading, setLoading] = useState(false);
    const [acceptAll, setAcceptAll] = useState(false);

    // Load existing consents
    useEffect(() => {
        if (open) {
            loadExistingConsents();
        }
    }, [open]);

    const loadExistingConsents = async () => {
        try {
            const { data, error } = await supabase.rpc('get_user_consents');

            if (error) {
                console.error('Error loading consents:', error);
                return;
            }

            if (data && Array.isArray(data)) {
                const consentMap: Record<string, boolean> = { ESSENTIAL: true };
                data.forEach((consent: any) => {
                    if (consent.withdrawal_date === null) {
                        consentMap[consent.consent_type] = consent.consent_given;
                    }
                });
                setConsents(consentMap);
            }
        } catch (error) {
            console.error('Error loading consents:', error);
        }
    };

    const handleConsentChange = (type: string, value: boolean) => {
        if (type === 'ESSENTIAL') return; // Cannot change essential
        setConsents(prev => ({ ...prev, [type]: value }));
        setAcceptAll(false);
    };

    const handleAcceptAll = () => {
        const allConsents: Record<string, boolean> = {};
        CONSENT_TYPES.forEach(ct => {
            allConsents[ct.type] = true;
        });
        setConsents(allConsents);
        setAcceptAll(true);
    };

    const handleRejectOptional = () => {
        setConsents({
            ESSENTIAL: true,
            ANALYTICS: false,
            MARKETING: false,
            DATA_PROCESSING: false,
        });
        setAcceptAll(false);
    };

    const handleSaveConsents = async () => {
        setLoading(true);
        try {
            // Record each consent
            const promises = Object.entries(consents).map(([type, given]) =>
                supabase.rpc('record_user_consent', {
                    p_consent_type: type,
                    p_consent_given: given,
                    p_consent_version: CONSENT_VERSION,
                    p_details: {
                        timestamp: new Date().toISOString(),
                        source: 'consent_manager',
                    },
                })
            );

            const results = await Promise.all(promises);

            // Check for errors
            const errors = results.filter(r => r.error);
            if (errors.length > 0) {
                console.error('Supabase RPC errors:', errors.map(r => r.error));
                console.error('Detailed errors:', JSON.stringify(errors, null, 2));
                throw new Error(`Failed to save ${errors.length} consent(s): ${errors[0].error?.message || 'Unknown error'}`);
            }

            toast.success('Préférences de confidentialité enregistrées', {
                description: 'Vos choix ont été sauvegardés avec succès.',
            });

            onOpenChange(false);
            onConsentGiven?.();
        } catch (error) {
            console.error('Error saving consents:', error);
            toast.error('Erreur lors de l\'enregistrement', {
                description: 'Impossible de sauvegarder vos préférences. Veuillez réessayer.',
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh]">
                <DialogHeader>
                    <div className="flex items-center gap-2">
                        <Cookie className="h-6 w-6 text-primary" />
                        <DialogTitle>Gestion de la confidentialité</DialogTitle>
                    </div>
                    <DialogDescription>
                        Nous respectons votre vie privée. Choisissez les types de données que vous acceptez de partager.
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="max-h-[50vh] pr-4">
                    <div className="space-y-4">
                        {CONSENT_TYPES.map((consentType) => (
                            <div
                                key={consentType.type}
                                className={`flex items-start gap-4 p-4 rounded-lg border ${consentType.required ? 'bg-muted/50' : 'bg-background'
                                    }`}
                            >
                                <div className="mt-1 text-primary">{consentType.icon}</div>
                                <div className="flex-1 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label
                                            htmlFor={consentType.type}
                                            className="text-base font-semibold cursor-pointer"
                                        >
                                            {consentType.label}
                                            {consentType.required && (
                                                <span className="ml-2 text-xs text-muted-foreground">(Obligatoire)</span>
                                            )}
                                        </Label>
                                        <Checkbox
                                            id={consentType.type}
                                            checked={consents[consentType.type] || false}
                                            onCheckedChange={(checked) =>
                                                handleConsentChange(consentType.type, checked as boolean)
                                            }
                                            disabled={consentType.required || loading}
                                        />
                                    </div>
                                    <p className="text-sm text-muted-foreground">{consentType.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <Separator className="my-6" />

                    <div className="space-y-2 text-sm text-muted-foreground">
                        <p>
                            <strong>Vos droits RGPD :</strong> Vous pouvez à tout moment modifier vos préférences,
                            demander l'export de vos données ou exercer votre droit à l'oubli dans les paramètres
                            de votre compte.
                        </p>
                        <p>
                            Pour plus d'informations, consultez notre{' '}
                            <a href="/legal/privacy" className="text-primary hover:underline">
                                politique de confidentialité
                            </a>
                            .
                        </p>
                    </div>
                </ScrollArea>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                    <Button
                        variant="outline"
                        onClick={handleRejectOptional}
                        disabled={loading}
                        className="w-full sm:w-auto"
                    >
                        Refuser les cookies optionnels
                    </Button>
                    <div className="flex gap-2 w-full sm:w-auto">
                        <Button
                            variant="secondary"
                            onClick={handleAcceptAll}
                            disabled={loading}
                            className="flex-1 sm:flex-initial"
                        >
                            Tout accepter
                        </Button>
                        <Button
                            onClick={handleSaveConsents}
                            disabled={loading}
                            className="flex-1 sm:flex-initial"
                        >
                            {loading ? 'Enregistrement...' : 'Enregistrer mes choix'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

