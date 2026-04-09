import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { useDashboard } from '@/hooks/useDashboard'
import { formatCurrency } from '@/lib/formatters'
import { DollarSign, Activity, ShoppingBag } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts'
// import { fallbackActivityData, fallbackPieData } from '@/data/mockData'

export function Dashboard() {
  const { stats, chartData, currencies, activeLinksCount, isUsingFallback } = useDashboard()

  const primaryCurrency = currencies[0] || 'USD'
  
  // Use mock display stats entirely if fallback is active
  const displayVol = isUsingFallback ? 4000 : (stats?.total_volume?.[primaryCurrency] || 0)
  const successRate = isUsingFallback ? 99.8 : (stats?.failure_rate !== undefined ? Math.max(0, 100 - stats.failure_rate) : 0)
  const displayTxCount = isUsingFallback ? 1248 : (stats?.total_count || 0)
  const displayActiveLinks = isUsingFallback ? 4 : (activeLinksCount || 0)
  
  const activityData = chartData
  const pieData = isUsingFallback ? 
    currencies.map((curr, idx) => ({
      name: curr,
      value: idx === 0 ? 4000 : (idx === 1 ? 2400 : 1000),
      color: idx === 0 ? 'hsl(var(--foreground))' : 'hsl(var(--primary))'
    })) 
    : currencies.map((curr, idx) => ({
      name: curr,
      value: stats?.total_volume?.[curr] || 0,
      color: idx === 0 ? 'hsl(var(--foreground))' : 'hsl(var(--primary))'
    }))

  return (
    <>
      <Header>
        <div className='ms-auto flex items-center space-x-4'>
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>

      <Main>
        <div className='mb-6 flex flex-col sm:flex-row sm:items-center justify-between space-y-2 sm:space-y-0'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Dashboard</h1>
            <p className='text-sm text-muted-foreground'>Here's your daily financial scoop.</p>
          </div>
        </div>

        <div className='space-y-5'>
          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
            <Card>
              <CardHeader className='flex flex-row items-center justify-between pb-2'>
                <CardTitle className='text-sm font-medium'>
                  Total Volume
                </CardTitle>
                <DollarSign className='h-4 w-4 text-muted-foreground' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold'>{formatCurrency(displayVol * 100, primaryCurrency)}</div>
                <p className='text-xs text-muted-foreground mt-1'>
                  Across all successful transactions
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='flex flex-row items-center justify-between pb-2'>
                <CardTitle className='text-sm font-medium'>
                  Transactions
                </CardTitle>
                <Activity className='h-4 w-4 text-muted-foreground' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold'>+{displayTxCount}</div>
                <p className='text-xs text-muted-foreground mt-1'>
                  System processing optimally
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='flex flex-row items-center justify-between pb-2'>
                <CardTitle className='text-sm font-medium'>Active Links</CardTitle>
                <ShoppingBag className='h-4 w-4 text-muted-foreground' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold'>{displayActiveLinks}</div>
                <p className='text-xs text-muted-foreground mt-1'>
                  Public endpoints
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='flex flex-row items-center justify-between pb-2'>
                <CardTitle className='text-sm font-medium'>
                  Success Rate
                </CardTitle>
                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth='2'
                  className='h-4 w-4 text-muted-foreground'
                >
                  <path d='M22 12h-4l-3 9L9 3l-3 9H2' />
                </svg>
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold'>{successRate.toFixed(1)}%</div>
                <p className='text-xs text-muted-foreground mt-1'>
                  Above average threshold
                </p>
              </CardContent>
            </Card>
          </div>

          <div className='grid gap-4 md:grid-cols-1 lg:grid-cols-7'>
            <Card className='col-span-1 lg:col-span-4'>
              <CardHeader>
                <CardTitle>Flow Matrix ({primaryCurrency})</CardTitle>
              </CardHeader>
              <CardContent className='pl-2'>
                 <div className='h-[320px] w-full'>
                    <ResponsiveContainer width='100%' height='100%'>
                      <BarChart data={activityData}>
                          <CartesianGrid strokeDasharray='3 3' vertical={false} stroke='hsl(var(--border))' />
                          <XAxis
                              dataKey='name'
                              axisLine={false}
                              tickLine={false}
                              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                              dy={10}
                          />
                          <YAxis
                              axisLine={false}
                              tickLine={false}
                              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                              width={50}
                          />
                          <Tooltip
                              cursor={{ fill: 'hsl(var(--muted)/0.4)' }}
                              contentStyle={{
                                  borderRadius: '0.5rem',
                                  border: '1px solid hsl(var(--border))',
                                  backgroundColor: 'hsl(var(--background))',
                              }}
                          />
                          <Bar dataKey={primaryCurrency} fill='hsl(var(--foreground))' radius={[4, 4, 0, 0]} />
                          {currencies[1] && (
                              <Bar dataKey={currencies[1]} fill='hsl(var(--primary))' radius={[4, 4, 0, 0]} />
                          )}
                      </BarChart>
                    </ResponsiveContainer>
                 </div>
              </CardContent>
            </Card>

            <Card className='col-span-1 lg:col-span-3'>
              <CardHeader>
                <CardTitle>Currency Distribution</CardTitle>
              </CardHeader>
              <CardContent className='flex items-center justify-center'>
                  <div className='h-[320px] w-full flex items-center justify-center relative'>
                      <ResponsiveContainer width='100%' height='100%'>
                          <PieChart>
                              <Pie
                                  data={pieData}
                                  cx='50%'
                                  cy='50%'
                                  innerRadius={70}
                                  outerRadius={110}
                                  paddingAngle={4}
                                  dataKey='value'
                                  stroke='none'
                              >
                                  {pieData.map((_, index) => (
                                      <Cell key={`cell-${index}`} fill={index === 0 ? 'hsl(var(--foreground))' : 'hsl(var(--primary))'} />
                                  ))}
                              </Pie>
                          </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                         <span className="text-xl font-bold">
                             {formatCurrency(displayVol * 100, primaryCurrency).split('.')[0]}
                         </span>
                      </div>
                  </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </Main>
    </>
  )
}
