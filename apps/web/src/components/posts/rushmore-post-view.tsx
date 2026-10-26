import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { FiMessageCircle } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { PresserMenu } from "#/components/pressers/presser-menu"
import { Card } from "#/components/ui/card"
import { UserHandle } from "#/components/users/user-handle"
import type { PostPageQuery } from "#/graphql/generated/graphql"
import { formatTimeAgo } from "#/lib/format-date"
import { SITE_HOST } from "#/lib/meta"
import { pluralize } from "#/lib/pluralize"
import { sharedPicksLine } from "#/lib/shared-picks"
import { LikeButton } from "./like-button"
import { PostBreadcrumb } from "./post-breadcrumb"
import { PostCommentThread } from "./post-comments/thread"
import { PostEditForm } from "./post-edit-form"
import { PostGroupChip } from "./post-group-chip"
import { BrandBadge } from "./rushmore-band/brand-badge"
import { RushmoreBand } from "./rushmore-band/rushmore-band"
import { RushmoreEyebrow } from "./rushmore-eyebrow"
import { RushmoreShareRow } from "./rushmore-share-row"
import { usePostActions } from "./use-post-actions"
import { usePostLike } from "./use-post-like"
import { YoursAction } from "./yours-action"

export type RushmorePostData = Extract<
	NonNullable<PostPageQuery["post"]>,
	{ __typename: "RushmorePost" }
>

// A Rushmore's own page: the four faces on the prompt's color with the
// prompt and who made it, laid out like its share image (the logo in the
// corner, its address along the bottom) so a screenshot still says where it
// came from. Then the words; likes, comments and, on someone else's, the way
// to make yours (or how yours compares) and sharing; then the thread.
export function RushmorePostView({
	post,
	gifsEnabled,
}: {
	post: RushmorePostData
	gifsEnabled: boolean
}) {
	const [editing, setEditing] = useState(false)
	const actions = usePostActions("rushmore", post, () => setEditing(true))
	const like = usePostLike(post)
	const picks = [...post.picks].sort((a, b) => a.position - b.position)
	// The viewer's own public answer to the same prompt.
	const yours =
		post.prompt.viewerAnswer?.__typename === "RushmorePost"
			? post.prompt.viewerAnswer
			: null
	// For everyone, the author included: anyone's Rushmore is theirs to pass
	// around.
	const shareRow = post.sharePath && (
		<RushmoreShareRow
			postId={post.id}
			path={post.sharePath}
			promptTitle={post.prompt.title}
			authorUsername={post.author.username}
			own={post.viewerIsAuthor}
			pickNames={picks.map((pick) => pick.player.name)}
		/>
	)

	if (post.removed) {
		return (
			<p className={css({ fontSize: "sm", color: "fg.muted" })}>
				This Rushmore was removed by moderators.
			</p>
		)
	}

	return (
		<VStack gap="5" alignItems="stretch" paddingBottom="4">
			<PostBreadcrumb post={post} />
			<RushmoreBand
				color={post.prompt.color}
				header={
					<VStack gap="1" alignItems="stretch">
						<HStack justify="space-between" gap="3" marginBottom="2">
							<BrandBadge />
							{actions.length > 0 && (
								<PresserMenu label="Rushmore options" actions={actions} />
							)}
						</HStack>
						<RushmoreEyebrow />
						<Link
							to="/rushmore/$code"
							params={{ code: post.prompt.code }}
							className={css({
								fontFamily: "heading",
								fontSize: { base: "3xl", md: "4xl" },
								lineHeight: "1.05",
								overflowWrap: "anywhere",
								_hover: { textDecoration: "underline" },
							})}
						>
							{post.prompt.title}
						</Link>
						<HStack gap="2" flexWrap="wrap" fontSize="sm">
							<UserHandle user={post.author}>
								<span className={css({ fontWeight: "semibold" })}>
									by @{post.author.username}
								</span>
							</UserHandle>
							<span className={css({ opacity: 0.75 })}>
								{formatTimeAgo(post.createdAt)}
								{post.editedAt ? " · edited" : ""}
							</span>
							{post.group && <PostGroupChip group={post.group} />}
						</HStack>
					</VStack>
				}
				slots={picks.map((pick) => ({
					key: pick.player.id,
					player: pick.player,
				}))}
				footer={
					post.sharePath && (
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "xs",
								overflowWrap: "anywhere",
								opacity: 0.85,
							})}
						>
							{SITE_HOST}
							{post.sharePath}
						</span>
					)
				}
			/>

			{editing ? (
				<Card>
					<Card.Body>
						<PostEditForm post={post} onDone={() => setEditing(false)} />
					</Card.Body>
				</Card>
			) : (
				post.body && (
					<p
						className={css({
							fontSize: "md",
							color: "fg.body",
							whiteSpace: "pre-wrap",
							overflowWrap: "anywhere",
						})}
					>
						{post.body}
					</p>
				)
			)}

			<VStack gap="3" alignItems="stretch">
				<HStack gap="2" justify="space-between" flexWrap="wrap">
					<HStack gap="1">
						<LikeButton
							liked={like.liked}
							count={like.count}
							onToggle={like.toggle}
							subject="this Rushmore"
						/>
						<a
							href="#comments"
							className={css({
								display: "inline-flex",
								alignItems: "center",
								gap: "1.5",
								padding: "{spacing.1.5} {spacing.2}",
								borderRadius: "md",
								textStyle: "meta",
								color: "fg.muted",
								_hover: { bg: "fg.default/10", color: "fg.default" },
							})}
						>
							<FiMessageCircle size={14} aria-hidden />
							{post.commentCount} {pluralize(post.commentCount, "comment")}
						</a>
					</HStack>
					{post.viewerIsAuthor ? (
						shareRow
					) : (
						<YoursAction
							kind="rushmore"
							code={post.prompt.code}
							yoursId={yours?.id ?? null}
						/>
					)}
				</HStack>
				{!post.viewerIsAuthor && yours && (
					<p className={css({ fontSize: "sm", color: "fg.muted" })}>
						{sharedPicksLine(
							picks.map((pick) => pick.player),
							yours.picks.map((pick) => pick.player),
						)}
					</p>
				)}
				{!post.viewerIsAuthor && shareRow}
			</VStack>

			<PostCommentThread
				postId={post.id}
				commentCount={post.commentCount}
				canComment={post.viewerCanComment}
				gifsEnabled={gifsEnabled}
			/>
		</VStack>
	)
}
