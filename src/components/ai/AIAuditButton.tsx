import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Brain, Loader2, AlertTriangle, Lightbulb, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { auditModule, type AuditResponse } from "@/queries/ai";
import { cn } from "@/lib/utils";

// ── Props ────────────────────────────────────────────────────────────────────

interface AIAuditButtonProps {
  /** The module name sent to the audit endpoint (e.g. "students", "finances") */
  module: string;
  /** Arbitrary data context forwarded to the AI for analysis */
  data: Record<string, unknown>;
  /** Optional custom label for the button */
  label?: string;
  /** Optional custom button variant */
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
  /** Optional extra CSS class on the trigger button */
  className?: string;
  /** Optional button size */
  size?: "default" | "sm" | "lg" | "icon";
  /** Whether to render as just the button (without DialogTrigger wrapper) */
  asChild?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

export const AIAuditButton = ({
  module,
  data,
  label = "Audit IA",
  variant = "outline",
  className,
  size = "sm",
}: AIAuditButtonProps) => {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AuditResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAudit = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const auditResult = await auditModule(module, data);
      setResult(auditResult);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Impossible de réaliser l'audit. Veuillez réessayer.";

      setError(message);
      toast.error("Erreur lors de l'audit IA.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = (isOpen: boolean) => {
    setOpen(isOpen);
    // Reset state when dialog closes
    if (!isOpen) {
      // Keep last result visible until next open
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={cn("gap-2", className)}
          onClick={() => {
            setOpen(true);
            // Trigger audit immediately when dialog opens
            handleAudit();
          }}
        >
          <Brain className="h-4 w-4" />
          {label}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-violet-600" />
            Audit IA — {module}
          </DialogTitle>
          <DialogDescription>
            Analyse intelligente des données du module{" "}
            <Badge variant="secondary" className="ml-1">
              {module}
            </Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          {/* ── Loading State ── */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-violet-200 dark:bg-violet-900/30 animate-ping opacity-20" />
                <Loader2 className="h-10 w-10 animate-spin text-violet-600" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  Analyse en cours…
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  L'IA examine les données du module
                </p>
              </div>
            </div>
          )}

          {/* ── Error State ── */}
          {!isLoading && error && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-destructive">
                  Erreur d'analyse
                </p>
                <p className="text-xs text-muted-foreground mt-1">{error}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={handleAudit}
              >
                Réessayer
              </Button>
            </div>
          )}

          {/* ── Result ── */}
          {!isLoading && !error && result && (
            <div className="space-y-4">
              {/* Score indicator (if provided) */}
              {result.score !== undefined && (
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center",
                      result.score >= 80
                        ? "bg-green-100 dark:bg-green-900/30"
                        : result.score >= 50
                          ? "bg-yellow-100 dark:bg-yellow-900/30"
                          : "bg-red-100 dark:bg-red-900/30",
                    )}
                  >
                    {result.score >= 80 ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertTriangle
                        className={cn(
                          "h-5 w-5",
                          result.score >= 50
                            ? "text-yellow-600"
                            : "text-red-600",
                        )}
                      />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">Score global</p>
                    <p className="text-2xl font-bold">
                      {result.score}
                      <span className="text-sm font-normal text-muted-foreground">
                        /100
                      </span>
                    </p>
                  </div>
                </div>
              )}

              {/* Analysis text */}
              <ScrollArea className="max-h-[300px]">
                <div className="pr-4">
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <Brain className="h-4 w-4 text-violet-600" />
                    Analyse
                  </h4>
                  <div className="text-sm text-foreground/90 whitespace-pre-line leading-relaxed bg-muted/30 rounded-lg p-3">
                    {result.analysis}
                  </div>
                </div>
              </ScrollArea>

              {/* Recommendations */}
              {result.recommendations && result.recommendations.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    Recommandations ({result.recommendations.length})
                  </h4>
                  <ul className="space-y-2">
                    {result.recommendations.map((rec, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-foreground/90 bg-muted/30 rounded-lg p-2.5"
                      >
                        <Badge
                          variant="secondary"
                          className="flex-shrink-0 mt-0.5 h-5 w-5 p-0 flex items-center justify-center text-xs"
                        >
                          {i + 1}
                        </Badge>
                        <span className="leading-relaxed">{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAudit}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : null}
                  Rafraîchir l'analyse
                </Button>
                <Button
                  size="sm"
                  onClick={() => setOpen(false)}
                  className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white border-0"
                >
                  Fermer
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AIAuditButton;
