import React, { useState, useMemo, useEffect } from 'react';
import { Settings, DriverCustomer, BakeryOrder, SaleTicket } from '../../types';
import { 
  X, 
  Printer, 
  Truck, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  Check, 
  Clock, 
  DollarSign, 
  FileText,
  Eye,
  RefreshCw,
  Wallet
} from 'lucide-react';
import { playBeep, playCashSound } from '../../utils/audio';
import { 
  getTodayString, 
  getDailyDeliverySheet, 
  getDailyDeliveryPiecesCount,
  loadDriverCustomers,
  loadDeliveryRunMeta,
  getNextTicketFolio 
} from '../../utils/storage';
import { 
  printDeliveryClientTicketDirectToPrinter, 
  printDriverConsolidatedTicketDirectToPrinter 
} from '../../utils/thermalPrinter';
import { subscribeToDailyDelivery } from '../../services/firebase';

export interface DriverClientTicketItem {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone?: string;
  clientAddress?: string;
  driverId: 'osvaldo' | 'simon';
  driverName: string;
  date: string;
  shift: 'madrugada' | 'manana' | 'tarde';
  shiftLabel: string;
  items: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
  totalPieces: number;
  totalAmount: number;
  deliveryNumber?: number;
  deliveryTime?: string;
  previousDeliveryNote?: string;
  dayAccumulatedPieces?: number;
  dayAccumulatedAmount?: number;
}

interface DriverDailyTicketsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  driverCustomers?: DriverCustomer[];
  orders?: BakeryOrder[];
  initialDate?: string;
  onRegisterLiquidationToCash?: (ticket: SaleTicket) => void;
}

