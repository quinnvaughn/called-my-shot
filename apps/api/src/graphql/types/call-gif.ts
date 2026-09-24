import { requireAdmin } from "../../lib/auth"
import { AuthenticationError, AuthorizationError } from "../../lib/errors"
import {
	emptyGifPools,
	type GifHealthRow,
	loadGifHealth,
} from "../../lib/gif-health"
import { builder } from "../builder"

const GifHealthRowRef = builder
	.objectRef<GifHealthRow>("AdminGifHealthRow")
	.implement({
		fields: (t) => ({
			state: t.exposeString("state"),
			url: t.exposeString("url"),
			alt: t.exposeString("alt"),
			// Null when nothing answered - see the comment on GifHealthRow.
			status: t.exposeInt("status", { nullable: true }),
			ok: t.exposeBoolean("ok"),
			error: t.exposeString("error", { nullable: true }),
		}),
	})

const GifHealthReportRef = builder
	.objectRef<{ rows: GifHealthRow[]; emptyStates: string[] }>(
		"AdminGifHealthReport",
	)
	.implement({
		fields: (t) => ({
			rows: t.field({ type: [GifHealthRowRef], resolve: (r) => r.rows }),
			// States with no gif at all. They can't appear in `rows` - there is
			// no url to check - but a state that renders nothing is as broken
			// as one whose url is gone.
			emptyStates: t.exposeStringList("emptyStates"),
		}),
	})

// The gif pools are hotlinked from cdns we don't control, so they rot quietly:
// a dead url just means a call page shows no reaction. Nothing else would
// ever surface that. See lib/gif-health.ts for why the check runs live rather
// than out of a table a cron fills.
builder.queryFields((t) => ({
	adminGifHealth: t.field({
		type: GifHealthReportRef,
		errors: { types: [AuthenticationError, AuthorizationError] },
		resolve: async (_root, _args, ctx) => {
			requireAdmin(ctx)
			return { rows: await loadGifHealth(), emptyStates: emptyGifPools() }
		},
	}),
}))
