import { MAX_FAVORITE_TEAMS } from "@called-my-shot/schemas"
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { FiX } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { Tabs } from "#/components/ui/tabs"
import { TeamBadge } from "#/components/ui/team-badge"
import { TextInput } from "#/components/ui/text-input"
import {
	invalidateFavoriteTeams,
	SetFavoriteTeamsDocument,
} from "#/graphql/favorite-teams/mutations"
import { FavoriteTeamOptionsDocument } from "#/graphql/favorite-teams/queries"
import { useGqlMutation } from "#/graphql/hooks"
import { gqlQueryOptions } from "#/graphql/query-options"
import { closeModal } from "#/stores/modal-store"

const teamOptionsQuery = gqlQueryOptions(FavoriteTeamOptionsDocument, {})

type Props = {
	initialTeamIds: string[]
	// "prompt" is the one-time ask on /home. Same picker, but it's an
	// interruption the viewer didn't ask for, so it says why and offers a way
	// out that reads as "later" rather than "cancel".
	variant?: "edit" | "prompt"
}

// Edits a local copy of the list and writes it once on Save, so tapping
// around costs nothing and closing the modal leaves the saved list alone.
// The order teams are picked in is the order the profile shows them.
export function FavoriteTeamsPickerModal({
	initialTeamIds,
	variant = "edit",
}: Props) {
	const { data } = useSuspenseQuery(teamOptionsQuery)
	const save = useGqlMutation(SetFavoriteTeamsDocument)
	const queryClient = useQueryClient()
	const router = useRouter()

	const [selected, setSelected] = useState(initialTeamIds)
	const [search, setSearch] = useState("")
	const [error, setError] = useState<string | null>(null)

	// Inactive leagues have no questions to call, so a team in one is nothing
	// to follow yet.
	const teams = useMemo(
		() => data.teams.filter((team) => team.league.status === "ACTIVE"),
		[data.teams],
	)
	const byId = useMemo(
		() => new Map(teams.map((team) => [team.id, team])),
		[teams],
	)

	// Alphabetical, the same as the flair picker, so the row doesn't reshuffle
	// as leagues are added.
	const tabs = useMemo(() => {
		const byLeague = new Map<string, string>()
		for (const team of teams) {
			byLeague.set(team.league.slug, team.league.abbreviation)
		}
		return [...byLeague]
			.map(([slug, label]) => ({ slug, label }))
			.sort((a, b) => a.label.localeCompare(b.label))
	}, [teams])

	// Opens on the league of the first team already listed, so an edit starts
	// where their teams are.
	const [tab, setTab] = useState(
		() => byId.get(initialTeamIds[0] ?? "")?.league.slug ?? tabs[0]?.slug ?? "",
	)

	const shown = useMemo(() => {
		const query = search.trim().toLowerCase()
		const pool = query
			? teams.filter(
					(team) =>
						team.name.toLowerCase().includes(query) ||
						team.abbreviation.toLowerCase().includes(query),
				)
			: teams.filter((team) => team.league.slug === tab)
		return [...pool].sort((a, b) => a.name.localeCompare(b.name))
	}, [teams, search, tab])

	const atCap = selected.length >= MAX_FAVORITE_TEAMS
	const unchanged =
		selected.length === initialTeamIds.length &&
		selected.every((id, i) => id === initialTeamIds[i])

	function toggle(teamId: string) {
		setError(null)
		setSelected((current) =>
			current.includes(teamId)
				? current.filter((id) => id !== teamId)
				: current.length >= MAX_FAVORITE_TEAMS
					? current
					: [...current, teamId],
		)
	}

	async function submit() {
		setError(null)
		const result = (await save.mutateAsync({ teamIds: selected }))
			?.setFavoriteTeams
		if (!result) {
			setError("Something went wrong. Try again.")
			return
		}

		await match(result)
			.with({ __typename: "User" }, async () => {
				await invalidateFavoriteTeams(queryClient)
				await router.invalidate()
				closeModal()
			})
			.with({ __typename: "ValidationError" }, async (r) => {
				setError(r.message)
			})
			.with({ __typename: "NotFoundError" }, async () => {
				setError("One of those teams no longer exists. Reload and try again.")
			})
			.with({ __typename: "AuthenticationError" }, async () => {
				setError("You need to sign in to do that.")
			})
			.exhaustive()
	}

	const selectedTeams = selected.flatMap((id) => {
		const team = byId.get(id)
		return team ? [team] : []
	})

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>
				{variant === "prompt" ? "Pick your teams" : "Your teams"}
			</Modal.Title>
			<VStack gap="3.5" alignItems="stretch">
				<span className={css({ fontSize: "xs", color: "fg.muted" })}>
					The teams you follow, in any league. They show on your profile, and
					your flair picker opens on them.
				</span>

				{/* What's picked across every tab, so choosing in one league
				    doesn't hide what's already chosen in another. */}
				<HStack gap="2" flexWrap="wrap" alignItems="center">
					{selectedTeams.map((team) => (
						<button
							key={team.id}
							type="button"
							onClick={() => toggle(team.id)}
							aria-label={`Remove ${team.name}`}
							className={css({
								display: "flex",
								alignItems: "center",
								gap: "1.5",
								padding: "{spacing.1} {spacing.1.5}",
								borderRadius: "sm",
								cursor: "pointer",
								bg: "bg.subtle",
								border: "1px solid {colors.border.default}",
								color: "fg.subtle",
								_hover: {
									border: "1px solid {colors.border.emphasized}",
									color: "fg.default",
								},
							})}
						>
							<TeamBadge
								abbreviation={team.abbreviation}
								color={team.color}
								logoUrl={team.logoUrl}
								showAbbreviation
							/>
							<FiX size={12} />
						</button>
					))}
					<span
						className={css({
							textStyle: "meta",
							color: atCap ? "fg.default" : "fg.subtle",
						})}
					>
						{selected.length} of {MAX_FAVORITE_TEAMS}
					</span>
				</HStack>

				<TextInput>
					<TextInput.Group>
						<TextInput.Field
							type="search"
							placeholder="Search all teams"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
						/>
					</TextInput.Group>
				</TextInput>

				{/* Hidden while searching: results already span every league. */}
				{!search.trim() && tabs.length > 1 && (
					<Tabs value={tab} onValueChange={setTab}>
						<Tabs.List>
							{tabs.map((entry) => (
								<Tabs.Trigger key={entry.slug} value={entry.slug}>
									{entry.label}
								</Tabs.Trigger>
							))}
						</Tabs.List>
					</Tabs>
				)}

				{error && <FormError message={error} />}

				<div
					className={css({
						maxHeight: "72",
						overflowY: "auto",
						display: "grid",
						gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
						gap: "1.5",
						alignItems: "stretch",
						paddingRight: "1",
					})}
				>
					{shown.map((team) => {
						const isSelected = selected.includes(team.id)
						return (
							<button
								key={team.id}
								type="button"
								onClick={() => toggle(team.id)}
								aria-pressed={isSelected}
								disabled={!isSelected && atCap}
								className={css({
									display: "flex",
									alignItems: "center",
									gap: "2",
									width: "full",
									minWidth: "0",
									padding: "{spacing.1} {spacing.1.5}",
									borderRadius: "sm",
									cursor: "pointer",
									textAlign: "left",
									fontSize: "xs",
									color: "fg.body",
									bg: "bg.subtle",
									border: "1px solid {colors.border.default}",
									_hover: { border: "1px solid {colors.border.emphasized}" },
									"&[aria-pressed='true']": {
										border: "1px solid {colors.primary.default}",
									},
									_disabled: { opacity: 0.5, cursor: "not-allowed" },
								})}
							>
								<TeamBadge
									abbreviation={team.abbreviation}
									color={team.color}
									logoUrl={team.logoUrl}
								/>
								<span
									className={css({ minWidth: "0", overflowWrap: "anywhere" })}
								>
									{team.name}
								</span>
							</button>
						)
					})}
				</div>

				{shown.length === 0 && (
					<span className={css({ fontSize: "xs", color: "fg.subtle" })}>
						No team matches that.
					</span>
				)}

				{atCap && (
					<span className={css({ fontSize: "xs", color: "fg.subtle" })}>
						Up to {MAX_FAVORITE_TEAMS} teams. Remove one to add another.
					</span>
				)}

				<HStack justify="flex-end" gap="2">
					<Button variant="outline" size="sm" onClick={() => closeModal()}>
						{variant === "prompt" ? "Not now" : "Cancel"}
					</Button>
					<Button
						size="sm"
						onClick={submit}
						loading={save.isPending}
						disabled={unchanged}
					>
						Save
					</Button>
				</HStack>
			</VStack>
		</Modal>
	)
}
