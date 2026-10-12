---
title: "Styrigx UI Auth Spec 2.0: Three Doors for Lock Screen, Owner, and Apps"
description: "Styrigx UI Auth Spec 2.0: the lock, APP, and main-site trust domains are fully separated; passkeys are classified into lock and app types that cannot be mixed; APP verification no longer goes through main-site step-up; the complete flow from visitor entry to sensitive operations on sub-sites is documented."
date: 2026-10-11
lang: en
series: ["Styrigx UI Auth Spec"]
tags: ["Styrigx UI", "auth", "security", "Passkey", "Cloudflare"]
---

> This is the second edition of the "Styrigx UI Auth Spec" series. The previous edition is [Styrigx Key Specification Whitepaper v1.0](/post/2026-10-11-key-spec-whitepaper/) (Chinese only).

## 0. Summary

Styrigx consists of one main site (styrigx.com) and several sub-sites (blog, book, and future apps like music), sharing login state under `.styrigx.com`. This specification defines the naming, purpose, storage, issuance, and verification of all signing keys and passkeys across the site group, plus the complete auth flow from visitor entry to sensitive operations on sub-sites.

v1.0 isolated three credential types with three Ed25519 key pairs, but sensitive operations on sub-sites required a main-site step-up first, then an exchange for a sub-site pass — two nested layers. The main-site key governed security settings *and* sat in the issuance chain for APP passes, so one missing configuration could break two unrelated things at once. v2.0 redraws the model as **three non-nested trust domains**:

| Trust domain | Key | Analogy | Governs |
|---|---|---|---|
| Lock domain (LOCK) | `SGX_LOCK_*` | Phone fingerprint unlock | Unlock state across all three sites |
| App domain (APP) | `SGX_APP_*` | Logins on ordinary websites | Specific operations on sub-sites (book upload, delete, cover change) |
| Main-site domain (STEPUP) | `SGX_STEPUP_*` | "Verify identity before changing" in system settings | Only the main site's Security & Privacy core settings |

Seven core principles:

1. **One key pair per purpose**, never reused across purposes.
2. **Only the main site issues**; sub-sites only hold public keys. The main-site key's public and private parts stay on the main site.
3. **Three trust domains do not nest**: APP verification does not depend on the main-site key, and the main-site key plays no role in issuing any sub-site credential.
4. **Passkey classification**: lock-type and app-type passkeys are registered and verified separately; the server rejects mixing in both directions.
5. **Missing configuration means rejection** (fail closed); nothing degrades into access.
6. **All credentials expire and are revocable**: the session epoch invalidates every credential at once; the app epoch invalidates one app's credentials independently.
7. **The management key is the root recovery credential**: `OWNER_KEY` (UI label "Management key (recovery)") works even while locked and can issue an owner session and `sgx-stepup`, but never `sgx-app`.

## 1. Scope and Roles

| Role | Description |
|---|---|
| Main site (space) | The sole issuer; holds all private keys, the main-site public key, and the management key `OWNER_KEY`; handles unlock, step-up, APP verification, passkey management, and management-key recovery |
| Sub-site (blog, book, etc.) | Verifies only, never issues; holds only the public keys it needs |
| Owner | The only person who can manage security settings and perform sensitive operations |
| Visitor | Enters via human verification; can browse public content and some read-only pages; all sensitive operations are rejected |
| CI | Generates throwaway test key pairs on every run, written only to preview and test environments |

## 2. Threat Model

This specification defends against:

- **Credential forgery**: constructing a cookie that passes verification without the private key.
- **Credential privilege escalation**: using a low-privilege credential for high-privilege actions, e.g. a visitor session changing settings, an unlock session uploading directly, or book's pass being used on music.
- **Passkey mixing**: using an unlock passkey to approve sub-site operations, or vice versa.
- **Long-lived credentials**: old credentials remaining usable after device loss, cookie leak, or passkey deletion.
- **Sub-site compromise implicating the main site**: a leaked sub-site configuration or code letting an attacker issue credentials.
- **Missing configuration leading to access**: skipped variables at deploy time, or bypassing functions to serve static pages when platform quota is exhausted.
- **Redirect loops and open redirects**: auth redirects bouncing between sites, or the `return` parameter being abused to jump to external sites.
- **Brute force**: repeated password attempts.

Out of scope: the Cloudflare account itself being taken over, the owner's devices being fully compromised, browser zero-days, screenshots.

