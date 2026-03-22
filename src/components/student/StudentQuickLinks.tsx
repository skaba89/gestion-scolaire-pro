import { Link } from "react-router-dom";
import { LucideIcon } from "lucide-react";
import { StaggerContainer, StaggerItem } from "@/components/ui/stagger-container";

interface QuickLink {
    href: string;
    label: string;
    icon: LucideIcon;
}

interface StudentQuickLinksProps {
    links: QuickLink[];
}

export const StudentQuickLinks = ({ links }: StudentQuickLinksProps) => {
    return (
        <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {links.map((link, idx) => (
                <StaggerItem key={link.href} index={idx}>
                    <Link
                        to={link.href}
                        className="card-elevated p-4 flex items-center gap-3 group h-full"
                    >
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                            <link.icon className="w-5 h-5 text-primary group-hover:text-primary-foreground" />
                        </div>
                        <span className="font-medium text-sm">{link.label}</span>
                    </Link>
                </StaggerItem>
            ))}
        </StaggerContainer>
    );
};
