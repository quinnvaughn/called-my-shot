import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { CardRail } from "#/components/ui/card-rail"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { PresserCard } from "./presser-card"

export const ProfilePresserFragment = graphql(`
	fragment ProfilePresser_presser on Presser {
		id
		isOpen
		closesAt
		statement
		answeredCount
		game {
			id
			startsAt
			league {
				id
			}
			homeTeam {
				abbreviation
			}
			awayTeam {
				abbreviation
			}
		}
		latestAnswer {
			id
			body
			answer
			noComment
		}
	}
`)

export type ProfilePresserRef = FragmentType<typeof ProfilePresserFragment>

// Every presser with something public in it, newest game first: the
// statement, or the latest answer as a transcript.
export function PressersSection({
	heading,
	username,
	pressers: pressersProp,
	leagueId,
}: {
	// Drawn only when there's a presser to list under it.
	heading: ReactNode
	username: string
	pressers: ProfilePresserRef[]
	// Set when the profile is scoped to one league.
	leagueId: string | null
}) {
	const pressers = useFragment(ProfilePresserFragment, pressersProp).filter(
		(p) => !leagueId || p.game.league.id === leagueId,
	)
	if (pressers.length === 0) return null

	return (
		<>
			{/* A sideways rail on a phone, where ten cards stacked would run
			    far down the profile; a list from sm up. */}
			<div className={css({ display: { base: "block", sm: "none" } })}>
				<CardRail
					items={pressers}
					getKey={(p) => p.id}
					renderItem={(p) => <PresserCard presser={p} username={username} />}
					header={heading}
					itemLabel="presser"
				/>
			</div>
			<VStack
				display={{ base: "none", sm: "flex" }}
				alignItems="stretch"
				gap="3"
			>
				{heading}
				<VStack alignItems="stretch" gap="2">
					{pressers.map((p) => (
						<PresserCard key={p.id} presser={p} username={username} />
					))}
				</VStack>
			</VStack>
		</>
	)
}
