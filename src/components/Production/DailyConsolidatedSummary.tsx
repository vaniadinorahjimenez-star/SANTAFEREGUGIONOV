import React, { useState, useMemo } from 'react';
import { BakeryOrder, BreadProduct, DriverCustomer, SaleTicket } from '../../types';
import { 
  BarChart3, 
  Search, 
  Calendar, 
  ArrowLeft, 
  Printer, 
  Download,
  Filter
} from 'lucide-react';
import { getTodayString } from '../../utils/storage';

interface DailyConsolidatedSummaryProps {
  orders: BakeryOrder[];
  products: BreadProduct[];
  driverCustomers: DriverCustomer[];
  tickets: SaleTicket[];
  onClose?: () => void;
}

export const DailyConsolidatedSummary: React.FC<DailyConsolidatedSummaryProps> = ({
  orders,
  products,
  driverCustomers,
  tickets,
  onClose
}) => {
  const todayStr = getTodayString();
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('TODOS');

  // Filter orders for selected date
  const dateOrders = useMemo(() => {
    return orders.filter(o => (o.deliveryDate || todayStr) === selectedDate);
  }, [orders, selectedDate, todayStr]);

  // Aggregate matrix
  const consolidatedRows = useMemo(() => {
    interface MatrixRow {
      breadId: string;
      name: string;
      category: string;
      counterPieces: number;
      ordersPieces: number;
      simonPieces: number;
      osvaldoPieces: number;
      totalPieces: number;
    }

    const map = new Map<string, MatrixRow>();

    // Initialize with all active catalog products
    products.forEach(p => {
      map.set(p.name.trim().toLowerCase(), {
        breadId: p.id,
        name: p.name,
        category: p.category,
        counterPieces: 0,
        ordersPieces: 0,
        simonPieces: 0,
        osvaldoPieces: 0,
        totalPieces: 0
      });
    });

    // Populate from Orders
    dateOrders.forEach(order => {
      const isSimon = order.assignedDriverId === 'simon' || (order.orderChannel === 'reparto' && order.customerName.toLowerCase().includes('simon'));
      const isOsvaldo = order.assignedDriverId === 'osvaldo' || (order.orderChannel === 'reparto' && order.customerName.toLowerCase().includes('osvaldo'));
      const isStorePickup = order.orderChannel === 'recoger_tienda' || order.deliveryType === 'recoger_tienda';

      (order.items || []).forEach(it => {
        const key = it.name.trim().toLowerCase();
        if (!map.has(key)) {
          map.set(key, {
            breadId: it.breadId || `custom_${key}`,
            name: it.name,
            category: it.category || 'Pan Dulce / Bizcocho',
            counterPieces: 0,
            ordersPieces: 0,
            simonPieces: 0,
            osvaldoPieces: 0,
            totalPieces: 0
          });
        }
        const row = map.get(key)!;
        if (isSimon) {
          row.simonPieces += it.quantity;
        } else if (isOsvaldo) {
          row.osvaldoPieces += it.quantity;
        } else if (isStorePickup) {
          row.ordersPieces += it.quantity;
        } else {
          row.ordersPieces += it.quantity;
        }
        row.totalPieces += it.quantity;
      });
    });

    let list = Array.from(map.values());

    // Only show products with total > 0 OR filter by search
    if (!searchQuery.trim()) {
      list = list.filter(r => r.totalPieces > 0);
    } else {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(r => r.name.toLowerCase().includes(q));
    }

    if (selectedCategory !== 'TODOS') {
      list = list.filter(r => r.category === selectedCategory);
    }

    return list.sort((a, b) => b.totalPieces - a.totalPieces);
  }, [products, dateOrders, searchQuery, selectedCategory, todayStr]);

  // Total sums
  const totals = useMemo(() => {
    let counter = 0;
    let ordersCount = 0;
    let simon = 0;
    let osvaldo = 0;
    let grand = 0;
    consolidatedRows.forEach(r => {
      counter += r.counterPieces;
      ordersCount += r.ordersPieces;
      simon += r.simonPieces;
      osvaldo += r.osvaldoPieces;
      grand += r.totalPieces;
    });
    return { counter, ordersCount, simon, osvaldo, grand };
  }, [consolidatedRows]);

  return (
    <div className="bg-[#FDFBF7] min-h-screen text-slate-800 flex flex-col font-sans">
      {/* Top Header */}
      <div className="bg-[#2D2A26] text-white px-3 py-2.5 flex items-center justify-between shadow-md sticky top-0 z-20">
        <div className="flex items-center space-x-2">
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/10 rounded-lg text-slate-300"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-base font-bold text-[#F8F4EE]">Resumen Diario de Producción</h1>
            <p className="text-[10px] text-amber-300 font-medium">Panadería Santa Fé • Consolidado Total</p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-xs font-black text-amber-300 bg-black/40 px-2.5 py-1 rounded-lg border border-amber-500/30">
            {totals.grand} pzas totales
          </span>
        </div>
      </div>

      {/* Filters and Date Bar */}
      <div className="p-2.5 bg-white border-b border-[#E5E1DA] space-y-2">
        <div className="flex items-center space-x-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-2 py-1 text-xs bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-800"
          />
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Buscar pan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-2 py-1 text-xs bg-slate-50 border border-slate-300 rounded-lg"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar">
          {['TODOS', 'Salado', 'Pan Dulce / Bizcocho', 'Feite y Batidos'].map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2 py-0.5 text-[10px] font-bold rounded-md whitespace-nowrap transition-colors ${
                selectedCategory === cat ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {cat === 'Pan Dulce / Bizcocho' ? 'Dulce' : cat === 'Feite y Batidos' ? 'Feite' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Ultra-thin Table (32px per row, no vertical scroll fatigue) */}
      <div className="flex-1 overflow-x-auto p-2 pb-16">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-200 text-slate-700 font-bold border-b border-slate-300 text-[11px] h-8">
              <th className="py-1 px-2">PAN / PRODUCTO</th>
              <th className="py-1 px-2 text-center w-16 text-amber-800">PEDIDOS</th>
              <th className="py-1 px-2 text-center w-16 text-amber-700">SIMÓN</th>
              <th className="py-1 px-2 text-center w-16 text-sky-700">OSVALDO</th>
              <th className="py-1 px-2 text-center w-20 bg-amber-100/70 font-black text-[#D95D39]">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {consolidatedRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                  No hay pedidos registrados para hornear en la fecha seleccionada ({selectedDate}).
                </td>
              </tr>
            ) : (
              consolidatedRows.map((row, idx) => (
                <tr
                  key={row.name}
                  className={`h-8 border-b border-slate-200 transition-colors ${
                    idx % 2 === 0 ? 'bg-white' : 'bg-amber-50/20'
                  } hover:bg-amber-100/40`}
                >
                  <td className="py-1 px-2 font-medium text-slate-800 truncate max-w-[140px] sm:max-w-xs">
                    {row.name}
                    <span className="ml-1 text-[9px] text-slate-400">({row.category.slice(0, 4)})</span>
                  </td>
                  <td className="py-1 px-2 text-center font-semibold text-slate-600">
                    {row.ordersPieces > 0 ? row.ordersPieces : '-'}
                  </td>
                  <td className="py-1 px-2 text-center font-semibold text-amber-800">
                    {row.simonPieces > 0 ? row.simonPieces : '-'}
                  </td>
                  <td className="py-1 px-2 text-center font-semibold text-sky-800">
                    {row.osvaldoPieces > 0 ? row.osvaldoPieces : '-'}
                  </td>
                  <td className="py-1 px-2 text-center font-black text-sm text-[#D95D39] bg-amber-50/80">
                    {row.totalPieces}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {consolidatedRows.length > 0 && (
            <tfoot>
              <tr className="bg-slate-800 text-white font-bold h-9 border-t-2 border-slate-900 text-xs">
                <td className="py-1 px-2">TOTAL PIEZAS A HORNEAR</td>
                <td className="py-1 px-2 text-center text-amber-200">{totals.ordersCount}</td>
                <td className="py-1 px-2 text-center text-amber-300">{totals.simon}</td>
                <td className="py-1 px-2 text-center text-sky-300">{totals.osvaldo}</td>
                <td className="py-1 px-2 text-center text-base text-amber-400 font-black bg-black/40">
                  {totals.grand}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};
