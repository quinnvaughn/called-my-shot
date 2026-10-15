import { useSuspenseQuery } from "@tanstack/react-query"
import { VStack } from "styled-system/jsx"
import { QuestionCard } from "#/components/questions/question-card"
import { EmptyState } from "#/components/ui/empty-state"
import { homeDashboardQuery } from "#/graphql/home/queries"
import { HomeSectionLabel } from "./home-section-label"

export function HomeJustResolvedSection() {
	const { data } = useSuspenseQuery(homeDashboardQuery)
	const justResolved = data.myRecentResolvedCalls
	return (
		<VStack gap="3" alignItems="stretch">
			<HomeSectionLabel>Just resolved</HomeSectionLabel>
			{justResolved.length > 0 ? (
				<VStack gap="3" alignItems="stretch">
					{justResolved.map(
						(call) =>
							call.question && (
								<QuestionCard key={call.id} question={call.question} />
							),
					)}
				</VStack>
			) : (
				<EmptyState>
					No results yet. Your calls will show up here as they resolve.
				</EmptyState>
			)}
		</VStack>
	)
}
