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
import { useSystemSettings } from '@/hooks/useSystemSettings'
import { settingsIntegrationResources } from '@/data/mockData'
import { copyToClipboard } from '@/lib/formatters'
import { Terminal, Lock, Server, ShieldCheck, ChevronRight, Eye, EyeOff, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_authenticated/settings')({
  component: Settings,
})

function Settings() {
  const {
      apiKey,
      generatingKey,
      keyCopied,
      setKeyCopied,
      showKey,
      setShowKey,
      provider,
      setProvider,
      secretKey,
      setSecretKey,
      showSecret,
      setShowSecret,
      savingProvider,
      handleGenerateKey,
      handleSaveProvider
  } = useSystemSettings()

  const copyVector = async () => {
      if(!apiKey?.key) return;
      await copyToClipboard(apiKey.key);
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2000);
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
        <div className='mb-6'>
          <h1 className='text-3xl font-bold tracking-tight'>System Parameters</h1>
          <p className='text-sm text-muted-foreground'>Manage core integration vectors and encrypted provider secrets.</p>
        </div>

        <div className='grid grid-cols-1 xl:grid-cols-3 gap-6'>
           <div className='xl:col-span-2 space-y-6'>
               <Card>
                   <CardHeader className="border-b border-border/50 pb-4">
                       <div className="flex items-center gap-3">
                           <Terminal className="h-5 w-5 text-blue-500" />
                           <CardTitle className="text-base">Developer Access Vectors</CardTitle>
                       </div>
                   </CardHeader>
                   <CardContent className="pt-6 space-y-6">
                        <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-blue-600 dark:text-blue-400">
                            API keys authorize your application to access the Payvault infrastructure. 
                            Treat these as sensitive credentials: never commit them to source control.
                        </div>

                        {apiKey ? (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center px-1">
                                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Merchant Access Token</span>
                                    <div className="flex gap-4">
                                        <button onClick={() => setShowKey(!showKey)} className="text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-2">
                                            {showKey ? <EyeOff size={14} /> : <Eye size={14} />} {showKey ? 'Hide' : 'Reveal'}
                                        </button>
                                        <button onClick={copyVector} className="text-xs font-bold text-muted-foreground hover:text-blue-500 flex items-center gap-2">
                                            {keyCopied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />} {keyCopied ? 'Copied' : 'Copy'}
                                        </button>
                                    </div>
                                </div>
                                <div className="p-4 rounded-md bg-muted/50 border border-border font-mono text-sm tracking-widest break-all">
                                    {showKey ? apiKey.key : "sk_live_" + "•".repeat(48)}
                                </div>
                            </div>
                        ) : (
                            <div className="py-12 flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg text-center">
                                <Lock className="h-8 w-8 text-muted-foreground mb-4 opacity-50" />
                                <h4 className="text-sm font-semibold mb-2">Null Vector State</h4>
                                <p className="text-xs text-muted-foreground max-w-sm">No active integration keys detected. Provision a new vector to establish connectivity.</p>
                            </div>
                        )}

                        <Button onClick={handleGenerateKey} disabled={generatingKey} className="w-full sm:w-auto">
                            Provision Access Vector
                        </Button>
                   </CardContent>
               </Card>

               <Card>
                   <CardHeader className="border-b border-border/50 pb-4">
                        <div className="flex items-center gap-3">
                           <Server className="h-5 w-5 text-indigo-500" />
                           <CardTitle className="text-base">Gateway Encryption Vault</CardTitle>
                       </div>
                   </CardHeader>
                   <CardContent className="pt-6 space-y-6">
                        <form onSubmit={handleSaveProvider} className="space-y-6">
                            <div className="space-y-3">
                                <label className="text-xs uppercase font-semibold text-muted-foreground">Target Processor Interface</label>
                                <div className="flex bg-muted/50 w-full sm:w-max p-1 rounded-md">
                                    {['paystack', 'flutterwave'].map(p => (
                                        <button
                                            key={p}
                                            type="button"
                                            onClick={() => setProvider(p as 'paystack' | 'flutterwave')}
                                            className={cn(
                                                "px-6 py-2 rounded-sm text-xs font-semibold uppercase tracking-wider transition-all",
                                                provider === p ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            {p}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-3 max-w-md">
                                <label className="text-xs uppercase font-semibold text-muted-foreground">Secure Gateway Secret</label>
                                <div className="relative">
                                    <Input
                                        type={showSecret ? "text" : "password"}
                                        value={secretKey}
                                        onChange={(e) => setSecretKey(e.target.value)}
                                        placeholder={provider === "paystack" ? "SK_LIVE_..." : "FLWSECK-..."}
                                        className="font-mono text-sm tracking-wider pr-24"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowSecret(!showSecret)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground hover:text-foreground uppercase tracking-widest"
                                    >
                                        {showSecret ? 'Hide' : 'Reveal'}
                                    </button>
                                </div>
                            </div>

                            <Button type="submit" disabled={savingProvider || !secretKey}>
                                <ShieldCheck className="h-4 w-4 mr-2" />
                                Commit Secure Credentials
                            </Button>
                        </form>
                   </CardContent>
               </Card>
           </div>
           
           <div className="space-y-6">
               <Card>
                   <CardHeader className="pb-3 border-b border-border/50">
                       <CardTitle className="text-sm">Encryption Protocol v2</CardTitle>
                   </CardHeader>
                   <CardContent className="pt-4 text-sm text-muted-foreground space-y-4">
                       <p>Your core secrets are isolated within a hardware-backed vault. We enforce <strong className="text-foreground">AES-256-GCM</strong> with unique salt derivation per merchant entity.</p>
                       <ul className="space-y-3 text-xs border-t border-border/50 pt-4">
                           <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0"/>Access vector revocation instantly invalidates all associated interfaces.</li>
                           <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0"/>PCI-DSS Level 1 compliance isolation is maintained via hardware.</li>
                           <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0"/>Every mutation is broadcasted via secure webhooks.</li>
                       </ul>
                   </CardContent>
               </Card>

               <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">Developer Resources</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2 flex flex-col gap-1">
                        {settingsIntegrationResources.map(item => (
                            <button key={item} className="w-full flex items-center justify-between py-2 text-left group">
                                <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground">{item}</span>
                                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                            </button>
                        ))}
                    </CardContent>
               </Card>
           </div>
        </div>
      </Main>
    </>
  )
}
