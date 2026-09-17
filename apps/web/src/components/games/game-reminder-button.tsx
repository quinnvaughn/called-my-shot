import { useQueryClient } from "@tanstack/react-query"
import { FiBell, FiCheck } from "react-icons/fi"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { useGqlMutation } from "#/graphql/hooks"
import {
	MutedEmailTypesDocument,
	RemoveGameReminderDocument,
	SetGameReminderDocument,
} from "#/graphql/mutations/games"
import { gqlQueryOptions } from "#/graphql/query-options"
import { useRequireAuth } from "#/hooks/use-require-auth"
import { track } from "#/lib/analytics"
import { showToast } from "#/stores/toast-store"

type Props = {
	gameId: string
	hasReminder: boolean
}

const FAILED = "Couldn't update your reminder. Try again."

// Matches REMINDER_LEAD_MINUTES in the api's lib/game-reminders.tsx.
const REMINDER_LEAD_MS = 60 * 60 * 1000

// Whether a reminder is still worth offering. Inside the last hour it would go
// out within minutes, telling someone already on the game page what they're
// looking at. The api still accepts a set up to the start, so a page loaded
// just before the cutoff gets its reminder rather than an error.
export function canSetGameReminder(game: {
	status: string
	startsAt: string
}): boolean {
	return (
		game.status === "SCHEDULED" &&
		new Date(game.startsAt).getTime() - Date.now() > REMINDER_LEAD_MS
	)
}

// Only rendered where canSetGameReminder allows - see the game detail page.
// The reminder itself is sent by drainGameReminders on the api, an hour before
// the start.
export function GameReminderButton({ gameId, hasReminder }: Props) {
	const queryClient = useQueryClient()
	const requireAuth = useRequireAuth()
	const setReminder = useGqlMutation(SetGameReminderDocument)
	const removeReminder = useGqlMutation(RemoveGameReminderDocument)
	const pending = setReminder.isPending || removeReminder.isPending

	async function emailMuted(): Promise<boolean> {
		const data = await queryClient.fetchQuery({
			...gqlQueryOptions(MutedEmailTypesDocument, {}),
			staleTime: 0,
		})
		const muted = data.me?.mutedEmailTypes ?? []
		return muted.includes("ALL") || muted.includes("GAME_REMINDER")
	}

	async function set() {
		const data = await setReminder.mutateAsync({ gameId }).catch(() => null)
		const result = data?.setGameReminder
		if (!result) {
			showToast({ message: FAILED })
			return
		}

		await match(result)
			.with({ __typename: "Game" }, async () => {
				const muted = await emailMuted().catch(() => false)
				track("game_reminder_set", { gameId, emailMuted: muted })
				showToast(
					muted
						? {
								message:
									"Reminder set, but game reminder emails are off. You'll only see it in your notifications.",
								action: { label: "Email settings", to: "/settings" },
							}
						: {
								message:
									"Reminder set. We'll email you an hour before the game starts, when lineups are usually out.",
							},
				)
				await queryClient.invalidateQueries()
			})
			.with({ __typename: "ValidationError" }, async (r) => {
				showToast({ message: r.fieldErrors?.[0]?.message ?? FAILED })
			})
			.with({ __typename: "NotFoundError" }, async (r) => {
				showToast({ message: r.message })
			})
			.with({ __typename: "AuthenticationError" }, async () => {
				showToast({ message: "You need to sign in to do that." })
			})
			.exhaustive()
	}

	async function remove() {
		const data = await removeReminder.mutateAsync({ gameId }).catch(() => null)
		const result = data?.removeGameReminder
		if (!result) {
			showToast({ message: FAILED })
			return
		}

		await match(result)
			.with({ __typename: "Game" }, async () => {
				track("game_reminder_removed", { gameId })
				showToast({ message: "Reminder removed." })
				await queryClient.invalidateQueries()
			})
			.with({ __typename: "ValidationError" }, async (r) => {
				showToast({ message: r.fieldErrors?.[0]?.message ?? FAILED })
			})
			.with({ __typename: "NotFoundError" }, async (r) => {
				showToast({ message: r.message })
			})
			.with({ __typename: "AuthenticationError" }, async () => {
				showToast({ message: "You need to sign in to do that." })
			})
			.exhaustive()
	}

	return (
		<Button
			variant="outline"
			size="sm"
			loading={pending}
			aria-pressed={hasReminder}
			onClick={() => {
				if (hasReminder) {
					void remove()
					return
				}
				requireAuth(() => void set(), {
					signup: {
						title: "Get a reminder",
						description:
							"Sign up and we'll email you an hour before the game starts.",
					},
					signin: {
						title: "Get a reminder",
						description:
							"Sign in and we'll email you an hour before the game starts.",
					},
				})
			}}
		>
			{!pending && (hasReminder ? <FiCheck size={14} /> : <FiBell size={14} />)}
			{hasReminder ? "Reminder set" : "Remind me"}
		</Button>
	)
}
