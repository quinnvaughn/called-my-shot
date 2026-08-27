import { useMutation, useQuery } from "@apollo/client/react"
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
import {
	RemoveQuestionFromSlateDocument,
	RenameSlateDocument,
	ReorderSlateQuestionsDocument,
	SetSlatePublishedDocument,
	UpdateSlateQuestionDocument,
} from "#/graphql/mutations/slates"
import { AdminSlateDocument } from "#/graphql/queries/slates"
import { questionShapeLabel } from "#/lib/question-labels"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/admin/slates/$slateId")({
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
		question: { id: string; title: string; shape: string; status: string }
	}
	position: number
	total: number
	onMove: (direction: "up" | "down") => void
	onSave: (label: string, slot: string) => void
	onRemove: () => void
}) {
	const [label, setLabel] = useState(member.label)
	const [slot, setSlot] = useState(member.slot ?? "")

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
						onBlur={() => onSave(label, slot)}
					/>
				</TextInput.Group>
			</TextInput>
			<TextInput className={css({ flexShrink: 0, width: "48" })}>
				<TextInput.Group>
					<TextInput.Field
						placeholder="First base"
						value={label}
						onChange={(e) => setLabel(e.target.value)}
						onBlur={() => onSave(label, slot)}
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
	const { slateId } = Route.useParams()
	const { data, loading, refetch } = useQuery(AdminSlateDocument, {
		variables: { id: slateId },
	})
	const [renameSlate] = useMutation(RenameSlateDocument)
	const [setSlatePublished] = useMutation(SetSlatePublishedDocument)
	const [updateSlateQuestion] = useMutation(UpdateSlateQuestionDocument)
	const [removeQuestionFromSlate] = useMutation(RemoveQuestionFromSlateDocument)
	const [reorderSlateQuestions] = useMutation(ReorderSlateQuestionsDocument)
	const [name, setName] = useState<string | null>(null)

	const slate =
		data?.adminSlate?.__typename === "QueryAdminSlateSuccess"
			? data.adminSlate.data
			: null

	if (!loading && !slate) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Slate"
				heading="This slate doesn't exist"
				subtitle="It may have been deleted."
				link={{ text: "Back to Slates", url: "/admin/slates" }}
			/>
		)
	}
	if (!slate) return null

	const members = [...slate.members].sort((a, b) => a.sortOrder - b.sortOrder)

	async function move(index: number, direction: "up" | "down") {
		const target = direction === "up" ? index - 1 : index + 1
		if (target < 0 || target >= members.length) return
		const reordered = [...members]
		;[reordered[index], reordered[target]] = [
			reordered[target],
			reordered[index],
		]
		await reorderSlateQuestions({
			variables: {
				slateId,
				orderedQuestionIds: reordered.map((m) => m.question.id),
			},
		})
		refetch()
	}

	async function saveMember(questionId: string, label: string, slot: string) {
		if (!label.trim()) return
		await updateSlateQuestion({
			variables: { input: { questionId, label, slot: slot || undefined } },
		})
	}

	async function removeMember(questionId: string, title: string) {
		if (
			!window.confirm(
				`Remove "${title}" from this slate? The question itself stays.`,
			)
		) {
			return
		}
		await removeQuestionFromSlate({ variables: { questionId } })
		refetch()
	}

	return (
		<VStack gap="6" alignItems="stretch">
			<Link
				to="/admin/slates"
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					color: "fg.subtle",
				})}
			>
				← All slates
			</Link>
			<HStack justify="space-between" alignItems="flex-start" gap="4">
				<VStack gap="2" alignItems="flex-start" flex="1">
					<TextInput className={css({ maxWidth: "sm", width: "100%" })}>
						<TextInput.Group>
							<TextInput.Field
								value={name ?? slate.name}
								onChange={(e) => setName(e.target.value)}
								onBlur={() => {
									if (name?.trim() && name !== slate.name) {
										renameSlate({
											variables: { id: slateId, name: name.trim() },
										})
									}
								}}
							/>
						</TextInput.Group>
					</TextInput>
					<HStack gap="2">
						<Tag>{slate.league.abbreviation}</Tag>
						<Tag variant={slate.status === "PUBLISHED" ? "primary" : undefined}>
							{slate.status === "PUBLISHED" ? "Published" : "Draft"}
						</Tag>
					</HStack>
				</VStack>
				<Button
					variant="solid"
					size="sm"
					onClick={async () => {
						await setSlatePublished({
							variables: {
								id: slateId,
								published: slate.status !== "PUBLISHED",
							},
						})
						refetch()
					}}
				>
					{slate.status === "PUBLISHED" ? "Unpublish" : "Publish"}
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
						onSave={(label, slot) =>
							saveMember(member.question.id, label, slot)
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
					search={{ slateId }}
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
								slateId={slateId}
								leagueId={slate.league.id}
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