export const DriverDailyTicketsModal: React.FC<DriverDailyTicketsModalProps> = ({
  isOpen,
  onClose,
  settings,
  driverCustomers = [],
  orders = [],
  initialDate,
  onRegisterLiquidationToCash
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(initialDate || getTodayString());
  const [driverFilter, setDriverFilter] = useState<'todos' | 'osvaldo' | 'simon'>('todos');
  const [shiftFilter, setShiftFilter] = useState<'todos' | 'madrugada' | 'manana' | 'tarde'>('todos');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Daily delivery sheets data for the date (3 turnos)
  const [madrugadaSheet, setMadrugadaSheet] = useState<Record<string, Record<string, number>>>({});
  const [mananaSheet, setMananaSheet] = useState<Record<string, Record<string, number>>>({});
  const [tardeSheet, setTardeSheet] = useState<Record<string, Record<string, number>>>({});

  // Toast notice
  const [toastNotice, setToastNotice] = useState<string>('');
  const showToast = (msg: string) => {
    setToastNotice(msg);
    setTimeout(() => setToastNotice(''), 3500);
  };

  // Preview Modal for Single Ticket
  const [previewTicket, setPreviewTicket] = useState<DriverClientTicketItem | null>(null);

  // Load sheets when date changes + subscribe to real-time updates
  useEffect(() => {
    if (!isOpen) return;

    // Local load immediately
    setMadrugadaSheet(getDailyDeliverySheet(selectedDate, 'madrugada'));
    setMananaSheet(getDailyDeliverySheet(selectedDate, 'manana'));
    setTardeSheet(getDailyDeliverySheet(selectedDate, 'tarde'));

    // Real-time Firestore subscriptions for all 3 shifts
    const unsubMadrugada = subscribeToDailyDelivery(selectedDate, 'madrugada', (quantities) => {
      if (quantities) setMadrugadaSheet(quantities);
    });

    const unsubManana = subscribeToDailyDelivery(selectedDate, 'manana', (quantities) => {
      if (quantities) setMananaSheet(quantities);
    });

    const unsubTarde = subscribeToDailyDelivery(selectedDate, 'tarde', (quantities) => {
      if (quantities) setTardeSheet(quantities);
    });

    return () => {
      unsubMadrugada();
      unsubManana();
      unsubTarde();
    };
  }, [isOpen, selectedDate]);

  // Actual list of delivery clients (defaults if none provided)
  const activeClients = useMemo(() => {
    const list = driverCustomers.length > 0 ? driverCustomers : loadDriverCustomers();
    const map = new Map<string, DriverCustomer>();
    list.forEach(c => {
      if (c && c.id && (c.driverId === 'osvaldo' || c.driverId === 'simon')) {
        map.set(c.id, c);
      }
    });
    return Array.from(map.values());
  }, [driverCustomers]);

  // Helper to get client items
  const getClientBreadItems = (c: DriverCustomer) => {
    if (c.items && c.items.length > 0) return c.items;
    return [
      { breadName: 'Bolillo', unitPrice: 4.00 },
      { breadName: 'Dulce', unitPrice: 8.50 }
    ];
  };

  // Build all tickets for the selected day from the daily delivery sheets
  const allTickets = useMemo(() => {
    const ticketsList: DriverClientTicketItem[] = [];
    const seenIds = new Set<string>();

    const madrugadaMeta = loadDeliveryRunMeta(selectedDate, 'madrugada');
    const mananaMeta = loadDeliveryRunMeta(selectedDate, 'manana');
    const tardeMeta = loadDeliveryRunMeta(selectedDate, 'tarde');

    const processSheetForClients = (
      sheet: Record<string, Record<string, number>>,
      metaMap: Record<string, any>,
      shift: 'madrugada' | 'manana' | 'tarde',
      shiftLabel: string
    ) => {
      activeClients.forEach(client => {
        const prefix = `${client.id}__run_`;
        const runKeys = new Set<string>();
        runKeys.add(client.id);

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

        let clientDayPieces = 0;
        let clientDayAmount = 0;
        const breadItems = getClientBreadItems(client);

        const runDataList: Array<{
          key: string;
          deliveryNumber: number;
          time: string;
          items: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
          pieces: number;
          amount: number;
          previousDeliveryNote?: string;
        }> = [];

        sortedKeys.forEach((key, index) => {
          const clientQty = sheet[key] || {};
          let totalPieces = 0;
          let totalAmount = 0;
          const itemsSummary: Array<{ name: string; quantity: number; unitPrice: number; total: number }> = [];

          breadItems.forEach(it => {
            const q = clientQty[it.breadName] || 0;
            if (q > 0) {
              const itemTotal = q * it.unitPrice;
              totalPieces += q;
              totalAmount += itemTotal;
              itemsSummary.push({
                name: it.breadName,
                quantity: q,
                unitPrice: it.unitPrice,
                total: itemTotal
              });
            }
          });

          if (totalPieces > 0) {
            clientDayPieces += totalPieces;
            clientDayAmount += totalAmount;
            const deliveryNumber = index + 1;
            const meta = metaMap[key];
            const defaultTime = shift === 'madrugada' ? '05:30 AM' : (shift === 'manana' ? '07:00 AM' : '01:30 PM');
            const time = meta?.time || defaultTime;

            let previousDeliveryNote: string | undefined = undefined;
            if (deliveryNumber > 1 && runDataList.length > 0) {
              const prev = runDataList[runDataList.length - 1];
              previousDeliveryNote = `${prev.pieces} pzs a las ${prev.time} ($${prev.amount.toFixed(2)})`;
            }

            runDataList.push({
              key,
              deliveryNumber,
              time,
              items: itemsSummary,
              pieces: totalPieces,
              amount: totalAmount,
              previousDeliveryNote
            });
          }
        });

        runDataList.forEach(run => {
          const tId = `${selectedDate}_${shift}_${run.key}`;
          if (!seenIds.has(tId)) {
            seenIds.add(tId);
            ticketsList.push({
              id: tId,
              clientId: client.id,
              clientName: run.deliveryNumber > 1 ? `${client.name} (Entrega #${run.deliveryNumber})` : client.name,
              clientPhone: client.phone,
              clientAddress: client.address,
              driverId: client.driverId as 'osvaldo' | 'simon',
              driverName: client.driverId === 'osvaldo' ? 'Osvaldo' : 'Simón',
              date: selectedDate,
              shift,
              shiftLabel: `${shiftLabel}${run.deliveryNumber > 1 ? ` • Entrega #${run.deliveryNumber}` : ''}`,
              items: run.items,
              totalPieces: run.pieces,
              totalAmount: run.amount,
              deliveryNumber: run.deliveryNumber,
              deliveryTime: run.time,
              previousDeliveryNote: run.previousDeliveryNote,
              dayAccumulatedPieces: clientDayPieces,
              dayAccumulatedAmount: clientDayAmount
            });
          }
        });
      });
    };

    processSheetForClients(madrugadaSheet, madrugadaMeta, 'madrugada', 'Madrugada (Pedidos madrugada)');
    processSheetForClients(mananaSheet, mananaMeta, 'manana', 'Mañana (7:00 a 1:00 pm)');
    processSheetForClients(tardeSheet, tardeMeta, 'tarde', 'Tarde (1:00 pm a 10:00 pm)');

    // Also include any BakeryOrders assigned to osvaldo or simon on this date
    orders.forEach(order => {
      if (order.deliveryDate === selectedDate && (order.assignedDriverId === 'osvaldo' || order.assignedDriverId === 'simon')) {
        const orderPieces = order.items.reduce((sum, it) => sum + it.quantity, 0);
        ticketsList.push({
          id: `order_${order.id}`,
          clientId: `cust_${order.id}`,
          clientName: `${order.customerName} [Pedido #${order.folio}]`,
          clientPhone: order.customerPhone,
          clientAddress: order.address,
          driverId: order.assignedDriverId,
          driverName: order.assignedDriverId === 'osvaldo' ? 'Osvaldo' : 'Simón',
          date: selectedDate,
          shift: 'manana',
          shiftLabel: 'Encargo Especial',
          items: order.items.map(it => ({
            name: it.name,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            total: it.total
          })),
          totalPieces: orderPieces,
          totalAmount: order.total
        });
      }
    });

    return ticketsList;
  }, [activeClients, madrugadaSheet, mananaSheet, tardeSheet, selectedDate, orders]);

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return allTickets.filter(t => {
      if (driverFilter !== 'todos' && t.driverId !== driverFilter) return false;
      if (shiftFilter !== 'todos' && t.shift !== shiftFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = t.clientName.toLowerCase().includes(q);
        const matchItems = t.items.some(it => it.name.toLowerCase().includes(q));
        if (!matchName && !matchItems) return false;
      }
      return true;
    });
  }, [allTickets, driverFilter, shiftFilter, searchQuery]);

  // Metrics for Simón and Osvaldo
  const simonTickets = useMemo(() => allTickets.filter(t => t.driverId === 'simon'), [allTickets]);
  const simonTotalAmount = useMemo(() => simonTickets.reduce((sum, t) => sum + t.totalAmount, 0), [simonTickets]);
  const simonTotalPieces = useMemo(() => simonTickets.reduce((sum, t) => sum + t.totalPieces, 0), [simonTickets]);

  const simonBreadBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    simonTickets.forEach(t => {
      t.items.forEach(it => {
        const name = (it.name || 'Pan').trim();
        map[name] = (map[name] || 0) + it.quantity;
      });
    });
    return map;
  }, [simonTickets]);

  const osvaldoTickets = useMemo(() => allTickets.filter(t => t.driverId === 'osvaldo'), [allTickets]);
  const osvaldoTotalAmount = useMemo(() => osvaldoTickets.reduce((sum, t) => sum + t.totalAmount, 0), [osvaldoTickets]);
  const osvaldoTotalPieces = useMemo(() => osvaldoTickets.reduce((sum, t) => sum + t.totalPieces, 0), [osvaldoTickets]);

  const osvaldoBreadBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    osvaldoTickets.forEach(t => {
      t.items.forEach(it => {
        const name = (it.name || 'Pan').trim();
        map[name] = (map[name] || 0) + it.quantity;
      });
    });
    return map;
  }, [osvaldoTickets]);

  const grandTotalAmount = simonTotalAmount + osvaldoTotalAmount;
  const grandTotalPieces = simonTotalPieces + osvaldoTotalPieces;

  // Print client ticket
  const handlePrintClientTicket = (ticket: DriverClientTicketItem) => {
    playCashSound();
    printDeliveryClientTicketDirectToPrinter(
      ticket.clientName,
      ticket.driverName,
      ticket.date,
      ticket.items,
      ticket.totalAmount,
      ticket.totalPieces,
      settings,
      ticket.shiftLabel,
      {
        deliveryNumber: ticket.deliveryNumber,
        deliveryTime: ticket.deliveryTime,
        previousDeliveryNote: ticket.previousDeliveryNote,
        dayAccumulatedPieces: ticket.dayAccumulatedPieces,
        dayAccumulatedAmount: ticket.dayAccumulatedAmount
      }
    );
    showToast(`🖨️ Ticket impreso para ${ticket.clientName} ($${ticket.totalAmount.toFixed(2)})`);
  };

  // Print consolidated ticket for driver
  const handlePrintConsolidated = (driver: 'simon' | 'osvaldo') => {
    playCashSound();
    const isSimon = driver === 'simon';
    const driverName = isSimon ? 'Simón' : 'Osvaldo';
    const driverList = isSimon ? simonTickets : osvaldoTickets;
    const totalAmount = isSimon ? simonTotalAmount : osvaldoTotalAmount;
    const totalPieces = isSimon ? simonTotalPieces : osvaldoTotalPieces;

    if (driverList.length === 0) {
      showToast(`⚠️ No hay pedidos registrados para ${driverName} en esta fecha.`);
      return;
    }

    const clientSummaries = driverList.map(t => ({
      clientName: `${t.clientName} (${t.shift === 'manana' ? 'Mañana' : 'Tarde'})`,
      itemsSummary: t.items,
      clientTotal: t.totalAmount,
      clientPieces: t.totalPieces,
      deliveryNumber: t.deliveryNumber,
      deliveryTime: t.deliveryTime,
      previousDeliveryNote: t.previousDeliveryNote
    }));

    printDriverConsolidatedTicketDirectToPrinter(
      driverName,
      selectedDate,
      clientSummaries,
      totalAmount,
      totalPieces,
      settings,
      'Consolidado del Día'
    );
    showToast(`🖨️ Consolidado de ${driverName} impreso ($${totalAmount.toFixed(2)} - ${totalPieces} pzs)`);
  };

  // Register driver liquidation directly into cash / tickets
  const handleRegisterLiquidation = (driver: 'simon' | 'osvaldo') => {
    const isSimon = driver === 'simon';
    const driverName = isSimon ? 'Simón' : 'Osvaldo';
    const totalAmount = isSimon ? simonTotalAmount : osvaldoTotalAmount;
    const totalPieces = isSimon ? simonTotalPieces : osvaldoTotalPieces;

    if (totalAmount <= 0) {
      showToast(`⚠️ ${driverName} no tiene monto a liquidar para este día.`);
      return;
    }

    if (!confirm(`¿Registrar en caja la entrega de $${totalAmount.toFixed(2)} de ${driverName} (${totalPieces} piezas)?`)) {
      return;
    }

    playCashSound();
    const activeShift = (typeof window !== 'undefined' ? localStorage.getItem('santafe_active_shift') : null) || 'turno1';
    const cashierName = (typeof window !== 'undefined' ? localStorage.getItem('santafe_last_cashier_name') : null) || 'Caja Santa Fé';

    const liquidationTicket: SaleTicket = {
      id: `ticket-liq-${driver}-${selectedDate}-${Date.now()}`,
      folio: `T-LIQ-${driver === 'simon' ? 'SIM' : 'OSV'}-${Date.now().toString().slice(-4)}`,
      timestamp: new Date().toISOString(),
      date: selectedDate,
      time: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false }),
      items: [
        {
          id: `item-liq-${driver}`,
          productId: `liq-${driver}`,
          name: `Liquidación Reparto ${driverName} (${totalPieces} pzs)`,
          price: totalAmount,
          quantity: 1,
          total: totalAmount
        }
      ],
      subtotal: totalAmount,
      discount: 0,
      total: totalAmount,
      paymentMethod: 'efectivo',
      amountPaid: totalAmount,
      change: 0,
      customerName: `Repartidor: ${driverName}`,
      pointsEarned: 0,
      pointsRedeemed: 0,
      cashier: cashierName,
      shift: (activeShift === 'turno1' || activeShift === 'turno2') ? activeShift : 'turno1',
      driverId: driver,
      driverName
    };

    if (onRegisterLiquidationToCash) {
      onRegisterLiquidationToCash(liquidationTicket);
      showToast(`💵 Liquidación de $${totalAmount.toFixed(2)} de ${driverName} registrada en caja`);
    } else {
      showToast(`✅ Liquidación de ${driverName} verificada`);
    }
  };

  // Change date helper
  const changeDateByDays = (delta: number) => {
    playBeep(600, 'sine', 0.03);
    const d = new Date(`${selectedDate}T12:00:00`);
    d.setDate(d.getDate() + delta);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    setSelectedDate(`${year}-${month}-${day}`);
  };

  // Friendly date text
  const friendlyDateText = useMemo(() => {
    try {
      const parts = selectedDate.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        return d.toLocaleDateString('es-MX', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      }
    } catch (e) {}
    return selectedDate;
  }, [selectedDate]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-slate-50 w-full max-w-5xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Toast Notificación */}
        {toastNotice && (
          <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl border-2 border-amber-400 font-black text-xs animate-in slide-in-from-top-3 flex items-center gap-2">
            <span>{toastNotice}</span>
          </div>
        )}

        {/* 1. Header con Navegación por Día */}
        <div className="bg-white p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-slate-900 to-slate-800 text-white flex items-center justify-center font-bold text-xl shadow-xs">
              🛵
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900 leading-tight">
                  Tickets de Reparto por Día
                </h2>
                <span className="bg-amber-100 text-amber-900 text-[10px] font-black px-2 py-0.5 rounded-md border border-amber-300 uppercase">
                  Simón & Osvaldo
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium capitalize">
                {friendlyDateText}
              </p>
            </div>
          </div>

          {/* Selector de Fecha */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => changeDateByDays(-1)}
              className="p-1.5 hover:bg-white rounded-lg text-slate-700 hover:text-slate-900 font-black transition-colors cursor-pointer"
              title="Día Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1.5 px-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-2 py-0.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              />
            </div>

            <button
              type="button"
              onClick={() => setSelectedDate(getTodayString())}
              className={`px-2.5 py-0.5 text-xs font-black rounded-lg transition-all cursor-pointer ${
                selectedDate === getTodayString()
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white hover:bg-slate-200 text-slate-700'
              }`}
            >
              Hoy
            </button>

            <button
              type="button"
              onClick={() => changeDateByDays(1)}
              className="p-1.5 hover:bg-white rounded-lg text-slate-700 hover:text-slate-900 font-black transition-colors cursor-pointer"
              title="Día Siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-black transition-colors cursor-pointer"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2. Tarjetas de Resumen por Repartidor */}
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0">
          {/* Simón */}
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-2xl p-3.5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🛵</span>
                <div>
                  <h3 className="font-black text-sm leading-none">Simón</h3>
                  <span className="text-[10px] text-blue-200 font-bold">{simonTickets.length} clientes surtidos</span>
                </div>
              </div>
              <span className="bg-white/20 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                {simonTotalPieces} piezas
              </span>
            </div>
            {/* Desglose detallado de panes para Simón */}
            {Object.keys(simonBreadBreakdown).length > 0 && (
              <div className="mt-2.5 pt-2 border-t border-white/20">
                <span className="text-[9.5px] uppercase font-bold text-blue-200 block mb-1">🥖 Desglose de piezas:</span>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(simonBreadBreakdown).map(([name, qty]) => (
                    <span key={name} className="bg-black/30 text-white font-bold px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1 border border-blue-300/30">
                      <span>{name}:</span>
                      <span className="font-mono text-blue-200 font-black">{qty} pzs</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-3 pt-2 border-t border-white/20 flex items-baseline justify-between">
              <div>
                <span className="text-[10px] text-blue-200 block font-bold uppercase">Total a Liquidar</span>
                <span className="text-2xl font-black">${simonTotalAmount.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handlePrintConsolidated('simon')}
                  className="bg-white hover:bg-blue-50 text-blue-900 text-xs font-black px-2.5 py-1.5 rounded-xl shadow-xs transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                  title="Imprimir ticket consolidado de Simón con todos sus clientes"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Consolidado</span>
                </button>
                {onRegisterLiquidationToCash && simonTotalAmount > 0 && (
                  <button
                    type="button"
                    onClick={() => handleRegisterLiquidation('simon')}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black px-2 py-1.5 rounded-xl shadow-xs transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                    title="Registrar cobro de Simón en caja"
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    <span>Cobrar</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Osvaldo */}
          <div className="bg-gradient-to-br from-amber-600 to-orange-600 text-white rounded-2xl p-3.5 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🛵</span>
                <div>
                  <h3 className="font-black text-sm leading-none">Osvaldo</h3>
                  <span className="text-[10px] text-orange-200 font-bold">{osvaldoTickets.length} clientes surtidos</span>
                </div>
              </div>
              <span className="bg-white/20 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                {osvaldoTotalPieces} piezas
              </span>
            </div>
            {/* Desglose detallado de panes para Osvaldo */}
            {Object.keys(osvaldoBreadBreakdown).length > 0 && (
              <div className="mt-2.5 pt-2 border-t border-white/20">
                <span className="text-[9.5px] uppercase font-bold text-orange-200 block mb-1">🥖 Desglose de piezas:</span>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(osvaldoBreadBreakdown).map(([name, qty]) => (
                    <span key={name} className="bg-black/30 text-white font-bold px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1 border border-orange-300/30">
                      <span>{name}:</span>
                      <span className="font-mono text-amber-200 font-black">{qty} pzs</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-3 pt-2 border-t border-white/20 flex items-baseline justify-between">
              <div>
                <span className="text-[10px] text-orange-200 block font-bold uppercase">Total a Liquidar</span>
                <span className="text-2xl font-black">${osvaldoTotalAmount.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handlePrintConsolidated('osvaldo')}
                  className="bg-white hover:bg-amber-50 text-orange-950 text-xs font-black px-2.5 py-1.5 rounded-xl shadow-xs transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                  title="Imprimir ticket consolidado de Osvaldo con todos sus clientes"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Consolidado</span>
                </button>
                {onRegisterLiquidationToCash && osvaldoTotalAmount > 0 && (
                  <button
                    type="button"
                    onClick={() => handleRegisterLiquidation('osvaldo')}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black px-2 py-1.5 rounded-xl shadow-xs transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                    title="Registrar cobro de Osvaldo en caja"
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    <span>Cobrar</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Gran Total */}
          <div className="bg-slate-900 text-white rounded-2xl p-3.5 shadow-sm flex flex-col justify-between border border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Total Repartos</span>
                <h3 className="font-black text-sm leading-none text-emerald-400 mt-0.5">
                  {allTickets.length} Tickets en Total
                </h3>
              </div>
              <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-black px-2 py-0.5 rounded-full">
                {grandTotalPieces} piezas
              </span>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-800 flex items-baseline justify-between">
              <div>
                <span className="text-[10px] text-slate-400 block font-bold uppercase">Monto Consolidado</span>
                <span className="text-2xl font-black text-emerald-400">${grandTotalAmount.toFixed(2)}</span>
              </div>
              <span className="text-[11px] text-slate-400 font-bold">
                {friendlyDateText.split(',')[0]}
              </span>
            </div>
          </div>
        </div>

        {/* 3. Filtros y Buscador */}
        <div className="px-4 py-2.5 bg-white border-y border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Filtro Repartidor */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setDriverFilter('todos')}
                className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  driverFilter === 'todos' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todos ({allTickets.length})
              </button>
              <button
                type="button"
                onClick={() => setDriverFilter('simon')}
                className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  driverFilter === 'simon' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Simón ({simonTickets.length})
              </button>
              <button
                type="button"
                onClick={() => setDriverFilter('osvaldo')}
                className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  driverFilter === 'osvaldo' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Osvaldo ({osvaldoTickets.length})
              </button>
            </div>

            {/* Filtro Turno */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setShiftFilter('todos')}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  shiftFilter === 'todos' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setShiftFilter('madrugada')}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  shiftFilter === 'madrugada' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                🌅 Madrugada
              </button>
              <button
                type="button"
                onClick={() => setShiftFilter('manana')}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  shiftFilter === 'manana' ? 'bg-amber-400 text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ☀️ Mañana
              </button>
              <button
                type="button"
                onClick={() => setShiftFilter('tarde')}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  shiftFilter === 'tarde' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                🌇 Tarde
              </button>
            </div>
          </div>

          {/* Buscador */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar cliente o pan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* 4. Lista de Tickets del Día */}
        <div className="p-4 overflow-y-auto flex-1 space-y-2">
          {filteredTickets.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto text-2xl font-bold mb-3">
                🛵
              </div>
              <h4 className="text-base font-black text-slate-800">
                No hay pedidos de reparto registrados para esta fecha
              </h4>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Selecciona otro día en el calendario o verifica que las cantidades hayan sido cargadas en el módulo de Repartos.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {filteredTickets.map((ticket, idx) => {
                const isSimon = ticket.driverId === 'simon';
                return (
                  <div
                    key={`${ticket.id}_${ticket.shift}_${idx}`}
                    className="bg-white rounded-2xl p-3.5 shadow-2xs border border-slate-200 hover:border-slate-300 transition-all flex flex-col justify-between gap-2.5"
                  >
                    <div>
                      {/* Top: Cliente + Badges */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="font-black text-sm text-slate-900 leading-snug truncate">
                            {ticket.clientName}
                          </h4>
                          {ticket.clientAddress && (
                            <p className="text-[11px] text-slate-400 truncate">
                              📍 {ticket.clientAddress}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                          {ticket.deliveryNumber && ticket.deliveryNumber > 1 && (
                            <span className="bg-amber-500 text-slate-950 font-black text-[10px] px-2 py-0.5 rounded-full">
                              Vuelta #{ticket.deliveryNumber}
                            </span>
                          )}
                          {ticket.deliveryTime && (
                            <span className="bg-slate-100 text-slate-700 font-bold text-[10px] px-2 py-0.5 rounded-full">
                              🕒 {ticket.deliveryTime}
                            </span>
                          )}
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                            isSimon ? 'bg-blue-100 text-blue-900' : 'bg-orange-100 text-orange-950'
                          }`}>
                            🛵 {ticket.driverName}
                          </span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                            ticket.shift === 'madrugada'
                              ? 'bg-amber-100 text-amber-950 border border-amber-300'
                              : (ticket.shift === 'manana' ? 'bg-yellow-100 text-yellow-900 border border-yellow-300' : 'bg-indigo-100 text-indigo-900 border border-indigo-300')
                          }`}>
                            {ticket.shift === 'madrugada' ? '🌅 Madrugada' : (ticket.shift === 'manana' ? '☀️ Mañana' : '🌇 Tarde')}
                          </span>
                        </div>
                      </div>

                      {/* Aviso de Entrega Previa */}
                      {ticket.previousDeliveryNote && (
                        <div className="mt-1.5 bg-amber-50 border border-amber-300 rounded-lg px-2 py-1 text-xs text-amber-950 flex items-center justify-between">
                          <span className="font-medium text-[11px]">⚠️ <b>Entrega previa:</b> {ticket.previousDeliveryNote}</span>
                          {ticket.dayAccumulatedAmount !== undefined && (
                            <span className="font-black font-mono text-[10px] text-amber-900 ml-1 shrink-0">
                              Total día: ${ticket.dayAccumulatedAmount.toFixed(2)} ({ticket.dayAccumulatedPieces}p)
                            </span>
                          )}
                        </div>
                      )}

                      {/* Desglose de piezas */}
                      <div className="mt-2 bg-slate-50 rounded-xl p-2 border border-slate-100 space-y-1">
                        {ticket.items.map((it, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs font-bold text-slate-700">
                            <span className="truncate">
                              {it.quantity}x {it.name} <span className="text-slate-400 text-[10px]">(${it.unitPrice.toFixed(2)})</span>
                            </span>
                            <span className="font-mono text-slate-900 shrink-0 ml-2">
                              ${it.total.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Bottom: Totales y Botón Imprimir Ticket */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-bold leading-none">
                          {ticket.totalPieces} piezas
                        </span>
                        <span className="text-lg font-black text-slate-900 font-mono leading-tight">
                          ${ticket.totalAmount.toFixed(2)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPreviewTicket(ticket)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
                          title="Ver detalle del ticket"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handlePrintClientTicket(ticket)}
                          className="bg-slate-900 hover:bg-blue-600 text-white font-black px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
                          title="Reimprimir ticket de cliente (sin copia)"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Reimprimir Ticket</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 5. Footer con Botones de Cierre y Resumen */}
        <div className="bg-white p-3.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="text-xs text-slate-600 font-bold">
            Mostrando <strong className="text-slate-900">{filteredTickets.length}</strong> de {allTickets.length} tickets de reparto
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-4 py-2 rounded-xl text-xs transition-colors cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>

      </div>

      {/* Modal de Previsualización de Ticket Individual */}
      {previewTicket && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white rounded-3xl p-5 max-w-sm w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-black text-sm text-slate-900">Detalle de Ticket de Reparto</h3>
              <button onClick={() => setPreviewTicket(null)} className="text-slate-400 hover:text-slate-700 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="font-mono text-xs bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
              <div className="text-center font-bold">
                <div className="text-sm font-black">{settings.bakeryName}</div>
                <div className="text-[10px] text-slate-500">TICKET DE REPARTO</div>
                <div className="text-[10px] text-slate-500">Fecha: {previewTicket.date} • {previewTicket.shiftLabel}</div>
              </div>
              <div className="border-b border-dashed my-2"></div>
              <div><strong>Cliente:</strong> {previewTicket.clientName}</div>
              <div><strong>Repartidor:</strong> {previewTicket.driverName}</div>
              <div className="border-b border-dashed my-2"></div>
              <div className="space-y-1">
                {previewTicket.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span>{it.quantity}x {it.name}</span>
                    <span>${it.total.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="border-b border-dashed my-2"></div>
              <div className="flex justify-between font-black text-sm">
                <span>TOTAL A PAGAR:</span>
                <span>${previewTicket.totalAmount.toFixed(2)}</span>
              </div>
              <div className="text-[10px] text-center text-slate-500 mt-2">
                Total de piezas: {previewTicket.totalPieces} pzs
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  handlePrintClientTicket(previewTicket);
                  setPreviewTicket(null);
                }}
                className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-black py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Ticket</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewTicket(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-2.5 rounded-xl text-xs cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
