import { createFileRoute, redirect } from '@tanstack/react-router'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'
import { auth as apiAuth } from '@/lib/api'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ location }) => {
    if (!apiAuth.isAuthenticated()) {
      throw redirect({
        to: '/sign-in',
        search: {
          redirect: location.href,
        },
      })
    }
  },
  component: AuthenticatedLayout,
})
