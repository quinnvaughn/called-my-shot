import { Link, useNavigate } from "@tanstack/react-router"
import { Button, button } from "#/components/ui/button"
import { useMe } from "#/hooks/use-me"
import { useRequireAuth } from "#/hooks/use-require-auth"

// Opens the composer on this prompt. Signed out, it asks for an account
// first and goes there once there is one.
export function MakeYoursButton({
	code,
	label = "Make yours",
	size,
}: {
	code: string
	label?: string
	size?: "sm"
}) {
	const me = useMe()
	const requireAuth = useRequireAuth()
	const navigate = useNavigate()

	if (me) {
		return (
			<Link
				to="/rushmore/new"
				search={{ prompt: code }}
				className={button({ size })}
			>
				{label}
			</Link>
		)
	}
	return (
		<Button
			size={size}
			onClick={() =>
				requireAuth(
					() =>
						void navigate({ to: "/rushmore/new", search: { prompt: code } }),
					{ signup: { title: "Sign up to make your Rushmore" } },
				)
			}
		>
			{label}
		</Button>
	)
}
