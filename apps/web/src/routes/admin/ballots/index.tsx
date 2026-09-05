import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { NewBallotModal } from "#/components/admin/new-ballot-modal"
import { Button } from "#/components/ui/button"
import { PageHeader } from "#/components/ui/page-header"
import { Select } from "#/components/ui/select"
import { Table, type TableColumn } from "#/components/ui/table"
import { Tag } from "#/components/ui/tag"
import { TextInput } from "#/components/ui/text-input"
import type { AdminBallotSort, BallotStatus } from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import {
	DeleteBallotDocument,
	ReorderBallotsDocument,
} from "#/graphql/mutations/ballots"
import { AdminBallotsDocument } from "#/graphql/queries/ballots"
import {
	AdminBallotScopeDocument,
	SportsDocument,
} from "#/graphql/queries/sports"
import { EMPTY_CONNECTION, gqlQueryOptions } from "#/graphql/query-options"
import { useAdminConnection } from "#/hooks/use-admin-connection"
import { useDebouncedValue } from "#/hooks/use-debounced-value"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/admin/ballots/")({
	component: RouteComponent,
})

const STATUS_FILTERS: { value: BallotStatus | null; label: string }[] = [
	{ value: null, label: "All" },
	{ value: "DRAFT", label: "Draft" },
	{ value: "PUBLISHED", label: "Published" },
]

// Empty string is the Select's "no filter" value - Select's value is a plain
// string, so the sentinel lives here rather than as a nullable value type.
const ALL_LEAGUES = ""

type ColumnKey =
	| "position"
	| "move"
	| "name"
	| "league"
	| "members"
	| "status"
	| "actions"

const BROWSE_COLUMNS: TableColumn<ColumnKey>[] = [
	{ key: "name", label: "Ballot" },
	{ key: "league", label: "League", sortable: false },
	{ key: "members", label: "Members", numeric: true, sortable: false },
	{ key: "status", label: "Status" },
	{ key: "actions", label: "", sortable: false },
]

// Nothing is sortable here - the point of this mode is the order stored on the
// rows, so a header that reorders the view out from under the ↑/↓ buttons would
// only be a way to lose your place. League drops off too, being the same on
// every row once the list is scoped to one.
const ORDERING_COLUMNS: TableColumn<ColumnKey>[] = [
	{ key: "position", label: "#", sortable: false, width: "3rem" },
	{ key: "move", label: "", sortable: false, width: "6rem" },
	{ key: "name", label: "Ballot", sortable: false },
	{ key: "members", label: "Members", numeric: true, sortable: false },
	{ key: "status", label: "Status", sortable: false },
	{ key: "actions", label: "", sortable: false },
]

type SortKey = "name" | "status"

