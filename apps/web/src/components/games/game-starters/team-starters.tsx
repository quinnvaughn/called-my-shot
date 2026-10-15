import { HStack, VStack } from "styled-system/jsx"
import { Eyebrow } from "#/components/ui/eyebrow"
import { TeamBadge } from "#/components/ui/team-badge"
import { ROLE_ORDER, roleLabel } from "#/lib/game-starters"
import { StarterRow } from "./starter-row"
import { emptyClass } from "./styles"
import type { Starter, Team } from "./types"

export function TeamStarters({
	team,
	starters,
	baseball,
}: {
	team: Team
	starters: Starter[]
	baseball: boolean
}) {
	const groups = ROLE_ORDER.map((role) => ({
		role,
		rows: starters.filter((s) => s.role === role),
	})).filter((group) => group.rows.length > 0)
	const lineupPending = baseball && !starters.some((s) => s.role === "BATTER")

	return (
		<VStack gap="3" alignItems="stretch" minWidth="0">
			<HStack>
				<TeamBadge
					abbreviation={team.abbreviation}
					color={team.color}
					logoUrl={team.logoUrl}
					showAbbreviation
				/>
			</HStack>
			{groups.map((group) => (
				<VStack key={group.role} gap="1" alignItems="stretch">
					<Eyebrow variant="neutral" size="sm">
						{roleLabel(group.role)}
					</Eyebrow>
					{group.rows.map((starter) => (
						<StarterRow key={starter.id} starter={starter} />
					))}
				</VStack>
			))}
			{lineupPending && (
				<VStack gap="1" alignItems="stretch">
					<Eyebrow variant="neutral" size="sm">
						{roleLabel("BATTER")}
					</Eyebrow>
					<span className={emptyClass}>Not posted yet</span>
				</VStack>
			)}
			{groups.length === 0 && !lineupPending && (
				<span className={emptyClass}>Not announced yet</span>
			)}
		</VStack>
	)
}
