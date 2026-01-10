/**
 * GOVERNANCE DASHBOARD
 *
 * This file should be BORING.
 *
 * It:
 * - Fetches raw data
 * - Computes signals
 * - Renders views
 *
 * It does NOT:
 * - Calculate metrics inline
 * - Map arrays into tables
 * - Conditionally render based on data shape
 */

"use client";

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '../lib/supabase';

// Signals
import {
  computeSystemHealth,
  computeTrustScore,
  computeSalesMomentum,
  computeInventorySignals,
  computeDepotCompliance,
  computeSystemCompliance,
  type SystemHealthInput,
  type TrustScoreInput,
  type DailySalesInput,
  type SKUInput,
  type ComplianceInput,
  type ComplianceEventInput,
} from './signals';

// Views
import { StatusView } from './views/StatusView';
import { PerformanceView } from './views/PerformanceView';
import { ComplianceView } from './views/ComplianceView';
import { InventoryView } from './views/InventoryView';

type ViewMode = 'STATUS' | 'PERFORMANCE' | 'COMPLIANCE' | 'INVENTORY';

// SKU Price mapping (TODO: Move to database table - Phase 5)
const SKU_PRICES: Record<string, number> = {
  riceWhite50kg: 25000,
  riceWhite25kg: 12500,
  riceBrown50kg: 27000,
  riceBrown25kg: 13500,
  ricePerfumed25kg: 15000,
  ricePerfumed5kg: 3500,
  oil25: 30000,
  oil5: 7500,
  oil1: 1800,
  spaghetti: 800,
};

