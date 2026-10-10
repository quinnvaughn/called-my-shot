import {
	createUpdateImageUploadSchema,
	slugify,
	updateInputSchema,
} from "@called-my-shot/schemas"
import {
	and,
	count,
	desc,
	eq,
	isNotNull,
	isNull,
	like,
	or,
	sql,
} from "drizzle-orm"
import { db } from "../../db"
import { type Update, updateEmails, updates } from "../../db/schema"
import { requireAdmin } from "../../lib/auth"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../lib/errors"
import { newImageKey, verifyUploadedImage } from "../../lib/images"
import {
	imageUrl,
	isStorageConfigured,
	type PresignedUpload,
	presignImagePut,
} from "../../lib/storage"
import {
	enqueueUpdateEmails,
	sendUpdateTestEmail,
} from "../../lib/update-email"
import { builder } from "../builder"
import { parseInput } from "../helpers"
import { UploadHeaderRef } from "./image"

// The slug a post keeps for good once it's first published. Appends -2, -3,
// ... until it's free, the way generateUniqueBallotSlug does.
async function uniqueSlug(title: string): Promise<string> {
	const base = slugify(title) || "update"
	const taken = await db
		.select({ slug: updates.slug })
		.from(updates)
		.where(or(eq(updates.slug, base), like(updates.slug, `${base}-%`)))
	const used = new Set(taken.map((row) => row.slug))
	if (!used.has(base)) return base
	let suffix = 2
	while (used.has(`${base}-${suffix}`)) suffix++
	return `${base}-${suffix}`
}

async function findUpdate(id: string): Promise<Update> {
	const update = await db.query.updates.findFirst({ where: { id } })
	if (!update) throw new NotFoundError("Update not found")
	return update
}

const UpdateEmailProgressRef = builder
	.objectRef<{ sent: number; skipped: number; pending: number }>(
		"UpdateEmailProgress",
	)
	.implement({
		fields: (t) => ({
			sent: t.exposeInt("sent"),
			// Unsubscribed or bounced between pressing send and the batch.
			skipped: t.exposeInt("skipped"),
			pending: t.exposeInt("pending"),
		}),
	})

const UpdateRef = builder.objectRef<Update>("Update").implement({
	fields: (t) => ({
		id: t.exposeID("id"),
		title: t.exposeString("title"),
		summary: t.exposeString("summary"),
		// Markdown.
		body: t.exposeString("body"),
		slug: t.exposeString("slug", { nullable: true }),
		coverImageKey: t.exposeString("coverImageKey", { nullable: true }),
		coverImageUrl: t.string({
			nullable: true,
			resolve: (update) => imageUrl(update.coverImageKey),
		}),
		publishedAt: t.expose("publishedAt", { type: "DateTime", nullable: true }),
		emailedAt: t.expose("emailedAt", { type: "DateTime", nullable: true }),
		createdAt: t.expose("createdAt", { type: "DateTime" }),
		// Admins only; null for everyone else and before it's been sent.
		emailProgress: t.field({
			type: UpdateEmailProgressRef,
			nullable: true,
			resolve: async (update, _args, ctx) => {
				if (!ctx.user?.isAdmin || !update.emailedAt) return null
				const [row] = await db
					.select({
						sent: count(
							sql`case when ${updateEmails.sentAt} is not null and ${updateEmails.skippedReason} is null then 1 end`,
						),
						skipped: count(updateEmails.skippedReason),
						pending: count(
							sql`case when ${updateEmails.sentAt} is null then 1 end`,
						),
					})
					.from(updateEmails)
					.where(eq(updateEmails.updateId, update.id))
				return row ?? { sent: 0, skipped: 0, pending: 0 }
			},
		}),
	}),
})

const UpdateImageUploadRef = builder
	.objectRef<PresignedUpload & { key: string; publicUrl: string | null }>(
		"UpdateImageUpload",
	)
	.implement({
		fields: (t) => ({
			// What to save as the cover image key.
			key: t.exposeString("key"),
			uploadUrl: t.exposeString("url"),
			headers: t.field({
				type: [UploadHeaderRef],
				resolve: (upload) => upload.headers,
			}),
			// Where the image will be served once uploaded, for the body's
			// markdown.
			publicUrl: t.exposeString("publicUrl", { nullable: true }),
		}),
	})

const UpdateInput = builder.inputType("UpdateInput", {
	fields: (t) => ({
		title: t.string({ required: true }),
		summary: t.string({ required: true }),
		body: t.string({ required: true }),
		coverImageKey: t.string({ required: false }),
	}),
})

const CreateUpdateImageUploadInput = builder.inputType(
	"CreateUpdateImageUploadInput",
	{
		fields: (t) => ({
			contentType: t.string({ required: true }),
			contentLength: t.int({ required: true }),
		}),
	},
)

async function parseUpdateInput(
	input: unknown,
	previousCoverKey?: string | null,
) {
	const data = parseInput(updateInputSchema, input)
	const coverImageKey = data.coverImageKey || null
	if (coverImageKey && coverImageKey !== previousCoverKey) {
		await verifyUploadedImage({ kind: "update" }, coverImageKey)
	}
	return {
		title: data.title,
		summary: data.summary,
		body: data.body,
		coverImageKey,
	}
}

const adminErrors = [AuthenticationError, AuthorizationError]
const adminEntityErrors = [
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
]

