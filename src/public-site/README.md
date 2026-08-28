# `src/public-site/` — Website Builder premium

This is a new, additive layer on top of the existing public-pages
architecture — **not** a parallel/duplicate website builder. Two systems
already existed before this layer and remain fully intact:

- **Legacy landing** (`src/pages/public/TenantLanding.tsx` + the four
  templates in `src/pages/public/landing/`) — one hardcoded full-page
  component per `tenantTemplateGroup` (`src/lib/tenantTemplateGroup.ts`).
- **Multi-page CMS** (`PublicPage` rows, `src/pages/admin/PublicPagesManager.tsx`,
  `src/components/public-pages/SectionsBuilder.tsx`,
  `src/pages/public/PublicPageView.tsx`) — tenant-authored pages built
  from a JSON array of sections (`src/hooks/usePublicPages.ts::PublicPageSection`).

This directory adds a **third, higher layer**: full premium **site
templates** (a whole homepage identity — navbar, hero, section
composition, palette/typography), selected per tenant via
`settings.landing.site_template_id` and rendered from
`TenantLanding.tsx` *before* it falls through to the legacy switch. If a
tenant hasn't chosen a site template (or the choice is no longer
compatible with their `tenant.type`), `TenantLanding.tsx` behaves
exactly as it did before this layer existed — zero behavior change for
every tenant not opted in.

## Why not reuse `PublicPageView.tsx`'s renderers directly?

Those are tuned for the generic multi-page CMS (arbitrary `PublicPage`
rows), not for a template's opinionated, always-present homepage. A
site template is closer in shape to the legacy full-page components.

## Why not one set of components per template?

That would 3x-duplicate near-identical Hero/Stats/CTA/etc. components
across School Excellence, Campus Prestige, and Primary Bloom. Instead:

- `sections/` holds **shared, token-styled** components (Hero, Stats,
  CTA, Testimonials, FAQ, Gallery, ContactForm, Text, Programs, Results,
  SchoolLife, Events, News, plus PremiumNavbar/PremiumFooter).
- `theme/tokens.ts` defines the primitives (`DesignTokens`) every shared
  section resolves against instead of hardcoding colors/spacing.
- Each template under `templates/<id>/` supplies its own `tokens.ts`
  (default palette/typography) and composes the shared sections into its
  own `<Id>Template.tsx` — the *same* Hero component looks completely
  different per template purely because it resolves different tokens.

## `SiteSection` vs `PublicPageSection`

`types/sections.ts` defines a discriminated-union `SiteSection` type,
strictly additive on top of the existing, untyped `PublicPageSection`.
It is consumed **only** by code under `src/public-site/` — `usePublicPages.ts`,
`SectionsBuilder.tsx`, and `PublicPageView.tsx` are unchanged and keep
using `PublicPageSection` exactly as before.

## Registry

`registry/siteTemplateRegistry.ts` is the single source of truth for
which templates exist, what tenant types they're compatible with
(`TenantTemplateGroup`, reused as-is from `tenantTemplateGroup.ts`), and
which component renders them. `getSiteTemplate(id)` /
`getSiteTemplatesFor(group)` are the only two functions the rest of the
app needs to know about this registry.

## Not part of this slice

All three flagship templates are implemented (School Excellence,
Campus Prestige, Primary Bloom — the registry array has three entries
today). Still not built: real drag-and-drop reordering inside
`SectionsBuilder.tsx`, a real draft-preview mode, and a full "start
from this template" scaffolding flow using `defaultSections`. See the
plan file for the complete list.
