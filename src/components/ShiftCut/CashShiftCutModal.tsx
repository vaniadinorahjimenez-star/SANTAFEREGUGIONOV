import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, 
  Printer, 
  MessageCircle, 
  CheckCircle2, 
  DollarSign, 
  Clock, 
  User, 
  Calendar, 
  Plus, 
  Trash2, 
  Coins, 
  Banknote, 
  Receipt, 
  Sparkles, 
  AlertCircle,
  Check, 
  Eye, 
  CreditCard, 
  Wheat, 
  RotateCcw,
  Package,
  ShoppingBag,
  TrendingDown,
  ArrowDownCircle,
  HelpCircle
} from 'lucide-react';
import { SaleTicket, Settings, CashOutflowItem, ShiftCutRecord, BranchId } from '../../types';
import { 
  getTodayString, 
  getNowTimeString, 
  getNextShiftCutFolio, 
  saveShiftCuts, 
  loadShiftCuts, 
  loadOutflows, 
  saveOutflows, 
  generateShiftCutWhatsAppMessage,
  resolveTicketShift 
} from '../../utils/storage';
import { playBeep, playCashSound, playCelebrationFanfare } from '../../utils/audio';
import { ThermalShiftCutTicket } from './ThermalShiftCutTicket';
import { CashDenominationSelector, calculateDenominationsTotal } from './CashDenominationSelector';
import { calculateTicketsBreakdown } from '../../utils/productClassification';
import { saveShiftCutToFirestore, saveOutflowToFirestore } from '../../services/firebase';
import { syncWithCloud } from '../../services/cloudSyncService';

interface CashShiftCutModalProps {
  isOpen: boolean;
  onClose: () => void;
  tickets: SaleTicket[];
  settings: Settings;
  branch?: BranchId;
  onCutSaved?: (cut: ShiftCutRecord) => void;
  initialCashDefault?: number;
}

const CASHIER_PRESETS_REFUGIO = ['Mary', 'Paty', 'Jaz', 'Natty', 'Jonathan'];
const CASHIER_PRESETS_ZAKIA = ['Ama', 'Mireya', 'Maggie', 'Gabo', 'Angie'];

const OUTFLOW_CONCEPT_PRESETS = [
  'Uber / Transporte',
  'Préstamo Empleado',
  'Alpura / Lácteos',
  'Coca-Cola / Refrescos',
  'Harinera / Costales',
  'Huevo',
  'Mantenimiento / Reparación',
  'Gas L.P.',
  'Bolsas / Domos / Empaque',
  'Ahorro / Fondo',
  'Desayuno / Comida Personal',
  'Otro Pago Proveedor'
];

// Helper to eliminate any leading zero so typing '100' does not show '0100'
const cleanAmountInput = (val: string): string => {
  if (!val) return '';
  // Keep only digits
  const onlyDigits = val.replace(/[^0-9]/g, '');
  if (!onlyDigits) return '';
  // Strip leading zeroes so '0100' becomes '100', '05' becomes '5', but keep a solitary '0' if entered
  return onlyDigits.replace(/^0+(?=\d)/, '');
};

