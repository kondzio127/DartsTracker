# Milestone 1: tests and themes

The current X01 and Around the Clock engines and game-store persistence format
are unchanged. The app remains offline-first; no SQLite, server or sync is added.

## Architecture

- `src/engine` holds rules without React or storage. Tests exercise scoring,
  double-out busts/checkouts, editable undo, visit rotation and checkout advice.
- `src/store/gameStore.ts` coordinates automatic commits, history, turn rotation
  and undo. Store tests run real Zustand with an in-memory replacement for native
  AsyncStorage. They never connect to an emulator or erase real user saves.
- `src/theme/themes.ts` defines semantic colour tokens for all four themes.
  For example, `foreground` means readable content text; a screen does not need
  to know which hex value each theme uses.
- `themeStore.ts` persists only the selected ID under `darts-tracker-theme-v1`.
  It uses a separate key from existing game data, so it needs no game-data
  migration. Invalid saved IDs fall back to Neon Arena.
- Home uses `ThemedButton` and `ThemePicker`. Existing screens keep `AppButton`
  and their current light surfaces. Migrate each screen's text and backgrounds
  together later, then consolidate the button implementations.
- Home retains separate resume actions for X01 and practice, including when
  both are active. Its status bar style applies only while Home is focused.

## Running checks

```powershell
npm install
npm test
npx tsc --noEmit
npx expo install --check
npx expo export --platform android --output-dir build/milestone-1-android
```

Tests compile TypeScript into ignored `build/engine-tests` and run Node's built-in
test runner. No new dependencies or Babel configuration are needed. Use a modern
Node version with built-in `node --test` support; this change was checked on
Node 25.6.1. This suite checks logic and persistence, not native rendering.

## Android manual review

1. Start your Android virtual device from Android Studio's Device Manager.
2. From the project folder run `npm run android`. If Metro is already running,
   press `a` in that terminal. Use the Expo Go version compatible with SDK 54.
3. On Home, select Neon Arena, Clubhouse Paper, Precision Lab and Tournament
   Broadcast. Check labels, selected indicators, scrolling and text readability.
4. Force close and reopen the app without clearing storage. Confirm the selected
   theme, existing players, history and active sessions remain available.
5. Play X01: enter three darts, undo to reopen the visit, undo again to remove
   its last dart, then correct it. Check overscoring, leaving one, double checkout
   and match summaries. Completed legs are finalized by the screen immediately;
   tests that undo a checkout do so before that finalization.
6. Play Around the Clock with two players. Check three-dart rotation, hit/miss,
   undo across a turn boundary, completion and history. Check both resume actions
   if X01 and practice are active together.
7. Visit Players, New Game and History under each Home theme. Existing screens
   should keep their current readable appearance.

If `adb` cannot be found, ensure Android Studio's SDK is installed and its
`platform-tools` directory is on PATH, then reopen the terminal.

## Before committing

Review `git diff` and the new files under `src/theme`, `tests`, this document,
and `tsconfig.engine-tests.json`. Stage these explicitly along with `package.json`
and Home. Leave the pre-existing `.idea/workspace.xml` change out of this commit.
Generated `build/` files should remain ignored. No commit, push or merge is made.

At implementation time `npm install` reported 35 dependency vulnerabilities
(2 low, 14 moderate, 17 high, 2 critical). Expo's compatibility check requested
`expo ~54.0.37` while the installed version was 54.0.33. These dependency findings
remain for a separate review; no automatic or forced upgrades were applied.
