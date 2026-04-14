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
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { useTransactions } from '@/hooks/useTransactions'
import { formatCurrency, formatDate } from '@/lib/formatters'
import { transactionStatusTabs } from '@/data/mockData'
import { cn } from '@/lib/utils'
import type { TransactionStatus } from '@/lib/types'
import { 
    Loader2, Search, Filter, Copy, ExternalLink, 
    ArrowUpRight, CreditCard, Banknote, RefreshCcw, 
    XCircle, Clock, CheckCircle2 
} from 'lucide-react'
import { toast } from 'sonner'

export const Route = createFileRoute('/_authenticated/transactions')({
  component: Transactions,
})

const statusStyles: Record<TransactionStatus, { bg: string; text: string; icon: any }> = {
  pending: { bg: 'bg-amber-500/10', text: 'text-amber-500', icon: Clock },
  success: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', icon: CheckCircle2 },
  failed: { bg: 'bg-rose-500/10', text: 'text-rose-500', icon: XCircle },
  refunded: { bg: 'bg-blue-500/10', text: 'text-blue-500', icon: RefreshCcw },
}

function Transactions() {
  const { 
    loading, filteredTransactions, filter, setFilter, setPage, searchQuery, setSearchQuery,
    createModalOpen, setCreateModalOpen, creating, form, setForm, handleCreateTransaction,
    stats, selected, setSelected, refunding, confirmRefundOpen, setConfirmRefundOpen, handleRefund
  } = useTransactions()

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied to clipboard`)
  }

  return (
    <>
      <Header>
        <div className='ms-auto flex items-center space-x-4'>
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>

      <Main>
        <div className='mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <h1 className='text-3xl font-bold tracking-tight'>Transactions</h1>
            <p className='text-sm text-muted-foreground'>Manage and monitor all your payment transactions.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setCreateModalOpen(true)} className="rounded-full px-6">
                <ArrowUpRight className="mr-2 h-4 w-4" /> New Payment
            </Button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
            <Card className="bg-gradient-to-br from-background to-muted/20 border-border/50 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Volume (30d)</CardTitle>
                    <Banknote className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">
                        {stats ? formatCurrency(stats.total_volume["NGN"] || 0, "NGN") : <Skeleton className="h-8 w-24" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Across all currencies</p>
                </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-background to-muted/20 border-border/50 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-emerald-500">
                        {stats ? `${stats.failure_rate ? (100 - stats.failure_rate).toFixed(1) : "100"}%` : <Skeleton className="h-8 w-20" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Based on last 30 days</p>
                </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-background to-muted/20 border-border/50 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Successful Payments</CardTitle>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">
                         {stats ? stats.total_count : <Skeleton className="h-8 w-16" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Captured transactions</p>
                </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-background to-muted/20 border-border/50 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Pending</CardTitle>
                    <Clock className="h-4 w-4 text-amber-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-amber-500">
                        {stats ? (stats as any).pending_count || 0 : <Skeleton className="h-8 w-16" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Awaiting confirmation</p>
                </CardContent>
            </Card>
        </div>

        <Card className="border-border/50 shadow-sm overflow-hidden">
          <CardHeader className="border-b bg-muted/30 pb-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex bg-muted p-1 rounded-lg w-fit">
                    {transactionStatusTabs.map((tab) => (
                        <button
                            key={tab.value}
                            onClick={() => { setFilter(tab.value); setPage(1); }}
                            className={cn(
                                "px-4 py-1.5 transition-all rounded-md text-sm font-medium whitespace-nowrap",
                                filter === tab.value 
                                    ? "bg-background text-foreground shadow-sm" 
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                        placeholder="Search by reference or email..." 
                        className="pl-10 rounded-full bg-background"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
             <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-muted/40 transition-colors">
                            <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground uppercase text-[10px] tracking-widest">Reference</th>
                            <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground uppercase text-[10px] tracking-widest">Customer</th>
                            <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground uppercase text-[10px] tracking-widest text-right">Amount</th>
                            <th className="h-10 px-4 text-center align-middle font-medium text-muted-foreground uppercase text-[10px] tracking-widest">Status</th>
                            <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground uppercase text-[10px] tracking-widest">Gateway</th>
                            <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground uppercase text-[10px] tracking-widest">Timestamp</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {loading ? (
                            [...Array(6)].map((_, i) => (
                                <tr key={i} className="group">
                                    <td className="p-4"><Skeleton className="h-4 w-28" /></td>
                                    <td className="p-4"><Skeleton className="h-4 w-40" /></td>
                                    <td className="p-4 text-right"><Skeleton className="h-4 w-20 ml-auto" /></td>
                                    <td className="p-4 text-center"><Skeleton className="h-6 w-20 mx-auto rounded-full" /></td>
                                    <td className="p-4"><Skeleton className="h-4 w-16" /></td>
                                    <td className="p-4"><Skeleton className="h-4 w-32" /></td>
                                </tr>
                            ))
                        ) : filteredTransactions.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="p-12 text-center">
                                    <div className="flex flex-col items-center justify-center gap-2">
                                        <Filter className="h-8 w-8 text-muted-foreground/30" />
                                        <p className="text-muted-foreground font-medium">No transactions found</p>
                                        <p className="text-xs text-muted-foreground text-center max-w-[200px]">
                                            Try adjusting your filters or search query to find what you're looking for.
                                        </p>
                                        {filter !== 'all' || searchQuery !== '' ? (
                                            <Button variant="link" size="sm" onClick={() => {setFilter('all'); setSearchQuery('')}}>
                                                Clear all filters
                                            </Button>
                                        ) : null}
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            filteredTransactions.map(tx => {
                                const style = statusStyles[tx.status as TransactionStatus] || { bg: 'bg-muted', text: 'text-muted-foreground', icon: Clock }
                                const StatusIcon = style.icon
                                return (
                                    <tr 
                                        key={tx.id} 
                                        className="group cursor-pointer transition-colors hover:bg-muted/30"
                                        onClick={() => setSelected(tx)}
                                    >
                                        <td className="p-4 align-middle">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-[11px] font-medium text-foreground">
                                                    {tx.reference.slice(0, 10)}...
                                                </span>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); copyToClipboard(tx.reference, "Reference") }}
                                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-muted rounded transition-opacity"
                                                >
                                                    <Copy className="h-3 w-3 text-muted-foreground" />
                                                </button>
                                            </div>
                                        </td>
                                        <td className="p-4 align-middle text-foreground font-medium">{tx.email}</td>
                                        <td className="p-4 align-middle text-right font-bold text-foreground">
                                            {formatCurrency(tx.amount, tx.currency)}
                                        </td>
                                        <td className="p-4 align-middle text-center">
                                            <div className={cn(
                                                "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                                style.bg, style.text
                                            )}>
                                                <StatusIcon className="h-3 w-3" />
                                                {tx.status}
                                            </div>
                                        </td>
                                        <td className="p-4 align-middle">
                                            <div className="flex items-center gap-2">
                                                <CreditCard className="h-3 w-3 text-muted-foreground" />
                                                <span className="capitalize text-muted-foreground">{tx.provider}</span>
                                            </div>
                                        </td>
                                        <td className="p-4 align-middle text-muted-foreground text-xs">{formatDate(tx.created_at)}</td>
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
             </div>
          </CardContent>
        </Card>
      </Main>

      {/* Transaction Details Sheet */}
      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="sm:max-w-md">
            <SheetHeader className="mb-6">
                <SheetTitle className="text-xl">Transaction Details</SheetTitle>
                <SheetDescription>Full breakdown of transaction #{selected?.reference.slice(0, 8)}</SheetDescription>
            </SheetHeader>
            {selected && (
                <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 rounded-xl bg-muted/40 border">
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Amount</p>
                            <p className="text-3xl font-black text-foreground">{formatCurrency(selected.amount, selected.currency)}</p>
                        </div>
                        <div className={cn(
                            "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest",
                            statusStyles[selected.status as TransactionStatus]?.bg,
                            statusStyles[selected.status as TransactionStatus]?.text
                        )}>
                            {selected.status}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <section>
                            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Basic Information</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground">Reference</p>
                                    <div className="flex items-center gap-1 text-sm font-mono font-medium">
                                        {selected.reference.slice(0, 16)}...
                                        <Copy className="h-3 w-3 cursor-pointer text-muted-foreground hover:text-foreground" onClick={() => copyToClipboard(selected.reference, "Reference")} />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground">Date</p>
                                    <p className="text-sm font-medium">{formatDate(selected.created_at)}</p>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Customer Details</h4>
                            <div className="p-3 border rounded-lg bg-background flex flex-col gap-1">
                                <p className="text-xs text-muted-foreground">Email Address</p>
                                <p className="text-sm font-medium text-foreground">{selected.email}</p>
                            </div>
                        </section>

                        <section>
                            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Payment Gateway</h4>
                            <div className="grid grid-cols-2 gap-4 border rounded-lg p-3 bg-background">
                                <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground">Provider</p>
                                    <p className="text-sm font-medium capitalize">{selected.provider}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground">Channel</p>
                                    <p className="text-sm font-medium capitalize">{selected.channel || "Unknown"}</p>
                                </div>
                            </div>
                        </section>
                    </div>

                    <div className="pt-6 space-y-3">
                        {selected.status === 'success' && (
                            <Button 
                                variant="outline" 
                                className="w-full text-rose-500 hover:text-rose-600 hover:bg-rose-50 border-rose-200"
                                onClick={() => setConfirmRefundOpen(true)}
                            >
                                <RefreshCcw className="mr-2 h-4 w-4" /> Refund Transaction
                            </Button>
                        )}
                        <Button variant="secondary" className="w-full" onClick={() => setSelected(null)}>
                            Close Details
                        </Button>
                    </div>
                </div>
            )}
        </SheetContent>
      </Sheet>

      {/* Manual Charge Dialog */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
          <DialogContent className="sm:max-w-[400px]">
              <DialogHeader>
                  <DialogTitle>New Manual Payment</DialogTitle>
                  <DialogDescription>Initialize a new payment transaction from the dashboard.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                      <label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Customer Email</label>
                      <Input
                          id="email"
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                          placeholder="customer@example.com"
                          className="rounded-lg"
                      />
                  </div>
                  <div className="grid gap-2">
                      <label htmlFor="amount" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Amount (NGN)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">₦</span>
                        <Input
                            id="amount"
                            type="number"
                            value={form.amount || ''}
                            onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                            placeholder="0.00"
                            className="pl-7 rounded-lg font-bold"
                        />
                      </div>
                  </div>
              </div>
              <DialogFooter>
                  <Button variant="ghost" onClick={() => setCreateModalOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreateTransaction} disabled={creating} className="rounded-lg px-8">
                      {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</> : 'Continue to Payment'}
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

      {/* Confirmation Dialogs */}
      <Dialog open={confirmRefundOpen} onOpenChange={setConfirmRefundOpen}>
          <DialogContent>
              <DialogHeader>
                  <DialogTitle>Confirm Refund</DialogTitle>
                  <DialogDescription>
                      Are you sure you want to refund this transaction? This action cannot be undone.
                  </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                  <Button variant="ghost" onClick={() => setConfirmRefundOpen(false)}>No, Keep it</Button>
                  <Button variant="destructive" onClick={handleRefund} disabled={refunding}>
                      {refunding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Yes, Refund Transaction
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
    </>
  )
}