## 3. Naming

```
SGX_<PURPOSE>_PRIVATE   private key (PKCS8 PEM)
SGX_<PURPOSE>_PUBLIC    public key (SPKI PEM)
```

Local filenames are `<purpose>.key` and `<purpose>.pub`. Names express purpose, not algorithm; the algorithm is uniformly Ed25519.

Three fixed names: **lock key, APP key, main-site key**. "Step-up" remains only as the name of an action ("perform a step-up"), no longer referring to a key.

Exception: the management key keeps the variable name `OWNER_KEY` and the endpoint `/api/owner-auth`; neither is renamed. It is not a signing key pair but a recovery secret held only in a main-site Secret; the UI calls it "Management key (recovery)".

## 4. Three Signing Key Pairs

| Name | Variables | Issues | Lifetime | Private key on | Public key on | Governs |
|---|---|---|---|---|---|---|
| Lock key | `SGX_LOCK_PRIVATE` / `SGX_LOCK_PUBLIC` | `sgx-verified` | owner 12h, visitor 1h | main site | main site, all sub-sites | unlock state across three sites |
| APP key | `SGX_APP_PRIVATE` / `SGX_APP_PUBLIC` | `sgx-app` | 10 min | main site | sub-sites that need it (currently only book) | sensitive operations on sub-sites |
| Main-site key | `SGX_STEPUP_PRIVATE` / `SGX_STEPUP_PUBLIC` | `sgx-stepup` | 10 min | main site | main site | main-site Security & Privacy core settings |

### 4.1 Why Three Pairs, and Why Non-Nested

- **Leak isolation**: a problem with any one pair affects only its own purpose; rotation touches only that pair.
- **Cryptographic privilege separation**: the three credential types are signed with different private keys, so an `sgx-verified` cookie can never pass `sgx-app` or `sgx-stepup` verification. This doesn't depend on type checks in code being written correctly.
- **Failure isolation**: in v1.0, APP passes required an `sgx-stepup` first, so a missing main-site key broke sub-site uploads too. In v2.0, the main-site key only affects security settings; sub-site operations continue normally.
- **Minimal exposure**: the main-site public key exists only on the main site — sub-sites don't even know about it. The APP public key goes only to sub-sites that actually need it.

### 4.2 Credential Format

All credentials are dot-separated strings; the last segment is an Ed25519 signature (base64url) over everything before it:

```
sgx-verified = role.epoch.exp.sig
sgx-stepup   = owner.epoch.iat.exp.sig
sgx-app      = owner.epoch.appEpoch.iat.exp.aud.scope.sig
```

| Field | Meaning |
|---|---|
| `role` | `owner` or `visitor`; `sgx-stepup` and `sgx-app` are only issued to owner |
| `epoch` | session epoch, see §8 |
| `appEpoch` | the app epoch for this `aud`, see §8 |
| `iat` / `exp` | issued-at and expiry (milliseconds) |
| `aud` / `scope` | which sub-site the pass is for and what kind of action, constrained by the main-site whitelist, e.g. `book` / `upload` |

The four-segment `sgx-verified` format is a cross-site contract: when the main site changes the format, every sub-site must update in the same change set. Each of the three repositories has a contract test guarding it — otherwise a sub-site would treat valid sessions as invalid and fall into redirect loops.

### 4.3 Cookie Attributes

| Cookie | Attributes |
|---|---|
| `sgx-verified` | `Domain=.styrigx.com; Path=/; HttpOnly; Secure; SameSite=Lax` |
| `sgx-app` | `Domain=.styrigx.com; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600` |
| `sgx-stepup` | `Domain=.styrigx.com; Path=/; HttpOnly; Secure; SameSite=Strict` |

`sgx-app` uses `Lax` rather than `Strict` because it must travel with the top-level navigation "main-site verification complete → back to sub-site". Forgery protection comes from the signature, `aud`, and the very short lifetime — not from SameSite. `sgx-stepup` is only used within the main site, so `Strict`.

## 5. Passkey Classification

Signing keys answer "who signed this credential"; passkeys (WebAuthn) answer "who approved issuance". v2.0 splits passkeys into two classes:

| Class | `class` | Used for | Can be exchanged for |
|---|---|---|---|
| Lock | `lock` | Unlocking all three sites; step-up for main-site security settings | `sgx-verified` (owner), `sgx-stepup` |
| App | `app` | Approving sensitive operations on one sub-site, one key per app | that app's `sgx-app` |

