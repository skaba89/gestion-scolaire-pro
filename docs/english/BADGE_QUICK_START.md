# 🚀 Badge System - Quick Start Guide

## 5-Minute Setup

### 1. Database Setup
```bash
# The database tables will auto-create on docker-compose up
docker-compose down
docker volume rm schoolflow-pro_db-data
docker-compose up -d --wait

# Verify tables created
docker exec schoolflow-pro-supabase-db-1 psql -U postgres -d postgres \
  -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"
```

### 2. Install Dependencies
```bash
npm install
npm run dev
```

### 3. Access Application
- Frontend: http://localhost:3000
- Supabase Dashboard: http://localhost:3001
- API: http://localhost:8000

---

## Quick Integration Into Your Pages

### Add Dashboard Widget
```tsx
// src/pages/Dashboard.tsx
import BadgeWidget from "@/components/dashboard/BadgeWidget";

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <StatsCards />
      <BadgeWidget />  {/* Add this */}
      <RecentActivity />
    </div>
  );
}
```

### Add Profile Section
```tsx
// src/pages/Profile.tsx
import ProfileBadgeSection from "@/components/profile/ProfileBadgeSection";

export default function Profile() {
  return (
    <div className="space-y-6">
      <UserInfo />
      <ProfileBadgeSection />  {/* Add this */}
      <Settings />
    </div>
  );
}
```

### Add Class Leaderboard
```tsx
// src/pages/Class.tsx
import ClassBadgeLeaderboard from "@/components/class/ClassBadgeLeaderboard";

export default function ClassPage({ classId }: { classId: string }) {
  return (
    <div className="space-y-6">
      <ClassStats />
      <ClassBadgeLeaderboard classId={classId} />  {/* Add this */}
    </div>
  );
}
```

### Initialize Notifications (Root Level)
```tsx
// src/App.tsx
import { useBadgeNotifications } from "@/hooks/useBadges";
import BadgeNotificationContainer from "@/components/badges/BadgeNotification";

export default function App() {
  const { notifications } = useBadgeNotifications();

  return (
    <div className="app">
      <Routes>{/* Your routes */}</Routes>
      {notifications.length > 0 && (
        <BadgeNotificationContainer notifications={notifications} />
      )}
    </div>
  );
}
```

---

## Using Hooks in Components

### Fetch User Badges
```tsx
import { useUserBadges } from "@/hooks/useBadges";

function MyBadges() {
  const { data: badges, isLoading } = useUserBadges();

  if (isLoading) return <LoadingSpinner />;
  return <BadgeGrid badges={badges} />;
}
```

### Award Badge (Admin)
```tsx
import { useAwardBadge } from "@/hooks/useBadges";

function AdminPanel() {
  const { mutate: awardBadge } = useAwardBadge();

  const handleAward = (userId: string, badgeId: string) => {
    awardBadge({ userId, badgeDefinitionId: badgeId }, {
      onSuccess: (result) => {
        if (result.success) {
          toast.success(`Awarded: ${result.badgeName}`);
        }
      },
    });
  };

  return (
    <button onClick={() => handleAward(studentId, badgeId)}>
      Award Badge
    </button>
  );
}
```

### View Statistics
```tsx
import { useBadgeStats } from "@/hooks/useBadges";

function StatsDisplay() {
  const { data: stats } = useBadgeStats();

  return (
    <div>
      <p>Total Badges: {stats?.totalBadges}</p>
      <p>Performance: {stats?.badgesByType.performance}</p>
      <p>Achievement: {stats?.badgesByType.achievement}</p>
    </div>
  );
}
```

### Real-Time Notifications
```tsx
import { useBadgeNotifications } from "@/hooks/useBadges";

function MyComponent() {
  const { notifications } = useBadgeNotifications((badge) => {
    console.log("🎉 Badge earned:", badge.badgeName);
    // Custom handling
  });

  return (
    <div>
      {notifications.map((notif) => (
        <div key={notif.id}>{notif.badgeName}</div>
      ))}
    </div>
  );
}
```

---

## Database Queries

### Get User Badges (SQL)
```sql
SELECT ub.*, bd.* 
FROM user_badges ub
JOIN badges_definitions bd ON ub.badge_definition_id = bd.id
WHERE ub.user_id = 'user-id' AND ub.tenant_id = 'tenant-id'
ORDER BY ub.earned_date DESC;
```

### Get Class Leaderboard (SQL)
```sql
SELECT * FROM get_class_badge_leaderboard('class-id');
```

### Get User Stats (SQL)
```sql
SELECT * FROM get_user_badge_stats('user-id', 'tenant-id');
```

### Award Badge (API)
```bash
curl -X POST http://localhost:8000/rest/v1/rpc/award_badge \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "p_user_id": "user-id",
    "p_tenant_id": "tenant-id",
    "p_badge_id": "badge-id"
  }'
```

---

## Testing the System

### 1. View Achievements Page
```
http://localhost:3000/achievements
```

