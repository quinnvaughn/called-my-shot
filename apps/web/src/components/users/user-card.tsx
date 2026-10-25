import { HOT_STREAK_MIN } from "@called-my-shot/scoring"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { FollowButton } from "#/components/follows/follow-button"
import { Avatar } from "#/components/ui/avatar"
import { button } from "#/components/ui/button"
import { userCardQuery } from "#/graphql/users/queries"
import { useMe } from "#/hooks/use-me"
import { formatSigned } from "#/lib/format-number"
import { UserCardStat } from "./user-card-stat"

export type UserCardData = {
	username: string
	name?: string | null
	avatarUrl?: string | null
}

// Who someone is, in the card a name opens: their standing, a streak if
// they're on one, how they've done against the viewer, and the way to their
// profile, with a follow button on anyone but yourself. The numbers load as
// it opens.
export function UserCard({
	user,
	onNavigate,
}: {
	user: UserCardData
	onNavigate: () => void
}) {
	const me = useMe()
	const { data } = useQuery(userCardQuery(user.username))
	const profile = data?.userByUsername
	const stats = profile?.careerStats
	const hot = [...(profile?.streaks ?? [])]
		.filter((streak) => streak.currentLength >= HOT_STREAK_MIN)
		.sort((a, b) => b.currentLength - a.currentLength)[0]
	const h2h = profile?.headToHeadWithViewer
	const played = h2h ? h2h.wins + h2h.losses + h2h.draws : 0
	const isViewer =
		!!me?.username && me.username.toLowerCase() === user.username.toLowerCase()

	return (
		<VStack gap="4" alignItems="stretch">
			<HStack gap="3" minWidth="0">
				<Avatar
					size="md"
					name={user.name ?? user.username}
					src={user.avatarUrl ?? null}
				/>
				<VStack gap="0.5" alignItems="flex-start" minWidth="0">
					{user.name && (
						<span
							className={css({
								fontSize: "md",
								fontWeight: "semibold",
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
								maxWidth: "full",
							})}
						>
							{user.name}
						</span>
					)}
					<span className={css({ textStyle: "metaLg", color: "fg.muted" })}>
						@{user.username}
					</span>
				</VStack>
			</HStack>
			<HStack gap="3" alignItems="flex-start">
				<UserCardStat
					label="Points"
					value={
						stats ? formatSigned(stats.totalPoints, { zeroSign: true }) : "–"
					}
				/>
				<UserCardStat
					label="Rank"
					value={stats?.rank ? `#${stats.rank}` : "–"}
				/>
				<UserCardStat
					label="Hit rate"
					value={
						stats?.accuracy != null && stats.resolvedCallCount > 0
							? `${Math.round(stats.accuracy)}%`
							: "–"
					}
				/>
			</HStack>
			{(hot || played > 0) && (
				<VStack
					gap="1"
					alignItems="flex-start"
					className={css({ textStyle: "meta", color: "fg.muted" })}
				>
					{hot && (
						<span className={css({ color: "secondary.default" })}>
							{hot.currentLength} in a row · {hot.league.abbreviation}{" "}
							{hot.familyLabel}
						</span>
					)}
					{h2h && played > 0 && (
						<span>
							You vs them in challenges: {h2h.wins}-{h2h.losses}
							{h2h.draws > 0 ? `-${h2h.draws}` : ""}
						</span>
					)}
				</VStack>
			)}
			<HStack gap="2">
				{profile && !isViewer && (
					<FollowButton
						kind="USER"
						id={profile.id}
						following={profile.viewerFollows}
						name={`@${user.username}`}
					/>
				)}
				<Link
					to="/user/$username"
					params={{ username: user.username }}
					onClick={onNavigate}
					className={button({
						variant: "outline",
						size: "sm",
						fullWidth: true,
					})}
				>
					View profile
				</Link>
			</HStack>
		</VStack>
	)
}
