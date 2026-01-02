export enum InventoryStatus {
  IN = 'IN',
  LOW = 'LOW',
  OUT = 'OUT'
}

export interface InventoryItem {
  sku: string;
  status: InventoryStatus;
  quantity?: number;
}

export interface DepotDayEvent {
  depot_id: string;
  business_date: string;
  opening_cash_cfa: number;
  closing_cash_physical: number;
  cash_sales_cfa: number;
  mobile_sales_cfa: number;
  restock_cash_used: number;
  restock_skus: string[];
  operator_open: string | null;
  operator_close: string | null;
  variance_note?: string;
  opening_inventory: InventoryItem[];
  closing_inventory: InventoryItem[];
}
