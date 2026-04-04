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
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useFraudProtection } from '@/hooks/useFraudProtection'
import { fraudRuleTypes } from '@/data/mockData'
import { formatDate } from '@/lib/formatters'
import { ShieldCheck, Target, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_authenticated/fraud')({
  component: Fraud,
})

function Fraud() {
  const { events, ruleForm, setRuleForm, handleSaveRule, saving } = useFraudProtection()

  return (
    <>
      <Header>
        <div className='ms-auto flex items-center space-x-4'>
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>

      <Main>
        <div className='mb-6'>
          <h1 className='text-3xl font-bold tracking-tight'>Fraud Matrix</h1>
          <p className='text-sm text-muted-foreground'>Configure kill-switches and review anomalous ledger events.</p>
        </div>

        <div className='grid grid-cols-1 xl:grid-cols-3 gap-6'>
            <div className='xl:col-span-1 space-y-6'>
                <Card>
                    <CardHeader className='pb-4 border-b border-border/50'>
                        <div className="flex items-center gap-3">
                            <Target className="h-5 w-5 text-rose-500" />
                            <CardTitle className="text-base">Policy Injection</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-6">
                        <form onSubmit={handleSaveRule} className="space-y-6">
                            <div className="space-y-3">
                                <label className="text-xs uppercase font-semibold text-muted-foreground">Rule Archetype</label>
                                <div className="space-y-2">
                                    {fraudRuleTypes.map((t) => {
                                        const Icon = t.icon;
                                        const isSelected = ruleForm.rule_type === t.value;
                                        return (
                                            <button
                                                key={t.value}
                                                type="button"
                                                onClick={() => setRuleForm({ ...ruleForm, rule_type: t.value })}
                                                className={cn(
                                                    "w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left",
                                                    isSelected ? "border-rose-500/50 bg-rose-500/5 ring-1 ring-rose-500/20" : "border-border hover:bg-muted/50"
                                                )}
                                            >
                                                <div className={cn("p-2 rounded-md", isSelected ? "bg-rose-500/10 text-rose-500" : "bg-muted text-muted-foreground")}>
                                                    <Icon className="h-4 w-4" />
                                                </div>
                                                <div>
                                                    <p className={cn("text-sm font-semibold", isSelected ? "text-foreground" : "text-muted-foreground")}>{t.label}</p>
                                                    <p className="text-[10px] text-muted-foreground">{t.desc}</p>
                                                </div>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-xs uppercase font-semibold text-muted-foreground">Threshold Limit</label>
                                <Input 
                                    type="number" 
                                    min="1" 
                                    required 
                                    value={ruleForm.threshold} 
                                    onChange={(e) => setRuleForm({ ...ruleForm, threshold: Number(e.target.value) })}
                                />
                            </div>

                            <div className="space-y-3">
                                <label className="text-xs uppercase font-semibold text-muted-foreground">Action Protocol</label>
                                <div className="flex bg-muted/50 p-1 rounded-md">
                                    {['flag', 'block'].map(action => (
                                        <button
                                            key={action}
                                            type="button"
                                            onClick={() => setRuleForm({ ...ruleForm, action: action as 'flag' | 'block' })}
                                            className={cn(
                                                "flex-1 py-1.5 rounded-sm text-xs font-semibold uppercase flex justify-center items-center",
                                                ruleForm.action === action ? (action === 'block' ? 'bg-rose-500 text-primary-foreground shadow' : 'bg-amber-500 text-primary-foreground shadow') : 'text-muted-foreground hover:bg-muted'
                                            )}
                                        >
                                            {action}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <Button disabled={saving} className="w-full mt-4" variant="default">
                                Override Engine Params
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>

            <div className='xl:col-span-2'>
                <Card className="h-full">
                    <CardHeader className='pb-4 border-b border-border/50'>
                         <div className="flex items-center gap-3">
                            <ShieldAlert className="h-5 w-5 text-muted-foreground" />
                            <CardTitle className="text-base">Event Telemetry</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0 px-0">
                         <table className="w-full text-sm mt-4">
                            <thead>
                                <tr className="border-b transition-colors text-muted-foreground">
                                    <th className="h-10 px-6 text-left align-middle font-semibold text-xs uppercase tracking-wider">Identifier</th>
                                    <th className="h-10 px-6 text-left align-middle font-semibold text-xs uppercase tracking-wider">Trigger</th>
                                    <th className="h-10 px-6 text-left align-middle font-semibold text-xs uppercase tracking-wider">Action</th>
                                    <th className="h-10 px-6 text-left align-middle font-semibold text-xs uppercase tracking-wider">Timestamp</th>
                                </tr>
                            </thead>
                            <tbody>
                                {events.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="p-12 text-center">
                                            <div className="mx-auto w-12 h-12 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mb-3">
                                                <ShieldCheck className="h-6 w-6" />
                                            </div>
                                            <p className="font-semibold text-foreground">Matrix Secure</p>
                                            <p className="text-sm text-muted-foreground">No anomalies logged within the current cycle.</p>
                                        </td>
                                    </tr>
                                ) : (
                                    events.map((ev) => (
                                        <tr key={ev.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                            <td className="px-6 py-4 align-middle">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-1.5 h-1.5 rounded-full ${ev.action_taken === 'block' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                                                    <span className="font-mono text-xs">{ev.transaction_id ? ev.transaction_id.slice(0,14) : 'SYSTEM_TRG'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 align-middle">
                                                 <span className="bg-muted px-2 py-1 rounded text-xs font-semibold uppercase">{ev.rule_type}</span>
                                            </td>
                                            <td className="px-6 py-4 align-middle">
                                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${ev.action_taken === 'block' ? 'bg-rose-500/10 text-rose-500' : 'bg-amber-500/10 text-amber-500'}`}>
                                                    {ev.action_taken}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 align-middle text-muted-foreground text-xs font-medium">
                                                {formatDate(ev.created_at)}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
            </div>
        </div>
      </Main>
    </>
  )
}
