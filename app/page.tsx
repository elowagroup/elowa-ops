"use client";
import { createClient } from "./lib/supabase";
import React, { useState, useEffect, useMemo } from "react";

/* =====================
   CONSTANTS & TYPES
===================== */

const DEPOTS = ["Benardkope", "Adetikope"] as const;
const OPERATORS = ["Mohamed", "Mona", "Sarata"] as const;

type Depot = (typeof DEPOTS)[number];
type Operator = (typeof OPERATORS)[number];
type Lang = "EN" | "FR";
type Screen = "login" | "open" | "status" | "close" | "final";

type DepotDayState = "NOT_OPENED" | "OPENED" | "CLOSED";

type Inventory = {
  riceWhite: string;
  riceBrown: string;
  ricePerfumed: string;
  oil25: string;
  oil5: string;
  oil1: string;
  spaghetti: "IN" | "LOW" | "OUT";
};

type OpenData = {
  cash: string;
  inventory: Inventory;
  openedAt: Date | null;
};

type CloseData = {
  cash: string;
  mobile: string;
  closingCash: string;
  total: number;
  restockCash: string;
  restockSkus: string[];
  varianceNote: string;
  inventory: Inventory;
  closedAt: string;
};

function parsePgTimestamp(ts?: string | null): Date | null {
  if (!ts) return null;
  const iso = ts.replace(" ", "T").replace(/\+00(:00)?$/, "Z");
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

const DEFAULT_INVENTORY = (): Inventory => ({
  riceWhite: "",
  riceBrown: "",
  ricePerfumed: "",
  oil25: "",
  oil5: "",
  oil1: "",
  spaghetti: "IN",
});

/* =====================
   UI ATOMS
===================== */

const Notice: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-blue-100 border-l-4 border-blue-600 text-blue-900 text-sm p-4 rounded-r-xl font-semibold shadow-sm">
    {children}
  </div>
);

const Input: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}> = ({ label, value, onChange, type = "text" }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-xs uppercase tracking-wider font-extrabold text-slate-700">
      {label}
    </label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border-2 border-slate-300 bg-white px-4 py-2.5 text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all font-medium"
    />
  </div>
);

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T | null;
  options: readonly T[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs uppercase tracking-wider font-extrabold text-slate-700">
        {label}
      </label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value as T)}
        disabled={disabled}
        className="w-full rounded-xl border-2 border-slate-300 bg-white px-4 py-2.5 text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all font-medium disabled:bg-slate-100 disabled:cursor-not-allowed"
      >
        <option value="" disabled>
          Select Option
        </option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

const Button: React.FC<{
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "danger" | "secondary";
}> = ({ children, onClick, disabled, variant = "primary" }) => (
  <button
    disabled={disabled}
    onClick={onClick}
    className={`w-full rounded-xl py-3.5 font-black uppercase tracking-widest transition-all
      ${
        disabled
          ? "bg-slate-300 text-slate-500 cursor-not-allowed"
          : variant === "primary"
          ? "bg-slate-900 text-white hover:bg-black"
          : variant === "secondary"
          ? "bg-slate-200 text-slate-700 hover:bg-slate-300"
          : "bg-red-600 text-white hover:bg-red-700"
      }`}
  >
    {children}
  </button>
);

const InventoryInputs: React.FC<{
  inventory: Inventory;
  setInventory: (i: Inventory) => void;
}> = ({ inventory, setInventory }) => {
  const keys = [
    "riceWhite",
    "riceBrown",
    "ricePerfumed",
    "oil25",
    "oil5",
    "oil1",
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-4">
      {keys.map((k) => (
        <Input
          key={k}
          label={k.replace(/([A-Z])/g, " $1")}
          value={inventory[k]}
          onChange={(v) => setInventory({ ...inventory, [k]: v })}
          type="number"
        />
      ))}
      <div className="col-span-2">
        <Select
          label="Spaghetti Status"
          value={inventory.spaghetti}
          options={["IN", "LOW", "OUT"]}
          onChange={(v) => setInventory({ ...inventory, spaghetti: v })}
        />
      </div>
    </div>
  );
};

/* =====================
   MAIN PAGE
===================== */

