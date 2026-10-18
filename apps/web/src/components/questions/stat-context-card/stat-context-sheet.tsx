import { HStack, VStack } from "styled-system/jsx"
import { Sheet } from "#/components/ui/sheet"
import type {
	StatContextCard_StatContextFragment,
	StatContextCard_TrackRecordFragment,
} from "#/graphql/generated/graphql"
import { sectionTitle, type TeamLabels } from "#/lib/stat-context"
import { MismatchTag } from "./mismatch-tag"
import { StatContextBody } from "./stat-context-body"

// The full stats card over the page, from the phone's folded summary. Closing
// it leaves the page where it was, with the options still in view.
export function StatContextSheet({
	context,
	trackRecord,
	teams,
}: {
	context: StatContextCard_StatContextFragment
	trackRecord: StatContextCard_TrackRecordFragment | null | undefined
	teams: TeamLabels
}) {
	return (
		<Sheet>
			<Sheet.Header>
				<HStack gap="2" alignItems="center" minWidth="0">
					<Sheet.Title>{sectionTitle(context.statLabel)}</Sheet.Title>
					<MismatchTag show={context.mismatch} />
				</HStack>
				<Sheet.CloseButton />
			</Sheet.Header>
			<Sheet.Body>
				<VStack gap="3" alignItems="stretch">
					<StatContextBody
						context={context}
						trackRecord={trackRecord}
						teams={teams}
					/>
				</VStack>
			</Sheet.Body>
		</Sheet>
	)
}
