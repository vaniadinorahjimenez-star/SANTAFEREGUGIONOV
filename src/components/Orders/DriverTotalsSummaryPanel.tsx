import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Eye,
  Printer,
  RefreshCw,
  Wifi,
  X,
  MessageCircle,
  CheckCircle2,
  Receipt
} from 'lucide-react';
import {
  BakeryOrder,
  DeliveryShift,
  DriverCustomer,
  Settings
} from '../../types';
import {
  formatLocalDate,
  getDailyDeliverySheet,
  getTodayString,
  getYesterdayString,
  loadDeliveryRunMeta,
  loadDriverCustomers,
  shiftLocalDate
} from '../../utils/storage';
import { getMondayOfWeek, MONTH_NAMES_ES, SHORT_DAY_NAMES_ES } from '../../utils/salesAnalyticsUtils';
import { printDriverConsolidatedTicketDirectToPrinter } from '../../utils/thermalPrinter';
import {
  onCloudSyncUpdated,
  syncDailyDeliveriesFromCloud
} from '../../services/cloudSyncService';
import {
  onPusherDelta,
  onPusherRefresh,
  onPusherStatusChange,
  getPusherStatus,
  PusherStatusInfo
} from '../../services/pusherService';
import { playBeep, playCashSound } from '../../utils/audio';

interface DriverTotalsSummaryPanelProps {
  driverCustomers: DriverCustomer[];
  orders?: BakeryOrder[];
  settings: Settings;
  activeDate?: string;
}

type PeriodMode = 'semana' | 'dia' | 'mes' | 'rango';

interface ShiftClientSummary {
  clientName: string;
  itemsSummary: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
  clientTotal: number;
  clientPieces: number;
  deliveryNumber?: number;
  deliveryTime?: string;
  previousDeliveryNote?: string;
}

interface ShiftSummaryResult {
  shift: DeliveryShift;
  shiftShortTitle: string; // "MADRUGADA" | "7 A 1:00 PM" | "1 A 10:00 PM"
  shiftFullTitle: string;
  totalAmount: number;
  totalPieces: number;
  clientSummaries: ShiftClientSummary[];
  breadBreakdown: Record<string, number>;
}

interface DaySummaryItem {
  dateStr: string;
  dayNum: number;
  monthShortUpper: string; // e.g. "NOV"
  dateLabelUpper: string; // e.g. "12 NOV"
  weekdayShort: string; // e.g. "Jue"
  shifts: [ShiftSummaryResult, ShiftSummaryResult, ShiftSummaryResult];
  dayTotalAmount: number;
  dayTotalPieces: number;
}

interface TicketModalState {
  driverId: 'osvaldo' | 'simon';
  driverName: string;
  dateStr: string;
  dateLabelUpper: string;
  shiftLabel: string;
  totalAmount: number;
  totalPieces: number;
  clientSummaries: ShiftClientSummary[];
  breadBreakdown: Record<string, number>;
}

const MONTH_SHORT_ES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

const SHIFT_CONFIGS: Array<{ shift: DeliveryShift; shortTitle: string; fullTitle: string }> = [
  { shift: 'madrugada', shortTitle: 'MADRUGADA', fullTitle: 'Madrugada (Pedidos Madrugada)' },
  { shift: 'manana', shortTitle: '7 A 1:00 PM', fullTitle: 'Mañana (7:00 a 1:00 PM)' },
  { shift: 'tarde', shortTitle: '1 A 10:00 PM', fullTitle: 'Tarde (1:00 a 10:00 PM)' }
];

function getOrderShift(order: BakeryOrder): DeliveryShift {
  const timeStr = (order.deliveryTime || '').trim();
  if (!timeStr) return 'manana';
  const match = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (!match) return 'manana';
  let hour = parseInt(match[1], 10);
  const upper = timeStr.toUpperCase();
  if (upper.includes('PM') && hour < 12) hour += 12;
  if (upper.includes('AM') && hour === 12) hour = 0;
  if (hour < 7) return 'madrugada';
  if (hour < 13) return 'manana';
  return 'tarde';
}

