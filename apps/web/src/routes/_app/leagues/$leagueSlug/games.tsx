import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { FiChevronLeft, FiChevronRight } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { GameRow } from "#/components/leagues/game-row"
import { EmptyState } from "#/components/ui/empty-state"
import { Select } from "#/components/ui/select"
import {
	LeagueGamesForWindowDocument,
	LeagueGameWindowsDocument,
	leagueQuery,
} from "#/graphql/queries/sports"
import { gqlQueryOptions } from "#/graphql/query-options"

// Stands in for a league with nothing synced yet - no window to step
// through, so the stepper renders its own empty state instead.
const EMPTY_RESULT = {
	window: { key: "", label: "No games scheduled", sublabel: null },
	prevKey: null,
	nextKey: null,
	groups: [],
}

const gamesForWindowQuery = (leagueId: string, windowKey: string | null) =>
	gqlQueryOptions(LeagueGamesForWindowDocument, { leagueId, windowKey })

const gameWindowsQuery = (leagueId: string) =>
	gqlQueryOptions(LeagueGameWindowsDocument, { leagueId })

export const Route = createFileRoute("/_app/leagues/$leagueSlug/games")({
	component: RouteComponent,
	staleTime: 0,
	validateSearch: (
		search: Record<string, unknown>,
	): { windowKey?: string } => ({
		windowKey:
			typeof search.windowKey === "string" ? search.windowKey : undefined,
	}),
	loaderDeps: ({ search }) => ({ windowKey: search.windowKey }),
	loader: ({ context, deps }) => {
		const leagueId = context.league.id
		return Promise.all([
			context.queryClient.query(
				gamesForWindowQuery(leagueId, deps.windowKey ?? null),
			),
			context.queryClient.query(gameWindowsQuery(leagueId)),
		])
	},
})

function RouteComponent() {
	const { windowKey } = Route.useSearch()
	const { league: contextLeague } = Route.useRouteContext()
	const { data: windowData } = useSuspenseQuery(
		gamesForWindowQuery(contextLeague.id, windowKey ?? null),
	)
	const { data: windowsData } = useSuspenseQuery(
		gameWindowsQuery(contextLeague.id),
	)
	const { data: leagueData } = useSuspenseQuery(leagueQuery(contextLeague.id))
	const result = windowData.leagueGamesForWindow ?? EMPTY_RESULT
	const windows = windowsData.leagueGameWindows
	const league = leagueData.league
	const navigate = Route.useNavigate()

	const hasGames = result.groups.some((group) => group.games.length > 0)

	function stepTo(key: string | null) {
		if (!key) return
		navigate({ search: { windowKey: key } })
	}

	// windowKey omitted -> the server's own default (today/this week if it
	// has games, else nearest upcoming, else most recent past - see
	// pickDefaultWindowIndex). Safe to hit even when already there.
	function jumpToDefault() {
		navigate({ search: {} })
	}

	return (
		<VStack gap="4" alignItems="stretch">
			<HStack justify="flex-end">
				<button
					type="button"
					onClick={jumpToDefault}
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						letterSpacing: "wide",
						textTransform: "uppercase",
						color: "fg.subtle",
						cursor: "pointer",
						_hover: { color: "fg.default", textDecoration: "underline" },
					})}
				>
					{league?.windowType === "WEEK" ? "Current Week" : "Today"}
				</button>
			</HStack>

			<HStack gap="2" alignItems="flex-start">
				<button
					type="button"
					aria-label="Previous"
					disabled={!result.prevKey}
					onClick={() => stepTo(result.prevKey)}
					className={css({
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: "10",
						height: "10",
						flexShrink: 0,
						borderRadius: "lg",
						border: "1px solid {colors.border.default}",
						color: "fg.subtle",
						cursor: "pointer",
						_disabled: { opacity: 0.3, cursor: "default" },
						_hover: { color: "fg.default", borderColor: "border.emphasized" },
					})}
				>
					<FiChevronLeft />
				</button>

				<VStack gap="1.5" flex="1" minWidth="0" alignItems="stretch">
					<Select value={result.window.key} onValueChange={stepTo}>
						<Select.Trigger
							className={css({ "& > span": { textAlign: "center" } })}
						>
							{result.window.label}
						</Select.Trigger>
						<Select.Content>
							{windows.map((w) => (
								<Select.Option key={w.key} value={w.key}>
									{w.label}
								</Select.Option>
							))}
						</Select.Content>
					</Select>
					{result.window.sublabel && (
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "2xs",
								color: "fg.subtle",
								textAlign: "center",
							})}
						>
							{result.window.sublabel}
						</span>
					)}
				</VStack>

				<button
					type="button"
					aria-label="Next"
					disabled={!result.nextKey}
					onClick={() => stepTo(result.nextKey)}
					className={css({
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: "10",
						height: "10",
						flexShrink: 0,
						borderRadius: "lg",
						border: "1px solid {colors.border.default}",
						color: "fg.subtle",
						cursor: "pointer",
						_disabled: { opacity: 0.3, cursor: "default" },
						_hover: { color: "fg.default", borderColor: "border.emphasized" },
					})}
				>
					<FiChevronRight />
				</button>
			</HStack>

			{!hasGames ? (
				<EmptyState>
					Nothing scheduled. Season questions are still open in the Season tab.
				</EmptyState>
			) : (
				result.groups.map((group, i) => (
					<VStack key={group.slotLabel ?? i} gap="2" alignItems="stretch">
						{group.slotLabel && (
							<HStack gap="2.5" alignItems="center">
								<span
									className={css({
										fontFamily: "mono",
										fontSize: "2xs",
										letterSpacing: "wide",
										color: "fg.muted",
										whiteSpace: "nowrap",
									})}
								>
									{group.slotLabel}
								</span>
								<span
									className={css({
										flex: 1,
										height: "1px",
										bg: "border.default",
									})}
								/>
							</HStack>
						)}
						{group.games.map((game) => (
							<GameRow key={game.id} game={game} />
						))}
					</VStack>
				))
			)}
		</VStack>
	)
}
