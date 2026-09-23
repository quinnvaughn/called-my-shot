import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { QuestionRowActions } from "#/components/admin/question-row-actions"
import { Button } from "#/components/ui/button"
import { PageHeader } from "#/components/ui/page-header"
import { Table } from "#/components/ui/table"
import { Tag } from "#/components/ui/tag"
import { TextInput } from "#/components/ui/text-input"
import type {
	AdminQuestionSort,
	QuestionStatus,
} from "#/graphql/generated/graphql"
import { AdminQuestionsDocument } from "#/graphql/queries/admin"
import { EMPTY_CONNECTION } from "#/graphql/query-options"
import { useAdminConnection } from "#/hooks/use-admin-connection"
import { useDebouncedValue } from "#/hooks/use-debounced-value"
import { questionShapeLabel } from "#/lib/question-labels"

export const Route = createFileRoute("/admin/questions")({
	component: RouteComponent,
})

const STATUS_FILTERS: { value: QuestionStatus | null; label: string }[] = [
	{ value: null, label: "All" },
	{ value: "OPEN", label: "Open" },
	{ value: "RESOLVED", label: "Resolved" },
	{ value: "DISPUTED", label: "Disputed" },
	{ value: "VOIDED", label: "Voided" },
]

const columns = [
	{ key: "title", label: "Question" },
	{ key: "shape", label: "Shape" },
	{ key: "asker", label: "Asker" },
	{ key: "calls", label: "Callers", numeric: true },
	{ key: "status", label: "Status" },
	{ key: "actions", label: "", sortable: false },
] as const

type SortKey = "title" | "shape" | "asker" | "calls" | "status"

const SORT_KEY_TO_ENUM: Record<SortKey, AdminQuestionSort> = {
	title: "TITLE",
	shape: "SHAPE",
	asker: "ASKER",
	calls: "CALLERS",
	status: "STATUS",
}
const SORT_ENUM_TO_KEY: Record<AdminQuestionSort, SortKey> = {
	TITLE: "title",
	SHAPE: "shape",
	ASKER: "asker",
	CALLERS: "calls",
	STATUS: "status",
}

function questionDisplayStatus(status: QuestionStatus, locksAt: string) {
	return match(status)
		.with("OPEN", () =>
			new Date(locksAt) <= new Date()
				? { label: "Locked", variant: "neutral" as const }
				: { label: "Live", variant: "primary" as const },
		)
		.with("LOCKED", () => ({ label: "Locked", variant: "neutral" as const }))
		.with("DISPUTED", () => ({
			label: "Disputed",
			variant: "primary" as const,
		}))
		.with("RESOLVED", () => ({
			label: "Resolved",
			variant: "neutral" as const,
		}))
		.with("VOIDED", () => ({ label: "Voided", variant: "neutral" as const }))
		.exhaustive()
}

const filterPill = css({
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	textTransform: "uppercase",
	padding: "{spacing.1.5} {spacing.3}",
	borderRadius: "lg",
	border: "1px solid {colors.border.default}",
	color: "fg.subtle",
	cursor: "pointer",
	_hover: { borderColor: "border.emphasized", color: "fg.default" },
})

const filterPillActive = css({
	borderColor: "fg.default",
	color: "bg.canvas",
	bg: "fg.default",
	_hover: { borderColor: "fg.default", color: "bg.canvas" },
})

function RouteComponent() {
	const [search, setSearch] = useState("")
	const [status, setStatus] = useState<QuestionStatus | null>(null)
	const debouncedSearch = useDebouncedValue(search, 300)

	const {
		items,
		loading,
		hasNextPage,
		sortBy,
		sortDir,
		onSort,
		loadMore,
		reload,
	} = useAdminConnection({
		defaultSort: "TITLE" as AdminQuestionSort,
		document: AdminQuestionsDocument,
		variables: ({ sortBy, sortDir }) => ({
			search: debouncedSearch || undefined,
			status: status ?? undefined,
			sortBy,
			sortDir,
		}),
		selectConnection: (data) =>
			data.adminQuestions.__typename === "QueryAdminQuestionsSuccess"
				? data.adminQuestions.data
				: EMPTY_CONNECTION,
	})

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader
				title="Questions"
				subtitle="Every question on the platform."
			/>
			<TextInput>
				<TextInput.Group>
					<TextInput.Field
						placeholder="Search questions or askers…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</TextInput.Group>
			</TextInput>
			<HStack gap="1.5" flexWrap="wrap">
				{STATUS_FILTERS.map((filter) => (
					<button
						key={filter.label}
						type="button"
						onClick={() => setStatus(filter.value)}
						className={cx(
							filterPill,
							status === filter.value && filterPillActive,
						)}
					>
						{filter.label}
					</button>
				))}
			</HStack>

			<Table
				wide
				sortBy={SORT_ENUM_TO_KEY[sortBy]}
				sortDir={sortDir}
				onSort={(key: SortKey) => onSort(SORT_KEY_TO_ENUM[key])}
			>
				<Table.Head columns={[...columns]} />
				<Table.Body>
					{items.map((question) => {
						const displayStatus = questionDisplayStatus(
							question.status,
							question.locksAt,
						)
						return (
							<Table.Row key={question.id}>
								<Table.Cell>
									<Link
										className={css({ _hover: { textDecoration: "underline" } })}
										to="/questions/$questionId/{-$slug}"
										params={{ questionId: question.id }}
									>
										{question.title}
									</Link>
								</Table.Cell>
								<Table.Cell>
									{questionShapeLabel[
										question.shape as keyof typeof questionShapeLabel
									] ?? question.shape}
								</Table.Cell>
								<Table.Cell>
									{question.creator ? `@${question.creator.username}` : "-"}
								</Table.Cell>
								<Table.Cell numeric>{question.callCount}</Table.Cell>
								<Table.Cell>
									<Tag variant={displayStatus.variant}>
										{displayStatus.label}
									</Tag>
								</Table.Cell>
								<Table.Cell numeric>
									<QuestionRowActions
										question={question}
										onChanged={() => reload()}
									/>
								</Table.Cell>
							</Table.Row>
						)
					})}
				</Table.Body>
			</Table>

			{hasNextPage && (
				<Button
					variant="outline"
					size="sm"
					loading={loading}
					onClick={loadMore}
				>
					Show more →
				</Button>
			)}
		</VStack>
	)
}
