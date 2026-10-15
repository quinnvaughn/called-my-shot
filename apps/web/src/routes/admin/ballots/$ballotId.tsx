import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { AdminBallotHeader } from "#/components/admin/admin-ballot/admin-ballot-header"
import { AdminBallotMembers } from "#/components/admin/admin-ballot/admin-ballot-members"
import { AttachQuestionModal } from "#/components/admin/attach-question-modal"
import { Button, button } from "#/components/ui/button"
import { NotFound } from "#/components/ui/not-found"
import { adminBallotQuery } from "#/graphql/ballots/queries"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/admin/ballots/$ballotId")({
	component: RouteComponent,
	loader: ({ context, params }) =>
		context.queryClient.query(adminBallotQuery(params.ballotId)),
})

function RouteComponent() {
	const { ballotId } = Route.useParams()
	const { data } = useSuspenseQuery(adminBallotQuery(ballotId))

	const ballot =
		data.adminBallot?.__typename === "QueryAdminBallotSuccess"
			? data.adminBallot.data
			: null

	if (!ballot) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Ballot"
				heading="This ballot doesn't exist"
				subtitle="It may have been deleted."
				link={{ text: "Back to Ballots", url: "/admin/ballots" }}
			/>
		)
	}

	return (
		<VStack gap="6" alignItems="stretch">
			<Link
				to="/admin/ballots"
				className={css({
					textStyle: "meta",
					color: "fg.subtle",
				})}
			>
				← All ballots
			</Link>
			<AdminBallotHeader ballotId={ballotId} ballot={ballot} />

			<AdminBallotMembers ballotId={ballotId} ballot={ballot} />

			<HStack gap="3">
				<Link
					to="/new-question"
					search={{ ballotId }}
					className={button({ variant: "outline", size: "sm" })}
				>
					+ New question
				</Link>
				<Button
					variant="outline"
					size="sm"
					onClick={() =>
						openModal(
							<AttachQuestionModal
								ballotId={ballotId}
								leagueId={ballot.league.id}
							/>,
						)
					}
				>
					+ Attach existing
				</Button>
			</HStack>
		</VStack>
	)
}