export const DriverTotalsSummaryPanel: React.FC<DriverTotalsSummaryPanelProps> = ({
  driverCustomers: propDriverCustomers,
  orders = [],
  settings,
  activeDate
}) => {
  const todayStr = getTodayString();
  const yesterdayStr = getYesterdayString();

  // Switch Osvaldo / Simón
  const [selectedDriver, setSelectedDriver] = useState<'osvaldo' | 'simon'>('osvaldo');

  // Filtro de período: toda la semana por defecto, o día, mes, rango personalizado
  const [periodMode, setPeriodMode] = useState<PeriodMode>('semana');
  const [anchorDate, setAnchorDate] = useState<string>(activeDate || todayStr);
  const [selectedMonth, setSelectedMonth] = useState<number>(() => new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [rangeStart, setRangeStart] = useState<string>(() => formatLocalDate(getMondayOfWeek(todayStr)));
  const [rangeEnd, setRangeEnd] = useState<string>(() => todayStr);
  const [hideEmptyMonthDays, setHideEmptyMonthDays] = useState<boolean>(false);

  // Estado de sincronización en vivo Firebase + Pusher
  const [syncTick, setSyncTick] = useState<number>(0);
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState<string>(() =>
    new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );
  const [pusherStatus, setPusherStatus] = useState<PusherStatusInfo>(() => getPusherStatus());

  // Modal de Consulta de Ticket
  const [ticketModal, setTicketModal] = useState<TicketModalState | null>(null);

  // Sincronizar fecha ancla si cambia la fecha activa en la hoja superior y el usuario está en modo día
  useEffect(() => {
    if (activeDate && /^\d{4}-\d{2}-\d{2}$/.test(activeDate)) {
      setAnchorDate(activeDate);
    }
  }, [activeDate]);

  // Escuchar en tiempo real: Firebase + Pusher + Storage + eventos locales
  useEffect(() => {
    const triggerRefresh = () => {
      setSyncTick(t => t + 1);
      setLastUpdatedLabel(
        new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    };

    const unsubPusherStatus = onPusherStatusChange((st) => setPusherStatus(st));
    const unsubPusherDelta = onPusherDelta(() => triggerRefresh());
    const unsubPusherRefresh = onPusherRefresh(() => {
      syncDailyDeliveriesFromCloud().then(() => triggerRefresh()).catch(() => {});
    });
    const unsubCloudSync = onCloudSyncUpdated(() => triggerRefresh());

    window.addEventListener('dailyDeliveryUpdated', triggerRefresh);
    window.addEventListener('storage', triggerRefresh);

    return () => {
      unsubPusherStatus();
      unsubPusherDelta();
      unsubPusherRefresh();
      unsubCloudSync();
      window.removeEventListener('dailyDeliveryUpdated', triggerRefresh);
      window.removeEventListener('storage', triggerRefresh);
    };
  }, []);

  const activeClients = useMemo(() => {
    const base = propDriverCustomers && propDriverCustomers.length > 0
      ? propDriverCustomers
      : loadDriverCustomers();
    const map = new Map<string, DriverCustomer>();
    base.forEach(c => {
      if (c && c.id && (c.driverId === 'osvaldo' || c.driverId === 'simon')) {
        map.set(c.id, c);
      }
    });
    return Array.from(map.values());
  }, [propDriverCustomers]);

  // Lista de fechas según el selector elegido (Semana, Día, Mes, Rango)
  const dateRange = useMemo(() => {
    if (periodMode === 'dia') {
      return [anchorDate];
    }

    if (periodMode === 'semana') {
      const monday = getMondayOfWeek(anchorDate);
      const list: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        list.push(formatLocalDate(d));
      }
      return list;
    }

    if (periodMode === 'mes') {
      const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      const mStr = String(selectedMonth + 1).padStart(2, '0');
      const list: string[] = [];
      for (let i = 1; i <= daysInMonth; i++) {
        list.push(`${selectedYear}-${mStr}-${String(i).padStart(2, '0')}`);
      }
      return list;
    }

    // Rango personalizado
    const start = rangeStart <= rangeEnd ? rangeStart : rangeEnd;
    const end = rangeStart <= rangeEnd ? rangeEnd : rangeStart;
    const list: string[] = [];
    let cursor = start;
    let guard = 0;
    while (cursor <= end && guard < 62) {
      list.push(cursor);
      cursor = shiftLocalDate(cursor, 1);
      guard++;
    }
    return list;
  }, [periodMode, anchorDate, selectedMonth, selectedYear, rangeStart, rangeEnd]);

  // Al cambiar fechas visibles, traer datos frescos de Firestore + Servidor/Pusher en segundo plano
  const handleManualCloudSync = useCallback(async () => {
    setIsSyncingCloud(true);
    try {
      await syncDailyDeliveriesFromCloud(dateRange.slice(0, 14));
      setSyncTick(t => t + 1);
      setLastUpdatedLabel(
        new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    } finally {
      setIsSyncingCloud(false);
    }
  }, [dateRange]);

  useEffect(() => {
    syncDailyDeliveriesFromCloud(dateRange.slice(0, 14)).catch(() => {});
  }, [dateRange]);

  // Calcular resumen exacto de un turno para un chofer en una fecha
  const computeShiftSummary = useCallback(
    (dateStr: string, driverId: 'osvaldo' | 'simon', shiftCfg: typeof SHIFT_CONFIGS[number]): ShiftSummaryResult => {
      const sheet = getDailyDeliverySheet(dateStr, shiftCfg.shift);
      const metaMap = loadDeliveryRunMeta(dateStr, shiftCfg.shift);

      let totalAmount = 0;
      let totalPieces = 0;
      const firstSummaries: ShiftClientSummary[] = [];
      const repeatedSummaries: ShiftClientSummary[] = [];
      const breadBreakdown: Record<string, number> = {};

      const driverClients = activeClients.filter(c => c.driverId === driverId);

      driverClients.forEach(client => {
        const baseItems = client.items && client.items.length > 0
          ? client.items
          : [
              { breadName: 'Bolillo', unitPrice: 4.00 },
              { breadName: 'Dulce', unitPrice: 8.50 }
            ];
        const isCampoGolf =
          client.id === 'dc_osv_campogolf' ||
          client.name.toLowerCase().includes('campo de golf');
        const items =
          isCampoGolf && !baseItems.some(it => it.breadName.toLowerCase().includes('bolillo'))
            ? [...baseItems, { breadName: 'Bolillo', unitPrice: 0.00 }]
            : baseItems;

        const prefix = `${client.id}__run_`;
        const runKeys = new Set<string>([client.id]);
        Object.keys(sheet).forEach(k => {
          if (k === client.id || k.startsWith(prefix)) runKeys.add(k);
        });
        Object.keys(metaMap).forEach(k => {
          if (k === client.id || k.startsWith(prefix)) runKeys.add(k);
        });

        const sortedKeys = Array.from(runKeys).sort((a, b) => {
          if (a === client.id) return -1;
          if (b === client.id) return 1;
          const numA = parseInt(a.replace(prefix, ''), 10) || 0;
          const numB = parseInt(b.replace(prefix, ''), 10) || 0;
          return numA - numB;
        });

        let prevSummaryRef: { pieces: number; amount: number; time: string } | null = null;

        sortedKeys.forEach((key, index) => {
          const clientQty = sheet[key] || {};
          let runPieces = 0;
          let runAmount = 0;
          const itemsSummary: Array<{ name: string; quantity: number; unitPrice: number; total: number }> = [];

          items.forEach(it => {
            const q = Number(clientQty[it.breadName] || 0);
            if (q > 0) {
              const itemTotal = q * Number(it.unitPrice || 0);
              runPieces += q;
              runAmount += itemTotal;
              itemsSummary.push({
                name: it.breadName,
                quantity: q,
                unitPrice: Number(it.unitPrice || 0),
                total: itemTotal
              });
              const bKey = (it.breadName || 'Pan').trim();
              breadBreakdown[bKey] = (breadBreakdown[bKey] || 0) + q;
            }
          });

          if (runPieces > 0) {
            const deliveryNumber = index + 1;
            const meta = metaMap[key];
            const defaultTime =
              shiftCfg.shift === 'madrugada'
                ? '05:30 AM'
                : shiftCfg.shift === 'manana'
                ? '07:00 AM'
                : '01:30 PM';
            const time = meta?.time || defaultTime;

            let previousDeliveryNote: string | undefined;
            if (deliveryNumber > 1 && prevSummaryRef) {
              previousDeliveryNote = `${prevSummaryRef.pieces} pzs a las ${prevSummaryRef.time} ($${prevSummaryRef.amount.toFixed(2)})`;
            }

            prevSummaryRef = { pieces: runPieces, amount: runAmount, time };
            totalPieces += runPieces;
            totalAmount += runAmount;

            const entry: ShiftClientSummary = {
              clientName: deliveryNumber > 1 ? `${client.name} (Vuelta #${deliveryNumber})` : client.name,
              itemsSummary,
              clientTotal: runAmount,
              clientPieces: runPieces,
              deliveryNumber,
              deliveryTime: time,
              previousDeliveryNote
            };

            if (deliveryNumber === 1) {
              firstSummaries.push(entry);
            } else {
              repeatedSummaries.push(entry);
            }
          }
        });
      });

      // Incluir también encargos especiales (BakeryOrder) asignados a este repartidor en esta fecha y turno
      orders.forEach(order => {
        if (order.deliveryDate === dateStr && order.assignedDriverId === driverId) {
          if (getOrderShift(order) === shiftCfg.shift) {
            const orderPieces = order.items.reduce((s, it) => s + Number(it.quantity || 0), 0);
            const orderItems = order.items.map(it => {
              const bKey = (it.name || 'Pan').trim();
              breadBreakdown[bKey] = (breadBreakdown[bKey] || 0) + Number(it.quantity || 0);
              return {
                name: it.name,
                quantity: Number(it.quantity || 0),
                unitPrice: Number(it.unitPrice || 0),
                total: Number(it.total || 0)
              };
            });
            totalPieces += orderPieces;
            totalAmount += Number(order.total || 0);
            firstSummaries.push({
              clientName: `${order.customerName} [Encargo #${order.folio}]`,
              itemsSummary: orderItems,
              clientTotal: Number(order.total || 0),
              clientPieces: orderPieces,
              deliveryNumber: 1,
              deliveryTime: order.deliveryTime || ''
            });
          }
        }
      });

      repeatedSummaries.sort((a, b) => (a.deliveryNumber || 1) - (b.deliveryNumber || 1));

      return {
        shift: shiftCfg.shift,
        shiftShortTitle: shiftCfg.shortTitle,
        shiftFullTitle: shiftCfg.fullTitle,
        totalAmount,
        totalPieces,
        clientSummaries: [...firstSummaries, ...repeatedSummaries],
        breadBreakdown
      };
    },
    [activeClients, orders]
  );

  // Construir lista de días con sus 3 turnos para el repartidor activo
  const daysList: DaySummaryItem[] = useMemo(() => {
    // Dependencia explícita de syncTick para refrescar tras actualizaciones en tiempo real
    void syncTick;
    return dateRange.map(dStr => {
      const parts = dStr.split('-');
      const year = parseInt(parts[0], 10);
      const monthIdx = parseInt(parts[1], 10) - 1;
      const dayNum = parseInt(parts[2], 10);
      const d = new Date(year, monthIdx, dayNum, 12, 0, 0);
      const monthShortUpper = MONTH_SHORT_ES[monthIdx] || '';
      const dateLabelUpper = `${dayNum} ${monthShortUpper}`;
      const weekdayShort = SHORT_DAY_NAMES_ES[d.getDay()] || '';

      const sMadrugada = computeShiftSummary(dStr, selectedDriver, SHIFT_CONFIGS[0]);
      const sManana = computeShiftSummary(dStr, selectedDriver, SHIFT_CONFIGS[1]);
      const sTarde = computeShiftSummary(dStr, selectedDriver, SHIFT_CONFIGS[2]);

      const dayTotalAmount = sMadrugada.totalAmount + sManana.totalAmount + sTarde.totalAmount;
      const dayTotalPieces = sMadrugada.totalPieces + sManana.totalPieces + sTarde.totalPieces;

      return {
        dateStr: dStr,
        dayNum,
        monthShortUpper,
        dateLabelUpper,
        weekdayShort,
        shifts: [sMadrugada, sManana, sTarde],
        dayTotalAmount,
        dayTotalPieces
      };
    });
  }, [dateRange, selectedDriver, computeShiftSummary, syncTick]);

  const visibleDays = useMemo(() => {
    if (periodMode === 'mes' && hideEmptyMonthDays) {
      return daysList.filter(d => d.dayTotalAmount > 0 || d.dayTotalPieces > 0);
    }
    return daysList;
  }, [daysList, periodMode, hideEmptyMonthDays]);

  // Gran Total del período seleccionado (para hacer cuentas con Osvaldo / Simón)
  const periodTotals = useMemo(() => {
    let totalAmount = 0;
    let totalPieces = 0;
    let madrugadaAmount = 0;
    let mananaAmount = 0;
    let tardeAmount = 0;

    daysList.forEach(d => {
      totalAmount += d.dayTotalAmount;
      totalPieces += d.dayTotalPieces;
      madrugadaAmount += d.shifts[0].totalAmount;
      mananaAmount += d.shifts[1].totalAmount;
      tardeAmount += d.shifts[2].totalAmount;
    });

    return {
      totalAmount,
      totalPieces,
      madrugadaAmount,
      mananaAmount,
      tardeAmount
    };
  }, [daysList]);

  // Etiqueta amigable del rango/período actual
  const periodLabel = useMemo(() => {
    if (periodMode === 'dia') {
      const day = daysList[0];
      return day ? `${day.weekdayShort} ${day.dateLabelUpper}` : anchorDate;
    }
    if (periodMode === 'semana' && daysList.length >= 7) {
      const first = daysList[0];
      const last = daysList[daysList.length - 1];
      return `Semana: ${first.dateLabelUpper} al ${last.dateLabelUpper}`;
    }
    if (periodMode === 'mes') {
      return `${MONTH_NAMES_ES[selectedMonth]} ${selectedYear}`;
    }
    return `Del ${rangeStart} al ${rangeEnd}`;
  }, [periodMode, daysList, anchorDate, selectedMonth, selectedYear, rangeStart, rangeEnd]);

  // Navegar semana o día anterior / siguiente
  const handleStepPeriod = (delta: number) => {
    playBeep(620, 'sine', 0.03);
    if (periodMode === 'dia') {
      setAnchorDate(prev => shiftLocalDate(prev, delta));
    } else if (periodMode === 'semana') {
      setAnchorDate(prev => shiftLocalDate(prev, delta * 7));
    } else if (periodMode === 'mes') {
      const d = new Date(selectedYear, selectedMonth + delta, 1);
      setSelectedMonth(d.getMonth());
      setSelectedYear(d.getFullYear());
    }
  };

  // Abrir Modal para Ver Ticket de un turno específico
  const handleOpenShiftTicket = (day: DaySummaryItem, shiftRes: ShiftSummaryResult) => {
    playBeep(700, 'sine', 0.03);
    setTicketModal({
      driverId: selectedDriver,
      driverName: selectedDriver === 'osvaldo' ? 'Osvaldo' : 'Simón',
      dateStr: day.dateStr,
      dateLabelUpper: day.dateLabelUpper,
      shiftLabel: shiftRes.shiftShortTitle,
      totalAmount: shiftRes.totalAmount,
      totalPieces: shiftRes.totalPieces,
      clientSummaries: shiftRes.clientSummaries,
      breadBreakdown: shiftRes.breadBreakdown
    });
  };

  // Abrir Modal para Ver Ticket completo del Día (3 turnos juntos)
  const handleOpenFullDayTicket = (day: DaySummaryItem) => {
    playBeep(700, 'sine', 0.03);
    const combinedClients: ShiftClientSummary[] = [];
    const combinedBread: Record<string, number> = {};

    day.shifts.forEach(s => {
      s.clientSummaries.forEach(cs => {
        combinedClients.push({
          ...cs,
          clientName: `${cs.clientName} (${s.shiftShortTitle})`
        });
      });
      Object.entries(s.breadBreakdown).forEach(([bName, qty]) => {
        combinedBread[bName] = (combinedBread[bName] || 0) + qty;
      });
    });

    setTicketModal({
      driverId: selectedDriver,
      driverName: selectedDriver === 'osvaldo' ? 'Osvaldo' : 'Simón',
      dateStr: day.dateStr,
      dateLabelUpper: day.dateLabelUpper,
      shiftLabel: 'DÍA COMPLETO (3 TURNOS)',
      totalAmount: day.dayTotalAmount,
      totalPieces: day.dayTotalPieces,
      clientSummaries: combinedClients,
      breadBreakdown: combinedBread
    });
  };

  const handlePrintModalTicket = () => {
    if (!ticketModal) return;
    playCashSound();
    printDriverConsolidatedTicketDirectToPrinter(
      ticketModal.driverName,
      ticketModal.dateStr,
      ticketModal.clientSummaries,
      ticketModal.totalAmount,
      ticketModal.totalPieces,
      settings,
      ticketModal.shiftLabel
    );
  };

  const handleWhatsAppModalTicket = () => {
    if (!ticketModal) return;
    playBeep(750, 'sine', 0.03);
    const lines = [
      `*PANADERÍA SANTA FÉ - CUENTA REPARTO*`,
      `Repartidor: *${ticketModal.driverName}*`,
      `Fecha: *${ticketModal.dateLabelUpper}* (${ticketModal.dateStr})`,
      `Turno: *${ticketModal.shiftLabel}*`,
      `--------------------------------`,
      ...ticketModal.clientSummaries.map(
        (c, i) => `${i + 1}. ${c.clientName}: ${c.clientPieces} pzs - *$${c.clientTotal.toFixed(2)}*`
      ),
      `--------------------------------`,
      `Total Piezas: *${ticketModal.totalPieces} pzs*`,
      `*TOTAL A ENTREGAR: $${ticketModal.totalAmount.toFixed(2)}*`
    ].join('\n');
    window.open(`https://wa.me/?text=${encodeURIComponent(lines)}`, '_blank');
  };

  const isOsvaldo = selectedDriver === 'osvaldo';

  return (
    <section
      id="driver-totals-quick-summary"
      className="bg-white rounded-3xl border-2 border-slate-200 shadow-sm overflow-hidden"
    >
      {/* 1. HEADER + SWITCH OSVALDO / SIMÓN + CONEXIÓN FIREBASE + PUSHER */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black text-lg shadow-xs">
              📊
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black tracking-tight text-white">
                Vista Rápida de Totales (Cuentas de Reparto)
              </h3>
              <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px] text-slate-300 font-semibold">
                <span className="inline-flex items-center gap-1 text-emerald-300 font-bold">
                  <Wifi className="w-3 h-3" />
                  <span>
                    Firebase + Pusher {pusherStatus.state === 'connected' ? 'En Vivo' : 'Activo'}
                  </span>
                </span>
                <span className="text-slate-500">•</span>
                <span>Act. {lastUpdatedLabel}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* SWITCH OSVALDO / SIMÓN */}
            <div
              role="group"
              aria-label="Seleccionar repartidor"
              className="flex items-center bg-slate-950/80 p-1 rounded-2xl border border-slate-700 gap-1"
            >
              <button
                id="driver-summary-switch-osvaldo"
                type="button"
                onClick={() => {
                  playBeep(680, 'sine', 0.03);
                  setSelectedDriver('osvaldo');
                }}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                  isOsvaldo
                    ? 'bg-amber-500 text-slate-950 shadow-md scale-[1.02]'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <span>🛵</span>
                <span>OSVALDO</span>
              </button>
              <button
                id="driver-summary-switch-simon"
                type="button"
                onClick={() => {
                  playBeep(680, 'sine', 0.03);
                  setSelectedDriver('simon');
                }}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                  !isOsvaldo
                    ? 'bg-blue-500 text-white shadow-md scale-[1.02]'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <span>🚴</span>
                <span>SIMÓN</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleManualCloudSync}
              disabled={isSyncingCloud}
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-black flex items-center gap-1.5 border border-white/15 transition-all cursor-pointer disabled:opacity-60"
              title="Actualizar totales desde Firebase y Pusher"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCloud ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sincronizar</span>
            </button>
          </div>
        </div>

        {/* 2. SELECTOR DE PERÍODO Y FECHAS (SEMANA / DÍA / MES / RANGO) */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2.5 border-t border-white/10">
          {/* Tabs de modo */}
          <div className="flex items-center bg-slate-950/60 p-1 rounded-xl gap-1 border border-white/10">
            {[
              { id: 'semana' as PeriodMode, label: 'Toda la Semana' },
              { id: 'dia' as PeriodMode, label: 'Por Día' },
              { id: 'mes' as PeriodMode, label: 'Por Mes' },
              { id: 'rango' as PeriodMode, label: 'Rango Fechas' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  playBeep(600, 'sine', 0.02);
                  setPeriodMode(tab.id);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  periodMode === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Controles de fecha específicos según el modo */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(periodMode === 'semana' || periodMode === 'dia') && (
              <>
                <button
                  type="button"
                  onClick={() => handleStepPeriod(-1)}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                  title={periodMode === 'semana' ? 'Semana anterior' : 'Día anterior'}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-1.5 bg-white/10 px-2.5 py-1 rounded-lg border border-white/15">
                  <Calendar className="w-3.5 h-3.5 text-amber-300" />
                  <input
                    type="date"
                    value={anchorDate}
                    onChange={(e) => e.target.value && setAnchorDate(e.target.value)}
                    className="bg-transparent text-white text-xs font-bold focus:outline-none cursor-pointer [color-scheme:dark]"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => handleStepPeriod(1)}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                  title={periodMode === 'semana' ? 'Semana siguiente' : 'Día siguiente'}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setAnchorDate(todayStr)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-black cursor-pointer transition-all ${
                    anchorDate === todayStr
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                >
                  {periodMode === 'semana' ? 'Esta Semana' : 'Hoy'}
                </button>

                {periodMode === 'dia' && (
                  <button
                    type="button"
                    onClick={() => setAnchorDate(yesterdayStr)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-black cursor-pointer transition-all ${
                      anchorDate === yesterdayStr
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-white/10 hover:bg-white/20 text-white'
                    }`}
                  >
                    Ayer
                  </button>
                )}
              </>
            )}

            {periodMode === 'mes' && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleStepPeriod(-1)}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="bg-slate-800 border border-white/20 text-white text-xs font-bold rounded-lg px-2.5 py-1.5 focus:outline-none cursor-pointer"
                >
                  {MONTH_NAMES_ES.map((m, idx) => (
                    <option key={m} value={idx}>{m}</option>
                  ))}
                </select>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="bg-slate-800 border border-white/20 text-white text-xs font-bold rounded-lg px-2.5 py-1.5 focus:outline-none cursor-pointer"
                >
                  {[2025, 2026, 2027].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => handleStepPeriod(1)}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setHideEmptyMonthDays(v => !v)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer border ${
                    hideEmptyMonthDays
                      ? 'bg-amber-400 text-slate-950 border-amber-400'
                      : 'bg-white/10 text-white border-white/15'
                  }`}
                >
                  {hideEmptyMonthDays ? 'Mostrando con venta' : 'Solo días con venta'}
                </button>
              </div>
            )}

            {periodMode === 'rango' && (
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded-lg border border-white/15">
                  <span className="text-[10px] text-slate-300 font-bold uppercase">De:</span>
                  <input
                    type="date"
                    value={rangeStart}
                    onChange={(e) => e.target.value && setRangeStart(e.target.value)}
                    className="bg-transparent text-white text-xs font-bold focus:outline-none cursor-pointer [color-scheme:dark]"
                  />
                </div>
                <div className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded-lg border border-white/15">
                  <span className="text-[10px] text-slate-300 font-bold uppercase">A:</span>
                  <input
                    type="date"
                    value={rangeEnd}
                    onChange={(e) => e.target.value && setRangeEnd(e.target.value)}
                    className="bg-transparent text-white text-xs font-bold focus:outline-none cursor-pointer [color-scheme:dark]"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. TOTAL GENERAL DEL PERÍODO PARA HACER CUENTAS */}
      <div
        className={`px-4 py-3 border-b flex flex-wrap items-center justify-between gap-3 ${
          isOsvaldo
            ? 'bg-amber-50/90 border-amber-200'
            : 'bg-blue-50/90 border-blue-200'
        }`}
      >
        <div>
          <span
            className={`text-[10px] font-black uppercase tracking-wider block ${
              isOsvaldo ? 'text-amber-800' : 'text-blue-800'
            }`}
          >
            {isOsvaldo ? '🛵 CUENTA OSVALDO' : '🚴 CUENTA SIMÓN'} • {periodLabel}
          </span>
          <div className="flex items-baseline gap-2.5 mt-0.5">
            <span className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-slate-900">
              ${periodTotals.totalAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs font-black text-slate-600 tabular-nums">
              ({periodTotals.totalPieces.toLocaleString('es-MX')} pzs)
            </span>
          </div>
        </div>

        {/* Totales por turno acumulados en el período */}
        <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
          <div className="bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-500 block uppercase">Madrugada</span>
            <strong className="font-mono font-black text-slate-900">
              ${periodTotals.madrugadaAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </strong>
          </div>
          <div className="bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-500 block uppercase">7 a 1:00 PM</span>
            <strong className="font-mono font-black text-slate-900">
              ${periodTotals.mananaAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </strong>
          </div>
          <div className="bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-500 block uppercase">1 a 10:00 PM</span>
            <strong className="font-mono font-black text-slate-900">
              ${periodTotals.tardeAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </strong>
          </div>
        </div>
      </div>

      {/* 4. LISTA COMPACTA SOLAMENTE DE LOS TOTALES POR DÍA Y TURNO + BOTÓN VER TICKET */}
      <div className="p-3 sm:p-4 bg-slate-50/70 space-y-2.5">
        {visibleDays.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 text-xs font-bold text-slate-500">
            Sin repartos registrados para este período.
          </div>
        ) : (
          visibleDays.map(day => {
            const isToday = day.dateStr === todayStr;
            const hasDayActivity = day.dayTotalAmount > 0 || day.dayTotalPieces > 0;

            return (
              <div
                key={day.dateStr}
                className={`bg-white rounded-2xl border overflow-hidden transition-all ${
                  isToday
                    ? isOsvaldo
                      ? 'border-amber-400 ring-1 ring-amber-200 shadow-xs'
                      : 'border-blue-400 ring-1 ring-blue-200 shadow-xs'
                    : 'border-slate-200'
                }`}
              >
                {/* Cabecera compacta del Día */}
                <div className="px-3.5 py-2 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-xs sm:text-sm text-slate-900 uppercase">
                      {day.weekdayShort} {day.dateLabelUpper}
                    </span>
                    {isToday && (
                      <span className="bg-emerald-600 text-white text-[9px] font-black uppercase px-1.5 py-0.5 rounded">
                        Hoy
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-black font-mono tabular-nums text-slate-900">
                      Total Día: ${day.dayTotalAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {hasDayActivity && (
                      <button
                        type="button"
                        onClick={() => handleOpenFullDayTicket(day)}
                        className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-950 text-white text-[10px] font-black flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                        title="Ver ticket completo del día (3 turnos)"
                      >
                        <Receipt className="w-3 h-3" />
                        <span>Ticket Día</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 3 Filas limpias: MADRUGADA, 7 A 1:00 PM, 1 A 10:00 PM */}
                <div className="divide-y divide-slate-100">
                  {day.shifts.map(shiftRes => {
                    const hasData = shiftRes.totalAmount > 0 || shiftRes.totalPieces > 0;
                    return (
                      <div
                        key={`${day.dateStr}_${shiftRes.shift}`}
                        className="px-3.5 py-1.5 flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              hasData
                                ? isOsvaldo
                                  ? 'bg-amber-500'
                                  : 'bg-blue-600'
                                : 'bg-slate-300'
                            }`}
                          />
                          <span className="text-xs sm:text-sm font-black text-slate-800 tracking-tight truncate">
                            {day.dateLabelUpper} {shiftRes.shiftShortTitle}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span
                            className={`text-sm sm:text-base font-black font-mono tabular-nums ${
                              hasData ? 'text-slate-900' : 'text-slate-400'
                            }`}
                          >
                            ${shiftRes.totalAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleOpenShiftTicket(day, shiftRes)}
                            disabled={!hasData}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-black flex items-center gap-1 transition-all ${
                              hasData
                                ? isOsvaldo
                                  ? 'bg-amber-100 hover:bg-amber-500 text-amber-950 hover:text-slate-950 border border-amber-300 cursor-pointer active:scale-95'
                                  : 'bg-blue-100 hover:bg-blue-600 text-blue-950 hover:text-white border border-blue-300 cursor-pointer active:scale-95'
                                : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                            }`}
                          >
                            <Eye className="w-3 h-3" />
                            <span>Ver Ticket</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 5. MODAL PARA CONSULTAR E IMPRIMIR EL TICKET DEL REPARTIDOR */}
      {ticketModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in"
          onClick={() => setTicketModal(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Modal */}
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="font-black text-xs sm:text-sm">
                  Ticket {ticketModal.driverName} • {ticketModal.dateLabelUpper} {ticketModal.shiftLabel}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setTicketModal(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Vista Previa Tipo Ticket Térmico Legible */}
            <div className="p-4 overflow-y-auto bg-slate-100 flex justify-center">
              <div
                className="bg-white w-full max-w-[300px] p-4 rounded-xl border border-slate-300 shadow-sm text-black"
                style={{
                  fontFamily: "'Arial', 'Helvetica Neue', Helvetica, sans-serif",
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                <div className="text-center border-b-2 border-dashed border-black pb-2 mb-2">
                  <div className="text-sm font-black uppercase">
                    {settings.bakeryName || 'Panadería Santa Fé'}
                  </div>
                  <div className="text-[11px] font-bold mt-0.5">CONSOLIDADO DE REPARTO</div>
                  <div className="text-xs font-black mt-1">
                    REPARTIDOR: {ticketModal.driverName.toUpperCase()}
                  </div>
                  <div className="text-[11px] font-bold">
                    {ticketModal.dateLabelUpper} ({ticketModal.dateStr}) • {ticketModal.shiftLabel}
                  </div>
                </div>

                {/* Clientes surtidos */}
                <div className="space-y-2 border-b-2 border-dashed border-black pb-2 mb-2">
                  <div className="text-[10.5px] font-black uppercase">
                    Clientes Surtidos ({ticketModal.clientSummaries.length}):
                  </div>
                  {ticketModal.clientSummaries.length === 0 ? (
                    <div className="text-xs text-center py-2 font-bold">Sin entregas registradas</div>
                  ) : (
                    ticketModal.clientSummaries.map((c, idx) => (
                      <div key={idx} className="border-b border-dotted border-slate-400 pb-1.5 last:border-b-0">
                        <div className="flex justify-between items-baseline text-xs font-black">
                          <span className="pr-2">
                            #{idx + 1} {c.clientName}
                          </span>
                          <span className="shrink-0">${c.clientTotal.toFixed(2)}</span>
                        </div>
                        <div className="text-[10.5px] font-bold text-slate-800 leading-snug">
                          {c.itemsSummary
                            .map(it => `${it.quantity}x ${it.name} ($${it.unitPrice.toFixed(2)})`)
                            .join(', ')}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Desglose total de piezas por pan */}
                {Object.keys(ticketModal.breadBreakdown).length > 0 && (
                  <div className="bg-slate-100 border border-black rounded p-2 mb-2">
                    <div className="text-[10.5px] font-black text-center border-b border-dashed border-black pb-1 mb-1 uppercase">
                      Resumen Total de Piezas
                    </div>
                    {Object.entries(ticketModal.breadBreakdown).map(([bName, qty]) => (
                      <div key={bName} className="flex justify-between text-[11px] font-bold">
                        <span>• {bName}</span>
                        <span className="font-black">{qty} pzs</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Total Final */}
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-xs font-bold">
                    <span>TOTAL PIEZAS:</span>
                    <span>{ticketModal.totalPieces} pzs</span>
                  </div>
                  <div className="flex justify-between text-base font-black border-t-2 border-dashed border-black pt-1.5">
                    <span>TOTAL:</span>
                    <span>${ticketModal.totalAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Acciones */}
            <div className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handlePrintModalTicket}
                className="flex-1 bg-slate-900 hover:bg-black text-white font-black py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Ticket</span>
              </button>
              <button
                type="button"
                onClick={handleWhatsAppModalTicket}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp</span>
              </button>
              <button
                type="button"
                onClick={() => setTicketModal(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 px-3 rounded-xl text-xs cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
