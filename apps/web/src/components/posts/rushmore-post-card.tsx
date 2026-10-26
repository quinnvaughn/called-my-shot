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
import { LikeButton } from "./like-button"
import { PostGroupChip } from "./post-group-chip"
import { RushmoreBand } from "./rushmore-band/rushmore-band"
import { RushmoreEyebrow } from "./rushmore-eyebrow"
import { usePostLike } from "./use-post-like"

export const RushmorePostCardFragment = graphql(`
	fragment RushmorePostCard_post on RushmorePost {
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
			team {
				id
				color
			}
		}
		picks {
			position
			player {
				id
				name
				portraitUrl
				headshotUrl
			}
		}
	}
`)

// Lifts an element above the post link's overlay so it stays clickable.
const aboveOverlay = css({ position: "relative", zIndex: 1 })
// A flex box rather than an inline span, so the identity's box is exactly
// the avatar's height and the age beside it centers on the same line.
const identitySlot = css({ display: "flex", minWidth: "0" })

// A Rushmore in a feed: who made it, then the Rushmore itself on its
// franchise's color the way the post shows it, the start of what they
// wrote, and its likes and comments. The whole card opens the post except
// the name, the group, the heart and the comments link.
export function RushmorePostCard({
	post: postProp,
}: {
	post: FragmentType<typeof RushmorePostCardFragment>
}) {
	const post = useFragment(RushmorePostCardFragment, postProp)
	const like = usePostLike(post)
	const picks = [...post.picks].sort((a, b) => a.position - b.position)

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
						aria-label={`Open @${post.author.username}'s ${post.prompt.title}`}
						className={css({
							display: "flex",
							flexDirection: "column",
							gap: "3",
							// Stretched over the whole card, so the space around
							// the band opens the post too.
							_after: { content: '""', position: "absolute", inset: "0" },
						})}
					>
						<RushmoreBand
							size="sm"
							color={post.prompt.color}
							header={
								<>
									<RushmoreEyebrow />
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
							slots={picks.map((pick) => ({
								key: pick.player.id,
								player: pick.player,
							}))}
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
								subject="this Rushmore"
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
