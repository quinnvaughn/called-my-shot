import { availableFlairs } from "../../../lib/flairs/available"
import { builder } from "../../builder"
import { FlairRef } from "./refs"

builder.queryFields((t) => ({
	// Everything the viewer could put in their site-wide slot right now: ~90
	// team flairs plus whatever they've earned. The picker's whole data
	// source, filtered client-side rather than paged.
	//
	// Empty rather than an error for a signed-out viewer. Every other query in
	// this schema resolves plainly and leaves result unions to mutations, and
	// the picker only renders behind the authed layout anyway.
	myFlairs: t.field({
		type: [FlairRef],
		resolve: (_root, _args, ctx) =>
			ctx.user ? availableFlairs(ctx.user.id) : [],
	}),
}))
