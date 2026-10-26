import { Link } from "@tanstack/react-router"
import { FiMessageCircle } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { CallAge } from "#/components/questions/call-age"
import { Card } from "#/components/ui/card"
import { Identity } from "#/components/ui/identity"
import { UserHandle } from "#/components/users/user-handle"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { pluralize } from "#/lib/pluralize"
import { LikeButton } from "../like-button"
import { PostGroupChip } from "../post-group-chip"
import { usePostLike } from "../use-post-like"
import { RedraftBoard } from "./redraft-board"
import { RedraftEyebrow } from "./redraft-eyebrow"
import { RedraftRow } from "./redraft-row"

export const RedraftPostCardFragment = graphql(`
	fragment RedraftPostCard_post on RedraftPost {
		id
		createdAt
		body
		likeCount
		viewerLiked
		commentCount
		author {
			id
			username
			name
			avatarUrl
		}
		group {
			id
			name
			logoUrl
		}
		prompt {
			id
			code
			title
			color
		}
		picks {
			slot
			originalOverall
			slotTeamName
			slotTeam {
				id
				logoUrl
			}
			player {
				id
				name
				portraitUrl
				headshotUrl
			}
		}
	}
`)

// How many picks at the top of a feed card get a face.
const FACES = 3

// Lifts an element above the post link's overlay so it stays clickable.
const aboveOverlay = css({ position: "relative", zIndex: 1 })
// A flex box rather than an inline span, so the identity's box is exactly
// the avatar's height and the age beside it centers on the same line.
const identitySlot = css({ display: "flex", minWidth: "0" })

// A redraft in a feed: who made it, then every pick on the class's color
// the way the post shows it (faces on the first few, one line each after),
// the start of what they wrote, and its likes and comments. The whole card
// opens the post except the name, the group, the heart and the comments
// link.
export function RedraftPostCard({
	post: postProp,
}: {
	post: FragmentType<typeof RedraftPostCardFragment>
}) {
	const post = useFragment(RedraftPostCardFragment, postProp)
	const like = usePostLike(post)

	return (
		<Card interactive className={css({ position: "relative" })}>
			<Card.Body>
				<VStack gap="3" alignItems="stretch">
					<HStack justify="space-between" gap="3">
						<HStack gap="2" minWidth="0" flexWrap="wrap">
							<span className={cx(aboveOverlay, identitySlot)}>
								<UserHandle user={post.author}>
									<Identity
										name={post.author.name}
										username={post.author.username}
										avatarUrl={post.author.avatarUrl}
										size="sm"
									/>
								</UserHandle>
							</span>
							<span className={css({ textStyle: "meta", color: "fg.subtle" })}>
								<CallAge iso={post.createdAt} />
							</span>
						</HStack>
						{post.group && (
							<span className={aboveOverlay}>
								<PostGroupChip group={post.group} />
							</span>
						)}
					</HStack>
					<Link
						to="/posts/$postId"
						params={{ postId: post.id }}
						aria-label={`Open @${post.author.username}'s redraft of the ${post.prompt.title}`}
						className={css({
							display: "flex",
							flexDirection: "column",
							gap: "3",
							// Stretched over the whole card, so the space around
							// the board opens the post too.
							_after: { content: '""', position: "absolute", inset: "0" },
						})}
					>
						<RedraftBoard
							size="sm"
							color={post.prompt.color}
							header={
								<>
									<RedraftEyebrow />
									<span
										className={css({
											display: "block",
											fontFamily: "heading",
											fontSize: "lg",
											lineHeight: "1.15",
											overflowWrap: "anywhere",
										})}
									>
										{post.prompt.title}
									</span>
								</>
							}
							rows={(palette) =>
								post.picks.map((pick) => (
									<RedraftRow
										key={pick.slot}
										size="sm"
										slot={pick.slot}
										palette={palette}
										player={pick.player}
										teamLogoUrl={pick.slotTeam?.logoUrl ?? null}
										teamName={pick.slotTeamName}
										original={pick.originalOverall}
										showFace={pick.slot <= FACES}
									/>
								))
							}
						/>
						{post.body && (
							<p
								className={css({
									fontSize: "sm",
									color: "fg.body",
									whiteSpace: "pre-wrap",
									overflowWrap: "anywhere",
									lineClamp: "3",
								})}
							>
								{post.body}
							</p>
						)}
					</Link>
					<HStack gap="1">
						<span className={aboveOverlay}>
							<LikeButton
								liked={like.liked}
								count={like.count}
								onToggle={like.toggle}
								subject="this redraft"
							/>
						</span>
						<Link
							to="/posts/$postId"
							params={{ postId: post.id }}
							hash="comments"
							className={cx(
								aboveOverlay,
								css({
									display: "inline-flex",
									alignItems: "center",
									gap: "1.5",
									padding: "{spacing.1.5} {spacing.2}",
									borderRadius: "md",
									textStyle: "meta",
									color: "fg.muted",
									_hover: { bg: "fg.default/10", color: "fg.default" },
								}),
							)}
						>
							<FiMessageCircle size={14} aria-hidden />
							{post.commentCount} {pluralize(post.commentCount, "comment")}
						</Link>
					</HStack>
				</VStack>
			</Card.Body>
		</Card>
	)
}
