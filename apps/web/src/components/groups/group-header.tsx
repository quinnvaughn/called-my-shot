import type { ReactNode } from "react"
import { css, cva } from "styled-system/css"
import { Box } from "styled-system/jsx"
import { GroupLinks } from "#/components/groups/group-links"
import { GroupLogo } from "#/components/ui/group-logo"

const layout = cva({
	base: {
		display: "grid",
		gridTemplateColumns: "auto minmax(0, 1fr) auto",
		columnGap: "4",
		alignItems: "start",
	},
	variants: {
		hasLogo: {
			// On a phone the logo shares the actions' row, so the name,
			// description and links get the full width under them.
			true: {
				gridTemplateAreas: {
					base: `"logo . actions" "title title title" "body body body"`,
					md: `"logo title actions" "logo body actions"`,
				},
			},
			false: {
				gridTemplateAreas: {
					base: `"title title actions" "body body body"`,
					md: `"title title actions" "body body actions"`,
				},
			},
		},
	},
})

type Props = {
	name: string
	logoUrl: string | null | undefined
	description: string | null | undefined
	links: { id: string; url: string; label?: string | null }[]
	actions: ReactNode
	// The invite page's header carries a full-size join button beside the
	// name, which a group page's 3xl title looks undersized next to.
	large?: boolean
}

export function GroupHeader({
	name,
	logoUrl,
	description,
	links,
	actions,
	large = false,
}: Props) {
	return (
		<div className={layout({ hasLogo: !!logoUrl })}>
			{/* Only once one's uploaded: a big initial beside a big name would
			    just say the first letter twice. */}
			{logoUrl && (
				<Box gridArea="logo" marginBottom={{ base: "4", md: "0" }}>
					<GroupLogo size="lg" name={name} src={logoUrl} />
				</Box>
			)}
			<h1
				className={css({
					gridArea: "title",
					fontSize: large ? { base: "3xl", lg: "5xl" } : "3xl",
					fontFamily: "heading",
					lineHeight: "1",
					overflowWrap: "anywhere",
				})}
			>
				{name}
			</h1>
			{(description || links.length > 0) && (
				<Box gridArea="body" marginTop="2">
					{description && (
						<p
							className={css({
								fontSize: "sm",
								color: "fg.muted",
								lineHeight: "relaxed",
							})}
						>
							{description}
						</p>
					)}
					{links.length > 0 && (
						<Box marginTop={description ? "3" : "0"}>
							<GroupLinks links={links} />
						</Box>
					)}
				</Box>
			)}
			<Box gridArea="actions" justifySelf="end">
				{actions}
			</Box>
		</div>
	)
}
