import { useQueryErrorResetBoundary } from "@tanstack/react-query"
import { type ErrorComponentProps, useRouter } from "@tanstack/react-router"
import { useEffect } from "react"
import { FiAlertTriangle } from "react-icons/fi"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { Eyebrow } from "./eyebrow"

// Wired as the router's defaultErrorComponent (see router.tsx). Setting that
// option is what puts a CatchBoundary around each route in the first place -
// without one, a useSuspenseQuery that throws (a background refetch failing
// after hydration, say) escapes past the route and blanks the whole app.
export function RouteError({ error, reset }: ErrorComponentProps) {
	const router = useRouter()
	const { reset: resetQueryErrors } = useQueryErrorResetBoundary()

	// The query cache keeps its own record of the thrown error, so resetting
	// only the router's boundary would re-render straight back into it.
	useEffect(() => {
		resetQueryErrors()
	}, [resetQueryErrors])

	return (
		<VStack gap="8" alignItems="center" className={css({ padding: "8" })}>
			<VStack gap="4" alignItems="center">
				<div
					className={css({
						width: "56px",
						height: "56px",
						borderRadius: "full",
						border: "1px solid {colors.border.default}",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						color: "fg.subtle",
						background: "card",
					})}
				>
					<FiAlertTriangle size={24} />
				</div>
				<VStack gap="3" alignItems="center">
					<Eyebrow variant="neutral">Error</Eyebrow>
					<h1 className={css({ fontFamily: "heading", fontSize: "2xl" })}>
						Something went wrong
					</h1>
				</VStack>
				<p
					className={css({
						textStyle: "metaLg",
						color: "fg.subtle",
						textAlign: "center",
						maxWidth: "md",
					})}
				>
					{import.meta.env.DEV
						? // A thrown value is genuinely unknown - a route can reject with
							// a string or a plain object as easily as an Error, and reading
							// .message off one of those renders a blank line in dev.
							error instanceof Error
							? error.message
							: String(error)
						: "That didn't load. Try again in a moment."}
				</p>
			</VStack>
			<Button
				variant="solid"
				size="md"
				onClick={() => {
					// reset() clears the boundary; invalidate() re-runs the loader
					// that failed, so the retry actually refetches rather than
					// re-rendering the same cached failure.
					reset()
					router.invalidate()
				}}
			>
				Try again
			</Button>
		</VStack>
	)
}
