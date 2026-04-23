# Runbook: JWT Signing-Key Rotation

**Related:** ADR-0012, LLD-010  
**Module:** `packages/backend/src/auth/key-ring.ts`

---

## Overview

The backend signs JWTs using HS256. Signing secrets are held in the
`AUTH_JWT_KEYS` environment variable — a JSON object that maps key IDs (`kid`)
to base64-encoded secrets. All keys in `AUTH_JWT_KEYS` can **verify** tokens;
only the key identified by `AUTH_CURRENT_KID` is used to **sign** new tokens.

This split lets you introduce a new key, move all new token issuance to it, and
retire the old key only after every token signed with the old key has expired —
without a service interruption or forced re-login.

---

## When to rotate

- Scheduled rotation (recommend every 90 days in a production environment).
- Suspected key compromise.
- Node version upgrade that requires a native rebuild of the `argon2` binding
  (not strictly required, but a good forcing function for hygiene).

---

## Prerequisites

- Access to the environment variable store (`.env` locally, secret manager in
  production).
- Ability to restart the backend process.
- `openssl` or `node` available on the command line.

---

## Step-by-step procedure

### 1 — Generate the new secret

```bash
# Option A: openssl
openssl rand -base64 32

# Option B: node
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

This produces a 256-bit (32-byte) base64-encoded secret. Copy the output.

### 2 — Add the new key to `AUTH_JWT_KEYS`

`AUTH_JWT_KEYS` is a JSON object. Add the new secret under a new kid (increment
the version number):

```
# Before
AUTH_JWT_KEYS={"v1":"<old-secret>"}
AUTH_CURRENT_KID=v1

# After (new key added, signing key not yet changed)
AUTH_JWT_KEYS={"v1":"<old-secret>","v2":"<new-secret>"}
AUTH_CURRENT_KID=v1
```

**Do not change `AUTH_CURRENT_KID` yet.** The new key is loaded as a verifier
only at this point.

### 3 — Restart the backend

The `KeyRing` constructor reads all keys at startup. After this restart:
- New tokens are still signed with `v1`.
- If a token arrives signed with `v2` (not possible yet), it would also verify.

This step is a no-op from the user's perspective but validates that the new
secret is syntactically correct (startup fails fast if not).

### 4 — Promote the new key to signing

Update the environment:

```
AUTH_JWT_KEYS={"v1":"<old-secret>","v2":"<new-secret>"}
AUTH_CURRENT_KID=v2
```

Restart the backend. From this point:
- New tokens (access + refresh) are signed with `v2`.
- Existing tokens signed with `v1` remain valid until they expire.
- Refresh tokens expire after `AUTH_REFRESH_TTL_SECONDS` (default: 14 days).

### 5 — Wait for old tokens to expire

You must keep `v1` in `AUTH_JWT_KEYS` until no live token signed with it can
still arrive. The safe window is:

```
wait_time = AUTH_REFRESH_TTL_SECONDS + AUTH_CLOCK_SKEW_SECONDS
          = 1209600 + 30
          = 1209630 seconds  (≈ 14 days + 30 seconds)
```

If you rotated at `T`, remove `v1` no earlier than `T + 1209630s`.

### 6 — Remove the old key

```
AUTH_JWT_KEYS={"v2":"<new-secret>"}
AUTH_CURRENT_KID=v2
```

Restart the backend. Any token still signed with `v1` will now receive a `401
INVALID_ACCESS_TOKEN` (or `INVALID_REFRESH_TOKEN`). This is expected — those
tokens are beyond their expiry window.

---

## Rollback

If the new key was misconfigured and users are being rejected:

1. Re-add the previous key to `AUTH_JWT_KEYS` and revert `AUTH_CURRENT_KID`.
2. Restart the backend.

Old tokens are still verifiable as long as the old key is present and within
their TTL.

---

## Verification

After each restart, confirm the backend started cleanly:

```bash
# Check for startup errors
grep -E "Missing required|AUTH_CURRENT_KID|ERROR" <log-file>

# Smoke-test login
curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"operator@example.com","password":"<pw>"}' \
  | jq .tokenType
# Expected: "Bearer"
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Server fails to start with `AUTH_CURRENT_KID not present in AUTH_JWT_KEYS` | `AUTH_CURRENT_KID` points to a kid not in `AUTH_JWT_KEYS`. | Ensure both env vars are updated atomically before restart. |
| Server fails to start with `AUTH_JWT_KEYS[v1] must be >= 256 bits` | Secret decodes to fewer than 32 bytes. | Regenerate with `openssl rand -base64 32` (produces exactly 32 bytes). |
| Users get `401 INVALID_ACCESS_TOKEN` immediately after rotation | Old key removed too soon while live access tokens (TTL 15 min) are still in circulation. | Re-add the old key and wait the full access-token TTL (900 s) before removing. |
| Refresh tokens rejected after rotation | Old key removed before 14-day refresh-token TTL elapsed. | Re-add the old key; wait the full `AUTH_REFRESH_TTL_SECONDS` window. |
| Clock-skew errors on a developer machine | System clock drifted > 30 s from real time. | Sync clock with `sudo sntp -sS time.apple.com` (macOS) or `timedatectl set-ntp true` (Linux). |
