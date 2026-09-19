import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { Flair, type FlairData } from "#/components/ui/flair"
import { openModal } from "#/stores/modal-store"
import { FlairPickerModal } from "./flair-picker-modal"

type Props = {
	flair: FlairData | null
	flairId: string | null
}

export function FlairSection({ flair, flairId }: Props) {
	return (
		<Card size="sm" variant="surface">
			<Card.Body>
				<HStack
					justify="space-between"
					alignItems="center"
					gap="3"
					flexWrap="wrap"
				>
					<HStack gap="3" alignItems="center" minWidth="0">
						{flair ? (
							<Flair flair={flair} size="sm" />
						) : (
							<span className={css({ fontSize: "sm", color: "fg.muted" })}>
								No flair yet
							</span>
						)}
						<span className={css({ fontSize: "xs", color: "fg.subtle" })}>
							Shows next to your name everywhere you appear.
						</span>
					</HStack>
					<Button
						variant="outline"
						size="sm"
						onClick={() =>
							openModal(<FlairPickerModal equippedFlairId={flairId} />)
						}
					>
						{flair ? "Change" : "Choose"}
					</Button>
				</HStack>
			</Card.Body>
		</Card>
	)
}
