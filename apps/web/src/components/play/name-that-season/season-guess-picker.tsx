import { useMemo, useState } from "react"
import { css } from "styled-system/css"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { TextInput } from "#/components/ui/text-input"
import { FranchiseButton, type GuessTeam } from "./franchise-button"
import {
	franchiseRuledOut,
	type MadeGuess,
	seasonRuledOut,
} from "./season-result"
import { SeasonYearButton } from "./season-year-button"

export type FranchiseOption = {
	team: GuessTeam
	seasons: { year: number; label: string }[]
	formerNames: string[]
}

// A guess in two picks: the franchise, from the day's league (search finds
// its old names too, so "Oilers" finds the Titans), then one of its seasons.
// The button guesses the pair, so a stray tap can't spend a guess. What
// earlier guesses ruled out stays on screen, struck through.
export function SeasonGuessPicker({
	franchises,
	guesses,
	guessesLeft,
	pending,
	error,
	onGuess,
}: {
	franchises: FranchiseOption[]
	guesses: readonly MadeGuess[]
	guessesLeft: number
	pending: boolean
	error: string | null
	onGuess: (guess: { teamId: string; year: number }) => void
}) {
	const [search, setSearch] = useState("")
	const [teamId, setTeamId] = useState<string | null>(null)
	const [year, setYear] = useState<number | null>(null)
	const franchise = franchises.find((f) => f.team.id === teamId) ?? null
	const season = franchise?.seasons.find((s) => s.year === year) ?? null

	const matching = useMemo(() => {
		const term = search.trim().toLowerCase()
		if (!term) return franchises
		return franchises.filter(
			(f) =>
				f.team.name.toLowerCase().includes(term) ||
				f.team.abbreviation.toLowerCase().includes(term) ||
				f.formerNames.some((n) => n.toLowerCase().includes(term)),
		)
	}, [franchises, search])

	function pickFranchise(id: string) {
		setTeamId(id === teamId ? null : id)
		setYear(null)
	}

	function guess() {
		if (!franchise || !season) return
		onGuess({ teamId: franchise.team.id, year: season.year })
		setYear(null)
	}

	return (
		<section
			aria-label="Your guess"
			className={css({ display: "flex", flexDirection: "column", gap: "3" })}
		>
			<div
				className={css({
					display: "flex",
					flexDirection: { base: "column", sm: "row" },
					alignItems: { base: "stretch", sm: "center" },
					gap: "3",
				})}
			>
				<TextInput className={css({ flex: 1 })}>
					<TextInput.Group>
						<TextInput.Field
							type="search"
							placeholder="Search teams, old names too"
							aria-label="Search teams"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
						/>
					</TextInput.Group>
				</TextInput>
				<Button
					variant="solid"
					disabled={!season}
					loading={pending}
					onClick={guess}
				>
					{franchise && season
						? `Guess ${season.label} ${franchise.team.abbreviation}`
						: franchise
							? "Pick a season"
							: "Pick a team"}
				</Button>
			</div>
			<p className={css({ textStyle: "label", color: "fg.muted" })}>
				{guessesLeft === 1 ? "Last guess" : `${guessesLeft} guesses left`}
			</p>
			<FormError message={error} />
			{franchise && (
				<div
					className={css({
						display: "flex",
						flexDirection: "column",
						gap: "2",
					})}
				>
					<h3 className={css({ textStyle: "label", color: "fg.muted" })}>
						{franchise.team.name} seasons
					</h3>
					<div
						className={css({
							display: "grid",
							gridTemplateColumns: {
								base: "repeat(4, minmax(0, 1fr))",
								md: "repeat(6, minmax(0, 1fr))",
							},
							gap: "2",
						})}
					>
						{franchise.seasons.map((s) => (
							<SeasonYearButton
								key={s.year}
								label={s.label}
								selected={s.year === year}
								ruledOut={seasonRuledOut(guesses, franchise.team.id, s.year)}
								disabled={pending}
								onSelect={() => setYear(s.year)}
							/>
						))}
					</div>
				</div>
			)}
			<div
				className={css({
					display: "grid",
					gridTemplateColumns: {
						base: "repeat(2, minmax(0, 1fr))",
						md: "repeat(3, minmax(0, 1fr))",
					},
					gap: "2",
				})}
			>
				{matching.map((f) => (
					<FranchiseButton
						key={f.team.id}
						team={f.team}
						selected={f.team.id === teamId}
						ruledOut={franchiseRuledOut(guesses, f.team.id)}
						disabled={pending}
						onSelect={() => pickFranchise(f.team.id)}
					/>
				))}
			</div>
		</section>
	)
}
