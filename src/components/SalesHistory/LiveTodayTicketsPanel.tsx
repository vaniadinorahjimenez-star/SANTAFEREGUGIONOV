import React, { useMemo, useState } from 'react';
import { SaleTicket } from '../../types';
import { formatLocalDate, resolveTicketShift } from '../../utils/storage';
import { playBeep } from '../../utils/audio';
import {
  Banknote,
  CreditCard,
  Eye,
  Trash2,
  Sun,
  Moon,
  Search,
  ChevronDown,
  ChevronUp,
  Receipt
} from 'lucide-react';

interface LiveTodayTicketsPanelProps {
  tickets: SaleTicket[];
  todayStr: string;
  selectedBranch: 'zakia' | 'refugio';
  onSelectBranch: (branch: 'zakia' | 'refugio') => void;
  onViewTicket: (ticket: SaleTicket) => void;
  onDeleteTicket?: (ticket: SaleTicket) => void;
  lastSyncTime?: string;
}

function resolveTicketDateLocal(t: SaleTicket, fallbackToday: string): string {
  if (t.date && typeof t.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date.trim())) {
    return t.date.trim();
  }
  if (t.timestamp && typeof t.timestamp === 'string') {
    const parsed = new Date(t.timestamp);
    if (!isNaN(parsed.getTime())) return formatLocalDate(parsed);
    return t.timestamp.split('T')[0];
  }
  return fallbackToday;
}

function isDeliveryTicket(t: SaleTicket): boolean {
  return Boolean(
    t.isDelivery ||
      t.driverId === 'osvaldo' ||
      t.driverId === 'simon' ||
      (t.id && t.id.startsWith('rep_')) ||
      (t.cashier && t.cashier.toLowerCase().includes('reparto'))
  );
}

function parseSortableTs(t: SaleTicket): number {
  if (t.timestamp) {
    const ms = new Date(t.timestamp).getTime();
    if (!isNaN(ms)) return ms;
  }
  const numFolio = parseInt(String(t.folio || '').replace(/\D/g, ''), 10);
  return isNaN(numFolio) ? 0 : numFolio;
}

