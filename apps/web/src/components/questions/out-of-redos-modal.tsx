import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useEffect } from "react"
import { VStack } from "styled-system/jsx"
import { arrowLink } from "#/components/ui/arrow-link"
import { CopyLinkRow } from "#/components/ui/copy-link-row"
import { Modal } from "#/components/ui/modal"
import { invitePageQuery } from "#/graphql/invite/queries"
import { track } from "#/lib/analytics"
import { SITE_HOST, SITE_ORIGIN } from "#/lib/meta"
import { closeModal } from "#/stores/modal-store"

// What "Use a redo" opens at a balance of 0. Someone who just tried to take
// a call back is the person most ready to invite, so the link to do it is
// here rather than a page away.
export function OutOfRedosModal({ questionId }: { questionId: string }) {
	const { data } = useQuery(invitePageQuery())

	useEffect(() => {
		track("out_of_redos_shown", { questionId })
	}, [questionId])
	const code = data?.me?.referralCode

	return (
		<Modal size="sm">
			<Modal.CloseButton />
			<Modal.Title>You're out of redos</Modal.Title>
			<VStack gap="4" alignItems="stretch">
				<Modal.Description>
					You get one for every friend who signs up with your link and makes
					their first call. They get one the moment they sign up.
				</Modal.Description>
				{code && (
					<CopyLinkRow
						url={`${SITE_ORIGIN}/join/${code}`}
						displayUrl={`${SITE_HOST}/join/${code}`}
						shareTitle="Called My Shot"
						onCopied={() =>
							track("referral_link_shared", {
								method: "clipboard",
								surface: "out_of_redos",
							})
						}
						onNativeShared={() =>
							track("referral_link_shared", {
								method: "native",
								surface: "out_of_redos",
							})
						}
					/>
				)}
				<Link
					to="/invite"
					onClick={closeModal}
					className={arrowLink({ tone: "quiet" })}
				>
					See your invites →
				</Link>
			</VStack>
		</Modal>
	)
}
