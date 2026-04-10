# Dynamic Settings System Guide - SchoolFlow Pro

## Overview

The Dynamic Settings System allows administrators to configure and modify university branding, localization, scheduling, and feature settings without restarting the application or modifying code. All settings are stored in a JSONB column (`tenants.settings`) and cached locally for performance.

**Key Features:**
- ✅ Dynamic parameter management without breaking existing functionality
- ✅ 5-minute cache with real-time Supabase subscriptions
- ✅ Type-safe TypeScript interface for all settings
- ✅ Admin UI for non-technical users (logo upload, color picker, form fields)
- ✅ Backward compatible with existing code
- ✅ Real-time updates across all sessions

---

## Architecture

### Data Flow

```
Admin UI (BrandingSettings/SystemSettings)
    ↓
useSettings Hook (React Query + Supabase)
    ↓
tenants.settings (JSONB column)
    ↓
useSettings Cache (5-min TTL)
    ↓
Consumer Components (TenantBranding, etc.)
```

### Files Involved

**New Files:**
- `src/hooks/useSettings.ts` - Central hook for accessing and managing settings
- `src/components/settings/BrandingSettings.tsx` - Admin UI for branding
- `src/components/settings/SystemSettings.tsx` - Admin UI for system parameters

**Modified Files:**
- `src/pages/admin/Settings.tsx` - Added new tabs for settings
- `src/components/TenantBranding.tsx` - Updated to use dynamic settings

---

## TenantSettingsSchema Interface

All settings are type-safe and defined in the `TenantSettingsSchema` interface in `src/hooks/useSettings.ts`:

```typescript
interface TenantSettingsSchema {
  // Branding
  logo_url?: string;                    // Logo image URL
  primary_color?: string;               // Hex color code (e.g., "#3B82F6")
  secondary_color?: string;             // Hex color code
  accent_color?: string;                // Hex color code
  favicon_url?: string;                 // Favicon URL

  // Identity
  name?: string;                        // School name
  official_name?: string;               // Official name for documents
  acronym?: string;                     // School acronym

  // Appearance
  show_logo_text?: boolean;             // Toggle logo text display
  show_full_name?: boolean;             // Show full name vs acronym
  theme_mode?: "light" | "dark" | "auto";

  // Features
  enable_notifications?: boolean;       // Enable notifications
  enable_api_access?: boolean;          // Enable API access
  enable_advanced_analytics?: boolean;  // Enable advanced analytics
  enable_ai_features?: boolean;         // Enable AI features

  // Grading (extends existing)
  maxScore?: number;
  passingScore?: number;
  useLetterGrades?: boolean;
  showRank?: boolean;
  showClassAverage?: boolean;
  gradeScale?: Record<string, number>;

  // Attendance
  autoMarkAbsence?: boolean;            // Auto-mark absent after start time
  requireJustification?: boolean;       // Require reason for absence

  // Schedule
  schoolStartTime?: string;             // Time format "HH:mm"
  schoolEndTime?: string;
  classSessionDuration?: number;        // Duration in minutes
  breakBetweenSessions?: number;        // Break duration in minutes

  // Finance
  currency?: string;                    // Currency code (e.g., "USD", "EUR")
  fiscalYear?: string;                  // Fiscal year format (e.g., "JAN-DEC")

  // Localization
  language?: string;                    // Language code (e.g., "en", "fr", "es")
  timezone?: string;                    // Timezone (e.g., "America/New_York")
  locale?: string;                      // Locale code (e.g., "en-US")
}
```

---

## Using the useSettings Hook

### Basic Usage

```typescript
import { useSettings, useSetting } from "@/hooks/useSettings";

function MyComponent() {
  // Get all settings
  const { settings, isLoading, isUpdating } = useSettings();
  
  // Access specific settings
  const logoUrl = settings.logo_url;
  const schoolName = settings.name;
  
  // Update a single setting
  const { updateSetting } = useSettings();
  await updateSetting("primary_color", "#FF0000");
  
  // Update multiple settings at once
  const { updateSettings } = useSettings();
  await updateSettings({
    name: "New School Name",
    primary_color: "#3B82F6",
  });
}
```

### Type-Safe Hook

For better TypeScript support, use the generic `useSetting<K>` hook:

