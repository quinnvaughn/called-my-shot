import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { useEffect } from "react"
import { FaRegTimesCircle } from "react-icons/fa"
import { ReferralLanding } from "#/components/landing-page/referral-landing/referral-landing"
import { NotFound } from "#/components/ui/not-found"
import { referralPreviewQuery } from "#/graphql/invite/queries"
import { track } from "#/lib/analytics"
import { pageMeta } from "#/lib/meta"
import { captureReferral } from "#/stores/referral-store"

// Where an invite link lands. Sits outside _app because the visitor has no
// account for the app shell to frame.
//
// Shaped like the top of the landing page, but with every link stripped out:
// the nav's leagues, the footer's pages, the sign-in escape hatch. Nobody
// arrives here cold - a friend sent them - so the page has one job and
// anything clickable that isn't the signup button is a way out of it.
export const Route = createFileRoute("/join/$code")({
	// An invite does nothing for an account that already exists, so there is
	// nothing to claim and no reason to pitch.
	//
	// /home specifically, matching where AuthModal sends a new account. This
	// runs again on the router invalidate that follows a signup, at which
	// point `me` is set - and redirecting somewhere the modal isn't already
	// navigating makes the two race and abort each other.
	beforeLoad: ({ context }) => {
		if (context.me) throw redirect({ to: "/home" })
	},
	loader: ({ context, params }) =>
		context.queryClient.query(referralPreviewQuery(params.code)),
	head: ({ loaderData }) => {
		const preview = loaderData?.referralPreview
		if (!preview) return {}

		return pageMeta({
			title: `${preview.inviter.name} invited you to Called My Shot`,
			description:
				"Call what happens in real games before they start. Sign up on this link and you both get a free redo.",
			path: "/",
		})
	},
	component: RouteComponent,
})

function RouteComponent() {
	const { code } = Route.useParams()
	const { data } = useSuspenseQuery(referralPreviewQuery(code))
	const preview = data.referralPreview

	// Stashed on mount rather than on the button, so the code survives someone
	// who opens the signup form, closes it, and comes back to it.
	useEffect(() => {
		if (preview) captureReferral(code, "invite_link")
		track("join_page_viewed", { codeValid: Boolean(preview) })
	}, [code, preview])

	if (!preview) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Invite"
				heading="This invite link doesn't work"
				subtitle="It may have been reset, or the link's just wrong. Ask whoever sent it for a fresh one."
				link={{ text: "Look around anyway", url: "/" }}
			/>
		)
	}

	return <ReferralLanding inviter={preview.inviter} />
}
