import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Eyebrow } from "./eyebrow"

// Wired as the router's defaultPendingComponent (see router.tsx). Setting
// that option is what puts a Suspense boundary around each route - without
// one, a useSuspenseQuery with nothing cached suspends past the route and
// takes the whole shell down with it. Loaders warm every query their route
// reads, so in practice this shows during a slow navigation rather than on
// first paint.
//
// Deliberately the same 56px ring NotFound and RouteError draw, so the three
// things that can occupy a whole route read as one family rather than three
// unrelated screens.
export function RoutePending() {
	return (
		<VStack
			gap="4"
			alignItems="center"
			role="status"
			aria-label="Loading"
			className={css({ paddingBlock: "16", paddingInline: "8" })}
		>
			<div
				className={css({
					width: "56px",
					height: "56px",
					borderRadius: "full",
					border: "1px solid {colors.border.default}",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					background: "card",
					// The brand accent rather than fg.subtle: NotFound and
					// RouteError are dead ends and stay muted, but this one means
					// something is actively happening.
					color: "primary.default",
				})}
			>
				<span
					aria-hidden
					className={css({
						width: "5",
						height: "5",
						borderRadius: "full",
						border:
							"2px solid color-mix(in srgb, currentColor 25%, transparent)",
						borderTopColor: "currentColor",
						animation: "spin 0.7s linear infinite",
					})}
				/>
			</div>
			<Eyebrow variant="primary" size="sm">
				Loading
			</Eyebrow>
		</VStack>
	)
}
