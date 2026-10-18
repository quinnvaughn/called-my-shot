import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { css } from "styled-system/css"
import { Grid, VStack } from "styled-system/jsx"
import { TextInput } from "#/components/ui/text-input"
import { gifSearchQuery } from "#/graphql/challenges/queries"
import type { GifSearchQuery } from "#/graphql/generated/graphql"
import { useDebouncedValue } from "#/hooks/use-debounced-value"

export type Gif = GifSearchQuery["gifSearch"][number]

// One full first view of the grid.
const SKELETON_TILES = 9

export function GifPicker({
	onSelect,
	autoFocus = false,
}: {
	onSelect: (gif: Gif) => void
	// Puts the cursor in the search box, for a picker that just opened.
	autoFocus?: boolean
}) {
	const [search, setSearch] = useState("")
	const query = useDebouncedValue(search.trim(), 350)
	const { data, isPending, isError } = useQuery(gifSearchQuery(query))

	const gifs = data?.gifSearch ?? []
	return (
		<VStack gap="2" alignItems="stretch">
			<TextInput>
				<TextInput.Group>
					<TextInput.Field
						type="search"
						autoFocus={autoFocus}
						placeholder="Search KLIPY"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</TextInput.Group>
			</TextInput>
			<Grid
				columns={3}
				gap="1.5"
				className={css({ maxHeight: "64", overflowY: "auto" })}
			>
				{isPending &&
					Array.from({ length: SKELETON_TILES }, (_, i) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: placeholders with no identity
							key={i}
							aria-hidden
							className={css({
								height: "24",
								borderRadius: "md",
								bg: "bg.subtle",
								animation: "pulse 1.6s ease-in-out infinite",
							})}
						/>
					))}
				{gifs.map((g) => (
					<button
						key={g.id}
						type="button"
						aria-label={g.alt || "GIF"}
						onClick={() => onSelect(g)}
						className={css({
							borderRadius: "md",
							overflow: "hidden",
							cursor: "pointer",
							_hover: { opacity: 0.85 },
						})}
					>
						<img
							src={g.previewUrl}
							alt={g.alt}
							loading="lazy"
							className={css({
								width: "full",
								height: "24",
								objectFit: "cover",
								display: "block",
							})}
						/>
					</button>
				))}
			</Grid>
			{!isPending && gifs.length === 0 && (
				<span
					className={css({
						textStyle: "meta",
						color: "fg.subtle",
					})}
				>
					{isError ? "Couldn't load GIFs. Try again." : "No GIFs found"}
				</span>
			)}
		</VStack>
	)
}
