/**
 * VibeGrid Test Routes Index
 *
 * Redirects to /debug/vibegrid-test/basic
 */

import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/debug/vibegrid-test/')({
  beforeLoad: async () => {
    // Gate behind DEV mode only
    if (!import.meta.env.DEV) {
      throw redirect({ to: '/' })
    }
    // Redirect to basic test route
    throw redirect({ to: '/debug/vibegrid-test/basic' })
  },
  component: () => null,
})
