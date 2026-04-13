import * as Sentry from '@sentry/react';

/**
 * Sentry Configuration for SchoolFlow Pro
 * 
 * Environment Variables Required:
 * - VITE_SENTRY_DSN: Sentry Data Source Name
 * - VITE_SENTRY_ENVIRONMENT: Environment (development, staging, production)
 * - VITE_APP_VERSION: Application version for release tracking
 */

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
const ENVIRONMENT = import.meta.env.VITE_SENTRY_ENVIRONMENT || 'development';
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.0.0';

export function initSentry() {
    // Only initialize Sentry if DSN is provided
    if (!SENTRY_DSN) {
        console.warn('Sentry DSN not configured. Error monitoring disabled.');
        return;
    }

    Sentry.init({
        dsn: SENTRY_DSN,
        environment: ENVIRONMENT,
        release: `schoolflow-pro@${APP_VERSION}`,

        // Performance Monitoring
        integrations: [
            Sentry.browserTracingIntegration(),
        ],

        // Sample rate for performance monitoring
        // 1.0 = 100% of transactions, 0.1 = 10%
        tracesSampleRate: ENVIRONMENT === 'production' ? 0.1 : 1.0,

        // Sample rate for error events
        // 1.0 = capture all errors
        sampleRate: 1.0,

        // Before sending events, filter out sensitive data
        beforeSend(event, hint) {
            // Remove sensitive data from breadcrumbs
            if (event.breadcrumbs) {
                event.breadcrumbs = event.breadcrumbs.map(breadcrumb => {
                    if (breadcrumb.data) {
                        // Remove passwords, tokens, etc.
                        const sanitized = { ...breadcrumb.data };
                        ['password', 'token', 'access_token', 'refresh_token', 'api_key'].forEach(key => {
                            if (sanitized[key]) {
                                sanitized[key] = '[REDACTED]';
                            }
                        });
                        return { ...breadcrumb, data: sanitized };
                    }
                    return breadcrumb;
                });
            }

            // Remove sensitive data from request
            if (event.request?.data) {
                const data = event.request.data;
                if (typeof data === 'object') {
                    const sanitized = { ...data };
                    ['password', 'token', 'access_token', 'refresh_token', 'api_key', 'iban', 'medical_notes'].forEach(key => {
                        if (sanitized[key]) {
                            sanitized[key] = '[REDACTED]';
                        }
                    });
                    event.request.data = sanitized;
                }
            }

            return event;
        },

        // Ignore certain errors
        ignoreErrors: [
            // Browser extensions
            'top.GLOBALS',
            'chrome-extension://',
            'moz-extension://',
            // Network errors (handled by app)
            'NetworkError',
            'Failed to fetch',
            // Supabase auth errors (handled by app)
            'Invalid login credentials',
            'Email not confirmed',
        ],

        // Enable debug mode in development
        debug: ENVIRONMENT === 'development',
    });

    return;
}

// Set user context when available
export const setUserContext = (user: { id: string; email?: string; role?: string }) => {
    Sentry.setUser({
        id: user.id,
        email: user.email,
        role: user.role,
    });
};

// Clear user context on logout
export const clearUserContext = () => {
    Sentry.setUser(null);
};

/**
 * Capture a custom error with additional context
 */
export function captureError(error: Error, context?: Record<string, any>) {
    if (context) {
        Sentry.setContext('custom', context);
    }
    Sentry.captureException(error);
}

/**
 * Capture a custom message (non-error event)
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info') {
    Sentry.captureMessage(message, level);
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(message: string, category: string, data?: Record<string, any>) {
    Sentry.addBreadcrumb({
        message,
        category,
        level: 'info',
        data,
    });
}

/**
 * Start a performance span (replaces deprecated startTransaction)
 */
export function startPerformanceSpan(name: string, op: string, callback: () => void | Promise<void>) {
    return Sentry.startSpan({ name, op }, callback);
}

/**
 * Critical business operations monitoring
 */
export const SentryMonitoring = {
    // Payment operations
    trackPayment(amount: number, method: string, success: boolean) {
        addBreadcrumb(
            `Payment ${success ? 'successful' : 'failed'}: ${amount}€ via ${method}`,
            'payment',
            { amount, method, success }
        );

        if (!success) {
            captureMessage(`Payment failed: ${amount}€ via ${method}`, 'warning');
        }
    },

    // Authentication operations
    trackAuth(action: 'login' | 'logout' | 'signup' | 'mfa', success: boolean, error?: string) {
        addBreadcrumb(
            `Auth ${action} ${success ? 'successful' : 'failed'}`,
            'auth',
            { action, success, error }
        );

        if (!success && error) {
            captureMessage(`Auth ${action} failed: ${error}`, 'warning');
        }
    },

    // RLS policy violations
    trackRLSViolation(table: string, operation: string, userId: string) {
        captureMessage(
            `RLS violation: User ${userId} attempted ${operation} on ${table}`,
            'error'
        );
    },

    // Data export (RGPD)
    trackDataExport(userId: string, success: boolean) {
        addBreadcrumb(
            `RGPD data export ${success ? 'successful' : 'failed'} for user ${userId}`,
            'rgpd',
            { userId, success }
        );

        if (!success) {
            captureMessage(`Data export failed for user ${userId}`, 'error');
        }
    },

    // Critical database operations
    trackDatabaseError(operation: string, table: string, error: string) {
        captureMessage(
            `Database error: ${operation} on ${table} - ${error}`,
            'error'
        );
    },

    // Tracking slow queries (e.g. > 2s)
    trackSlowQuery(query: string, duration: number) {
        if (duration > 2000) {
            addBreadcrumb(`Slow query detected: ${duration}ms`, 'db', { query, duration });
            if (duration > 5000) {
                captureMessage(`High latency query: ${query} took ${duration}ms`, 'warning');
            }
        }
    },

    /**
     * Wrap an async operation with a Sentry span and automatic error capture
     */
    async withPerformance<T>(name: string, op: string, fn: () => Promise<T>): Promise<T> {
        return Sentry.startSpan({ name, op }, async () => {
            try {
                const start = performance.now();
                const result = await fn();
                const end = performance.now();

                // If it's a DB operation, track slow queries
                if (op === 'db' || op === 'rpc') {
                    SentryMonitoring.trackSlowQuery(name, end - start);
                }

                return result;
            } catch (error) {
                captureError(error as Error, { operation: name, op });
                throw error;
            }
        });
    }
};

export default Sentry;
