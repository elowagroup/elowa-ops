"use client";
import { supabase } from "./lib/supabase";
import React, { useState, useEffect } from "react";

/* =====================
   CONSTANTS & TYPES
===================== */

const DEPOTS = ["Benardkope", "Adetikope"] as const;
const OPERATORS = ["Mohamed", "Mona", "Sarata"] as const;

type Depot = typeof DEPOTS[number];
type Operator = typeof OPERATORS[number];
type Lang = "EN" | "FR";
type Screen = "login" | "open" | "status" | "close" | "final";

/* === NEW (LOCK + STATUS) === */
type DayState = "LOADING" | "NOT_OPENED" | "OPENED" | "CLOSED";
/* ========================== */

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
  openedAt: string;
};

type CloseData = {
  cash: string;
  mobile: string;
  total: number;
  varianceNote: string;
  inventory: Inventory;
  closedAt: string;
};

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
   UI ATOMS (UNCHANGED)
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
}: {
  label: string;
  value: T | null;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs uppercase tracking-wider font-extrabold text-slate-700">
        {label}
      </label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full rounded-xl border-2 border-slate-300 bg-white px-4 py-2.5 text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all font-medium"
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
  variant?: "primary" | "danger";
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
  const [lang, setLang] = useState<Lang>("EN");
  const [screen, setScreen] = useState<Screen>("login");

  /* === NEW (LOCK + STATUS) === */
  const [dayState, setDayState] = useState<DayState>("LOADING");
  /* ========================== */

  const [depot, setDepot] = useState<Depot | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [openData, setOpenData] = useState<OpenData | null>(null);

  const today = new Date().toLocaleDateString();

  /* === NEW (LOCK + STATUS) === */
  useEffect(() => {
    const loadTodayState = async () => {
      const business_date = new Date().toISOString().slice(0, 10);

      const { data: openRow } = await supabase
        .from("depot_day_open")
        .select("id")
        .eq("business_date", business_date)
        .maybeSingle();

      if (!openRow) {
        setDayState("NOT_OPENED");
        setScreen("login");
        return;
      }

      const { data: closeRow } = await supabase
        .from("depot_day_close")
        .select("id")
        .eq("business_date", business_date)
        .maybeSingle();

      if (closeRow) {
        setDayState("CLOSED");
        setScreen("final");
        return;
      }

      setDayState("OPENED");
      setScreen("status");
    };

    loadTodayState();
  }, []);
  /* ========================== */

  return (
    <main className="min-h-screen bg-slate-200 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-300">
        {/* HEADER */}
        <header className="bg-slate-900 text-white p-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black tracking-tight">ELOWA OPS</h1>
            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
              Daily Operations
            </p>
          </div>
          <button
            onClick={() => setLang(lang === "EN" ? "FR" : "EN")}
            className="px-4 py-1.5 rounded-full border-2 border-slate-700 text-xs font-black uppercase tracking-widest hover:bg-slate-800"
          >
            {lang === "EN" ? "FR" : "EN"}
          </button>
        </header>

        <div className="p-8 space-y-8">
          {/* LOGIN */}
          {screen === "login" && (
            <section className="space-y-6">
              <Notice>
                {lang === "EN"
                  ? "Select your assigned depot and operator to begin."
                  : "Sélectionnez votre dépôt et opérateur."}
              </Notice>

              <Select label="Depot" value={depot} options={DEPOTS} onChange={setDepot} />
              <Select label="Operator" value={operator} options={OPERATORS} onChange={setOperator} />

              <Button
                disabled={!depot || !operator || dayState !== "NOT_OPENED"}
                onClick={() => setScreen("open")}
              >
                {dayState === "NOT_OPENED"
                  ? lang === "EN"
                    ? "Open Depot"
                    : "Ouvrir le dépôt"
                  : "Day Already Opened"}
              </Button>
            </section>
          )}

          {/* OPEN */}
          {screen === "open" && (
            <OpenForm
              lang={lang}
              onSubmit={async (data) => {
                if (!depot || !operator) return;

                const business_date = new Date().toISOString().slice(0, 10);

                const { error } = await supabase.from("depot_day_open").insert({
                  depot_id: depot,
                  operator_name: operator,
                  business_date,
                  opening_cash_cfa: Number(data.cash),
                  opening_inventory: data.inventory,
                });

if (error) {
  if (error.code === "23505") {
    alert("This depot is already opened for today.");
  } else {
    alert("OPEN FAILED: " + error.message);
  }
  return;
}

                setOpenData({
                  ...data,
                  openedAt: new Date().toLocaleTimeString(),
                });

                setDayState("OPENED");
                setScreen("status");
              }}
            />
          )}

          {/* STATUS */}
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

          {/* CLOSE */}
          {screen === "close" && openData && depot && operator && (
            <CloseForm
              lang={lang}
              openingCash={Number(openData.cash)}
              onSubmit={async (data) => {
                const business_date = new Date().toISOString().slice(0, 10);

                const { error } = await supabase.from("depot_day_close").insert({
                  depot_id: depot,
                  operator_name: operator,
                  business_date,
                  cash_sales_total_cfa: Number(data.cash),
                  mobile_sales_total_cfa: Number(data.mobile),
                  closing_cash_cfa: Number(data.cash),
                  closing_inventory: data.inventory,
                  variance_note: data.varianceNote,
                });

if (error) {
  if (error.code === "23505") {
    alert("This depot is already closed for today.");
  } else if (error.code === "23503") {
    alert("Cannot close a depot that was not opened.");
  } else {
    alert("CLOSE FAILED: " + error.message);
  }
  return;
}


                setDayState("CLOSED");
                setScreen("final");
              }}
            />
          )}

          {/* FINAL (LOCKED) */}
          {screen === "final" && (
            <section className="text-center py-12 space-y-6">
              <div className="w-24 h-24 bg-green-600 text-white rounded-full flex items-center justify-center mx-auto text-5xl font-black">
                ✓
              </div>
              <h2 className="text-3xl font-black text-slate-900">
                {lang === "EN" ? "Day Complete" : "Journée terminée"}
              </h2>
              <p className="text-sm text-slate-500 font-semibold">
                {lang === "EN"
                  ? "This depot is locked for today."
                  : "Ce dépôt est verrouillé pour aujourd’hui."}
              </p>
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
}> = ({ depot, operator, openData }) => (
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
        <p className="font-bold">{openData.openedAt}</p>
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
  openingCash: number;
  onSubmit: (d: CloseData) => void;
}> = ({ lang, openingCash, onSubmit }) => {
  const [cash, setCash] = useState("");
  const [mobile, setMobile] = useState("");
  const [note, setNote] = useState("");
  const [inventory, setInventory] = useState<Inventory>(DEFAULT_INVENTORY());

  const total = Number(cash || 0) + Number(mobile || 0);
  const variance = total - openingCash;

  const valid =
    cash !== "" &&
    mobile !== "" &&
    Object.values(inventory).every((v) => v !== "") &&
    (variance === 0 || note.length > 2);

  return (
    <section className="space-y-6">
      <h2 className="font-black text-2xl text-slate-900">
        {lang === "EN" ? "Closing Form" : "Fermeture"}
      </h2>

      <div className="grid grid-cols-2 gap-4">
        <Input label="Cash Sales (CFA)" value={cash} onChange={setCash} type="number" />
        <Input label="Mobile Sales (CFA)" value={mobile} onChange={setMobile} type="number" />
      </div>

      <Input label={`Explain Variance (${variance})`} value={note} onChange={setNote} />

      <InventoryInputs inventory={inventory} setInventory={setInventory} />

      <Button
        disabled={!valid}
        onClick={() =>
          onSubmit({
            cash,
            mobile,
            total,
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
