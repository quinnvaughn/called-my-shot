import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { useGqlMutation } from "#/graphql/hooks"
import {
	CreateRedraftDocument,
	invalidatePosts,
	postErrorMessage,
} from "#/graphql/posts/mutations"
import { pluralize } from "#/lib/pluralize"
import { PostBodyField } from "../post-body-field"
import { stepHeading } from "../rushmore-composer/composer-styles"
import { REDRAFT_BODY_PLACEHOLDER } from "./body-placeholder"
import { LengthChips } from "./length-chips"
import { PoolSearch } from "./pool-search"
import { SlotRow } from "./slot-row"
import type { ComposerClass, RedraftPoolEntry } from "./types"

type Props = {
	draftClass: ComposerClass
	// Null posts it for everyone.
	groupId: string | null
	audience: string
}

type Slots = (RedraftPoolEntry | null)[]

// Steps two and three: how far down the class to go and who goes where,
// then a few words if they want and Post. Picks fill the first open slot
// unless another is chosen, and can be moved up and down after.
export function RedraftForm({ draftClass, groupId, audience }: Props) {
	const queryClient = useQueryClient()
	const navigate = useNavigate()
	const create = useGqlMutation(CreateRedraftDocument)
	const initialLength =
		draftClass.lengths.find((l) => l.isDefault)?.count ??
		draftClass.lengths[0]?.count ??
		0
	const [picks, setPicks] = useState<Slots>(() =>
		Array.from({ length: initialLength }, () => null),
	)
	// The slot the viewer chose for the next pick, while it's still open.
	const [chosenSlot, setChosenSlot] = useState<number | null>(null)
	const [body, setBody] = useState("")
	const [error, setError] = useState<string | null>(null)

	const open = picks.flatMap((pick, i) => (pick ? [] : [i]))
	const room = open.length
	const target =
		chosenSlot !== null && picks[chosenSlot] === null
			? chosenSlot
			: (open[0] ?? null)
	const slots = draftClass.slots.slice(0, picks.length)

	// A shorter redraft drops the picks past its end; a longer one adds
	// open slots.
	function changeLength(count: number) {
		setPicks((prev) => Array.from({ length: count }, (_, i) => prev[i] ?? null))
		setChosenSlot(null)
	}

	function place(entry: RedraftPoolEntry) {
		if (target === null) return
		setPicks((prev) => prev.map((pick, i) => (i === target ? entry : pick)))
		setChosenSlot(null)
	}

	function swap(a: number, b: number) {
		setPicks((prev) => {
			const next = [...prev]
			;[next[a], next[b]] = [next[b] ?? null, next[a] ?? null]
			return next
		})
	}

	async function submit() {
		setError(null)
		const result = (
			await create.mutateAsync({
				input: {
					promptId: draftClass.id,
					groupId,
					body: body.trim() || undefined,
					playerIds: picks.flatMap((pick) => (pick ? [pick.player.id] : [])),
				},
			})
		)?.createRedraft
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
			<VStack gap="4" alignItems="stretch">
				<h2 className={stepHeading}>2. Redraft it</h2>
				<LengthChips
					lengths={draftClass.lengths}
					value={picks.length}
					onChange={changeLength}
				/>
				<PoolSearch
					promptId={draftClass.id}
					pickedIds={picks.flatMap((pick) => (pick ? [pick.player.id] : []))}
					target={
						target === null
							? null
							: {
									slot: target + 1,
									teamName: slots[target]?.teamName ?? null,
								}
					}
					onPick={place}
				/>
				<p className={css({ fontSize: "sm", color: "fg.muted" })}>
					{room > 0
						? `${room} ${pluralize(room, "slot")} left`
						: "Every slot is filled."}
				</p>
				<ol
					className={css({
						display: "flex",
						flexDirection: "column",
						gap: "1.5",
					})}
				>
					{slots.map((slot, i) => (
						<SlotRow
							key={slot.slot}
							slot={slot}
							pick={picks[i] ?? null}
							active={i === target}
							onActivate={() => setChosenSlot(i)}
							onMoveUp={i > 0 ? () => swap(i, i - 1) : null}
							onMoveDown={i < picks.length - 1 ? () => swap(i, i + 1) : null}
							onRemove={() =>
								setPicks((prev) => prev.map((p, j) => (j === i ? null : p)))
							}
						/>
					))}
				</ol>
			</VStack>
			<VStack gap="3" alignItems="stretch">
				<h2 className={stepHeading}>3. Post it</h2>
				<PostBodyField
					value={body}
					onChange={setBody}
					placeholder={REDRAFT_BODY_PLACEHOLDER}
				/>
				<FormError message={error} />
				<Button
					onClick={() => void submit()}
					loading={create.isPending}
					disabled={room > 0}
				>
					{room > 0
						? `Fill ${room} more ${pluralize(room, "slot")} to post`
						: `Post to ${audience}`}
				</Button>
			</VStack>
		</VStack>
	)
}