const SKU_LABELS: Record<string, string> = {
  riceWhite50kg: 'Rice White 50kg',
  riceWhite25kg: 'Rice White 25kg',
  riceBrown50kg: 'Rice Brown 50kg',
  riceBrown25kg: 'Rice Brown 25kg',
  ricePerfumed25kg: 'Rice Perfumed 25kg',
  ricePerfumed5kg: 'Rice Perfumed 5kg',
  oil25: 'Oil 25L',
  oil5: 'Oil 5L',
  oil1: 'Oil 1L',
  spaghetti: 'Spaghetti',
};

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewMode>('STATUS');
  const [rawData, setRawData] = useState<any>(null);

  // Load raw data
  useEffect(() => {
    loadRawData();
  }, []);

  async function loadRawData() {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();

      const { data: stateData, error: stateError } = await supabase
        .from("depot_day_state")
        .select("*")
        .order("business_date", { ascending: false });

      const { data: closeData, error: closeError } = await supabase
        .from("depot_day_close")
        .select("*");

      const { data: openData, error: openError } = await supabase
        .from("depot_day_open")
        .select("*");

      if (stateError || closeError || openError) {
        throw new Error(stateError?.message || closeError?.message || openError?.message);
      }

      // Store raw data
      setRawData({
        state: stateData || [],
        close: closeData || [],
        open: openData || [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  // Compute all signals
  const signals = useMemo(() => {
    if (!rawData) return null;

    const today = new Date().toISOString().slice(0, 10);
    const latestDate = rawData.state[0]?.business_date || today;
    const latestDepots = rawData.state.filter((d: any) => d.business_date === latestDate);

    // Helper: Get cash review (5% tolerance)
    const getCashReview = (depot: any) => {
      const expected = depot.opening_cash_cfa + (depot.cash_sales_total_cfa || 0) - (depot.restock_cash_used || 0);
      const actual = depot.closing_cash_cfa || 0;
      const diff = Math.abs(actual - expected);
      const pct = expected > 0 ? (diff / expected) * 100 : 0;
      return pct > 5;
    };

    // Helper: Parse timestamp
    const parseTimestamp = (value?: string | null) => {
      if (!value) return null;
      const iso = value.replace(' ', 'T').replace(/\+00(:00)?$/, 'Z');
      const date = new Date(iso);
      return Number.isNaN(date.getTime()) ? null : date;
    };

    // 1. SYSTEM HEALTH SIGNAL
    const cashVarianceCount = latestDepots.filter((d: any) => {
      if (!d.operator_close) return false;
      return getCashReview(d);
    }).length;

    const closedDepots = latestDepots.filter((d: any) => d.operator_close).length;
    const missedOpens = latestDepots.filter((d: any) => !d.operator_open).length;

    const systemHealthInput: SystemHealthInput = {
      expectedDepots: 2, // Configure based on setup
      closedDepots,
      cashVarianceCount,
      missedOpens,
    };

    const systemHealth = computeSystemHealth(systemHealthInput);

    // 2. SALES MOMENTUM SIGNAL
    const dailySales: DailySalesInput[] = [];
    const salesByDate: Record<string, number> = {};

    rawData.state.forEach((d: any) => {
      if (!d.operator_close) return;

      const sales = (d.cash_sales_total_cfa || 0) + (d.mobile_sales_total_cfa || 0);
      salesByDate[d.business_date] = (salesByDate[d.business_date] || 0) + sales;
    });

    Object.entries(salesByDate).forEach(([date, sales]) => {
      dailySales.push({ date, sales });
    });

    const salesMomentum = computeSalesMomentum(dailySales);

    // 3. COMPLIANCE SIGNALS (per depot)
    const depotCompliance = latestDepots.map((depot: any) => {
      // Build historical events for this depot (last 30 days)
      const depotHistory = rawData.state
        .filter((d: any) => d.depot_id === depot.depot_id)
        .slice(0, 30);

      const events: ComplianceEventInput[] = depotHistory.map((d: any) => {
        // Find open/close metadata
        const openMeta = rawData.open.find((o: any) =>
          o.depot_id === d.depot_id && o.business_date === d.business_date
        );

        // Check if opened late (after 08:00)
        const openedAt = parseTimestamp(openMeta?.opened_at || openMeta?.created_at);
        const openedLate = openedAt ? openedAt.getHours() > 8 : false;

        return {
          date: d.business_date,
          openedLate,
          closed: Boolean(d.operator_close),
          hasVariance: d.operator_close ? getCashReview(d) : false,
        };
      });

      // Calculate trust score
      const lateOpens = events.filter(e => e.openedLate).length;
      const missedCloses = events.filter(e => !e.closed).length;
      const varianceDays = events.filter(e => e.hasVariance).length;
      const inactiveDays = 30 - events.length;

      const trustInput: TrustScoreInput = {
        lateOpens,
        missedCloses,
        varianceDays,
        inactiveDays,
      };

      const trustScore = computeTrustScore(trustInput);

      const complianceInput: ComplianceInput = {
        depotId: depot.depot_id,
        events,
      };

      return computeDepotCompliance(complianceInput, trustScore);
    });

    // 4. INVENTORY SIGNALS
    const inventorySignals: SKUInput[] = [];

    latestDepots.forEach((depot: any) => {
      const openMeta = rawData.open.find((o: any) =>
        o.depot_id === depot.depot_id && o.business_date === depot.business_date
      );
      const closeMeta = rawData.close.find((c: any) =>
        c.depot_id === depot.depot_id && c.business_date === depot.business_date
      );

      const openInv = openMeta?.opening_inventory || {};
      const closeInv = closeMeta?.closing_inventory || {};

      // Calculate delta for each SKU
      Object.keys({ ...openInv, ...closeInv }).forEach(sku => {
        const openQty = Number(openInv[sku]) || 0;
        const closeQty = Number(closeInv[sku]) || 0;
        const delta = closeQty - openQty;

        if (delta !== 0 && SKU_PRICES[sku]) {
          inventorySignals.push({
            sku,
            skuLabel: SKU_LABELS[sku] || sku,
            unitsDelta: delta,
            avgVelocity: 0, // TODO: Calculate from historical data
            estimatedUnitPrice: SKU_PRICES[sku],
          });
        }
      });
    });

    const topInventorySignals = computeInventorySignals(inventorySignals);

    // Calculate totals
    const lastCloseTotal = latestDepots
      .filter((d: any) => d.operator_close)
      .reduce((sum: number, d: any) => {
        return sum + (d.cash_sales_total_cfa || 0) + (d.mobile_sales_total_cfa || 0);
      }, 0);

    const compliance = computeSystemCompliance(
      latestDepots.length,
      latestDepots.filter((d: any) => d.operator_close).length
    );

    const exceptions = cashVarianceCount + missedOpens;

    return {
      systemHealth,
      lastCloseTotal,
      lastCloseDate: latestDate,
      compliance,
      exceptions,
      blockingIssues: {
        cashVariance: cashVarianceCount,
        notOpened: missedOpens,
      },
      salesMomentum,
      depotCompliance,
      inventorySignals: topInventorySignals,
      totalCashFlow: lastCloseTotal,
    };
  }, [rawData]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-700 border-t-emerald-500 rounded-full animate-spin"></div>
          <p className="text-xs font-bold text-slate-400 tracking-wider">
            LOADING SYSTEM...
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
        <div className="max-w-md w-full bg-rose-950 border border-rose-800 rounded-xl p-8">
          <h2 className="text-lg font-bold text-rose-400 mb-2">SYSTEM FAILURE</h2>
          <p className="text-sm text-rose-300 mb-4">{error}</p>
          <button
            onClick={loadRawData}
            className="w-full bg-rose-600 text-white py-3 px-4 rounded-lg font-bold text-sm hover:bg-rose-700"
          >
            RETRY CONNECTION
          </button>
        </div>
      </div>
    );
  }

  // No signals computed yet
  if (!signals) {
    return null;
  }

  // Main render
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Navigation */}
      <div className="border-b border-slate-800 bg-slate-900">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-white">GOVERNANCE SYSTEM</h1>
              <p className="text-xs text-slate-400 tracking-wider">
                ELOWA OPERATIONS
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div
                className={`h-3 w-3 rounded-full ${
                  signals.systemHealth === 'GREEN'
                    ? 'bg-emerald-500 animate-pulse'
                    : signals.systemHealth === 'AMBER'
                    ? 'bg-amber-500'
                    : 'bg-rose-500 animate-pulse'
                }`}
              />
              <span className="text-xs font-bold tracking-wider text-slate-300">
                SYSTEM {signals.systemHealth}
              </span>
            </div>
          </div>

          {/* View Selector */}
          <div className="flex gap-2">
            {(['STATUS', 'PERFORMANCE', 'COMPLIANCE', 'INVENTORY'] as ViewMode[]).map(
              (view) => (
                <button
                  key={view}
                  onClick={() => setActiveView(view)}
                  className={`px-4 py-2 text-xs font-bold tracking-wider rounded-lg transition-colors ${
                    activeView === view
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {view}
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* View Container */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {activeView === 'STATUS' && (
          <StatusView
            health={signals.systemHealth}
            lastCloseTotal={signals.lastCloseTotal}
            lastCloseDate={signals.lastCloseDate}
            compliance={signals.compliance}
            exceptions={signals.exceptions}
            blockingIssues={signals.blockingIssues}
          />
        )}

        {activeView === 'PERFORMANCE' && (
          <PerformanceView {...signals.salesMomentum} />
        )}

        {activeView === 'COMPLIANCE' && (
          <ComplianceView depots={signals.depotCompliance} />
        )}

        {activeView === 'INVENTORY' && (
          <InventoryView
            signals={signals.inventorySignals}
            totalCashFlow={signals.totalCashFlow}
          />
        )}
      </div>
    </div>
  );
}