```typescript
import { useSetting } from "@/hooks/useSettings";

function MyComponent() {
  // Type-safe access - IDE knows this is a string
  const name = useSetting("name", "Default School");
  
  // Type-safe access - IDE knows this is a boolean
  const enableNotifications = useSetting("enable_notifications", true);
  
  // Type-safe access - IDE knows this is a hex color
  const primaryColor = useSetting("primary_color", "#000000");
  
  // Autocomplete helps you pick correct keys
  // const x = useSetting("name"); // ✅ Works
  // const x = useSetting("invalid_key"); // ❌ TypeScript error
}
```

### Hook Return Values

```typescript
interface UseSettingsReturn {
  settings: TenantSettingsSchema;           // All settings merged with defaults
  isLoading: boolean;                       // Loading from DB
  isUpdating: boolean;                      // Saving to DB
  getSetting<K>(key: K, defaultValue?): T; // Get single setting
  getSettings(): TenantSettingsSchema;      // Get all settings
  updateSetting(key, value): Promise<bool>; // Update single setting
  updateSettings(updates): Promise<bool>;   // Update multiple settings
  resetSettings(): Promise<bool>;           // Reset to defaults
  hasCustomSettings: boolean;               // Settings exist vs defaults
}
```

---

## TenantBranding Component (Updated)

The `TenantBranding` component now uses dynamic settings while maintaining backward compatibility:

```typescript
import { TenantBranding } from "@/components/TenantBranding";

function MyLayout() {
  return (
    <header>
      {/* Shows dynamic logo and name from settings */}
      <TenantBranding showName={true} size="lg" />
      
      {/* Or without name */}
      <TenantBranding showName={false} size="md" />
    </header>
  );
}
```

**Fallback Chain:**
1. Dynamic setting: `settings.logo_url` or `settings.name`
2. Existing tenant data: `tenant?.logo_url` or `tenant?.name`
3. Default value: "EduManager" (for name)
4. Icon: GraduationCap icon (for logo)

---

## Admin Interface

### Accessing Settings

1. Navigate to `/admin/settings` (Admin Dashboard → Settings)
2. Click on "Identité Visuelle" tab for branding settings
3. Click on "Système" tab for system parameters

### Branding Settings Tab

**Features:**
- **Logo Upload** - Drag & drop or click to upload (max 5MB, image files only)
- **Color Picker** - Set primary, secondary, and accent colors
- **Name Fields** - School name and official name
- **Show Logo Text** - Toggle whether to display text next to logo
- **Live Preview** - See changes in real-time

