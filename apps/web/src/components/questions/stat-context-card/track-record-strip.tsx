import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import type { StatContextCard_TrackRecordFragment } from "#/graphql/generated/graphql"
import { TrackRecordRow } from "./track-record-row"

// The viewer's own record picking each of this question's two options: every
// question of the same shape and stat they've settled, then this subject
// alone, then home against road, each only when it has enough calls.
export function TrackRecordStrip(props: {
	record: StatContextCard_TrackRecordFragment
}) {
	const { record } = props
	return (
		<VStack gap="2" alignItems="stretch">
			<h3 className={css({ textStyle: "sectionHeading", color: "fg.muted" })}>
				{`Your record \u00b7 ${record.label}`}
			</h3>
			{record.rows.map((row) => (
				<TrackRecordRow
					key={row.label ?? "all"}
					label={row.label ?? "All your calls"}
					sides={row.sides}
				/>
			))}
			<p className={css({ fontSize: "xs", color: "fg.subtle" })}>
				Your settled calls on questions like this one, with points won or lost.
			</p>
		</VStack>
	)
}
