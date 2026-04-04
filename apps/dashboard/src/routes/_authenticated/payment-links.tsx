import { createFileRoute } from '@tanstack/react-router'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { usePaymentLinks } from '@/hooks/usePaymentLinks'
import { formatCurrency, formatDate } from '@/lib/formatters'
import { Link2, ExternalLink, Copy } from 'lucide-react'

export const Route = createFileRoute('/_authenticated/payment-links')({
  component: PaymentLinks,
})

function PaymentLinks() {
  const { links, setShowCreate } = usePaymentLinks()

  return (
    <>
      <Header>
        <div className='ms-auto flex items-center space-x-4'>
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>

      <Main>
        <div className='mb-6 flex items-center justify-between space-y-2'>
          <div>
            <h1 className='text-3xl font-bold tracking-tight'>Payment Links</h1>
            <p className='text-sm text-muted-foreground'>Distribute permanent funding endpoints without backend engineering.</p>
          </div>
          <div>
            <Button onClick={() => setShowCreate(true)}>Deploy Link</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {links.length === 0 ? (
                <div className="col-span-full border-2 border-dashed border-border rounded-lg p-12 text-center text-muted-foreground">
                    <Link2 className="mx-auto h-8 w-8 mb-4 opacity-50" />
                    No active link vectors deployed.
                </div>
            ) : (
                links.map(link => (
                    <Card key={link.id} className="relative overflow-hidden">
                        <div className={`absolute top-0 left-0 w-1 h-full ${link.is_active ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
                        <CardHeader className="pb-3">
                            <div className="flex justify-between items-start">
                                <div>
                                    <CardTitle>{link.name}</CardTitle>
                                    {link.description && <CardDescription className="line-clamp-2 mt-1">{link.description}</CardDescription>}
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${link.is_active ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>
                                    {link.is_active ? 'Online' : 'Offline'}
                                </span>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex justify-between items-center mb-6 border-b border-border pb-4">
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Target Volume</p>
                                    <p className="text-xl font-bold">{link.amount > 0 ? formatCurrency(link.amount, link.currency) : "Variable"}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Deployed On</p>
                                    <p className="text-sm font-semibold">{formatDate(link.created_at).split(' ')[0]}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <Button variant="secondary" className="flex-1 justify-start overflow-hidden text-xs">
                                   <Link2 className="h-4 w-4 mr-2 text-muted-foreground" />
                                   <span className="truncate">{window.location.origin}/pay/{link.slug || link.id}</span>
                                </Button>
                                <Button variant="outline" size="icon">
                                    <Copy className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="icon">
                                    <ExternalLink className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))
            )}
        </div>
      </Main>
    </>
  )
}
