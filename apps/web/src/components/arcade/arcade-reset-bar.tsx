import { Button } from "#/components/ui/button"
import { ArcadeAdminBar } from "./arcade-admin-bar"

// Above today's game for a signed-in admin: deletes their own game on it, so
// the saved flow (stats, group boards, the share card) can be played again.
export function ArcadeResetBar({
	pending,
	onReset,
}: {
	pending: boolean
	onReset: () => void
}) {
	return (
		<ArcadeAdminBar label="Admin · your game today is saved">
			<Button variant="outline" size="sm" loading={pending} onClick={onReset}>
				Reset my game
			</Button>
		</ArcadeAdminBar>
	)
}
