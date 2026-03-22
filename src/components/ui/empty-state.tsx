import React from "react";
import { LucideIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
    icon?: LucideIcon;
    title: string;
    description: string;
    action?: {
        label: string;
        onClick: () => void;
    };
    // Legacy support
    actionLabel?: string;
    onAction?: () => void;
    className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    icon: Icon,
    title,
    description,
    action,
    actionLabel,
    onAction,
    className,
}) => {
    const finalActionLabel = action?.label || actionLabel;
    const finalOnAction = action?.onClick || onAction;

    return (
        <div
            className={cn(
                "flex flex-col items-center justify-center p-12 text-center border-2 border-dashed rounded-2xl bg-muted/30 animate-in fade-in zoom-in-95 duration-300",
                className
            )}
        >
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                {Icon ? (
                    <Icon className="w-8 h-8 text-primary" />
                ) : (
                    <div className="w-8 h-8 rounded-full bg-primary/20" />
                )}
            </div>
            <h3 className="text-xl font-semibold mb-2">{title}</h3>
            <p className="text-muted-foreground max-w-sm mb-8">{description}</p>
            {finalActionLabel && finalOnAction && (
                <Button onClick={finalOnAction} className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    {finalActionLabel}
                </Button>
            )}
        </div>
    );
};
