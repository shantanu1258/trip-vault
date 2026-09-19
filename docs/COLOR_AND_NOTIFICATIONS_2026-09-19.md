# Color and notification refinement

> Historical iteration record. Accepted final behavior is now incorporated into [HLD](HIGH_LEVEL_DESIGN.md), [LLD](LOW_LEVEL_DESIGN.md), and [Features](FEATURES.md); see [CHANGELOG](../CHANGELOG.md). Earlier two-pulse/below-header focus, dark hero, and collapsed-card silhouette experiments below are superseded and must not be used as the current specification.

## Default palette

Use quiet neutral surfaces, teal for primary actions, and indigo for the current/next event. Reserve red for urgent/error states, amber for warnings, and green for success. This is a design judgment to reduce competing emphasis, not a claim that one hue is universally preferred.

| Role                   | Light   | Dark    |
| ---------------------- | ------- | ------- |
| Canvas                 | #f5f7fa | #10191f |
| Card surface           | #ffffff | #18252d |
| Raised surface         | #eef3f6 | #20313a |
| Primary action         | #146b67 | #79d5ca |
| Current event / accent | #4259b8 | #a9b7ff |
| Urgent / error         | #b33f47 | #ffaca7 |

- Current events keep a neutral card, indigo border and explicit Current/Next label. Event-type icons remain differentiated. The two jump-to-event pulses still affect only the border, now using the theme's teal.
- Search uses a neutral raised surface rather than looking like a large primary button. Dark-mode trip heroes use the softer brand surface with light text, and modal/picker scrims use neutral black shading instead of washing the page in the bright action color.
- Tests require at least 4.5:1 contrast for primary/muted text, primary/accent/status colors against canvas, card, and raised backgrounds in both modes, plus primary-on-soft backgrounds. This covers selected token pairs, not a claim of a complete WCAG audit.
- The admin storage key `coral` is retained for compatibility, labeled **Current event / accent** in the editor.
- Exact original stock palettes in cached/published configuration upgrade to the new bundled defaults. A customized palette is preserved in full for that mode.

Rationale: [WCAG text contrast](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum), [WCAG use of color](https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html), and [Material dark-theme guidance](https://codelabs.developers.google.com/codelabs/design-material-darktheme). Maintain labels/icons alongside color and use distinct dark surface tones rather than simply inverting the light palette.

## Database scope

Both new palettes were saved through the authorized Admin Appearance UI to the existing unpublished draft. The UI confirmed **Palette saved to the draft**. No trip records, catalogs, permissions, or schema were changed.

The existing draft is dated 13 September 2026, 13:26, before published version 2 (Booking vendor additions, 22:35). It was deliberately **not published**: publishing the entire stale draft could replace unrelated catalogs/defaults. Reconcile or replace that draft from the current published release before a later database publication. The app's stock-palette upgrade makes the new defaults available without publishing it. Original stock values remain in `legacyLightTokens` / `legacyDarkTokens` for comparison and recovery.

## Notifications

- The bell opens a compact modal of active alerts grouped by Needs attention / Today / Upcoming. The existing engine excludes dismissed and currently snoozed occurrences.
- Opening/closing retains the underlying route, query, hash and navigation state. Browser Back can dismiss the route-based modal; an item replaces the modal route with its destination.
- Readiness notifications deep-link to `readiness?task=<id>`, opening that specific task's details, not just its list. Other alerts retain their existing destinations.
- Loading, failure, and all-caught-up are separate states. **Manage all notifications** retains access to dismissal/snooze/reminder tools on the full page.

## Verification

- Full suite: 541 tests across 91 files passed with four workers. Targeted coverage includes bell open/close, readiness notification target selection, delayed task loading, dismissed/snoozed filtering, exact-stock palette upgrades, custom palette preservation, and contrast pairs in both modes.
- Browser: active-notifications modal and browser-Back dismissal verified on a 375px phone viewport; light/dark canvas and current-event border colors verified from rendered styles. No horizontal overflow at 430px. Existing demo-profile data had no active notifications, so readiness selection was verified through integration tests without creating live tasks.
- Admin draft save confirmed and both accent values verified after reload. Theme preference restored to Light. Production build passed with the pre-existing chunk-size warning.
