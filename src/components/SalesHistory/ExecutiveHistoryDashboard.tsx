import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Printer,
  FileSpreadsheet,
  ArrowUpRight,
  ChevronDown
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell
} from 'recharts';
import {
  SaleTicket,
  BakeryOrder,
  VipOrder,
  DriverCustomer
} from '../../types';
import {
  formatLocalDate,
  getTodayString,
  getDailyDeliverySheet,
  getNormalizedDriverCustomerItems,
  shiftLocalDate
} from '../../utils/storage';
import {
  extractTicketDate,
  extractOrderDate,
  getMondayOfWeek,
  isDeliveryTicket,
  isDeliveryOrder,
  MONTH_NAMES_ES
} from '../../utils/salesAnalyticsUtils';
import { isNonBreadProduct } from '../../utils/productClassification';
import {
  fetchHistoryMonthDataset,
  HistoryMonthDataset,
  SociosDailyDeliveryRow
} from '../../services/supabase';

export type ExecutivePeriodMode = 'dia' | 'semana' | 'mes';
export type ExecutiveBranchScope = 'todas' | 'zakia' | 'refugio';
export type BottomDrawerSection =
  | null
  | 'tickets'
  | 'cortes'
  | 'repartos'
  | 'vip'
  | 'por_cobrar'
  | 'roscas';

interface ExecutiveHistoryDashboardProps {
  tickets: SaleTicket[];
  orders: BakeryOrder[];
  vipOrders: VipOrder[];
  driverCustomers: DriverCustomer[];
  selectedDate: string;
  periodMode: ExecutivePeriodMode;
  branchScope: ExecutiveBranchScope;
  onChangePeriodMode: (mode: ExecutivePeriodMode) => void;
  onChangeBranchScope: (scope: ExecutiveBranchScope) => void;
  onSelectDate: (dateStr: string) => void;
  onSyncCloud: () => void;
  isSyncingCloud: boolean;
  onPrintFullDay: () => void;
  onExportCSV: () => void;
  onOpenDrawer: (drawer: BottomDrawerSection) => void;
  activeDrawer: BottomDrawerSection;
  turno1Total: number;
  turno2Total: number;
  displayGlobalPending: number;
  deliverySyncVersion: number;
}

interface DailyBucket {
  date: string;
  zakiaSales: number;
  zakiaTickets: number;
  zakiaCash: number;
  zakiaCard: number;
  zakiaPieces: number;
  refugioSales: number;
  refugioTickets: number;
  refugioCash: number;
  refugioCard: number;
  refugioPieces: number;
  repartoSales: number;
  simonSales: number;
  osvaldoSales: number;
  repartoCount: number;
  vipSales: number;
  vipCollected: number;
  vipPending: number;
  vipCount: number;
  totalSales: number;
  totalPieces: number;
}

const WEEKDAY_HEADERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const WEEKDAY_LABELS_MON_FIRST = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const WEEKDAY_FULL_MON_FIRST = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo'
];

function formatMoney(amount: number): string {
  return `$${Math.round(amount || 0).toLocaleString('es-MX')}`;
}