const SORT_KEY_TO_ENUM: Record<SortKey, AdminBallotSort> = {
	name: "NAME",
	status: "STATUS",
}
const SORT_ENUM_TO_KEY: Record<AdminBallotSort, SortKey> = {
	NAME: "name",
	STATUS: "status",
	CREATED_AT: "name",
	SORT_ORDER: "name",
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

type BallotRow = {
	id: string
	name: string
	status: BallotStatus
	memberCount: number
	sortOrder: number
	league: { id: string; name: string; abbreviation: string }
}

function RouteComponent() {
	const [search, setSearch] = useState("")
	const [status, setStatus] = useState<BallotStatus | null>(null)
	const [leagueId, setLeagueId] = useState(ALL_LEAGUES)
	const [seasonId, setSeasonId] = useState<string | null>(null)
	const debouncedSearch = useDebouncedValue(search, 300)
	const deleteBallot = useGqlMutation(DeleteBallotDocument)
	const reorderBallots = useGqlMutation(ReorderBallotsDocument)

	const { data: sportsData } = useQuery(gqlQueryOptions(SportsDocument, {}))
	const leagues = useMemo(
		() => sportsData?.sports.flatMap((sport) => sport.leagues) ?? [],
		[sportsData],
	)

	const { data: scopeData } = useQuery(
		gqlQueryOptions(
			AdminBallotScopeDocument,
			{ leagueId },
			{ enabled: !!leagueId },
		),
	)
	const seasons = useMemo(
		() => scopeData?.leagueSeasons ?? [],
		[scopeData],
	)

	// Lands on the league's current season rather than its newest, which aren't
	// the same thing (the sync carries this year and next). Written as a
	// correction rather than a one-shot default so switching leagues fixes
	// itself: a seasonId belonging to the league you just left won't be in the
	// new list, so it gets replaced instead of silently filtering to nothing.
	useEffect(() => {
		if (!leagueId) {
			setSeasonId(null)
			return
		}
		if (!scopeData) return
		if (seasonId && seasons.some((season) => season.id === seasonId)) return
		setSeasonId(scopeData.currentSeason?.id ?? seasons[0]?.id ?? null)
	}, [leagueId, scopeData, seasons, seasonId])

	// Reordering only means anything within one league and season - that pair is
	// the scope ballots.sortOrder is positional in - so the list only becomes
	// the sortable thing once both are picked. Anything less stays the ordinary
	// searchable, paginated table.
	const isOrdering = Boolean(leagueId && seasonId)

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
		defaultSort: "NAME" as AdminBallotSort,
		document: AdminBallotsDocument,
		variables: ({ sortBy, sortDir }) => ({
			search: debouncedSearch || undefined,
			status: status ?? undefined,
			leagueId: leagueId || undefined,
			// Ordering mode ignores the hook's own sort state and pages in one
			// go: a position you can only see one page of isn't a position you
			// can move a ballot to.
			seasonId: isOrdering ? (seasonId ?? undefined) : undefined,
			sortBy: isOrdering ? "SORT_ORDER" : sortBy,
			sortDir: isOrdering ? "ASC" : sortDir,
			first: isOrdering ? 100 : undefined,
		}),
		selectConnection: (data) =>
			data.adminBallots.__typename === "QueryAdminBallotsSuccess"
				? data.adminBallots.data
				: EMPTY_CONNECTION,
	})

	async function handleDelete(ballot: BallotRow) {
		if (
			!window.confirm(
				`Delete "${ballot.name}"? Its questions stay exactly as they are - only the grouping goes away.`,
			)
		) {
			return
		}
		await deleteBallot.mutateAsync({ id: ballot.id })
		reload()
	}

	// Sends the whole ordered set, not the one ballot that moved - same shape
	// as the builder page's member reordering, and what lets the server reject
	// anything that isn't exactly this scope's current ballots.
	async function move(index: number, direction: "up" | "down") {
		if (!seasonId) return
		const target = direction === "up" ? index - 1 : index + 1
		if (target < 0 || target >= items.length) return
		const reordered = [...items]
		;[reordered[index], reordered[target]] = [
			reordered[target],
			reordered[index],
		]
		await reorderBallots.mutateAsync({
				leagueId,
				seasonId,
				orderedBallotIds: reordered.map((ballot) => ballot.id),
			})
		reload()
	}

	const selectedLeague = leagues.find((league) => league.id === leagueId)
	const selectedSeason = seasons.find((season) => season.id === seasonId)

	return (
		<VStack gap="6" alignItems="stretch">
			<HStack justify="space-between" alignItems="flex-start" gap="4">
				<PageHeader
					title="Ballots"
					subtitle="Award ballots, a week of games - a set of questions people answer at their own pace."
				/>
				<Button
					variant="solid"
					size="sm"
					onClick={() => openModal(<NewBallotModal />)}
				>
					+ New ballot
				</Button>
			</HStack>
			<TextInput>
				<TextInput.Group>
					<TextInput.Field
						placeholder="Search ballots…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</TextInput.Group>
			</TextInput>
			<HStack gap="3" flexWrap="wrap" alignItems="flex-start">
				<Select
					value={leagueId}
					onValueChange={setLeagueId}
					className={css({ width: "44" })}
				>
					<Select.Trigger>
						{selectedLeague?.name ?? "All leagues"}
					</Select.Trigger>
					<Select.Content>
						<Select.Option value={ALL_LEAGUES}>All leagues</Select.Option>
						{sportsData?.sports.map((sport) => (
							<div key={sport.id}>
								<Select.GroupLabel>{sport.name}</Select.GroupLabel>
								{sport.leagues.map((league) => (
									<Select.Option key={league.id} value={league.id}>
										{league.name}
									</Select.Option>
								))}
							</div>
						))}
					</Select.Content>
				</Select>
				<Select
					value={seasonId ?? ""}
					onValueChange={setSeasonId}
					className={css({ width: "36" })}
				>
					<Select.Trigger disabled={!leagueId}>
						{selectedSeason?.displayName ?? "Season"}
					</Select.Trigger>
					<Select.Content>
						{seasons.map((season) => (
							<Select.Option key={season.id} value={season.id}>
								{season.displayName}
							</Select.Option>
						))}
					</Select.Content>
				</Select>
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
			</HStack>

			<Table
				sortBy={isOrdering ? "name" : SORT_ENUM_TO_KEY[sortBy]}
				sortDir={sortDir}
				onSort={
					isOrdering
						? undefined
						: (key: ColumnKey) => onSort(SORT_KEY_TO_ENUM[key as SortKey])
				}
			>
				<Table.Head columns={isOrdering ? ORDERING_COLUMNS : BROWSE_COLUMNS} />
				<Table.Body>
					{items.map((ballot, i) => (
						<Table.Row key={ballot.id}>
							{isOrdering && (
								<>
									<Table.Cell>
										<span
											className={css({
												fontFamily: "mono",
												fontSize: "xs",
												color: "fg.subtle",
											})}
										>
											{i + 1}
										</span>
									</Table.Cell>
									<Table.Cell>
										<HStack gap="1">
											<Button
												variant="ghost"
												size="sm"
												disabled={i === 0 || loading}
												onClick={() => move(i, "up")}
											>
												↑
											</Button>
											<Button
												variant="ghost"
												size="sm"
												disabled={i === items.length - 1 || loading}
												onClick={() => move(i, "down")}
											>
												↓
											</Button>
										</HStack>
									</Table.Cell>
								</>
							)}
							<Table.Cell>
								<Link
									className={css({ _hover: { textDecoration: "underline" } })}
									to="/admin/ballots/$ballotId"
									params={{ ballotId: ballot.id }}
								>
									{ballot.name}
								</Link>
							</Table.Cell>
							{!isOrdering && (
								<Table.Cell>{ballot.league.abbreviation}</Table.Cell>
							)}
							<Table.Cell numeric>{ballot.memberCount}</Table.Cell>
							<Table.Cell>
								<Tag
									variant={ballot.status === "PUBLISHED" ? "primary" : undefined}
								>
									{ballot.status === "PUBLISHED" ? "Published" : "Draft"}
								</Tag>
							</Table.Cell>
							<Table.Cell numeric>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => handleDelete(ballot)}
								>
									Delete
								</Button>
							</Table.Cell>
						</Table.Row>
					))}
				</Table.Body>
			</Table>

			{hasNextPage && !isOrdering && (
				<Button variant="outline" size="sm" loading={loading} onClick={loadMore}>
					Show more →
				</Button>
			)}
		</VStack>
	)
}
