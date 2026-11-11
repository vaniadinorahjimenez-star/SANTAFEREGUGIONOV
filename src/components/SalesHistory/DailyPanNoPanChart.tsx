import React, { useState, useMemo } from 'react';
import { SaleTicket } from '../../types';
import { calculateTicketsBreakdown, isNonBreadProduct } from '../../utils/productClassification';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from 'recharts';
import { Search, X } from 'lucide-react';

interface DailyPanNoPanChartProps {
  tickets: SaleTicket[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

export function getVendorCategory(name: string): { category: string; icon: string } {
  const n = name.toLowerCase();
  if (n.includes('paleta') || n.includes('helado') || n.includes('esquimal') || n.includes('nieve')) {
    return { category: 'Paletas Heladas', icon: '🍦' };
  }
  if (n.includes('queso') || n.includes('panela') || n.includes('oaxaca') || n.includes('manchego') || n.includes('ranchero')) {
    return { category: 'Quesos', icon: '🧀' };
  }
  if (n.includes('nata') || n.includes('miel') || n.includes('cajeta') || n.includes('complemento')) {
    return { category: 'Complementos', icon: '🍯' };
  }
  if (n.includes('gelatina') || n.includes('flan') || n.includes('arroz con leche') || n.includes('postre') || n.includes('mousse')) {
    return { category: 'Postres & Gelatinas', icon: '🍮' };
  }
  if (n.includes('leche') || n.includes('yogurt') || n.includes('yoghurt') || n.includes('crema') || n.includes('alpura') || n.includes('santa clara') || n.includes('lala')) {
    return { category: 'Lácteos', icon: '🍶' };
  }
  if (n.includes('coca') || n.includes('refresco') || n.includes('jugo') || n.includes('agua') || n.includes('café') || n.includes('cafe') || n.includes('boing')) {
    return { category: 'Refrescos & Bebidas', icon: '🥤' };
  }
  return { category: 'Otros Proveedores', icon: '📦' };
}

export const DailyPanNoPanChart: React.FC<DailyPanNoPanChartProps> = ({
  tickets,
  selectedDate,
  onSelectDate
}) => {
  // Selector de período: 'semana' | 'mes' | 'ano'
  const [timeframe, setTimeframe] = useState<'semana' | 'mes' | 'ano'>('semana');
  // Fecha/Periodo enfocado al dar click en la gráfica
  const [clickedDate, setClickedDate] = useState<string>(selectedDate);
  const [tableSearch, setTableSearch] = useState<string>('');

  // Actualizar clickedDate si cambia selectedDate externamente
  React.useEffect(() => {
    setClickedDate(selectedDate);
  }, [selectedDate]);

  // Construir serie según el timeframe seleccionado
  const chartData = useMemo(() => {
    const list: Array<{
      dateKey: string;
      label: string;
      fullLabel: string;
      panTotal: number;
      panPieces: number;
      noPanTotal: number;
      noPanPieces: number;
      total: number;
      ticketsCount: number;
      isSelected: boolean;
    }> = [];

    const baseDate = new Date(`${selectedDate}T12:00:00`);

    if (timeframe === 'semana') {
      // 7 días terminando o centrados en la fecha seleccionada
      for (let i = 6; i >= 0; i--) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() - i);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${day}`;

        const dayTickets = tickets.filter(t => (t.date || t.timestamp?.split('T')[0]) === dateStr);
        const breakdown = calculateTicketsBreakdown(dayTickets);

        const label = d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' });
        const fullLabel = d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' });

        list.push({
          dateKey: dateStr,
          label,
          fullLabel,
          panTotal: breakdown.breadTotal,
          panPieces: breakdown.breadPieces,
          noPanTotal: breakdown.nonBreadTotal,
          noPanPieces: breakdown.nonBreadPieces,
          total: breakdown.breadTotal + breakdown.nonBreadTotal,
          ticketsCount: dayTickets.length,
          isSelected: dateStr === clickedDate
        });
      }
    } else if (timeframe === 'mes') {
      // Días del mes correspondiente a selectedDate
      const year = baseDate.getFullYear();
      const month = baseDate.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayTickets = tickets.filter(t => (t.date || t.timestamp?.split('T')[0]) === dateStr);
        const breakdown = calculateTicketsBreakdown(dayTickets);

        list.push({
          dateKey: dateStr,
          label: `${day}`,
          fullLabel: `${day} de ${baseDate.toLocaleDateString('es-MX', { month: 'long' })}`,
          panTotal: breakdown.breadTotal,
          panPieces: breakdown.breadPieces,
          noPanTotal: breakdown.nonBreadTotal,
          noPanPieces: breakdown.nonBreadPieces,
          total: breakdown.breadTotal + breakdown.nonBreadTotal,
          ticketsCount: dayTickets.length,
          isSelected: dateStr === clickedDate
        });
      }
    } else {
      // Año: 12 meses
      const year = baseDate.getFullYear();
      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

      for (let m = 0; m < 12; m++) {
        const monthPrefix = `${year}-${String(m + 1).padStart(2, '0')}`;
        const monthTickets = tickets.filter(t => {
          const d = t.date || t.timestamp?.split('T')[0] || '';
          return d.startsWith(monthPrefix);
        });
        const breakdown = calculateTicketsBreakdown(monthTickets);

        list.push({
          dateKey: monthPrefix,
          label: monthNames[m],
          fullLabel: `${monthNames[m]} ${year}`,
          panTotal: breakdown.breadTotal,
          panPieces: breakdown.breadPieces,
          noPanTotal: breakdown.nonBreadTotal,
          noPanPieces: breakdown.nonBreadPieces,
          total: breakdown.breadTotal + breakdown.nonBreadTotal,
          ticketsCount: monthTickets.length,
          isSelected: clickedDate.startsWith(monthPrefix)
        });
      }
    }

    return list;
  }, [tickets, selectedDate, timeframe, clickedDate]);

  // Tickets correspondientes al período seleccionado/clickeado
  const activePeriodTickets = useMemo(() => {
    if (timeframe === 'ano') {
      const prefix = clickedDate.slice(0, 7); // 'YYYY-MM'
      return tickets.filter(t => (t.date || t.timestamp?.split('T')[0] || '').startsWith(prefix));
    }
    return tickets.filter(t => (t.date || t.timestamp?.split('T')[0]) === clickedDate);
  }, [tickets, clickedDate, timeframe]);

  // Desglose de artículos NO PAN para el período seleccionado
  const noPanProductsList = useMemo(() => {
    const map = new Map<string, {
      name: string;
      category: string;
      icon: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }>();

    activePeriodTickets.forEach(ticket => {
      (ticket.items || []).forEach(item => {
        if (isNonBreadProduct(item)) {
          const cleanName = (item.name || 'Artículo No Pan').trim();
          const key = cleanName.toLowerCase();
          const qty = Number(item.quantity) || 0;
          const total = Number(item.total ?? (qty * item.price)) || 0;
          const { category, icon } = getVendorCategory(cleanName);

          const existing = map.get(key);
          if (existing) {
            existing.quantity += qty;
            existing.total += total;
            existing.unitPrice = existing.total / existing.quantity;
          } else {
            map.set(key, {
              name: cleanName,
              category,
              icon,
              quantity: qty,
              unitPrice: qty > 0 ? total / qty : item.price,
              total
            });
          }
        }
      });
    });

    let result = Array.from(map.values()).sort((a, b) => b.quantity - a.quantity);
    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase().trim();
      result = result.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
    }
    return result;
  }, [activePeriodTickets, tableSearch]);

  const totalNoPanPieces = noPanProductsList.reduce((sum, p) => sum + p.quantity, 0);
  const totalNoPanMoney = noPanProductsList.reduce((sum, p) => sum + p.total, 0);

  // Totales del período activo
  const activePeriodMetrics = useMemo(() => {
    return chartData.find(d => d.isSelected) || chartData[chartData.length - 1];
  }, [chartData]);

  const panPct = activePeriodMetrics && activePeriodMetrics.total > 0
    ? Math.round((activePeriodMetrics.panTotal / activePeriodMetrics.total) * 100)
    : 0;
  const noPanPct = 100 - panPct;

  return (
    <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200 space-y-3.5">
      
      {/* Cabecera Sobria: Título, Botones Semana/Mes/Año y Leyenda */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-black text-slate-900 leading-tight">
            Venta de Pan vs No Pan
          </h3>
          <p className="text-[11px] text-slate-500 font-medium">
            Toca una barra para ver el desglose de productos No Pan
          </p>
        </div>

        {/* Botones sencillos: Semana, Mes, Año */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setTimeframe('semana')}
            className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
              timeframe === 'semana'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Semana
          </button>
          <button
            type="button"
            onClick={() => setTimeframe('mes')}
            className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
              timeframe === 'mes'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Mes
          </button>
          <button
            type="button"
            onClick={() => setTimeframe('ano')}
            className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
              timeframe === 'ano'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Año
          </button>
        </div>

        {/* Leyenda sobria */}
        <div className="flex items-center gap-2.5 text-xs font-bold">
          <div className="flex items-center gap-1.5 text-amber-800">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500"></span>
            <span>Pan</span>
          </div>
          <div className="flex items-center gap-1.5 text-purple-800">
            <span className="w-2.5 h-2.5 rounded-sm bg-purple-600"></span>
            <span>No Pan</span>
          </div>
        </div>
      </div>

      {/* Gráfico de Barras Apiladas */}
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart 
            data={chartData} 
            margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
            onClick={(state: any) => {
              if (state && state.activePayload && state.activePayload.length > 0) {
                const item = state.activePayload[0].payload;
                if (item?.dateKey) {
                  setClickedDate(item.dateKey);
                  if (item.dateKey.length === 10) {
                    onSelectDate(item.dateKey);
                  }
                }
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
            <XAxis 
              dataKey="label" 
              tick={{ fontSize: 10, fontWeight: 700, fill: '#475569' }}
              axisLine={{ stroke: '#E2E8F0' }}
            />
            <YAxis 
              tick={{ fontSize: 9, fontWeight: 600, fill: '#94A3B8' }}
              axisLine={{ stroke: '#E2E8F0' }}
              tickFormatter={(v) => `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`}
            />
            <Tooltip
              formatter={(value: any, name: any) => [
                `$${Number(value || 0).toLocaleString('es-MX')}.00`,
                name === 'panTotal' ? 'Panadería' : 'No Pan (Proveedores)'
              ]}
              labelFormatter={(label, payload) => {
                const item = payload && payload[0] ? (payload[0].payload as any) : null;
                return item ? `${item.fullLabel} • Total: $${item.total.toLocaleString('es-MX')}.00` : label;
              }}
              contentStyle={{
                backgroundColor: '#0F172A',
                borderRadius: '12px',
                color: '#FFF',
                fontWeight: 'bold',
                fontSize: '11px',
                border: 'none',
                boxShadow: '0 8px 20px -4px rgba(0,0,0,0.25)'
              }}
            />
            <Bar 
              dataKey="panTotal" 
              name="panTotal" 
              stackId="sales" 
              fill="#F59E0B" 
              radius={[0, 0, 3, 3]} 
              cursor="pointer"
            />
            <Bar 
              dataKey="noPanTotal" 
              name="noPanTotal" 
              stackId="sales" 
              fill="#8B5CF6" 
              radius={[4, 4, 0, 0]} 
              cursor="pointer"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Resumen del Período Clickeado */}
      {activePeriodMetrics && (
        <div className="grid grid-cols-3 gap-2 text-xs pt-1">
          <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-2.5">
            <span className="text-[10px] font-bold text-amber-800 block">Panadería ({panPct}%)</span>
            <span className="text-sm font-black font-mono text-amber-950">${activePeriodMetrics.panTotal.toLocaleString('es-MX')}.00</span>
            <span className="text-[10px] text-amber-700 block">{activePeriodMetrics.panPieces} pzs</span>
          </div>

          <div className="bg-purple-50/70 border border-purple-200/80 rounded-xl p-2.5">
            <span className="text-[10px] font-bold text-purple-800 block">No Pan ({noPanPct}%)</span>
            <span className="text-sm font-black font-mono text-purple-950">${activePeriodMetrics.noPanTotal.toLocaleString('es-MX')}.00</span>
            <span className="text-[10px] text-purple-700 block">{activePeriodMetrics.noPanPieces} pzs</span>
          </div>

          <div className="bg-slate-900 text-white rounded-xl p-2.5">
            <span className="text-[10px] font-bold text-slate-400 block">{activePeriodMetrics.fullLabel}</span>
            <span className="text-sm font-black font-mono text-emerald-400">${activePeriodMetrics.total.toLocaleString('es-MX')}.00</span>
            <span className="text-[10px] text-slate-300 block">{activePeriodMetrics.ticketsCount} tickets</span>
          </div>
        </div>
      )}

      {/* =========================================================================
          TABLA DE DESGLOSE DE PRODUCTOS NO PAN (PIEZAS Y TOTALES)
          ========================================================================= */}
      <div className="pt-2 border-t border-slate-100 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base">🥛</span>
            <div>
              <h4 className="text-xs font-black text-slate-900 leading-tight">
                Desglose de Ventas No Pan ({activePeriodMetrics?.fullLabel || clickedDate})
              </h4>
              <p className="text-[10px] text-slate-500 font-medium">
                {totalNoPanPieces} piezas vendidas • Total: ${totalNoPanMoney.toLocaleString('es-MX')}.00
              </p>
            </div>
          </div>

          {/* Buscador de artículos */}
          {noPanProductsList.length > 5 && (
            <div className="relative w-44">
              <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar artículo..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-2 py-1 text-[11px] font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              {tableSearch && (
                <button
                  type="button"
                  onClick={() => setTableSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Tabla Limpia y Sobria */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          {noPanProductsList.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400 font-bold">
              No se registraron ventas de artículos No Pan en {activePeriodMetrics?.fullLabel || clickedDate}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-black text-[10px] uppercase">
                    <th className="py-2 px-3">Producto</th>
                    <th className="py-2 px-3">Categoría</th>
                    <th className="py-2 px-3 text-center">Piezas Vendidas</th>
                    <th className="py-2 px-3 text-right">P. Unitario</th>
                    <th className="py-2 px-3 text-right">Total ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {noPanProductsList.map((p, idx) => (
                    <tr key={`${p.name}-${idx}`} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2 px-3 font-bold text-slate-900 flex items-center gap-1.5">
                        <span>{p.icon}</span>
                        <span>{p.name}</span>
                      </td>
                      <td className="py-2 px-3 text-slate-500 font-medium">
                        {p.category}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className="bg-purple-100 text-purple-900 px-2 py-0.5 rounded-md font-black font-mono text-[11px]">
                          {p.quantity} pzs
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right text-slate-600 font-mono">
                        ${p.unitPrice.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right font-black font-mono text-slate-900">
                        ${p.total.toLocaleString('es-MX')}.00
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-black text-slate-900 border-t border-slate-200 text-[11px]">
                    <td colSpan={2} className="py-2 px-3">Total No Pan ({noPanProductsList.length} productos)</td>
                    <td className="py-2 px-3 text-center text-purple-900 font-mono">{totalNoPanPieces} pzs</td>
                    <td></td>
                    <td className="py-2 px-3 text-right text-emerald-700 font-mono text-xs">
                      ${totalNoPanMoney.toLocaleString('es-MX')}.00
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

    </div>
  );
};
