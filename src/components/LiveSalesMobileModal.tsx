import React, { useState, useEffect } from 'react';
import { 
  X, 
  RefreshCw, 
  TrendingUp, 
  Banknote, 
  CreditCard, 
  Clock, 
  Receipt, 
  Sun, 
  Moon, 
  ArrowUpRight, 
  CheckCircle2, 
  Smartphone, 
  DollarSign, 
  ShoppingBag,
  ExternalLink,
  ChevronRight,
  Flame,
  Wheat,
  Share2
} from 'lucide-react';
import { SaleTicket, BakeryOrder } from '../types';
import { getTodayString, loadOutflows, resolveTicketShift } from '../utils/storage';
import { playBeep, playCashSound } from '../utils/audio';

interface LiveSalesMobileModalProps {
  tickets: SaleTicket[];
  orders?: BakeryOrder[];
  firebaseStatus?: { connected: boolean; userEmail?: string };
  isSyncing?: boolean;
  onManualSync?: () => void;
  onClose: () => void;
  onNavigateToHistory: () => void;
}

export const LiveSalesMobileModal: React.FC<LiveSalesMobileModalProps> = ({
  tickets,
  orders = [],
  firebaseStatus,
  isSyncing = false,
  onManualSync,
  onClose,
  onNavigateToHistory
}) => {
  const todayStr = getTodayString();
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>(() => {
    return new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  });

  // Filtrar tickets del día de hoy
  const todayTickets = React.useMemo(() => {
    return tickets.filter(t => {
      const tDate = t.date?.trim() || (t.timestamp ? t.timestamp.split('T')[0] : '');
      return tDate === todayStr;
    });
  }, [tickets, todayStr]);

  // Cálculos de Ventas del Día
  const totalSales = todayTickets.reduce((acc, t) => acc + (t.total || 0), 0);
  const totalPieces = todayTickets.reduce((acc, t) => {
    return acc + (t.items ? t.items.reduce((s, it) => s + (it.quantity || 0), 0) : 0);
  }, 0);
  const ticketsCount = todayTickets.length;
  const avgTicket = ticketsCount > 0 ? totalSales / ticketsCount : 0;

  // Desglose Efectivo vs Tarjeta
  const cashTickets = todayTickets.filter(t => t.paymentMethod === 'efectivo');
  const cashTotal = cashTickets.reduce((acc, t) => acc + (t.total || 0), 0);
  const cashPercent = totalSales > 0 ? Math.round((cashTotal / totalSales) * 100) : 0;

  const cardTickets = todayTickets.filter(t => t.paymentMethod === 'tarjeta');
  const cardTotal = cardTickets.reduce((acc, t) => acc + (t.total || 0), 0);
  const cardPercent = totalSales > 0 ? Math.round((cardTotal / totalSales) * 100) : 0;

  // Turnos (Turno 1: 06:50 - 15:00 / Turno 2: 15:01 - 22:10)
  const turno1Tickets = todayTickets.filter(t => resolveTicketShift(t) === 'turno1');
  const turno1Total = turno1Tickets.reduce((acc, t) => acc + (t.total || 0), 0);

  const turno2Tickets = todayTickets.filter(t => resolveTicketShift(t) === 'turno2');
  const turno2Total = turno2Tickets.reduce((acc, t) => acc + (t.total || 0), 0);

  // Salidas de caja del día
  const outflows = React.useMemo(() => {
    const list = loadOutflows();
    return list.filter(o => {
      const oDate = o.date || (o.createdAt ? o.createdAt.split('T')[0] : '');
      return oDate === todayStr;
    });
  }, [todayStr, isSyncing]);

  const totalOutflows = outflows.reduce((acc, o) => acc + (o.amount || 0), 0);
  const netCashInDrawer = Math.max(0, cashTotal - totalOutflows);

  // Formato de fecha legible
  const formattedDate = React.useMemo(() => {
    try {
      const [year, month, day] = todayStr.split('-').map(Number);
      const d = new Date(year, month - 1, day);
      return d.toLocaleDateString('es-MX', { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
      });
    } catch {
      return todayStr;
    }
  }, [todayStr]);

  const handleRefresh = async () => {
    playBeep(650, 'sine', 0.05);
    onManualSync?.();
    setLastRefreshedAt(new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    playCashSound();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div 
        className="w-full sm:max-w-xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="bg-gradient-to-r from-[#D95D39] via-[#c44e2c] to-[#993418] p-4 sm:p-5 text-white shrink-0 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping inline-block"></span>
              <span className="text-[11px] font-black uppercase tracking-wider bg-white/20 backdrop-blur-xs px-2.5 py-0.5 rounded-full border border-white/30 text-white">
                EN VIVO • FIREBASE
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRefresh}
                className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 active:scale-95 text-white text-xs font-bold px-2.5 py-1 rounded-xl transition-all cursor-pointer border border-white/25"
                title="Actualizar datos de ventas en vivo"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Actualizar</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-black/20 hover:bg-black/30 flex items-center justify-center text-white transition-colors cursor-pointer"
                title="Cerrar monitor"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="mt-3">
            <h2 className="text-xl sm:text-2xl font-black font-serif tracking-tight text-white flex items-center gap-2">
              <span>Ventas del Día en Vivo</span>
              <span className="text-lg">🍞</span>
            </h2>
            <p className="text-xs text-white/90 capitalize font-medium">
              {formattedDate} • Actualizado: <strong className="font-mono text-white">{lastRefreshedAt}</strong>
            </p>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-[#FAF8F6]">
          
          {/* Main Giant Hero Metric */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border-2 border-[#E5E1DA] shadow-sm text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-28 h-28 bg-[#FFF5F0] rounded-bl-full -z-0 pointer-events-none"></div>
            
            <span className="text-xs uppercase font-extrabold tracking-wider text-slate-500 block relative z-10">
              Total Cobrado en Mostrador Hoy
            </span>

            <div className="text-3xl sm:text-4xl md:text-5xl font-black font-mono text-[#D95D39] my-1 relative z-10">
              ${totalSales.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-xs text-slate-600 font-semibold pt-2 border-t border-slate-100 relative z-10">
              <span className="flex items-center gap-1">
                <Receipt className="w-3.5 h-3.5 text-slate-400" />
                <strong>{ticketsCount}</strong> tickets cobrados
              </span>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1">
                <Wheat className="w-3.5 h-3.5 text-amber-500" />
                <strong>{totalPieces}</strong> piezas vendidas
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-slate-500">
                Promedio: <strong className="font-mono">${avgTicket.toFixed(1)}</strong>
              </span>
            </div>
          </div>

          {/* Grid Breakdown: Efectivo vs Tarjeta */}
          <div className="grid grid-cols-2 gap-3">
            {/* Efectivo */}
            <div className="bg-white rounded-2xl p-3.5 border-2 border-emerald-200 shadow-2xs">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <Banknote className="w-4 h-4" />
                  <span className="text-xs font-black uppercase">Efectivo</span>
                </div>
                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-md">
                  {cashPercent}%
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-mono font-black text-emerald-700">
                ${cashTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                {cashTickets.length} tickets en efectivo
              </span>
            </div>

            {/* Tarjeta */}
            <div className="bg-white rounded-2xl p-3.5 border-2 border-blue-200 shadow-2xs">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 text-blue-700">
                  <CreditCard className="w-4 h-4" />
                  <span className="text-xs font-black uppercase">Tarjeta</span>
                </div>
                <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded-md">
                  {cardPercent}%
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-mono font-black text-blue-700">
                ${cardTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                {cardTickets.length} cobros Mercado Pago / Tarjeta
              </span>
            </div>
          </div>

          {/* Grid Breakdown: Turno 1 vs Turno 2 */}
          <div className="grid grid-cols-2 gap-3">
            {/* Turno 1 */}
            <div className="bg-white rounded-2xl p-3 border border-[#E5E1DA] shadow-2xs">
              <div className="flex items-center gap-1.5 text-amber-700 text-xs font-bold mb-1">
                <Sun className="w-3.5 h-3.5 text-amber-500" />
                <span>Turno 1 (Mañana)</span>
              </div>
              <div className="text-lg font-mono font-black text-slate-900">
                ${turno1Total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[10px] text-slate-500">
                {turno1Tickets.length} tickets • 06:50 a 15:00
              </span>
            </div>

            {/* Turno 2 */}
            <div className="bg-white rounded-2xl p-3 border border-[#E5E1DA] shadow-2xs">
              <div className="flex items-center gap-1.5 text-indigo-700 text-xs font-bold mb-1">
                <Moon className="w-3.5 h-3.5 text-indigo-500" />
                <span>Turno 2 (Tarde)</span>
              </div>
              <div className="text-lg font-mono font-black text-slate-900">
                ${turno2Total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[10px] text-slate-500">
                {turno2Tickets.length} tickets • 15:01 a 22:10
              </span>
            </div>
          </div>

          {/* Cuadre rápido de Caja y Salidas */}
          {totalOutflows > 0 && (
            <div className="bg-amber-50 rounded-2xl p-3 border border-amber-200 flex items-center justify-between text-xs">
              <div>
                <span className="font-bold text-amber-900 block">Salidas de efectivo hoy:</span>
                <span className="text-[11px] text-amber-700">Pagos a proveedores / gastos registrados</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-mono font-black text-rose-600 block">
                  -${totalOutflows.toFixed(2)}
                </span>
                <span className="text-[10px] text-emerald-800 font-bold">
                  Neto en cajón: ${netCashInDrawer.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Live Recent Tickets Feed (Últimos Cobros al Segundo) */}
          <div className="bg-white rounded-2xl p-4 border border-[#E5E1DA] shadow-2xs">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  Últimos Cobros en Mostrador
                </h3>
              </div>
              <span className="text-[10px] font-bold text-slate-400">
                Tiempo Real
              </span>
            </div>

            {todayTickets.length === 0 ? (
              <div className="text-center py-6 text-slate-500">
                <p className="text-sm font-bold text-slate-700">No hay ventas registradas aún el día de hoy.</p>
                <p className="text-xs mt-1 text-slate-400">
                  En cuanto el cajero cobre en mostrador, aparecerá aquí inmediatamente al segundo.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1 divide-y divide-slate-100">
                {todayTickets.slice(0, 10).map((t, idx) => {
                  const itemsSummary = (t.items || []).map(it => `${it.quantity} ${it.name}`).join(', ');
                  return (
                    <div key={t.id || idx} className="pt-2 first:pt-0 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-xs text-slate-800">
                            {t.folio}
                          </span>
                          <span className="text-[10px] font-bold text-slate-500 flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5 text-slate-400" />
                            {t.time || 'Hoy'}
                          </span>
                          {t.cashier && (
                            <span className="text-[9px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-bold">
                              {t.cashier}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate max-w-[200px] sm:max-w-xs mt-0.5">
                          {itemsSummary || 'Venta de panadería'}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-mono font-black text-sm text-slate-900 block">
                          ${t.total.toFixed(2)}
                        </span>
                        <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded ${
                          t.paymentMethod === 'tarjeta' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {t.paymentMethod === 'tarjeta' ? '💳 Tarjeta' : '💵 Efectivo'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Tip: Add to Home Screen on Mobile */}
          <div className="bg-[#FFF5F0] rounded-2xl p-3 border border-[#E5E1DA] text-xs text-slate-700 flex items-start gap-2.5">
            <Smartphone className="w-4 h-4 text-[#D95D39] shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-900 font-bold block">
                Acceso directo en tu Celular
              </strong>
              <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                En Safari (iPhone) o Chrome (Android), toca <strong>Compartir / Menú</strong> y elige <strong>"Agregar a pantalla de inicio"</strong> para abrir esta app como una aplicación en tu teléfono.
              </p>
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="p-3 sm:p-4 bg-white border-t border-[#E5E1DA] flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              onClose();
              onNavigateToHistory();
            }}
            className="flex-1 flex items-center justify-center gap-2 bg-[#D95D39] hover:bg-[#c44e2c] active:scale-95 text-white font-black text-xs sm:text-sm py-2.5 px-4 rounded-xl shadow-sm transition-all cursor-pointer"
          >
            <span>Ver Arqueo y Caja Completo</span>
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm rounded-xl transition-colors cursor-pointer active:scale-95"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
};
