import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { FlairOption } from "#/components/ui/flair-option"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { Tabs } from "#/components/ui/tabs"
import { TextInput } from "#/components/ui/text-input"
import {
	EquipFlairDocument,
	UnequipFlairDocument,
} from "#/graphql/flairs/mutations"
import { MyFlairsDocument } from "#/graphql/flairs/queries"
import { useGqlMutation } from "#/graphql/hooks"
import { gqlQueryOptions } from "#/graphql/query-options"
import { toFlair } from "#/lib/identity"
import { closeModal } from "#/stores/modal-store"

const myFlairsQuery = gqlQueryOptions(MyFlairsDocument, {})

// The tab earned flairs live under. Not a league slug, so it can't collide
// with one.
const EARNED = "earned"
// The viewer's favorite teams, gathered from across the league tabs. Not a
// league slug either.
const YOUR_TEAMS = "your-teams"

type Props = {
	equippedFlairId: string | null
}

type PickerFlair = {
	id: string
	teamId: string | null
	// What search matches on: a team's full name, or an earned flair's label.
	name: string
	description: string | null
	group: string
	groupLabel: string
	display: { icon: string; label: string; color: string }
}

export function FlairPickerModal({ equippedFlairId }: Props) {
	const { data } = useSuspenseQuery(myFlairsQuery)
	const equip = useGqlMutation(EquipFlairDocument)
	const unequip = useGqlMutation(UnequipFlairDocument)
	const queryClient = useQueryClient()
	const router = useRouter()

	const [search, setSearch] = useState("")
	const [error, setError] = useState<string | null>(null)
	const [saving, setSaving] = useState(false)

	const flairs: PickerFlair[] = useMemo(
		() =>
			data.myFlairs.map((flair) => {
				const display = toFlair(flair) ?? {
					icon: "?",
					label: "",
					color: "#6B7280",
				}
				return {
					id: flair.id,
					teamId: flair.team?.id ?? null,
					name: flair.team?.name ?? display.label,
					description: flair.description ?? null,
					group: flair.team?.league.slug ?? EARNED,
					groupLabel: flair.team?.league.abbreviation ?? "Earned",
					display,
				}
			}),
		[data.myFlairs],
	)

	// In the order they listed them, which is also the order the tab shows.
	const favoriteTeamIds = useMemo(
		() => data.me?.favoriteTeams.map((team) => team.id) ?? [],
		[data.me],
	)
	const favoriteFlairs = useMemo(
		() =>
			favoriteTeamIds.flatMap((teamId) => {
				const flair = flairs.find((f) => f.teamId === teamId)
				return flair ? [flair] : []
			}),
		[favoriteTeamIds, flairs],
	)

	// Your teams first when there are any, then Earned when there's anything
	// in it, then one tab per league. Leagues in alphabetical order so the row
	// doesn't reshuffle as the catalog grows.
	const tabs = useMemo(() => {
		const byGroup = new Map<string, string>()
		for (const flair of flairs) byGroup.set(flair.group, flair.groupLabel)
		const earned = byGroup.delete(EARNED)
		const leagues = [...byGroup]
			.map(([group, label]) => ({ group, label }))
			.sort((a, b) => a.label.localeCompare(b.label))
		return [
			...(favoriteFlairs.length > 0
				? [{ group: YOUR_TEAMS, label: "Your teams" }]
				: []),
			...(earned ? [{ group: EARNED, label: "Earned" }] : []),
			...leagues,
		]
	}, [flairs, favoriteFlairs])

	// Open on the tab holding what they're already wearing, so the current
	// choice is visible rather than something to go hunting for. Your teams
	// counts as holding it when the flair is one of them, and is where a
	// viewer wearing nothing starts.
	const [tab, setTab] = useState(() => {
		if (favoriteFlairs.some((flair) => flair.id === equippedFlairId)) {
			return YOUR_TEAMS
		}
		return (
			flairs.find((flair) => flair.id === equippedFlairId)?.group ??
			tabs[0]?.group ??
			EARNED
		)
	})

	// Searching reaches across every league at once - nobody wants to pick the
	// right tab before they can type a team name. Without a query it's one
	// tab's worth, which is what keeps this from being one huge column.
	const shown = useMemo(() => {
		const query = search.trim().toLowerCase()
		// Kept in their listed order rather than sorted, the same order the
		// profile shows them in.
		if (!query && tab === YOUR_TEAMS) return favoriteFlairs
		const pool = query
			? flairs.filter(
					(flair) =>
						flair.name.toLowerCase().includes(query) ||
						flair.display.icon.toLowerCase().includes(query),
				)
			: flairs.filter((flair) => flair.group === tab)
		return [...pool].sort((a, b) => a.name.localeCompare(b.name))
	}, [flairs, favoriteFlairs, search, tab])

	async function choose(flairId: string) {
		setSaving(true)
		setError(null)
		const result = (await equip.mutateAsync({ flairId }))?.equipFlair
		setSaving(false)

		if (!result) {
			setError("Something went wrong. Try again.")
			return
		}

		await match(result)
			.with({ __typename: "User" }, async () => {
				// The equipped flair shows beside the viewer's name on nearly
				// every page.
				await queryClient.invalidateQueries()
				await router.invalidate()
				closeModal()
			})
			.with({ __typename: "ValidationError" }, async (r) => {
				setError(r.message)
			})
			.with({ __typename: "AuthenticationError" }, async () => {
				setError("You need to sign in to do that.")
			})
			.with({ __typename: "NotFoundError" }, async () => {
				setError("That flair no longer exists.")
			})
			.exhaustive()
	}

	async function clear() {
		setSaving(true)
		setError(null)
		await unequip.mutateAsync(undefined)
		setSaving(false)
		// The equipped flair shows beside the viewer's name on nearly every
		// page.
		await queryClient.invalidateQueries()
		await router.invalidate()
		closeModal()
	}

	const showingEarned = !search.trim() && tab === EARNED

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>Choose your flair</Modal.Title>
			<VStack gap="3.5" alignItems="stretch">
				<span className={css({ fontSize: "xs", color: "fg.muted" })}>
					One flair shows next to your name everywhere you appear.
				</span>

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

				{/* Hidden while searching: results already span every league, so a
				    highlighted tab would be claiming a scope that isn't in effect. */}
				{!search.trim() && tabs.length > 1 && (
					<Tabs value={tab} onValueChange={setTab}>
						<Tabs.List>
							{tabs.map((entry) => (
								<Tabs.Trigger key={entry.group} value={entry.group}>
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
						// Two columns, not three. A full team name has to fit without
						// being clipped to "Atlanta H...", and a third column at modal
						// width leaves no room for one.
						display: "grid",
						gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
						gap: "1.5",
						alignItems: "stretch",
						paddingRight: "1",
					})}
				>
					{shown.map((flair) => (
						<FlairOption
							key={flair.id}
							flair={flair.display}
							selected={flair.id === equippedFlairId}
							onSelect={() => choose(flair.id)}
						/>
					))}
				</div>

				{shown.length === 0 && (
					<span className={css({ fontSize: "xs", color: "fg.subtle" })}>
						{showingEarned
							? "Nothing earned yet. Win five calls in a row in one league to unlock your first."
							: "No flair matches that."}
					</span>
				)}

				<HStack justify="flex-end" gap="2">
					<Button
						variant="ghost"
						size="sm"
						onClick={clear}
						disabled={saving || equippedFlairId === null}
					>
						Remove flair
					</Button>
					<Button variant="outline" size="sm" onClick={() => closeModal()}>
						Done
					</Button>
				</HStack>
			</VStack>
		</Modal>
	)
}