export default function Page() {
  const supabase = useMemo(() => createClient(), []);
  const [lang, setLang] = useState<Lang>("EN");
  const [screen, setScreen] = useState<Screen>("login");

  const [depotStates, setDepotStates] = useState<Record<Depot, DepotDayState | null>>({
    Benardkope: null,
    Adetikope: null,
  });

  const [depot, setDepot] = useState<Depot | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [openData, setOpenData] = useState<OpenData | null>(null);

  const today = new Date().toLocaleDateString();
  const businessDate = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    const loadAllDepotStates = async () => {
      const states: Record<Depot, DepotDayState> = {
        Benardkope: "NOT_OPENED",
        Adetikope: "NOT_OPENED",
      };

      for (const d of DEPOTS) {
        const { data: openRow } = await supabase
          .from("depot_day_open")
          .select("id")
          .eq("depot_id", d)
          .eq("business_date", businessDate)
          .maybeSingle();

        if (!openRow) {
          states[d] = "NOT_OPENED";
          continue;
        }

        const { data: closeRow } = await supabase
          .from("depot_day_close")
          .select("id")
          .eq("depot_id", d)
          .eq("business_date", businessDate)
          .maybeSingle();

        states[d] = closeRow ? "CLOSED" : "OPENED";
      }

      setDepotStates(states);
    };

    loadAllDepotStates();
  }, [businessDate, supabase]);

  const loadDepotOpenData = async (selectedDepot: Depot) => {
    const { data } = await supabase
      .from("depot_day_open")
      .select("*")
      .eq("depot_id", selectedDepot)
      .eq("business_date", businessDate)
      .maybeSingle();

    if (data) {
      setOpenData({
        cash: String(data.opening_cash_cfa),
        inventory: data.opening_inventory as Inventory,
        openedAt: parsePgTimestamp(data.opened_at ?? data.created_at),
      });
    }
  };

  const handleDepotSelect = async (selectedDepot: Depot) => {
    setDepot(selectedDepot);
    setOpenData(null);

    const state = depotStates[selectedDepot];
    if (state === "OPENED") {
      await loadDepotOpenData(selectedDepot);
    }
  };

  const currentDepotState = depot ? depotStates[depot] : null;

  const getActionButton = () => {
    if (!depot || !operator) return null;

    switch (currentDepotState) {
      case "NOT_OPENED":
        return {
          label: lang === "EN" ? "Open Depot" : "Ouvrir le dépôt",
          action: () => setScreen("open"),
          disabled: false,
        };
      case "OPENED":
        return {
          label: lang === "EN" ? "Continue to Status" : "Voir le statut",
          action: () => setScreen("status"),
          disabled: false,
        };
      case "CLOSED":
        return {
          label: lang === "EN" ? "Depot Closed for Today" : "Dépôt fermé aujourd'hui",
          action: () => {},
          disabled: true,
        };
      default:
        return null;
    }
  };

  const actionButton = getActionButton();

  const backToLogin = () => {
    setScreen("login");
    setDepot(null);
    setOperator(null);
    setOpenData(null);
  };

  return (
    <main className="min-h-screen bg-slate-200 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-300">
        <header className="bg-slate-900 text-white p-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black tracking-tight">ELOWA OPS</h1>
            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
              Daily Operations
            </p>
          </div>
          <div className="flex gap-2">
            {screen !== "login" && (
              <button
                onClick={backToLogin}
                className="px-4 py-1.5 rounded-full border-2 border-slate-700 text-xs font-black uppercase tracking-widest hover:bg-slate-800"
              >
                ← Back
              </button>
            )}
            <button
              onClick={() => setLang(lang === "EN" ? "FR" : "EN")}
              className="px-4 py-1.5 rounded-full border-2 border-slate-700 text-xs font-black uppercase tracking-widest hover:bg-slate-800"
            >
              {lang === "EN" ? "FR" : "EN"}
            </button>
          </div>
        </header>

        <div className="p-8 space-y-8">
          {screen === "login" && (
            <section className="space-y-6">
              <Notice>
                {lang === "EN"
                  ? "Select your assigned depot and operator to begin."
                  : "Sélectionnez votre dépôt et opérateur."}
              </Notice>

              <div className="flex gap-2 flex-wrap">
                {DEPOTS.map((d) => {
                  const state = depotStates[d];
                  const color =
                    state === "CLOSED"
                      ? "bg-red-100 text-red-700 border-red-300"
                      : state === "OPENED"
                      ? "bg-green-100 text-green-700 border-green-300"
                      : "bg-slate-100 text-slate-600 border-slate-300";
                  const label =
                    state === "CLOSED"
                      ? "Closed"
                      : state === "OPENED"
                      ? "Open"
                      : "Not Opened";
                  return (
                    <span
                      key={d}
                      className={`text-[10px] font-bold px-3 py-1 rounded-full border ${color}`}
                    >
                      {d}: {label}
                    </span>
                  );
                })}
              </div>

              <Select
                label="Depot"
                value={depot}
                options={DEPOTS}
                onChange={handleDepotSelect}
              />
              <Select
                label="Operator"
                value={operator}
                options={OPERATORS}
                onChange={setOperator}
              />

              {actionButton && (
                <Button disabled={actionButton.disabled} onClick={actionButton.action}>
                  {actionButton.label}
                </Button>
              )}
            </section>
          )}

          {screen === "open" && depot && operator && (
            <OpenForm
              lang={lang}
              onSubmit={async (data) => {
                const { error } = await supabase.from("depot_day_open").insert({
                  depot_id: depot,
                  operator_name: operator,
                  business_date: businessDate,
                  opening_cash_cfa: Number(data.cash),
                  opening_inventory: data.inventory,
                });

                if (error) {
                  if (error.code === "23505") {
                    alert("This depot is already opened for today.");
                    setDepotStates((s) => ({ ...s, [depot]: "OPENED" }));
                    await loadDepotOpenData(depot);
                    setScreen("status");
                  } else {
                    alert("OPEN FAILED: " + error.message);
                  }
                  return;
                }

                setOpenData({
                  ...data,
                  openedAt: new Date(),
                });

                setDepotStates((s) => ({ ...s, [depot]: "OPENED" }));
                setScreen("status");
              }}
            />
          )}

          {screen === "status" && openData && depot && operator && (
            <section className="space-y-6">
              <div className="flex justify-between items-center">
                <span className="bg-green-600 text-white text-[10px] font-black px-3 py-1 rounded-full">
                  OPEN · REVIEWED ✓
                </span>
                <span className="text-xs font-bold text-slate-500">{today}</span>
              </div>

              <TruthBubble depot={depot} operator={operator} openData={openData} />

              <Button onClick={() => setScreen("close")}>
                {lang === "EN" ? "Close Depot" : "Fermer le dépôt"}
              </Button>
            </section>
          )}

          {screen === "close" && openData && depot && operator && (
            <CloseForm
              lang={lang}
              openData={openData}
              onSubmit={async (data) => {
                const { error } = await supabase.from("depot_day_close").insert({
                  depot_id: depot,
                  operator_name: operator,
                  business_date: businessDate,
                  cash_sales_total_cfa: Number(data.cash),
                  mobile_sales_total_cfa: Number(data.mobile),
                  closing_cash_cfa: Number(data.closingCash),
                  closing_inventory: data.inventory,
                  restock_cash_used: data.restockSkus.length
                    ? Number(data.restockCash)
                    : 0,
                  restock_skus: data.restockSkus,
                  variance_note: data.varianceNote || null,
                });

                if (error) {
                  if (error.code === "23505") {
                    alert("This depot is already closed for today.");
                    setDepotStates((s) => ({ ...s, [depot]: "CLOSED" }));
                    setScreen("final");
                  } else if (error.code === "23503") {
                    alert("Cannot close a depot that was not opened.");
                  } else {
                    alert("CLOSE FAILED: " + error.message);
                  }
                  return;
                }

                setDepotStates((s) => ({ ...s, [depot]: "CLOSED" }));
                setScreen("final");
              }}
            />
          )}

          {screen === "final" && (
            <section className="text-center py-12 space-y-6">
              <div className="w-24 h-24 bg-green-600 text-white rounded-full flex items-center justify-center mx-auto text-5xl font-black">
                ✓
              </div>
              <h2 className="text-3xl font-black text-slate-900">
                {lang === "EN" ? "Day Complete" : "Journée terminée"}
              </h2>
              <p className="text-sm text-slate-500 font-semibold">
                {depot} {lang === "EN" ? "is locked for today." : "est verrouillé pour aujourd'hui."}
              </p>
              <Button variant="secondary" onClick={backToLogin}>
                {lang === "EN" ? "Back to Login" : "Retour"}
              </Button>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

/* =====================
   SUB COMPONENTS
===================== */

const TruthBubble: React.FC<{
  depot: Depot;
  operator: Operator;
  openData: OpenData;
}> = ({ depot, operator, openData }) => {
  const formattedOpenedAt = openData.openedAt
    ? openData.openedAt.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";

  return (
    <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl border border-slate-700 space-y-4">
      <div className="flex justify-between border-b border-slate-700 pb-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-black">
            Depot / Operator
          </p>
          <p className="font-bold">
            {depot} · {operator}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-black">
            Opened At
          </p>
          <p className="font-bold">{formattedOpenedAt}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
      {Object.entries(openData.inventory).map(([k, v]) => (
        <div key={k} className="flex justify-between border-b border-slate-800 py-1">
          <span className="text-slate-300">{k.replace(/([A-Z])/g, " $1")}</span>
          <span className="font-bold text-blue-300">{v}</span>
        </div>
      ))}
      </div>

      <div className="pt-3 border-t border-slate-700 flex justify-between">
        <span className="text-xs uppercase tracking-widest text-slate-400 font-black">
          Opening Cash
        </span>
        <span className="text-2xl font-black">
          {openData.cash} <span className="text-blue-400 text-xs">CFA</span>
        </span>
      </div>
    </div>
  );
};

const OpenForm: React.FC<{
  lang: Lang;
  onSubmit: (d: { cash: string; inventory: Inventory }) => void;
}> = ({ lang, onSubmit }) => {
  const [cash, setCash] = useState("");
  const [inventory, setInventory] = useState<Inventory>(DEFAULT_INVENTORY());

  const valid = cash !== "" && Object.values(inventory).every((v) => v !== "");

  return (
    <section className="space-y-6">
      <h2 className="font-black text-2xl text-slate-900">
        {lang === "EN" ? "Opening Form" : "Ouverture"}
      </h2>

      <Input label="Opening Cash (CFA)" value={cash} onChange={setCash} type="number" />
      <InventoryInputs inventory={inventory} setInventory={setInventory} />

      <Button disabled={!valid} onClick={() => onSubmit({ cash, inventory })}>
        {lang === "EN" ? "Confirm Opening" : "Confirmer l'ouverture"}
      </Button>
    </section>
  );
};

const CloseForm: React.FC<{
  lang: Lang;
  openData: OpenData;
  onSubmit: (d: CloseData) => void;
}> = ({ lang, openData, onSubmit }) => {
  const [cash, setCash] = useState("");
  const [mobile, setMobile] = useState("");
  const [closingCash, setClosingCash] = useState("");
  const [restockCash, setRestockCash] = useState("");
  const [note, setNote] = useState("");
  const [inventory, setInventory] = useState<Inventory>(DEFAULT_INVENTORY());
  const [restockSelections, setRestockSelections] = useState<Record<string, boolean>>({});

  const total = Number(cash || 0) + Number(mobile || 0);
  const openingCashValue = Number(openData.cash || 0);

  const restockCandidates = useMemo(() => {
    const candidates: { key: keyof Inventory; open: string; close: string }[] = [];
    const numericKeys = [
      "riceWhite",
      "riceBrown",
      "ricePerfumed",
      "oil25",
      "oil5",
      "oil1",
    ] as const;

    numericKeys.forEach((key) => {
      const openValue = Number(openData.inventory[key] || 0);
      const closeValue = Number(inventory[key] || 0);
      if (Number.isFinite(openValue) && Number.isFinite(closeValue) && closeValue > openValue) {
        candidates.push({ key, open: String(openValue), close: String(closeValue) });
      }
    });

    const statusRank: Record<Inventory["spaghetti"], number> = {
      OUT: 0,
      LOW: 1,
      IN: 2,
    };
    const openStatus = openData.inventory.spaghetti;
    const closeStatus = inventory.spaghetti;
    if (statusRank[closeStatus] > statusRank[openStatus]) {
      candidates.push({ key: "spaghetti", open: openStatus, close: closeStatus });
    }

    return candidates;
  }, [inventory, openData]);

  useEffect(() => {
    setRestockSelections((prev) => {
      const next: Record<string, boolean> = {};
      restockCandidates.forEach((candidate) => {
        next[candidate.key] = prev[candidate.key] ?? true;
      });
      return next;
    });
  }, [restockCandidates]);

  const restockSkus = restockCandidates
    .filter((candidate) => restockSelections[candidate.key])
    .map((candidate) => candidate.key);
  const restockSelected = restockSkus.length > 0;
  const restockCostValue = restockSelected ? Number(restockCash || 0) : 0;
  const closingCashValue = Number(closingCash || 0);
  const expectedCash = openingCashValue + Number(cash || 0) - restockCostValue;
  const variance = closingCashValue - expectedCash;
  const netCashMovement = closingCashValue - openingCashValue;

  const valid =
    cash !== "" &&
    mobile !== "" &&
    closingCash !== "" &&
    Object.values(inventory).every((v) => v !== "") &&
    (!restockSelected || restockCash !== "");

  const formatSkuLabel = (key: string) => key.replace(/([A-Z])/g, " $1");

  return (
    <section className="space-y-6">
      <h2 className="font-black text-2xl text-slate-900">
        {lang === "EN" ? "Closing Form" : "Fermeture"}
      </h2>

      <div className="grid grid-cols-2 gap-4">
        <Input label="Cash Sales (CFA)" value={cash} onChange={setCash} type="number" />
        <Input label="Mobile Sales (CFA)" value={mobile} onChange={setMobile} type="number" />
      </div>

      <div className="bg-slate-100 rounded-xl p-4 flex justify-between items-center">
        <span className="text-xs uppercase tracking-widest font-black text-slate-500">
          Total Sales
        </span>
        <span className="text-xl font-black text-slate-900">
          {total.toLocaleString()} <span className="text-sm text-slate-500">CFA</span>
        </span>
      </div>

      <Input
        label="Closing Cash (CFA)"
        value={closingCash}
        onChange={setClosingCash}
        type="number"
      />

      <Input
        label={lang === "EN" ? "Notes (optional)" : "Notes (optionnel)"}
        value={note}
        onChange={setNote}
      />

      <InventoryInputs inventory={inventory} setInventory={setInventory} />

      {restockCandidates.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-widest text-amber-900">
              Restock Check
            </p>
            <span className="text-[10px] font-semibold text-amber-700">
              Increase detected vs opening
            </span>
          </div>
          <div className="grid gap-2">
            {restockCandidates.map((candidate) => (
              <label
                key={candidate.key}
                className="flex items-center justify-between rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-amber-900"
              >
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!restockSelections[candidate.key]}
                    onChange={(e) =>
                      setRestockSelections((prev) => ({
                        ...prev,
                        [candidate.key]: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 accent-amber-600"
                  />
                  <span className="font-semibold">{formatSkuLabel(candidate.key)}</span>
                </span>
                <span className="text-[10px] text-amber-700">
                  {candidate.open} → {candidate.close}
                </span>
              </label>
            ))}
          </div>
          {restockSelected && (
            <Input
              label="Total Restock Cost (CFA)"
              value={restockCash}
              onChange={setRestockCash}
              type="number"
            />
          )}
        </div>
      )}

      <div className="rounded-2xl bg-slate-900 text-white p-4 shadow-lg space-y-2">
        <div className="flex items-center justify-between text-xs uppercase tracking-widest text-slate-300 font-black">
          <span>Expected Cash</span>
          <span>{expectedCash.toLocaleString()} CFA</span>
        </div>
        <div className="flex items-center justify-between text-xs uppercase tracking-widest text-slate-300 font-black">
          <span>Closing Cash</span>
          <span>{closingCashValue.toLocaleString()} CFA</span>
        </div>
        <div className="flex items-center justify-between text-xs uppercase tracking-widest text-slate-300 font-black">
          <span>Variance</span>
          <span className={variance < 0 ? "text-rose-300" : "text-emerald-300"}>
            {variance >= 0 ? "+" : ""}
            {variance.toLocaleString()} CFA
          </span>
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span>Net cash movement</span>
          <span>{netCashMovement >= 0 ? "+" : ""}{netCashMovement.toLocaleString()} CFA</span>
        </div>
        <p className="text-[10px] text-slate-400">
          Expected = opening cash + cash sales − restock cost
        </p>
      </div>

      <Button
        disabled={!valid}
        onClick={() =>
          onSubmit({
            cash,
            mobile,
            closingCash,
            total,
            restockCash,
            restockSkus,
            varianceNote: note,
            inventory,
            closedAt: new Date().toLocaleTimeString(),
          })
        }
      >
        {lang === "EN" ? "Finalize Day" : "Finaliser"}
      </Button>
    </section>
  );
};
