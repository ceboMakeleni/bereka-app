# Accessibility (a11y) — Bereka

## Standard

All features must meet **WCAG 2.2 Level AA** compliance. Accessibility is a core requirement — not optional.

## Implementation Summary

### What's in Place

| Feature | WCAG | How |
|---------|------|-----|
| Skip navigation | 2.4.1 | `<SkipNavigation>` → `#main-content` in root layout |
| ARIA landmarks | 1.3.1 | `<nav>`, `<aside>`, `<main>` in `DashboardShell` |
| Page titles | 2.4.2 | `document.title` set via `useEffect` on every client page |
| Reduced motion | 2.3.3 | `prefers-reduced-motion` media query in `globals.css` |
| Focus visible | 2.4.7 | Tailwind `focus-visible:ring` |
| Mobile focus trap | 2.4.3 | Focus trap + return in mobile drawer (DashboardShell) |
| Active link | 4.1.2 | `aria-current="page"` on nav links |
| Live regions | 4.1.3 | `aria-live` on wallet status, search results, expiry |
| QR code | 1.1.1 | `role="img"` + `aria-label`, SVG `aria-hidden` |
| Form errors | 3.3.1 | `role="alert" aria-live="assertive"` on error divs |
| Color independence | 1.4.1 | `<VisuallyHidden>` Deposit/Withdrawal labels, text badges |
| No nested interactives | 4.1.2 | Share buttons outside `<Link>` on job cards |

### Reusable Components

| Component | File | Purpose |
|-----------|------|---------|
| `SkipNavigation` | `components/ui/skip-navigation.tsx` | Skip-to-content link (root layout only) |
| `VisuallyHidden` | `components/ui/visually-hidden.tsx` | SR-only text for icons, labels |

---

## Rules for New Work

### Must Do

1. Set `document.title = "Page Name — Bereka"` in `useEffect`
2. Use semantic headings: one `h1`, then `h2`→`h3`
3. Add `aria-hidden="true"` on decorative icons
4. Use `role="alert" aria-live="assertive"` on error containers
5. Use `aria-live="polite"` on dynamic content (counts, status)
6. Never nest `<button>`/`<a>` inside `<Link>`/`<a>`
7. Pair color with text — never color-only status indication
8. Ensure keyboard operability on all interactive elements
9. Trap focus in modals/drawers, return focus on close
10. Add new animations to the `prefers-reduced-motion` override

### Must Test

- **Build**: `npx next build` — zero errors
- **Keyboard**: Tab through entire flow, verify focus visibility
- **Screen reader**: VoiceOver (macOS) or NVDA (Windows)
- **Reduced motion**: Enable in OS, verify no animations

---

## Page Status

All existing pages are WCAG 2.2 AA compliant as of Feb 2026.

| Page | Title | Live Regions | Errors |
|------|:-----:|:------------:|:------:|
| Login | ✅ | — | ✅ |
| Signup | ✅ | — | ✅ |
| Dashboard | ✅ | — | — |
| Wallet | ✅ | ✅ | — |
| Jobs | ✅ | ✅ | — |
| Create Job | ✅ | — | ✅ |
| Applications | ✅ | — | — |
| Disputes | ✅ | — | — |
| Settings | ✅ | — | — |
| Admin | ✅ | — | — |

---

## Related Documentation

- [AGENTS.md §13](AGENTS.md#13-accessibility-a11y-conventions) — Full conventions for agents
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) — Color contrast, animation a11y, status badges
- [CONTRIBUTING.md](CONTRIBUTING.md) — Accessibility requirements for contributors
