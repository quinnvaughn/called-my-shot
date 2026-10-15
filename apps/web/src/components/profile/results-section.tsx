import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { SectionLabel } from "#/components/ui/section-label"
import type { UserRecordQuery } from "#/graphql/generated/graphql"
import { ResultsCalendar } from "./results-calendar/results-calendar"

type UserRecord = NonNullable<UserRecordQuery["userByUsername"]>

export function ResultsSection({
	record,
	wideRecord,
	username,
	leagueId,
	leagueSlug,
}: {
	record: NonNullable<UserRecord["record"]>
	wideRecord: UserRecord["wideRecord"] | null
	username: string
	leagueId: string | null
	leagueSlug: string | null
}) {
	return (
		<VStack alignItems="stretch" gap="3">
			<SectionLabel>Results</SectionLabel>
			{/* Eight weeks below lg, half a year from it (see
			    UserRecordDocument). Each is remounted per scope so its
			    picked day and page reset to that scope's latest. */}
			<div className={css({ display: { base: "block", lg: "none" } })}>
				<ResultsCalendar
					key={leagueId ?? "all"}
					calendar={record.calendar}
					username={username}
					league={leagueSlug}
				/>
			</div>
			{wideRecord && (
				<div className={css({ display: { base: "none", lg: "block" } })}>
					<ResultsCalendar
						key={leagueId ?? "all"}
						calendar={wideRecord.calendar}
						username={username}
						league={leagueSlug}
					/>
				</div>
			)}
		</VStack>
	)
}
