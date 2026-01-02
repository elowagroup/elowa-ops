import { DepotDayEvent, InventoryStatus, InventoryItem } from './types';

const depots = ['Adetikope', 'Benardkope'];
const operators = ['Mohamed', 'Mona', 'Sarata'];
const skus = ['Rice-White', 'Rice-Brown', 'Rice-Perfumed', 'Oil-25L', 'Oil-5L', 'Oil-1L', 'Spaghetti'];

const randomStatus = (): InventoryStatus => {
  const rand = Math.random();
  if (rand < 0.7) return InventoryStatus.IN;
  if (rand < 0.9) return InventoryStatus.LOW;
  return InventoryStatus.OUT;
};

const generateInventory = (): InventoryItem[] => {
  return skus.map(sku => ({
    sku,
    status: randomStatus(),
    quantity: Math.floor(Math.random() * 100) + 10
  }));
};

export const generateMockEvents = (): DepotDayEvent[] => {
  const events: DepotDayEvent[] = [];
  const today = new Date();

  // Generate 90 days of mock data
  for (let i = 0; i < 90; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dateStr = date.toISOString().slice(0, 10);

    depots.forEach(depot => {
      const openingCash = Math.floor(Math.random() * 50000) + 100000;
      const cashSales = Math.floor(Math.random() * 200000) + 50000;
      const mobileSales = Math.floor(Math.random() * 150000) + 30000;
      const restockCash = Math.random() > 0.7 ? Math.floor(Math.random() * 80000) + 20000 : 0;
      const variance = Math.floor(Math.random() * 20000) - 10000;
      const expectedClosing = openingCash + cashSales - restockCash;
      const closingCash = expectedClosing + variance;

      const shouldBeClosed = Math.random() > 0.1; // 90% closed

      events.push({
        depot_id: depot,
        business_date: dateStr,
        opening_cash_cfa: openingCash,
        closing_cash_physical: closingCash,
        cash_sales_cfa: cashSales,
        mobile_sales_cfa: mobileSales,
        restock_cash_used: restockCash,
        restock_skus: restockCash > 0 ? [skus[Math.floor(Math.random() * skus.length)]] : [],
        operator_open: operators[Math.floor(Math.random() * operators.length)],
        operator_close: shouldBeClosed ? operators[Math.floor(Math.random() * operators.length)] : null,
        variance_note: Math.abs(variance) > 5000 ? `Variance of ${variance} CFA noted` : undefined,
        opening_inventory: generateInventory(),
        closing_inventory: generateInventory()
      });
    });
  }

  // Sort by date descending
  return events.sort((a, b) => b.business_date.localeCompare(a.business_date));
};
