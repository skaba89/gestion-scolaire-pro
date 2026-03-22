import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";

interface HelpTooltipProps {
    content: string;
}

export function HelpTooltip({ content }: HelpTooltipProps) {
    return (
        <TooltipProvider delayDuration={300}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help ml-2 inline-block align-text-bottom" />
                </TooltipTrigger>
                <TooltipContent>
                    <p className="max-w-xs text-sm">{content}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
