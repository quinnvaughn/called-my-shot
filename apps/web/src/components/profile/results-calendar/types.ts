import type { ResultsCalendar_CalendarFragment } from "#/graphql/generated/graphql"

export type CalendarDay = ResultsCalendar_CalendarFragment["days"][number]
