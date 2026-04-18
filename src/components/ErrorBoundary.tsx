import { Component, ReactNode } from 'react';
import { AlertCircle, Home, RotateCcw, RefreshCw, Wifi } from 'lucide-react';
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
  isChunkError: boolean;
  autoReloading: boolean;
  countdown: number;
}

/** Detect "Failed to fetch dynamically imported module" errors (stale deployment) */
function isChunkLoadError(error: Error): boolean {
  const msg = error.message || '';
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Loading chunk') ||
    msg.includes('Loading CSS chunk') ||
    msg.includes('ChunkLoadError') ||
    msg.includes('MIME type') ||
    (error.name === 'TypeError' && msg.includes('dynamically imported'))
  );
}

/**
 * Error Boundary component for graceful error handling.
 * - Detects chunk load errors (stale deployment / new build) and auto-reloads.
 * - Provides fallback UI and error recovery options for all other errors.
 */
export class ErrorBoundary extends Component<Props, State> {
  private resetTimer: ReturnType<typeof setTimeout> | null = null;
  private autoReloadTimer: ReturnType<typeof setTimeout> | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorCount: 0,
      isChunkError: false,
      autoReloading: false,
      countdown: 3,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
      isChunkError: isChunkLoadError(error),
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught:', error, errorInfo);
    }

    const chunkError = isChunkLoadError(error);

    this.setState(prev => ({
      errorCount: prev.errorCount + 1,
      isChunkError: chunkError,
    }));

    this.props.onError?.(error, errorInfo);

    if (import.meta.env.PROD) {
      console.error('UI Error:', error.message);
    } else {
      console.error('Development error:', { message: error.message, stack: error.stack });
    }

    // Auto-reload ONCE on chunk errors (caused by stale deployment / new Render build)
    if (chunkError && !sessionStorage.getItem('__chunk_reload_v2__')) {
      sessionStorage.setItem('__chunk_reload_v2__', '1');
      let secs = 3;
      this.setState({ autoReloading: true, countdown: secs });

      this.countdownTimer = setInterval(() => {
        secs -= 1;
        this.setState({ countdown: secs });
        if (secs <= 0 && this.countdownTimer) {
          clearInterval(this.countdownTimer);
        }
      }, 1000);

      this.autoReloadTimer = setTimeout(() => {
        // Clear all caches before reloading to get fresh chunks
        if (window.caches) {
          window.caches.keys()
            .then(keys => Promise.all(keys.map(k => window.caches.delete(k))))
            .finally(() => window.location.reload());
        } else {
          window.location.reload();
        }
      }, 3000);
    }
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      isChunkError: false,
      autoReloading: false,
      countdown: 3,
    });
  };

  private handleHardReload = () => {
    sessionStorage.removeItem('__chunk_reload_v2__');
    if (window.caches) {
      window.caches.keys()
        .then(keys => Promise.all(keys.map(k => window.caches.delete(k))))
        .finally(() => window.location.reload());
    } else {
      window.location.reload();
    }
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  componentWillUnmount() {
    if (this.resetTimer) clearTimeout(this.resetTimer);
    if (this.autoReloadTimer) clearTimeout(this.autoReloadTimer);
    if (this.countdownTimer) clearInterval(this.countdownTimer);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    const { isChunkError, autoReloading, countdown, error, errorCount } = this.state;

    // ── Chunk load error UI ─────────────────────────────────────────────────
    if (isChunkError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-xl shadow-xl p-8 text-center">
            <div className="flex justify-center mb-5">
              <div className="p-4 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                <Wifi className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
            </div>

            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              Nouvelle version disponible
            </h2>
            <p className="text-slate-600 dark:text-slate-300 text-sm mb-6">
              L'application a été mise à jour. La page va se recharger automatiquement
              pour charger la nouvelle version.
            </p>

            {autoReloading && (
              <div className="mb-6 flex items-center justify-center gap-3 text-blue-600 dark:text-blue-400">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span className="text-sm font-medium">
                  Rechargement dans {countdown}s...
                </span>
              </div>
            )}

            <Button
              onClick={this.handleHardReload}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Recharger maintenant
            </Button>

            <p className="text-xs text-slate-400 mt-4">
              Si le problème persiste, videz le cache de votre navigateur (Ctrl+Shift+R).
            </p>
          </div>
        </div>
      );
    }

    // ── Generic error UI ────────────────────────────────────────────────────
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-xl shadow-xl p-8">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-red-100 dark:bg-red-900/30 rounded-full">
              <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-center text-slate-900 dark:text-white mb-2">
            Une erreur est survenue
          </h2>

          <p className="text-center text-slate-600 dark:text-slate-300 mb-6">
            Une erreur inattendue s'est produite. Veuillez essayer l'une des options ci-dessous.
          </p>

          {import.meta.env.DEV && error && (
            <div className="mb-6 p-4 bg-slate-100 dark:bg-slate-700 rounded text-sm overflow-auto max-h-32">
              <p className="font-mono text-red-600 dark:text-red-400 break-words text-xs">
                {error.message}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                Erreur #{errorCount}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <Button
              onClick={this.handleReset}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Réessayer
            </Button>

            <Button
              onClick={this.handleHardReload}
              variant="outline"
              className="w-full flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Recharger la page
            </Button>

            <Button
              onClick={this.handleGoHome}
              variant="ghost"
              className="w-full flex items-center justify-center gap-2"
            >
              <Home className="w-4 h-4" />
              Retour à l'accueil
            </Button>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-6">
            Si le problème persiste, contactez le support ou videz le cache (Ctrl+Shift+R).
          </p>
        </div>
      </div>
    );
  }
}
