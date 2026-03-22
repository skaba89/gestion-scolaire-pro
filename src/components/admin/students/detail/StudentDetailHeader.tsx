import { Button } from "@/components/ui/button";
import { ArrowLeft, Edit } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTenantUrl } from "@/hooks/useTenantUrl";

interface StudentDetailHeaderProps {
    title: string;
    subtitle: string;
    onEditClick: () => void;
}

export function StudentDetailHeader({ title, subtitle, onEditClick }: StudentDetailHeaderProps) {
    const navigate = useNavigate();
    const { getTenantUrl } = useTenantUrl();

    return (
        <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => navigate(getTenantUrl("/admin/students"))}>
                <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
                <h1 className="text-2xl font-bold">{title}</h1>
                <p className="text-muted-foreground">{subtitle}</p>
            </div>
            <div className="ml-auto">
                <Button onClick={onEditClick} variant="outline" className="gap-2">
                    <Edit className="h-4 w-4" />
                    Modifier le Profil
                </Button>
            </div>
        </div>
    );
}
