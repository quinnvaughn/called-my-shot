import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { openModal } from "#/stores/modal-store"
import { AuthModal } from "./auth-modal"

export function LinkError({ message }: { message: string }) {
	return (
		<VStack alignItems="center" gap="3" textAlign="center">
			<h1 className={css({ fontFamily: "heading", fontSize: "xl" })}>
				Couldn't reset your password
			</h1>
			<p className={css({ fontSize: "sm", color: "fg.muted" })}>{message}</p>
			<Button
				type="button"
				variant="solid"
				size="sm"
				onClick={() => openModal(<AuthModal defaultView="forgot" />)}
			>
				Send a new link
			</Button>
		</VStack>
	)
}
