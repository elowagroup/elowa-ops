"use client";
import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { DepotDayEvent } from './types';
import { EventBadge } from './components/StatusBadge';
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

interface DepotDayOpenRow {
  depot_id: string;
  business_date: string;
  opening_inventory?: Record<string, string> | null;
  operator_name?: string | null;
  opened_at?: string | null;
}

interface DepotDayCloseMetaRow {
  depot_id: string;
  business_date: string;
  operator_name?: string | null;
  closed_at?: string | null;
}

type DepotSummary = {
  depotId: string;
  closingStatus: 'OPEN' | 'CLOSED';
  recordedSales: number;
  openingCash: number;
  closingCash: number;
  operator: string;
  varianceNote?: string;
  cashReviewLabel: string;
  cashReviewTone: 'emerald' | 'amber' | 'slate';
  businessDate: string;
};

type DepotEvent = {
  id: string;
  type: 'OPEN' | 'CLOSE' | 'NOT_OPENED';
  depotId: string;
  operator: string | null;
  businessDate: string;
  timestamp: Date | null;
  openingCash?: number;
  closingCash?: number;
  sales?: number;
  cashReviewLabel?: string;
  varianceNote?: string;
  inventory?: Record<string, string> | null;
};

type DepotStatus = 'OPEN' | 'CLOSED' | 'NOT_OPENED';

type CurrentStatusCard = {
  depotId: string;
  status: DepotStatus;
  operator: string | null;
  openedAt: Date | null;
  closedAt: Date | null;
  openingCash: number;
  closingCash: number;
  sales: number;
  cashReviewLabel: string | null;
  varianceNote?: string;
  openingInventory: Record<string, string> | null;
  closingInventory: Record<string, string> | null;
};

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
const getExpectedCash = (d: DepotDayEvent) =>
  d.opening_cash_cfa + d.cash_sales_cfa - d.restock_cash_used;
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

