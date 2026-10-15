import { Grid } from "styled-system/jsx"
import { StatCard } from "./stat-card"
import type { AdminQueueSummary } from "./types"

export function QueueStats({ summary }: { summary: AdminQueueSummary | null }) {
	return (
		<Grid
			gridTemplateColumns={{ base: "1fr 1fr", md: "repeat(5, 1fr)" }}
			gap="3"
		>
			<StatCard
				value={summary?.needsResolution.length ?? 0}
				label="Needs resolution"
			/>
			<StatCard value={summary?.disputed.length ?? 0} label="Disputed" />
			<StatCard value={summary?.reported.length ?? 0} label="Reported" />
			<StatCard value={summary?.usersLockedCount ?? 0} label="Users locked" />
			<StatCard
				value={summary?.liveQuestionsCount ?? 0}
				label="Live questions"
			/>
		</Grid>
	)
}
