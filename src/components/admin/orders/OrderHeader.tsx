import { Button } from "@/components/ui/button";
import { History } from "lucide-react";
import { useTenantNavigate } from "@/hooks/useTenantNavigate";

interface OrderHeaderProps {
    title: string;
    description: string;
}

export const OrderHeader = ({ title, description }: OrderHeaderProps) => {
    const navigate = useTenantNavigate();

    return (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
                <h1 className="text-2xl font-display font-bold text-foreground">{title}</h1>
                <p className="text-muted-foreground">{description}</p>
            </div>
            <Button
                variant="outline"
                className="gap-2"
                onClick={() => navigate("/admin/orders/history")}
            >
                <History className="h-4 w-4" />
                Historique
            </Button>
        </div>
    );
};
