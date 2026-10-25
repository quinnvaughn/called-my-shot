import { RUSHMORE_PICK_COUNT } from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { useGqlMutation } from "#/graphql/hooks"
import {
	CreateRushmoreDocument,
	invalidatePosts,
	postErrorMessage,
} from "#/graphql/posts/mutations"
import { pluralize } from "#/lib/pluralize"
import { PostBodyField } from "../post-body-field"
import { RushmoreBand } from "../rushmore-band/rushmore-band"
import { stepHeading } from "./composer-styles"
import { PoolSearch } from "./pool-search"
import { RemovePickButton } from "./remove-pick-button"
import type { PoolEntry } from "./types"

type Props = {
	promptId: string
	// The prompt's color, for the band.
	color: string
	// Null posts it for everyone.
	groupId: string | null
	audience: string
}

// Steps two and three: the four players, shown on the Rushmore as they're
// picked, then a few words if they want and Post.
export function RushmoreForm({ promptId, color, groupId, audience }: Props) {
	const queryClient = useQueryClient()
	const navigate = useNavigate()
	const create = useGqlMutation(CreateRushmoreDocument)
	const [picks, setPicks] = useState<PoolEntry[]>([])
	const [body, setBody] = useState("")
	const [error, setError] = useState<string | null>(null)
	const room = RUSHMORE_PICK_COUNT - picks.length

	async function submit() {
		setError(null)
		const result = (
			await create.mutateAsync({
				input: {
					promptId,
					groupId,
					body: body.trim() || undefined,
					playerIds: picks.map((pick) => pick.player.id),
				},
			})
		)?.createRushmore
		if (result?.__typename !== "PostPayload") {
			setError(postErrorMessage(result))
			return
		}
		await invalidatePosts(queryClient)
		void navigate({
			to: "/posts/$postId",
			params: { postId: result.post.id },
		})
	}

	return (
		<VStack gap="8" alignItems="stretch">
			<VStack gap="3" alignItems="stretch">
				<h2 className={stepHeading}>2. Pick your four</h2>
				<RushmoreBand
					color={color}
					slots={Array.from({ length: RUSHMORE_PICK_COUNT }, (_, i) => {
						const pick = picks[i]
						return pick
							? {
									key: pick.player.id,
									player: pick.player,
									action: (
										<RemovePickButton
											name={pick.player.name}
											onRemove={() =>
												setPicks((prev) => prev.filter((_, j) => j !== i))
											}
										/>
									),
								}
							: { key: `open-${i}`, player: null }
					})}
				/>
				<PoolSearch
					promptId={promptId}
					pickedIds={picks.map((pick) => pick.player.id)}
					room={room}
					onPick={(entry) =>
						setPicks((prev) =>
							prev.length < RUSHMORE_PICK_COUNT ? [...prev, entry] : prev,
						)
					}
				/>
			</VStack>
			<VStack gap="3" alignItems="stretch">
				<h2 className={stepHeading}>3. Post it</h2>
				<PostBodyField value={body} onChange={setBody} />
				<FormError message={error} />
				<Button
					onClick={() => void submit()}
					loading={create.isPending}
					disabled={room > 0}
				>
					{room > 0
						? `Pick ${room} more ${pluralize(room, "player")} to post`
						: `Post to ${audience}`}
				</Button>
			</VStack>
		</VStack>
	)
}
