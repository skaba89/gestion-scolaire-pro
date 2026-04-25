import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  eventId: string | null;
}

export class PortalErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, eventId: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, eventId: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    let eventId: string | null = null;
    if (typeof window !== "undefined" && (window as unknown as { Sentry?: { captureException: (e: Error, opts: object) => string } }).Sentry) {
      const Sentry = (window as unknown as { Sentry: { captureException: (e: Error, opts: object) => string } }).Sentry;
      eventId = Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
    } else {
      console.error("[PortalErrorBoundary]", error, info.componentStack);
    }
    this.setState({ eventId });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, eventId: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 p-8 text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Une erreur inattendue s'est produite</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              {this.state.error?.message ?? "Erreur inconnue. Réessayez ou contactez le support."}
            </p>
          </div>
          {this.state.eventId && (
            <p className="text-xs text-muted-foreground font-mono">
              Réf: {this.state.eventId}
            </p>
          )}
          <Button variant="outline" size="sm" onClick={this.handleRetry} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Réessayer
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
