import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';

interface TwoFactorChallengeProps {
    onSuccess: () => void;
}

export const TwoFactorChallenge: React.FC<TwoFactorChallengeProps> = ({ onSuccess }) => {
    const { verifyMfa, signOut } = useAuth();
    const [code, setCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const { success, error } = await verifyMfa(code);
            if (success) {
                onSuccess();
            } else {
                toast.error(error || "Code incorrect");
            }
        } catch (err) {
            toast.error("Erreur de vérification");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex h-screen w-full items-center justify-center bg-gray-50">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1">
                    <div className="flex justify-center mb-4">
                        <div className="p-3 bg-blue-100 rounded-full">
                            <Lock className="w-8 h-8 text-blue-600" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl text-center">Double Authentification</CardTitle>
                    <CardDescription className="text-center">
                        Entrez le code à 6 chiffres de votre application d'authentification.
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="code">Code de vérification</Label>
                            <Input
                                id="code"
                                placeholder="000000"
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                className="text-center text-2xl tracking-widest"
                                autoFocus
                                autoComplete="one-time-code"
                            />
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col space-y-2">
                        <Button type="submit" className="w-full" disabled={code.length !== 6 || isLoading}>
                            {isLoading ? "Vérification..." : "Vérifier"}
                        </Button>
                        <Button variant="ghost" type="button" className="w-full" onClick={() => signOut()}>
                            Annuler et se déconnecter
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
};