### 5.1 Mandatory Rules

- Every credential record **must** store `class` server-side; app-class records **must** also store `aud`. All credentials existing before v2.0 are migrated to `lock`.
- Lock-screen auth challenges **must** list only `class=lock` credentials, and the server **must** re-check the class at verification. Rationale: the browser's credential picker is not a security boundary — filtering only on the frontend can be bypassed with a crafted request.
- APP auth challenges **must** list only `class=app` credentials whose `aud` equals the requested `aud`; the server re-checks as well. Book's key cannot open music.
- Authentication **must** require user verification (UV — biometrics or PIN); challenges are isolated per purpose, single-use, and expire after 5 minutes.
- **Passwords must never** be exchanged for `sgx-stepup` or `sgx-app`; passwords only unlock. The management key may be exchanged for `sgx-stepup` (see 6.8) but **must never** be exchanged for `sgx-app`.

### 5.2 Fixed Names at Registration

Password managers (e.g. Samsung Pass) display the username and display name written at registration, and changing them afterwards is painful. Registration parameters are therefore hardcoded — the user fills in nothing:

| Field | Lock class | App class |
|---|---|---|
| `rp.id` | `styrigx.com` | `styrigx.com` |
| `user.displayName` | owner's name (constant) | owner's name (constant) |
| `user.name` | `lock` | the app's `aud`, e.g. `book`, `music` |
| `user.id` | dedicated random value for the lock class | per-`aud` random value |

Distinct `user.id` values make password managers store them as separate entries — at a glance you can tell which key unlocks and which belongs to which app.

### 5.3 App Whitelist

The app list is a configuration on the main site (currently only `book`). Adding an app is one line: `aud`, allowed `scope`s, allowed `return` origin. Registering an `aud` not on the whitelist returns 400; at issuance, any `aud`, `scope`, or `return` not on the whitelist is rejected.

## 6. Complete Auth Flow

This section follows the user's actual journey, step by step, from opening a site to completing a sensitive operation.

### 6.1 Entry and Lock Screen

1. Visiting any site. Each request first passes through that site's middleware, which checks `sgx-verified`: signature, not expired, `epoch` not below the main site's current value.
2. No valid session:
   - Page requests redirect to the main-site lock screen `https://styrigx.com/?lock=1`, carrying the original URL as `return`;
   - API requests return `401` JSON — **never** 302. Rationale: frontend `fetch` silently follows 302s and receives a lock-screen HTML page, surfacing as a baffling "load failed".
3. The lock screen shows only an avatar. Tapping it offers three options: **Verify to enter**, **Passkey**, **Password**.

### 6.2 Visitor Entry

1. Choose "Verify to enter" and complete Cloudflare Turnstile human verification.
2. The main site's `/api/verify` re-checks the result with Cloudflare, then issues `sgx-verified` with `role=visitor`, valid 1 hour.
3. Visitors can access: the desktop and apps, the blog, the book library's public content, Settings and its sub-pages, the Security & Privacy overview, My Files, and "Lock now" (current device only).
4. Visitors **cannot** access: password changes and lock-screen passkey management, app verification management, locking all devices, or the corresponding management APIs, which return `403` to visitors. The only exception is the auth actions needed for in-place upgrade (`verify` on `owner-password`; `challenge` and `auth` on `owner-passkey`): middleware lets them through and the endpoint checks them itself. `register` also reaches the endpoint, which requires an owner session and returns `401`.

### 6.3 Owner Unlock

1. Choose "Passkey": complete WebAuthn with a lock-class passkey. Or choose "Password": submit the owner password.
2. On success the main site issues `sgx-verified` with `role=owner`, valid 12 hours; no further verification is needed on any of the three sites during that window.
3. Password verification **must** be rate-limited: 5 consecutive failures from one IP lock it for 30 seconds. Passwords are stored with PBKDF2-SHA256 and a random salt, compared in constant time. Passkey unlock is not subject to the password rate limit — nobody can lock the owner out by burning through failure counts.
4. If neither works (forgotten password, all lock-class passkeys lost), recover with the management key (recovery); see 6.8.

### 6.4 Visitor In-Place Upgrade

