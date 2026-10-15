import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { AuthModal } from "#/components/auth/auth-modal"
import { Button } from "#/components/ui/button"
import { openModal } from "#/stores/modal-store"

export function SignedOut({ text }: { text: string }) {
	return (
		<VStack gap="3" alignItems="flex-start">
			<p className={css({ fontSize: "sm", color: "fg.muted" })}>{text}</p>
			<Button
				size="sm"
				variant="solid"
				onClick={() => openModal(<AuthModal defaultView="signin" />)}
			>
				Sign in
			</Button>
		</VStack>
	)
}
