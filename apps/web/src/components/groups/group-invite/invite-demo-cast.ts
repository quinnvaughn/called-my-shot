import {
	DEMO_MIN_NAMES,
	type DemoCast,
	LANDING_CAST,
} from "#/components/landing-page/group-call-demo/demo-fixture"
import type { GroupPreview } from "./types"

// Puts the landing page's demo in the group being joined: its name and logo,
// and its members' first names when there are enough of them to fill the
// parts. A smaller group keeps the stand-in names rather than repeating its
// two members.
export function inviteDemoCast(preview: GroupPreview): DemoCast {
	const firstNames = [
		...new Set(
			preview.members
				.map((member) => member.name.trim().split(/\s+/)[0])
				.filter(Boolean),
		),
	]
	return {
		groupName: preview.name,
		groupLogoUrl: preview.logoUrl,
		groupMeta: "Example call",
		names:
			firstNames.length >= DEMO_MIN_NAMES ? firstNames : LANDING_CAST.names,
	}
}
