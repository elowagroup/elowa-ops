"use client";
import { createClient } from "../lib/supabase";
import React, { useState, useEffect } from "react";

type DepotDayState = {
  depot_id: string;
  business_date: string;
  state: string;
  opening_cash_cfa: number | null;
  closing_cash_cfa: number | null;
  cash_variance_cfa: number | null;
  operator_open: string | null;
  operator_close: string | null;
  cash_sales_total_cfa: number | null;
  mobile_sales_total_cfa: number | null;
};

export default function AdminPage() {
  const supabase = createClient();
  const [data, setData] = useState<DepotDayState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("depot_day_state")
        .select("*")
        .order("business_date", { ascending: false });

      if (error) {
        setError(error.message);
      } else {
        setData(data || []);
      }
      setLoading(false);
    };
    loadData();
  }, []);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayData = data.filter((d) => d.business_date === todayStr);
  const totalSalesToday = todayData.reduce(
    (sum, d) => sum + (d.cash_sales_total_cfa || 0) + (d.mobile_sales_total_cfa || 0),
    0
  );

  return (
    <main className="min-h-screen bg-slate-200 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-300">
          <header className="bg-slate-900 text-white p-6 flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-black tracking-tight">ELOWA ADMIN</h1>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Operations Dashboard</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Today</p>
              <p className="font-bold">{new Date().toLocaleDateString()}</p>
            </div>
          </header>

          <div className="p-6 space-y-6">
            {error && (
              <div className="bg-red-100 border-l-4 border-red-600 text-red-900 text-sm p-4 rounded-r-xl font-semibold">
                Error: {error}
              </div>
            )}

            {loading && (
              <div className="text-center py-12">
                <div className="inline-block w-8 h-8 border-4 border-slate-300 border-t-slate-900 rounded-full animate-spin"></div>
                <p className="mt-4 text-sm font-bold text-slate-500">Loading...</p>
              </div>
            )}

            {!loading && !error && (
              <>
                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-slate-900 text-white p-4 rounded-2xl">
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-black">Sales Today</p>
                    <p className="text-2xl font-black mt-1">{totalSalesToday.toLocaleString()}</p>
                    <p className="text-xs text-slate-400">CFA</p>
                  </div>
                  <div className="bg-slate-900 text-white p-4 rounded-2xl">
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-black">Open</p>
                    <p className="text-2xl font-black mt-1">{todayData.filter(d => d.state === "OPENED").length}</p>
                    <p className="text-xs text-slate-400">Depots</p>
                  </div>
                  <div className="bg-slate-900 text-white p-4 rounded-2xl">
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-black">Closed</p>
                    <p className="text-2xl font-black mt-1">{todayData.filter(d => d.state === "CLOSED").length}</p>
                    <p className="text-xs text-slate-400">Depots</p>
                  </div>
                  <div className="bg-slate-900 text-white p-4 rounded-2xl">
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-black">Total Records</p>
                    <p className="text-2xl font-black mt-1">{data.length}</p>
                    <p className="text-xs text-slate-400">All time</p>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b-2 border-slate-200">
                        <th className="text-left text-[10px] uppercase tracking-widest font-black text-slate-500 py-3 px-2">Depot</th>
                        <th className="text-left text-[10px] uppercase tracking-widest font-black text-slate-500 py-3 px-2">Date</th>
                        <th className="text-left text-[10px] uppercase tracking-widest font-black text-slate-500 py-3 px-2">State</th>
                        <th className="text-right text-[10px] uppercase tracking-widest font-black text-slate-500 py-3 px-2">Opening</th>
                        <th className="text-right text-[10px] uppercase tracking-widest font-black text-slate-500 py-3 px-2">Closing</th>
                        <th className="text-left text-[10px] uppercase tracking-widest font-black text-slate-500 py-3 px-2">Opened By</th>
                        <th className="text-left text-[10px] uppercase tracking-widest font-black text-slate-500 py-3 px-2">Closed By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-8 text-slate-500 font-medium">No records found</td>
                        </tr>
                      ) : (
                        data.map((row) => (
                          <tr key={`${row.depot_id}-${row.business_date}`} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-3 px-2 font-bold text-slate-900">{row.depot_id}</td>
                            <td className="py-3 px-2 text-sm text-slate-600">{row.business_date}</td>
                            <td className="py-3 px-2">
                              <span className={`text-[10px] font-black px-3 py-1 rounded-full ${
                                row.state === "CLOSED" ? "bg-green-600 text-white" :
                                row.state === "OPENED" ? "bg-amber-500 text-white" :
                                "bg-slate-400 text-white"
                              }`}>
                                {row.state}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-right font-medium text-slate-900">
                              {row.opening_cash_cfa?.toLocaleString() || "—"}
                            </td>
                            <td className="py-3 px-2 text-right font-medium text-slate-900">
                              {row.closing_cash_cfa?.toLocaleString() || "—"}
                            </td>
                            <td className="py-3 px-2 text-sm text-slate-600">{row.operator_open || "—"}</td>
                            <td className="py-3 px-2 text-sm text-slate-600">{row.operator_close || "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}