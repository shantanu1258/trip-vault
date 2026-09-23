# Invitation signup acceptance

This frontend-only change works with the current Supabase signup configuration: **email confirmation disabled**. No SQL migration, Edge Function, email-template edit, custom mail server or special callback configuration is required. Hosted Auth settings are unchanged. Email-code verification can be implemented separately when the mail setup is ready.

## Behavior

1. A signed-out recipient opens the private invitation link or scans its QR.
2. The app remembers the code in that browser, so browsing the welcome/demo pages, refreshing, closing/reopening the app or signing up later does not lose it.
3. Signup with the existing confirmation-disabled setting immediately establishes a session. Ordinary sign-in works too.
4. After authentication, the recipient sees the same **Join trip** screen as an already-signed-in recipient, with the code prefilled.
5. Pressing **Join trip** validates the code on the server and, if valid, adds the correct traveler/helper membership and role.

## Lifetime and privacy

- Only one pending invitation is retained. A newer valid invitation replaces the older one.
- The localStorage record expires at most 14 days after first opening; reopening the same code does not extend this. The server still enforces the original code's expiry, revocation and one-use status.
- The remembered record is removed when the Join trip screen is presented. It will not keep interrupting navigation or silently join a different account on a shared browser.
- A different browser/device, cleared site data or blocked storage requires reopening the original invite. The direct link still works without browser storage.
- No invitation is written to account metadata or IndexedDB. No passwords or email verification codes are stored by this feature.
- Admin sign-in does not resume or consume a personal-trip invite.

## Test on the deployed app

Use a disposable trip and a consenting test account.

1. Open a fresh invitation while signed out. Visit another app page, refresh, then return to signup.
2. Create an account. With confirmation still disabled, verify that the prefilled Join trip screen appears immediately.
3. Confirm Join trip and check that the organizer sees the intended traveler/helper and permission level.
4. Repeat with an existing account, initially signed out. Repeat again while already signed in.
5. Use an expired/revoked/used code. It must show a generic error without retry loops and allow a replacement code.
6. Use Back from Join trip. It must allow leaving instead of forcing the invitation again.
7. Check that Admin login does not consume a pending invite.

Local integration tests mock signup/sign-in and redemption; they cover navigation, refresh, immediate signup, later login from the normal home page, auth-state races, manual confirmation, error recovery, expiry, blocked storage and admin isolation. Real hosted membership creation and phone acceptance remain separate checks.
