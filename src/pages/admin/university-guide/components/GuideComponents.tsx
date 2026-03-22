import { Info, AlertTriangle, Lightbulb, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const InfoBox = ({ type, children }: { type: "info" | "warning" | "tip"; children: React.ReactNode }) => {
    const styles = {
        info: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300",
        warning: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300",
        tip: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300"
    };
    const icons = {
        info: <Info className="h-5 w-5" />,
        warning: <AlertTriangle className="h-5 w-5" />,
        tip: <Lightbulb className="h-5 w-5" />
    };

    return (
        <div className={`flex gap-3 p-4 rounded-lg border ${styles[type]} my-4 text-left`}>
            {icons[type]}
            <div className="text-sm">{children}</div>
        </div>
    );
};

export const StepList = ({ steps }: { steps: string[] }) => (
    <ol className="space-y-2 my-4 text-left">
        {steps.map((step, index) => (
            <li key={index} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                    {index + 1}
                </span>
                <span className="text-sm pt-0.5">{step}</span>
            </li>
        ))}
    </ol>
);

export const ScreenshotCard = ({ src, alt, caption }: { src: string; alt: string; caption: string }) => (
    <figure className="my-6">
        <div className="rounded-lg overflow-hidden border shadow-lg">
            <img src={src} alt={alt} className="w-full h-auto" />
        </div>
        <figcaption className="text-center text-sm text-muted-foreground mt-2 italic">
            {caption}
        </figcaption>
    </figure>
);
