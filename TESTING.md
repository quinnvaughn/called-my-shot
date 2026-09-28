# Testing

```bash
docker compose up -d postgres-test   # once per machine / after a reboot
pnpm test                            # everything, via turbo
```

`pnpm test` is also the first thing `pnpm run deploy`, `deploy:api` and
`deploy:web` do, so a red test aborts the deploy before flyctl is ever called.

## What runs where

| Package | Needs a DB | Covers |
|---|---|---|
| `packages/scoring` | no | points, contrarian/earliness tiers, tolerance bands, numeric-guess closeness |
| `packages/gifs` | no | every gif pool has a url and alt text, and the random draw |
| `packages/schemas` | no | every zod schema's per-shape rules, and `generateQuestionTitle`'s templates |
| `apps/api` | **yes** | `resolveQuestionInternal`, the lib helpers, and GraphQL operations run against the real schema |

Run one package on its own with `pnpm --filter api test`, or a single file with
`pnpm --filter api exec vitest run src/lib/resolve-question.test.ts`. Add
`--watch` for a watch loop.

## The test database

The API suite runs against a real Postgres, not a mock — the scoring paths it
covers are mostly SQL, and a fake transaction would drift from Drizzle's real
behavior without ever failing.

`docker-compose.yml` provides it on **port 5435** (`called_my_shot_test`),
separate from the dev database on 5433. It is tmpfs-backed, so the container
starts empty every time and nothing survives a restart.

Point the suite somewhere else with `TEST_DATABASE_URL`. An ambient
`DATABASE_URL` is deliberately ignored — see `apps/api/vitest.config.ts`.

**The suite truncates every table between tests.** `src/test/global-setup.ts`
refuses to run against a database whose name doesn't end in `_test`, which is
what stops a stray `TEST_DATABASE_URL` from wiping the dev database.

Each run drops the schema and replays the real migrations with `drizzle-kit
migrate`, so a broken or missing migration fails here rather than at deploy
time.

## Writing a test

`src/test/factories.ts` builds rows with their required parents already wired
up — `makeQuestion()` creates the sport, league and season it needs, and
`seedOptionQuestion()` sets up a question, its options and one call per caller:

```ts
const { question, options, callers } = await seedOptionQuestion({
	callers: [{ optionIndex: 0 }, { optionIndex: 1, conviction: 40 }],
})
```

`src/test/graphql.ts` runs operations against the real built schema.
`expectData` throws on any GraphQL error; use `execute` when the error is the
thing being asserted:

```ts
const data = await expectData(CAST_CALL, { as: user, variables: { input } })
```

Note that the errors plugin returns failures as data (a result union with a
`__typename`), not as GraphQL errors, so mutation tests assert on
`data.someMutation.__typename` rather than on `result.errors`.
