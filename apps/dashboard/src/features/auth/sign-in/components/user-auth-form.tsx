import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { IconGithub } from '@/assets/brand-icons'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface UserAuthFormProps extends React.HTMLAttributes<HTMLDivElement> {
  redirectTo?: string
}

export function UserAuthForm({ className, redirectTo: _redirectTo, ...props }: UserAuthFormProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleGithubLogin = () => {
    setIsLoading(true)
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080'
    window.location.href = `${apiUrl}/api/v1/auth/github`
  }

  return (
    <div className={cn('grid gap-6', className)} {...props}>
      <Button
        variant='outline'
        type='button'
        disabled={isLoading}
        onClick={handleGithubLogin}
        className='h-12 w-full text-base font-semibold transition-all hover:bg-secondary/50'
      >
        {isLoading ? (
          <Loader2 className='mr-2 h-5 w-5 animate-spin' />
        ) : (
          <IconGithub className='mr-2 h-5 w-5' />
        )}
        Continue with GitHub
      </Button>

      <div className='relative'>
        <div className='absolute inset-0 flex items-center'>
          <span className='w-full border-t border-muted' />
        </div>
        <div className='relative flex justify-center text-xs uppercase'>
          <span className='bg-background px-2 text-muted-foreground'>
            Secure Authentication
          </span>
        </div>
      </div>
    </div>
  )
}
