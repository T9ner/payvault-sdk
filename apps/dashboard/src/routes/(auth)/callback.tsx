import { useEffect, useRef } from 'react'
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { auth as apiAuth } from '@/lib/api'

const callbackSearchSchema = z.object({
  token: z.string().optional(),
  error: z.string().optional(),
})

export const Route = createFileRoute('/(auth)/callback')({
  validateSearch: callbackSearchSchema,
  component: AuthCallback,
})

function AuthCallback() {
  const { token, error } = useSearch({ from: '/(auth)/callback' })
  const navigate = useNavigate()
  // Read the store actions once via getState to avoid re-renders
  const hasRun = useRef(false)

  useEffect(() => {
    // Prevent double-execution in React StrictMode dev
    if (hasRun.current) return
    hasRun.current = true

    const { auth } = useAuthStore.getState()

    const handleLogin = async () => {
      if (error) {
        toast.error(`Authentication failed: ${error}`)
        navigate({ to: '/sign-in' })
        return
      }

      if (!token) {
        navigate({ to: '/sign-in' })
        return
      }

      try {
        // 1. Set the token in cookie and axios headers
        auth.setAccessToken(token)
        apiAuth.setToken(token)

        // 2. Fetch user profile using the fresh token
        const merchant = await apiAuth.getMe()
        auth.setUser(merchant)

        toast.success(`Welcome ${merchant.business_name || merchant.email}!`)

        // 3. Redirect to dashboard
        navigate({ to: '/', replace: true })
      } catch (err) {
        console.error('OAuth Callback Error:', err)
        toast.error('Authentication failed. Please try again.')
        auth.reset()
        navigate({ to: '/sign-in', replace: true })
      }
    }

    handleLogin()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally empty — we only want this to fire once on mount

  return (
    <div className='flex h-screen w-full flex-col items-center justify-center gap-4 bg-background'>
      <div className='flex flex-col items-center animate-in fade-in zoom-in duration-500'>
        <Loader2 className='h-12 w-12 animate-spin text-primary' />
        <h2 className='mt-6 text-2xl font-semibold tracking-tight'>
          Authenticating...
        </h2>
        <p className='mt-2 text-muted-foreground'>
          Please wait while we set up your session.
        </p>
      </div>
    </div>
  )
}
