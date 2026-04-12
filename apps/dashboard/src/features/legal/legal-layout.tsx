import { Link } from '@tanstack/react-router'
import { Logo } from '@/assets/logo'
import { Button } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-react'

interface LegalLayoutProps {
  children: React.ReactNode
  title: string
  lastUpdated: string
}

export function LegalLayout({ children, title, lastUpdated }: LegalLayoutProps) {
  return (
    <div className='min-h-screen bg-background font-sans text-foreground'>
      <header className='sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60'>
        <div className='container flex h-16 items-center justify-between'>
          <div className='flex items-center gap-2'>
            <Link to='/sign-in' className='flex items-center gap-2 transition-opacity hover:opacity-80'>
              <Logo className='h-6 w-6' />
              <span className='text-lg font-bold tracking-tight'>PayVault</span>
            </Link>
          </div>
          <Button variant='ghost' size='sm' asChild>
            <Link to='/sign-in' className='flex items-center gap-1'>
              <ChevronLeft className='h-4 w-4' />
              Back to Login
            </Link>
          </Button>
        </div>
      </header>

      <main className='container py-12 md:py-20'>
        <div className='mx-auto max-w-3xl'>
          <div className='mb-10 space-y-2'>
            <h1 className='text-4xl font-extrabold tracking-tight lg:text-5xl'>
              {title}
            </h1>
            <p className='text-sm text-muted-foreground'>
              Last updated: {lastUpdated}
            </p>
          </div>
          <div className='prose prose-zinc dark:prose-invert max-w-none'>
            {children}
          </div>
        </div>
      </main>

      <footer className='border-t py-12'>
        <div className='container flex flex-col items-center justify-between gap-4 md:h-24 md:flex-row md:py-0'>
          <div className='flex flex-col items-center gap-4 px-8 md:flex-row md:gap-2 md:px-0'>
            <p className='text-center text-sm leading-loose text-muted-foreground md:text-left'>
              &copy; {new Date().getFullYear()} PayVault Inc. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
