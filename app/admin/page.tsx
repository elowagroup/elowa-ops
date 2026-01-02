"use client";
import { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { DepotDayEvent, InventoryStatus } from './types';
import { generateMockEvents } from './mockData';
import { EventBadge } from './components/StatusBadge';

/**
 * ELOWA Operational Command Center
 * Refined for high-density information management and aesthetic precision.
 */

export default function AdminPage() {
  const [data, setData] = useState<DepotDayEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<DepotDayEvent | null>(null);
  
  // -- Grouped UI State --
  const [dashboardConfig, setDashboardConfig] = useState({
    globalDepotFocus: 'All' as 'All' | 'Adetikope' | 'Benardkope',
    searchQuery: '',
    showStockDrilldown: false,
  });

  const [chartConfig, setChartConfig] = useState({
    type: 'area' as 'area' | 'bar',
    granularity: 'daily' as 'daily' | 'weekly',
    timeWindow: 14 as 7 | 14 | 30,
  });

  const [logsConfig, setLogsConfig] = useState({
    dateRange: '30d' as 'all' | '7d' | '30d' | '90d',
    statusFilter: 'all' as 'all' | 'open' | 'closed',
    depotFilter: 'All' as 'All' | 'Adetikope' | 'Benardkope',
    currentPage: 1,
    rowsPerPage: 25,
    viewMode: 'table' as 'table' | 'cards',
    sort: { key: 'business_date' as keyof DepotDayEvent | 'revenue' | 'variance', direction: 'desc' as 'asc' | 'desc' }
  });

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      // Simulate network latency for command-center feel
      await new Promise(r => setTimeout(r, 800));
      setData(generateMockEvents());
      setLoading(false);
    };
    init();
  }, []);

  // -- Business Logic & Analytics --

  const handleSort = (key: keyof DepotDayEvent | 'revenue' | 'variance') => {
    setLogsConfig(prev => ({
      ...prev,
      sort: {
        key,
        direction: prev.sort.key === key && prev.sort.direction === 'desc' ? 'asc' : 'desc'
      }
    }));
  };

  const globalFilteredData = useMemo(() => {
    let filtered = dashboardConfig.globalDepotFocus === 'All' 
      ? data 
      : data.filter(d => d.depot_id === dashboardConfig.globalDepotFocus);
    
    if (logsConfig.dateRange !== 'all') {
      const now = new Date();
      const limit = new Date();
      if (logsConfig.dateRange === '7d') limit.setDate(now.getDate() - 7);
      else if (logsConfig.dateRange === '30d') limit.setDate(now.getDate() - 30);
      else if (logsConfig.dateRange === '90d') limit.setDate(now.getDate() - 90);
      filtered = filtered.filter(d => new Date(d.business_date) >= limit);
    }
    
    return filtered;
  }, [data, dashboardConfig.globalDepotFocus, logsConfig.dateRange]);

  const metrics = useMemo(() => {
    if (!globalFilteredData.length) return { turn: "0.0", sales: 0, stockouts: 0 };
    const snapshot = globalFilteredData.slice(0, 30);
    const totalSales = snapshot.reduce((sum, curr) => sum + curr.cash_sales_cfa + curr.mobile_sales_cfa, 0);
    const avgFloat = snapshot.reduce((sum, curr) => sum + curr.opening_cash_cfa, 0) / Math.max(snapshot.length, 1);
    const turn = (totalSales / (avgFloat || 1)).toFixed(1);
    
    const latestDate = data[0]?.business_date;
    const stockouts = data.filter(d => 
      d.business_date === latestDate && 
      d.closing_inventory.some(i => i.status !== InventoryStatus.IN)
    ).length;

    return { turn, sales: totalSales, stockouts };
  }, [globalFilteredData, data]);

  const stockMatrix = useMemo(() => {
    const matrix: Record<string, Record<string, InventoryStatus>> = {};
    const latestDate = data[0]?.business_date;
    data.filter(d => d.business_date === latestDate).forEach(day => {
      matrix[day.depot_id] = {};
      day.closing_inventory.forEach(item => {
        matrix[day.depot_id][item.sku] = item.status;
      });
    });
    return matrix;
  }, [data]);

  const processedLogs = useMemo(() => {
    let result = globalFilteredData.filter(d => {
      const matchesSearch = d.depot_id.toLowerCase().includes(dashboardConfig.searchQuery.toLowerCase());
      const matchesStatus = 
        logsConfig.statusFilter === 'all' ? true :
        logsConfig.statusFilter === 'open' ? !d.operator_close : !!d.operator_close;
      const matchesDepot = logsConfig.depotFilter === 'All' ? true : d.depot_id === logsConfig.depotFilter;
      
      return matchesSearch && matchesStatus && matchesDepot;
    });

    const getVal = (row: DepotDayEvent, key: string) => {
      if (key === 'revenue') return row.cash_sales_cfa + row.mobile_sales_cfa;
      if (key === 'variance') {
        const expected = row.opening_cash_cfa + row.cash_sales_cfa - row.restock_cash_used;
        return row.operator_close ? row.closing_cash_physical - expected : 0;
      }
      return row[key as keyof DepotDayEvent] as any;
    };

    result.sort((a, b) => {
      const aVal = getVal(a, logsConfig.sort.key);
      const bVal = getVal(b, logsConfig.sort.key);
      return logsConfig.sort.direction === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });

    return result;
  }, [globalFilteredData, dashboardConfig.searchQuery, logsConfig.statusFilter, logsConfig.depotFilter, logsConfig.sort]);

  // Fix: Added totalPages calculation to be used in pagination UI
  const totalPages = useMemo(() => {
    return Math.ceil(processedLogs.length / logsConfig.rowsPerPage) || 1;
  }, [processedLogs.length, logsConfig.rowsPerPage]);

  const pagedLogs = useMemo(() => {
    const start = (logsConfig.currentPage - 1) * logsConfig.rowsPerPage;
    return processedLogs.slice(start, start + logsConfig.rowsPerPage);
  }, [processedLogs, logsConfig.currentPage, logsConfig.rowsPerPage]);

  const chartData = useMemo(() => {
    const grouped = globalFilteredData.reduce((acc: any, curr) => {
      const dateStr = curr.business_date;
      const sales = curr.cash_sales_cfa + curr.mobile_sales_cfa;
      
      if (chartConfig.granularity === 'daily') {
        acc[dateStr] = (acc[dateStr] || 0) + sales;
      } else {
        const d = new Date(dateStr);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const weekStart = new Date(d.setDate(diff)).toISOString().slice(0, 10);
        acc[weekStart] = (acc[weekStart] || 0) + sales;
      }
      return acc;
    }, {});
    
    const sortedKeys = Object.keys(grouped).sort();
    const periodData = sortedKeys.slice(chartConfig.granularity === 'daily' ? -chartConfig.timeWindow : -Math.ceil(chartConfig.timeWindow / 7)).map(key => ({
      name: key.split('-').slice(chartConfig.granularity === 'daily' ? 2 : 1).join('/'),
      val: grouped[key]
    }));

    const average = periodData.reduce((sum, item) => sum + item.val, 0) / (periodData.length || 1);
    return { periodData, average };
  }, [globalFilteredData, chartConfig]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-6">
        <div className="w-12 h-12 border-[4px] border-slate-100 border-t-blue-600 rounded-full animate-spin"></div>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Syncing Command Vectors</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen pb-24 bg-[#fbfbfd]">
      {/* Dynamic Status Strip */}
      <div className={`text-white py-2 px-6 text-center text-[9px] font-black uppercase tracking-[0.2em] sticky top-0 z-[60] shadow-sm transition-all duration-700 ${
        metrics.stockouts > 0 ? 'bg-orange-500' : 'bg-blue-600'
      }`}>
        {metrics.stockouts > 0 
          ? `Status Alert: Critical stock levels detected at ${metrics.stockouts} node(s)` 
          : `System Integrity: Optimal flow recorded at ${metrics.turn}x velocity`}
      </div>

      {/* Navigation Layer */}
      <nav className="nav-bar sticky top-[33px] z-50 px-6 py-5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-8">
            <div className="flex flex-col">
              <h1 className="text-sm font-black tracking-tight text-slate-900">ELOWA COMMAND</h1>
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Core Operational Hub</span>
            </div>
            
            <div className="h-6 w-px bg-slate-100"></div>
            
            <div className="relative">
               <select 
                value={dashboardConfig.globalDepotFocus} 
                onChange={(e) => {
                  setDashboardConfig(prev => ({ ...prev, globalDepotFocus: e.target.value as any }));
                  setLogsConfig(prev => ({ ...prev, currentPage: 1 }));
                }}
                className="appearance-none bg-slate-50 border border-slate-100 rounded-full py-2 px-8 pr-12 text-[10px] font-black uppercase tracking-widest text-slate-600 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none cursor-pointer transition-all shadow-sm"
               >
                <option value="All">Global Matrix</option>
                <option value="Adetikope">Adetikope Node</option>
                <option value="Benardkope">Benardkope Node</option>
               </select>
               <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
               </div>
            </div>
          </div>
          
          <div className="flex gap-4 items-center w-full md:w-auto">
            <div className="relative flex-1 md:flex-none">
              <input 
                type="text" 
                placeholder="Query transaction logs..."
                className="bg-slate-50 border border-slate-100 rounded-full py-2.5 px-6 text-[11px] font-medium w-full md:w-80 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all outline-none shadow-sm"
                value={dashboardConfig.searchQuery}
                onChange={e => {
                  setDashboardConfig(prev => ({ ...prev, searchQuery: e.target.value }));
                  setLogsConfig(prev => ({ ...prev, currentPage: 1 }));
                }}
              />
              <svg className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Core Scoreboard */}
        <header className="mb-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="ios-card p-10 bg-slate-900 text-white border-none shadow-2xl relative group overflow-hidden">
              <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.3em] mb-4">Revenue Velocity</p>
              <h3 className="text-6xl font-black tracking-tighter">{metrics.turn}x</h3>
              <div className="mt-8 flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
                <p className="text-[9px] text-white/40 font-black uppercase tracking-widest">Global Index Nominal</p>
              </div>
              <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-white/5 rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700"></div>
            </div>
            
            <div className="ios-card p-10">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4">Cumulative Flow</p>
              <h3 className="text-6xl font-black tracking-tighter text-slate-900">{metrics.sales.toLocaleString()}</h3>
              <p className="text-[11px] text-slate-300 mt-8 font-bold uppercase tracking-wider">CFA Gross (Trailing 30D)</p>
            </div>

            <div className="ios-card p-10 border-slate-100 flex flex-col justify-between">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4">Stock Integrity</p>
                <h3 className={`text-4xl font-black tracking-tighter ${metrics.stockouts > 0 ? 'text-orange-600' : 'text-slate-900'}`}>
                  {metrics.stockouts > 0 ? 'Issues Detected' : 'All Nominal'}
                </h3>
              </div>
              <button 
                onClick={() => setDashboardConfig(prev => ({ ...prev, showStockDrilldown: true }))}
                className="mt-8 bg-blue-600 text-white py-4 px-6 rounded-[20px] text-[10px] font-black uppercase tracking-[0.15em] hover:bg-blue-700 hover:scale-[1.03] active:scale-95 transition-all shadow-xl shadow-blue-50 flex items-center justify-center gap-3"
              >
                Inspect Integrity Gaps <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>
        </header>

        {/* Daily Flow Analytics - Enhanced Readability */}
        <section className="mb-24">
          <div className="ios-card overflow-hidden shadow-sm border-slate-100">
            <div className="p-12 border-b border-slate-50">
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
                <div className="flex flex-col gap-2">
                  <h3 className="text-xl font-black uppercase tracking-[0.1em] text-slate-900">Revenue Flow Vector</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                    Historical Performance Analytics
                  </p>
                </div>
                
                <div className="flex flex-wrap gap-3 items-center">
                  <div className="flex bg-slate-100 rounded-2xl p-1.5 shadow-inner">
                    {(['area', 'bar'] as const).map(type => (
                      <button 
                        key={type}
                        onClick={() => setChartConfig(prev => ({ ...prev, type }))}
                        className={`px-6 py-2 text-[9px] font-black rounded-xl transition-all uppercase tracking-widest ${chartConfig.type === type ? 'bg-white shadow-md text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                  <div className="flex bg-slate-100 rounded-2xl p-1.5 shadow-inner">
                    {(['daily', 'weekly'] as const).map(gran => (
                      <button 
                        key={gran}
                        onClick={() => setChartConfig(prev => ({ ...prev, granularity: gran }))}
                        className={`px-6 py-2 text-[9px] font-black rounded-xl transition-all uppercase tracking-widest ${chartConfig.granularity === gran ? 'bg-white shadow-md text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        {gran}
                      </button>
                    ))}
                  </div>
                  <div className="flex bg-slate-100 rounded-2xl p-1.5 shadow-inner">
                    {([7, 14, 30] as const).map(num => (
                      <button 
                        key={num}
                        onClick={() => setChartConfig(prev => ({ ...prev, timeWindow: num }))}
                        className={`px-6 py-2 text-[9px] font-black rounded-xl transition-all uppercase tracking-widest ${chartConfig.timeWindow === num ? 'bg-white shadow-md text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        {num}D
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="h-[480px] p-12 pt-16">
              <ResponsiveContainer width="100%" height="100%">
                {chartConfig.type === 'area' ? (
                  <AreaChart data={chartData.periodData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="flowV" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#007aff" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#007aff" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="8 8" vertical={false} stroke="#f0f2f5" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fontSize: 10, fill: '#8e8e93', fontWeight: '800'}} 
                      dy={25} 
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fontSize: 10, fill: '#8e8e93', fontWeight: '800'}} 
                      tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} 
                    />
                    <Tooltip
                      cursor={{ stroke: '#007aff', strokeWidth: 1.5, strokeDasharray: '6 6' }}
                      contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 30px 60px rgba(0,0,0,0.12)', fontSize: '14px', fontWeight: '900', padding: '24px' }}
                      formatter={(v: number | undefined) => [(v || 0).toLocaleString() + ' CFA', 'Volume']}
                      itemStyle={{ color: '#007aff' }}
                      animationDuration={300}
                    />
                    <ReferenceLine 
                      y={chartData.average} 
                      stroke="#cbd5e1" 
                      strokeDasharray="12 12" 
                      strokeWidth={1.5} 
                      label={{ value: 'BASELINE', position: 'right', fill: '#94a3b8', fontSize: 10, fontWeight: '900', dx: -60 }} 
                    />
                    <Area 
                      type="monotone" 
                      dataKey="val" 
                      stroke="#007aff" 
                      strokeWidth={6} 
                      fillOpacity={1} 
                      fill="url(#flowV)" 
                      animationDuration={2500} 
                      animationEasing="ease-in-out"
                    />
                  </AreaChart>
                ) : (
                  <BarChart data={chartData.periodData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="8 8" vertical={false} stroke="#f0f2f5" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fontSize: 10, fill: '#8e8e93', fontWeight: '800'}} 
                      dy={25} 
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fontSize: 10, fill: '#8e8e93', fontWeight: '800'}} 
                      tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} 
                    />
                    <Tooltip
                      cursor={{ fill: '#f8fafc', radius: 12 }}
                      contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 30px 60px rgba(0,0,0,0.12)', fontSize: '14px', fontWeight: '900', padding: '24px' }}
                      formatter={(v: number | undefined) => [(v || 0).toLocaleString(), 'Revenue']}
                    />
                    <ReferenceLine y={chartData.average} stroke="#cbd5e1" strokeDasharray="12 12" strokeWidth={1.5} />
                    <Bar 
                      dataKey="val" 
                      fill="#1e293b" 
                      radius={[14, 14, 4, 4]} 
                      barSize={42} 
                      animationDuration={1500} 
                    />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* Paginated Activity Log Layer */}
        <section>
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-10">
            <div className="flex items-center gap-8">
              <h3 className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Activity Logs</h3>
              <div className="flex bg-slate-100 rounded-full p-1.5 shadow-inner">
                {(['30d', '7d', '90d', 'all'] as const).map(range => (
                  <button 
                    key={range}
                    onClick={() => setLogsConfig(prev => ({ ...prev, dateRange: range, currentPage: 1 }))}
                    className={`px-6 py-2 text-[10px] font-black rounded-full transition-all uppercase tracking-widest ${logsConfig.dateRange === range ? 'bg-white shadow-md text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="flex flex-wrap gap-4 items-center">
              {/* Depot Log Filter */}
              <div className="relative group">
                <select 
                  value={logsConfig.depotFilter}
                  onChange={(e) => setLogsConfig(prev => ({ ...prev, depotFilter: e.target.value as any, currentPage: 1 }))}
                  className="appearance-none bg-white border border-slate-200 rounded-2xl py-2 px-6 pr-10 text-[10px] font-black uppercase tracking-widest text-slate-600 outline-none cursor-pointer transition-all shadow-sm hover:border-blue-400"
                >
                  <option value="All">All Depot Records</option>
                  <option value="Adetikope">Adetikope Log</option>
                  <option value="Benardkope">Benardkope Log</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>

              <div className="flex bg-slate-100 rounded-2xl p-1.5 shadow-inner">
                {(['all', 'open', 'closed'] as const).map(stat => (
                  <button 
                    key={stat}
                    onClick={() => setLogsConfig(prev => ({ ...prev, statusFilter: stat, currentPage: 1 }))}
                    className={`px-5 py-2 text-[10px] font-black rounded-xl transition-all uppercase tracking-widest ${logsConfig.statusFilter === stat ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}
                  >
                    {stat}
                  </button>
                ))}
              </div>

              <div className="flex bg-slate-100 rounded-2xl p-1.5 shadow-inner">
                <button 
                  onClick={() => setLogsConfig(prev => ({ ...prev, viewMode: 'table' }))} 
                  className={`p-2 rounded-xl transition-all ${logsConfig.viewMode === 'table' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M5 4h10v2H5V4zm0 5h10v2H5V9zm0 5h10v2H5v-2z" /></svg>
                </button>
                <button 
                  onClick={() => setLogsConfig(prev => ({ ...prev, viewMode: 'cards' }))} 
                  className={`p-2 rounded-xl transition-all ${logsConfig.viewMode === 'cards' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M5 5h3v3H5V5zm7 0h3v3h-3V5zm-7 7h3v3H5v-3zm7 0h3v3h-3v-3z" /></svg>
                </button>
              </div>
            </div>
          </div>

          <div className="ios-card overflow-hidden shadow-xl bg-white border-slate-100">
            {logsConfig.viewMode === 'table' ? (
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-10 py-6 text-[10px] font-black uppercase tracking-[0.2em] cursor-pointer hover:bg-slate-100" onClick={() => handleSort('business_date')}>Cycle Timeline</th>
                    <th className="px-6 py-6 text-[10px] font-black uppercase tracking-[0.2em] cursor-pointer hover:bg-slate-100" onClick={() => handleSort('depot_id')}>Node Identification</th>
                    <th className="px-6 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-right cursor-pointer hover:bg-slate-100" onClick={() => handleSort('revenue')}>Revenue Gross</th>
                    <th className="px-6 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-right">Settlements</th>
                    <th className="px-6 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-right">Entry Float</th>
                    <th className="px-10 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-right">Settlement Delta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {pagedLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-28 text-center text-slate-300 text-[12px] font-black uppercase tracking-[0.4em]">No Operational Records Found</td>
                    </tr>
                  ) : (
                    pagedLogs.map((row, i) => {
                      const revenue = row.cash_sales_cfa + row.mobile_sales_cfa;
                      const expected = row.opening_cash_cfa + row.cash_sales_cfa - row.restock_cash_used;
                      const delta = row.operator_close ? row.closing_cash_physical - expected : 0;
                      return (
                        <tr key={i} onClick={() => setSelectedEvent(row)} className="row-hover cursor-pointer bg-white group border-b border-transparent">
                          <td className="px-10 py-8 text-[11px] text-slate-400 font-black">{row.business_date.split('-').slice(1).join('/')}</td>
                          <td className="px-6 py-8 font-black text-[14px] text-slate-800 tracking-tight">{row.depot_id}</td>
                          <td className="px-6 py-8 text-right font-black text-[15px] tabular-nums text-slate-900">{revenue.toLocaleString()}</td>
                          <td className="px-6 py-8 text-right text-[11px] font-black text-blue-600">
                            {row.restock_cash_used > 0 ? `−${row.restock_cash_used.toLocaleString()}` : '—'}
                          </td>
                          <td className="px-6 py-8 text-right text-[11px] font-black text-slate-400">
                            {row.opening_cash_cfa.toLocaleString()}
                          </td>
                          <td className="px-10 py-8 text-right">
                            <span className={`text-[10px] font-black px-4 py-2 rounded-xl border transition-all ${
                              delta < 0 ? 'text-rose-600 bg-rose-50 border-rose-100 shadow-sm' : delta > 0 ? 'text-emerald-600 bg-emerald-50 border-emerald-100 shadow-sm' : 'text-slate-300 bg-slate-50 border-slate-100'
                            }`}>
                              {delta === 0 ? 'BALANCED' : (delta > 0 ? `+${delta.toLocaleString()}` : `${delta.toLocaleString()}`)}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 divide-x divide-y divide-slate-50">
                {pagedLogs.map((row, i) => {
                  const rev = row.cash_sales_cfa + row.mobile_sales_cfa;
                  const expected = row.opening_cash_cfa + row.cash_sales_cfa - row.restock_cash_used;
                  const delta = row.operator_close ? row.closing_cash_physical - expected : 0;
                  return (
                    <div key={i} onClick={() => setSelectedEvent(row)} className="p-12 cursor-pointer hover:bg-slate-50 transition-all flex flex-col justify-between min-h-[280px]">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{row.business_date}</p>
                          <h4 className="font-black text-[18px] text-slate-900 tracking-tight mt-2">{row.depot_id}</h4>
                        </div>
                        <EventBadge type={row.operator_close ? 'CLOSED' : 'OPEN'} />
                      </div>
                      <div className="mt-12 space-y-6">
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest opacity-60">Revenue Gross</span>
                          <span className="text-lg font-black text-slate-900 tabular-nums">{rev.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest opacity-60">Delta Variance</span>
                          <span className={`text-[11px] font-black px-4 py-1.5 rounded-xl ${delta < 0 ? 'text-rose-600 bg-rose-50' : delta > 0 ? 'text-emerald-600 bg-emerald-50' : 'text-slate-300 bg-slate-50'}`}>
                            {delta === 0 ? 'NOMINAL' : (delta > 0 ? `+${delta.toLocaleString()}` : delta.toLocaleString())}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="bg-slate-50/70 px-12 py-8 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-8">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">
                  Analyzing Batch {((logsConfig.currentPage - 1) * logsConfig.rowsPerPage) + 1} - {Math.min(logsConfig.currentPage * logsConfig.rowsPerPage, processedLogs.length)} of {processedLogs.length} Records
                </p>
                <div className="flex gap-4">
                  <button 
                    disabled={logsConfig.currentPage === 1}
                    onClick={() => {
                      setLogsConfig(prev => ({ ...prev, currentPage: prev.currentPage - 1 }));
                      window.scrollTo({ top: 1100, behavior: 'smooth' });
                    }}
                    className="p-3.5 px-8 rounded-2xl border border-slate-200 bg-white text-[10px] font-black uppercase tracking-widest disabled:opacity-30 hover:bg-slate-50 transition-all shadow-sm flex items-center gap-3"
                  >
                    <svg className="w-3.5 h-3.5 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M9 5l7 7-7 7" /></svg> Backward
                  </button>
                  <div className="flex items-center gap-5 px-8 bg-white border border-slate-100 rounded-2xl shadow-inner">
                    <span className="text-[12px] font-black text-slate-900">{logsConfig.currentPage}</span>
                    <span className="text-[11px] font-black text-slate-300 uppercase tracking-widest">/ {totalPages}</span>
                  </div>
                  <button 
                    disabled={logsConfig.currentPage === totalPages}
                    onClick={() => {
                      setLogsConfig(prev => ({ ...prev, currentPage: prev.currentPage + 1 }));
                      window.scrollTo({ top: 1100, behavior: 'smooth' });
                    }}
                    className="p-3.5 px-8 rounded-2xl border border-slate-200 bg-white text-[10px] font-black uppercase tracking-widest disabled:opacity-30 hover:bg-slate-50 transition-all shadow-sm flex items-center gap-3"
                  >
                    Forward <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Audit Modal: Stock Matrix Justification */}
      {dashboardConfig.showStockDrilldown && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-3xl" onClick={() => setDashboardConfig(prev => ({ ...prev, showStockDrilldown: false }))}></div>
          <div className="relative bg-white w-full max-w-2xl rounded-[60px] overflow-hidden shadow-[0_50px_200px_rgba(0,0,0,0.3)] animate-in zoom-in-95 duration-500">
            <div className="p-16">
              <div className="flex justify-between items-center mb-14">
                <div>
                  <h3 className="text-4xl font-black tracking-tighter text-slate-900">Integrity Matrix</h3>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-3">Node-by-Node Status Audit</p>
                </div>
                <button onClick={() => setDashboardConfig(prev => ({ ...prev, showStockDrilldown: false }))} className="bg-slate-50 p-5 rounded-[2rem] text-slate-400 hover:text-slate-900 hover:scale-110 transition-all shadow-sm">
                   <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="space-y-10 max-h-[55vh] overflow-y-auto pr-3 hide-scrollbar">
                {Object.entries(stockMatrix).map(([depot, items]) => (
                  <div key={depot} className="p-12 rounded-[40px] bg-slate-50/50 border border-slate-100 shadow-sm">
                    <h4 className="text-[14px] font-black uppercase tracking-[0.25em] text-slate-900 mb-12 flex justify-between items-center">
                      {depot} Node <span className="text-[11px] font-black text-slate-300 uppercase tracking-widest">Live Audit Verified</span>
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {Object.entries(items).map(([sku, status]) => (
                        <div key={sku} className={`flex justify-between items-center p-8 rounded-[3rem] border transition-all hover:translate-y-[-4px] ${
                          status === InventoryStatus.IN ? 'bg-white border-slate-100 shadow-sm' : 
                          status === InventoryStatus.LOW ? 'bg-orange-50 border-orange-100 shadow-lg' : 'bg-rose-50 border-rose-100 shadow-lg'
                        }`}>
                          <span className="text-[14px] font-black text-slate-700 uppercase tracking-tight">{sku}</span>
                          <span className={`text-[11px] font-black px-6 py-2.5 rounded-full uppercase tracking-widest shadow-sm ${
                            status === InventoryStatus.IN ? 'bg-emerald-100 text-emerald-700' :
                            status === InventoryStatus.LOW ? 'bg-orange-500 text-white' : 'bg-rose-600 text-white'
                          }`}>
                            {status === InventoryStatus.IN ? 'Nominal' : status === InventoryStatus.LOW ? 'Critical' : 'Depleted'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-16 pt-14 border-t border-slate-100">
                 <p className="text-[12px] font-black text-slate-400 uppercase tracking-[0.3em] mb-10 text-center">Execution Logistics Priority</p>
                 <div className="flex gap-8">
                    <div className="flex-1 p-10 rounded-[4rem] bg-slate-900 text-white shadow-2xl relative group">
                      <p className="text-3xl font-black tracking-tighter">Cluster A</p>
                      <p className="text-[12px] text-white/30 font-black uppercase mt-4 tracking-widest">Immediate Refill Deployment</p>
                      <div className="absolute right-10 top-10 w-3 h-3 rounded-full bg-blue-500 animate-pulse"></div>
                    </div>
                    <div className="flex-1 p-10 rounded-[4rem] bg-slate-100 text-slate-900">
                      <p className="text-3xl font-black tracking-tighter">Passive</p>
                      <p className="text-[12px] text-slate-400 font-black uppercase mt-4 tracking-widest">Continuous Node Monitoring</p>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Vector Snapshot Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/10 backdrop-blur-2xl" onClick={() => setSelectedEvent(null)}></div>
          <div className="relative bg-white w-full max-w-lg rounded-[60px] overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-500">
            <div className="p-16">
              <div className="flex justify-between items-start mb-14">
                <div className="flex flex-col gap-3">
                  <h3 className="text-5xl font-black tracking-tighter text-slate-900">{selectedEvent.depot_id}</h3>
                  <p className="text-[13px] font-black text-slate-400 uppercase tracking-[0.3em] opacity-60">{selectedEvent.business_date}</p>
                </div>
                <EventBadge type={selectedEvent.operator_close ? 'CLOSED' : 'OPEN'} />
              </div>

              <div className="space-y-14">
                <div className="grid grid-cols-2 gap-8">
                  <div className="p-10 bg-slate-50/50 rounded-[3rem] border border-slate-100 shadow-inner">
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em] mb-4">Entry Vector</p>
                    <p className="text-4xl font-black tracking-tighter tabular-nums text-slate-900">{selectedEvent.opening_cash_cfa.toLocaleString()}</p>
                  </div>
                  <div className="p-10 bg-slate-50/50 rounded-[3rem] border border-slate-100 shadow-inner">
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em] mb-4">Gross Flow</p>
                    <p className="text-4xl font-black tracking-tighter tabular-nums text-slate-900">{(selectedEvent.cash_sales_cfa + selectedEvent.mobile_sales_cfa).toLocaleString()}</p>
                  </div>
                </div>

                {selectedEvent.restock_cash_used > 0 && (
                  <div className="bg-blue-600 p-12 rounded-[4rem] text-white shadow-2xl shadow-blue-200">
                    <p className="text-[12px] font-black text-white/30 uppercase tracking-[0.3em] mb-4">Node Re-Balanced</p>
                    <p className="text-5xl font-black tracking-tighter">−{selectedEvent.restock_cash_used.toLocaleString()} <span className="text-[14px] opacity-40">CFA</span></p>
                    <div className="mt-8 flex items-center justify-between border-t border-white/10 pt-6">
                      <p className="text-[12px] text-white/60 font-black uppercase tracking-widest">Replenish: {selectedEvent.restock_skus[0]}</p>
                      <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Verified 04.22</span>
                    </div>
                  </div>
                )}

                <div className="pt-14 border-t border-slate-100">
                  <div className="flex justify-between items-end">
                    <div className="flex flex-col gap-2">
                      <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest mb-2">Audit Settlement</p>
                      <p className="text-5xl font-black tracking-tighter text-slate-900 tabular-nums">{selectedEvent.closing_cash_physical?.toLocaleString() || '---'}</p>
                    </div>
                    <div className="text-right">
                       <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest mb-2">Delta Variance</p>
                       {(() => {
                         const expected = selectedEvent.opening_cash_cfa + selectedEvent.cash_sales_cfa - selectedEvent.restock_cash_used;
                         const delta = selectedEvent.closing_cash_physical - expected;
                         return (
                           <div className="flex flex-col items-end gap-4">
                              <p className={`text-4xl font-black tracking-tighter tabular-nums ${
                                delta < 0 ? 'text-rose-600' : delta > 0 ? 'text-emerald-600' : 'text-slate-900'
                              }`}>
                                {delta === 0 ? 'NOMINAL' : (delta > 0 ? `+${delta.toLocaleString()}` : delta.toLocaleString())}
                              </p>
                              {selectedEvent.variance_note && (
                                <div className="p-5 px-8 rounded-[2rem] bg-rose-50 border border-rose-100 text-[12px] font-black text-rose-600 italic tracking-tight shadow-sm max-w-[240px]">
                                   "{selectedEvent.variance_note}"
                                </div>
                              )}
                           </div>
                         );
                       })()}
                    </div>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setSelectedEvent(null)}
                className="w-full mt-16 py-7 bg-slate-900 text-white rounded-[2.5rem] text-[12px] font-black uppercase tracking-[0.4em] hover:bg-black transition-all active:scale-[0.98] shadow-2xl"
              >
                Seal Investigation
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="text-center mt-32 opacity-30 pb-20">
        <p className="text-[11px] font-black uppercase tracking-[1em] text-slate-500 italic">ELOWA • MISSION COMMAND • V3.1.2</p>
      </footer>
    </div>
  );
}