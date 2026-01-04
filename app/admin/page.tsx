"use client";
import { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { DepotDayEvent } from './types';
import { createClient } from '../lib/supabase';

/**
 * Executive Dashboard v1.2
 * Events, not deltas. Words, not symbols. Truth, not math.
 */

type DepotDayCloseRow = {
  depot_id: string;
  business_date: string;
  cash_sales_total_cfa: number | null;
  mobile_sales_total_cfa: number | null;
  closing_cash_cfa: number | null;
  operator_name?: string | null;
  variance_note?: string | null;
  closing_inventory?: Record<string, string> | null;
};

interface DepotDayStateRow {
  depot_id: string;
  business_date: string;
  opening_cash_cfa?: number | null;
  operator_open?: string | null;
  operator_close?: string | null;
  cash_variance_cfa?: number | null;
  cash_sales_total_cfa?: number | null;
  mobile_sales_total_cfa?: number | null;
  closing_cash_cfa?: number | null;
}

function convertSupabaseData(
  supabaseData: DepotDayStateRow[],
  closeMap: Map<string, DepotDayCloseRow>
): DepotDayEvent[] {
  return supabaseData.map(row => {
    const closeRow = closeMap.get(`${row.depot_id}__${row.business_date}`);
    return {
      depot_id: row.depot_id,
      business_date: row.business_date,
      opening_cash_cfa: row.opening_cash_cfa || 0,
      closing_cash_physical: row.closing_cash_cfa ?? closeRow?.closing_cash_cfa ?? 0,
      cash_sales_cfa: row.cash_sales_total_cfa ?? closeRow?.cash_sales_total_cfa ?? 0,
      mobile_sales_cfa: row.mobile_sales_total_cfa ?? closeRow?.mobile_sales_total_cfa ?? 0,
      restock_cash_used: 0,
      restock_skus: [],
      operator_open: row.operator_open ?? null,
      operator_close: row.operator_close ?? closeRow?.operator_name ?? null,
      variance_note: row.cash_variance_cfa ? `Variance: ${row.cash_variance_cfa} CFA` : closeRow?.variance_note || undefined,
      opening_inventory: [],
      closing_inventory: []
    };
  });
}

const CASH_REVIEW_TOLERANCE_PCT = 5;

const getTotalSales = (d: DepotDayEvent) => d.cash_sales_cfa + d.mobile_sales_cfa;
const getExpectedCash = (d: DepotDayEvent) => d.cash_sales_cfa - d.restock_cash_used;
const getCashReview = (d: DepotDayEvent) => {
  const expected = getExpectedCash(d);
  const actual = d.closing_cash_physical;
  const diff = Math.abs(actual - expected);
  const pct = expected > 0 ? (diff / expected) * 100 : 0;
  const needsReview = expected === 0 ? actual !== 0 : pct > CASH_REVIEW_TOLERANCE_PCT;
  return { expected, actual, diff, pct, needsReview };
};

const INVENTORY_LABELS: Record<string, string> = {
  riceWhite: 'Rice White',
  riceBrown: 'Rice Brown',
  ricePerfumed: 'Rice Perfumed',
  oil25: 'Oil 25L',
  oil5: 'Oil 5L',
  oil1: 'Oil 1L',
  spaghetti: 'Spaghetti'
};

const INVENTORY_ORDER = Object.keys(INVENTORY_LABELS);

const parseQty = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

export default function AdminPage() {
  const [data, setData] = useState<DepotDayEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showReviewItems, setShowReviewItems] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [inventoryMaps, setInventoryMaps] = useState<{
    open: Record<string, Record<string, string>>;
    close: Record<string, Record<string, string>>;
  }>({ open: {}, close: {} });
  const rowsPerPage = 8;

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseKey) {
        setError('Missing Supabase environment variables.');
        setLoading(false);
        return;
      }
      const supabase = createClient();
      try {
        const { data: supabaseData, error: supabaseError } = await supabase
          .from("depot_day_state")
          .select("*")
          .order("business_date", { ascending: false });

        const { data: closeData, error: closeError } = await supabase
          .from("depot_day_close")
          .select("depot_id,business_date,cash_sales_total_cfa,mobile_sales_total_cfa,closing_cash_cfa,operator_name,variance_note,closing_inventory");

        const { data: openData, error: openError } = await supabase
          .from("depot_day_open")
          .select("depot_id,business_date,opening_inventory");

        const loadError = supabaseError || closeError || openError;

        if (loadError) {
          setError(loadError.message);
        } else {
          const closeMap = new Map<string, DepotDayCloseRow>();
          const closeInventoryMap: Record<string, Record<string, string>> = {};
          const openInventoryMap: Record<string, Record<string, string>> = {};

          (closeData || []).forEach(row => {
            closeMap.set(`${row.depot_id}__${row.business_date}`, row);
            if (row.closing_inventory) {
              closeInventoryMap[`${row.depot_id}__${row.business_date}`] = row.closing_inventory;
            }
          });
          (openData || []).forEach(row => {
            if (row.opening_inventory) {
              openInventoryMap[`${row.depot_id}__${row.business_date}`] = row.opening_inventory;
            }
          });
          const convertedData = convertSupabaseData(supabaseData || [], closeMap);
          setData(convertedData);
          setInventoryMaps({ open: openInventoryMap, close: closeInventoryMap });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

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
    const totalSales = closedDepots.reduce((sum, d) => sum + getTotalSales(d), 0);

    let cashIssues = 0;
    closedDepots.forEach(d => {
      if (getCashReview(d).needsReview) cashIssues++;
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
        if (getCashReview(d).needsReview) {
          daysWithCashIssues.add(d.business_date);
        }
      }
    });

    const completedDays = Object.keys(closedByDate).length;

    // Calculate sales only from closed depots
    const closedDepotData = monthData.filter(d => d.operator_close);
    const totalSales = closedDepotData.reduce((sum, d) => sum + getTotalSales(d), 0);
    const avgSalesPerDay = completedDays > 0 ? totalSales / completedDays : 0;

    return {
      totalSales,
      completedDays,
      avgSalesPerDay,
      cashReviewDays: daysWithCashIssues.size
    };
  }, [data]);

  // SECTION 3B: YEAR TO DATE metrics
  const yearToDateMetrics = useMemo(() => {
    if (!data.length) return { totalSales: 0, completedDays: 0, avgSalesPerDay: 0, cashReviewDays: 0 };

    const now = new Date();
    const firstDayOfYear = new Date(now.getFullYear(), 0, 1);
    const yearData = data.filter(d => new Date(d.business_date) >= firstDayOfYear);

    const closedByDate: Record<string, boolean> = {};
    const daysWithCashIssues = new Set<string>();

    yearData.forEach(d => {
      if (d.operator_close) {
        closedByDate[d.business_date] = true;

        if (getCashReview(d).needsReview) {
          daysWithCashIssues.add(d.business_date);
        }
      }
    });

    const completedDays = Object.keys(closedByDate).length;
    const closedDepotData = yearData.filter(d => d.operator_close);
    const totalSales = closedDepotData.reduce((sum, d) => sum + getTotalSales(d), 0);
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

    const totalSales = lastMonthData.reduce((sum, d) => sum + getTotalSales(d), 0);
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
      const sales = getTotalSales(d);
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
        const sales = getTotalSales(d);
        dailyRecords[d.business_date].sales += sales;

        // Check for cash issues
        if (getCashReview(d).needsReview) {
          dailyRecords[d.business_date].needsReview.push(d.depot_id);
        }
      }
    });

    return Object.values(dailyRecords).sort((a, b) => b.date.localeCompare(a.date));
  }, [data]);

  const rolling5DayAvgByDate = useMemo(() => {
    const ascRecords = [...allDailyRecords].sort((a, b) => a.date.localeCompare(b.date));
    const avgByDate: Record<string, number> = {};
    const window: number[] = [];

    ascRecords.forEach(record => {
      window.push(record.sales);
      if (window.length > 5) window.shift();
      const avg = window.reduce((sum, value) => sum + value, 0) / window.length;
      avgByDate[record.date] = avg;
    });

    return avgByDate;
  }, [allDailyRecords]);

  const lastFiveDayTrends = useMemo(() => {
    const recent = allDailyRecords.slice(0, 5);
    if (recent.length === 0) {
      return { total: 0, avg: 0, best: null, worst: null, rows: [] };
    }

    const total = recent.reduce((sum, record) => sum + record.sales, 0);
    const avg = total / recent.length;
    const best = recent.reduce((acc, record) => (record.sales > acc.sales ? record : acc), recent[0]);
    const worst = recent.reduce((acc, record) => (record.sales < acc.sales ? record : acc), recent[0]);

    return {
      total,
      avg,
      best,
      worst,
      rows: recent.map((record, idx) => {
        const prev = recent[idx + 1];
        const delta = prev ? record.sales - prev.sales : 0;
        const deltaPct = prev && prev.sales > 0 ? (delta / prev.sales) * 100 : null;

        return {
          ...record,
          delta,
          deltaPct,
          rollingAvg: rolling5DayAvgByDate[record.date] ?? record.sales
        };
      })
    };
  }, [allDailyRecords, rolling5DayAvgByDate]);

  const activityLog = useMemo(() => {
    return allDailyRecords.slice(0, 5).map(record => {
      const needsReview = record.needsReview.length > 0;
      return {
        date: record.date,
        status: needsReview ? 'Cash review' : 'Balanced close',
        detail: `${record.closedDepots}/${record.totalDepots} depots closed - ${record.sales.toLocaleString()} CFA`,
        tone: needsReview ? 'warn' : 'ok'
      };
    });
  }, [allDailyRecords]);

  // SECTION 6C: Inventory insights (last completed day)
  const inventoryInsights = useMemo(() => {
    const depotEvents: {
      depot: string;
      changes: { sku: string; open: string; close: string; delta: number | null }[];
    }[] = [];

    let totalSkus = 0;
    let totalChanges = 0;
    let restocked = 0;
    let depleted = 0;
    let statusChanges = 0;

    lastCompletedDay.depots.forEach(d => {
      const key = `${d.depot_id}__${d.business_date}`;
      const openInv = inventoryMaps.open[key];
      const closeInv = inventoryMaps.close[key];

      if (!openInv || !closeInv) return;

      const preferredKeys = INVENTORY_ORDER.filter(k => openInv[k] !== undefined || closeInv[k] !== undefined);
      const keys = preferredKeys.length
        ? preferredKeys
        : Array.from(new Set([...Object.keys(openInv), ...Object.keys(closeInv)]));

      totalSkus += keys.length;

      const changes: { sku: string; open: string; close: string; delta: number | null }[] = [];

      keys.forEach(sku => {
        const openVal = openInv[sku];
        const closeVal = closeInv[sku];
        const openNum = parseQty(openVal);
        const closeNum = parseQty(closeVal);

        if (openNum !== null && closeNum !== null) {
          if (openNum !== closeNum) {
            const delta = closeNum - openNum;
            if (delta > 0) restocked++;
            if (delta < 0) depleted++;
            totalChanges++;
            changes.push({
              sku,
              open: String(openNum),
              close: String(closeNum),
              delta
            });
          }
          return;
        }

        if (openVal !== undefined && closeVal !== undefined && String(openVal) !== String(closeVal)) {
          statusChanges++;
          totalChanges++;
          changes.push({
            sku,
            open: String(openVal),
            close: String(closeVal),
            delta: null
          });
        }
      });

      if (changes.length > 0) {
        depotEvents.push({ depot: d.depot_id, changes });
      }
    });

    return {
      summary: {
        totalSkus,
        totalChanges,
        restocked,
        depleted,
        statusChanges,
        depotsWithInventory: depotEvents.length
      },
      depotEvents
    };
  }, [inventoryMaps, lastCompletedDay]);

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
        // Check for cash mismatches (cash sales vs closing cash)
        const review = getCashReview(d);
        const diff = review.actual - review.expected;
        if (review.needsReview) {
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

  const totalPages = Math.max(1, Math.ceil(allDailyRecords.length / rowsPerPage));

  const pagedRecords = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return allDailyRecords.slice(start, start + rowsPerPage);
  }, [allDailyRecords, currentPage, rowsPerPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

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
    <div className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100 text-slate-900">
      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-10 rounded-2xl border border-slate-200/70 bg-white/80 backdrop-blur px-6 py-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.3em] text-slate-400">ELOWA OPERATIONS</p>
              <h1 className="text-3xl font-semibold text-slate-900">Executive Dashboard</h1>
              <p className="text-sm text-slate-500">Cash and mobile totals combined by day</p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-xs text-slate-400">Last close</p>
              <p className="text-sm font-semibold text-slate-900">{lastCompletedDateFormatted || 'No date'}</p>
            </div>
          </div>
        </div>

        {/* SECTION 0: ALL DEPOTS SALES PULSE */}
        <section className="mb-12">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="text-[11px] font-semibold tracking-[0.25em] text-slate-500">ALL DEPOTS SALES PULSE</h2>
              <p className="text-sm text-slate-500">Last 5 business days (closed depots only)</p>
            </div>
            <p className="text-xs text-slate-400">Auto-aggregated</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs text-slate-500">Total sales (last 5 days)</p>
                  <p className="text-3xl font-semibold text-slate-900">
                    {lastFiveDayTrends.total.toLocaleString()} CFA
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs text-slate-500">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">5 day avg</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {Math.round(lastFiveDayTrends.avg).toLocaleString()} CFA
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Best day</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {lastFiveDayTrends.best
                        ? new Date(lastFiveDayTrends.best.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : '—'}
                    </p>
                    {lastFiveDayTrends.best && (
                      <p className="text-xs text-slate-500">
                        {lastFiveDayTrends.best.sales.toLocaleString()} CFA
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Low day</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {lastFiveDayTrends.worst
                        ? new Date(lastFiveDayTrends.worst.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : '—'}
                    </p>
                    {lastFiveDayTrends.worst && (
                      <p className="text-xs text-slate-500">
                        {lastFiveDayTrends.worst.sales.toLocaleString()} CFA
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Last close</p>
                    <p className="text-sm font-semibold text-slate-900">{lastCompletedDateFormatted || '—'}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs text-slate-500 mb-3">Total sales (last close)</p>
              <p className="text-3xl font-semibold text-slate-900">{daySummary.totalSales.toLocaleString()} CFA</p>
              <div className="mt-4 text-xs text-slate-500">
                <p>{daySummary.closedCount} / {daySummary.totalDepots} depots closed</p>
                <p>{daySummary.cashIssues === 0 ? 'No cash review flags' : `${daySummary.cashIssues} review flag${daySummary.cashIssues > 1 ? 's' : ''}`}</p>
              </div>
            </div>
          </div>
          <div className="mt-5 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-6 py-3 text-[11px] font-semibold tracking-[0.2em] text-slate-500">Day</th>
                  <th className="text-right px-6 py-3 text-[11px] font-semibold tracking-[0.2em] text-slate-500">Total Sales</th>
                  <th className="text-right px-6 py-3 text-[11px] font-semibold tracking-[0.2em] text-slate-500">Delta</th>
                  <th className="text-right px-6 py-3 text-[11px] font-semibold tracking-[0.2em] text-slate-500">5 Day Avg</th>
                  <th className="text-right px-6 py-3 text-[11px] font-semibold tracking-[0.2em] text-slate-500">Closed</th>
                  <th className="text-left px-6 py-3 text-[11px] font-semibold tracking-[0.2em] text-slate-500">Trend</th>
                </tr>
              </thead>
              <tbody>
                {lastFiveDayTrends.rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-6 text-sm text-slate-500">No recent days available.</td>
                  </tr>
                ) : (
                  lastFiveDayTrends.rows.map((record, idx) => {
                    const trendUp = record.delta > 0;
                    const trendDown = record.delta < 0;
                    const deltaLabel = record.delta === 0
                      ? '0'
                      : `${record.delta > 0 ? '+' : ''}${record.delta.toLocaleString()}`;
                    const deltaPctLabel = record.deltaPct === null
                      ? ''
                      : ` (${record.deltaPct >= 0 ? '+' : ''}${record.deltaPct.toFixed(1)}%)`;

                    return (
                      <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="px-6 py-3 text-sm text-slate-900">
                          {new Date(record.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="px-6 py-3 text-sm text-right font-semibold text-slate-900">
                          {record.sales.toLocaleString()} CFA
                        </td>
                        <td className={`px-6 py-3 text-sm text-right font-semibold ${trendUp ? 'text-emerald-600' : trendDown ? 'text-rose-600' : 'text-slate-500'}`}>
                          {deltaLabel}{deltaPctLabel}
                        </td>
                        <td className="px-6 py-3 text-sm text-right text-slate-600">
                          {Math.round(record.rollingAvg).toLocaleString()} CFA
                        </td>
                        <td className="px-6 py-3 text-sm text-right text-slate-600">
                          {record.closedDepots} / {record.totalDepots}
                        </td>
                        <td className="px-6 py-3 text-sm text-slate-600">
                          <span className={`inline-flex items-center gap-2 rounded-full px-2 py-1 text-xs font-semibold ${
                            trendUp ? 'bg-emerald-50 text-emerald-700' : trendDown ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {trendUp ? 'Rising' : trendDown ? 'Falling' : 'Flat'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* SECTION 1: LAST COMPLETED BUSINESS DAY */}
        <section className="mb-12">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="text-[11px] font-semibold tracking-[0.25em] text-slate-500">LAST COMPLETED DAY</h2>
              <p className="text-sm text-slate-500">{lastCompletedDateFormatted || 'No date available'}</p>
            </div>
            <div className="text-xs text-slate-400">Per-depot close status</div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {lastCompletedDay.depots.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 text-sm text-slate-500">
                No data available
              </div>
            ) : (
              lastCompletedDay.depots.map((depot, idx) => {
                const recordedSales = getTotalSales(depot);
                const status = depot.operator_close ? 'CLOSED' : 'OPEN';

                let cashCheck = 'PENDING';
                if (depot.operator_close) {
                  const review = getCashReview(depot);
                  cashCheck = review.needsReview ? 'REQUIRES REVIEW' : 'BALANCED';
                }

                return (
                  <div key={idx} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">{depot.depot_id}</h3>
                        <p className="text-xs text-slate-500">Business day close</p>
                      </div>
                      <span className={`text-[10px] font-semibold px-3 py-1 rounded-full ${
                        status === 'CLOSED'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {status}
                      </span>
                    </div>
                    {status === 'CLOSED' ? (
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs text-slate-500">Recorded Sales</p>
                          <p className="text-2xl font-semibold text-slate-900">{recordedSales.toLocaleString()} CFA</p>
                        </div>
                        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <span className="text-xs text-slate-500">Cash review</span>
                          <span className={`text-xs font-semibold ${
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
          <div className="rounded-2xl bg-slate-950 text-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-[11px] font-semibold tracking-[0.25em] text-slate-400">DAY SUMMARY</h3>
              <p className="text-xs text-slate-400">Last close: {lastCompletedDateFormatted || 'No date'}</p>
            </div>
            <div className="grid gap-6 sm:grid-cols-3">
              <div>
                <p className="text-xs text-slate-400 mb-1">Total recorded sales</p>
                <p className="text-3xl font-semibold">{daySummary.totalSales.toLocaleString()} CFA</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">Depots closed</p>
                <p className="text-3xl font-semibold">{daySummary.closedCount} / {daySummary.totalDepots}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">Cash review flags</p>
                <p className="text-3xl font-semibold">{daySummary.cashIssues === 0 ? 'None' : `${daySummary.cashIssues} depot${daySummary.cashIssues > 1 ? 's' : ''}`}</p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2B: INVENTORY INSIGHTS */}
        <section className="mb-12">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="text-[11px] font-semibold tracking-[0.25em] text-slate-500">INVENTORY INSIGHTS</h2>
              <p className="text-sm text-slate-500">Changes captured between open and close</p>
            </div>
            <p className="text-xs text-slate-400">Last completed day</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-4 mb-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">SKUs tracked</p>
              <p className="text-xl font-semibold text-slate-900">{inventoryInsights.summary.totalSkus}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Changes captured</p>
              <p className="text-xl font-semibold text-slate-900">{inventoryInsights.summary.totalChanges}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Restocks</p>
              <p className="text-xl font-semibold text-slate-900">{inventoryInsights.summary.restocked}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Depletions</p>
              <p className="text-xl font-semibold text-slate-900">{inventoryInsights.summary.depleted}</p>
            </div>
          </div>

          {inventoryInsights.summary.statusChanges > 0 && (
            <p className="text-xs text-slate-500 mb-4">
              Status changes captured: {inventoryInsights.summary.statusChanges}
            </p>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            {inventoryInsights.depotEvents.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">No inventory changes captured for the last close.</div>
            ) : (
              inventoryInsights.depotEvents.map((depot, idx) => (
                <div key={idx} className="border-b border-slate-100 last:border-0 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{depot.depot}</p>
                      <p className="text-xs text-slate-500">
                        {depot.changes.length} change{depot.changes.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {depot.changes.map((change, changeIdx) => (
                      <div key={changeIdx} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-xs font-semibold text-slate-700">
                          {INVENTORY_LABELS[change.sku] || change.sku}
                        </p>
                        <p className="text-xs text-slate-500">
                          {change.open} to {change.close}
                          {change.delta !== null && (
                            <span className={`ml-2 font-semibold ${change.delta > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {change.delta > 0 ? `+${change.delta}` : change.delta}
                            </span>
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* SECTION 3: THIS MONTH */}
        <section className="mb-12">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="text-[11px] font-semibold tracking-[0.25em] text-slate-500">THIS MONTH</h2>
              <p className="text-sm text-slate-500">{new Date().toLocaleDateString('en-US', { month: 'long' })}</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Total recorded sales</p>
              <p className="text-xl font-semibold text-slate-900">{thisMonthMetrics.totalSales.toLocaleString()} CFA</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Completed days</p>
              <p className="text-xl font-semibold text-slate-900">{thisMonthMetrics.completedDays}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Avg sales per day</p>
              <p className="text-xl font-semibold text-slate-900">{Math.round(thisMonthMetrics.avgSalesPerDay).toLocaleString()} CFA</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Cash review days</p>
              <p className="text-xl font-semibold text-slate-900">{thisMonthMetrics.cashReviewDays}</p>
            </div>
          </div>
        </section>

        {/* SECTION 3B: YEAR TO DATE */}
        <section className="mb-12">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="text-[11px] font-semibold tracking-[0.25em] text-slate-500">YEAR TO DATE</h2>
              <p className="text-sm text-slate-500">{new Date().getFullYear()}</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Total recorded sales</p>
              <p className="text-xl font-semibold text-slate-900">{yearToDateMetrics.totalSales.toLocaleString()} CFA</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Completed days</p>
              <p className="text-xl font-semibold text-slate-900">{yearToDateMetrics.completedDays}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Avg sales per day</p>
              <p className="text-xl font-semibold text-slate-900">{Math.round(yearToDateMetrics.avgSalesPerDay).toLocaleString()} CFA</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Cash review days</p>
              <p className="text-xl font-semibold text-slate-900">{yearToDateMetrics.cashReviewDays}</p>
            </div>
          </div>
        </section>

        {/* SECTION 4: Month-over-month context */}
        {monthOverMonthChange !== null && (
          <section className="mb-12">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-600">
                vs last month: <span className={`font-semibold ${monthOverMonthChange >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {monthOverMonthChange >= 0 ? '+' : ''}{monthOverMonthChange.toFixed(1)}%
                </span>
              </p>
            </div>
          </section>
        )}

        {/* SECTION 5: RECORDED SALES HISTORY */}
        <section className="mb-12">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="text-[11px] font-semibold tracking-[0.25em] text-slate-500">RECORDED SALES HISTORY</h2>
              <p className="text-sm text-slate-500">Closed days only, cash + mobile</p>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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

        {/* SECTION 5B: ACTIVITY LOG */}
        <section className="mb-12">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="text-[11px] font-semibold tracking-[0.25em] text-slate-500">ACTIVITY LOG</h2>
              <p className="text-sm text-slate-500">Recent business days and review flags</p>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 shadow-sm">
            {activityLog.length === 0 ? (
              <div className="p-6">
                <p className="text-sm text-slate-500">No activity yet</p>
              </div>
            ) : (
              activityLog.map((item, idx) => (
                <div key={idx} className="p-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{item.status}</p>
                    <p className="text-xs text-slate-500 mt-1">{item.detail}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">
                      {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                    <span className={`inline-flex mt-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                      item.tone === 'warn' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* SECTION 6: DAILY CLOSING RECORDS */}
        <section className="mb-12">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="text-[11px] font-semibold tracking-[0.25em] text-slate-500">DAILY CLOSING RECORDS</h2>
              <p className="text-sm text-slate-500">Sales and cash review by business day</p>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-6 py-3 text-[11px] font-semibold tracking-[0.2em] text-slate-500">Business Day</th>
                  <th className="text-right px-6 py-3 text-[11px] font-semibold tracking-[0.2em] text-slate-500">Total Sales (CFA)</th>
                  <th className="text-right px-6 py-3 text-[11px] font-semibold tracking-[0.2em] text-slate-500">Closed Depots</th>
                  <th className="text-left px-6 py-3 text-[11px] font-semibold tracking-[0.2em] text-slate-500">Cash Review</th>
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
              className="w-full text-left bg-amber-50 border border-amber-200 rounded-2xl p-4 flex justify-between items-center hover:bg-amber-100"
            >
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <h2 className="text-[11px] font-semibold tracking-[0.2em] text-amber-900">ITEMS REQUIRING REVIEW</h2>
                  <p className="text-xs text-amber-700">{reviewItems.length} item{reviewItems.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <svg className={`w-5 h-5 text-amber-600 transition-transform ${showReviewItems ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showReviewItems && (
              <div className="mt-4 bg-white rounded-2xl border border-amber-200 p-6 space-y-3 shadow-sm">
                {reviewItems.map((item, idx) => (
                  <div key={idx} className="p-4 rounded-lg border border-amber-200 bg-amber-50">
                    <p className="text-sm font-bold text-amber-900">{item.depot} - {item.issue}</p>
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
