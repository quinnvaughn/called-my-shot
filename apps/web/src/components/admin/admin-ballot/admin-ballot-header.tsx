import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { Tag } from "#/components/ui/tag"
import { TextInput } from "#/components/ui/text-input"
import {
	invalidateBallots,
	RenameBallotDocument,
	SetBallotPublishedDocument,
} from "#/graphql/ballots/mutations"
import { useGqlMutation } from "#/graphql/hooks"
import type { AdminBallot } from "./types"

export function AdminBallotHeader({
	ballotId,
	ballot,
}: {
	ballotId: string
	ballot: AdminBallot
}) {
	const queryClient = useQueryClient()
	const renameBallot = useGqlMutation(RenameBallotDocument)
	const setBallotPublished = useGqlMutation(SetBallotPublishedDocument)
	const [name, setName] = useState<string | null>(null)

	return (
		<HStack justify="space-between" alignItems="flex-start" gap="4">
			<VStack gap="2" alignItems="flex-start" flex="1">
				<TextInput className={css({ maxWidth: "sm", width: "100%" })}>
					<TextInput.Group>
						<TextInput.Field
							value={name ?? ballot.name}
							onChange={(e) => setName(e.target.value)}
							onBlur={() => {
								if (name?.trim() && name !== ballot.name) {
									renameBallot
										.mutateAsync({ id: ballotId, name: name.trim() })
										.then(() => invalidateBallots(queryClient))
								}
							}}
						/>
					</TextInput.Group>
				</TextInput>
				<HStack gap="2">
					<Tag>{ballot.league.abbreviation}</Tag>
					<Tag variant={ballot.status === "PUBLISHED" ? "primary" : undefined}>
						{ballot.status === "PUBLISHED" ? "Published" : "Draft"}
					</Tag>
				</HStack>
			</VStack>
			<Button
				variant="solid"
				size="sm"
				onClick={async () => {
					await setBallotPublished.mutateAsync({
						id: ballotId,
						published: ballot.status !== "PUBLISHED",
					})
					await invalidateBallots(queryClient)
				}}
			>
				{ballot.status === "PUBLISHED" ? "Unpublish" : "Publish"}
			</Button>
		</HStack>
	)
}