1. On the Security & Privacy overview, owner-only entries show a lock icon.
2. When a visitor taps one, **no navigation happens** — an upgrade sheet opens in place, showing only "Passkey" and "Password", never the visitor entry.
3. After verification the main site swaps the current session for an owner session and the page enters the target setting directly.
4. A visitor opening an owner-only path directly, or returning to the homepage with `return=<owner-only path>`, **redirects at most once** and lands on the upgrade sheet. Rationale: "the exclusive page sends the visitor back home, and home sends a valid session back to the original path" forms a redirect loop — one side must terminate it.

### 6.5 Main-Site Security Settings (STEPUP)

These operations require an owner session plus a valid `sgx-stepup`:

- adding/removing lock-class passkeys;
- adding/removing app-class passkeys;
- setting, changing, or deleting the password.

The flow:

1. An unlocked owner initiates one of these without a valid `sgx-stepup` → the API returns `stepup-required`.
2. The frontend opens verification: a lock-class passkey (**lock-class only**, UV enforced) or the management key (recovery); with no lock-class passkey registered, only the management key is shown.
3. On success the main site signs an `sgx-stepup` with the main-site private key (10 minutes); the frontend automatically retries the original operation.
4. After a successful password change, password deletion, or any passkey deletion, `sgx-stepup` is cleared immediately.

Exceptions, each with its reason:

- **No exception for the first lock-class passkey**: registering any passkey requires an owner session plus `sgx-stepup`. With no lock-class passkey yet, verify with the management key first (it issues both an owner session and `sgx-stepup`), then register the first one. Anonymous registration is not possible even when no lock-class passkey exists (fixed in 2.10.1).
- **Lock all devices**: an emergency button that only reduces privilege; no extra gate, except visitors are excluded.
- **App-class passkeys have no exception**: registering one always requires an owner session plus `sgx-stepup`, which comes from a lock-class passkey or the management key.
- **The last owner unlock method cannot be deleted**: with no password set, the final lock-class passkey cannot be removed.

### 6.6 Sub-Site Sensitive Operations (APP — book upload as example)

1. Before a book upload, deletion, or cover change with no valid `sgx-app`, book redirects to `https://styrigx.com/app-verify/?aud=book&scope=upload&return=<book URL>`.
2. The main site checks: owner session; `aud` and `scope` on the whitelist; `return`'s origin strictly equals the app's registered origin — otherwise rejected.
3. The main site performs WebAuthn with that `aud`'s app-class passkey, UV enforced. If the app has no app-class passkey yet, it prompts "first add book's key under Security & Privacy → App verification" — no password option is offered.
4. On success the frontend calls `POST /api/app-token`. The endpoint requires `Origin: https://styrigx.com` and `Content-Type: application/json` (CSRF protection), signs `sgx-app` with the APP private key, writes the cookie, and returns to `return`. **No `sgx-stepup` is involved at any point.**
5. Book verifies with the APP public key, checking `role=owner`, `aud=book`, `scope`, not expired, and `epoch`/`appEpoch` not below the main site's current values — then performs the operation.
6. Large uploads: the pass is checked only when the upload task is created. The task is registered in book's database for 2 hours along with the `appEpoch` at issuance; subsequent chunks, completion, and cancellation need only an owner session plus a valid task ID, while the registered `appEpoch` is still current. Rationale: large files aren't interrupted by the 10-minute pass expiring, yet deleting the key immediately kills in-flight tasks.

### 6.7 Lock, Lock All Devices, and Multi-Tab Sync

| Action | Who | Effect |
|---|---|---|
| Lock now | owner, visitor | clears the session cookie on the current device only |
| Lock all devices | owner only | session epoch +1; all three credential types on all devices become invalid |

Multi-tab sync **must not** rely on BroadcastChannel, localStorage, or frontend memory. Each tab re-checks its session with the server on `visibilitychange`, `pageshow`, and `focus`. Rationale: tabs across subdomains share no reliable frontend channel — the server is the single source of truth.

### 6.8 Management Key (Recovery)

`OWNER_KEY` is the root recovery credential, used to regain control after forgetting the password or losing every lock-class passkey.

