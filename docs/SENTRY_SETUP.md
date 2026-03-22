# Sentry Configuration Guide

## Installation

```bash
npm install --save @sentry/react
```

## Environment Variables

Add to `.env.local`:

```env
# Sentry Configuration
VITE_SENTRY_DSN=https://your-dsn@sentry.io/your-project-id
VITE_SENTRY_ENVIRONMENT=production
VITE_APP_VERSION=1.0.0
```

## Sentry Project Setup

1. **Create Sentry Account**: https://sentry.io/signup/
2. **Create New Project**:
   - Platform: React
   - Alert frequency: On every new issue
3. **Copy DSN**: Settings → Client Keys (DSN)
4. **Configure Alerts**:
   - Go to Alerts → Create Alert Rule
   - Add rules for critical operations (see below)

## Critical Alert Rules

### 1. Payment Failures
- **Condition**: Message contains "Payment failed"
- **Action**: Email to finance@schoolflow.com
- **Frequency**: Immediately

### 2. RLS Violations
- **Condition**: Message contains "RLS violation"
- **Action**: Email to security@schoolflow.com + Slack #security
- **Frequency**: Immediately

### 3. Authentication Failures (Brute Force)
- **Condition**: "Auth login failed" > 5 times in 5 minutes from same IP
- **Action**: Email to security@schoolflow.com
- **Frequency**: Once per hour

### 4. RGPD Export Failures
- **Condition**: Message contains "Data export failed"
- **Action**: Email to dpo@schoolflow.com
- **Frequency**: Immediately

### 5. Database Errors
- **Condition**: Message contains "Database error"
- **Action**: Email to tech@schoolflow.com + PagerDuty
- **Frequency**: Immediately

## Usage Examples

### Track Payment
```typescript
import { SentryMonitoring } from '@/lib/sentry';

// In payment handler
try {
  const result = await processPayment(amount, method);
  SentryMonitoring.trackPayment(amount, method, true);
} catch (error) {
  SentryMonitoring.trackPayment(amount, method, false);
  throw error;
}
```

### Track Authentication
```typescript
import { SentryMonitoring } from '@/lib/sentry';

// In AuthContext
const signIn = async (email: string, password: string) => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      SentryMonitoring.trackAuth('login', false, error.message);
      return { error };
    }
    SentryMonitoring.trackAuth('login', true);
    return { error: null };
  } catch (error) {
    SentryMonitoring.trackAuth('login', false, error.message);
    throw error;
  }
};
```

### Track RLS Violation
```typescript
// In Supabase Edge Function or RLS policy
import { SentryMonitoring } from '@/lib/sentry';

// When RLS policy denies access
SentryMonitoring.trackRLSViolation('students', 'SELECT', userId);
```

### Track RGPD Export
```typescript
import { SentryMonitoring } from '@/lib/sentry';

// In RGPD export handler
try {
  const data = await exportUserData(userId);
  SentryMonitoring.trackDataExport(userId, true);
  return data;
} catch (error) {
  SentryMonitoring.trackDataExport(userId, false);
  throw error;
}
```

## Performance Monitoring

Sentry automatically tracks:
- Page load times
- API call durations
- Component render times
- Navigation timing

### Custom Performance Tracking

```typescript
import { startTransaction } from '@/lib/sentry';

const transaction = startTransaction('invoice-generation', 'task');
try {
  // Generate invoice
  await generateInvoice(invoiceId);
  transaction.setStatus('ok');
} catch (error) {
  transaction.setStatus('internal_error');
  throw error;
} finally {
  transaction.finish();
}
```

## Data Privacy

Sentry configuration automatically redacts:
- Passwords
- Tokens (access_token, refresh_token, api_key)
- IBAN
- Medical notes

**Never log**:
- Full credit card numbers
- Social security numbers
- Unencrypted personal data

## Testing

### Development
```bash
# Sentry is disabled in development by default
# To test, set VITE_SENTRY_DSN in .env.local
```

### Staging
```bash
# Use separate Sentry project for staging
VITE_SENTRY_DSN=https://staging-dsn@sentry.io/staging-project
VITE_SENTRY_ENVIRONMENT=staging
```

### Production
```bash
# Use production Sentry project
VITE_SENTRY_DSN=https://prod-dsn@sentry.io/prod-project
VITE_SENTRY_ENVIRONMENT=production
```

## Monitoring Dashboard

Access Sentry dashboard: https://sentry.io/organizations/schoolflow/issues/

Key metrics to monitor:
- Error rate (should be < 1%)
- Payment failure rate (should be < 0.1%)
- RLS violations (should be 0)
- Response time p95 (should be < 2s)

## Troubleshooting

### Sentry not capturing errors
1. Check DSN is set correctly
2. Verify environment is not 'development'
3. Check browser console for Sentry init errors

### Too many events
1. Adjust `tracesSampleRate` (default 0.1 = 10%)
2. Add more `ignoreErrors` patterns
3. Use `beforeSend` to filter events

### Sensitive data leaked
1. Review `beforeSend` function
2. Add field names to redaction list
3. Test with sample data before production

## Cost Optimization

Sentry pricing based on events:
- **Free tier**: 5,000 events/month
- **Team tier**: $26/month for 50,000 events
- **Business tier**: $80/month for 500,000 events

To reduce costs:
- Lower `tracesSampleRate` (0.1 = 10% of transactions)
- Add more `ignoreErrors` (network errors, browser extensions)
- Use `beforeSend` to filter non-critical errors

## Next Steps

1. Create Sentry account and project
2. Add DSN to `.env.local`
3. Install `@sentry/react` package
4. Test error tracking in staging
5. Configure alert rules
6. Deploy to production
