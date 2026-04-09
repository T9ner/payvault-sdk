import { createFileRoute } from '@tanstack/react-router'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useTransactions } from '@/hooks/useTransactions'
import { formatCurrency, formatDate } from '@/lib/formatters'
import { transactionStatusTabs } from '@/data/mockData'
import { cn } from '@/lib/utils'
import type { TransactionStatus } from '@/lib/types'
import { Loader2 } from 'lucide-react'

export const Route = createFileRoute('/_authenticated/transactions')({
  component: Transactions,
})

const statusStyles: Record<TransactionStatus, string> = {
  pending: 'bg-amber-500/10 text-amber-500',
  success: 'bg-emerald-500/10 text-emerald-500',
  failed: 'bg-rose-500/10 text-rose-500',
  refunded: 'bg-blue-500/10 text-blue-500',
}

function Transactions() {
  const { 
    loading, filteredTransactions, filter, setFilter, setPage,
    createModalOpen, setCreateModalOpen, creating, form, setForm, handleCreateTransaction
  } = useTransactions()

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
            <h1 className='text-3xl font-bold tracking-tight'>Transactions</h1>
            <p className='text-sm text-muted-foreground'>View all incoming and outgoing payments.</p>
          </div>
          <div>
            <Button onClick={() => setCreateModalOpen(true)}>New Payment</Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex bg-muted/50 p-1 rounded-md w-full sm:w-fit overflow-x-auto">
                {transactionStatusTabs.map((tab) => (
                    <button
                        key={tab.value}
                        onClick={() => { setFilter(tab.value); setPage(1); }}
                        className={cn(
                            "px-4 py-1.5 transition-all rounded-sm text-sm font-medium whitespace-nowrap",
                            filter === tab.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
          </CardHeader>
          <CardContent>
             <div className="rounded-md border border-border">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b transition-colors bg-muted/50 hover:bg-muted/50 data-[state=selected]:bg-muted">
                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Reference</th>
                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Customer</th>
                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Amount</th>
                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Status</th>
                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Gateway</th>
                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Timestamp</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            [...Array(5)].map((_, i) => (
                                <tr key={i} className="border-b">
                                    <td className="p-4"><Skeleton className="h-4 w-24" /></td>
                                    <td className="p-4"><Skeleton className="h-4 w-36" /></td>
                                    <td className="p-4"><Skeleton className="h-4 w-20" /></td>
                                    <td className="p-4"><Skeleton className="h-5 w-16 rounded-full" /></td>
                                    <td className="p-4"><Skeleton className="h-4 w-20" /></td>
                                    <td className="p-4"><Skeleton className="h-4 w-32" /></td>
                                </tr>
                            ))
                        ) : filteredTransactions.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="p-6 text-center text-muted-foreground">No transactions match your criteria.</td>
                            </tr>
                        ) : (
                            filteredTransactions.map(tx => (
                                <tr key={tx.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                    <td className="p-4 align-middle font-mono text-xs">{tx.reference.slice(0, 14)}...</td>
                                    <td className="p-4 align-middle">{tx.email}</td>
                                    <td className="p-4 align-middle font-semibold">{formatCurrency(tx.amount, tx.currency)}</td>
                                    <td className="p-4 align-middle">
                                        <span className={cn(
                                            "text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full",
                                            statusStyles[tx.status] || 'bg-muted text-muted-foreground'
                                        )}>
                                            {tx.status}
                                        </span>
                                    </td>
                                    <td className="p-4 align-middle capitalize">{tx.provider}</td>
                                    <td className="p-4 align-middle text-muted-foreground">{formatDate(tx.created_at)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
             </div>
          </CardContent>
        </Card>
      </Main>

      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
          <DialogContent>
              <DialogHeader>
                  <DialogTitle>New Payment</DialogTitle>
                  <DialogDescription className="sr-only">Create a new manual payment transaction.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                      <label htmlFor="email" className="text-sm font-medium">Customer Email</label>
                      <Input
                          id="email"
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                          placeholder="customer@example.com"
                      />
                  </div>
                  <div className="grid gap-2">
                      <label htmlFor="amount" className="text-sm font-medium">Amount (NGN)</label>
                      <Input
                          id="amount"
                          type="number"
                          value={form.amount || ''}
                          onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                          placeholder="1000"
                      />
                  </div>
              </div>
              <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateModalOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreateTransaction} disabled={creating}>
                      {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</> : 'Proceed to Payment'}
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
    </>
  )
}