1. `POST /api/owner-auth { key }`: callable while locked (it is on the middleware whitelist); POST only, Origin checked, constant-time comparison.
2. On success it issues both an owner session (`sgx-verified`, 12 hours, equivalent to password or passkey unlock) and `sgx-stepup` (10 minutes, bound to the current session epoch).
3. With those two cookies the owner can reset or delete the password, add or delete lock-class passkeys, and add or delete book's app-class passkeys.
4. It **never** issues `sgx-app`: `/api/app-token` only accepts the single-use record left by app-class passkey auth and never reads `OWNER_KEY`; a CI static test enforces this.
5. Failure rate limits: 5 consecutive failures from one IP lock it for 15 minutes; 20 failures site-wide within an hour pause verification for 1 hour; over the limit returns `429`. Any KV error while reading or writing the counters is a rejection (`503`).
6. Every use (success, failure, or rate-limited) writes an audit record `owner-auth-audit:<ts>:<rand>` to KV with only the time, IP prefix, and outcome, kept for 7 days.
7. Missing `OWNER_KEY`, `SGX_LOCK_PRIVATE`, or `SGX_STEPUP_PRIVATE` means rejection (500 or 503).
8. After changing the management key, redeploy the main site for it to take effect.

## 7. Storage and Configuration

### 7.1 Per-Site Variables

| Project | Variables |
|---|---|
| Main site | `SGX_LOCK_PRIVATE`, `SGX_APP_PRIVATE`, `SGX_STEPUP_PRIVATE`, `SGX_LOCK_PUBLIC`, `SGX_STEPUP_PUBLIC`, `SGX_APP_PUBLIC` (only for the `/api/diag-keys` self-check), `OWNER_KEY`, `SGX_SITE=space` |
| blog | `SGX_LOCK_PUBLIC`, `SGX_SITE=blog` |
| book | `SGX_LOCK_PUBLIC`, `SGX_APP_PUBLIC`, `SGX_SITE=book` |
| Future sub-sites | `SGX_LOCK_PUBLIC`, `SGX_SITE`; add `SGX_APP_PUBLIC` and join the app whitelist when sensitive operations are needed |

### 7.2 Rules

- Private keys **must** be configured as Secrets. Public keys aren't secret — Text (visible in the console, easy to compare) or Secret both work; when a project's plaintext variables are managed by `wrangler.toml` and the console only allows adding Secrets, use Secret. Either way, public keys **must never** be committed to the repo or `wrangler.toml` — production has exactly one source of truth.
- Sub-sites **must not** contain any `*_PRIVATE`, any `SGX_STEPUP_*`, or `OWNER_KEY`; they hold public keys only. CI statically checks sub-site sources; any occurrence fails the build. A missing or wrong `SGX_SITE` fails closed: blog always redirects to the main-site lock screen, book always returns `500`.
- The main site's `/api/app-token` chain **must not** reference the main-site key or `OWNER_KEY`; `sgx-stepup` verification is only allowed in the `owner-passkey`, `owner-password`, and `stepup` endpoints. Enforced by static tests in CI.
- All three sites can compare lock public-key fingerprints (first 16 hex chars of SHA-256) via the main site's `/api/key-fingerprint` and each site's same-named endpoint — only the public-key hash is exposed.
- Keep a copy of each private key in a password manager, filed under "lock key / APP key / main-site key".
- Production and preview environments use completely separate keys; CI generates throwaway pairs every run.
- Every Pages project with functions **must** set over-quota behavior to **Fail closed**. Rationale: with Fail open, requests bypass functions and serve static assets directly once the free quota is exhausted — equivalent to bypassing the lock screen. All three projects (space, blog, book) are set to Fail closed.

Generation:

```
openssl genpkey -algorithm ed25519 -out <purpose>.key
openssl pkey -in <purpose>.key -pubout -out <purpose>.pub
```

## 8. Revocation: Session Epoch and App Epoch

The main site keeps two kinds of monotonically increasing integers in KV:

| Epoch | KV key | Incremented when | Invalidates |
|---|---|---|---|
| Session epoch | `session-epoch` | lock all devices, setting or changing the password, password deletion, deleting a lock-class passkey | all three credential types |
| App epoch | `app-epoch:<aud>` | deleting any app-class passkey for that app (advances only the app epoch, not the session epoch) | that app's `sgx-app` and in-flight upload tasks |

Why a separate app epoch instead of reusing the session epoch: deleting book's key should only invalidate book's passes — not lock every device. Per-app separation also keeps deleting book's key from affecting music's future passes.

Sub-sites fetch the latest values from the main site's `/api/session-epoch` (returns the session epoch plus each app epoch), cached in memory for 60 seconds — so revocation takes effect on sub-sites within 60 seconds at most. If the read fails with no cache, reject. If KV reads error, the endpoint returns `503` — never treated as 0, and never writes a smaller value.

