import { Link } from "@tanstack/react-router"
import { seasonDateLabel } from "#/components/arcade/name-that-season/season-result"
import { Button, button } from "#/components/ui/button"
import { ArcadeAdminBar } from "./arcade-admin-bar"

// Above an admin's practice game: which day it is, that nothing is saved, a
// fresh start, and the way back to the schedule.
export function ArcadePracticeBar({
	date,
	schedulePath,
	onRestart,
}: {
	date: string
	schedulePath: "/admin/seasons" | "/admin/blind-rank" | "/admin/teammate-chain"
	onRestart: () => void
}) {
	return (
		<ArcadeAdminBar
			label={`Practice · ${seasonDateLabel(date)} · nothing is saved`}
		>
			<Button variant="outline" size="sm" onClick={onRestart}>
				Start over
			</Button>
			<Link
				to={schedulePath}
				className={button({ variant: "ghost", size: "sm" })}
			>
				Schedule
			</Link>
		</ArcadeAdminBar>
	)
}