function formatCompactMoney(amount: number): string {
  const n = Math.round(amount || 0);
  if (n <= 0) return '';
  if (n >= 10000) return `$${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `$${n.toLocaleString('es-MX')}`;
}

function extractVipDate(vo: VipOrder, fallback: string): string {
  if (vo.date && /^\d{4}-\d{2}-\d{2}$/.test(vo.date.trim())) return vo.date.trim();
  if (vo.createdAt) {
    const parsed = new Date(vo.createdAt);
    if (!isNaN(parsed.getTime())) return formatLocalDate(parsed);
    return vo.createdAt.split('T')[0];
  }
  return fallback;
}

function getMonthBounds(year: number, monthIdx: number): { start: string; end: string; daysInMonth: number } {
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const mm = String(monthIdx + 1).padStart(2, '0');
  const start = `${year}-${mm}-01`;
  const end = `${year}-${mm}-${String(daysInMonth).padStart(2, '0')}`;
  return { start, end, daysInMonth };
}

function normalizeNonBreadLabel(rawName: string): string {
  const clean = (rawName || 'Producto').trim();
  if (!clean) return 'Otros';
  // Normalizar variaciones menores manteniendo precios claros
  return clean.replace(/\s+/g, ' ');
}

export const ExecutiveHistoryDashboard: React.FC<ExecutiveHistoryDashboardProps> = ({
  tickets,
  orders,
  vipOrders,
  driverCustomers,
  selectedDate,
  periodMode,
  branchScope,
  onChangePeriodMode,
  onChangeBranchScope,
  onSelectDate,
  onSyncCloud,
  isSyncingCloud,
  onPrintFullDay,
  onExportCSV,
  onOpenDrawer,
  activeDrawer,
  turno1Total,
  turno2Total,
  displayGlobalPending,
  deliverySyncVersion
}) => {
  const todayStr = getTodayString();

  // Mes visible en el calendario (sincronizado con selectedDate cuando cambia de mes)
  const [viewYear, setViewYear] = useState<number>(() => {
    const d = new Date(`${selectedDate || todayStr}T12:00:00`);
    return isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
  });
  const [viewMonthIdx, setViewMonthIdx] = useState<number>(() => {
    const d = new Date(`${selectedDate || todayStr}T12:00:00`);
    return isNaN(d.getTime()) ? new Date().getMonth() : d.getMonth();
  });

  // Controles de gráficas de decisión
  const [weekdayMetricMode, setWeekdayMetricMode] = useState<'promedio' | 'total'>('promedio');
  const [weekdayChannel, setWeekdayChannel] = useState<'general' | 'mostrador' | 'reparto'>('general');
  const [showAllNonBread, setShowAllNonBread] = useState<boolean>(false);

  // Caché mensual desde Supabase para que TODOS los días del calendario tengan montos reales
  const monthCacheRef = useRef<Map<string, HistoryMonthDataset>>(new Map());
  const [cloudMonthData, setCloudMonthData] = useState<HistoryMonthDataset | null>(null);
  const [isLoadingMonth, setIsLoadingMonth] = useState<boolean>(false);

  const monthKey = `${viewYear}-${String(viewMonthIdx + 1).padStart(2, '0')}`;

  useEffect(() => {
    let cancelled = false;
    const cached = monthCacheRef.current.get(monthKey);
    if (cached) {
      setCloudMonthData(cached);
    }

    const { start, end } = getMonthBounds(viewYear, viewMonthIdx);
    setIsLoadingMonth(true);
    fetchHistoryMonthDataset(start, end)
      .then((res) => {
        if (cancelled) return;
        if (res) {
          monthCacheRef.current.set(monthKey, res);
          setCloudMonthData(res);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoadingMonth(false);
      });

    return () => {
      cancelled = true;
    };
  }, [monthKey, viewYear, viewMonthIdx, deliverySyncVersion]);

  // Combinar datos en vivo (props) + histórico mensual de Supabase sin duplicar
  const mergedTickets = useMemo(() => {
    const map = new Map<string, SaleTicket>();
    if (cloudMonthData?.tickets) {
      for (const t of cloudMonthData.tickets) {
        if (t && (t.id || t.folio)) map.set(String(t.id || t.folio), t);
      }
    }
    for (const t of tickets) {
      if (t && (t.id || t.folio)) map.set(String(t.id || t.folio), t);
    }
    return Array.from(map.values());
  }, [cloudMonthData, tickets]);

  const mergedOrders = useMemo(() => {
    const map = new Map<string, BakeryOrder>();
    if (cloudMonthData?.orders) {
      for (const o of cloudMonthData.orders) {
        if (o && o.id) map.set(String(o.id), o);
      }
    }
    for (const o of orders) {
      if (o && o.id) map.set(String(o.id), o);
    }
    return Array.from(map.values());
  }, [cloudMonthData, orders]);

  const mergedVipOrders = useMemo(() => {
    const map = new Map<string, VipOrder>();
    if (cloudMonthData?.vipOrders) {
      for (const vo of cloudMonthData.vipOrders) {
        if (vo && vo.id) map.set(String(vo.id), vo);
      }
    }
    for (const vo of vipOrders) {
      if (vo && vo.id) map.set(String(vo.id), vo);
    }
    return Array.from(map.values());
  }, [cloudMonthData, vipOrders]);

  const mergedDriverCustomers = useMemo(() => {
    const map = new Map<string, DriverCustomer>();
    if (cloudMonthData?.driverCustomers) {
      for (const c of cloudMonthData.driverCustomers) {
        if (c && c.id) map.set(String(c.id), c);
      }
    }
    for (const c of driverCustomers) {
      if (c && c.id) map.set(String(c.id), c);
    }
    return Array.from(map.values());
  }, [cloudMonthData, driverCustomers]);

  const activeDeliveryClients = useMemo(
    () => mergedDriverCustomers.filter((c) => c.driverId === 'simon' || c.driverId === 'osvaldo'),
    [mergedDriverCustomers]
  );

  // Mapa rápido de hojas diarias de reparto desde Supabase (clave: `${date}_${shift}`)
  const cloudDeliverySheetMap = useMemo(() => {
    const map = new Map<string, SociosDailyDeliveryRow['quantities']>();
    if (cloudMonthData?.dailyDeliveries) {
      for (const row of cloudMonthData.dailyDeliveries) {
        if (row.date && row.shift && row.quantities) {
          map.set(`${row.date}_${row.shift}`, row.quantities);
        }
      }
    }
    return map;
  }, [cloudMonthData]);

  // Calcular rango activo según Diario / Semanal / Mensual
  const { activeDates, periodLabel, weekRangeSet } = useMemo(() => {
    const { daysInMonth } = getMonthBounds(viewYear, viewMonthIdx);
    const mm = String(viewMonthIdx + 1).padStart(2, '0');
    const monthDates: string[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      monthDates.push(`${viewYear}-${mm}-${String(day).padStart(2, '0')}`);
    }

    const monday = getMondayOfWeek(selectedDate || todayStr);
    const mondayStr = formatLocalDate(monday);
    const weekDates: string[] = [];
    for (let i = 0; i < 7; i++) {
      weekDates.push(shiftLocalDate(mondayStr, i));
    }

    if (periodMode === 'mes') {
      return {
        activeDates: monthDates,
        periodLabel: `${MONTH_NAMES_ES[viewMonthIdx]} ${viewYear}`,
        weekRangeSet: new Set<string>()
      };
    }

    if (periodMode === 'semana') {
      const startObj = new Date(`${weekDates[0]}T12:00:00`);
      const endObj = new Date(`${weekDates[6]}T12:00:00`);
      const startLabel = `${startObj.getDate()} ${(MONTH_NAMES_ES[startObj.getMonth()] || '').slice(0, 3).toLowerCase()}`;
      const endLabel = `${endObj.getDate()} ${(MONTH_NAMES_ES[endObj.getMonth()] || '').slice(0, 3).toLowerCase()}`;
      return {
        activeDates: weekDates,
        periodLabel: `Semana ${startLabel} – ${endLabel}`,
        weekRangeSet: new Set(weekDates)
      };
    }

    const selObj = new Date(`${selectedDate || todayStr}T12:00:00`);
    const dowMonFirst = (selObj.getDay() + 6) % 7;
    const dayLabel = `${WEEKDAY_FULL_MON_FIRST[dowMonFirst]} ${selObj.getDate()} ${(MONTH_NAMES_ES[selObj.getMonth()] || '').slice(0, 3).toLowerCase()}`;
    return {
      activeDates: [selectedDate || todayStr],
      periodLabel: dayLabel,
      weekRangeSet: new Set<string>()
    };
  }, [periodMode, selectedDate, todayStr, viewYear, viewMonthIdx]);

  // Todos los días necesarios para el mes visible + la semana activa (por si cruza de mes)
  const relevantDates = useMemo(() => {
    const set = new Set<string>(activeDates);
    const { daysInMonth } = getMonthBounds(viewYear, viewMonthIdx);
    const mm = String(viewMonthIdx + 1).padStart(2, '0');
    for (let day = 1; day <= daysInMonth; day++) {
      set.add(`${viewYear}-${mm}-${String(day).padStart(2, '0')}`);
    }
    return Array.from(set).sort();
  }, [activeDates, viewYear, viewMonthIdx]);

  // Calcular desglose exacto por fecha (Mostrador Zakia, Mostrador Refugio, Reparto Simón/Osvaldo, VIP)
  const dailyBucketsMap = useMemo(() => {
    void deliverySyncVersion;
    const map = new Map<string, DailyBucket>();
    const ensure = (date: string): DailyBucket => {
      let b = map.get(date);
      if (!b) {
        b = {
          date,
          zakiaSales: 0,
          zakiaTickets: 0,
          zakiaCash: 0,
          zakiaCard: 0,
          zakiaPieces: 0,
          refugioSales: 0,
          refugioTickets: 0,
          refugioCash: 0,
          refugioCard: 0,
          refugioPieces: 0,
          repartoSales: 0,
          simonSales: 0,
          osvaldoSales: 0,
          repartoCount: 0,
          vipSales: 0,
          vipCollected: 0,
          vipPending: 0,
          vipCount: 0,
          totalSales: 0,
          totalPieces: 0
        };
        map.set(date, b);
      }
      return b;
    };

    const relevantSet = new Set(relevantDates);
    for (const d of relevantDates) ensure(d);

    // Control para no duplicar tickets de reparto con hojas diarias
    const repTicketKeysByDate = new Map<string, Set<string>>();

    for (const t of mergedTickets) {
      const d = extractTicketDate(t);
      if (!relevantSet.has(d)) continue;
      const b = ensure(d);
      const amt = Number(t.total) || 0;
      const pcs = (t.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);

      if (isDeliveryTicket(t)) {
        let keys = repTicketKeysByDate.get(d);
        if (!keys) {
          keys = new Set<string>();
          repTicketKeysByDate.set(d, keys);
        }
        if (t.id) keys.add(t.id);
        if (t.customerName && t.deliveryShift) {
          keys.add(`name_${t.customerName.toLowerCase()}_${t.deliveryShift}`);
        }
        b.repartoSales += amt;
        b.repartoCount += 1;
        b.totalPieces += pcs;
        if (t.driverId === 'osvaldo') b.osvaldoSales += amt;
        else b.simonSales += amt;
      } else if (t.branch === 'zakia') {
        b.zakiaSales += amt;
        b.zakiaTickets += 1;
        b.zakiaPieces += pcs;
        b.totalPieces += pcs;
        if (t.paymentMethod === 'tarjeta') b.zakiaCard += amt;
        else b.zakiaCash += amt;
      } else {
        b.refugioSales += amt;
        b.refugioTickets += 1;
        b.refugioPieces += pcs;
        b.totalPieces += pcs;
        if (t.paymentMethod === 'tarjeta') b.refugioCard += amt;
        else b.refugioCash += amt;
      }
    }

    // Hojas diarias de reparto (Supabase + localStorage sin duplicar)
    for (const d of relevantDates) {
      if (d > todayStr) continue;
      const b = ensure(d);
      const repKeys = repTicketKeysByDate.get(d) || new Set<string>();

      (['madrugada', 'manana', 'tarde'] as const).forEach((shift) => {
        const localSheet = getDailyDeliverySheet(d, shift) || {};
        const cloudSheet = cloudDeliverySheetMap.get(`${d}_${shift}`) || {};
        const mergedSheet: Record<string, Record<string, number>> = { ...cloudSheet };
        for (const [cid, itemsMap] of Object.entries(localSheet)) {
          mergedSheet[cid] = { ...(mergedSheet[cid] || {}), ...(itemsMap || {}) };
        }

        for (const client of activeDeliveryClients) {
          const repId = `rep_${d}_${shift}_${client.id}`;
          const nameKey = `name_${(client.name || '').toLowerCase()}_${shift}`;
          if (repKeys.has(repId) || repKeys.has(nameKey)) continue;

          const clientQty = mergedSheet[client.id];
          if (!clientQty) continue;

          let cTotal = 0;
          let cPieces = 0;
          const items = getNormalizedDriverCustomerItems(client);
          for (const it of items) {
            const q = Number(clientQty[it.breadName]) || 0;
            if (q > 0) {
              cPieces += q;
              cTotal += q * it.unitPrice;
            }
          }
          if (cTotal > 0) {
            b.repartoSales += cTotal;
            b.repartoCount += 1;
            b.totalPieces += cPieces;
            if (client.driverId === 'osvaldo') b.osvaldoSales += cTotal;
            else b.simonSales += cTotal;
          }
        }
      });
    }

    // Pedidos (Reparto especial + Tienda/VIP)
    for (const o of mergedOrders) {
      const d = extractOrderDate(o);
      if (!relevantSet.has(d)) continue;
      const b = ensure(d);
      const amt = Number(o.total) || 0;
      const pcs = (o.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
      if (isDeliveryOrder(o)) {
        b.repartoSales += amt;
        b.repartoCount += 1;
        b.totalPieces += pcs;
        if (o.assignedDriverId === 'osvaldo') b.osvaldoSales += amt;
        else b.simonSales += amt;
      } else {
        const collected =
          o.paymentStatus === 'pagado'
            ? amt
            : Math.min(amt, (o.deposit || 0) + (o.collectedAmount || 0));
        b.vipSales += amt;
        b.vipCollected += collected;
        b.vipPending += Math.max(0, amt - collected);
        b.vipCount += 1;
        b.totalPieces += pcs;
      }
    }

    // Pedidos Clientes VIP (módulo VIP)
    for (const vo of mergedVipOrders) {
      const d = extractVipDate(vo, todayStr);
      if (!relevantSet.has(d)) continue;
      const b = ensure(d);
      const amt = Number(vo.totalAmount) || 0;
      const isPaid = vo.paymentStatus === 'pagado' || vo.isAudited;
      b.vipSales += amt;
      if (isPaid) b.vipCollected += amt;
      else b.vipPending += amt;
      b.vipCount += 1;
    }

    for (const b of map.values()) {
      b.totalSales = b.zakiaSales + b.refugioSales + b.repartoSales + b.vipSales;
    }

    return map;
  }, [
    relevantDates,
    mergedTickets,
    mergedOrders,
    mergedVipOrders,
    activeDeliveryClients,
    cloudDeliverySheetMap,
    todayStr,
    deliverySyncVersion
  ]);

  // Totales agregados para el período activo (Diario / Semanal / Mensual)
  const periodSummary = useMemo(() => {
    let zakiaSales = 0;
    let zakiaTickets = 0;
    let zakiaCash = 0;
    let zakiaCard = 0;
    let refugioSales = 0;
    let refugioTickets = 0;
    let refugioCash = 0;
    let refugioCard = 0;
    let repartoSales = 0;
    let simonSales = 0;
    let osvaldoSales = 0;
    let repartoCount = 0;
    let vipSales = 0;
    let vipCollected = 0;
    let vipPending = 0;
    let vipCount = 0;
    let totalPieces = 0;

    for (const d of activeDates) {
      const b = dailyBucketsMap.get(d);
      if (!b) continue;
      zakiaSales += b.zakiaSales;
      zakiaTickets += b.zakiaTickets;
      zakiaCash += b.zakiaCash;
      zakiaCard += b.zakiaCard;
      refugioSales += b.refugioSales;
      refugioTickets += b.refugioTickets;
      refugioCash += b.refugioCash;
      refugioCard += b.refugioCard;
      repartoSales += b.repartoSales;
      simonSales += b.simonSales;
      osvaldoSales += b.osvaldoSales;
      repartoCount += b.repartoCount;
      vipSales += b.vipSales;
      vipCollected += b.vipCollected;
      vipPending += b.vipPending;
      vipCount += b.vipCount;
      totalPieces += b.totalPieces;
    }

    const mostradorSales = zakiaSales + refugioSales;
    const mostradorTickets = zakiaTickets + refugioTickets;
    const mostradorCash = zakiaCash + refugioCash;
    const mostradorCard = zakiaCard + refugioCard;
    const grandTotal = mostradorSales + repartoSales + vipSales;
    const zakiaPct = mostradorSales > 0 ? Math.round((zakiaSales / mostradorSales) * 100) : 0;
    const refugioPct = mostradorSales > 0 ? Math.max(0, 100 - zakiaPct) : 0;

    return {
      grandTotal,
      mostradorSales,
      mostradorTickets,
      mostradorCash,
      mostradorCard,
      zakiaSales,
      zakiaTickets,
      zakiaPct,
      refugioSales,
      refugioTickets,
      refugioPct,
      repartoSales,
      simonSales,
      osvaldoSales,
      repartoCount,
      vipSales,
      vipCollected,
      vipPending,
      vipCount,
      totalPieces
    };
  }, [activeDates, dailyBucketsMap]);

  // Celdas del calendario mensual (estilo Google Flights: Lunes a Domingo)
  const calendarData = useMemo(() => {
    const { daysInMonth } = getMonthBounds(viewYear, viewMonthIdx);
    const mm = String(viewMonthIdx + 1).padStart(2, '0');
    const firstDayObj = new Date(viewYear, viewMonthIdx, 1, 12, 0, 0);
    const leadingBlanks = (firstDayObj.getDay() + 6) % 7; // 0 = Lunes ... 6 = Domingo

    const dayValues: Array<{
      date: string;
      dayNum: number;
      amount: number;
      bucket: DailyBucket | undefined;
    }> = [];

    let monthTotal = 0;
    let activeDaysCount = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${viewYear}-${mm}-${String(day).padStart(2, '0')}`;
      const bucket = dailyBucketsMap.get(dateStr);
      const amount =
        branchScope === 'zakia'
          ? bucket?.zakiaSales || 0
          : branchScope === 'refugio'
          ? (bucket?.refugioSales || 0) + (bucket?.repartoSales || 0) + (bucket?.vipSales || 0)
          : bucket?.totalSales || 0;
      if (amount > 0) {
        monthTotal += amount;
        activeDaysCount += 1;
      }
      dayValues.push({ date: dateStr, dayNum: day, amount, bucket });
    }

    // Umbral de días "top" en verde esmeralda (top 25% de los días con venta del mes)
    const positiveAmounts = dayValues
      .filter((d) => d.amount > 0)
      .map((d) => d.amount)
      .sort((a, b) => b - a);
    const topCutoffIdx = Math.max(0, Math.ceil(positiveAmounts.length * 0.25) - 1);
    const topThreshold = positiveAmounts.length >= 4 ? positiveAmounts[topCutoffIdx] : positiveAmounts[0] || Infinity;

    return {
      leadingBlanks,
      days: dayValues.map((d) => ({
        ...d,
        isTopDay: d.amount > 0 && d.amount >= topThreshold
      })),
      monthTotal,
      activeDaysCount
    };
  }, [viewYear, viewMonthIdx, dailyBucketsMap, branchScope]);

  // Gráfica de Días de Mayor Venta (Lunes → Domingo) basada en todo el mes visible (para tomar decisiones reales)
  const weekdayChartAnalytics = useMemo(() => {
    const sums = Array.from({ length: 7 }, (_, i) => ({
      dowIdx: i, // 0=Lun ... 6=Dom
      label: WEEKDAY_LABELS_MON_FIRST[i],
      fullLabel: WEEKDAY_FULL_MON_FIRST[i],
      total: 0,
      daysCount: 0,
      pieces: 0
    }));

    const { daysInMonth } = getMonthBounds(viewYear, viewMonthIdx);
    const mm = String(viewMonthIdx + 1).padStart(2, '0');
    const sourceDates =
      periodMode === 'semana'
        ? activeDates
        : Array.from({ length: daysInMonth }, (_, idx) => `${viewYear}-${mm}-${String(idx + 1).padStart(2, '0')}`);

    for (const d of sourceDates) {
      if (d > todayStr) continue;
      const b = dailyBucketsMap.get(d);
      if (!b) continue;

      let amt = 0;
      if (weekdayChannel === 'mostrador') {
        amt =
          branchScope === 'zakia'
            ? b.zakiaSales
            : branchScope === 'refugio'
            ? b.refugioSales
            : b.zakiaSales + b.refugioSales;
      } else if (weekdayChannel === 'reparto') {
        amt = b.repartoSales;
      } else {
        amt =
          branchScope === 'zakia'
            ? b.zakiaSales
            : branchScope === 'refugio'
            ? b.refugioSales + b.repartoSales + b.vipSales
            : b.totalSales;
      }

      if (amt <= 0) continue;
      const dowMonFirst = (new Date(`${d}T12:00:00`).getDay() + 6) % 7;
      sums[dowMonFirst].total += amt;
      sums[dowMonFirst].daysCount += 1;
      sums[dowMonFirst].pieces += b.totalPieces;
    }

    const rows = sums.map((s) => {
      const avg = s.daysCount > 0 ? Math.round(s.total / s.daysCount) : 0;
      const value = weekdayMetricMode === 'promedio' ? avg : Math.round(s.total);
      return {
        ...s,
        avg,
        value
      };
    });

    const activeRows = rows.filter((r) => r.value > 0);
    const best = activeRows.reduce<(typeof rows)[0] | null>(
      (acc, r) => (!acc || r.value > acc.value ? r : acc),
      null
    );
    const worst =
      activeRows.length > 1
        ? activeRows.reduce<(typeof rows)[0] | null>(
            (acc, r) => (!acc || r.value < acc.value ? r : acc),
            null
          )
        : null;

    const avgAll =
      activeRows.length > 0
        ? activeRows.reduce((s, r) => s + r.value, 0) / activeRows.length
        : 0;
    const gapPct =
      best && worst && best.value > 0
        ? Math.round(((worst.value - best.value) / best.value) * 100)
        : 0;

    return {
      rows: rows.map((r) => ({
        ...r,
        isBest: Boolean(best && r.dowIdx === best.dowIdx && r.value > 0),
        isWorst: Boolean(worst && r.dowIdx === worst.dowIdx && r.dowIdx !== best?.dowIdx)
      })),
      best,
      worst,
      avgAll: Math.round(avgAll),
      gapPct,
      scopeNote: periodMode === 'semana' ? 'Semana activa' : `${MONTH_NAMES_ES[viewMonthIdx]} ${viewYear}`
    };
  }, [
    viewYear,
    viewMonthIdx,
    periodMode,
    activeDates,
    todayStr,
    dailyBucketsMap,
    weekdayChannel,
    branchScope,
    weekdayMetricMode
  ]);

  // Top Productos que NO son Pan Más Vendidos (en el período activo: Diario / Semanal / Mensual)
  const nonBreadAnalytics = useMemo(() => {
    const activeSet = new Set(activeDates);
    const productMap = new Map<string, { name: string; quantity: number; revenue: number }>();
    let mostradorTotalInScope = 0;
    let nonBreadTotal = 0;
    let nonBreadUnits = 0;

    for (const t of mergedTickets) {
      if (isDeliveryTicket(t)) continue;
      const d = extractTicketDate(t);
      if (!activeSet.has(d)) continue;
      const tBranch = t.branch || 'refugio';
      if (branchScope !== 'todas' && tBranch !== branchScope) continue;

      mostradorTotalInScope += Number(t.total) || 0;

      for (const it of t.items || []) {
        const nameLower = (it.name || '').toLowerCase();
        // Excluir Pan de Muerto explícitamente y quedarse únicamente con productos NO pan
        if (nameLower.includes('muerto')) continue;
        if (!isNonBreadProduct(it)) continue;

        const qty = Number(it.quantity) || 0;
        const rev = Number(it.total ?? qty * (Number(it.price) || 0)) || 0;
        if (qty <= 0 && rev <= 0) continue;

        const displayName = normalizeNonBreadLabel(it.name || 'Producto');
        const key = displayName.toLowerCase();
        const cur = productMap.get(key) || { name: displayName, quantity: 0, revenue: 0 };
        cur.quantity += qty;
        cur.revenue += rev;
        productMap.set(key, cur);

        nonBreadTotal += rev;
        nonBreadUnits += qty;
      }
    }

    const sorted = Array.from(productMap.values()).sort(
      (a, b) => b.revenue - a.revenue || b.quantity - a.quantity
    );
    const topRevenue = sorted[0]?.revenue || 1;
    const items = sorted.map((p) => ({
      ...p,
      pctOfNonBread: nonBreadTotal > 0 ? Math.round((p.revenue / nonBreadTotal) * 100) : 0,
      barWidthPct: Math.max(6, Math.round((p.revenue / topRevenue) * 100))
    }));

    const shareOfMostradorPct =
      mostradorTotalInScope > 0 ? Math.round((nonBreadTotal / mostradorTotalInScope) * 100) : 0;

    return {
      items,
      nonBreadTotal,
      nonBreadUnits,
      shareOfMostradorPct
    };
  }, [activeDates, mergedTickets, branchScope]);

  const handleStepMonth = (dir: -1 | 1) => {
    const d = new Date(viewYear, viewMonthIdx + dir, 1, 12, 0, 0);
    setViewYear(d.getFullYear());
    setViewMonthIdx(d.getMonth());
    if (periodMode !== 'mes') {
      const nextDate = formatLocalDate(d);
      onSelectDate(nextDate);
    }
  };

  const handleJumpToday = () => {
    const now = new Date(`${todayStr}T12:00:00`);
    setViewYear(now.getFullYear());
    setViewMonthIdx(now.getMonth());
    onSelectDate(todayStr);
    onChangePeriodMode('dia');
  };

  const handleCalendarDayClick = (dateStr: string) => {
    onSelectDate(dateStr);
    if (periodMode === 'mes') {
      onChangePeriodMode('dia');
    }
  };

  const visibleNonBread = showAllNonBread
    ? nonBreadAnalytics.items
    : nonBreadAnalytics.items.slice(0, 7);

  return (
    <div className="space-y-3">
      {/* BARRA SUPERIOR COMPACTA: TÍTULO + DIARIO/SEMANAL/MENSUAL + SUCURSAL + ACCIONES */}
      <div className="bg-white rounded-2xl border border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            Historial y Caja
          </h1>
          <span className="text-slate-300 hidden sm:inline" aria-hidden="true">·</span>
          <span className="text-xs font-medium text-slate-600 truncate">
            {periodLabel}
            {isLoadingMonth && ' · Actualizando mes...'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Switch Diario / Semanal / Mensual */}
          <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-lg">
            {([
              { id: 'dia', label: 'Diario' },
              { id: 'semana', label: 'Semanal' },
              { id: 'mes', label: 'Mensual' }
            ] as const).map((tab) => (
              <button
                key={tab.id}
                type="button"
                id={`exec-period-${tab.id}`}
                onClick={() => onChangePeriodMode(tab.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  periodMode === tab.id
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Switch Sucursal */}
          <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-lg">
            {([
              { id: 'todas', label: 'Todo' },
              { id: 'zakia', label: 'Zakia' },
              { id: 'refugio', label: 'El Refugio' }
            ] as const).map((b) => (
              <button
                key={b.id}
                type="button"
                id={`exec-branch-${b.id}`}
                onClick={() => onChangeBranchScope(b.id)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  branchScope === b.id
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>

          {/* Acciones compactas */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              id="cloud-sync-btn"
              onClick={onSyncCloud}
              disabled={isSyncingCloud}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              title="Sincronizar ventas en vivo"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCloud ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">Sincronizar</span>
            </button>
            <button
              type="button"
              id="print-full-day-btn"
              onClick={onPrintFullDay}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              title="Imprimir Corte Z del día"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Corte Z</span>
            </button>
            <button
              type="button"
              id="export-csv-btn"
              onClick={onExportCSV}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              title="Exportar CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* FILA 1: CALENDARIO ESTILO GOOGLE FLIGHTS (IZQ) + MONTOS EJECUTIVOS (DER) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        {/* CALENDARIO MENSUAL CON MONTO DEBAJO DE CADA DÍA */}
        <section className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-4 flex flex-col justify-between">
          <div>
            {/* Cabecera del mes */}
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={() => handleStepMonth(-1)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Mes anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-slate-900 capitalize">
                  {MONTH_NAMES_ES[viewMonthIdx]} {viewYear}
                </h2>
                <button
                  type="button"
                  onClick={handleJumpToday}
                  className="text-xs font-semibold text-[#1A73E8] hover:underline cursor-pointer whitespace-nowrap"
                >
                  Hoy
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleStepMonth(1)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Mes siguiente"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Encabezados L M X J V S D */}
            <div className="grid grid-cols-7 mb-1">
              {WEEKDAY_HEADERS.map((letter) => (
                <div
                  key={letter}
                  className="text-center text-[11px] font-medium text-slate-400 py-1 select-none"
                >
                  {letter}
                </div>
              ))}
            </div>

            {/* Rejilla de días */}
            <div className="grid grid-cols-7 gap-y-0.5">
              {Array.from({ length: calendarData.leadingBlanks }).map((_, i) => (
                <div key={`blank-${i}`} className="h-[46px]" />
              ))}

              {calendarData.days.map((day) => {
                const isSelectedDay = periodMode !== 'mes' && day.date === selectedDate;
                const isInWeekBand = periodMode === 'semana' && weekRangeSet.has(day.date);
                const isToday = day.date === todayStr;
                const isFuture = day.date > todayStr;
                const dowMonFirst = (new Date(`${day.date}T12:00:00`).getDay() + 6) % 7;
                const isWeekStart = isInWeekBand && dowMonFirst === 0;
                const isWeekEnd = isInWeekBand && dowMonFirst === 6;

                const tooltipText = day.bucket
                  ? `${day.date} — Total ${formatMoney(day.bucket.totalSales)} | Mostrador ${formatMoney(day.bucket.zakiaSales + day.bucket.refugioSales)} (Zakia ${formatMoney(day.bucket.zakiaSales)}, Refugio ${formatMoney(day.bucket.refugioSales)}) | Reparto ${formatMoney(day.bucket.repartoSales)} | VIP ${formatMoney(day.bucket.vipSales)}`
                  : day.date;

                return (
                  <div
                    key={day.date}
                    className={`h-[46px] flex items-center justify-center ${
                      isInWeekBand ? 'bg-[#E8F0FE]' : ''
                    } ${isWeekStart ? 'rounded-l-full' : ''} ${isWeekEnd ? 'rounded-r-full' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => handleCalendarDayClick(day.date)}
                      title={tooltipText}
                      className={`w-[44px] h-[44px] rounded-full flex flex-col items-center justify-center transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#1A73E8] ${
                        isSelectedDay
                          ? 'bg-[#1A73E8] text-white'
                          : isToday
                          ? 'ring-1 ring-[#1A73E8] text-slate-900 hover:bg-slate-100'
                          : 'hover:bg-slate-100 text-slate-800'
                      } ${isFuture && day.amount === 0 ? 'opacity-40' : ''}`}
                    >
                      <span
                        className={`text-[13px] leading-none tabular-nums ${
                          isSelectedDay
                            ? 'font-semibold text-white'
                            : isToday
                            ? 'font-bold text-[#1A73E8]'
                            : 'font-medium text-slate-800'
                        }`}
                      >
                        {day.dayNum}
                      </span>
                      <span
                        className={`text-[9.5px] leading-none mt-1 tabular-nums ${
                          isSelectedDay
                            ? 'text-blue-50 font-medium'
                            : day.isTopDay
                            ? 'text-emerald-700 font-semibold'
                            : day.amount > 0
                            ? 'text-slate-500 font-normal'
                            : 'text-slate-300'
                        }`}
                      >
                        {day.amount > 0 ? formatCompactMoney(day.amount) : '—'}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pie de calendario ultra limpio */}
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span className="tabular-nums">
              {MONTH_NAMES_ES[viewMonthIdx]}:{' '}
              <strong className="text-slate-900 font-semibold">
                {formatMoney(calendarData.monthTotal)}
              </strong>{' '}
              · {calendarData.activeDaysCount} días con venta
            </span>
            <span className="text-emerald-700 font-medium">
              Verde = días más altos del mes
            </span>
          </div>
        </section>

        {/* RESUMEN FINANCIERO: MOSTRADOR (ZAKIA / REFUGIO) · REPARTO · VIP */}
        <section className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-4 flex flex-col justify-between">
          <div>
            {/* Total General del Período */}
            <div className="pb-3 border-b border-slate-100 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Venta total · {periodLabel}
                </p>
                <div className="text-3xl font-bold tracking-tight text-slate-900 tabular-nums mt-0.5">
                  {formatMoney(periodSummary.grandTotal)}
                </div>
                <p className="text-xs text-slate-500 tabular-nums mt-1">
                  {periodSummary.mostradorTickets} tickets mostrador · {periodSummary.totalPieces.toLocaleString('es-MX')} pzs · Efectivo {formatMoney(periodSummary.mostradorCash)} · Tarjeta {formatMoney(periodSummary.mostradorCard)}
                </p>
              </div>
              {periodMode !== 'mes' && (
                <button
                  type="button"
                  onClick={() => onChangePeriodMode('mes')}
                  className="text-xs font-semibold text-[#1A73E8] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Ver mes completo
                </button>
              )}
            </div>

            {/* BLOQUE MOSTRADOR + COMPARATIVA ZAKIA VS EL REFUGIO */}
            <div className="py-3 border-b border-slate-100">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700">Mostrador total</span>
                <span className="text-lg font-bold text-slate-900 tabular-nums">
                  {formatMoney(periodSummary.mostradorSales)}
                </span>
              </div>

              {/* Barra proporcional Zakia vs El Refugio */}
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex my-2">
                <div
                  className="bg-emerald-600 h-full transition-all"
                  style={{ width: `${periodSummary.zakiaPct}%` }}
                  title={`Zakia ${periodSummary.zakiaPct}%`}
                />
                <div
                  className="bg-[#D95D39] h-full transition-all"
                  style={{ width: `${periodSummary.refugioPct}%` }}
                  title={`El Refugio ${periodSummary.refugioPct}%`}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-0.5">
                <button
                  type="button"
                  onClick={() => onChangeBranchScope(branchScope === 'zakia' ? 'todas' : 'zakia')}
                  className={`text-left rounded-lg px-2 py-1.5 -mx-2 transition-colors cursor-pointer ${
                    branchScope === 'zakia' ? 'bg-emerald-50/80' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs font-medium text-emerald-800">
                    Zakia · {periodSummary.zakiaPct}%
                  </div>
                  <div className="text-base font-bold text-slate-900 tabular-nums">
                    {formatMoney(periodSummary.zakiaSales)}
                  </div>
                  <div className="text-[11px] text-slate-500 tabular-nums">
                    {periodSummary.zakiaTickets} tickets
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => onChangeBranchScope(branchScope === 'refugio' ? 'todas' : 'refugio')}
                  className={`text-left rounded-lg px-2 py-1.5 -mx-2 transition-colors cursor-pointer ${
                    branchScope === 'refugio' ? 'bg-orange-50/80' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs font-medium text-[#B84524]">
                    El Refugio · {periodSummary.refugioPct}%
                  </div>
                  <div className="text-base font-bold text-slate-900 tabular-nums">
                    {formatMoney(periodSummary.refugioSales)}
                  </div>
                  <div className="text-[11px] text-slate-500 tabular-nums">
                    {periodSummary.refugioTickets} tickets
                  </div>
                </button>
              </div>
            </div>

            {/* BLOQUE REPARTO + CLIENTES VIP */}
            <div className="grid grid-cols-2 divide-x divide-slate-100 py-3 border-b border-slate-100">
              <div className="pr-3">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-sky-800">Reparto</span>
                  <button
                    type="button"
                    onClick={() => onOpenDrawer(activeDrawer === 'repartos' ? null : 'repartos')}
                    className="text-[11px] font-semibold text-sky-700 hover:underline inline-flex items-center gap-0.5 cursor-pointer whitespace-nowrap"
                  >
                    <span>Detalle</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-xl font-bold text-slate-900 tabular-nums mt-0.5">
                  {formatMoney(periodSummary.repartoSales)}
                </div>
                <div className="text-[11px] text-slate-500 tabular-nums mt-0.5 truncate">
                  Simón {formatMoney(periodSummary.simonSales)} · Osvaldo {formatMoney(periodSummary.osvaldoSales)}
                </div>
              </div>

              <div className="pl-3">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-violet-800">Clientes VIP</span>
                  <button
                    type="button"
                    onClick={() => onOpenDrawer(activeDrawer === 'vip' ? null : 'vip')}
                    className="text-[11px] font-semibold text-violet-700 hover:underline inline-flex items-center gap-0.5 cursor-pointer whitespace-nowrap"
                  >
                    <span>Detalle</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-xl font-bold text-slate-900 tabular-nums mt-0.5">
                  {formatMoney(periodSummary.vipSales)}
                </div>
                <div className="text-[11px] text-slate-500 tabular-nums mt-0.5 truncate">
                  Pagado {formatMoney(periodSummary.vipCollected)} · Pend. {formatMoney(periodSummary.vipPending)}
                </div>
              </div>
            </div>
          </div>

          {/* PIE DE RESUMEN: TURNOS T1/T2 Y POR COBRAR */}
          <div className="pt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="text-slate-600 tabular-nums">
              Turnos del día:{' '}
              <strong className="text-slate-900 font-semibold">T1 {formatMoney(turno1Total)}</strong>
              {' · '}
              <strong className="text-slate-900 font-semibold">T2 {formatMoney(turno2Total)}</strong>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onOpenDrawer(activeDrawer === 'cortes' ? null : 'cortes')}
                className="font-semibold text-slate-700 hover:text-slate-900 underline-offset-2 hover:underline cursor-pointer whitespace-nowrap"
              >
                Cortes y auditoría
              </button>
              {displayGlobalPending > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenDrawer(activeDrawer === 'por_cobrar' ? null : 'por_cobrar')}
                  className="font-semibold text-rose-700 hover:text-rose-900 tabular-nums cursor-pointer whitespace-nowrap"
                >
                  Por cobrar: {formatMoney(displayGlobalPending)}
                </button>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* FILA 2: GRÁFICA DÍAS DE MAYOR VENTA (LUN–DOM) + TOP PRODUCTOS NO PAN */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        {/* GRÁFICA: DÍAS DE MAYOR VENTA (LUNES A DOMINGO) PARA TOMAR DECISIONES */}
        <section className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-4 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Días de mayor venta (Lun – Dom)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                  {weekdayChartAnalytics.best ? (
                    <>
                      Mejor:{' '}
                      <strong className="text-emerald-700 font-semibold">
                        {weekdayChartAnalytics.best.fullLabel} ({formatMoney(weekdayChartAnalytics.best.value)})
                      </strong>
                      {weekdayChartAnalytics.worst && (
                        <>
                          {' · '}Menor:{' '}
                          <strong className="text-rose-700 font-semibold">
                            {weekdayChartAnalytics.worst.fullLabel} ({formatMoney(weekdayChartAnalytics.worst.value)}, {weekdayChartAnalytics.gapPct}%)
                          </strong>
                        </>
                      )}
                    </>
                  ) : (
                    `Sin ventas registradas en ${weekdayChartAnalytics.scopeNote}`
                  )}
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-lg text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setWeekdayMetricMode('promedio')}
                    className={`px-2 py-1 rounded-md cursor-pointer whitespace-nowrap ${
                      weekdayMetricMode === 'promedio'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600'
                    }`}
                  >
                    Promedio
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeekdayMetricMode('total')}
                    className={`px-2 py-1 rounded-md cursor-pointer whitespace-nowrap ${
                      weekdayMetricMode === 'total'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600'
                    }`}
                  >
                    Total
                  </button>
                </div>

                <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-lg text-[11px] font-semibold">
                  {([
                    { id: 'general', label: 'Todo' },
                    { id: 'mostrador', label: 'Mostr.' },
                    { id: 'reparto', label: 'Reparto' }
                  ] as const).map((ch) => (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => setWeekdayChannel(ch.id)}
                      className={`px-2 py-1 rounded-md cursor-pointer whitespace-nowrap ${
                        weekdayChannel === ch.id
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600'
                      }`}
                    >
                      {ch.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="h-[195px] w-full pt-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={weekdayChartAnalytics.rows}
                  margin={{ top: 6, right: 6, left: -14, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                  />
                  <Tooltip
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                      fontSize: '12px',
                      fontWeight: 600
                    }}
                    formatter={(value: any, _name: any, item: any) => {
                      const p = item?.payload;
                      const detail =
                        weekdayMetricMode === 'promedio'
                          ? `${formatMoney(Number(value || 0))} prom. (${p?.daysCount || 0} días · Total ${formatMoney(p?.total || 0)})`
                          : `${formatMoney(Number(value || 0))} total (${p?.daysCount || 0} días · Prom. ${formatMoney(p?.avg || 0)})`;
                      return [detail, p?.fullLabel || 'Venta'];
                    }}
                    labelFormatter={(_label, items) => items?.[0]?.payload?.fullLabel || _label}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={38}>
                    {weekdayChartAnalytics.rows.map((entry) => (
                      <Cell
                        key={`dow-${entry.dowIdx}`}
                        fill={
                          entry.isBest
                            ? '#059669'
                            : entry.isWorst
                            ? '#E11D48'
                            : '#1A73E8'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
            <span>Base: {weekdayChartAnalytics.scopeNote}</span>
            <span>
              Promedio semanal: <strong className="text-slate-800">{formatMoney(weekdayChartAnalytics.avgAll)}</strong>/día
            </span>
          </div>
        </section>

        {/* TOP PRODUCTOS QUE NO SON PAN MÁS VENDIDOS */}
        <section className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-4 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Productos No Pan más vendidos
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                  {formatMoney(nonBreadAnalytics.nonBreadTotal)} · {nonBreadAnalytics.nonBreadUnits.toLocaleString('es-MX')} unidades · {nonBreadAnalytics.shareOfMostradorPct}% del mostrador ({periodLabel})
                </p>
              </div>

              {nonBreadAnalytics.items.length > 7 && (
                <button
                  type="button"
                  onClick={() => setShowAllNonBread((v) => !v)}
                  className="text-xs font-semibold text-[#1A73E8] hover:underline whitespace-nowrap cursor-pointer"
                >
                  {showAllNonBread ? 'Ver top 7' : `Ver todos (${nonBreadAnalytics.items.length})`}
                </button>
              )}
            </div>

            {visibleNonBread.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                Sin ventas de productos No Pan registradas en {periodLabel}.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 mt-1 max-h-[215px] overflow-y-auto pr-1">
                {visibleNonBread.map((item, idx) => (
                  <div
                    key={item.name}
                    className="py-2 flex items-center gap-3 text-xs"
                  >
                    <span className="w-5 text-slate-400 font-semibold tabular-nums shrink-0">
                      {idx + 1}.
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-semibold text-slate-800 truncate">
                          {item.name}
                        </span>
                        <span className="text-slate-500 tabular-nums whitespace-nowrap shrink-0">
                          {item.quantity} pzs ·{' '}
                          <strong className="text-slate-900 font-semibold">
                            {formatMoney(item.revenue)}
                          </strong>{' '}
                          <span className="text-slate-400">({item.pctOfNonBread}%)</span>
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            idx === 0
                              ? 'bg-emerald-600'
                              : idx <= 2
                              ? 'bg-[#1A73E8]'
                              : 'bg-slate-400'
                          }`}
                          style={{ width: `${item.barWidthPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Lácteos, bebidas, café, galletas, postres, quesos, granola y complementos</span>
            <span className="font-medium text-slate-700 tabular-nums shrink-0 ml-2">
              {nonBreadAnalytics.items.length} productos
            </span>
          </div>
        </section>
      </div>

      {/* BARRA INFERIOR DE CONSULTAS OPCIONALES (TICKETS HASTA ABAJO, COLAPSADOS POR DEFECTO) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500 pl-2">
          Consultas detalladas (opcional):
        </span>

        <div className="flex flex-wrap items-center gap-1.5">
          {([
            {
              id: 'tickets' as const,
              label: `Consultar Tickets (${periodSummary.mostradorTickets})`
            },
            {
              id: 'cortes' as const,
              label: 'Cortes T1 / T2 y Auditoría'
            },
            {
              id: 'repartos' as const,
              label: `Reparto (${formatMoney(periodSummary.repartoSales)})`
            },
            {
              id: 'vip' as const,
              label: `Clientes VIP (${formatMoney(periodSummary.vipSales)})`
            },
            {
              id: 'por_cobrar' as const,
              label: `Por Cobrar (${formatMoney(displayGlobalPending)})`
            },
            {
              id: 'roscas' as const,
              label: 'Conteo Roscas'
            }
          ]).map((btn) => {
            const isActive = activeDrawer === btn.id;
            return (
              <button
                key={btn.id}
                type="button"
                id={`exec-drawer-btn-${btn.id}`}
                onClick={() => onOpenDrawer(isActive ? null : btn.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <span>{btn.label}</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${isActive ? 'rotate-180' : ''}`}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
