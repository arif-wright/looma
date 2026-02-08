# Core Smoke Tests

This document covers quick manual checks for the core runtime paths:

- events ingest
- game session start
- game session complete

## Prerequisites

1. Start the app locally (`npm run dev`).
2. Authenticate in browser.
3. Copy auth cookies into a cookie jar file (or run curls from an authenticated session environment).
4. Set base URL:

```bash
export BASE_URL="http://localhost:3000"
```

## 1) Events: ingest

```bash
curl -i -X POST "$BASE_URL/api/events/ingest" \
  -H "content-type: application/json" \
  -b cookies.txt \
  --data '{
    "type":"game.session.start",
    "payload":{"gameId":"runner","mode":"standard"},
    "meta":{"sessionId":"00000000-0000-0000-0000-000000000001"}
  }'
```

Expected:

- HTTP `200`
- JSON `{ "ok": true, ... }`

## 2) Games: start session

```bash
curl -i -X POST "$BASE_URL/api/games/session/start" \
  -H "content-type: application/json" \
  -b cookies.txt \
  --data '{
    "gameId":"runner",
    "mode":"standard",
    "clientMeta":{"clientVersion":"1.0.0","source":"smoke"}
  }'
```

Expected fields:

- `sessionId`
- `nonce` / `serverNonce`
- `startedAt`
- `caps`

## 3) Games: sign completion

Use the `sessionId` + `nonce` from step 2:

```bash
curl -sS -X POST "$BASE_URL/api/games/sign" \
  -H "content-type: application/json" \
  -b cookies.txt \
  --data '{
    "sessionId":"<SESSION_ID>",
    "slug":"runner",
    "score":250,
    "durationMs":20000,
    "nonce":"<NONCE>",
    "clientVersion":"1.0.0"
  }'
```

Expected:

- `signature`

## 4) Games: complete session

```bash
curl -i -X POST "$BASE_URL/api/games/session/complete" \
  -H "content-type: application/json" \
  -b cookies.txt \
  --data '{
    "sessionId":"<SESSION_ID>",
    "results":{"score":250,"durationMs":20000,"success":true,"stats":{"source":"smoke"}},
    "nonce":"<NONCE>",
    "signature":"<SIGNATURE>",
    "clientVersion":"1.0.0"
  }'
```

Expected:

- HTTP `200`
- reward fields including `xpDelta` and `currencyDelta`
- `rewardsGranted` summary

## 5) Negative sanity checks

1. Retry step 4 with same payload:
   - expect conflict / already completed session.
2. Send excessive score or invalid duration:
   - expect validation error (`invalid_score`, `invalid_duration`, or score-rate rejection).
