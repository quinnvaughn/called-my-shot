import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { AttachQuestionModal } from "#/components/admin/attach-question-modal"
import { Button, button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { FieldLabel } from "#/components/ui/field-label"
import { NotFound } from "#/components/ui/not-found"
import { Tag } from "#/components/ui/tag"
import { TextInput } from "#/components/ui/text-input"
import { useGqlMutation } from "#/graphql/hooks"
import {
	RemoveQuestionFromBallotDocument,
	RenameBallotDocument,
	ReorderBallotQuestionsDocument,
	SetBallotPublishedDocument,
	UpdateBallotQuestionDocument,
} from "#/graphql/mutations/ballots"
import { AdminBallotDocument } from "#/graphql/queries/ballots"
import { gqlQueryOptions } from "#/graphql/query-options"
import { questionShapeLabel } from "#/lib/question-labels"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/admin/ballots/$ballotId")({
	component: RouteComponent,
})

function MemberRow({
	member,
	position,
	total,
	onMove,
	onSave,
	onRemove,
}: {
	member: {
		id: string
		label: string
		slot: string | null
		section: string | null
		question: { id: string; title: string; shape: string; status: string }
	}
	position: number
	total: number
	onMove: (direction: "up" | "down") => void
	onSave: (label: string, slot: string, section: string) => void
	onRemove: () => void
}) {
	const [label, setLabel] = useState(member.label)
	const [slot, setSlot] = useState(member.slot ?? "")
	const [section, setSection] = useState(member.section ?? "")

	return (
		<HStack
			gap="3"
			alignItems="center"
			className={css({
				border: "1px solid {colors.border.default}",
				borderRadius: "lg",
				padding: "3",
			})}
		>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "xs",
					color: "fg.subtle",
					width: "5",
					textAlign: "right",
					flexShrink: 0,
				})}
			>
				{position + 1}
			</span>
			<HStack gap="1" flexShrink={0}>
				<Button
					variant="ghost"
					size="sm"
					disabled={position === 0}
					onClick={() => onMove("up")}
				>
					↑
				</Button>
				<Button
					variant="ghost"
					size="sm"
					disabled={position === total - 1}
					onClick={() => onMove("down")}
				>
					↓
				</Button>
			</HStack>
			<TextInput className={css({ width: "20", flexShrink: 0 })}>
				<TextInput.Group>
					<TextInput.Field
						placeholder="1B"
						maxLength={8}
						value={slot}
						onChange={(e) => setSlot(e.target.value)}
						onBlur={() => onSave(label, slot, section)}
					/>
				</TextInput.Group>
			</TextInput>
			<TextInput className={css({ flexShrink: 0, width: "48" })}>
				<TextInput.Group>
					<TextInput.Field
						placeholder="First base"
						value={label}
						onChange={(e) => setLabel(e.target.value)}
						onBlur={() => onSave(label, slot, section)}
					/>
				</TextInput.Group>
			</TextInput>
			{/* Optional heading for a run of consecutive members - blank on
			    every ungrouped ballot, which is most of them. The public list
			    draws it once where it changes, so leaving it blank here is
			    what keeps a ballot ungrouped. */}
			<TextInput className={css({ flexShrink: 0, width: "36" })}>
				<TextInput.Group>
					<TextInput.Field
						placeholder="Section"
						maxLength={40}
						value={section}
						onChange={(e) => setSection(e.target.value)}
						onBlur={() => onSave(label, slot, section)}
					/>
				</TextInput.Group>
			</TextInput>
			<VStack gap="0.5" alignItems="flex-start" flex="1" minWidth="0">
				<Link
					to="/questions/$questionId"
					params={{ questionId: member.question.id }}
					className={css({
						fontSize: "sm",
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
						_hover: { textDecoration: "underline" },
					})}
				>
					{member.question.title}
				</Link>
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						color: "fg.subtle",
					})}
				>
					{questionShapeLabel[
						member.question.shape as keyof typeof questionShapeLabel
					] ?? member.question.shape}
				</span>
			</VStack>
			<Button variant="ghost" size="sm" onClick={onRemove}>
				Remove
			</Button>
		</HStack>
	)
}

