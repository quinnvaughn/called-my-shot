import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { FollowButton } from "#/components/follows/follow-button"
import { TeamBadge } from "#/components/ui/team-badge"

type Props = {
	team: {
		id: string
		name: string
		abbreviation: string
		color: string
		logoUrl?: string | null
		conference?: string | null
		division?: string | null
		viewerFollows: boolean
	}
	leagueAbbreviation: string
}

export function TeamSpaceHeader({ team, leagueAbbreviation }: Props) {
	const subtitle = [leagueAbbreviation, team.conference, team.division]
		.filter(Boolean)
		.join(" · ")
	return (
		<HStack gap="4" alignItems="center" justify="space-between">
			<HStack gap="3" alignItems="center" minWidth="0">
				<TeamBadge
					abbreviation={team.abbreviation}
					color={team.color}
					logoUrl={team.logoUrl}
					size="lg"
				/>
				<VStack gap="1" alignItems="flex-start" minWidth="0">
					<h1
						className={css({
							fontSize: "3xl",
							fontFamily: "heading",
							lineHeight: "1",
							overflowWrap: "anywhere",
						})}
					>
						{team.name}
					</h1>
					<p
						className={css({
							fontFamily: "mono",
							fontSize: "xs",
							color: "fg.muted",
							textTransform: "uppercase",
						})}
					>
						{subtitle}
					</p>
				</VStack>
			</HStack>
			<FollowButton
				kind="TEAM"
				id={team.id}
				following={team.viewerFollows}
				name={team.name}
			/>
		</HStack>
	)
}
