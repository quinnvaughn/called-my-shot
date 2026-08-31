import { createFileRoute, Link } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { FaCheck, FaXmark } from "react-icons/fa6"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { NotFound } from "#/components/ui/not-found"
import { PageHeader } from "#/components/ui/page-header"
import { Tag } from "#/components/ui/tag"
import { BallotByIdDocument } from "#/graphql/queries/ballots"
import {
	type BallotMemberState,
	ballotMemberState,
} from "#/lib/ballot-member-state"

// Public - a shared link or a scraper can land here signed out, same as the
// `ballot` query itself (resolves null for anything not published). This is
// the ONLY public view of a ballot; the admin builder at /admin/ballots is a
// separate, admin-only page for assembling one.
export const Route = createFileRoute("/_app/ballots/$ballotId")({
	component: RouteComponent,
	loader: async ({ context, params }) => {
		const { data } = await context.apolloClient.query({
			query: BallotByIdDocument,
			variables: { id: params.ballotId },
		})
		return { ballot: data?.ballot ?? null }
	},
	head: ({ loaderData }) => {
		const ballot = loaderData?.ballot
		if (!ballot) return {}
		const title = `${ballot.name} · Called My Shot`
		const description = `${ballot.memberCount} question${ballot.memberCount === 1 ? "" : "s"} in the ${ballot.league.name} ${ballot.name}.`
		return {
			meta: [
				{ title },
				{ name: "description", content: description },
				{ property: "og:title", content: title },
				{ property: "og:description", content: description },
			],
		}
	},
})

const stateIconStyle: Record<BallotMemberState, string> = {
	uncalled: css({ border: "1px solid {colors.fg.subtle}" }),
	pending: css({
		backgroundColor: "fg.subtle",
		border: "1px solid {colors.fg.subtle}",
	}),
	won: css({
		backgroundColor: "success.default/15",
		border: "1px solid {colors.success.default/50}",
		color: "success.default",
	}),
	lost: css({
		backgroundColor: "danger.default/15",
		border: "1px solid {colors.danger.default/50}",
		color: "danger.default",
	}),
	missed: css({
		border: "1px dashed {colors.fg.subtle}",
		opacity: 0.5,
	}),
}

function MemberStateIcon({ state }: { state: BallotMemberState }) {
	return (
		<div
			className={cx(
				css({
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					width: "18px",
					height: "18px",
					borderRadius: "full",
					flexShrink: "0",
				}),
				stateIconStyle[state],
			)}
		>
			{state === "won" && <FaCheck size={9} />}
			{state === "lost" && <FaXmark size={9} />}
		</div>
	)
}

function RouteComponent() {
	const { ballot } = Route.useLoaderData()

	if (!ballot) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Ballot"
				heading="This ballot doesn't exist"
				subtitle="It may not be published yet, or the link's just wrong."
				link={{ text: "Back home", url: "/home" }}
			/>
		)
	}

	const members = [...ballot.members].sort((a, b) => a.sortOrder - b.sortOrder)
	const calledCount = ballot.viewerCalledCount ?? 0

	return (
		<VStack gap="6" alignItems="stretch">
			<VStack gap="2" alignItems="flex-start">
				<HStack gap="2">
					<Tag>{ballot.league.abbreviation}</Tag>
					<Tag variant="primary">Official</Tag>
				</HStack>
				<PageHeader
					title={ballot.name}
					subtitle={
						ballot.memberCount === 1
							? "1 question"
							: `${ballot.memberCount} questions`
					}
				/>
				{calledCount > 0 && (
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "xs",
							color: "fg.subtle",
						})}
					>
						{calledCount} of {ballot.memberCount} called
					</span>
				)}
			</VStack>

			<Card>
				<VStack gap="0" alignItems="stretch">
					{members.map((member) => {
						const state = ballotMemberState(member)
						return (
							<Link
								key={member.id}
								to="/questions/$questionId"
								params={{ questionId: member.question.id }}
								className={css({
									display: "flex",
									alignItems: "center",
									gap: "3",
									padding: "3",
									borderBottom: "1px solid {colors.border.default}",
									_hover: { backgroundColor: "bg.subtle" },
									_last: { borderBottom: "none" },
								})}
							>
								<MemberStateIcon state={state} />
								<VStack gap="0.5" alignItems="flex-start" flex="1" minWidth="0">
									{member.slot && (
										<span
											className={css({
												fontFamily: "mono",
												fontSize: "3xs",
												letterSpacing: "wide",
												textTransform: "uppercase",
												color: "fg.subtle",
											})}
										>
											{member.slot}
										</span>
									)}
									<span
										className={css({
											fontSize: "sm",
											fontWeight: "medium",
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
											width: "full",
										})}
									>
										{member.question.title}
									</span>
								</VStack>
							</Link>
						)
					})}
				</VStack>
			</Card>
		</VStack>
	)
}
