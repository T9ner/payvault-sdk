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
  Cell,
  Legend
} from 'recharts'
// import { fallbackActivityData, fallbackPieData } from '@/data/mockData'

export function Dashboard() {
  const { stats, chartData, currencies, activeLinksCount, isUsingFallback } = useDashboard()

  const primaryCurrency = currencies[0] || 'NGN'
  
  // Use 0 as default if no data, instead of fake hardcoded numbers
  const displayVol = stats?.total_volume?.[primaryCurrency] || 0
  const successRate = stats?.failure_rate !== undefined ? Math.max(0, 100 - stats.failure_rate) : 0
  const displayTxCount = stats?.total_count || 0
  const displayActiveLinks = activeLinksCount || 0
  
  const activityData = chartData
  const pieData = currencies.map((curr, idx) => ({
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
                 <div className='h-[320px] w-full relative'>
                     {isUsingFallback && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-[1px] z-10 rounded-lg">
                            <div className="text-center p-6 bg-background border rounded-2xl shadow-sm">
                                <Activity className="mx-auto h-8 w-8 text-muted-foreground/50 mb-3" />
                                <p className="text-sm font-medium">No transaction volume found</p>
                                <p className="text-xs text-muted-foreground mt-1">Activity for the last 7 days will appear here.</p>
                            </div>
                        </div>
                     )}
                    <ResponsiveContainer width='100%' height='100%'>
                           <BarChart 
                                data={activityData} 
                                margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                                barGap={4}
                                categoryGap="20%"
                           >
                                  <CartesianGrid 
                                    strokeDasharray='3 3' 
                                    vertical={false} 
                                    stroke='hsl(var(--border))' 
                                    opacity={0.5}
                                  />
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
                                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                                      width={60}
                                      tickFormatter={(value) => 
                                        new Intl.NumberFormat('en-US', {
                                          notation: 'compact',
                                          compactDisplay: 'short',
                                          style: 'currency',
                                          currency: primaryCurrency,
                                          maximumFractionDigits: 1
                                        }).format(value)
                                      }
                                  />
                                  <Tooltip
                                      cursor={{ fill: '#f1f5f9' }}
                                      contentStyle={{
                                          borderRadius: '0.8rem',
                                          border: '1px solid hsl(var(--border))',
                                          backgroundColor: 'hsl(var(--background))',
                                          boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                                          color: 'hsl(var(--foreground))',
                                      }}
                                      itemStyle={{ fontSize: '12px', padding: '2px 0' }}
                                      formatter={(value: number, name: string) => [
                                        new Intl.NumberFormat('en-US', {
                                          style: 'currency',
                                          currency: name.length === 3 ? name : primaryCurrency,
                                        }).format(value),
                                        name
                                      ]}
                                  />
                                  <Legend 
                                    verticalAlign="top" 
                                    align="right" 
                                    height={36} 
                                    iconType="circle"
                                    wrapperStyle={{
                                      paddingBottom: '20px',
                                      fontSize: '12px',
                                      fontWeight: 500
                                    }}
                                  />
                                  <Bar 
                                    name={primaryCurrency}
                                    dataKey={primaryCurrency} 
                                    fill='#6366f1' 
                                    radius={[4, 4, 0, 0]} 
                                    barSize={16}
                                  />
                                  {currencies.filter(c => c !== primaryCurrency).map((curr, idx) => (
                                      <Bar 
                                        key={curr}
                                        name={curr}
                                        dataKey={curr} 
                                        fill={idx === 0 ? '#10b981' : idx === 1 ? '#f59e0b' : '#3b82f6'} 
                                        radius={[4, 4, 0, 0]} 
                                        barSize={16}
                                      />
                                  ))}
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
