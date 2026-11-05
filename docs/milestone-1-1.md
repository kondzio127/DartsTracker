# Milestone 1.1: app-wide themes

All screens now use the existing four-theme system. Neon Arena is still the
default. The theme store, AsyncStorage keys, scoring engines, game store and
statistics calculations are unchanged. No dependencies were installed or upgraded.

## How the implementation works

- Semantic tokens in `src/theme/themes.ts` remain the source of colours. New
  success, danger, warning, selected-surface and disabled tokens cover states that
  the Home-only foundation did not need. Filled colours have paired label tokens
  (`onAccent`, `onSuccess`, `onDanger`); white is not readable on every accent.
- Clubhouse Paper's muted/copper colours and Tournament Broadcast's selected
  surface were adjusted to pass the expanded text-contrast checks.
- `ThemedText`, `ThemedCard` and `ThemedInput` provide defaults while accepting
  native props and caller styles. Screens retain their existing spacing, sizing,
  lists and interaction handlers. Existing `Text`/`TextInput` tags are locally
  imported from these shared components rather than React Native directly.
- `AppButton` delegates to `ThemedButton` with legacy sizing, so existing callers
  share its colours without changing their layouts. Custom score keys and small
  controls retain their original geometry and use the same tokens.
- Screen style factories accept the selected theme. `useMemo` retains the styles
  between game-state updates and rebuilds them when the theme changes. Helpers
  rendered inside screens subscribe too, so labels and selected states update.
- Navigation receives matching colours for headers, content, back buttons and
  status bars. This is configured centrally instead of only on Home. Custom Exit
  and Done header actions also update with the theme.
- `useAppAlert` preserves native buttons, callbacks and cancellation. It requests
  light/dark appearance on iOS. Android alerts remain system-styled and may look
  different from the app palette; they keep the system's readable text/background
  pairing. App-owned modals use app tokens. Android keyboards likewise follow
  the keyboard app's appearance; iOS receives `keyboardAppearance`.

## Automated verification

Each screen group was checked with the full tests and TypeScript before moving
on. The suite includes 34 tests: existing scoring/persistence tests plus colour
contrast, navigation/button mappings and shallow component-prop checks for all
four themes. Component checks stub native rendering and the theme-hook boundary;
they do not replace a native emulator review. History layout regression checks
also exercise the existing filter callbacks and empty state. Its three filter
rows scroll horizontally without vertical growth or wrapping. New Game keeps its
actions below the scrolling settings in normal layout, reserving the actual
footer height rather than relying on an absolute overlay and a fixed spacer.

```powershell
npm test
npx tsc --noEmit
git diff --check
npx expo export --platform android --output-dir build/milestone-1-1-android
```

## Android review checklist

Start an emulator in Android Studio, then run `npm run android` from this folder.
Repeat these checks for Neon Arena, Clubhouse Paper, Precision Lab and Tournament
Broadcast. Avoid clearing app storage, so existing data remains available.

1. Switch themes on Home. Navigate away and return; force close/reopen and verify
   the theme and saved data persist. Check header titles, back arrows, status-bar
   icons and screen backgrounds for bright flashes or unreadable combinations.
2. New Game: check mode cards, player search, selected players/chips, score and
   format selectors, custom numeric inputs, the fixed footer and disabled Start/
   Clear buttons. Create X01 and practice sessions using the existing flows.
3. Players: open statistics, edit/add a player, hide/unhide, and search/select/clear
   a country in the modal. Check input values, placeholders, cursor selection,
   keyboard visibility, modal rows, and validation alerts.
4. X01: check active-player highlights, scores, empty/filled dart slots, Single/
   Double/Triple selection, numeric keys, Miss/25/Bull labels, advice and Exit
   alerts. Exercise a normal visit, bust, double checkout, undo, long-press Undo
   and end-turn-early. Check disabled controls when a turn has been reopened.
5. Around the Clock: check the current target, completed target tiles, player
   rotation, streaks, Hit/Miss/Undo, exit confirmation and summary. Undo a winning
   dart, return to play, and verify the themed summary's Done action.
6. History: check mode/status/player filters, completed/in-progress/abandoned
   labels, resume/replay/delete actions, and cancel a delete confirmation. Open
   X01 match details, leg timelines, and practice-session details.
7. Statistics: check all time windows, comparison selectors, metric tables and
   empty states. Verify that summaries and not-found/no-active-session states
   remain readable. Increase Android font size and check labels still fit.

## Review before committing

Review `src/theme`, the `AppButton` wrapper, navigation, all screen diffs, the two
theme test files, the test TypeScript config, and this document. No engine, store,
domain, statistics or dependency files should be included. The historical
Milestone 1 document has only a link to this update.

Leave the pre-existing `.idea/workspace.xml` change out of any commit. It is
tracked, so its ignore rule does not protect it from `git add -A`; stage explicit
paths. Generated `build/` artifacts and local helper scripts are ignored.

Existing dependency warnings from Milestone 1 remain outside this change. No
commit, push or merge was performed.
