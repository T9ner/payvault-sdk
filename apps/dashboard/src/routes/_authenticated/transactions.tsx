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
import { useTransactions } from '@/hooks/useTransactions'
import { formatCurrency, formatDate } from '@/lib/formatters'
import { transactionStatusTabs } from '@/data/mockData'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_authenticated/transactions')({
  component: Transactions,
})

function Transactions() {
  const { filteredTransactions, filter, setFilter, setPage } = useTransactions()

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
            <Button>New Payment</Button>
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
                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Gateway</th>
                            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Timestamp</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredTransactions.map(tx => (
                            <tr key={tx.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                <td className="p-4 align-middle">{tx.reference.slice(0, 12)}...</td>
                                <td className="p-4 align-middle">{tx.email}</td>
                                <td className="p-4 align-middle font-semibold">{formatCurrency(tx.amount, tx.currency)}</td>
                                <td className="p-4 align-middle capitalize">{tx.provider}</td>
                                <td className="p-4 align-middle text-muted-foreground">{formatDate(tx.created_at)}</td>
                            </tr>
                        ))}
                        {filteredTransactions.length === 0 && (
                            <tr>
                                <td colSpan={5} className="p-6 text-center text-muted-foreground">No transactions match your criteria.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
             </div>
          </CardContent>
        </Card>
      </Main>
    </>
  )
}