## 9. Failure Behavior (fail closed)

| Situation | Behavior |
|---|---|
| Missing lock public key | pages go to lock screen, APIs 401, only whitelisted paths pass |
| Missing any private key | refuse to issue the corresponding credential, return 500, no downgrade |
| Missing APP public key | all sub-site sensitive operations 403 |
| Missing main-site public or private key | security settings 403 or 500 across the board, and management-key recovery is refused (500); lock-screen unlock and APP verification unaffected |
| Missing `OWNER_KEY` | `/api/owner-auth` returns 500 |
| KV error on management-key rate-limit counters | 503, rejected |
| Sub-site `SGX_SITE` missing or wrong | blog redirects to lock screen, book returns 500 |
| Unauthenticated call to `/api/diag-keys` | 401 |
| Epoch unreachable with no cache | reject |
| KV read error | 503, no writes |
| Bad signature, expired, stale epoch, aud/scope mismatch, role not owner | reject |
| Passkey class or aud mismatch | reject |
| `return` not on whitelist | reject, no redirect |
| Platform quota exhausted | Fail closed, no static pages |

There is no "unconfigured means allow" switch anywhere, and tests never pass by way of allowing.

## 10. Rotation and Incident Response

**Planned rotation** (yearly recommended, or when devices or collaboration change):

1. Generate a new key pair.
2. Configure the new private and public keys on the corresponding projects.
3. Deploy the main site, then the sub-sites.
4. Increment the session epoch (or just the app epoch when rotating the APP key) to invalidate old credentials.
5. Re-unlock all devices, confirm everything works, then delete the old key from the password manager.

**Emergency rotation** (suspected private-key leak): run steps 1–4 immediately — rotate first, investigate after. Only rotate the affected pair; leave the other two alone.