function RouteComponent() {
	const { ballotId } = Route.useParams()
	const {
		data,
		isPending: loading,
		refetch,
	} = useQuery(gqlQueryOptions(AdminBallotDocument, { id: ballotId }))
	const renameBallot = useGqlMutation(RenameBallotDocument)
	const setBallotPublished = useGqlMutation(SetBallotPublishedDocument)
	const updateBallotQuestion = useGqlMutation(UpdateBallotQuestionDocument)
	const removeQuestionFromBallot = useGqlMutation(
		RemoveQuestionFromBallotDocument,
	)
	const reorderBallotQuestions = useGqlMutation(ReorderBallotQuestionsDocument)
	const [name, setName] = useState<string | null>(null)

	const ballot =
		data?.adminBallot?.__typename === "QueryAdminBallotSuccess"
			? data.adminBallot.data
			: null

	if (!loading && !ballot) {
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
	if (!ballot) return null

	const members = [...ballot.members].sort((a, b) => a.sortOrder - b.sortOrder)

	async function move(index: number, direction: "up" | "down") {
		const target = direction === "up" ? index - 1 : index + 1
		if (target < 0 || target >= members.length) return
		const reordered = [...members]
		;[reordered[index], reordered[target]] = [
			reordered[target],
			reordered[index],
		]
		await reorderBallotQuestions.mutateAsync({
				ballotId,
				orderedQuestionIds: reordered.map((m) => m.question.id),
			})
		refetch()
	}

	async function saveMember(
		questionId: string,
		label: string,
		slot: string,
		section: string,
	) {
		if (!label.trim()) return
		await updateBallotQuestion.mutateAsync({
				input: {
					questionId,
					label,
					slot: slot || undefined,
					section: section || undefined,
				},
			})
	}

	async function removeMember(questionId: string, title: string) {
		if (
			!window.confirm(
				`Remove "${title}" from this ballot? The question itself stays.`,
			)
		) {
			return
		}
		await removeQuestionFromBallot.mutateAsync({ questionId })
		refetch()
	}

	return (
		<VStack gap="6" alignItems="stretch">
			<Link
				to="/admin/ballots"
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					color: "fg.subtle",
				})}
			>
				← All ballots
			</Link>
			<HStack justify="space-between" alignItems="flex-start" gap="4">
				<VStack gap="2" alignItems="flex-start" flex="1">
					<TextInput className={css({ maxWidth: "sm", width: "100%" })}>
						<TextInput.Group>
							<TextInput.Field
								value={name ?? ballot.name}
								onChange={(e) => setName(e.target.value)}
								onBlur={() => {
									if (name?.trim() && name !== ballot.name) {
										renameBallot.mutateAsync({ id: ballotId, name: name.trim() })
									}
								}}
							/>
						</TextInput.Group>
					</TextInput>
					<HStack gap="2">
						<Tag>{ballot.league.abbreviation}</Tag>
						<Tag
							variant={ballot.status === "PUBLISHED" ? "primary" : undefined}
						>
							{ballot.status === "PUBLISHED" ? "Published" : "Draft"}
						</Tag>
					</HStack>
				</VStack>
				<Button
					variant="solid"
					size="sm"
					onClick={async () => {
						await setBallotPublished.mutateAsync({
								id: ballotId,
								published: ballot.status !== "PUBLISHED",
							})
						refetch()
					}}
				>
					{ballot.status === "PUBLISHED" ? "Unpublish" : "Publish"}
				</Button>
			</HStack>

			<VStack gap="3" alignItems="stretch">
				<FieldLabel>Members ({members.length})</FieldLabel>
				{members.length === 0 && (
					<Card>
						<Card.Body>
							<p className={css({ fontSize: "sm", color: "fg.subtle" })}>
								No questions yet.
							</p>
						</Card.Body>
					</Card>
				)}
				{members.map((member, i) => (
					<MemberRow
						key={member.id}
						member={member}
						position={i}
						total={members.length}
						onMove={(direction) => move(i, direction)}
						onSave={(label, slot, section) =>
							saveMember(member.question.id, label, slot, section)
						}
						onRemove={() =>
							removeMember(member.question.id, member.question.title)
						}
					/>
				))}
			</VStack>

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
								onAttached={() => refetch()}
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
