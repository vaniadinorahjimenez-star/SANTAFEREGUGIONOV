import React, { useMemo, useState } from 'react';
import { SaleTicket } from '../../types';
import { extractTicketDate, isDeliveryTicket, MONTH_NAMES_ES } from '../../utils/salesAnalyticsUtils';
import { getTodayString, getYesterdayString, shiftLocalDate } from '../../utils/storage';
import { ChevronDown, ChevronUp, Calendar } from 'lucide-react';

type RoscaFilterPeriod = 'dia' | 'semana' | 'mes' | 'anio';

interface RoscaCounterPanelProps {
  tickets: SaleTicket[];
  branchFilter: 'todas' | 'refugio' | 'zakia';
}

function isRoscaItem(name: string, productId?: string): boolean {
  const n = (name || '').toLowerCase();
  const id = (productId || '').toLowerCase();
  return n.includes('rosca') || id.includes('rosca');
}

export const RoscaCounterPanel: React.FC<RoscaCounterPanelProps> = ({
  tickets,
  branchFilter
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [period, setPeriod] = useState<RoscaFilterPeriod>('dia');
  const todayStr = getTodayString();
  const yesterdayStr = getYesterdayString();
  const [customDate, setCustomDate] = useState<string>(todayStr);
  const [selectedMonth, setSelectedMonth] = useState<number>(() => new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [localBranch, setLocalBranch] = useState<'activa' | 'refugio' | 'zakia' | 'todas'>('activa');

  const effectiveBranch = localBranch === 'activa' ? branchFilter : localBranch;

  const branchTickets = useMemo(() => {
    return tickets.filter(t => {
      if (effectiveBranch === 'zakia') {
        if (isDeliveryTicket(t)) return false;
        return (t.branch || 'refugio') === 'zakia';
      }
      if (effectiveBranch === 'refugio') {
        return (t.branch || 'refugio') === 'refugio';
      }
      return true;
    });
  }, [tickets, effectiveBranch]);

  // Resumen rápido de hoy (para mostrar en el botón)
  const todaySummary = useMemo(() => {
    let pieces = 0;
    let amount = 0;
    branchTickets.forEach(t => {
      if (extractTicketDate(t) !== todayStr) return;
      t.items.forEach(it => {
        if (isRoscaItem(it.name, it.productId)) {
          pieces += it.quantity || 0;
          amount += it.total || 0;
        }
      });
    });
    return { pieces, amount };
  }, [branchTickets, todayStr]);

  // Reporte completo según filtro
  const report = useMemo(() => {
    const startOfWeek = shiftLocalDate(todayStr, -6);
    const monthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
    const yearStr = `${selectedYear}-`;

    const variantMap = new Map<string, { name: string; pieces: number; total: number }>();
    const dayMap = new Map<string, { date: string; pieces: number; total: number; tickets: number }>();

    let totalPieces = 0;
    let totalAmount = 0;
    let ticketCount = 0;

    branchTickets.forEach(t => {
      const tDate = extractTicketDate(t);
      if (period === 'dia' && tDate !== customDate) return;
      if (period === 'semana' && (tDate < startOfWeek || tDate > todayStr)) return;
      if (period === 'mes' && !tDate.startsWith(monthStr)) return;
      if (period === 'anio' && !tDate.startsWith(yearStr)) return;

      let ticketRoscaPieces = 0;
      let ticketRoscaTotal = 0;

      t.items.forEach(it => {
        if (!isRoscaItem(it.name, it.productId)) return;
        const qty = it.quantity || 0;
        const rev = it.total || 0;
        if (qty <= 0) return;

        ticketRoscaPieces += qty;
        ticketRoscaTotal += rev;

        const key = (it.name || 'Rosca').trim();
        const curVar = variantMap.get(key) || { name: key, pieces: 0, total: 0 };
        curVar.pieces += qty;
        curVar.total += rev;
        variantMap.set(key, curVar);
      });

      if (ticketRoscaPieces > 0) {
        ticketCount += 1;
        totalPieces += ticketRoscaPieces;
        totalAmount += ticketRoscaTotal;

        const curDay = dayMap.get(tDate) || { date: tDate, pieces: 0, total: 0, tickets: 0 };
        curDay.pieces += ticketRoscaPieces;
        curDay.total += ticketRoscaTotal;
        curDay.tickets += 1;
        dayMap.set(tDate, curDay);
      }
    });

    const variants = Array.from(variantMap.values()).sort((a, b) => b.pieces - a.pieces);
    const days = Array.from(dayMap.values()).sort((a, b) => b.date.localeCompare(a.date));

    return { totalPieces, totalAmount, ticketCount, variants, days };
  }, [branchTickets, period, customDate, todayStr, selectedMonth, selectedYear]);

  return (
    <div className="pt-2">
      {/* BOTÓN ESPECIAL HASTA ABAJO: CONTEO DE ROSCAS */}
      <button
        id="rosca-counter-toggle-btn"
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white rounded-2xl px-4 py-3 shadow-sm flex items-center justify-between gap-3 transition-all cursor-pointer border border-amber-500"
      >
        <div className="flex items-center gap-2.5 text-left">
          <span className="text-xl">🥨</span>
          <div>
            <div className="text-sm font-black leading-tight">
              Conteo de Roscas ({effectiveBranch === 'zakia' ? 'Zakia' : effectiveBranch === 'refugio' ? 'El Refugio' : 'Todas'})
            </div>
            <div className="text-[11px] font-bold text-amber-100">
              Hoy: {todaySummary.pieces} pzs (${todaySummary.amount.toLocaleString('es-MX')}) • Consultar por día, semana o mes
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-white/20 px-2.5 py-1 rounded-lg text-xs font-black tabular-nums">
            {isOpen ? 'Cerrar' : 'Ver Conteo'}
          </span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {isOpen && (
        <div className="mt-2 bg-white rounded-2xl border border-amber-300 p-4 shadow-sm space-y-3 animate-in fade-in duration-150">
          {/* Barra de Filtros */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
            <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl">
              {([
                { id: 'dia', label: 'Día / Fecha' },
                { id: 'semana', label: 'Semana (7d)' },
                { id: 'mes', label: 'Mes' },
                { id: 'anio', label: 'Año' }
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPeriod(tab.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-black cursor-pointer ${
                    period === tab.id ? 'bg-amber-600 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Selector según período */}
            <div className="flex flex-wrap items-center gap-2">
              {period === 'dia' && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCustomDate(todayStr)}
                    className={`px-2 py-1 rounded-lg text-xs font-bold cursor-pointer border ${
                      customDate === todayStr ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    Hoy
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomDate(yesterdayStr)}
                    className={`px-2 py-1 rounded-lg text-xs font-bold cursor-pointer border ${
                      customDate === yesterdayStr ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    Ayer
                  </button>
                  <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-lg px-2 py-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <input
                      type="date"
                      value={customDate}
                      onChange={e => e.target.value && setCustomDate(e.target.value)}
                      className="text-xs font-bold bg-transparent focus:outline-none cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {period === 'mes' && (
                <div className="flex items-center gap-1">
                  <select
                    value={selectedMonth}
                    onChange={e => setSelectedMonth(Number(e.target.value))}
                    className="bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                  >
                    {MONTH_NAMES_ES.map((m, idx) => (
                      <option key={m} value={idx}>{m}</option>
                    ))}
                  </select>
                  <select
                    value={selectedYear}
                    onChange={e => setSelectedYear(Number(e.target.value))}
                    className="bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                  >
                    {[selectedYear - 1, selectedYear, selectedYear + 1].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              )}

              {period === 'anio' && (
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(Number(e.target.value))}
                  className="bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                >
                  {[selectedYear - 1, selectedYear, selectedYear + 1].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              )}

              <select
                value={localBranch}
                onChange={e => setLocalBranch(e.target.value as any)}
                className="bg-amber-50 border border-amber-300 rounded-lg px-2 py-1 text-xs font-black text-amber-950 cursor-pointer"
              >
                <option value="activa">Sucursal Actual ({branchFilter === 'zakia' ? 'Zakia' : branchFilter === 'refugio' ? 'El Refugio' : 'Todas'})</option>
                <option value="refugio">El Refugio</option>
                <option value="zakia">Zakia</option>
                <option value="todas">Ambas Sucursales</option>
              </select>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-amber-50 rounded-xl p-2.5 border border-amber-200">
              <div className="text-[10px] font-black uppercase text-amber-800">Roscas Vendidas</div>
              <div className="text-xl font-black text-amber-950 tabular-nums">{report.totalPieces} pzs</div>
            </div>
            <div className="bg-emerald-50 rounded-xl p-2.5 border border-emerald-200">
              <div className="text-[10px] font-black uppercase text-emerald-800">Total Ingreso</div>
              <div className="text-xl font-black text-emerald-800 tabular-nums">
                ${report.totalAmount.toLocaleString('es-MX')}
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200">
              <div className="text-[10px] font-black uppercase text-slate-500">Tickets con Rosca</div>
              <div className="text-xl font-black text-slate-900 tabular-nums">{report.ticketCount}</div>
            </div>
          </div>

          {/* Desglose por Variante y por Día */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-100 px-3 py-1.5 text-[11px] font-black text-slate-700 border-b border-slate-200">
                Por Tipo de Rosca
              </div>
              <table className="w-full text-xs tabular-nums">
                <tbody className="divide-y divide-slate-100">
                  {report.variants.length === 0 ? (
                    <tr>
                      <td className="py-4 text-center text-slate-400 font-bold">Sin ventas de rosca en este período</td>
                    </tr>
                  ) : (
                    report.variants.map(v => (
                      <tr key={v.name}>
                        <td className="py-1.5 px-3 font-bold text-slate-900">{v.name}</td>
                        <td className="py-1.5 px-3 text-right font-black text-amber-900">{v.pieces} pzs</td>
                        <td className="py-1.5 px-3 text-right font-black text-emerald-700">${v.total.toLocaleString('es-MX')}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-100 px-3 py-1.5 text-[11px] font-black text-slate-700 border-b border-slate-200">
                Detalle por Fecha
              </div>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-xs tabular-nums">
                  <tbody className="divide-y divide-slate-100">
                    {report.days.length === 0 ? (
                      <tr>
                        <td className="py-4 text-center text-slate-400 font-bold">Sin fechas registradas</td>
                      </tr>
                    ) : (
                      report.days.map(d => (
                        <tr key={d.date}>
                          <td className="py-1.5 px-3 font-bold text-slate-800">{d.date}</td>
                          <td className="py-1.5 px-3 text-right text-slate-500">{d.tickets} tks</td>
                          <td className="py-1.5 px-3 text-right font-black text-amber-900">{d.pieces} pzs</td>
                          <td className="py-1.5 px-3 text-right font-black text-emerald-700">${d.total.toLocaleString('es-MX')}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
