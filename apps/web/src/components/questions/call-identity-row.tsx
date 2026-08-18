import { DateTime } from "luxon"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { Identity } from "#/components/ui/identity"

type Props = {
	name: string
	username: string
	// null when this caller has no resolved calls in this question's league yet
	leagueAccuracy: number | null
	leagueAbbreviation: string
	createdAt: string
}

// Who made this call and when - not pick info, so this renders the same
// whether or not the viewer can see the pick itself yet (see
// Call.viewerCanSeePick). This is what makes a locked call still read as
// activity instead of a blank slot.
export function CallIdentityRow({
	name,
	username,
	leagueAccuracy,
	leagueAbbreviation,
	createdAt,
}: Props) {
	return (
		<HStack justify="space-between" alignItems="center" gap="2" flexWrap="wrap">
			<HStack gap="2" alignItems="center" flexWrap="wrap">
				<Identity name={name} username={username} />
				{leagueAccuracy !== null && (
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							color: "success.default",
							backgroundColor: "success.subtle",
							padding: "{spacing.0.5} {spacing.1.5}",
							borderRadius: "sm",
							whiteSpace: "nowrap",
						})}
					>
						{Math.round(leagueAccuracy)}% on {leagueAbbreviation} calls
					</span>
				)}
			</HStack>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					color: "fg.subtle",
					flexShrink: "0",
				})}
			>
				{DateTime.fromISO(createdAt).toRelative()}
			</span>
		</HStack>
	)
}
