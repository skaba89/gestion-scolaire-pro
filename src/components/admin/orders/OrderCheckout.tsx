import { CreditCard, Wallet, Banknote, ShoppingCart, Loader2, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/hooks/useCurrency";

interface OrderCheckoutProps {
    total: number;
    paymentMethod: string;
    onPaymentMethodChange: (value: string) => void;
    onSubmit: () => void;
    isSubmitting: boolean;
    isDisabled: boolean;
}

export const OrderCheckout = ({
    total,
    paymentMethod,
    onPaymentMethodChange,
    onSubmit,
    isSubmitting,
    isDisabled
}: OrderCheckoutProps) => {
    const { formatCurrency } = useCurrency();

    const paymentMethods = [
        { id: "CASH", label: "Espèces", icon: Wallet },
        { id: "CARD", label: "Carte Bancaire", icon: CreditCard },
        { id: "TRANSFER", label: "Virement", icon: Landmark },
        { id: "OTHER", label: "Autre", icon: Banknote },
    ];

    return (
        <Card className="border-primary/20 shadow-lg bg-card/80 backdrop-blur-xl relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/50 via-primary to-primary/50"></div>
            <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-primary" />
                    Paiement
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 flex flex-col items-center justify-center space-y-1">
                    <span className="text-xs font-bold text-primary/60 uppercase tracking-wider">Total à payer</span>
                    <span className="text-3xl font-black text-primary drop-shadow-sm">{formatCurrency(total)}</span>
                </div>

                <div className="space-y-3">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Mode de règlement</label>
                    <Select value={paymentMethod} onValueChange={onPaymentMethodChange}>
                        <SelectTrigger className="h-12 rounded-xl bg-background/50 border-primary/10 focus:ring-primary/20 transition-all">
                            <SelectValue placeholder="Choisir le règlement" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-primary/10">
                            {paymentMethods.map((method) => (
                                <SelectItem key={method.id} value={method.id} className="rounded-lg h-10">
                                    <div className="flex items-center gap-3">
                                        <method.icon className="h-4 w-4 text-primary" />
                                        <span className="font-medium">{method.label}</span>
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="pt-2">
                    <div className="flex justify-between text-xs font-medium mb-1">
                        <span className="text-muted-foreground">Taxes (incl.)</span>
                        <span>{formatCurrency(0)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-medium">
                        <span className="text-muted-foreground">Frais de dossier</span>
                        <span>{formatCurrency(0)}</span>
                    </div>
                </div>
            </CardContent>
            <CardFooter className="pt-4 pb-6">
                <Button
                    className="w-full h-14 rounded-2xl text-base font-bold gap-3 shadow-primary/20 hover:shadow-primary/40 transition-all hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]"
                    disabled={isDisabled || isSubmitting}
                    onClick={onSubmit}
                >
                    {isSubmitting ? (
                        <>
                            <Loader2 className="h-5 w-5 animate-spin" />
                            Finalisation...
                        </>
                    ) : (
                        <>
                            <ShoppingCart className="h-5 w-5" />
                            Valider la commande
                        </>
                    )}
                </Button>
            </CardFooter>
        </Card>
    );
};
