import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { FiMessageCircle } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { PresserMenu } from "#/components/pressers/presser-menu"
import { CallAge } from "#/components/questions/call-age"
import { Card } from "#/components/ui/card"
import { UserHandle } from "#/components/users/user-handle"
import type { PostPageQuery } from "#/graphql/generated/graphql"
import { SITE_HOST } from "#/lib/meta"
import { pluralize } from "#/lib/pluralize"
import { sharedSlotsLine } from "#/lib/shared-slots"
import { LikeButton } from "../like-button"
import { PostCommentThread } from "../post-comments/thread"
import { PostEditForm } from "../post-edit-form"
import { PostGroupChip } from "../post-group-chip"
import { REDRAFT_BODY_PLACEHOLDER } from "../redraft-composer/body-placeholder"
import { BrandBadge } from "../rushmore-band/brand-badge"
import { usePostActions } from "../use-post-actions"
import { usePostLike } from "../use-post-like"
import { YoursAction } from "../yours-action"
import { RedraftBoard } from "./redraft-board"
import { RedraftBreadcrumb } from "./redraft-breadcrumb"
import { RedraftDare } from "./redraft-dare"
import { RedraftEyebrow } from "./redraft-eyebrow"
import { RedraftRow } from "./redraft-row"
import { RedraftShareRow } from "./redraft-share-row"

export type RedraftPostData = Extract<
	NonNullable<PostPageQuery["post"]>,
	{ __typename: "RedraftPost" }
>

// A redraft's own page: every pick on the class's color with the class and
// who made it, laid out like its share image (the logo in the corner, its
// address along the bottom) so a screenshot still says where it came from.
// Each pick shows where the player really went and how many redrafts put
// them in the same slot. Then the words; likes, comments and, on someone
// else's, the way to make yours (or how yours compares) and sharing; then
// the thread.
export function RedraftPostView({
	post,
	gifsEnabled,
}: {
	post: RedraftPostData
	gifsEnabled: boolean
}) {
	const [editing, setEditing] = useState(false)
	const actions = usePostActions("redraft", post, () => setEditing(true))
	const like = usePostLike(post)
	// The viewer's own public redraft of the same class.
	const yours =
		post.prompt.viewerAnswer?.__typename === "RedraftPost"
			? post.prompt.viewerAnswer
			: null
	// Someone else's, to pass around. The author gets RedraftDare instead.
	const shareRow = post.sharePath && (
		<RedraftShareRow
			postId={post.id}
			path={post.sharePath}
			classTitle={post.prompt.title}
			authorUsername={post.author.username}
			pickNames={post.picks.map((pick) => pick.player.name)}
		/>
	)

	if (post.removed) {
		return (
			<p className={css({ fontSize: "sm", color: "fg.muted" })}>
				This redraft was removed by moderators.
			</p>
		)
	}

	return (
		<VStack gap="5" alignItems="stretch" paddingBottom="4">
			<RedraftBreadcrumb post={post} />
			<RedraftBoard
				color={post.prompt.color}
				header={
					<VStack gap="1" alignItems="stretch">
						<HStack justify="space-between" gap="3" marginBottom="2">
							<BrandBadge />
							{actions.length > 0 && (
								<PresserMenu label="Redraft options" actions={actions} />
							)}
						</HStack>
						<RedraftEyebrow />
						<Link
							to="/redraft/$code"
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
								<CallAge iso={post.createdAt} />
								{post.editedAt ? " · edited" : ""}
							</span>
							{post.group && <PostGroupChip group={post.group} />}
						</HStack>
					</VStack>
				}
				rows={(palette) =>
					post.picks.map((pick) => (
						<RedraftRow
							key={pick.slot}
							slot={pick.slot}
							palette={palette}
							player={pick.player}
							teamLogoUrl={pick.slotTeam?.logoUrl ?? null}
							teamName={pick.slotTeamName}
							original={pick.originalOverall}
							sub={
								// Only once there's a crowd to compare with.
								post.prompt.answerCount > 1 && (
									<span
										className={css({
											flexShrink: 0,
											fontSize: "xs",
											opacity: 0.75,
										})}
										title={`${pick.sharePercent}% of public redrafts that reach pick ${pick.slot} take this player there`}
									>
										{pick.sharePercent}%
									</span>
								)
							}
						/>
					))
				}
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
						<PostEditForm
							post={post}
							onDone={() => setEditing(false)}
							placeholder={REDRAFT_BODY_PLACEHOLDER}
						/>
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
							subject="this redraft"
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
					{!post.viewerIsAuthor && (
						<YoursAction
							kind="redraft"
							code={post.prompt.code}
							yoursId={yours?.id ?? null}
						/>
					)}
				</HStack>
				{!post.viewerIsAuthor && yours && (
					<p className={css({ fontSize: "sm", color: "fg.muted" })}>
						{sharedSlotsLine(post.picks, yours.picks)}
					</p>
				)}
				{post.viewerIsAuthor
					? post.sharePath && (
							<RedraftDare
								postId={post.id}
								path={post.sharePath}
								classTitle={post.prompt.title}
								answerCount={post.prompt.answerCount}
								picks={post.picks}
							/>
						)
					: shareRow}
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
