# Sneak Drop

A Next.js App Router implementation of a 20-pair limited sneaker release. PostgreSQL is the source of truth through Prisma; no stock, hold, queue, or purchase state is stored in process memory.

## Run locally

1. Start PostgreSQL and create a `sneakdrop` database.
2. Copy `.env.example` to `.env.local` and set `DATABASE_URL`.
3. Install dependencies, generate Prisma Client, apply the schema, and seed data:

```bash
npm install
npm run db:generate
npm run db:migrate
npm run seed
npm run dev
```

The seed command creates the `Afterglow 01` sneaker with 20 pairs and 100 demo users. It prints IDs for the page inputs.

Run the concurrency test with:

```bash
npm test
```

## Architecture

- `prisma/schema.prisma` contains the relational schema, enums, foreign keys, and indexes.
- `src/services/drop.service.ts` owns buying and status reads.
- `src/services/expiration.service.ts` owns safe expiry and FIFO promotion.
- `src/services/payment.service.ts` owns webhook idempotency and purchase conversion.
- Route handlers only validate HTTP input and translate service results.
- The client polls status every three seconds and calculates its countdown from `expiresAt` returned by the server.

### Buy concurrency

`buyPair` runs in a PostgreSQL serializable transaction. It reserves stock with an atomic conditional update whose predicate includes `availableStock > 0`. Serialization conflicts are retried, and once 20 updates succeed, later predicates no longer match. The hold is created in the same transaction, so a successful response cannot expose an inventory decrement without its corresponding hold. The unique partial index on active holds also prevents a second active hold for one user and sneaker.

Queue sequence allocation is stored in PostgreSQL. A production system would use a counter row for high-volume sequence allocation; this assignment uses the last sequence under the same serializable transaction and the unique `(sneakerId, sequenceNumber)` index as its conflict guard.

### Expiration

`POST /api/internal/process-expired-holds` is an intentionally simple worker endpoint. Run it from a scheduler or poll it every few seconds during development. Each worker claims an expiry with a conditional `ACTIVE` update. Only the worker whose update matches can promote the first `WAITING` queue entry or return stock. Re-running the endpoint is therefore safe.

For production, replace the polling endpoint with a durable scheduler and retryable job queue. The database predicates and unique indexes remain necessary even with a job system.

### Payments

`POST /api/payments/webhook` accepts `PENDING`, `SUCCESS`, and `FAILED` events. `paymentId` and `eventId` are unique. A successful payment atomically changes the still-active, unexpired hold to `CONVERTED`, creates one `Purchase` (unique by `holdId` and `paymentId`), increments the user's completed count, and increments `soldStock`.

A late success cannot match the active/unexpired hold predicate and is recorded as `EXPIRED`. A payment already marked `SUCCESS` or `EXPIRED` is ignored. `SUCCESS` is terminal, so a later `PENDING` event cannot move it backwards.

## API

- `POST /api/drop/buy` with `{ userId, sneakerId }`: returns a hold (`201`) or queue entry (`202`).
- `GET /api/drop/status?userId=...&sneakerId=...`: returns stock, completed count, hold expiry, and FIFO queue position.
- `POST /api/payments/webhook`: accepts `{ eventId, paymentId, holdId, userId, status }`.
- `POST /api/internal/process-expired-holds`: processes expired holds. Send `x-worker-secret` when `INTERNAL_WORKER_SECRET` is configured.

## Tests and limitations

The included stress test requires a PostgreSQL test database in `DATABASE_URL`, creates 100 users, and sends all buy requests concurrently, asserting exactly 20 active holds, 80 waiting entries, and non-negative stock. A production test suite should add webhook duplicates, late payment, out-of-order events, repeated expiration workers, queue promotion, purchase limits, and HTTP contract tests.

The fake payment provider is represented by the webhook endpoint: callers can send delayed, duplicated, and out-of-order events directly. A production provider adapter would authenticate signatures, persist raw events, and retry delivery. Authentication is intentionally omitted so the assignment can demonstrate the core concurrency behavior; real deployments must derive the user identity from an authenticated session rather than accepting `userId` from the browser.