builder.queryFields((t) => ({
	// Published, newest first.
	updates: t.field({
		type: [UpdateRef],
		resolve: () =>
			db
				.select()
				.from(updates)
				.where(isNotNull(updates.publishedAt))
				.orderBy(desc(updates.publishedAt)),
	}),

	update: t.field({
		type: UpdateRef,
		nullable: true,
		args: { slug: t.arg.string({ required: true }) },
		resolve: async (_root, args) => {
			const [update] = await db
				.select()
				.from(updates)
				.where(and(eq(updates.slug, args.slug), isNotNull(updates.publishedAt)))
				.limit(1)
			return update ?? null
		},
	}),

	// Every post including drafts: drafts first, then newest published.
	adminUpdates: t.field({
		type: [UpdateRef],
		errors: { types: adminErrors },
		resolve: (_root, _args, ctx) => {
			requireAdmin(ctx)
			return db
				.select()
				.from(updates)
				.orderBy(desc(updates.publishedAt), desc(updates.createdAt))
		},
	}),

	adminUpdate: t.field({
		type: UpdateRef,
		errors: { types: adminEntityErrors },
		args: { id: t.arg.id({ required: true }) },
		resolve: (_root, args, ctx) => {
			requireAdmin(ctx)
			return findUpdate(String(args.id))
		},
	}),
}))

builder.mutationFields((t) => ({
	createUpdate: t.field({
		type: UpdateRef,
		errors: {
			types: adminErrors,
			directResult: true,
			union: { name: "CreateUpdateResult" },
		},
		args: { input: t.arg({ type: UpdateInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const data = await parseUpdateInput(args.input)
			const [update] = await db.insert(updates).values(data).returning()
			if (!update) throw new Error("update insert returned no row")
			return update
		},
	}),

	// Allowed after publishing and after emailing: the page shows the edit,
	// and anyone still waiting in the send queue gets the edited version.
	editUpdate: t.field({
		type: UpdateRef,
		errors: {
			types: adminEntityErrors,
			directResult: true,
			union: { name: "EditUpdateResult" },
		},
		args: {
			id: t.arg.id({ required: true }),
			input: t.arg({ type: UpdateInput, required: true }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const current = await findUpdate(String(args.id))
			const data = await parseUpdateInput(args.input, current.coverImageKey)
			const [update] = await db
				.update(updates)
				.set(data)
				.where(eq(updates.id, current.id))
				.returning()
			if (!update) throw new NotFoundError("Update not found")
			return update
		},
	}),

	// Unpublishing takes the page down and stops any of its emails that
	// haven't gone out yet. The slug stays, so publishing again brings back
	// the same url.
	setUpdatePublished: t.field({
		type: UpdateRef,
		errors: {
			types: adminEntityErrors,
			directResult: true,
			union: { name: "SetUpdatePublishedResult" },
		},
		args: {
			id: t.arg.id({ required: true }),
			published: t.arg.boolean({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const current = await findUpdate(String(args.id))
			const set = args.published
				? {
						publishedAt: current.publishedAt ?? new Date(),
						slug: current.slug ?? (await uniqueSlug(current.title)),
					}
				: { publishedAt: null }
			const [update] = await db
				.update(updates)
				.set(set)
				.where(eq(updates.id, current.id))
				.returning()
			if (!update) throw new NotFoundError("Update not found")
			return update
		},
	}),

	// Only a post that was never emailed: one that was is linked from people's
	// inboxes, so it's unpublished instead.
	deleteUpdate: t.field({
		type: "Boolean",
		errors: {
			types: adminErrors,
			union: { name: "DeleteUpdateResult" },
		},
		args: { id: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const deleted = await db
				.delete(updates)
				.where(and(eq(updates.id, String(args.id)), isNull(updates.emailedAt)))
				.returning({ id: updates.id })
			if (deleted.length === 0) {
				throw ValidationError.field(
					null,
					"This update was already emailed. Unpublish it instead.",
				)
			}
			return true
		},
	}),

	createUpdateImageUpload: t.field({
		type: UpdateImageUploadRef,
		errors: {
			types: adminErrors,
			directResult: true,
			union: { name: "CreateUpdateImageUploadResult" },
		},
		args: {
			input: t.arg({ type: CreateUpdateImageUploadInput, required: true }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const input = parseInput(createUpdateImageUploadSchema, args.input)
			if (!isStorageConfigured()) {
				throw ValidationError.field(
					null,
					"Image uploads aren't available right now.",
				)
			}
			const key = newImageKey({ kind: "update" }, input.contentType)
			const upload = await presignImagePut(
				key,
				input.contentType,
				input.contentLength,
			)
			return { key, publicUrl: imageUrl(key), ...upload }
		},
	}),

	// Mails the requesting admin the email as it would go out. Works on
	// drafts.
	sendUpdateTestEmail: t.field({
		type: "Boolean",
		errors: {
			types: adminEntityErrors,
			union: { name: "SendUpdateTestEmailResult" },
		},
		args: { id: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const admin = requireAdmin(ctx)
			const result = await sendUpdateTestEmail({
				updateId: String(args.id),
				userId: admin.id,
				to: admin.email,
			})
			if (!result.ok) throw ValidationError.field(null, result.error)
			return true
		},
	}),

	// Queues the email for everyone subscribed. Once per update. Returns how
	// many were queued.
	sendUpdateEmail: t.field({
		type: "Int",
		errors: {
			types: adminEntityErrors,
			union: { name: "SendUpdateEmailResult" },
		},
		args: { id: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const result = await enqueueUpdateEmails(String(args.id))
			if (!result.ok) throw ValidationError.field(null, result.error)
			return result.queued
		},
	}),
}))
