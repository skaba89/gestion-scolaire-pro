import { Component, ReactNode } from 'react';
import { AlertCircle, Home, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorCount: number;
}

/**
 * Error Boundary component for graceful error handling
 * Prevents entire app crash when components fail
 * Provides fallback UI and error recovery options
 */
export class ErrorBoundary extends Component<Props, State> {
  private resetTimer: NodeJS.Timeout | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to console in development
    if (import.meta.env.DEV) {
      console.error('Error caught by ErrorBoundary:', error, errorInfo);
    }

    // Increment error count
    this.setState(prev => ({
      errorCount: prev.errorCount + 1,
    }));

    // Call optional onError callback
    this.props.onError?.(error, errorInfo);

    // Send error to monitoring service (e.g., Sentry)
    // This is where you'd integrate error tracking
    if (import.meta.env.PROD) {
      // SECURITY: Only log minimal info in production — no stack traces
      console.error('UI Error:', error.message);
      // Full error details sent to Sentry via sentry.ts beforeSend hook
    } else {
      console.error('Development error:', {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
      });
    }
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
    });

    // Auto-reset after showing error for 5 seconds on repeated errors
    if (this.state.errorCount > 3) {
      this.resetTimer = setTimeout(() => {
        this.setState({ errorCount: 0 });
      }, 5000);
    }
  };

  private handleReload = () => {
    window.location.href = '/';
  };

  componentWillUnmount() {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
            <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8">
              {/* Error Icon */}
              <div className="flex justify-center mb-6">
                <div className="p-4 bg-red-100 dark:bg-red-900/30 rounded-full">
                  <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
                </div>
              </div>

              {/* Error Title */}
              <h2 className="text-2xl font-bold text-center text-slate-900 dark:text-white mb-2">
                Une erreur est survenue
              </h2>

              {/* Error Message */}
              <p className="text-center text-slate-600 dark:text-slate-300 mb-6">
                Nous avons rencontré une erreur inattendue. Veuillez essayer l'une des options ci-dessous.
              </p>

              {/* Error Details (Development Only) */}
              {import.meta.env.DEV && this.state.error && (
                <div className="mb-6 p-4 bg-slate-100 dark:bg-slate-700 rounded text-sm">
                  <p className="font-mono text-red-600 dark:text-red-400 break-words">
                    {this.state.error.message}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    Error #{this.state.errorCount}
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col gap-3">
                <Button
                  onClick={this.handleReset}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Réessayer
                </Button>

                <Button
                  onClick={this.handleReload}
                  variant="outline"
                  className="w-full flex items-center justify-center gap-2"
                >
                  <Home className="w-4 h-4" />
                  Retour à l'accueil
                </Button>
              </div>

              {/* Help Text */}
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-6">
                Si le problème persiste, veuillez contacter le support ou vider le cache de votre navigateur.
              </p>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
