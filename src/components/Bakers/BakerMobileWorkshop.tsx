import React, { useState, useMemo } from 'react';
import { BakeryOrder, OrderItem } from '../../types';
import { 
  ChefHat, 
  Clock, 
  Check, 
  RotateCcw, 
  ArrowLeft,
  Calendar,
  Sparkles,
  Wheat,
  Search
} from 'lucide-react';
import { getTodayString } from '../../utils/storage';
import { playBakerCheckSound, playCelebrationFanfare } from '../../utils/audio';
import confetti from 'canvas-confetti';

interface BakerMobileWorkshopProps {
  orders: BakeryOrder[];
  onToggleItemDone: (orderId: string, itemIdx: number) => void;
  onCompleteEntireOrder?: (orderId: string) => void;
  onClose?: () => void;
}

export const BakerMobileWorkshop: React.FC<BakerMobileWorkshopProps> = ({
  orders,
  onToggleItemDone,
  onCompleteEntireOrder,
  onClose
}) => {
  const todayStr = getTodayString();
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [filterMode, setFilterMode] = useState<'todos' | 'pendientes' | 'terminados'>('todos');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Formatted date string in Spanish: e.g. "Jueves 5 de noviembre"
  const formattedDateTitle = useMemo(() => {
    try {
      const parts = selectedDate.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const dateObj = new Date(y, m, d);
        const dayName = dateObj.toLocaleDateString('es-MX', { weekday: 'long' });
        const monthName = dateObj.toLocaleDateString('es-MX', { month: 'long' });
        const capDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
        return `${capDay} ${d} de ${monthName}`;
      }
    } catch {}
    return 'Hoy';
  }, [selectedDate]);

  // Filter orders for the selected delivery date (excluding completely canceled ones)
  const activeDateOrders = useMemo(() => {
    let list = orders.filter(o => {
      const d = o.deliveryDate?.trim() || todayStr;
      return d === selectedDate && o.items && o.items.length > 0;
    });

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(o => 
        o.customerName?.toLowerCase().includes(q) ||
        (o.items || []).some(it => it.name.toLowerCase().includes(q))
      );
    }

    return list;
  }, [orders, selectedDate, todayStr, searchQuery]);

  // Compute pending vs completed orders count
  const { pendingOrders, completedOrders } = useMemo(() => {
    const pending: BakeryOrder[] = [];
    const completed: BakeryOrder[] = [];

    activeDateOrders.forEach(o => {
      const isComplete = o.items.length > 0 && o.items.every(it => it.done);
      if (isComplete) {
        completed.push(o);
      } else {
        pending.push(o);
      }
    });

    return { pendingOrders: pending, completedOrders: completed };
  }, [activeDateOrders]);

  // Display list according to filter
  const displayedOrders = useMemo(() => {
    let list: BakeryOrder[] = [];
    if (filterMode === 'pendientes') {
      list = [...pendingOrders];
    } else if (filterMode === 'terminados') {
      list = [...completedOrders];
    } else {
      // Pending first, then completed
      list = [...pendingOrders, ...completedOrders];
    }
    return list;
  }, [filterMode, pendingOrders, completedOrders]);

  // Handle "Ya está hecho" click for a whole customer order
  const handleCompleteOrder = (order: BakeryOrder) => {
    order.items.forEach((it, idx) => {
      if (!it.done) {
        onToggleItemDone(order.id, idx);
      }
    });
    if (onCompleteEntireOrder) {
      onCompleteEntireOrder(order.id);
    }
    playBakerCheckSound();
    confetti({
      particleCount: 35,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  // Handle "Terminado • Deshacer" click
  const handleUndoOrder = (order: BakeryOrder) => {
    order.items.forEach((it, idx) => {
      if (it.done) {
        onToggleItemDone(order.id, idx);
      }
    });
  };

  return (
    <div className="bg-[#FAF9F6] min-h-screen text-slate-800 flex flex-col font-sans pb-24">
      {/* Top Bar with back button if modal */}
      {onClose && (
        <div className="px-4 pt-3 flex items-center justify-between">
          <button
            onClick={onClose}
            className="flex items-center space-x-1 text-slate-600 hover:text-slate-900 font-bold text-xs p-1 rounded-lg hover:bg-slate-200/50"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver al inicio</span>
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-xs font-bold bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-2xs"
          />
        </div>
      )}

      {/* Main Container */}
      <main className="max-w-md w-full mx-auto px-4 pt-4 space-y-4">
        {/* Header (Exact Match to Screenshot 2) */}
        <div>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-extrabold tracking-widest uppercase text-slate-400">
                PANADERÍA SANTA FÉ
              </p>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-tight mt-0.5">
                Producción de hoy
              </h1>
              <p className="text-sm font-medium text-slate-500 mt-0.5">
                {formattedDateTitle}
              </p>
            </div>

            {/* Chef Hat outline in Terracotta */}
            <div className="w-10 h-10 rounded-2xl bg-white border border-orange-200 text-[#D95D39] flex items-center justify-center shadow-xs shrink-0">
              <ChefHat className="w-6 h-6 stroke-[1.8]" />
            </div>
          </div>
        </div>

        {/* 2 KPI Boxes: Por preparar & Terminados (Exact Match to Screenshot 2) */}
        <div className="grid grid-cols-2 gap-3">
          {/* Box 1: Por preparar */}
          <div 
            onClick={() => setFilterMode(filterMode === 'pendientes' ? 'todos' : 'pendientes')}
            className={`bg-white rounded-2xl p-3.5 border transition-all cursor-pointer shadow-xs ${
              filterMode === 'pendientes' ? 'border-[#D95D39] ring-2 ring-orange-100' : 'border-slate-200/80 hover:border-slate-300'
            }`}
          >
            <div className="text-xs font-semibold text-slate-500">
              Por preparar
            </div>
            <div className="text-3xl font-black text-slate-900 mt-1">
              {pendingOrders.length}
            </div>
          </div>

          {/* Box 2: Terminados */}
          <div 
            onClick={() => setFilterMode(filterMode === 'terminados' ? 'todos' : 'terminados')}
            className={`bg-white rounded-2xl p-3.5 border transition-all cursor-pointer shadow-xs ${
              filterMode === 'terminados' ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-200/80 hover:border-slate-300'
            }`}
          >
            <div className="text-xs font-semibold text-slate-500">
              Terminados
            </div>
            <div className="text-3xl font-black text-slate-900 mt-1">
              {completedOrders.length}
            </div>
          </div>
        </div>

        {/* Search bar if many orders */}
        {activeDateOrders.length > 4 && (
          <div className="relative">
            <input
              type="text"
              placeholder="Buscar cliente o pan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl shadow-2xs focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>
        )}

        {/* Cards per Customer Order (Exact Match to Screenshot 2) */}
        <div className="space-y-3">
          {displayedOrders.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-200/80 shadow-xs text-slate-400 space-y-2">
              <ChefHat className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-700">No hay pedidos pendientes</p>
              <p className="text-xs text-slate-500">
                Los pedidos capturados en mostrador, reparto o celular aparecerán aquí al instante.
              </p>
            </div>
          ) : (
            displayedOrders.map((order) => {
              const isDone = order.items.length > 0 && order.items.every(it => it.done);
              const formattedTime = order.deliveryTime || '07:00';

              return (
                <div
                  key={order.id}
                  className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs space-y-3 transition-all"
                >
                  {/* Top: Customer Name & Status Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                      {order.customerName}
                    </h3>

                    {/* Badge: Pendiente (Soft Terracotta) / Terminado (Soft Emerald) */}
                    {isDone ? (
                      <span className="bg-emerald-50 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full border border-emerald-200 shrink-0">
                        Terminado
                      </span>
                    ) : (
                      <span className="bg-[#FFF0E6] text-[#D95D39] text-xs font-bold px-3 py-1 rounded-full border border-orange-100 shrink-0">
                        Pendiente
                      </span>
                    )}
                  </div>

                  {/* Delivery Time */}
                  <div className="flex items-center space-x-1.5 text-xs text-slate-500 font-medium">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Entrega {formattedTime}</span>
                    {order.deliveryType === 'reparto' && (
                      <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.2 rounded font-semibold ml-1">
                        {order.assignedDriverId === 'simon' ? 'Simón' : 'Osvaldo'}
                      </span>
                    )}
                  </div>

                  {/* Bread items list with wheat icon 🌾 */}
                  <div className="space-y-1.5 pt-1">
                    {order.items.map((item, idx) => (
                      <div 
                        key={`${item.breadId}_${idx}`}
                        onClick={() => onToggleItemDone(order.id, idx)}
                        className={`flex items-center space-x-2 text-sm cursor-pointer select-none transition-colors ${
                          item.done ? 'text-slate-400 line-through' : 'text-slate-900 font-bold'
                        }`}
                        title="Toca para marcar o desmarcar pieza"
                      >
                        <Wheat className={`w-4 h-4 shrink-0 ${item.done ? 'text-slate-300' : 'text-amber-600'}`} />
                        <span>
                          {item.quantity} {item.name.toLowerCase()}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Giant Action Button (Exact Match to Screenshot 2) */}
                  <div className="pt-1">
                    {isDone ? (
                      /* Light pill button: "✓ Terminado • Deshacer" */
                      <button
                        type="button"
                        onClick={() => handleUndoOrder(order)}
                        className="w-full py-2.5 bg-white hover:bg-slate-50 active:scale-[0.98] border border-slate-300 rounded-full font-bold text-xs text-slate-700 flex items-center justify-center space-x-1.5 shadow-2xs transition-all cursor-pointer"
                      >
                        <div className="w-4 h-4 rounded-full border border-slate-400 flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-slate-700 stroke-[3]" />
                        </div>
                        <span>Terminado • Deshacer</span>
                      </button>
                    ) : (
                      /* Dark pill button: "✓ Ya está hecho" */
                      <button
                        type="button"
                        onClick={() => handleCompleteOrder(order)}
                        className="w-full py-3 bg-[#18181B] hover:bg-black active:scale-[0.98] text-white rounded-full font-extrabold text-sm flex items-center justify-center space-x-2 shadow-sm transition-all cursor-pointer"
                      >
                        <Check className="w-4 h-4 text-white stroke-[3]" />
                        <span>Ya está hecho</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
};
