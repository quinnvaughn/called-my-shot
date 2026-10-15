import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { FiX } from "react-icons/fi"
import { css } from "styled-system/css"
import { Grid, VStack } from "styled-system/jsx"
import { TextInput } from "#/components/ui/text-input"
import { gifSearchQuery } from "#/graphql/challenges/queries"
import type { GifSearchQuery } from "#/graphql/generated/graphql"
import { useDebouncedValue } from "#/hooks/use-debounced-value"

export type Gif = GifSearchQuery["gifSearch"][number]

export function GifPicker({
	selected,
	onSelect,
}: {
	selected: Gif | null
	onSelect: (gif: Gif | null) => void
}) {
	const [search, setSearch] = useState("")
	const query = useDebouncedValue(search.trim(), 350)
	// The last results stay up while a new search loads, so nothing in the
	// picker blinks out between keystrokes.
	const { data, isFetching } = useQuery({
		...gifSearchQuery(query),
		placeholderData: keepPreviousData,
	})

	// Hidden until the api says GIFs are on, so it never flashes up where
	// they aren't.
	if (!data?.gifsEnabled) return null

	if (selected) {
		return (
			<div
				className={css({
					position: "relative",
					alignSelf: "center",
					width: "fit-content",
					maxWidth: "full",
				})}
			>
				<img
					src={selected.url}
					alt={selected.alt}
					width={selected.width}
					height={selected.height}
					className={css({
						display: "block",
						maxHeight: "48",
						maxWidth: "full",
						width: "auto",
						height: "auto",
						borderRadius: "md",
					})}
				/>
				<button
					type="button"
					aria-label="Remove GIF"
					onClick={() => onSelect(null)}
					className={css({
						position: "absolute",
						top: "2",
						right: "2",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: "8",
						height: "8",
						borderRadius: "full",
						bg: "bg.surface",
						border: "1px solid {colors.border.default}",
						color: "fg.default",
						cursor: "pointer",
						_hover: { bg: "bg.subtle" },
					})}
				>
					<FiX size={16} />
				</button>
			</div>
		)
	}

	const gifs = data?.gifSearch ?? []
	return (
		<VStack gap="2" alignItems="stretch">
			<TextInput>
				<TextInput.Group>
					<TextInput.Field
						type="search"
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
			<span
				className={css({
					textStyle: "meta",
					color: "fg.subtle",
				})}
			>
				{isFetching ? "Searching…" : gifs.length === 0 ? "No GIFs found" : ""}
			</span>
		</VStack>
	)
}
