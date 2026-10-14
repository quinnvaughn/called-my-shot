import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { FiPlus } from "react-icons/fi"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { ChallengeListRow } from "#/components/challenges/challenge-list-row"
import { button } from "#/components/ui/button"
import { EmptyState } from "#/components/ui/empty-state"
import { PageHeader } from "#/components/ui/page-header"
import { Tabs } from "#/components/ui/tabs"
import type { ChallengeRole } from "#/graphql/generated/graphql"
import { myChallengesQuery } from "#/graphql/queries/challenges"

type Search = { tab?: "accepted" }

export const Route = createFileRoute("/_app/_authed/challenges/")({
	component: RouteComponent,
	validateSearch: (search: Record<string, unknown>): Search =>
		search.tab === "accepted" ? { tab: "accepted" } : {},
})

function RouteComponent() {
	const search = Route.useSearch()
	const navigate = Route.useNavigate()
	const role: ChallengeRole = search.tab === "accepted" ? "ACCEPTED" : "CREATED"
	const { data, isPending } = useQuery(myChallengesQuery(role))
	const challenges = data?.myChallenges ?? []

	return (
		<VStack gap="6" alignItems="stretch" className={css({ paddingTop: "6" })}>
			<PageHeader
				title="Challenges"
				action={
					<Link
						to="/challenges/new"
						className={button({ variant: "solid", size: "sm" })}
						aria-label="New challenge"
					>
						{/* Shortened on a phone, where the full label beside the title
						    leaves "Challenges" too narrow to fit on one line. */}
						<span
							className={css({
								display: { base: "flex", sm: "none" },
								alignItems: "center",
								gap: "1",
							})}
						>
							<FiPlus aria-hidden />
							New
						</span>
						<span className={css({ display: { base: "none", sm: "inline" } })}>
							New challenge
						</span>
					</Link>
				}
			/>
			<Tabs
				value={role}
				onValueChange={(value) =>
					navigate({
						search: value === "ACCEPTED" ? { tab: "accepted" } : {},
					})
				}
			>
				<Tabs.List>
					<Tabs.Trigger value="CREATED">Yours</Tabs.Trigger>
					<Tabs.Trigger value="ACCEPTED">Taken on</Tabs.Trigger>
				</Tabs.List>
			</Tabs>
			{isPending ? null : challenges.length === 0 ? (
				<EmptyState>
					{role === "CREATED"
						? "You haven't made a challenge yet. Pick some questions and send the link."
						: "You haven't taken anyone on yet."}
				</EmptyState>
			) : (
				<VStack gap="3" alignItems="stretch">
					{challenges.map((c) => (
						<ChallengeListRow key={c.id} challenge={c} />
					))}
				</VStack>
			)}
		</VStack>
	)
}
