"use client";
import { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { DepotDayEvent } from './types';
import { createClient } from '../lib/supabase';

/**
 * Executive Dashboard v1.2
 * Events, not deltas. Words, not symbols. Truth, not math.
 */

function convertSupabaseData(supabaseData: any[]): DepotDayEvent[] {
  return supabaseData.map(row => ({
    depot_id: row.depot_id,
    business_date: row.business_date,
    opening_cash_cfa: row.opening_cash_cfa || 0,
    closing_cash_physical: row.closing_cash_cfa || 0,
    cash_sales_cfa: row.cash_sales_total_cfa || 0,
    mobile_sales_cfa: row.mobile_sales_total_cfa || 0,
    restock_cash_used: 0,
    restock_skus: [],
    operator_open: row.operator_open,
    operator_close: row.operator_close,
    variance_note: row.cash_variance_cfa ? `Variance: ${row.cash_variance_cfa} CFA` : undefined,
    opening_inventory: [],
    closing_inventory: []
  }));
}

export default function AdminPage() {
  const [data, setData] = useState<DepotDayEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showReviewItems, setShowReviewItems] = useState(false);
  const supabase = createClient();

  const rowsPerPage = 25;

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: supabaseData, error: supabaseError } = await supabase
          .from("depot_day_state")
          .select("*")
          .order("business_date", { ascending: false });

        if (supabaseError) {
          setError(supabaseError.message);
        } else {
          const convertedData = convertSupabaseData(supabaseData || []);
          setData(convertedData);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [supabase]);

  // SECTION 1: LAST COMPLETED BUSINESS DAY
  const lastCompletedDay = useMemo(() => {
    if (!data.length) return { date: '', depots: [] };
    const latestDate = data[0].business_date;
    const depots = data.filter(d => d.business_date === latestDate);
    return { date: latestDate, depots };
  }, [data]);

  const lastCompletedDateFormatted = useMemo(() => {
    if (!lastCompletedDay.date) return '';
    const date = new Date(lastCompletedDay.date);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, [lastCompletedDay.date]);

  // SECTION 2: DAY SUMMARY
  const daySummary = useMemo(() => {
    const closedDepots = lastCompletedDay.depots.filter(d => d.operator_close);
    const totalSales = closedDepots.reduce((sum, d) => sum + d.cash_sales_cfa + d.mobile_sales_cfa, 0);

    let cashIssues = 0;
    closedDepots.forEach(d => {
      const expected = d.opening_cash_cfa + d.cash_sales_cfa - d.restock_cash_used;
      const actual = d.closing_cash_physical;
      const diff = Math.abs(actual - expected);
      const pct = expected > 0 ? (diff / expected) * 100 : 0;
      if (pct > 5) cashIssues++;
    });

    return {
      totalSales,
      closedCount: closedDepots.length,
      totalDepots: lastCompletedDay.depots.length,
      cashIssues
    };
  }, [lastCompletedDay]);

  // SECTION 3: THIS MONTH metrics
  const thisMonthMetrics = useMemo(() => {
    if (!data.length) return { totalSales: 0, completedDays: 0, avgSalesPerDay: 0, cashReviewDays: 0 };

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthData = data.filter(d => new Date(d.business_date) >= firstDayOfMonth);

    // Completed Day = at least one depot CLOSED on that date
    const closedByDate: Record<string, boolean> = {};
    const daysWithCashIssues = new Set<string>();

    monthData.forEach(d => {
      if (d.operator_close) {
        closedByDate[d.business_date] = true;

        // Check for cash issues
        const expected = d.opening_cash_cfa + d.cash_sales_cfa - d.restock_cash_used;
        const actual = d.closing_cash_physical;
        const diff = Math.abs(actual - expected);
        const pct = expected > 0 ? (diff / expected) * 100 : 0;
        if (pct > 5) {
          daysWithCashIssues.add(d.business_date);
        }
      }
    });

    const completedDays = Object.keys(closedByDate).length;

    // Calculate sales only from closed depots
    const closedDepotData = monthData.filter(d => d.operator_close);
    const totalSales = closedDepotData.reduce((sum, d) => sum + d.cash_sales_cfa + d.mobile_sales_cfa, 0);
    const avgSalesPerDay = completedDays > 0 ? totalSales / completedDays : 0;

    return {
      totalSales,
      completedDays,
      avgSalesPerDay,
      cashReviewDays: daysWithCashIssues.size
    };
  }, [data]);

  // SECTION 4: Previous month comparison
  const previousMonthSales = useMemo(() => {
    if (!data.length) return null;

    const now = new Date();
    const firstDayOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const lastMonthData = data.filter(d => {
      const date = new Date(d.business_date);
      return date >= firstDayOfLastMonth && date <= lastDayOfLastMonth && d.operator_close;
    });

    if (lastMonthData.length === 0) return null;

    const totalSales = lastMonthData.reduce((sum, d) => sum + d.cash_sales_cfa + d.mobile_sales_cfa, 0);
    return totalSales;
  }, [data]);

  const monthOverMonthChange = useMemo(() => {
    if (previousMonthSales === null || previousMonthSales === 0) return null;
    const change = ((thisMonthMetrics.totalSales - previousMonthSales) / previousMonthSales) * 100;
    return change;
  }, [thisMonthMetrics.totalSales, previousMonthSales]);

  // SECTION 5: Sales history chart (closed days only)
  const salesHistoryChart = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const recentData = data.filter(d => new Date(d.business_date) >= thirtyDaysAgo && d.operator_close);

    const dailyTotals: Record<string, number> = {};
    recentData.forEach(d => {
      const sales = d.cash_sales_cfa + d.mobile_sales_cfa;
      dailyTotals[d.business_date] = (dailyTotals[d.business_date] || 0) + sales;
    });

    const chartData = Object.keys(dailyTotals)
      .sort()
      .map(date => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        sales: dailyTotals[date]
      }));

    return chartData;
  }, [data]);

  // SECTION 6: Daily closing records (paginated)
  const allDailyRecords = useMemo(() => {
    const dailyRecords: Record<string, { date: string; sales: number; closedDepots: number; totalDepots: number; needsReview: string[] }> = {};

    data.forEach(d => {
      if (!dailyRecords[d.business_date]) {
        dailyRecords[d.business_date] = {
          date: d.business_date,
          sales: 0,
          closedDepots: 0,
          totalDepots: 0,
          needsReview: []
        };
      }

      dailyRecords[d.business_date].totalDepots++;

      if (d.operator_close) {
        dailyRecords[d.business_date].closedDepots++;
        const sales = d.cash_sales_cfa + d.mobile_sales_cfa;
        dailyRecords[d.business_date].sales += sales;

        // Check for cash issues
        const expected = d.opening_cash_cfa + d.cash_sales_cfa - d.restock_cash_used;
        const actual = d.closing_cash_physical;
        const diff = Math.abs(actual - expected);
        const pct = expected > 0 ? (diff / expected) * 100 : 0;
        if (pct > 5) {
          dailyRecords[d.business_date].needsReview.push(d.depot_id);
        }
      }
    });

    return Object.values(dailyRecords).sort((a, b) => b.date.localeCompare(a.date));
  }, [data]);

  const totalPages = Math.ceil(allDailyRecords.length / rowsPerPage);
  const pagedRecords = allDailyRecords.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  // SECTION 7: Items requiring review
  const reviewItems = useMemo(() => {
    const items: { depot: string; date: string; issue: string }[] = [];

    lastCompletedDay.depots.forEach(d => {
      // Check for unclosed depots
      if (!d.operator_close) {
        items.push({
          depot: d.depot_id,
          date: d.business_date,
          issue: 'Day not closed'
        });
      } else {
        // Check for cash mismatches
        const expected = d.opening_cash_cfa + d.cash_sales_cfa - d.restock_cash_used;
        const actual = d.closing_cash_physical;
        const diff = actual - expected;
        const pct = expected > 0 ? Math.abs(diff / expected) * 100 : 0;

        if (pct > 5) {
          items.push({
            depot: d.depot_id,
            date: d.business_date,
            issue: `Cash mismatch: ${diff >= 0 ? '+' : ''}${diff.toLocaleString()} CFA`
          });
        }
      }
    });

    return items;
  }, [lastCompletedDay]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin"></div>
        <p className="text-xs font-bold text-slate-400">Loading...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-white p-6">
      <div className="max-w-md w-full bg-rose-50 border border-rose-200 rounded-2xl p-8">
        <h2 className="text-lg font-bold text-rose-900 mb-2">Connection Error</h2>
        <p className="text-sm text-rose-700 mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="w-full bg-rose-600 text-white py-2 px-4 rounded-lg font-bold text-sm hover:bg-rose-700"
        >
          Retry
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">ELOWA Operations</h1>
          <p className="text-sm text-slate-500">Executive Dashboard</p>
        </div>

        {/* SECTION 1: LAST COMPLETED BUSINESS DAY */}
        <section className="mb-12">
          <h2 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wide">
            LAST COMPLETED DAY — {lastCompletedDateFormatted}
          </h2>
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            {lastCompletedDay.depots.length === 0 ? (
              <p className="text-sm text-slate-500">No data available</p>
            ) : (
              lastCompletedDay.depots.map((depot, idx) => {
                const recordedSales = depot.cash_sales_cfa + depot.mobile_sales_cfa;
                const status = depot.operator_close ? 'CLOSED' : 'OPEN';

                let cashCheck = 'PENDING';
                if (depot.operator_close) {
                  const expected = depot.opening_cash_cfa + depot.cash_sales_cfa - depot.restock_cash_used;
                  const actual = depot.closing_cash_physical;
                  const diff = Math.abs(actual - expected);
                  const pct = expected > 0 ? (diff / expected) * 100 : 0;
                  cashCheck = pct <= 5 ? 'BALANCED' : 'REQUIRES REVIEW';
                }

                return (
                  <div key={idx} className="border border-slate-100 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-bold text-lg text-slate-900">{depot.depot_id}</h3>
                      <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                        status === 'CLOSED'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {status}
                      </span>
                    </div>
                    {status === 'CLOSED' ? (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Recorded Sales:</span>
                          <span className="font-bold text-slate-900">{recordedSales.toLocaleString()} CFA</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Cash Check:</span>
                          <span className={`font-bold ${
                            cashCheck === 'BALANCED'
                              ? 'text-emerald-600'
                              : cashCheck === 'REQUIRES REVIEW'
                              ? 'text-amber-600'
                              : 'text-slate-400'
                          }`}>
                            {cashCheck}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400">Awaiting closure</p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* SECTION 2: DAY SUMMARY */}
        <section className="mb-12">
          <div className="bg-slate-900 text-white rounded-xl p-6">
            <h3 className="text-xs font-bold text-slate-400 mb-4 uppercase tracking-wide">Day Summary</h3>
            <div className="grid grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-slate-400 mb-1">Total Recorded Sales</p>
                <p className="text-2xl font-bold">{daySummary.totalSales.toLocaleString()} CFA</p>
              </div>
              <div>
                <p className="text-sm text-slate-400 mb-1">Depots Closed</p>
                <p className="text-2xl font-bold">{daySummary.closedCount} / {daySummary.totalDepots}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400 mb-1">Cash Issues</p>
                <p className="text-2xl font-bold">{daySummary.cashIssues === 0 ? 'None' : `${daySummary.cashIssues} depot${daySummary.cashIssues > 1 ? 's' : ''}`}</p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3: THIS MONTH */}
        <section className="mb-12">
          <h2 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wide">
            THIS MONTH — {new Date().toLocaleDateString('en-US', { month: 'long' }).toUpperCase()}
          </h2>
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="grid grid-cols-4 gap-8">
              <div>
                <p className="text-xs text-slate-500 mb-1">Total Recorded Sales</p>
                <p className="text-xl font-bold text-slate-900">{thisMonthMetrics.totalSales.toLocaleString()}</p>
                <p className="text-xs text-slate-400">CFA</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Completed Days</p>
                <p className="text-xl font-bold text-slate-900">{thisMonthMetrics.completedDays}</p>
                <p className="text-xs text-slate-400">days</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Avg Sales per Day</p>
                <p className="text-xl font-bold text-slate-900">{Math.round(thisMonthMetrics.avgSalesPerDay).toLocaleString()}</p>
                <p className="text-xs text-slate-400">CFA</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Cash Review Days</p>
                <p className="text-xl font-bold text-slate-900">{thisMonthMetrics.cashReviewDays}</p>
                <p className="text-xs text-slate-400">days</p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 4: Month-over-month context */}
        {monthOverMonthChange !== null && (
          <section className="mb-12">
            <div className="bg-slate-100 rounded-xl p-4">
              <p className="text-xs text-slate-600">
                vs last month: <span className={`font-bold ${monthOverMonthChange >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {monthOverMonthChange >= 0 ? '+' : ''}{monthOverMonthChange.toFixed(1)}%
                </span>
              </p>
            </div>
          </section>
        )}

        {/* SECTION 5: RECORDED SALES HISTORY */}
        <section className="mb-12">
          <h2 className="text-sm font-bold text-slate-900 mb-2 uppercase tracking-wide">
            RECORDED SALES HISTORY
          </h2>
          <p className="text-xs text-slate-500 mb-4">Shows total sales recorded on days that fully closed</p>
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={salesHistoryChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
                />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: '600' }}
                  formatter={(v: number | undefined) => [(v || 0).toLocaleString() + ' CFA', 'Sales']}
                />
                <Area
                  type="monotone"
                  dataKey="sales"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#salesGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* SECTION 6: DAILY CLOSING RECORDS */}
        <section className="mb-12">
          <h2 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wide">
            DAILY CLOSING RECORDS
          </h2>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-6 py-3 text-xs font-bold text-slate-600">Business Day</th>
                  <th className="text-right px-6 py-3 text-xs font-bold text-slate-600">Total Sales (CFA)</th>
                  <th className="text-right px-6 py-3 text-xs font-bold text-slate-600">Closed Depots</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-slate-600">Cash Review</th>
                </tr>
              </thead>
              <tbody>
                {pagedRecords.map((record, idx) => (
                  <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-6 py-3 text-sm text-slate-900">
                      {new Date(record.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-3 text-sm text-right font-bold text-slate-900">
                      {record.sales.toLocaleString()}
                    </td>
                    <td className="px-6 py-3 text-sm text-right text-slate-600">
                      {record.closedDepots} / {record.totalDepots}
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-600">
                      {record.needsReview.length === 0 ? (
                        <span className="text-emerald-600 font-medium">None</span>
                      ) : (
                        <span className="text-amber-600 font-medium">{record.needsReview.join(', ')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="bg-slate-50 px-6 py-3 flex justify-between items-center border-t border-slate-200">
                <p className="text-xs text-slate-600">
                  Showing {((currentPage - 1) * rowsPerPage) + 1}-{Math.min(currentPage * rowsPerPage, allDailyRecords.length)} of {allDailyRecords.length}
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => p - 1)}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold disabled:opacity-30 hover:bg-slate-50"
                  >
                    Previous
                  </button>
                  <span className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => p + 1)}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold disabled:opacity-30 hover:bg-slate-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* SECTION 7: ITEMS REQUIRING REVIEW */}
        {reviewItems.length > 0 && (
          <section className="mb-12">
            <button
              onClick={() => setShowReviewItems(!showReviewItems)}
              className="w-full text-left bg-amber-50 border border-amber-200 rounded-xl p-4 flex justify-between items-center hover:bg-amber-100"
            >
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <h2 className="text-sm font-bold text-amber-900 uppercase tracking-wide">ITEMS REQUIRING REVIEW</h2>
                  <p className="text-xs text-amber-700">{reviewItems.length} item{reviewItems.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <svg className={`w-5 h-5 text-amber-600 transition-transform ${showReviewItems ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showReviewItems && (
              <div className="mt-4 bg-white rounded-xl border border-amber-200 p-6 space-y-3">
                {reviewItems.map((item, idx) => (
                  <div key={idx} className="p-4 rounded-lg border border-amber-200 bg-amber-50">
                    <p className="text-sm font-bold text-amber-900">{item.depot} — {item.issue}</p>
                    <p className="text-xs text-amber-700 mt-1">{new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
