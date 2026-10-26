import { VStack } from "styled-system/jsx"
import { FieldHint } from "#/components/ui/field-hint"
import { FieldLabel } from "#/components/ui/field-label"
import { Select } from "#/components/ui/select"
import type { PostKind } from "#/lib/post-kind"
import { AudienceOptionLabel } from "./audience-option-label"

const EVERYONE = "everyone"

type Props = {
	kind: PostKind
	groups: { id: string; name: string; logoUrl?: string | null }[]
	// Null is Everyone.
	value: string | null
	onChange: (groupId: string | null) => void
}

// Who the post is for: everyone, or one of the viewer's groups. The redraft
// composer shares it.
export function AudienceSelect({ kind, groups, value, onChange }: Props) {
	const group = groups.find((g) => g.id === value)
	return (
		<VStack gap="1.5" alignItems="stretch">
			<FieldLabel>Who sees it</FieldLabel>
			<Select
				value={value ?? EVERYONE}
				onValueChange={(next) => onChange(next === EVERYONE ? null : next)}
			>
				<Select.Trigger>
					<AudienceOptionLabel group={group ?? null} />
				</Select.Trigger>
				<Select.Content>
					<Select.Option value={EVERYONE}>
						<AudienceOptionLabel group={null} />
					</Select.Option>
					{groups.map((g) => (
						<Select.Option key={g.id} value={g.id}>
							<AudienceOptionLabel group={g} />
						</Select.Option>
					))}
				</Select.Content>
			</Select>
			<FieldHint>
				{group
					? `Only ${group.name} members see it. It stays out of league and team feeds, your profile, and the ${kind === "redraft" ? "crowd's redraft" : "consensus"}, and it can't be shared as an image.`
					: kind === "redraft"
						? "Anyone can see it. It shows in the league's feed and on your profile, and its picks count toward the crowd's redraft of the class."
						: "Anyone can see it. It shows in the league and team feeds and on your profile, and its picks count toward the prompt's consensus."}
			</FieldHint>
		</VStack>
	)
}
