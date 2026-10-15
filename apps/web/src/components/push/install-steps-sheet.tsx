import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Sheet } from "#/components/ui/sheet"

// The exact taps, in the words Safari shows. Signing in again is a step of
// its own because the Home Screen app keeps its own sign-in, separate from
// Safari's.
const STEPS = [
	"Tap the Share button in your browser's toolbar.",
	"Scroll down and tap Add to Home Screen, then Add.",
	"Open Called My Shot from your Home Screen.",
	"Sign in there. The Home Screen app keeps its own sign-in.",
	"Turn on notifications when it asks, or from Settings.",
]

export function InstallStepsSheet() {
	return (
		<Sheet>
			<Sheet.Header>
				<Sheet.Title>Add Called My Shot to your Home Screen</Sheet.Title>
				<Sheet.CloseButton />
			</Sheet.Header>
			<Sheet.Body>
				<VStack alignItems="stretch" gap="4">
					<p className={css({ fontSize: "sm", color: "fg.muted" })}>
						iPhone only sends notifications to sites on your Home Screen.
					</p>
					<ol
						className={css({
							display: "flex",
							flexDirection: "column",
							gap: "3",
							listStyle: "none",
							counterReset: "step",
						})}
					>
						{STEPS.map((step, i) => (
							<li
								key={step}
								className={css({
									display: "flex",
									gap: "3",
									alignItems: "flex-start",
									fontSize: "sm",
								})}
							>
								<span
									className={css({
										flexShrink: 0,
										width: "6",
										height: "6",
										borderRadius: "full",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										textStyle: "metaLg",
										color: "secondary.default",
										border: "1px solid {colors.secondary.default}",
									})}
								>
									{i + 1}
								</span>
								<span className={css({ paddingTop: "0.5" })}>{step}</span>
							</li>
						))}
					</ol>
				</VStack>
			</Sheet.Body>
		</Sheet>
	)
}