**Lost passkey** (lost device): unlock with another device or the password → perform one step-up → delete the passkey on the lost device (deleting a lock-class key automatically advances the session epoch, so every device must unlock again; deleting an app-class key advances only that app's epoch). If every unlock method is lost, enter with the management key (recovery), then reset the password or register a new lock-class passkey.

**Management-key rotation**: replace `OWNER_KEY` in the main-site Secret and redeploy the main site. Credentials already issued are unaffected; to invalidate them too, lock all devices afterwards.

## 11. Acceptance Criteria

Every change touching keys or auth **must** ship with CI-integrated functional tests. "It worked locally" doesn't count.

- Missing variables fail closed.
- Expired, epoch-changed, tampered, forged-signature, and visitor credentials are all rejected.
- Cross-purpose rejection: `sgx-verified` can't stand in for `sgx-app` or `sgx-stepup`; `sgx-stepup` can't stand in for `sgx-app`; aud/scope mismatches rejected.
- Passkey classification: lock-class rejected at `/app-verify/`; app-class rejected at the lock screen; an `aud=book` credential rejected for `aud=music`; registering a non-whitelisted `aud` returns 400.
- Decoupling: an app-class passkey can still mint `sgx-app` with no `sgx-stepup`; registering either passkey class without an owner session returns 401 (including when no lock-class passkey exists); adding/removing either class without `sgx-stepup` returns 403.
- Revocation: after deleting an app-class passkey, the old `sgx-app` returns 403 on the sub-site, and in-flight uploads are rejected.
- Management key: correct → owner session plus `sgx-stepup`; wrong → 401 and counted; over the limit → 429; missing `OWNER_KEY` or `SGX_STEPUP_PRIVATE` → rejected; KV errors fail closed; every use writes an audit record; `/api/app-token` never references `OWNER_KEY`.
- Deleting an app-class passkey advances only `app-epoch:<aud>`, never the session epoch.
- Self-check: `/api/diag-keys` returns 401 when unauthenticated; matched pairs return true, mismatched false, missing "missing".
- Registration parameters: `user.displayName` is the owner's name; `user.name` is `lock` and the corresponding `aud`.
- Visitor scope: visitors can open Settings, the security overview, and My Files, and can lock now; owner-only paths redirect at most once and land on the upgrade sheet; owner-only APIs return 403 to visitors.
- Cross-site contract: an `sgx-verified` issued by the main site parses on every sub-site.
- Valid credentials pass; uploads complete after the pass expires.

The merge bar is a fully green production CI. Fix the implementation — **never** rewrite tests to accommodate it; visual-baseline changes can't substitute for functional assertions.

## 12. Implementation Roadmap

| Phase | Content | Status |
|---|---|---|
| 0 | Lock key (three-site unlock) live | Done |
| 1 | Unified rename to `SGX_<PURPOSE>_*` | Done |
| 2 | Session roles (owner / visitor) | Done |
| 3 | Main-site key: issuance, verification, wired into main-site sensitive operations | Done |
| 4 | APP key with book upload (v1.0 approach via main-site step-up) | Done, superseded by phase 6 |
| 5 | Visitor scope narrowing and in-place upgrade | Done |
| 6 | Three-domain split: passkey classification, independent APP verification, app epoch | Done (2.10.0) |
| 7 | CI key-distribution checks | Done (2.10.0) |
| 8 | Management key as root recovery credential, anonymous registration closed, key self-check `/api/diag-keys` | Done (2.10.1) |

## Appendix

### A. Glossary

- **Ed25519**: an elliptic-curve signature algorithm — short keys, fast verification, no extra parameters.
- **Passkey**: a WebAuthn passwordless credential; the private key stays on the device or in a password manager, the site keeps only the public key.
- **UV (User Verification)**: requiring the person's biometrics or PIN at authentication — not just "the device is present".
- **Fail closed**: refusing on error or missing configuration, rather than allowing.
- **Session epoch / app epoch**: monotonically increasing integers used to invalidate issued credentials in one shot.
- **aud / scope**: the pass's intended audience and purpose.
- **Turnstile**: Cloudflare's human verification; this site uses it only to issue visitor sessions.

### B. API Reference (Main Site)

| Endpoint | Purpose | Visitor |
|---|---|---|
| `/api/verify` | Turnstile re-check, issues visitor session | allowed |
| `/api/owner-auth` | management key (recovery): works while locked, issues owner session plus `sgx-stepup` (10 min), never `sgx-app`; rate-limited on failure, every use audited | allowed (needs management key) |
| `/api/lock` | lock now (current device) | allowed |
| `/api/session-check` | multi-tab session re-check | allowed |
| `/api/session-epoch` | session epoch and app epochs | public |
| `/api/key-fingerprint` | lock public-key fingerprint | public |
| `/api/stepup` | lock-class passkey exchanged for `sgx-stepup` | 403 |
| `/api/owner-password` | `verify` unlocks with password; `set`/`change`/`remove` manage the password (needs `sgx-stepup`) | only `verify` allowed (for upgrade) |
| `/api/owner-passkey` | `auth` unlocks with lock-class passkey; register, list, rename, delete (needs `sgx-stepup`) | only `challenge` and `auth` allowed (for upgrade) |
| `/api/lock-all-devices` | lock all devices | 403 |
| `/api/app-token` | app-class passkey exchanged for `sgx-app` | 403 |
| `/api/diag-keys` | key-pair self-check for all three pairs, returns only true / false / "missing" | 401 (owner session only) |

### C. Changelog

| Version | Date | Notes |
|---|---|---|
| v2.0 | 2026-10-11 | Trust model changed to three non-nested domains; APP verification no longer goes through main-site step-up, and the main-site key only governs security settings with its key pair staying on the main site; passkeys split into lock and app classes, one key per app, server rejects mixing both ways; fixed naming for registration; new app epoch — deleting an app-class passkey invalidates that app's credentials; `sgx-app` format gains the app epoch, cookie changed to `SameSite=Lax` with rationale; public keys may be Text or Secret but never enter the repo; new complete auth flow (visitor entry, owner unlock, in-place upgrade, security settings, sub-site operations, lock sync); new Pages Fail-closed requirement, CI key-distribution checks, API reference; expanded acceptance criteria; the management key (`OWNER_KEY`, UI label "Management key (recovery)") becomes the root recovery credential; registering any passkey requires an owner session plus `sgx-stepup`, and the first-lock-key exception is removed; deleting an app-class passkey advances only the app epoch; `/api/diag-keys` added. |
| v1.0 | 2026-10-11 | Initial: three Ed25519 key pairs, naming rules, issuance and verification flow, epoch revocation, fail closed, rotation. |

---

*This document supersedes v1.0, which is retained as a historical version.*

*Agents must read this document before starting any work involving auth or keys. Where it conflicts with the owner's ad-hoc instructions, the owner's latest written confirmation prevails.*
