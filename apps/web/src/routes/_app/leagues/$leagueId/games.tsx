import { createFileRoute } from "@tanstack/react-router"
import { FiChevronLeft, FiChevronRight } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { GameRow } from "#/components/leagues/game-row"
import { EmptyState } from "#/components/ui/empty-state"
import { LeagueGamesForWindowDocument } from "#/graphql/queries/sports"

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
		const { data } = await context.apolloClient.query({
			query: LeagueGamesForWindowDocument,
			variables: { leagueId: params.leagueId, windowKey: deps.windowKey ?? null },
			fetchPolicy: "network-only",
		})
		return {
			result: data?.leagueGamesForWindow ?? {
				window: { key: "", label: "No games scheduled", sublabel: null },
				prevKey: null,
				nextKey: null,
				groups: [],
			},
		}
	},
})

function RouteComponent() {
	const { result } = Route.useLoaderData()
	const navigate = Route.useNavigate()

	const hasGames = result.groups.some((group) => group.games.length > 0)

	function stepTo(key: string | null) {
		if (!key) return
		navigate({ search: { windowKey: key } })
	}

	return (
		<VStack gap="4" alignItems="stretch">
			<HStack
				justify="space-between"
				alignItems="center"
				gap="3"
				className={css({
					border: "1px solid {colors.border.default}",
					borderRadius: "xl",
					bg: "bg.subtle",
					padding: "2.5",
				})}
			>
				<button
					type="button"
					aria-label="Previous"
					disabled={!result.prevKey}
					onClick={() => stepTo(result.prevKey)}
					className={css({
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: "8",
						height: "8",
						borderRadius: "lg",
						border: "1px solid {colors.border.default}",
						color: "fg.subtle",
						cursor: "pointer",
						_disabled: { opacity: 0.3, cursor: "default" },
						_hover: { color: "fg.default" },
					})}
				>
					<FiChevronLeft />
				</button>
				<VStack gap="0.5" flex="1" minWidth="0">
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "sm",
							fontWeight: "bold",
							letterSpacing: "wide",
							textAlign: "center",
						})}
					>
						{result.window.label}
					</span>
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
						width: "8",
						height: "8",
						borderRadius: "lg",
						border: "1px solid {colors.border.default}",
						color: "fg.subtle",
						cursor: "pointer",
						_disabled: { opacity: 0.3, cursor: "default" },
						_hover: { color: "fg.default" },
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
