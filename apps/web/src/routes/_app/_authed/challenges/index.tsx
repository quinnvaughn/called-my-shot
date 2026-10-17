import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { FiPlus } from "react-icons/fi"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { z } from "zod"
import { ChallengeListRow } from "#/components/challenges/challenge-list-row"
import { button } from "#/components/ui/button"
import { EmptyState } from "#/components/ui/empty-state"
import { PageHeader } from "#/components/ui/page-header"
import { Tabs } from "#/components/ui/tabs"
import { myChallengesQuery } from "#/graphql/challenges/queries"
import type { ChallengeRole } from "#/graphql/generated/graphql"

export const Route = createFileRoute("/_app/_authed/challenges/")({
	component: RouteComponent,
	validateSearch: z.object({
		tab: z.literal("accepted").optional().catch(undefined),
	}),
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
				description="Pick some questions and share the link. Anyone who accepts goes one on one with you on those questions, and the higher point total wins."
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