**File Upload:**
- Uploaded to: `uploads/tenant-logos/{tenantId}/logo-{timestamp}-{filename}`
- Validates: File type (image/*), Size (< 5MB)
- Returns: Public URL stored in `settings.logo_url`
- Fallback: If no custom logo, shows GraduationCap icon

### System Settings Tab

**Localization:**
- Language (en, fr, es, de, pt)
- Timezone (8 major timezones)
- Locale (locale code for date/time formatting)

**Schedule:**
- School start time (e.g., 08:00)
- School end time (e.g., 16:00)
- Class session duration (minutes)
- Break between sessions (minutes)

**Finance:**
- Currency (USD, EUR, GBP, CAD, AUD)
- Fiscal year (JAN-DEC, APR-MAR, AUG-JUL, SEP-AUG, JUL-JUN)

**Features:**
- Enable notifications (toggle)
- Enable API access (toggle)
- Enable advanced analytics (toggle)
- Enable AI features (toggle)

**Attendance:**
- Auto-mark absence (if student not present at start time)
- Require justification (require reason for absence)

---

## Caching Strategy

### Cache Behavior

```typescript
// When useSettings is called:
1. Check React Query cache (5-minute stale time)
   - If fresh: return cached data immediately
   - If stale: return cached data + refetch in background
   - If missing: fetch from DB

2. Set up Supabase real-time subscription
   - Listen for changes to tenants table
   - On UPDATE event: refetch settings
   - Automatic subscription cleanup on unmount

3. Use 10-minute garbage collection
   - Cache removed after 10 minutes of inactivity
   - Reduces memory usage
```

### Cache Invalidation

Settings are automatically updated in two ways:

**1. Real-Time Subscriptions** (Instant)
```typescript
// When admin saves settings, all open tabs/windows see updates instantly
useEffect(() => {
  const subscription = supabase
    .channel(`tenant-settings-${tenant?.id}`)
    .on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "tenants",
      filter: `id=eq.${tenant?.id}`,
    }, () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-settings"] });
    })
    .subscribe();
  return () => subscription.unsubscribe();
}, [tenant?.id]);
```

**2. Manual Invalidation** (After updateSetting)
```typescript
const { mutate } = useMutation({
  mutationFn: async () => {
    // Update in DB...
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["tenant-settings"] });
  },
});
```

---

## Backward Compatibility

### Existing Code Works Unchanged

```typescript
// Old code still works (uses tenant context)
import { useTenant } from "@/contexts/TenantContext";

function MyComponent() {
  const { tenant } = useTenant();
  console.log(tenant.name);      // ✅ Still works
  console.log(tenant.logo_url);  // ✅ Still works
}
```

### New Code Uses Dynamic Settings

```typescript
// New code uses useSettings (with fallback to tenant)
import { useSettings } from "@/hooks/useSettings";

function MyComponent() {
  const { settings } = useSettings();
  console.log(settings.name);      // ✅ Prefers settings.name
  console.log(settings.logo_url);  // ✅ Prefers settings.logo_url
}
```

### Merging Logic

The useSettings hook merges dynamic settings with tenant data:

```typescript
const mergedSettings = {
  ...DEFAULT_SETTINGS,      // Default values
  ...tenant,                // Existing tenant columns (name, logo_url, etc.)
  ...dbSettings,            // Settings from JSONB column (overrides tenant)
};
```

**Example:**
- Tenant has `name: "Old School Name"` in `tenants.name` column
- Admin sets `name: "New School Name"` in settings
- useSettings returns: `"New School Name"`
- TenantBranding displays: `"New School Name"`
- Existing code using `tenant.name` still gets: `"Old School Name"` (unchanged)

---

## Database Schema

### Existing Table Structure

```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY,
  name TEXT,
  logo_url TEXT,
  -- ... other columns ...
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Settings Storage

Settings are stored as JSONB in the `settings` column:

```json
{
  "logo_url": "https://storage.example.com/tenant-logos/...",
  "primary_color": "#3B82F6",
  "secondary_color": "#6366F1",
  "accent_color": "#EC4899",
  "name": "Modern School",
  "official_name": "Modern International School",
  "acronym": "MIS",
  "show_logo_text": true,
  "language": "en",
  "timezone": "America/New_York",
  "currency": "USD",
  "enable_notifications": true,
  "enable_ai_features": false,
  "maxScore": 20,
  "passingScore": 10
}
```

### Querying Settings

```sql
-- Get a specific setting
SELECT settings->>'primary_color' as primary_color
FROM tenants
WHERE id = '...'

-- Get nested settings
SELECT settings->'gradeScale' as gradeScale
FROM tenants
WHERE id = '...'

-- Update a setting
UPDATE tenants
SET settings = jsonb_set(settings, '{primary_color}', '"#FF0000"')
WHERE id = '...'
```

---

## Examples

### Example 1: Using Dynamic Logo in Header

**Before (Static):**
```typescript
function Header() {
  const { tenant } = useTenant();
  return (
    <img src={tenant?.logo_url} alt="Logo" className="w-12 h-12" />
  );
}
```

**After (Dynamic):**
```typescript
function Header() {
  const { settings } = useSettings();
  return (
    <img 
      src={settings.logo_url || "/default-logo.png"} 
      alt="Logo" 
      className="w-12 h-12" 
    />
  );
}
```

### Example 2: Conditional Feature Display

```typescript
function AnalyticsPage() {
  const { settings } = useSettings();
  
  if (!settings.enable_advanced_analytics) {
    return <div>Advanced analytics is disabled by admin</div>;
  }
  
  return <AnalyticsChart />;
}
```

### Example 3: Schedule Configuration

```typescript
function ClassScheduleForm() {
  const { settings } = useSettings();
  
  const defaultStartTime = settings.schoolStartTime || "09:00";
  const defaultEndTime = settings.schoolEndTime || "17:00";
  const sessionDuration = settings.classSessionDuration || 50;
  
  return (
    <form>
      <input type="time" defaultValue={defaultStartTime} />
      <input type="time" defaultValue={defaultEndTime} />
      <input type="number" defaultValue={sessionDuration} />
    </form>
  );
}
```

### Example 4: Updating Multiple Settings

```typescript
async function updateBranding() {
  const { updateSettings } = useSettings();
  
  const success = await updateSettings({
    primary_color: "#FF6B6B",
    name: "New School Name",
    logo_url: "https://...",
  });
  
  if (success) {
    toast.success("Branding updated!");
  }
}
```

---

## Best Practices

### ✅ DO

- **Use useSettings for new features** - Leverages caching and real-time updates
- **Provide default values** - `useSetting("key", defaultValue)`
- **Handle loading states** - Check `isLoading` before rendering
- **Cache frequently accessed settings** - Don't call useSettings multiple times
- **Validate settings values** - Check type before using

### ❌ DON'T

- **Don't make direct DB queries for settings** - Use useSettings hook instead
- **Don't hardcode values** - Make them configurable in admin UI
- **Don't ignore the fallback chain** - Ensure backward compatibility
- **Don't update settings in child components** - Lift state to parent
- **Don't skip error handling** - Show toast notifications on errors

---

## Troubleshooting

### Settings Not Updating

**Problem:** Changes in admin UI don't reflect in other components

**Solution:**
1. Check browser console for errors
2. Verify network request succeeded (DevTools → Network)
3. Check tenant_id matches (should be same for admin and user)
4. Clear browser cache: `localStorage.clear()`
5. Refresh page manually

### Logo Upload Fails

**Problem:** "File too large" or "Invalid format" error

**Solution:**
1. Check file size is < 5MB
2. Check file is an image (PNG, JPG, WebP, etc.)
3. Check browser allows storage access
4. Check Supabase storage bucket permissions

### Settings Not Persisting

**Problem:** Settings save successfully but reset on page refresh

**Solution:**
1. Check database has `settings` column in `tenants` table
2. Verify RLS policies allow UPDATE on tenants table
3. Check admin user has correct role/permissions
4. Check for JavaScript errors in browser console

### Cache Not Invalidating

**Problem:** Old settings still showing after admin updates

**Solution:**
1. Verify Supabase real-time is configured
2. Check tenant_id matches in subscription
3. Clear React Query cache: `queryClient.clear()`
4. Restart development server: `npm run dev`

---

## Performance Considerations

### Cache Efficiency

- **5-minute stale time** prevents excessive DB queries
- **Garbage collection at 10 minutes** keeps memory lean
- **Real-time subscriptions** keep data fresh without polling

### Bundle Size Impact

- **useSettings hook**: ~5 KB minified
- **BrandingSettings component**: ~8 KB minified
- **SystemSettings component**: ~10 KB minified
- **Total**: ~23 KB added to bundle (gzipped: ~6 KB)

### Database Impact

- **No migration needed** - Uses existing `tenants.settings` JSONB column
- **One query on first load** - Additional loads use cache
- **Real-time subscription** - Low server cost (uses PostgreSQL LISTEN/NOTIFY)

---

## Future Enhancements

Potential improvements for the settings system:

- [ ] Settings audit log (track who changed what and when)
- [ ] Settings history/rollback (revert to previous configuration)
- [ ] Bulk export/import (move settings between tenants)
- [ ] Settings validation rules (prevent invalid configurations)
- [ ] Custom settings per role (different settings for different user roles)
- [ ] Settings API endpoints (programmatic access via REST)
- [ ] Advanced color theme builder (generate color palettes)
- [ ] Multi-language support for setting descriptions

---

## Support & Documentation

For more information:
- **React Query Docs**: https://tanstack.com/query/latest
- **Supabase Real-time**: https://supabase.com/docs/guides/realtime
- **JSONB in PostgreSQL**: https://www.postgresql.org/docs/15/datatype-json.html
- **TypeScript Interfaces**: https://www.typescriptlang.org/docs/handbook/interfaces.html

---

**Last Updated**: January 20, 2025  
**System Version**: 1.0  
**Maintainer**: SchoolFlow Pro Team
