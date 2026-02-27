# Bereka Design System

## Color Tokens

All colors are defined as HSL CSS variables in `apps/web/app/globals.css`. Both light and dark palettes are pre-configured.

### Core Tokens

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--background` | `240 10% 98%` | `240 10% 6%` | Page background |
| `--foreground` | `240 10% 10%` | `240 10% 95%` | Primary text |
| `--card` | `0 0% 100%` | `240 10% 9%` | Card surfaces |
| `--primary` | `255 85% 55%` | `255 90% 70%` | Buttons, links, accents |
| `--secondary` | `255 30% 92%` | `240 20% 15%` | Secondary elements |
| `--muted` | `240 20% 95%` | `240 20% 15%` | Subdued backgrounds |
| `--muted-foreground` | `240 10% 40%` | `240 10% 65%` | Secondary text |
| `--destructive` | `0 84% 60%` | `0 63% 31%` | Errors, delete actions |
| `--border` | `240 15% 90%` | `240 20% 15%` | Borders |
| `--ring` | `255 85% 55%` | `255 90% 70%` | Focus rings |

### Color Contrast Requirements (WCAG 1.4.3)

- **Normal text** (< 18pt): 4.5:1 minimum contrast ratio against background
- **Large text** (≥ 18pt or 14pt bold): 3:1 minimum contrast ratio
- **Interactive elements**: `--ring` focus indicator must be visible on both light and dark backgrounds
- **Status colors**: Never use color alone to convey meaning — always pair with text labels or icons

### Usage Rules

- **Always use semantic tokens** (`bg-card`, `text-foreground`, `border-border`) instead of hardcoded colors (`bg-white/5`, `text-white/70`)
- Use `text-muted-foreground` for secondary text, not `text-gray-*`
- Use `bg-destructive/10` for error backgrounds

---

## Typography

| Element | Font | Size |
|---------|------|------|
| Body | Geist Sans (`--font-geist-sans`) | System default |
| Code | Geist Mono (`--font-geist-mono`) | System default |

Loaded via `next/font/google` in `layout.tsx`.

---

## Spacing & Layout

| Pattern | Value |
|---------|-------|
| Border radius | `0.75rem` (via `--radius`) |
| Page max-width | `max-w-6xl`  |
| Internal padding | `p-4` → `p-6` → `p-8` |
| Card gap | `space-y-4` or `gap-4` |

---

## Components

### Shadcn UI Components (`components/ui/`)

| Component | Radix Primitive | File |
|-----------|----------------|------|
| Button | — | `button.tsx` |
| Card | — | `card.tsx` |
| Input | — | `input.tsx` |
| Label | — | `label.tsx` |
| Textarea | — | `textarea.tsx` |
| Dialog | `@radix-ui/react-dialog` | `dialog.tsx` |
| Select | `@radix-ui/react-select` | `select.tsx` |
| Tabs | `@radix-ui/react-tabs` | `tabs.tsx` |
| Separator | `@radix-ui/react-separator` | `separator.tsx` |
| Skeleton | — | `skeleton.tsx` |
| Toaster | Sonner | `toaster.tsx` |
| Tooltip | `@radix-ui/react-tooltip` | `tooltip.tsx` |

### Custom Components

| Component | File | Purpose |
|-----------|------|---------|
| PageHeader | `page-header.tsx` | Page title with description and action slot |
| EmptyState | `empty-state.tsx` | Empty list placeholder with icon and CTA |
| ThemeToggle | `theme-toggle.tsx` | Dark/light mode switcher |
| ShareButton | `share-button.tsx` | Web Share API + clipboard fallback |
| SkipNavigation | `skip-navigation.tsx` | Accessible "Skip to main content" link (WCAG 2.4.1) |
| VisuallyHidden | `visually-hidden.tsx` | Screen-reader-only text utility (WCAG 1.1.1) |

---

## Glass Utilities

Defined in `globals.css` — use for elevated surfaces:

| Class | Effect |
|-------|--------|
| `.glass` | Semi-transparent card with backdrop blur |
| `.glass-border` | Subtle theme-aware border |
| `.glass-hover` | Hover state for glass surfaces |
| `.glass-inset` | Inset panel (e.g., code blocks, quotes) |

---

## Dark Mode

- Toggle lives in `DashboardShell` sidebar
- Preference stored in `localStorage('theme')`
- System preference respected on first visit
- Applied via `.dark` class on `<html>` (set by inline script in `layout.tsx` to prevent flash)

---

## Animations

| Class | Effect |
|-------|--------|
| `.animate-fade-in` | Fade in with subtle upward slide (300ms) |
| `.animate-slide-in` | Slide in from left (200ms) |

### Animation Accessibility (WCAG 2.3.3)

All animations are automatically disabled when the user has "Reduce Motion" enabled in their OS settings:

```css
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
    }
}
```

**When adding new animations**, always add them to the `prefers-reduced-motion` override in `globals.css`. Never create animations that cannot be disabled.

---

## Status Badge Colors

| Status | Tailwind Classes |
|--------|-----------------|
| Open | `bg-blue-500/20 text-blue-400` |
| Funded | `bg-green-500/20 text-green-400` |
| In Progress | `bg-yellow-500/20 text-yellow-400` |
| Review | `bg-purple-500/20 text-purple-400` |
| Completed | `bg-green-500/20 text-green-400` |
| Disputed | `bg-red-500/20 text-red-400` |
| Cancelled | `bg-gray-500/20 text-gray-400` |

> **Accessibility rule**: Status badges must always include visible text (e.g., "OPEN", "FUNDED"). Color alone is never sufficient to communicate status (WCAG 1.4.1). For transaction history, include `<VisuallyHidden>` labels like "Deposit" or "Withdrawal" alongside arrow icons.