export const LiveTodayTicketsPanel: React.FC<LiveTodayTicketsPanelProps> = ({
  tickets,
  todayStr,
  selectedBranch,
  onSelectBranch,
  onViewTicket,
  onDeleteTicket,
  lastSyncTime
}) => {
  const [paymentMode, setPaymentMode] = useState<'todos' | 'efectivo' | 'tarjeta'>('todos');
  const [quickSearch, setQuickSearch] = useState<string>('');
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  const { zakiaTickets, refugioTickets, zakiaTotal, refugioTotal } = useMemo(() => {
    const zakia: SaleTicket[] = [];
    const refugio: SaleTicket[] = [];
    let zTotal = 0;
    let rTotal = 0;

    for (const t of tickets || []) {
      if (!t || !t.id) continue;
      if (isDeliveryTicket(t)) continue;
      if (resolveTicketDateLocal(t, todayStr) !== todayStr) continue;

      if (t.branch === 'zakia') {
        zakia.push(t);
        zTotal += Number(t.total || 0);
      } else {
        refugio.push(t);
        rTotal += Number(t.total || 0);
      }
    }

    zakia.sort((a, b) => parseSortableTs(b) - parseSortableTs(a));
    refugio.sort((a, b) => parseSortableTs(b) - parseSortableTs(a));

    return {
      zakiaTickets: zakia,
      refugioTickets: refugio,
      zakiaTotal: zTotal,
      refugioTotal: rTotal
    };
  }, [tickets, todayStr]);

  const activeBranchTickets = selectedBranch === 'zakia' ? zakiaTickets : refugioTickets;

  const filteredTickets = useMemo(() => {
    const q = quickSearch.trim().toLowerCase();
    return activeBranchTickets.filter((t) => {
      if (paymentMode !== 'todos' && t.paymentMethod !== paymentMode) return false;
      if (!q) return true;
      const inFolio = String(t.folio || '').toLowerCase().includes(q);
      const inItems = (t.items || []).some((it) => String(it.name || '').toLowerCase().includes(q));
      const inCustomer = String(t.customerName || '').toLowerCase().includes(q);
      return inFolio || inItems || inCustomer;
    });
  }, [activeBranchTickets, paymentMode, quickSearch]);

  const activeSummary = useMemo(() => {
    let total = 0;
    let cash = 0;
    let card = 0;
    let pieces = 0;
    for (const t of activeBranchTickets) {
      const amt = Number(t.total || 0);
      total += amt;
      if (t.paymentMethod === 'efectivo') cash += amt;
      else if (t.paymentMethod === 'tarjeta') card += amt;
      for (const it of t.items || []) pieces += Number(it.quantity || 0);
    }
    return { count: activeBranchTickets.length, total, cash, card, pieces };
  }, [activeBranchTickets]);

  const isZakia = selectedBranch === 'zakia';

  const handleToggleBranch = (next: 'zakia' | 'refugio') => {
    if (next !== selectedBranch) {
      onSelectBranch(next);
      playBeep(next === 'zakia' ? 760 : 620, 'sine', 0.04);
    }
  };

  return (
    <section
      id="live-today-tickets-panel"
      className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden"
    >
      {/* CABECERA COMPACTA CON SWITCH ZAKIA ⇄ EL REFUGIO */}
      <div className="p-3 sm:p-4 bg-slate-900 text-white space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 shrink-0">
              <Receipt className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-black tracking-tight text-white truncate">
                  Tickets de Hoy en Vivo — {isZakia ? 'Zakia' : 'El Refugio'}
                </h3>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              </div>
              <p className="text-[11px] font-semibold text-slate-300">
                Hoy {todayStr}
                {lastSyncTime ? ` · Actualizado ${lastSyncTime}` : ' · Sincronización automática'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 cursor-pointer"
          >
            {isExpanded ? (
              <>
                Ocultar <ChevronUp className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                Ver ({activeSummary.count}) <ChevronDown className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>

        {/* SWITCH TÁCTIL DIRECTO ZAKIA ⇄ EL REFUGIO (1 TOQUE EN CELULAR) */}
        <div
          role="tablist"
          aria-label="Cambiar sucursal de tickets de hoy"
          className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-800 border border-slate-700"
        >
          <button
            type="button"
            role="tab"
            aria-selected={isZakia}
            id="today-switch-zakia"
            onClick={() => handleToggleBranch('zakia')}
            className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left transition-all cursor-pointer ${
              isZakia
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'text-slate-200 hover:bg-slate-700/70'
            }`}
          >
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-black leading-tight">Zakia</div>
              <div className={`text-[11px] font-bold tabular-nums ${isZakia ? 'text-slate-900' : 'text-slate-400'}`}>
                {zakiaTickets.length} {zakiaTickets.length === 1 ? 'ticket' : 'tickets'}
              </div>
            </div>
            <div className={`text-sm sm:text-base font-black tabular-nums ${isZakia ? 'text-slate-950' : 'text-emerald-300'}`}>
              ${zakiaTotal.toLocaleString('es-MX')}
            </div>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={!isZakia}
            id="today-switch-refugio"
            onClick={() => handleToggleBranch('refugio')}
            className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left transition-all cursor-pointer ${
              !isZakia
                ? 'bg-amber-400 text-slate-950 shadow-sm'
                : 'text-slate-200 hover:bg-slate-700/70'
            }`}
          >
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-black leading-tight">El Refugio</div>
              <div className={`text-[11px] font-bold tabular-nums ${!isZakia ? 'text-slate-900' : 'text-slate-400'}`}>
                {refugioTickets.length} {refugioTickets.length === 1 ? 'ticket' : 'tickets'}
              </div>
            </div>
            <div className={`text-sm sm:text-base font-black tabular-nums ${!isZakia ? 'text-slate-950' : 'text-amber-300'}`}>
              ${refugioTotal.toLocaleString('es-MX')}
            </div>
          </button>
        </div>

        {/* MÉTRICAS COMPACTAS DE LA SUCURSAL ACTIVA HOY */}
        <div className="grid grid-cols-4 gap-1.5 text-center">
          <div className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5">
            <div className="text-[10px] font-bold uppercase text-slate-400">Tickets</div>
            <div className="text-sm font-black tabular-nums text-white">{activeSummary.count}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5">
            <div className="text-[10px] font-bold uppercase text-emerald-300">Efectivo</div>
            <div className="text-sm font-black tabular-nums text-emerald-200">
              ${activeSummary.cash.toLocaleString('es-MX')}
            </div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5">
            <div className="text-[10px] font-bold uppercase text-sky-300">Tarjeta</div>
            <div className="text-sm font-black tabular-nums text-sky-200">
              ${activeSummary.card.toLocaleString('es-MX')}
            </div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5">
            <div className="text-[10px] font-bold uppercase text-amber-300">Piezas</div>
            <div className="text-sm font-black tabular-nums text-amber-200">{activeSummary.pieces}</div>
          </div>
        </div>
      </div>

      {/* CONTENIDO: FILTROS + LISTADO DE TICKETS DE HOY */}
      {isExpanded && (
        <div className="p-3 sm:p-4 space-y-2.5">
          {/* Barra de filtro rápido */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              {(['todos', 'efectivo', 'tarjeta'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPaymentMode(mode)}
                  className={`px-2.5 py-1 rounded-md text-xs font-black capitalize cursor-pointer transition-colors ${
                    paymentMode === mode
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            <div className="relative flex-1 min-w-[160px] max-w-xs">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={quickSearch}
                onChange={(e) => setQuickSearch(e.target.value)}
                placeholder="Buscar folio o pan..."
                className="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
              />
            </div>
          </div>

          {filteredTickets.length === 0 ? (
            <div className="py-7 px-4 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70">
              <p className="text-sm font-black text-slate-700">
                Sin tickets registrados hoy en {isZakia ? 'Zakia' : 'El Refugio'}
              </p>
              <p className="text-xs font-medium text-slate-500 mt-1">
                En cuanto se cobre un ticket en mostrador aparecerá aquí automáticamente sin recargar.
              </p>
            </div>
          ) : (
            <>
              {/* VISTA MÓVIL (TARJETAS COMPACTAS SIN SCROLL HORIZONTAL) */}
              <div className="space-y-1.5 md:hidden max-h-[420px] overflow-y-auto pr-0.5">
                {filteredTickets.map((t) => {
                  const shift = resolveTicketShift(t);
                  const itemsPreview = (t.items || [])
                    .map((it) => `${it.quantity}× ${it.name}`)
                    .join(', ');
                  const totalPcs = (t.items || []).reduce((acc, it) => acc + Number(it.quantity || 0), 0);

                  return (
                    <div
                      key={t.id}
                      onClick={() => onViewTicket(t)}
                      className="flex items-center justify-between gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-black text-slate-900 tabular-nums">
                            #{t.folio}
                          </span>
                          <span className="text-[11px] font-bold text-slate-500 tabular-nums">
                            {t.time}
                          </span>
                          <span
                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-black ${
                              shift === 'turno1'
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-indigo-100 text-indigo-900'
                            }`}
                          >
                            {shift === 'turno1' ? <Sun className="w-2.5 h-2.5" /> : <Moon className="w-2.5 h-2.5" />}
                            {shift === 'turno1' ? 'T1' : 'T2'}
                          </span>
                          <span
                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-black ${
                              t.paymentMethod === 'efectivo'
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'bg-sky-100 text-sky-900'
                            }`}
                          >
                            {t.paymentMethod === 'efectivo' ? (
                              <Banknote className="w-2.5 h-2.5" />
                            ) : (
                              <CreditCard className="w-2.5 h-2.5" />
                            )}
                            {t.paymentMethod === 'efectivo' ? 'Efectivo' : 'Tarjeta'}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-600 truncate mt-0.5">
                          {itemsPreview || `${totalPcs} piezas`}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <div className="text-sm font-black text-slate-900 tabular-nums">
                            ${Number(t.total || 0).toLocaleString('es-MX')}
                          </div>
                          <div className="text-[10px] font-bold text-slate-400 tabular-nums">
                            {totalPcs} pzs
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-label={`Ver ticket ${t.folio}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewTicket(t);
                          }}
                          className="p-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* VISTA ESCRITORIO (TABLA COMPACTA DE UNA SOLA MIRADA) */}
              <div className="hidden md:block max-h-[340px] overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                    <tr className="text-[11px] font-black uppercase text-slate-500">
                      <th className="py-2 px-3">Folio</th>
                      <th className="py-2 px-2">Hora</th>
                      <th className="py-2 px-2">Turno</th>
                      <th className="py-2 px-2">Productos</th>
                      <th className="py-2 px-2 text-center">Pzs</th>
                      <th className="py-2 px-2">Pago</th>
                      <th className="py-2 px-3 text-right">Total</th>
                      <th className="py-2 px-2 text-right">Ver</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredTickets.map((t) => {
                      const shift = resolveTicketShift(t);
                      const itemsPreview = (t.items || [])
                        .map((it) => `${it.quantity}× ${it.name}`)
                        .join(', ');
                      const totalPcs = (t.items || []).reduce((acc, it) => acc + Number(it.quantity || 0), 0);

                      return (
                        <tr
                          key={t.id}
                          onClick={() => onViewTicket(t)}
                          className="hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <td className="py-1.5 px-3 font-black text-slate-900 tabular-nums whitespace-nowrap">
                            #{t.folio}
                          </td>
                          <td className="py-1.5 px-2 font-bold text-slate-600 tabular-nums whitespace-nowrap">
                            {t.time}
                          </td>
                          <td className="py-1.5 px-2 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black ${
                                shift === 'turno1'
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-indigo-100 text-indigo-900'
                              }`}
                            >
                              {shift === 'turno1' ? 'T1' : 'T2'}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 text-slate-700 font-medium max-w-[320px] truncate">
                            {itemsPreview}
                          </td>
                          <td className="py-1.5 px-2 text-center font-bold text-slate-700 tabular-nums">
                            {totalPcs}
                          </td>
                          <td className="py-1.5 px-2 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black ${
                                t.paymentMethod === 'efectivo'
                                  ? 'bg-emerald-100 text-emerald-900'
                                  : 'bg-sky-100 text-sky-900'
                              }`}
                            >
                              {t.paymentMethod === 'efectivo' ? 'Efectivo' : 'Tarjeta'}
                            </span>
                          </td>
                          <td className="py-1.5 px-3 text-right font-black text-slate-900 tabular-nums whitespace-nowrap">
                            ${Number(t.total || 0).toLocaleString('es-MX')}
                          </td>
                          <td className="py-1.5 px-2 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onViewTicket(t);
                                }}
                                className="p-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                                title="Ver ticket"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              {onDeleteTicket && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteTicket(t);
                                  }}
                                  className="p-1 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-600 cursor-pointer"
                                  title="Eliminar ticket"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
};
