import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/_authed/new-question')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_app/_authed/new-question"!</div>
}
