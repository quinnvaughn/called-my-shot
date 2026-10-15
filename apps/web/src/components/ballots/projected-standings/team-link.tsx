import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { css } from "styled-system/css"
import type { StandingsTeamInput } from "#/lib/projected-standings"

const teamLinkClass = css({
	display: "flex",
	alignItems: "center",
	gap: "3",
	flex: "1",
	minWidth: "0",
	color: "inherit",
	textDecoration: "none",
	_hover: { opacity: 0.8 },
})

// Just the badge and name, so the move arrows beside them stay buttons of
// their own rather than sitting inside a link.
export function TeamLink({
	team,
	children,
}: {
	team: StandingsTeamInput
	children: ReactNode
}) {
	return team.callId ? (
		<Link
			to="/calls/$callId"
			params={{ callId: team.callId }}
			className={teamLinkClass}
		>
			{children}
		</Link>
	) : (
		<Link
			to="/questions/$questionId/{-$slug}"
			params={{ questionId: team.questionId }}
			className={teamLinkClass}
		>
			{children}
		</Link>
	)
}
