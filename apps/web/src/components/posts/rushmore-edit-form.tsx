import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { useGqlMutation } from "#/graphql/hooks"
import {
	invalidatePosts,
	postErrorMessage,
	UpdateRushmoreDocument,
} from "#/graphql/posts/mutations"
import { PostBodyField } from "./post-body-field"

type Props = {
	post: { id: string; body: string | null }
	onDone: () => void
}

// Changing what a posted Rushmore says. The four picks stay as posted.
export function RushmoreEditForm({ post, onDone }: Props) {
	const queryClient = useQueryClient()
	const update = useGqlMutation(UpdateRushmoreDocument)
	const [body, setBody] = useState(post.body ?? "")
	const [error, setError] = useState<string | null>(null)

	async function save() {
		setError(null)
		const result = (
			await update.mutateAsync({ input: { postId: post.id, body } })
		)?.updateRushmore
		if (result?.__typename !== "PostPayload") {
			setError(postErrorMessage(result))
			return
		}
		await invalidatePosts(queryClient)
		onDone()
	}

	return (
		<VStack gap="4" alignItems="stretch">
			<PostBodyField value={body} onChange={setBody} />
			<FormError message={error} />
			<HStack gap="2" justify="flex-end">
				<Button variant="ghost" onClick={onDone} disabled={update.isPending}>
					Cancel
				</Button>
				<Button onClick={() => void save()} loading={update.isPending}>
					Save
				</Button>
			</HStack>
		</VStack>
	)
}
