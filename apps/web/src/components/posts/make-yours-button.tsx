import { Link, useNavigate } from "@tanstack/react-router"
import { match } from "ts-pattern"
import { Button, button } from "#/components/ui/button"
import { useMe } from "#/hooks/use-me"
import { useRequireAuth } from "#/hooks/use-require-auth"
import { type PostKind, postNoun } from "#/lib/post-kind"

// Opens the kind's composer on this prompt. Signed out, it asks for an
// account first and goes there once there is one.
export function MakeYoursButton({
	kind,
	code,
	label = "Make yours",
	size,
}: {
	kind: PostKind
	code: string
	label?: string
	size?: "sm"
}) {
	const me = useMe()
	const requireAuth = useRequireAuth()
	const navigate = useNavigate()
	const to = match(kind)
		.with("rushmore", () => "/rushmore/new" as const)
		.with("redraft", () => "/redraft/new" as const)
		.exhaustive()

	if (me) {
		return (
			<Link to={to} search={{ prompt: code }} className={button({ size })}>
				{label}
			</Link>
		)
	}
	return (
		<Button
			size={size}
			onClick={() =>
				requireAuth(() => void navigate({ to, search: { prompt: code } }), {
					signup: { title: `Sign up to make your ${postNoun(kind)}` },
				})
			}
		>
			{label}
		</Button>
	)
}
