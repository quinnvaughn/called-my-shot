import { createFileRoute, useLoaderData } from "@tanstack/react-router"
import { FiChevronLeft, FiChevronRight } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { GameRow } from "#/components/leagues/game-row"
import { EmptyState } from "#/components/ui/empty-state"
import { Select } from "#/components/ui/select"
import {
	LeagueGamesForWindowDocument,
	LeagueGameWindowsDocument,
} from "#/graphql/queries/sports"

export const Route = createFileRoute("/_app/leagues/$leagueId/games")({
	component: RouteComponent,
	staleTime: 0,
	validateSearch: (
		search: Record<string, unknown>,
	): { windowKey?: string } => ({
		windowKey:
			typeof search.windowKey === "string" ? search.windowKey : undefined,
	}),
	loaderDeps: ({ search }) => ({ windowKey: search.windowKey }),
	loader: async ({ context, params, deps }) => {
		const [{ data }, { data: windowsData }] = await Promise.all([
			context.apolloClient.query({
				query: LeagueGamesForWindowDocument,
				variables: {
					leagueId: params.leagueId,
					windowKey: deps.windowKey ?? null,
				},
				fetchPolicy: "network-only",
			}),
			context.apolloClient.query({
				query: LeagueGameWindowsDocument,
				variables: { leagueId: params.leagueId },
				fetchPolicy: "network-only",
			}),
		])
		return {
			result: data?.leagueGamesForWindow ?? {
				window: { key: "", label: "No games scheduled", sublabel: null },
				prevKey: null,
				nextKey: null,
				groups: [],
			},
			windows: windowsData?.leagueGameWindows ?? [],
		}
	},
})

function RouteComponent() {
	const { result, windows } = Route.useLoaderData()
	const { league } = useLoaderData({ from: "/_app/leagues/$leagueId" })
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
					Nothing scheduled. Season questions are still open in the Season
					tab.
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