### 2. Check Your Profile
```
http://localhost:3000/profile
```

### 3. View Class Leaderboard
```
http://localhost:3000/class/[class-id]
```

### 4. Trigger Auto-Award
- Add a grade ≥90 → Performance badge auto-awarded
- Mark 100% attendance → Attendance badge auto-awarded

### 5. Test Notifications
- Earn a badge → Toast notification displays
- Mobile: Push notification appears
- Check notification history in preferences

---

## Troubleshooting

### Badges not showing?
```bash
# Check database tables exist
docker exec schoolflow-pro-supabase-db-1 psql -U postgres -d postgres \
  -c "SELECT COUNT(*) FROM badges_definitions;"

# Should return 25
```

### Notifications not firing?
```javascript
// Check realtime subscription
const channel = supabase
  .channel('test')
  .on('postgres_changes', { 
    event: 'INSERT', 
    schema: 'public', 
    table: 'user_badges' 
  }, (payload) => console.log('Update:', payload))
  .subscribe();
```

### Leaderboard empty?
```sql
-- Check if students have badges
SELECT COUNT(*) FROM user_badges;

-- Should be > 0
```

### Permission errors?
```bash
# Check RLS policies are enabled
docker exec schoolflow-pro-supabase-db-1 psql -U postgres -d postgres \
  -c "SELECT tablename FROM pg_tables WHERE schemaname='public';"
```

---

## File Quick Reference

| File | Purpose | Key Functions |
|------|---------|---|
| `badge-api.ts` | API endpoints | `fetchBadgeDefinitions()`, `awardBadge()`, `getClassBadgeLeaderboard()` |
| `useBadges.ts` | React hooks | `useUserBadges()`, `useAwardBadge()`, `useBadgeNotifications()` |
| `BadgeDisplay.tsx` | Renders badge | 5 SVG templates, responsive sizing |
| `BadgeCard.tsx` | Card wrapper | Share, earned date, locked state |
| `BadgeGrid.tsx` | Grid layout | Filter, sort, stats |
| `Achievements.tsx` | Main page | Hero, stats, tabs, leaderboard |

---

## Common Tasks

### Award a Badge Manually
```tsx
const { mutate: award } = useAwardBadge();
award({
  userId: 'student-id',
  badgeDefinitionId: 'badge-id',
  eventType: 'manual'
});
```

### Create New Badge Type
```sql
INSERT INTO badges_definitions (
  tenant_id, name, badge_type, badge_template,
  color_primary, color_secondary, rarity, requirements
) VALUES (
  'tenant-id', 'My Badge', 'PERFORMANCE', 'CIRCLE',
  '#FF6B6B', '#FFE66D', 'RARE',
  '{"min_average": 95}'::jsonb
);
```

### Filter Badges
```tsx
const { data: badges } = useBadgeDefinitions();
const performance = badges?.filter(b => 
  b.badge_type === 'PERFORMANCE'
);
```

### Share Badge
```tsx
const { shareNotification } = require('@/lib/badge-notification-service');
await shareNotification(badgeId, 'twitter');
```

---

## Performance Tips

1. **Use React Query Caching**
   - Definitions: 30 min cache
   - User badges: 5 min cache
   - Stats: 10 min cache

2. **Paginate Large Lists**
   ```tsx
   const { data: badges, hasMore, fetchMore } = useInfiniteQuery({
     queryKey: ['badges'],
     queryFn: fetchBadgesPage,
   });
   ```

3. **Debounce Filters**
   ```tsx
   const [filter, setFilter] = useState('');
   const debouncedFilter = useDebounce(filter, 300);
   ```

4. **Virtual Scrolling**
   ```tsx
   import { FixedSizeList } from 'react-window';
   // For 1000+ badges
   ```

---

## Security Checklist

Before deploying to production:

- [ ] RLS policies enabled on all tables
- [ ] Tenant ID in all queries
- [ ] Service role key never exposed in client
- [ ] Rate limiting configured
- [ ] CORS properly set
- [ ] Secrets in environment variables
- [ ] Audit logs preserved
- [ ] SSL/TLS enabled
- [ ] Database backups scheduled
- [ ] Monitoring configured

---

## Next Steps

1. ✅ **Integration** - Add components to your pages (this guide)
2. 🧪 **Testing** - Run security tests (SPRINT4_SECURITY_TESTING.md)
3. 📊 **Analytics** - Monitor badge awards and engagement
4. 🎯 **Customization** - Adjust badge types, colors, requirements
5. 🚀 **Deployment** - Deploy to production

---

## Support

- 📚 **Full Documentation:** See `PHASE_2_COMPLETE.md`
- 🔧 **Integration Guide:** See `BADGE_INTEGRATION_GUIDE.md`
- 🔐 **Security Tests:** See `SPRINT4_SECURITY_TESTING.md`
- 💬 **Code Comments:** Inline documentation in all files

---

**You're all set!** Start adding badges to your app. 🎉