const parsePgTimestamp = (value?: string | null) => {
  if (!value) return null;
  const iso = value.replace(' ', 'T').replace(/\+00(:00)?$/, 'Z');
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatShortDate = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatShortTime = (value: Date | null) =>
  value
    ? value.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : '—';

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
  const [openMetaMap, setOpenMetaMap] = useState<Record<string, { openedAt: Date | null; operator: string | null }>>({});
  const [closeMetaMap, setCloseMetaMap] = useState<Record<string, { closedAt: Date | null; operator: string | null }>>({});
  const [selectedLastCloseDepot, setSelectedLastCloseDepot] = useState<string>('');
  const [showLastCloseSplit, setShowLastCloseSplit] = useState(false);
  const [filterDepot, setFilterDepot] = useState('All');
  const [filterOperator, setFilterOperator] = useState('All');
  const [filterRange, setFilterRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [expandedStatusDepot, setExpandedStatusDepot] = useState<string | null>(null);
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
          .select("depot_id,business_date,cash_sales_total_cfa,mobile_sales_total_cfa,closing_cash_cfa,operator_name,variance_note,closing_inventory,closed_at");

        const { data: openData, error: openError } = await supabase
          .from("depot_day_open")
          .select("depot_id,business_date,opening_inventory,operator_name,opened_at");

        const loadError = supabaseError || closeError || openError;

        if (loadError) {
          setError(loadError.message);
        } else {
          const closeMap = new Map<string, DepotDayCloseRow>();
          const closeInventoryMap: Record<string, Record<string, string>> = {};
          const openInventoryMap: Record<string, Record<string, string>> = {};
          const openMeta: Record<string, { openedAt: Date | null; operator: string | null }> = {};
          const closeMeta: Record<string, { closedAt: Date | null; operator: string | null }> = {};

          const closeRows = (closeData || []) as (DepotDayCloseRow & DepotDayCloseMetaRow)[];
          const openRows = (openData || []) as DepotDayOpenRow[];

          closeRows.forEach(row => {
            closeMap.set(`${row.depot_id}__${row.business_date}`, row);
            if (row.closing_inventory) {
              closeInventoryMap[`${row.depot_id}__${row.business_date}`] = row.closing_inventory;
            }
            closeMeta[`${row.depot_id}__${row.business_date}`] = {
              closedAt: parsePgTimestamp(row.closed_at),
              operator: row.operator_name ?? null
            };
          });
          openRows.forEach(row => {
            if (row.opening_inventory) {
              openInventoryMap[`${row.depot_id}__${row.business_date}`] = row.opening_inventory;
            }
            openMeta[`${row.depot_id}__${row.business_date}`] = {
              openedAt: parsePgTimestamp(row.opened_at),
              operator: row.operator_name ?? null
            };
          });
          const convertedData = convertSupabaseData(supabaseData || [], closeMap);
          setData(convertedData);
          setInventoryMaps({ open: openInventoryMap, close: closeInventoryMap });
          setOpenMetaMap(openMeta);
          setCloseMetaMap(closeMeta);
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
    return formatShortDate(lastCompletedDay.date);
  }, [lastCompletedDay.date]);

  const lastDayDepotSummaries = useMemo<DepotSummary[]>(() => {
    return lastCompletedDay.depots.map(depot => {
      const isClosed = Boolean(depot.operator_close);
      const cashReview = isClosed ? getCashReview(depot) : null;
      const reviewLabel = cashReview
        ? cashReview.needsReview
          ? 'REQUIRES REVIEW'
          : 'BALANCED'
        : 'PENDING';

      const reviewTone = reviewLabel === 'BALANCED'
        ? 'emerald'
        : reviewLabel === 'REQUIRES REVIEW'
        ? 'amber'
        : 'slate';

      return {
        depotId: depot.depot_id,
        closingStatus: isClosed ? 'CLOSED' : 'OPEN',
        recordedSales: getTotalSales(depot),
        openingCash: depot.opening_cash_cfa,
        closingCash: depot.closing_cash_physical,
        operator: depot.operator_close ?? depot.operator_open ?? 'Unknown',
        varianceNote: depot.variance_note,
        cashReviewLabel: reviewLabel,
        cashReviewTone: reviewTone,
        businessDate: depot.business_date
      };
    });
  }, [lastCompletedDay]);

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

  useEffect(() => {
    if (!selectedLastCloseDepot && lastDayDepotSummaries.length > 0) {
      setSelectedLastCloseDepot(lastDayDepotSummaries[0].depotId);
    }
  }, [lastDayDepotSummaries, selectedLastCloseDepot]);

  const headerDepotSummary = useMemo(() => {
    if (!lastDayDepotSummaries.length) return null;
    return lastDayDepotSummaries.find(summary => summary.depotId === selectedLastCloseDepot) || lastDayDepotSummaries[0];
  }, [lastDayDepotSummaries, selectedLastCloseDepot]);

  const depotOptions = useMemo(() => {
    return Array.from(new Set(data.map(item => item.depot_id))).sort();
  }, [data]);

  const operatorOptions = useMemo(() => {
    const operators = new Set<string>();
    data.forEach(item => {
      if (item.operator_open) operators.add(item.operator_open);
      if (item.operator_close) operators.add(item.operator_close);
    });
    return Array.from(operators).sort();
  }, [data]);

  const lastCloseTotal = useMemo(() => {
    return lastDayDepotSummaries.reduce((sum, summary) => sum + summary.recordedSales, 0);
  }, [lastDayDepotSummaries]);

  const renderDepotSummaryContent = (summary: DepotSummary) => (
    <>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{summary.depotId}</h3>
          <p className="text-xs text-slate-500 uppercase tracking-[0.3em]">Business day close</p>
          <p className="text-xs text-slate-400">{formatShortDate(summary.businessDate)}</p>
        </div>
        <EventBadge type={summary.closingStatus} />
      </div>
      {summary.closingStatus === 'CLOSED' ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-slate-500">Recorded Sales</p>
              <p className="text-2xl font-semibold text-slate-900">
                {summary.recordedSales.toLocaleString()} CFA
              </p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Cash review</p>
              <p className={`text-sm font-semibold ${summary.cashReviewTone === 'emerald' ? 'text-emerald-600' : summary.cashReviewTone === 'amber' ? 'text-amber-600' : 'text-slate-400'}`}>
                {summary.cashReviewLabel}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">
                Closing cash vs opening cash + cash sales (mobile excluded)
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 text-sm text-slate-600">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Operator</p>
              <p className="font-semibold text-slate-900">{summary.operator}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Opening cash</p>
              <p className="font-semibold text-slate-900">{summary.openingCash.toLocaleString()} CFA</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Closing cash</p>
              <p className="font-semibold text-slate-900">{summary.closingCash.toLocaleString()} CFA</p>
            </div>
          </div>
          {summary.varianceNote && (
            <div className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {summary.varianceNote}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-400">Awaiting closure</p>
      )}
    </>
  );

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
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const recentData = data.filter(d => new Date(d.business_date) >= fourteenDaysAgo && d.operator_close);

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

  const lastFullWeekSummary = useMemo(() => {
    const now = new Date();
    const currentWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    const lastWeekStart = new Date(currentWeekStart);
    lastWeekStart.setDate(currentWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(currentWeekStart);
    lastWeekEnd.setDate(currentWeekStart.getDate() - 1);

    const weekRecords = allDailyRecords.filter(record => {
      const date = new Date(record.date);
      return date >= lastWeekStart && date <= lastWeekEnd;
    });

    return {
      totalSales: weekRecords.reduce((sum, record) => sum + record.sales, 0),
      start: lastWeekStart,
      end: lastWeekEnd,
      days: weekRecords.length
    };
  }, [allDailyRecords]);

  const currentWeekSummary = useMemo(() => {
    const now = new Date();
    const currentWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    const currentWeekEnd = new Date(currentWeekStart);
    currentWeekEnd.setDate(currentWeekStart.getDate() + 6);

    const weekRecords = allDailyRecords.filter(record => {
      const date = new Date(record.date);
      return date >= currentWeekStart && date <= currentWeekEnd;
    });

    return {
      totalSales: weekRecords.reduce((sum, record) => sum + record.sales, 0),
      start: currentWeekStart,
      end: currentWeekEnd,
      days: weekRecords.length
    };
  }, [allDailyRecords]);

  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const currentStatusCards = useMemo<CurrentStatusCard[]>(() => {
    return depotOptions.map(depotId => {
      const record = data.find(item => item.depot_id === depotId && item.business_date === todayKey);
      const key = `${depotId}__${todayKey}`;
      const openMeta = openMetaMap[key];
      const closeMeta = closeMetaMap[key];
      const status: DepotStatus = record?.operator_close
        ? 'CLOSED'
        : record?.operator_open
        ? 'OPEN'
        : 'NOT_OPENED';

      const cashReview = record && record.operator_close ? getCashReview(record) : null;

      return {
        depotId,
        status,
        operator: record?.operator_close ?? record?.operator_open ?? openMeta?.operator ?? closeMeta?.operator ?? null,
        openedAt: openMeta?.openedAt ?? null,
        closedAt: closeMeta?.closedAt ?? null,
        openingCash: record?.opening_cash_cfa ?? 0,
        closingCash: record?.closing_cash_physical ?? 0,
        sales: record ? getTotalSales(record) : 0,
        cashReviewLabel: cashReview ? (cashReview.needsReview ? 'REQUIRES REVIEW' : 'BALANCED') : null,
        varianceNote: record?.variance_note,
        openingInventory: inventoryMaps.open[key] ?? null,
        closingInventory: inventoryMaps.close[key] ?? null
      };
    });
  }, [data, depotOptions, openMetaMap, closeMetaMap, inventoryMaps, todayKey]);

  const currentStatusCounts = useMemo(() => {
    return currentStatusCards.reduce(
      (acc, card) => {
        acc[card.status] += 1;
        return acc;
      },
      { OPEN: 0, CLOSED: 0, NOT_OPENED: 0 } as Record<DepotStatus, number>
    );
  }, [currentStatusCards]);

  const activityEvents = useMemo<DepotEvent[]>(() => {
    const events: DepotEvent[] = [];

    data.forEach(item => {
      const key = `${item.depot_id}__${item.business_date}`;
      const openMeta = openMetaMap[key];
      const closeMeta = closeMetaMap[key];

      if (item.operator_open) {
        events.push({
          id: `${key}-open`,
          type: 'OPEN',
          depotId: item.depot_id,
          operator: openMeta?.operator ?? item.operator_open ?? null,
          businessDate: item.business_date,
          timestamp: openMeta?.openedAt ?? null,
          openingCash: item.opening_cash_cfa,
          inventory: inventoryMaps.open[key] ?? null
        });
      } else {
        events.push({
          id: `${key}-not-opened`,
          type: 'NOT_OPENED',
          depotId: item.depot_id,
          operator: null,
          businessDate: item.business_date,
          timestamp: null
        });
      }

      if (item.operator_close) {
        const cashReview = getCashReview(item);
        events.push({
          id: `${key}-close`,
          type: 'CLOSE',
          depotId: item.depot_id,
          operator: closeMeta?.operator ?? item.operator_close ?? null,
          businessDate: item.business_date,
          timestamp: closeMeta?.closedAt ?? null,
          closingCash: item.closing_cash_physical,
          sales: getTotalSales(item),
          cashReviewLabel: cashReview.needsReview ? 'REQUIRES REVIEW' : 'BALANCED',
          varianceNote: item.variance_note,
          inventory: inventoryMaps.close[key] ?? null
        });
      }
    });

    return events;
  }, [data, closeMetaMap, openMetaMap, inventoryMaps]);

  const filteredEvents = useMemo(() => {
    const now = new Date();
    const rangeStart = (() => {
      if (filterRange === '7d') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      if (filterRange === '30d') return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      if (filterRange === '90d') return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      return null;
    })();

    const filtered = activityEvents.filter(event => {
      if (filterDepot !== 'All' && event.depotId !== filterDepot) return false;
      if (filterOperator !== 'All' && event.operator !== filterOperator) return false;
      if (rangeStart) {
        const eventDate = event.timestamp ?? new Date(`${event.businessDate}T00:00:00`);
        if (eventDate < rangeStart) return false;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      const aDate = a.timestamp ?? new Date(`${a.businessDate}T00:00:00`);
      const bDate = b.timestamp ?? new Date(`${b.businessDate}T00:00:00`);
      return sortOrder === 'newest' ? bDate.getTime() - aDate.getTime() : aDate.getTime() - bDate.getTime();
    });
  }, [activityEvents, filterDepot, filterOperator, filterRange, sortOrder]);

  const eventStatusCounts = useMemo(() => {
    return filteredEvents.reduce(
      (acc, event) => {
        acc[event.type] += 1;
        return acc;
      },
      { OPEN: 0, CLOSE: 0, NOT_OPENED: 0 }
    );
  }, [filteredEvents]);

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
          <div className="flex flex-col gap-6">
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

            {headerDepotSummary && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.25em] text-slate-500">LAST COMPLETED DAY</p>
                    <p className="text-sm text-slate-500">{lastCompletedDateFormatted || 'No date available'}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="uppercase tracking-[0.2em] text-slate-400">Depot</span>
                    <select
                      value={selectedLastCloseDepot || headerDepotSummary.depotId}
                      onChange={(event) => setSelectedLastCloseDepot(event.target.value)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                    >
                      {lastDayDepotSummaries.map(summary => (
                        <option key={summary.depotId} value={summary.depotId}>
                          {summary.depotId}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  {renderDepotSummaryContent(headerDepotSummary)}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                  <span>Last close total: {lastCloseTotal.toLocaleString()} CFA</span>
                  <button
                    onClick={() => setShowLastCloseSplit(value => !value)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    {showLastCloseSplit ? 'Hide depot split' : 'View depot split'}
                  </button>
                </div>

                {showLastCloseSplit && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {lastDayDepotSummaries.map(summary => (
                      <div key={summary.depotId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        {renderDepotSummaryContent(summary)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* SECTION 0: WEEKLY PULSE */}
        <section className="mb-12">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="text-[11px] font-semibold tracking-[0.25em] text-slate-500">WEEKLY PULSE</h2>
              <p className="text-sm text-slate-500">This week, last week, and recent sales momentum</p>
            </div>
            <p className="text-xs text-slate-400">Sun-Sat summaries</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl bg-slate-950 text-white p-6 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">This week</p>
              <p className="text-3xl font-semibold mt-2">{currentWeekSummary.totalSales.toLocaleString()} CFA</p>
              <p className="text-xs text-slate-400 mt-2">
                {formatShortDate(currentWeekSummary.start)} - {formatShortDate(currentWeekSummary.end)}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Last week</p>
              <p className="text-2xl font-semibold text-slate-900 mt-2">{lastFullWeekSummary.totalSales.toLocaleString()} CFA</p>
              <p className="text-xs text-slate-500 mt-2">
                {formatShortDate(lastFullWeekSummary.start)} - {formatShortDate(lastFullWeekSummary.end)}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">5 day avg</p>
              <p className="text-2xl font-semibold text-slate-900 mt-2">
                {Math.round(lastFiveDayTrends.avg).toLocaleString()} CFA
              </p>
              <p className="text-xs text-slate-500 mt-2">Based on last 5 closed days</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Best day</p>
              <p className="text-lg font-semibold text-slate-900 mt-2">
                {lastFiveDayTrends.best
                  ? new Date(lastFiveDayTrends.best.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : '—'}
              </p>
              {lastFiveDayTrends.best && (
                <p className="text-xs text-slate-500 mt-1">{lastFiveDayTrends.best.sales.toLocaleString()} CFA</p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Worst day</p>
              <p className="text-lg font-semibold text-slate-900 mt-2">
                {lastFiveDayTrends.worst
                  ? new Date(lastFiveDayTrends.worst.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : '—'}
              </p>
              {lastFiveDayTrends.worst && (
                <p className="text-xs text-slate-500 mt-1">{lastFiveDayTrends.worst.sales.toLocaleString()} CFA</p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Last close total</p>
              <p className="text-2xl font-semibold text-slate-900 mt-2">{lastCloseTotal.toLocaleString()} CFA</p>
              <p className="text-xs text-slate-500 mt-2">Last completed business day</p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
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

        {/* SECTION 1: CURRENT OPERATIONS */}
        <section className="mb-12">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="text-[11px] font-semibold tracking-[0.25em] text-slate-500">CURRENT OPERATIONS</h2>
              <p className="text-sm text-slate-500">Status snapshot for {formatShortDate(todayKey)}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">Open: {currentStatusCounts.OPEN}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">Closed: {currentStatusCounts.CLOSED}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">Not opened: {currentStatusCounts.NOT_OPENED}</span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {currentStatusCards.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
                No current status data yet.
              </div>
            ) : (
              currentStatusCards.map(card => {
                const isExpanded = expandedStatusDepot === card.depotId;
                const statusClasses = card.status === 'OPEN'
                  ? 'bg-emerald-100 text-emerald-700'
                  : card.status === 'CLOSED'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-slate-100 text-slate-500';
                const inventoryEntries = card.status === 'CLOSED'
                  ? card.closingInventory
                    ? INVENTORY_ORDER.filter(key => card.closingInventory && card.closingInventory[key] !== undefined).map(key => ({
                        key,
                        value: card.closingInventory ? card.closingInventory[key] : ''
                      }))
                    : []
                  : card.openingInventory
                  ? INVENTORY_ORDER.filter(key => card.openingInventory && card.openingInventory[key] !== undefined).map(key => ({
                      key,
                      value: card.openingInventory ? card.openingInventory[key] : ''
                    }))
                  : [];

                return (
                  <div key={card.depotId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Current status</p>
                        <h3 className="text-lg font-semibold text-slate-900">{card.depotId}</h3>
                        <p className="text-xs text-slate-500">Operator: {card.operator || 'Unassigned'}</p>
                      </div>
                      <span className={`text-[10px] font-semibold px-3 py-1 rounded-full ${statusClasses}`}>
                        {card.status === 'NOT_OPENED' ? 'NOT OPENED' : card.status}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-3 text-xs text-slate-500 sm:grid-cols-2">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Opened at</p>
                        <p className="text-sm font-semibold text-slate-900">{formatShortTime(card.openedAt)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Closed at</p>
                        <p className="text-sm font-semibold text-slate-900">{formatShortTime(card.closedAt)}</p>
                      </div>
                    </div>

                    {card.status !== 'NOT_OPENED' && (
                      <button
                        onClick={() => setExpandedStatusDepot(isExpanded ? null : card.depotId)}
                        className="mt-3 text-xs font-semibold text-slate-600 hover:text-slate-900"
                      >
                        {isExpanded ? 'Hide details' : 'View details'}
                      </button>
                    )}

                    {isExpanded && (
                      <div className="mt-4 space-y-4">
                        <div className="grid gap-3 sm:grid-cols-3 text-sm text-slate-600">
                          <div>
                            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Opening cash</p>
                            <p className="font-semibold text-slate-900">{card.openingCash.toLocaleString()} CFA</p>
                          </div>
                          {card.status === 'CLOSED' && (
                            <div>
                              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Closing cash</p>
                              <p className="font-semibold text-slate-900">{card.closingCash.toLocaleString()} CFA</p>
                            </div>
                          )}
                          {card.status === 'CLOSED' && (
                            <div>
                              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Recorded sales</p>
                              <p className="font-semibold text-slate-900">{card.sales.toLocaleString()} CFA</p>
                            </div>
                          )}
                        </div>

                        {card.cashReviewLabel && (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                            Cash review: <span className="font-semibold text-slate-900">{card.cashReviewLabel}</span>
                          </div>
                        )}

                        {inventoryEntries.length > 0 && (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                            <p className="text-xs text-slate-500 mb-2">
                              {card.status === 'CLOSED' ? 'Closing inventory' : 'Opening inventory'}
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2 text-xs text-slate-600">
                              {inventoryEntries.map(entry => (
                                <div key={entry.key} className="flex items-center justify-between border-b border-slate-200 py-1">
                                  <span>{INVENTORY_LABELS[entry.key] || entry.key}</span>
                                  <span className="font-semibold text-slate-900">{entry.value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {card.varianceNote && (
                          <div className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                            {card.varianceNote}
                          </div>
                        )}
                      </div>
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
            <p className="text-xs text-slate-400 mt-4">
              Cash review compares closing cash vs opening cash + cash sales (mobile excluded).
            </p>
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
              <p className="text-sm text-slate-500">Last 14 closed days, cash + mobile</p>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={salesHistoryChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                <Bar dataKey="sales" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* SECTION 5B: DEPOT EVENT STREAM */}
        <section className="mb-12">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="text-[11px] font-semibold tracking-[0.25em] text-slate-500">DEPOT EVENT STREAM</h2>
              <p className="text-sm text-slate-500">Open, close, and not-opened events with drilldowns</p>
            </div>
            <p className="text-xs text-slate-400">{filteredEvents.length} events</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm mb-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Depot</label>
                <select
                  value={filterDepot}
                  onChange={(event) => setFilterDepot(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  <option value="All">All depots</option>
                  {depotOptions.map(depot => (
                    <option key={depot} value={depot}>
                      {depot}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Operator</label>
                <select
                  value={filterOperator}
                  onChange={(event) => setFilterOperator(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  <option value="All">All operators</option>
                  {operatorOptions.map(operator => (
                    <option key={operator} value={operator}>
                      {operator}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Time range</label>
                <select
                  value={filterRange}
                  onChange={(event) => setFilterRange(event.target.value as '7d' | '30d' | '90d' | 'all')}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                  <option value="all">All time</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Sort</label>
                <select
                  value={sortOrder}
                  onChange={(event) => setSortOrder(event.target.value as 'newest' | 'oldest')}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">Open: {eventStatusCounts.OPEN}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">Closed: {eventStatusCounts.CLOSE}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">Not opened: {eventStatusCounts.NOT_OPENED}</span>
            </div>
          </div>

          <div className="space-y-3">
            {filteredEvents.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
                No events match the current filters.
              </div>
            ) : (
              filteredEvents.map(event => {
                const isExpanded = expandedEventId === event.id;
                const eventTime = event.timestamp
                  ? event.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                  : null;
                const badgeClasses = event.type === 'OPEN'
                  ? 'bg-emerald-100 text-emerald-700'
                  : event.type === 'CLOSE'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-amber-100 text-amber-700';
                const eventBorder = event.type === 'OPEN'
                  ? 'border-emerald-200'
                  : event.type === 'CLOSE'
                  ? 'border-blue-200'
                  : 'border-amber-200';
                const inventoryEntries = event.inventory
                  ? INVENTORY_ORDER.filter(key => event.inventory && event.inventory[key] !== undefined).map(key => ({
                      key,
                      value: event.inventory ? event.inventory[key] : ''
                    }))
                  : [];

                return (
                  <div key={event.id} className={`rounded-2xl border border-l-4 bg-white/90 p-4 shadow-sm ${eventBorder}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[11px] font-semibold tracking-[0.3em] text-slate-400">{event.type.replace('_', ' ')}</p>
                        <p className="text-lg font-semibold text-slate-900">{event.depotId}</p>
                        <p className="text-xs text-slate-500">
                          {formatShortDate(event.businessDate)}
                          {eventTime ? ` · ${eventTime}` : ''}
                        </p>
                      </div>
                      <span className={`text-[10px] font-semibold px-3 py-1 rounded-full ${badgeClasses}`}>
                        {event.type === 'OPEN' ? 'OPEN' : event.type === 'CLOSE' ? 'CLOSED' : 'NOT OPENED'}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                        Operator: {event.operator || 'Unassigned'}
                      </span>
                      {event.sales !== undefined && (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                          Sales: {event.sales.toLocaleString()} CFA
                        </span>
                      )}
                      {event.cashReviewLabel && (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                          Cash review: {event.cashReviewLabel}
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => setExpandedEventId(isExpanded ? null : event.id)}
                      className="mt-3 text-xs font-semibold text-slate-600 hover:text-slate-900"
                    >
                      {isExpanded ? 'Hide details' : 'View details'}
                    </button>

                    {isExpanded && (
                      <div className="mt-4 space-y-4">
                        <div className="grid gap-3 sm:grid-cols-3 text-sm text-slate-600">
                          {event.openingCash !== undefined && (
                            <div>
                              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Opening cash</p>
                              <p className="font-semibold text-slate-900">{event.openingCash.toLocaleString()} CFA</p>
                            </div>
                          )}
                          {event.closingCash !== undefined && (
                            <div>
                              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Closing cash</p>
                              <p className="font-semibold text-slate-900">{event.closingCash.toLocaleString()} CFA</p>
                            </div>
                          )}
                          {event.sales !== undefined && (
                            <div>
                              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Recorded sales</p>
                              <p className="font-semibold text-slate-900">{event.sales.toLocaleString()} CFA</p>
                            </div>
                          )}
                        </div>

                        {inventoryEntries.length > 0 && (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                            <p className="text-xs text-slate-500 mb-2">Inventory snapshot</p>
                            <div className="grid gap-2 sm:grid-cols-2 text-xs text-slate-600">
                              {inventoryEntries.map(entry => (
                                <div key={entry.key} className="flex items-center justify-between border-b border-slate-200 py-1">
                                  <span>{INVENTORY_LABELS[entry.key] || entry.key}</span>
                                  <span className="font-semibold text-slate-900">{entry.value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {event.varianceNote && (
                          <div className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                            {event.varianceNote}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
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
