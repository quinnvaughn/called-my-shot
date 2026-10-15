export type RowProps<F> = {
	notification: F
	unread: boolean
	onOpen: (id: string) => void
}