export const CashShiftCutModal: React.FC<CashShiftCutModalProps> = ({
  isOpen,
  onClose,
  tickets,
  settings,
  branch = 'refugio',
  onCutSaved,
  initialCashDefault = 1000
}) => {
  const isZakia = branch === 'zakia';
  const activeBranchId: BranchId = isZakia ? 'zakia' : 'refugio';
  const cashierPresets = isZakia ? CASHIER_PRESETS_ZAKIA : CASHIER_PRESETS_REFUGIO;
  const defaultCashier = isZakia ? 'Ama' : 'Mary';

  const todayStr = getTodayString();
  const [autoTime, setAutoTime] = useState<string>(getNowTimeString());
  const [autoDateFormatted, setAutoDateFormatted] = useState<string>('');

  // Cashier Name State
  const [cashierName, setCashierName] = useState<string>(() => {
    const saved = localStorage.getItem(`santafe_last_cashier_name_${branch}`) || localStorage.getItem('santafe_last_cashier_name');
    if (saved && cashierPresets.includes(saved)) return saved;
    return defaultCashier;
  });

  // Shift selection state
  const [shiftType, setShiftType] = useState<string>(() => {
    const hour = new Date().getHours();
    return hour < 15 
      ? 'Turno 1 (Mañana 07:00 a 15:00)' 
      : 'Turno 2 (Tarde 15:00 a 22:00)';
  });

  // Fondo Inicial Recibido (por defecto $1,000)
  const [initialCash, setInitialCash] = useState<number>(() => {
    const saved = localStorage.getItem(`santafe_initial_cash_amount_${branch}`) || localStorage.getItem('santafe_initial_cash_amount');
    return saved ? Number(saved) : initialCashDefault;
  });

  // Pago con Tarjeta: Automático del Sistema (las cajeras no modifican ingresos en tarjeta)

  // 2. PASO 2: Se Dejan 1000 en Caja (con Conteo Fácil)
  const [nextShiftCash, setNextShiftCash] = useState<number>(() => {
    const saved = localStorage.getItem(`santafe_next_shift_cash_amount_${branch}`) || localStorage.getItem('santafe_next_shift_cash_amount');
    return saved !== null ? Number(saved) : 1000;
  });
  const [showNextShiftCounter, setShowNextShiftCounter] = useState<boolean>(false);
  const [nextShiftDenominations, setNextShiftDenominations] = useState<{ [denom: number]: number }>({
    500: 2, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0
  });

  // 3. PASO 3: Se Cuenta lo que Queda (Para la bolsita / sobre, con Conteo Fácil)
  const [remainingCashInput, setRemainingCashInput] = useState<string>('');
  const [showRemainingCounter, setShowRemainingCounter] = useState<boolean>(false);
  const [remainingDenominations, setRemainingDenominations] = useState<{ [denom: number]: number }>({
    500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0
  });

  // 4. PASO 4: Salidas / Gastos del Turno
  const [allOutflows, setAllOutflows] = useState<CashOutflowItem[]>(() => loadOutflows());
  const [showAddOutflowForm, setShowAddOutflowForm] = useState<boolean>(false);
  const [newConcept, setNewConcept] = useState<string>('');
  const [newAmount, setNewAmount] = useState<string>('');
  const [newRecipient, setNewRecipient] = useState<string>('');
  const [newNotes, setNewNotes] = useState<string>('');

  // Observaciones y Notas
  const [notes, setNotes] = useState<string>('');

  // Vista Previa y Guardado
  const [savedCutFolio, setSavedCutFolio] = useState<string | null>(null);
  const [previewCutRecord, setPreviewCutRecord] = useState<ShiftCutRecord | null>(null);

  // Live auto clock ticker
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setAutoTime(now.toTimeString().slice(0, 5));
      const options: Intl.DateTimeFormatOptions = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      };
      setAutoDateFormatted(now.toLocaleDateString('es-MX', options));
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  // Save cashier name
  useEffect(() => {
    if (cashierName.trim()) {
      localStorage.setItem(`santafe_last_cashier_name_${branch}`, cashierName.trim());
      localStorage.setItem('santafe_last_cashier_name', cashierName.trim());
    }
  }, [cashierName, branch]);

  // Save initialCash and nextShiftCash preferences
  const handleUpdateInitialCash = (val: number) => {
    const safe = Math.max(0, val);
    setInitialCash(safe);
    localStorage.setItem(`santafe_initial_cash_amount_${branch}`, safe.toString());
  };

  const handleUpdateNextShiftCash = (val: number) => {
    const safe = Math.max(0, val);
    setNextShiftCash(safe);
    localStorage.setItem(`santafe_next_shift_cash_amount_${branch}`, safe.toString());
  };

  const isTicketDelivery = (t: SaleTicket): boolean => {
    return Boolean(
      t.isDelivery ||
      t.driverId === 'osvaldo' ||
      t.driverId === 'simon' ||
      (t.id && t.id.startsWith('rep_')) ||
      (t.cashier && t.cashier.toLowerCase().includes('reparto'))
    );
  };

  // Filter tickets for today (Mostrador físico de mostrador)
  const allTodayTickets = useMemo(() => {
    return tickets.filter(t => {
      const ticketBranch = t.branch || 'refugio';
      const targetBranch = branch || 'refugio';
      return t.date === todayStr && !isTicketDelivery(t) && ticketBranch === targetBranch;
    });
  }, [tickets, todayStr, branch]);

  const turno1TicketsCount = useMemo(() => {
    return allTodayTickets.filter(t => resolveTicketShift(t) === 'turno1').length;
  }, [allTodayTickets]);

  const turno2TicketsCount = useMemo(() => {
    return allTodayTickets.filter(t => resolveTicketShift(t) === 'turno2').length;
  }, [allTodayTickets]);

  // Filter tickets for selected shift
  const todayTickets = useMemo(() => {
    return allTodayTickets.filter(t => {
      if (shiftType.includes('Completo')) return true;
      const targetShiftCode = shiftType.includes('Turno 1') ? 'turno1' : 'turno2';
      return resolveTicketShift(t) === targetShiftCode;
    });
  }, [allTodayTickets, shiftType]);

  // Totals detected from tickets in system
  const systemTotalGross = useMemo(() => {
    return todayTickets.reduce((sum, t) => sum + t.total, 0);
  }, [todayTickets]);

  const systemCardSales = useMemo(() => {
    return todayTickets
      .filter(t => t.paymentMethod === 'tarjeta')
      .reduce((sum, t) => sum + t.total, 0);
  }, [todayTickets]);

  const systemCashSales = useMemo(() => {
    return Math.max(0, systemTotalGross - systemCardSales);
  }, [systemTotalGross, systemCardSales]);

  // Total pieces from tickets
  const totalPieces = useMemo(() => {
    return todayTickets.reduce((sum, t) => {
      return sum + t.items.reduce((s, it) => s + it.quantity, 0);
    }, 0);
  }, [todayTickets]);

  // Venta con tarjeta 100% automática del sistema (las cajeras no modifican ingresos en tarjeta)
  const effectiveCardSales = systemCardSales;

  // Venta en efectivo calculada conforme a las ventas del sistema menos tarjeta automática
  const systemCashSalesExpected = useMemo(() => {
    return Math.max(0, systemTotalGross - systemCardSales);
  }, [systemTotalGross, systemCardSales]);

  // Venta total bruta del turno
  const totalGrossSales = useMemo(() => {
    return systemTotalGross;
  }, [systemTotalGross]);

  // Outflows filtered for active shift
  const currentShiftCode = useMemo<'turno1' | 'turno2' | 'completo'>(() => {
    if (shiftType.includes('Turno 1')) return 'turno1';
    if (shiftType.includes('Turno 2')) return 'turno2';
    return 'completo';
  }, [shiftType]);

  const outflows = useMemo(() => {
    return allOutflows.filter(o => {
      if (o.date !== todayStr) return false;
      const oBranch = o.branch || 'refugio';
      const targetBranch = branch || 'refugio';
      if (oBranch !== targetBranch) return false;
      if (currentShiftCode === 'completo') return true;
      if (!o.shiftCode) return true;
      return o.shiftCode === currentShiftCode;
    });
  }, [allOutflows, todayStr, currentShiftCode, branch]);

  const totalOutflows = useMemo(() => {
    return outflows.reduce((sum, o) => sum + o.amount, 0);
  }, [outflows]);

  // Desglose Pan vs No Pan
  const { breadTotal, nonBreadTotal, breadPieces, nonBreadPieces, nonBreadItemsList } = useMemo(() => {
    return calculateTicketsBreakdown(todayTickets);
  }, [todayTickets]);

  // CÁLCULO CONFORME A LAS VENTAS (CUADRE DE LA BOLSITA):
  // 1. ¿Cuánto TENÍA que ponerse en la bolsita?
  // Efectivo de ventas cobrado en el turno menos las salidas pagadas
  const expectedInBag = useMemo(() => {
    return Math.max(0, systemCashSalesExpected - totalOutflows);
  }, [systemCashSalesExpected, totalOutflows]);

  // 2. ¿Cuánto REALMENTE quedó contado en el Paso 3?
  const hasEnteredRemainingCash = useMemo(() => {
    return remainingCashInput.trim() !== '' && !isNaN(parseFloat(remainingCashInput));
  }, [remainingCashInput]);

  const actualInBag = useMemo(() => {
    if (hasEnteredRemainingCash) {
      const val = parseFloat(remainingCashInput);
      return isNaN(val) ? 0 : Math.max(0, val);
    }
    return expectedInBag;
  }, [hasEnteredRemainingCash, remainingCashInput, expectedInBag]);

  // 3. Diferencia: ¿Hay sobrante o faltante en la bolsita?
  const bagDifference = useMemo(() => {
    if (!hasEnteredRemainingCash) return 0;
    return actualInBag - expectedInBag;
  }, [hasEnteredRemainingCash, actualInBag, expectedInBag]);

  const cashToDeliver = actualInBag;
  const salesDifference = bagDifference;

  const handleCopyExpectedInBag = () => {
    playBeep(650, 'sine', 0.03);
    setRemainingCashInput(expectedInBag.toString());
  };

  // Outflow Handlers
  const handleAddOutflow = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const amountNum = parseFloat(newAmount);
    if (!newConcept.trim() || isNaN(amountNum) || amountNum <= 0) {
      alert('Por favor escribe el concepto y un monto válido para la salida.');
      return;
    }

    const newItem: CashOutflowItem = {
      id: `out-${Date.now()}`,
      concept: newConcept.trim(),
      amount: Math.round(amountNum),
      time: autoTime,
      date: todayStr,
      recipient: newRecipient.trim() || undefined,
      notes: newNotes.trim() || undefined,
      shiftCode: currentShiftCode,
      shiftName: shiftType,
      branch: (isZakia ? 'zakia' : 'refugio') as BranchId
    };

    const updated = [newItem, ...allOutflows];
    setAllOutflows(updated);
    saveOutflows(updated);
    saveOutflowToFirestore(newItem).catch(console.warn);
    syncWithCloud({ outflows: [newItem] });

    playCashSound();
    setNewConcept('');
    setNewAmount('');
    setNewRecipient('');
    setNewNotes('');
    setShowAddOutflowForm(false);
  };

  const handleDeleteOutflow = (id: string) => {
    playBeep(450, 'sine', 0.04);
    const updated = allOutflows.filter(o => o.id !== id);
    setAllOutflows(updated);
    saveOutflows(updated);
  };

  // Build current shift cut record
  const getCurrentCutRecord = (folioStr?: string): ShiftCutRecord => {
    return {
      id: `cut-${Date.now()}`,
      folio: folioStr || savedCutFolio || 'CORTE-PREVIO',
      date: todayStr,
      time: autoTime,
      cashierName: cashierName.trim() || 'Sin asignar',
      shiftName: shiftType,
      initialCash,
      totalGrossSales,
      totalCashSales: systemCashSalesExpected,
      totalCardSales: systemCardSales,
      rawCardTerminalTotal: undefined,
      shift1CardDeduction: undefined,
      systemGrossSales: systemTotalGross,
      systemCashSales,
      systemCardSales,
      isCardManualOverride: false,
      totalBreadSales: breadTotal,
      totalNonBreadSales: nonBreadTotal,
      breadPieces,
      nonBreadPieces,
      nonBreadItems: nonBreadItemsList,
      totalPieces,
      ticketsCount: todayTickets.length,
      outflows,
      totalOutflows,
      expectedCashInDrawer: systemTotalGross,
      nextShiftCash,
      cashToDeliver: actualInBag,
      expectedInBag,
      actualInBag,
      bagDifference,
      actualCashInDrawer: nextShiftCash + actualInBag,
      difference: bagDifference,
      nextShiftBillsBreakdown: nextShiftDenominations,
      drawerCashBreakdown: remainingDenominations,
      notes: notes.trim() || undefined,
      branch: (isZakia ? 'zakia' : 'refugio') as BranchId,
      createdAt: new Date().toISOString()
    };
  };

  // Ver Previo del Ticket de Corte
  const handleOpenPreview = () => {
    playBeep(650, 'sine', 0.04);
    const cutRecord = getCurrentCutRecord();
    setPreviewCutRecord(cutRecord);
  };

  // Guardar y abrir impresión térmica
  const handleSaveAndPrintCut = (printImmediately: boolean = true) => {
    const folio = getNextShiftCutFolio(activeBranchId);
    const newCut = getCurrentCutRecord(folio);

    const existingCuts = loadShiftCuts();
    saveShiftCuts([newCut, ...existingCuts]);
    saveShiftCutToFirestore(newCut).catch(console.warn);
    syncWithCloud({ shiftCuts: [newCut] });

    if (onCutSaved) {
      onCutSaved(newCut);
    }

    playCelebrationFanfare();
    setSavedCutFolio(folio);
    setPreviewCutRecord(newCut);

    if (printImmediately) {
      setTimeout(() => {
        window.print();
      }, 350);
    }
  };

  // Share via WhatsApp
  const handleSendWhatsApp = () => {
    const dummyCut = getCurrentCutRecord();
    const encoded = generateShiftCutWhatsAppMessage(dummyCut, settings);
    const url = `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank');
  };

  if (!isOpen) return null;

  return (
    <>
      <div 
        id="shift-cut-modal-overlay"
        className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      >
        <div 
          id="shift-cut-modal-container"
          className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border-2 border-amber-300 overflow-hidden my-3 max-h-[95vh] flex flex-col animate-in zoom-in-95 duration-150"
        >
          {/* HEADER PRINCIPAL */}
          <div className="bg-gradient-to-r from-[#2D3142] via-slate-800 to-[#2D3142] text-white p-3.5 sm:p-4 flex items-center justify-between border-b-2 border-amber-400 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-amber-400/20 border border-amber-400/50 text-amber-300 flex items-center justify-center font-bold shadow-inner">
                <Receipt className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-black tracking-tight text-white">
                    Corte de Caja / Turno
                  </h2>
                  <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                    isZakia ? 'bg-emerald-400 text-slate-950' : 'bg-amber-400 text-slate-950'
                  }`}>
                    {isZakia ? '🌿 Zakia' : '🥖 El Refugio'}
                  </span>
                </div>
                <p className="text-[11px] text-amber-200/90 font-bold">
                  {isZakia ? 'Mostrador Sucursal Zakia' : 'Mostrador Sucursal El Refugio'} • Llenado paso a paso
                </p>
              </div>
            </div>

            <button
              id="close-shift-cut-modal-btn"
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
              title="Cerrar ventana"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* CUERPO DEL CORTE (SCROLLABLE) */}
          <div className="p-3.5 sm:p-5 overflow-y-auto space-y-4 flex-1 text-slate-800 text-sm">
            
            {/* SELECCIÓN RÁPIDA DE ENCARGADA Y TURNO */}
            <div className="bg-amber-50/70 rounded-2xl p-3 border border-amber-200 shadow-2xs space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Encargada */}
                <div>
                  <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">
                    👤 Encargada / Cajera(o):
                  </span>
                  <div className="grid grid-cols-5 gap-1">
                    {cashierPresets.map((name) => {
                      const isSelected = cashierName === name;
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => {
                            setCashierName(name);
                            playBeep(600, 'sine', 0.03);
                          }}
                          className={`py-1.5 px-1 rounded-xl text-xs font-black transition-all cursor-pointer border text-center truncate ${
                            isSelected
                              ? 'bg-amber-600 text-white border-amber-700 shadow-xs ring-2 ring-amber-400/50'
                              : 'bg-white hover:bg-amber-100 text-slate-700 border-amber-200'
                          }`}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Turno */}
                <div>
                  <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">
                    🕒 Turno a Cortar:
                  </span>
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      onClick={() => setShiftType('Turno 1 (Mañana 07:00 a 15:00)')}
                      className={`p-1.5 rounded-xl text-center border-2 transition-all cursor-pointer ${
                        shiftType.includes('Turno 1')
                          ? 'bg-amber-500 text-amber-950 border-amber-600 font-black shadow-xs ring-2 ring-amber-400/50'
                          : 'bg-white text-slate-700 border-amber-200 font-bold'
                      }`}
                    >
                      <div className="text-xs">🌅 Turno 1</div>
                      <div className="text-[9.5px] opacity-80">{turno1TicketsCount} tks</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShiftType('Turno 2 (Tarde 15:00 a 22:00)')}
                      className={`p-1.5 rounded-xl text-center border-2 transition-all cursor-pointer ${
                        shiftType.includes('Turno 2')
                          ? 'bg-indigo-600 text-white border-indigo-700 font-black shadow-xs ring-2 ring-indigo-400/50'
                          : 'bg-white text-slate-700 border-slate-200 font-bold'
                      }`}
                    >
                      <div className="text-xs">🌇 Turno 2</div>
                      <div className="text-[9.5px] opacity-80">{turno2TicketsCount} tks</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShiftType('Turno Completo')}
                      className={`p-1.5 rounded-xl text-center border-2 transition-all cursor-pointer ${
                        shiftType.includes('Completo')
                          ? 'bg-slate-800 text-white border-slate-900 font-black shadow-xs ring-2 ring-slate-400/50'
                          : 'bg-white text-slate-700 border-slate-200 font-bold'
                      }`}
                    >
                      <div className="text-xs">🗓️ Todo el Día</div>
                      <div className="text-[9.5px] opacity-80">{allTodayTickets.length} tks</div>
                    </button>
                  </div>
                </div>
              </div>

              {/* Hora y Fecha en barra delgada */}
              <div className="flex items-center justify-between pt-1.5 border-t border-amber-200/60 text-[11px] text-slate-600 font-bold">
                <span className="capitalize">{autoDateFormatted || todayStr}</span>
                <span className="bg-amber-200/70 text-amber-950 font-mono px-2 py-0.5 rounded font-black">
                  Hora: {autoTime}
                </span>
              </div>
            </div>

            {/* ========================================================= */}
            {/* 1. PASO 1: REGISTRA TUS SALIDAS DEL TURNO */}
            {/* ========================================================= */}
            <div className="bg-rose-50/70 rounded-3xl p-3.5 sm:p-4 border-2 border-rose-300 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-rose-200 pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-rose-600 text-white flex items-center justify-center font-black text-sm shadow-xs">
                    1
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-rose-950 leading-tight uppercase">
                      1. Registra tus Salidas del Turno
                    </h3>
                    <p className="text-[11px] text-rose-800 font-bold leading-none mt-0.5">
                      Registra cualquier dinero pagado en efectivo de la caja durante este turno (gastos o proveedores)
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-rose-700 font-bold block">Total Salidas:</span>
                  <span className="text-base sm:text-lg font-black text-rose-700 font-mono">
                    -${totalOutflows}.00
                  </span>
                </div>
              </div>

              {/* Botón para abrir formulario de salida y botones rápidos */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  id="open-add-outflow-form-btn"
                  onClick={() => setShowAddOutflowForm(prev => !prev)}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-black text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Registrar Salida / Pago</span>
                </button>

                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] font-bold text-slate-500">Rápidos:</span>
                  {['Uber', 'Préstamo', 'Alpura', 'Coca-Cola', 'Harinera', 'Huevo'].map((concept) => (
                    <button
                      key={concept}
                      type="button"
                      onClick={() => {
                        setNewConcept(concept);
                        setShowAddOutflowForm(true);
                      }}
                      className="text-[10px] font-bold bg-white hover:bg-rose-100 text-rose-900 border border-rose-200 px-2 py-0.5 rounded-lg cursor-pointer"
                    >
                      {concept}
                    </button>
                  ))}
                </div>
              </div>

              {/* Formulario para agregar salida */}
              {showAddOutflowForm && (
                <form 
                  onSubmit={handleAddOutflow}
                  className="bg-white p-3.5 rounded-2xl border-2 border-rose-300 space-y-3 animate-in fade-in"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                    <span className="text-xs font-black text-slate-900 uppercase">
                      Nueva Salida de Dinero
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAddOutflowForm(false)}
                      className="text-slate-400 hover:text-slate-700 p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[10.5px] font-black text-slate-700 uppercase mb-1">
                        Concepto / Proveedor:
                      </label>
                      <input
                        type="text"
                        value={newConcept}
                        onChange={(e) => setNewConcept(e.target.value)}
                        placeholder="Ej. Alpura, Harinera, Uber..."
                        required
                        className="w-full bg-rose-50/40 px-3 py-1.5 rounded-xl text-xs font-bold border border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10.5px] font-black text-slate-700 uppercase mb-1">
                        Monto a Pagar ($):
                      </label>
                      <div className="relative flex items-center">
                        <span className="absolute left-3 font-black text-rose-600 font-mono">$</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={newAmount}
                          onChange={(e) => setNewAmount(cleanAmountInput(e.target.value))}
                          onFocus={(e) => e.target.select()}
                          placeholder="0"
                          required
                          className="w-full pl-7 pr-3 py-1.5 bg-rose-50/40 rounded-xl text-sm font-black text-rose-700 border border-rose-300 font-mono focus:outline-none focus:ring-2 focus:ring-rose-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10.5px] font-black text-slate-700 uppercase mb-1">
                        ¿Quién recibió? (Opcional):
                      </label>
                      <input
                        type="text"
                        value={newRecipient}
                        onChange={(e) => setNewRecipient(e.target.value)}
                        placeholder="Ej. Don Pancho, Repartidor..."
                        className="w-full bg-slate-50 px-3 py-1.5 rounded-xl text-xs border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10.5px] font-black text-slate-700 uppercase mb-1">
                        Nota / Detalle (Opcional):
                      </label>
                      <input
                        type="text"
                        value={newNotes}
                        onChange={(e) => setNewNotes(e.target.value)}
                        placeholder="Ej. 2 cajas de leche"
                        className="w-full bg-slate-50 px-3 py-1.5 rounded-xl text-xs border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddOutflowForm(false)}
                      className="px-3 py-1.5 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-xl flex items-center gap-1 cursor-pointer shadow-sm"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Guardar Salida</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Lista de salidas registradas */}
              <div className="space-y-1.5">
                {outflows.length === 0 ? (
                  <div className="bg-white/80 p-3 rounded-2xl border border-rose-200 text-center text-xs text-slate-500 italic">
                    Sin salidas registradas en este turno
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-rose-200 p-2 space-y-1 max-h-36 overflow-y-auto">
                    {outflows.map((outflow) => (
                      <div 
                        key={outflow.id}
                        className="flex items-center justify-between p-2 rounded-xl bg-rose-50/50 hover:bg-rose-100/60 transition-colors border border-rose-100 text-xs"
                      >
                        <div className="space-y-0.5 truncate pr-2">
                          <div className="font-black text-slate-900 truncate">
                            • {outflow.concept}
                          </div>
                          <div className="text-[10px] text-slate-500 flex gap-2">
                            {outflow.time && <span>🕒 {outflow.time}</span>}
                            {outflow.recipient && <span>👤 {outflow.recipient}</span>}
                            {outflow.notes && <span>📝 {outflow.notes}</span>}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono font-black text-rose-700 text-sm">
                            -${outflow.amount}.00
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteOutflow(outflow.id)}
                            className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                            title="Eliminar salida"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ========================================================= */}
            {/* 2. PASO 2: CUENTA EN CAJA 1000, INCLUYENDO MONEDAS Y LOS BILLETES DE MENOR DENOMINACIÓN */}
            {/* ========================================================= */}
            <div className="bg-indigo-50/70 rounded-3xl p-3.5 sm:p-4 border-2 border-indigo-300 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-indigo-200 pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-indigo-700 text-white flex items-center justify-center font-black text-sm shadow-xs">
                    2
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-indigo-950 leading-tight uppercase">
                      2. Cuenta en Caja $1,000, incluyendo monedas y los billetes de menor denominación
                    </h3>
                    <p className="text-[11px] text-indigo-800 font-bold leading-none mt-0.5">
                      Se aparta y se deja en el cajón para cambio del siguiente turno (NO se contabiliza en ventas ni en entrega)
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs font-bold text-indigo-800 block">Fondo en Caja:</span>
                  <span className="text-lg font-black text-indigo-900 font-mono">
                    ${nextShiftCash}.00
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-indigo-200">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <span className="text-xs font-black text-indigo-950">Monto a dejar:</span>
                  <div className="relative flex items-center">
                    <span className="absolute left-2.5 font-black text-indigo-700 font-mono">$</span>
                    <input
                      type="number"
                      step="50"
                      min="0"
                      value={nextShiftCash}
                      onChange={(e) => handleUpdateNextShiftCash(parseFloat(e.target.value) || 0)}
                      onFocus={(e) => e.target.select()}
                      className="w-28 pl-6 pr-2 py-1.5 bg-indigo-50/50 rounded-xl text-base font-black text-indigo-950 border border-indigo-300 font-mono text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleUpdateNextShiftCash(1000)}
                      className="px-2 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-900 rounded-lg text-xs font-black cursor-pointer"
                      title="Dejar $1,000 normal"
                    >
                      $1,000
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateNextShiftCash(500)}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-black cursor-pointer"
                      title="Dejar $500"
                    >
                      $500
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateNextShiftCash(0)}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-black cursor-pointer"
                      title="Dejar $0"
                    >
                      $0
                    </button>
                  </div>
                </div>

                {/* BOTÓN CONTEO FÁCIL PARA EL FONDO DE CAJA */}
                <button
                  type="button"
                  id="toggle-next-shift-bills-btn"
                  onClick={() => {
                    playBeep(700, 'sine', 0.03);
                    setShowNextShiftCounter(prev => {
                      const next = !prev;
                      if (next) {
                        const total = calculateDenominationsTotal(nextShiftDenominations);
                        handleUpdateNextShiftCash(total);
                      }
                      return next;
                    });
                  }}
                  className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-all active:scale-98"
                >
                  <Coins className="w-4 h-4" />
                  <span>
                    {showNextShiftCounter ? '▲ Ocultar Conteo' : '🔢 Conteo Fácil de Cambio ($1,000)'}
                  </span>
                </button>
              </div>

              {/* PANEL DE CONTEO FÁCIL PARA FONDO DE SIGUIENTE TURNO */}
              {showNextShiftCounter && (
                <CashDenominationSelector
                  title="Conteo Fácil para Cambio en Caja ($1,000)"
                  subtitle="Selecciona los billetes y monedas que se quedan en el cajón (deben sumar $1,000)"
                  denominations={nextShiftDenominations}
                  onChange={(updated, total) => {
                    setNextShiftDenominations(updated);
                    handleUpdateNextShiftCash(total);
                  }}
                  autoTargetNotice="Colocado automáticamente en el Monto a Dejar"
                  onlyBills={false}
                  onApply={(total) => {
                    handleUpdateNextShiftCash(total);
                    setShowNextShiftCounter(false);
                  }}
                  onCancel={() => setShowNextShiftCounter(false)}
                />
              )}
            </div>

            {/* ========================================================= */}
            {/* 3. PASO 3: AHORA SÍ DEBES COLOCAR AQUÍ LO QUE SOBRA EN TU CAJA */}
            {/* ========================================================= */}
            <div className="bg-emerald-50/70 rounded-3xl p-3.5 sm:p-4 border-2 border-emerald-400 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-emerald-700 text-white flex items-center justify-center font-black text-sm shadow-xs">
                    3
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-emerald-950 leading-tight uppercase">
                      3. Ahora sí debes colocar aquí lo que sobra en tu caja
                    </h3>
                    <p className="text-[11px] text-emerald-800 font-bold leading-none mt-0.5">
                      Todo el dinero físico restante en el cajón (para la bolsita / sobre a entregar al patrón)
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs font-bold text-emerald-800 block">Efectivo Contado:</span>
                  <span className="text-lg font-black text-emerald-900 font-mono">
                    ${actualInBag}.00
                  </span>
                </div>
              </div>

              <div className="bg-white p-3 rounded-2xl border border-emerald-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Banknote className="w-4 h-4 text-emerald-700" />
                    <span>Efectivo Contado que Quedó en el Cajón</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyExpectedInBag}
                    className="text-[10px] text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-lg font-bold cursor-pointer transition-colors"
                    title="Copiar monto esperado"
                  >
                    📋 Copiar lo Esperado (${expectedInBag})
                  </button>
                </div>

                <div className="relative flex items-center">
                  <span className="absolute left-3 text-xl font-black text-emerald-700 font-mono">$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    id="remaining-cash-input"
                    value={remainingCashInput}
                    onChange={(e) => setRemainingCashInput(cleanAmountInput(e.target.value))}
                    onFocus={(e) => e.target.select()}
                    placeholder={expectedInBag > 0 ? expectedInBag.toString() : '0'}
                    className="w-full pl-8 pr-3 py-2 bg-white rounded-xl text-xl sm:text-2xl font-black text-emerald-700 border-2 border-emerald-500 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-300 font-mono shadow-2xs"
                  />
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] text-emerald-900 font-medium">
                    Tenía que haber en bolsita: <strong className="font-mono text-emerald-950 font-black">${expectedInBag}.00</strong>
                  </span>

                  {/* BOTÓN CONTEO FÁCIL PARA LO QUE QUEDÓ */}
                  <button
                    type="button"
                    id="toggle-remaining-easy-count-btn"
                    onClick={() => {
                      playBeep(700, 'sine', 0.03);
                      setShowRemainingCounter(prev => {
                        const next = !prev;
                        if (next) {
                          const total = calculateDenominationsTotal(remainingDenominations);
                          if (total > 0) {
                            setRemainingCashInput(total.toString());
                          }
                        }
                        return next;
                      });
                    }}
                    className="w-full sm:w-auto px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-all active:scale-98"
                  >
                    <Coins className="w-4 h-4" />
                    <span>
                      {showRemainingCounter ? '▲ Ocultar Conteo Fácil' : '🔢 Conteo Fácil de Billetes y Monedas'}
                    </span>
                  </button>
                </div>
              </div>

              {/* PANEL DE CONTEO FÁCIL PARA LO QUE QUEDÓ */}
              {showRemainingCounter && (
                <CashDenominationSelector
                  title="Conteo Fácil: Efectivo Contado que Quedó en el Cajón"
                  subtitle="Suma los billetes y monedas que quedaron para la bolsita. Se acumula automáticamente en el efectivo contado."
                  denominations={remainingDenominations}
                  onChange={(updated, total) => {
                    setRemainingDenominations(updated);
                    setRemainingCashInput(total > 0 ? total.toString() : '0');
                  }}
                  autoTargetNotice="Acumulándose automáticamente en Efectivo Contado que Quedó en el Cajón"
                  onlyBills={false}
                  onApply={(total) => {
                    setRemainingCashInput(total.toString());
                    setShowRemainingCounter(false);
                  }}
                  onCancel={() => setShowRemainingCounter(false)}
                />
              )}
            </div>

            {/* ========================================================= */}
            {/* ABAJO: ESTRUCTURA Y REGISTRO DE TARJETA EN TERMINAL */}
            {/* "YA ABAJO TU VAS A DEJAR LA ESTRUCTURA Y EL REGISTRO DE TARJETA" */}
            {/* ========================================================= */}
            <div className="bg-gradient-to-r from-blue-50/90 via-indigo-50/60 to-blue-50/90 rounded-3xl p-3.5 sm:p-4 border-2 border-blue-300 shadow-sm space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-200/80 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black shadow-xs shrink-0">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-black text-slate-900 leading-tight">
                        Cobro con Tarjeta en Terminal
                      </h3>
                      <span className="bg-blue-600 text-white text-[9.5px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shadow-2xs">
                        🔒 Automático del Sistema
                      </span>
                    </div>
                    <p className="text-[11px] text-blue-900 font-bold leading-none mt-0.5">
                      Ingresos registrados automáticamente por terminal / tickets del turno • No requiere captura
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[10px] text-slate-500 font-bold block">Tarjeta en este Turno:</span>
                  <span className="text-xl sm:text-2xl font-black text-blue-700 font-mono leading-none">
                    ${systemCardSales}.00
                  </span>
                </div>
              </div>

              {/* Desglose de ventas: Total - Tarjeta = Efectivo a Cuadrar */}
              <div className="grid grid-cols-3 gap-2 bg-white/95 p-2.5 rounded-2xl border border-blue-200 text-center shadow-2xs">
                <div>
                  <span className="text-[10px] text-slate-500 font-bold block uppercase tracking-wider">Ventas Totales</span>
                  <span className="text-sm sm:text-base font-black text-slate-900 font-mono">${systemTotalGross}.00</span>
                </div>
                <div className="border-x border-slate-200">
                  <span className="text-[10px] text-blue-700 font-bold block uppercase tracking-wider">Tarjeta (Automático)</span>
                  <span className="text-sm sm:text-base font-black text-blue-700 font-mono">-${systemCardSales}.00</span>
                </div>
                <div>
                  <span className="text-[10px] text-emerald-700 font-bold block uppercase tracking-wider">Efectivo a Cuadrar</span>
                  <span className="text-sm sm:text-base font-black text-emerald-700 font-mono">${systemCashSalesExpected}.00</span>
                </div>
              </div>
            </div>

            {/* ========================================================= */}
            {/* CÁLCULO CONFORME A LAS VENTAS: CUADRE DE BOLSITA (SOBRANTE O FALTANTE) */}
            {/* ========================================================= */}
            <div className={`rounded-3xl p-4 border-2 shadow-sm space-y-3.5 ${
              bagDifference === 0
                ? 'bg-emerald-50/90 border-emerald-400'
                : bagDifference > 0
                  ? 'bg-teal-50/90 border-teal-400'
                  : 'bg-rose-50/90 border-rose-400'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2.5 border-slate-200/80">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm text-white shadow-xs ${
                    bagDifference === 0 ? 'bg-emerald-600' : bagDifference > 0 ? 'bg-teal-600' : 'bg-rose-600'
                  }`}>
                    ⚖️
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-slate-900 leading-tight uppercase">
                      Cruce y Cuadre de la Bolsita: Tenía que Ponerse vs Realmente Quedó
                    </h3>
                    <p className="text-[11px] text-slate-600 font-bold leading-none mt-0.5">
                      Cálculo cruzado entre el efectivo que debía guardarse conforme a ventas/salidas y el dinero físico que realmente quedó
                    </p>
                  </div>
                </div>

                {/* Badge de Estado de la Bolsita */}
                <div className={`px-3 py-1.5 rounded-xl font-black text-xs sm:text-sm border shadow-2xs shrink-0 self-start sm:self-auto ${
                  bagDifference === 0
                    ? 'bg-emerald-600 text-white border-emerald-700'
                    : bagDifference > 0
                      ? 'bg-teal-600 text-white border-teal-700'
                      : 'bg-rose-600 text-white border-rose-700'
                }`}>
                  {bagDifference === 0 
                    ? '✅ BOLSITA CUADRADA EXACTA' 
                    : bagDifference > 0 
                      ? `🟢 SOBRANTE EN BOLSITA: +$${bagDifference}.00` 
                      : `🔴 FALTANTE EN BOLSITA: -$${Math.abs(bagDifference)}.00`}
                </div>
              </div>

              {/* 3 Tarjetas Comparativas: 1. Tenía que Ponerse | 2. Realmente Quedó | 3. Diferencia Cruzada */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* 1. Tenía que ponerse en bolsita */}
                <div className="bg-white p-3 rounded-2xl border-2 border-blue-300 shadow-2xs space-y-1">
                  <span className="text-[10.5px] font-black text-blue-900 uppercase tracking-wider block">
                    1. Tenía que Ponerse en Bolsita:
                  </span>
                  <div className="text-xl sm:text-2xl font-black text-blue-900 font-mono">
                    ${expectedInBag}.00
                  </div>
                  <div className="text-[10px] text-slate-600 font-bold space-y-0.5 pt-1 border-t border-slate-100">
                    <div className="flex justify-between">
                      <span>• Venta efec. sistema:</span>
                      <span className="font-mono font-bold text-emerald-800">${systemCashSalesExpected}.00</span>
                    </div>
                    <div className="flex justify-between">
                      <span>• Salidas pagadas (Paso 1):</span>
                      <span className="font-mono font-bold text-rose-700">-${totalOutflows}.00</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>• Se dejan en caja (Paso 2):</span>
                      <span className="font-mono">${nextShiftCash}.00</span>
                    </div>
                  </div>
                </div>

                {/* 2. Realmente quedó contado en bolsita */}
                <div className="bg-white p-3 rounded-2xl border-2 border-emerald-400 shadow-2xs space-y-1">
                  <span className="text-[10.5px] font-black text-emerald-950 uppercase tracking-wider block">
                    2. Realmente Quedó (Contado):
                  </span>
                  <div className="text-xl sm:text-2xl font-black text-emerald-700 font-mono">
                    ${actualInBag}.00
                  </div>
                  <div className="text-[10px] text-slate-600 font-bold space-y-0.5 pt-1 border-t border-slate-100">
                    <div className="flex justify-between">
                      <span>• Contado en Paso 3:</span>
                      <span className="font-mono font-bold text-emerald-800">${actualInBag}.00</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>• En caja queda cambio (Paso 2):</span>
                      <span className="font-mono">${nextShiftCash}.00</span>
                    </div>
                  </div>
                </div>

                {/* 3. Diferencia en bolsita */}
                <div className={`p-3 rounded-2xl border-2 shadow-2xs space-y-1 ${
                  bagDifference === 0
                    ? 'bg-emerald-100/80 border-emerald-400 text-emerald-950'
                    : bagDifference > 0
                      ? 'bg-teal-100/80 border-teal-400 text-teal-950'
                      : 'bg-rose-100/80 border-rose-400 text-rose-950'
                }`}>
                  <span className="text-[10.5px] font-black uppercase tracking-wider block opacity-90">
                    3. Cruce (Diferencia Bolsita):
                  </span>
                  <div className="text-xl sm:text-2xl font-black font-mono">
                    {bagDifference === 0 
                      ? '$0.00' 
                      : `${bagDifference > 0 ? '+' : '-'}$${Math.abs(bagDifference)}.00`}
                  </div>
                  <div className="text-[10.5px] font-black leading-tight pt-1">
                    {bagDifference === 0 && '✅ Efectivo en bolsita coincide exacto con lo que tenía que haber'}
                    {bagDifference > 0 && `🟢 Sobran $${bagDifference}.00 en la bolsita`}
                    {bagDifference < 0 && `🔴 Faltan $${Math.abs(bagDifference)}.00 en la bolsita`}
                  </div>
                </div>
              </div>

              {/* Visualización de la resta matemática */}
              <div className="bg-white/80 p-2.5 rounded-xl border border-slate-200 text-xs text-slate-700 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-bold flex-wrap">
                  <span className="text-slate-500 font-medium">Cruce Matemático:</span>
                  <span className="bg-emerald-100 text-emerald-900 px-1.5 py-0.5 rounded font-mono text-[11px] font-black">
                    Realmente Quedó (${actualInBag}.00)
                  </span>
                  <span>−</span>
                  <span className="bg-blue-100 text-blue-900 px-1.5 py-0.5 rounded font-mono text-[11px] font-black">
                    Tenía que Ponerse (${expectedInBag}.00)
                  </span>
                  <span>=</span>
                  <span className={`px-2 py-0.5 rounded font-mono text-xs font-black ${
                    bagDifference === 0 ? 'bg-emerald-200 text-emerald-950' : bagDifference > 0 ? 'bg-teal-200 text-teal-950' : 'bg-rose-200 text-rose-950'
                  }`}>
                    {bagDifference > 0 ? `+` : ''}${bagDifference}.00
                  </span>
                </div>

                <div className="font-black text-[11px]">
                  {bagDifference === 0 && '✅ Bolsita entregada con cuadre exacto'}
                  {bagDifference > 0 && '🟢 Hubo un sobrante en la bolsita'}
                  {bagDifference < 0 && '🔴 Hubo un faltante en la bolsita'}
                </div>
              </div>
            </div>

            {/* ========================================================= */}
            {/* HASTA ABAJO: DESGLOSE DE LO VENDIDO (PAN VS NO PAN) */}
            {/* ========================================================= */}
            <div className="bg-sky-50/70 rounded-3xl p-3.5 sm:p-4 border-2 border-sky-300 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-sky-200 pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-sky-600 text-white flex items-center justify-center font-black text-sm shadow-xs">
                    📊
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-sky-950 leading-tight">
                      Desglose de lo Vendido (Pan vs No Pan)
                    </h3>
                    <p className="text-[11px] text-sky-800 font-bold leading-none mt-0.5">
                      Comparativa de panadería tradicional vs abarrotes, lácteos y paletas
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-sky-700 font-bold block">Total No Pan:</span>
                  <span className="text-base sm:text-lg font-black text-sky-800 font-mono">
                    ${nonBreadTotal}.00
                  </span>
                </div>
              </div>

              {/* Tarjetas comparativas: Pan vs No Pan */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-white p-3 rounded-2xl border border-amber-300 shadow-2xs">
                  <div className="flex items-center gap-1.5 text-xs font-black text-amber-900 uppercase">
                    <Wheat className="w-4 h-4 text-amber-700" />
                    <span>Venta de Pan</span>
                  </div>
                  <div className="text-lg sm:text-xl font-black text-amber-700 font-mono mt-1">
                    ${breadTotal}.00
                  </div>
                  <span className="text-[10px] text-slate-500 font-bold block">
                    {breadPieces} piezas de pan
                  </span>
                </div>

                <div className="bg-white p-3 rounded-2xl border border-sky-300 shadow-2xs">
                  <div className="flex items-center gap-1.5 text-xs font-black text-sky-950 uppercase">
                    <ShoppingBag className="w-4 h-4 text-sky-600" />
                    <span>Venta de No Pan</span>
                  </div>
                  <div className="text-lg sm:text-xl font-black text-sky-700 font-mono mt-1">
                    ${nonBreadTotal}.00
                  </div>
                  <span className="text-[10px] text-slate-500 font-bold block">
                    {nonBreadPieces} artículos vendidos
                  </span>
                </div>
              </div>

              {/* Lista detallada de productos No Pan registrados */}
              {nonBreadItemsList && nonBreadItemsList.length > 0 ? (
                <div className="bg-white rounded-2xl p-3 border border-sky-200 space-y-2">
                  <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">
                    Detalle de Artículos No Pan Vendidos:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-32 overflow-y-auto">
                    {nonBreadItemsList.map((item, idx) => (
                      <div 
                        key={idx}
                        className="flex items-center justify-between p-1.5 px-2 bg-sky-50/50 rounded-xl border border-sky-100 text-xs"
                      >
                        <span className="truncate font-bold text-slate-800 pr-1">
                          • {item.name} ({item.quantity} pz)
                        </span>
                        <span className="font-mono font-black text-sky-800 shrink-0">
                          ${item.total}.00
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-white/80 p-2.5 rounded-2xl border border-sky-200 text-center text-xs text-slate-500 italic">
                  No hubo productos de no pan registrados con botón especial en este turno
                </div>
              )}
            </div>

            {/* SECCIÓN 5: OBSERVACIONES O NOTAS ADICIONALES */}
            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200 space-y-1">
              <label className="block text-[11px] font-black text-slate-600 uppercase">
                Observaciones / Notas del Turno (Opcional):
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Escribe cualquier detalle del turno (ej. billete roto, pago pendiente, etc.)"
                rows={2}
                className="w-full bg-white border border-slate-300 rounded-xl p-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* BOTONES DE ACCIÓN (PIE DEL MODAL) */}
          <div className="bg-slate-100 p-3 sm:p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2.5 shrink-0">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                id="shift-whatsapp-btn"
                onClick={handleSendWhatsApp}
                className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-2.5 px-3.5 rounded-xl flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Enviar WhatsApp</span>
              </button>

              <button
                type="button"
                id="shift-preview-ticket-btn"
                onClick={handleOpenPreview}
                className="flex-1 sm:flex-none bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-bold text-xs py-2.5 px-3.5 rounded-xl flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Eye className="w-4 h-4 text-[#D95D39]" />
                <span>Ver Previo</span>
              </button>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cerrar
              </button>

              <button
                type="button"
                id="shift-print-cut-btn"
                onClick={() => handleSaveAndPrintCut(true)}
                className="w-full sm:w-auto bg-[#D95D39] hover:bg-[#b84a2a] text-white font-black text-xs sm:text-sm py-2.5 px-5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-[#D95D39]/30 active:scale-95 transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Guardar e Imprimir Corte</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL DEL TICKET TÉRMICO VISUAL PREVIO */}
      {previewCutRecord && (
        <ThermalShiftCutTicket
          cut={previewCutRecord}
          settings={settings}
          onClose={() => setPreviewCutRecord(null)}
        />
      )}
    </>
  );
};
