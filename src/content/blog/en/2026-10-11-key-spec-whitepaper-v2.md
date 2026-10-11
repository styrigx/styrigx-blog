---
title: "Styrigx Key Specification Whitepaper v2.0: Three Trust Domains, Passkey Classification, and the Complete Auth Flow"
description: "v2.0 revision: the lock, APP, and main-site trust domains are fully separated; passkeys are classified into lock and app types that cannot be mixed; APP verification no longer goes through main-site step-up; the complete flow from visitor entry to sensitive operations on sub-sites is documented. Supersedes v1.0, which is retained as a historical version."
date: 2026-10-11
lang: en
tags: ["spec", "security", "Cloudflare", "Ed25519", "Passkey"]
---

## 0. Summary

Styrigx consists of one main site (styrigx.com) and several sub-sites (blog, book, and future apps like music), sharing login state under `.styrigx.com`. This specification defines the naming, purpose, storage, issuance, and verification of all signing keys and passkeys across the site group, plus the complete auth flow from visitor entry to sensitive operations on sub-sites.

v1.0 isolated three credential types with three Ed25519 key pairs, but sensitive operations on sub-sites required a main-site step-up first, then an exchange for a sub-site pass — two nested layers. The main-site key governed security settings *and* sat in the issuance chain for APP passes, so one missing configuration could break two unrelated things at once. v2.0 redraws the model as **three non-nested trust domains**:

| Trust domain | Key | Analogy | Governs |
|---|---|---|---|
| Lock domain (LOCK) | `SGX_LOCK_*` | Phone fingerprint unlock | Unlock state across all three sites |
| App domain (APP) | `SGX_APP_*` | Logins on ordinary websites | Specific operations on sub-sites (book upload, delete, cover change) |
| Main-site domain (STEPUP) | `SGX_STEPUP_*` | "Verify identity before changing" in system settings | Only the main site's Security & Privacy core settings |

Six core principles:

1. **One key pair per purpose**, never reused across purposes.
2. **Only the main site issues**; sub-sites only hold public keys. The main-site key's public and private parts stay on the main site.
3. **Three trust domains do not nest**: APP verification does not depend on the main-site key, and the main-site key plays no role in issuing any sub-site credential.
4. **Passkey classification**: lock-type and app-type passkeys are registered and verified separately; the server rejects mixing in both directions.
5. **Missing configuration means rejection** (fail closed); nothing degrades into access.
6. **All credentials expire and are revocable**: the session epoch invalidates every credential at once; the app epoch invalidates one app's credentials independently.

**This document supersedes v1.0, which is retained as a historical version.**

## 1. Scope and Roles

| Role | Description |
|---|---|
| Main site (space) | The sole issuer; holds all private keys and the main-site public key; handles unlock, step-up, APP verification, and passkey management |
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
- **Passwords must never** be exchanged for `sgx-stepup` or `sgx-app`. Passwords only unlock.

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
4. Visitors **cannot** access: password changes and lock-screen passkey management, app verification management, session management, locking all devices, or any of the corresponding APIs — those APIs return `403` to visitors across the board.

### 6.3 Owner Unlock

1. Choose "Passkey": complete WebAuthn with a lock-class passkey. Or choose "Password": submit the owner password.
2. On success the main site issues `sgx-verified` with `role=owner`, valid 12 hours; no further verification is needed on any of the three sites during that window.
3. Password verification **must** be rate-limited: 5 consecutive failures from one IP lock it for 30 seconds. Passwords are stored with PBKDF2-SHA256 and a random salt, compared in constant time. Passkey unlock is not subject to the password rate limit — nobody can lock the owner out by burning through failure counts.

### 6.4 Visitor In-Place Upgrade

1. On the Security & Privacy overview, owner-only entries show a lock icon.
2. When a visitor taps one, **no navigation happens** — an upgrade sheet opens in place, showing only "Passkey" and "Password", never the visitor entry.
3. After verification the main site swaps the current session for an owner session and the page enters the target setting directly.
4. A visitor opening an owner-only path directly, or returning to the homepage with `return=<owner-only path>`, **redirects at most once** and lands on the upgrade sheet. Rationale: "the exclusive page sends the visitor back home, and home sends a valid session back to the original path" forms a redirect loop — one side must terminate it.

