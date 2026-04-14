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
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { usePaymentLinks } from '@/hooks/usePaymentLinks'
import { formatCurrency, formatDate } from '@/lib/formatters'
import { Link2, ExternalLink, Copy, Check, Loader2, Trash2, AlertTriangle } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/_authenticated/payment-links')({
  component: PaymentLinks,
})

function PaymentLinks() {
  const { 
    links, loading, showCreate, setShowCreate, creating, copied,
    form, setForm, handleCreate, getCheckoutUrl, handleCopyLink, handleOpenLink,
    linkToDelete, setLinkToDelete, deleting, handleDelete
  } = usePaymentLinks()

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
            <p className='text-sm text-muted-foreground'>Create shareable payment links — no backend required.</p>
          </div>
          <div>
            <Button onClick={() => setShowCreate(true)}>Create Link</Button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-3">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-60 mt-1" />
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between items-center mb-6 border-b border-border pb-4">
                    <div>
                      <Skeleton className="h-3 w-20 mb-1" />
                      <Skeleton className="h-6 w-28" />
                    </div>
                    <div>
                      <Skeleton className="h-3 w-20 mb-1" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </div>
                  <Skeleton className="h-9 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {links.length === 0 ? (
                <div className="col-span-full border-2 border-dashed border-border rounded-lg p-12 text-center text-muted-foreground">
                    <Link2 className="mx-auto h-8 w-8 mb-4 opacity-50" />
                    No payment links yet. Create one to get started.
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
                                    {link.is_active ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex justify-between items-center mb-6 border-b border-border pb-4">
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Amount</p>
                                    <p className="text-xl font-bold">{link.amount > 0 ? formatCurrency(link.amount, link.currency) : "Any amount"}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Created</p>
                                    <p className="text-sm font-semibold">{formatDate(link.created_at).split(' ')[0]}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <Button variant="secondary" className="flex-1 justify-start overflow-hidden text-xs">
                                   <Link2 className="h-4 w-4 mr-2 text-muted-foreground" />
                                   <span className="truncate">{getCheckoutUrl(link)}</span>
                                </Button>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => handleCopyLink(link)}
                                  title="Copy link"
                                >
                                    {copied === link.id ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => handleOpenLink(link)}
                                  title="Open in new tab"
                                >
                                    <ExternalLink className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => setLinkToDelete(link.id)}
                                  title="Delete link"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))
            )}
          </div>
        )}
      </Main>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent>
              <DialogHeader>
                  <DialogTitle>Create Payment Link</DialogTitle>
                  <DialogDescription className="sr-only">Create a new shareable payment link for customers.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                      <label htmlFor="name" className="text-sm font-medium">Link Name</label>
                      <Input
                          id="name"
                          value={form.name}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                          placeholder="e.g. Premium Subscription"
                      />
                  </div>
                  <div className="grid gap-2">
                      <label htmlFor="description" className="text-sm font-medium">Description</label>
                      <Textarea
                          id="description"
                          value={form.description}
                          onChange={(e) => setForm({ ...form, description: e.target.value })}
                          placeholder="What is this payment for?"
                      />
                  </div>
                  <div className="grid gap-2">
                      <label htmlFor="amount" className="text-sm font-medium">Fixed Amount (Optional - NGN)</label>
                      <Input
                          id="amount"
                          type="number"
                          value={form.amount || ''}
                          onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                          placeholder="Leave 0 for variable amount"
                      />
                  </div>
              </div>
              <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                  <Button onClick={handleCreate} disabled={creating}>
                      {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</> : 'Create Link'}
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

      <Dialog open={!!linkToDelete} onOpenChange={(open) => !open && setLinkToDelete(null)}>
          <DialogContent className="max-w-md">
              <DialogHeader>
                  <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                    <AlertTriangle className="h-6 w-6 text-destructive" />
                  </div>
                  <DialogTitle className="text-center">Delete Payment Link?</DialogTitle>
                  <DialogDescription className="text-center">
                      This action cannot be undone. This link will be permanently removed and customers will no longer be able to use it.
                  </DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                  <Button variant="outline" onClick={() => setLinkToDelete(null)} className="flex-1">Cancel</Button>
                  <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="flex-1">
                      {deleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting...</> : 'Delete Link'}
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
    </>
  )
}