### 6.5 Main-Site Security Settings (STEPUP)

These operations require an owner session plus a valid `sgx-stepup`:

- adding/removing lock-class passkeys;
- adding/removing app-class passkeys;
- changing or deleting the password;
- session management.

The flow:

1. An unlocked owner initiates one of these without a valid `sgx-stepup` → the API returns `stepup-required`.
2. The frontend pops a passkey verification that **only accepts lock-class** keys, with UV enforced.
3. On success the main site signs an `sgx-stepup` with the main-site private key (10 minutes); the frontend automatically retries the original operation.
4. After a successful password change, password deletion, or any passkey deletion, `sgx-stepup` is cleared immediately.

Exceptions, each with its reason:

- **First lock-class passkey**: with no lock-class passkey yet, an owner session alone may register — otherwise the first key could never be added.
- **Lock all devices**: an emergency button that only reduces privilege; no extra gate, except visitors are excluded.
- **App-class passkeys have no exception**: registering one always requires `sgx-stepup`, which means a lock-class passkey must exist first.
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

## 7. Storage and Configuration

### 7.1 Per-Site Variables

| Project | Variables |
|---|---|
| Main site | `SGX_LOCK_PRIVATE`, `SGX_APP_PRIVATE`, `SGX_STEPUP_PRIVATE`, `SGX_LOCK_PUBLIC`, `SGX_STEPUP_PUBLIC` |
| blog | `SGX_LOCK_PUBLIC` |
| book | `SGX_LOCK_PUBLIC`, `SGX_APP_PUBLIC` |
| Future sub-sites | `SGX_LOCK_PUBLIC`, `SGX_SITE`; add `SGX_APP_PUBLIC` and join the app whitelist when sensitive operations are needed |

### 7.2 Rules

- Private keys **must** be configured as Secrets. Public keys aren't secret — Text (visible in the console, easy to compare) or Secret both work; when a project's plaintext variables are managed by `wrangler.toml` and the console only allows adding Secrets, use Secret. Either way, public keys **must never** be committed to the repo or `wrangler.toml` — production has exactly one source of truth.
- Sub-sites **must not** contain any `*_PRIVATE` or any `SGX_STEPUP_*`. CI statically checks sub-site sources; any occurrence fails the build.
- The main site's `/api/app-token` chain **must not** reference the main-site key; `sgx-stepup` verification is only allowed in security-settings endpoints. Also CI-checked.
- All three sites can compare lock public-key fingerprints (first 16 hex chars of SHA-256) via the main site's `/api/key-fingerprint` and each site's same-named endpoint — only the public-key hash is exposed.
- Keep a copy of each private key in a password manager, filed under "lock key / APP key / main-site key".
- Production and preview environments use completely separate keys; CI generates throwaway pairs every run.
- Every Pages project with functions **must** set over-quota behavior to **Fail closed**. Rationale: with Fail open, requests bypass functions and serve static assets directly once the free quota is exhausted — equivalent to bypassing the lock screen.

Generation:

```
openssl genpkey -algorithm ed25519 -out <purpose>.key
openssl pkey -in <purpose>.key -pubout -out <purpose>.pub
```

## 8. Revocation: Session Epoch and App Epoch

The main site keeps two kinds of monotonically increasing integers in KV:

| Epoch | KV key | Incremented when | Invalidates |
|---|---|---|---|
| Session epoch | `session-epoch` | lock all devices, password change, password deletion | all three credential types |
| App epoch | `app-epoch:<aud>` | deleting any app-class passkey for that app | that app's `sgx-app` and in-flight upload tasks |

Why a separate app epoch instead of reusing the session epoch: deleting book's key should only invalidate book's passes — not lock every device. Per-app separation also keeps deleting book's key from affecting music's future passes.

Sub-sites fetch the latest values from the main site's `/api/session-epoch` (returns the session epoch plus each app epoch), cached in memory for 60 seconds — so revocation takes effect on sub-sites within 60 seconds at most. If the read fails with no cache, reject. If KV reads error, the endpoint returns `503` — never treated as 0, and never writes a smaller value.

## 9. Failure Behavior (fail closed)

| Situation | Behavior |
|---|---|
| Missing lock public key | pages go to lock screen, APIs 401, only whitelisted paths pass |
| Missing any private key | refuse to issue the corresponding credential, return 500, no downgrade |
| Missing APP public key | all sub-site sensitive operations 403 |
| Missing main-site public or private key | security settings 403 or 500 across the board; lock screen and APP verification unaffected |
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

**Lost passkey** (lost device): unlock with another device or the password → perform one step-up → delete the passkey on the lost device (after deleting a lock-class key, locking all devices is recommended; deleting an app-class key automatically advances the app epoch).

## 11. Acceptance Criteria

Every change touching keys or auth **must** ship with CI-integrated functional tests. "It worked locally" doesn't count.

- Missing variables fail closed.
- Expired, epoch-changed, tampered, forged-signature, and visitor credentials are all rejected.
- Cross-purpose rejection: `sgx-verified` can't stand in for `sgx-app` or `sgx-stepup`; `sgx-stepup` can't stand in for `sgx-app`; aud/scope mismatches rejected.
- Passkey classification: lock-class rejected at `/app-verify/`; app-class rejected at the lock screen; an `aud=book` credential rejected for `aud=music`; registering a non-whitelisted `aud` returns 400.
- Decoupling: an app-class passkey can still mint `sgx-app` with no `sgx-stepup`; adding/removing either passkey class without `sgx-stepup` returns 403.
- Revocation: after deleting an app-class passkey, the old `sgx-app` returns 403 on the sub-site, and in-flight uploads are rejected.
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
| 5 | Visitor scope narrowing and in-place upgrade | In progress |
| 6 | Three-domain split: passkey classification, independent APP verification, app epoch | Planned |
| 7 | CI key-distribution checks | Planned |

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
| `/api/owner-auth` | management-key gate (initial setup), issues 5-minute management token | needs management key |
| `/api/lock` | lock now (current device) | allowed |
| `/api/session-check` | multi-tab session re-check | allowed |
| `/api/session-epoch` | session epoch and app epochs | public |
| `/api/key-fingerprint` | lock public-key fingerprint | public |
| `/api/stepup` | lock-class passkey exchanged for `sgx-stepup` | 403 |
| `/api/owner-password` | `verify` unlocks with password; `set`/`change`/`remove` manage the password (needs `sgx-stepup`) | only `verify` allowed (for upgrade) |
| `/api/owner-passkey` | `auth` unlocks with lock-class passkey; register, list, rename, delete (needs `sgx-stepup`) | only `auth` allowed (for upgrade) |
| `/api/lock-all-devices` | lock all devices | 403 |
| `/api/app-token` | app-class passkey exchanged for `sgx-app` | 403 |

### C. Changelog

| Version | Date | Notes |
|---|---|---|
| v2.0 | 2026-10-11 | Trust model changed to three non-nested domains; APP verification no longer goes through main-site step-up, and the main-site key only governs security settings with its key pair staying on the main site; passkeys split into lock and app classes, one key per app, server rejects mixing both ways; fixed naming for registration; new app epoch — deleting an app-class passkey invalidates that app's credentials; `sgx-app` format gains the app epoch, cookie changed to `SameSite=Lax` with rationale; public keys may be Text or Secret but never enter the repo; new complete auth flow (visitor entry, owner unlock, in-place upgrade, security settings, sub-site operations, lock sync); new Pages Fail-closed requirement, CI key-distribution checks, API reference; expanded acceptance criteria. |
| v1.0 | 2026-10-11 | Initial: three Ed25519 key pairs, naming rules, issuance and verification flow, epoch revocation, fail closed, rotation. |

---

*This document supersedes v1.0, which is retained as a historical version.*

*Agents must read this document before starting any work involving auth or keys. Where it conflicts with the owner's ad-hoc instructions, the owner's latest written confirmation prevails.*
