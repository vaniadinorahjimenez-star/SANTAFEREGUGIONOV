import React, { useState, useMemo } from 'react';
import { BakeryOrder, ProductionSheetRow } from '../../types';
import { 
  CheckCircle, 
  Flame, 
  Clock, 
  ChefHat, 
  Check, 
  Printer, 
  FileText, 
  Search, 
  Filter, 
  ChevronDown, 
  Scale, 
  Box, 
  Zap,
  Calendar,
  Sparkles,
  PartyPopper,
  Layers,
  ArrowRight,
  Truck,
  Store,
  ShoppingBag
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { playBakerCheckSound, playCelebrationFanfare } from '../../utils/audio';
import { 
  getTodayString, 
  loadProductionSheet, 
  saveProductionSheet, 
  DEFAULT_PRODUCTION_SHEET,
  loadSettings 
} from '../../utils/storage';
import { VirtualBakerKeypad } from './VirtualBakerKeypad';
import { SmilingPanDeOrejita } from './SmilingPanDeOrejita';
import { SmilingCheeseCubileteCelebration } from '../SmilingCheeseCubileteCelebration';

interface BakersWorkshopProps {
  orders: BakeryOrder[];
  onToggleItemDone: (orderId: string, itemIdx: number) => void;
  onCompleteEntireOrder?: (orderId: string) => void;
}

type MainTab = 'pedidos' | 'semana' | 'formatos' | 'salados_desplegable';
type CategoryFilter = 'TODOS' | 'Salado' | 'Pan Dulce / Bizcocho' | 'Feite y Batidos';
type DayKey = 'lun' | 'mar' | 'mier' | 'juev' | 'vier' | 'sab' | 'dom';

const DAY_LABELS: Record<DayKey, string> = {
  lun: 'Lunes',
  mar: 'Martes',
  mier: 'Miércoles',
  juev: 'Jueves',
  vier: 'Viernes',
  sab: 'Sábado',
  dom: 'Domingo'
};

function getDayKeyFromDateString(dateStr: string): DayKey {
  if (!dateStr) return 'lun';
  const parts = dateStr.split('-');
  if (parts.length < 3) return 'lun';
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const date = new Date(y, m, d);
  const dayNum = date.getDay(); // 0 Sun, 1 Mon, ...
  switch (dayNum) {
    case 1: return 'lun';
    case 2: return 'mar';
    case 3: return 'mier';
    case 4: return 'juev';
    case 5: return 'vier';
    case 6: return 'sab';
    case 0: return 'dom';
    default: return 'lun';
  }
}

function matchOrderItemToSheetRow(itemName: string, rows: ProductionSheetRow[]): ProductionSheetRow | undefined {
  const norm = (itemName || '').toLowerCase().trim();
  if (!norm) return undefined;

  const direct = rows.find(r => r.breadName.toLowerCase().trim() === norm);
  if (direct) return direct;

  if (norm.includes('bolillo') || norm.includes('telera') || norm.includes('birote') || norm.includes('chapata')) {
    if (norm.includes('telera')) {
      const telera = rows.find(r => r.breadName.toUpperCase().includes('TELERA'));
      if (telera) return telera;
    }
    if (norm.includes('chapata')) {
      const chapata = rows.find(r => r.breadName.toUpperCase().includes('CHAPATA'));
      if (chapata) return chapata;
    }
    if (norm.includes('birote')) {
      const birote = rows.find(r => r.breadName.toUpperCase().includes('BIROTE'));
      if (birote) return birote;
    }
    const blanco = rows.find(r => r.breadName.toUpperCase() === 'PAN BLANCO' || r.breadName.toUpperCase().includes('BOLILLO'));
    if (blanco) return blanco;
  }

  return rows.find(r => norm.includes(r.breadName.toLowerCase()) || r.breadName.toLowerCase().includes(norm));
}

export const BakersWorkshop: React.FC<BakersWorkshopProps> = ({
  orders,
  onToggleItemDone
}) => {
  // Main view defaults to 'pedidos' (Pedidos Panaderos)
  const [activeMainTab, setActiveMainTab] = useState<MainTab>('pedidos');
  
  // Production Sheet states
  const [sheetRows, setSheetRows] = useState<ProductionSheetRow[]>(() => loadProductionSheet());
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('TODOS');
  const [searchBread, setSearchBread] = useState<string>('');
  const [saveAlert, setSaveAlert] = useState<string>('');
  
  // Accordions for Format Sheets
  const [isSaladoExpanded, setIsSaladoExpanded] = useState<boolean>(true);

  // Virtual Keypad Modal state
  const [keypadModal, setKeypadModal] = useState<{
    isOpen: boolean;
    rowId: string;
    breadName: string;
    category: string;
    dayKey: DayKey;
    currentValue: string;
    orderDemandQuantity: number;
    orderDemandClients: string[];
  }>({
    isOpen: false,
    rowId: '',
    breadName: '',
    category: '',
    dayKey: 'lun',
    currentValue: '',
    orderDemandQuantity: 0,
    orderDemandClients: []
  });

  // Bakers Orders Tab States
  const [filterDate, setFilterDate] = useState<'hoy' | 'manana' | 'todos'>('hoy');
  const [bakerCategoryFilter, setBakerCategoryFilter] = useState<'TODOS' | 'Salado' | 'Pan Dulce / Bizcocho' | 'Feite y Batidos'>('TODOS');
  const [bakerViewLayout, setBakerViewLayout] = useState<'lista_prioridades' | 'tarjetas_pedidos'>('lista_prioridades');
  const [celebrationModalOrder, setCelebrationModalOrder] = useState<BakeryOrder | null>(null);
  
  // Smiling Orejita Modal State
  const [smilingOrejitaState, setSmilingOrejitaState] = useState<{
    show: boolean;
    breadName: string;
    quantity: number;
    unit: string;
    itemType?: 'Normal' | 'Mini';
  } | null>(null);

  const settings = loadSettings();
  const todayStr = getTodayString();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const currentDayKey = getDayKeyFromDateString(todayStr);

  // Demand aggregation per row and day
  const orderDemandMap = useMemo(() => {
    const demand: Record<string, Record<DayKey, { totalPieces: number; clients: string[]; orderIds: string[] }>> = {};

    sheetRows.forEach(row => {
      demand[row.id] = {
        lun: { totalPieces: 0, clients: [], orderIds: [] },
        mar: { totalPieces: 0, clients: [], orderIds: [] },
        mier: { totalPieces: 0, clients: [], orderIds: [] },
        juev: { totalPieces: 0, clients: [], orderIds: [] },
        vier: { totalPieces: 0, clients: [], orderIds: [] },
        sab: { totalPieces: 0, clients: [], orderIds: [] },
        dom: { totalPieces: 0, clients: [], orderIds: [] }
      };
    });

    orders.forEach(order => {
      const dayKey = getDayKeyFromDateString(order.deliveryDate);
      order.items.forEach(item => {
        const matchedRow = matchOrderItemToSheetRow(item.name, sheetRows);
        if (matchedRow && demand[matchedRow.id] && demand[matchedRow.id][dayKey]) {
          demand[matchedRow.id][dayKey].totalPieces += item.quantity;
          if (!demand[matchedRow.id][dayKey].clients.includes(order.customerName)) {
            demand[matchedRow.id][dayKey].clients.push(order.customerName);
          }
          if (!demand[matchedRow.id][dayKey].orderIds.includes(order.id)) {
            demand[matchedRow.id][dayKey].orderIds.push(order.id);
          }
        }
      });
    });

    return demand;
  }, [orders, sheetRows]);

  // Handle cell change in weekly format
  const handleCellChange = (id: string, day: DayKey, value: string) => {
    setSheetRows(prev => {
      const updated = prev.map(row => {
        if (row.id === id) {
          return { ...row, [day]: value };
        }
        return row;
      });
      saveProductionSheet(updated);
      return updated;
    });
  };

  // Open virtual keypad
  const handleOpenKeypad = (row: ProductionSheetRow, dayKey: DayKey) => {
    const demandInfo = orderDemandMap[row.id]?.[dayKey] || { totalPieces: 0, clients: [] };
    setKeypadModal({
      isOpen: true,
      rowId: row.id,
      breadName: row.breadName,
      category: row.category,
      dayKey: dayKey,
      currentValue: row[dayKey] || '',
      orderDemandQuantity: demandInfo.totalPieces,
      orderDemandClients: demandInfo.clients
    });
  };

  // Save from virtual keypad
  const handleSaveFromKeypad = (formattedValue: string) => {
    if (!keypadModal.rowId) return;
    handleCellChange(keypadModal.rowId, keypadModal.dayKey, formattedValue);
    setSaveAlert(`✓ Guardado: ${keypadModal.breadName} (${DAY_LABELS[keypadModal.dayKey]}) = ${formattedValue || '(vacío)'}`);
    setTimeout(() => setSaveAlert(''), 3000);
  };

  // Filter orders by delivery date
  const relevantOrders = useMemo(() => {
    return orders.filter(order => {
      if (filterDate === 'hoy') return order.deliveryDate === todayStr;
      if (filterDate === 'manana') return order.deliveryDate === tomorrowStr;
      return true;
    });
  }, [orders, filterDate, todayStr, tomorrowStr]);

  // Calculate totals for progress bar
  let totalItemsCount = 0;
  let completedItemsCount = 0;
  let totalBreadPieces = 0;
  let completedBreadPieces = 0;

  relevantOrders.forEach(order => {
    order.items.forEach(item => {
      totalItemsCount += 1;
      totalBreadPieces += item.quantity;
      if (item.done) {
        completedItemsCount += 1;
        completedBreadPieces += item.quantity;
      }
    });
  });

  const progressPercentage = totalBreadPieces > 0 
    ? Math.round((completedBreadPieces / totalBreadPieces) * 100) 
    : 0;

  // Normalized list of production items with strict priority sorting
  const sortedProductionList = useMemo(() => {
    interface BakerListItem {
      orderId: string;
      itemIdx: number;
      breadName: string;
      category: 'Salado' | 'Pan Dulce / Bizcocho' | 'Feite y Batidos';
      quantity: number;
      unit: 'PZ' | 'CH' | 'KG';
      itemType: 'Normal' | 'Mini';
      priorityOrder: 1 | 2 | 3;
      priorityLabel: string;
      priorityBadgeClass: string;
      priorityIcon: string;
      customerName: string;
      deliveryTime: string;
      deliveryDate: string;
      assignedDriverId?: string;
      folio: string;
      notes?: string;
      done: boolean;
    }

    const list: BakerListItem[] = [];

    relevantOrders.forEach(order => {
      // 1. Pide y Recoge > 2. Reparto > 3. Venta en Tienda
      let priorityOrder: 1 | 2 | 3 = 2;
      let priorityLabel = '2. REPARTO';
      let priorityBadgeClass = 'bg-blue-700 text-white';
      let priorityIcon = '🛵';

      const custLower = (order.customerName || '').toLowerCase();
      const isPickup = order.orderChannel === 'recoger_tienda' || 
        (order.deliveryType === 'tienda' && !custLower.includes('venta en tienda') && !custLower.includes('mostrador general')) ||
        order.origin === 'pide_recoge' ||
        ['trascos', 'magda', 'bollos david', 'deliz', 'recoge'].some(pk => custLower.includes(pk));

      const isStoreSale = order.orderChannel === 'venta_tienda' || 
        custLower.includes('venta en tienda') || 
        custLower.includes('mostrador general');

      if (isPickup) {
        priorityOrder = 1;
        priorityLabel = '1. PIDE Y RECOGE';
        priorityBadgeClass = 'bg-purple-700 text-white shadow-md';
        priorityIcon = '🛍️';
      } else if (isStoreSale) {
        priorityOrder = 3;
        priorityLabel = '3. VENTA EN TIENDA';
        priorityBadgeClass = 'bg-emerald-700 text-white';
        priorityIcon = '🏪';
      } else {
        priorityOrder = 2;
        priorityLabel = '2. REPARTO';
        priorityBadgeClass = 'bg-blue-700 text-white shadow-md';
        priorityIcon = '🛵';
      }

      order.items.forEach((item, itemIdx) => {
        let category: 'Salado' | 'Pan Dulce / Bizcocho' | 'Feite y Batidos' = 'Pan Dulce / Bizcocho';
        const catLower = (item.category || '').toLowerCase();
        const nameLower = (item.name || '').toLowerCase();

        if (
          catLower.includes('salado') || 
          catLower.includes('bolillo') || 
          catLower.includes('telera') || 
          nameLower.includes('bolillo') || 
          nameLower.includes('telera') || 
          nameLower.includes('birote') || 
          nameLower.includes('chapata') || 
          nameLower.includes('baguett') ||
          nameLower.includes('pambazo') ||
          nameLower.includes('blanco')
        ) {
          category = 'Salado';
        } else if (
          catLower.includes('feit') || 
          catLower.includes('batido') || 
          catLower.includes('especial') || 
          catLower.includes('pastel') || 
          catLower.includes('empanada') || 
          catLower.includes('tarta') || 
          nameLower.includes('empanada') || 
          nameLower.includes('strudell') || 
          nameLower.includes('panqué') || 
          nameLower.includes('cubilete') || 
          nameLower.includes('hojaldre') ||
          nameLower.includes('oreja') ||
          nameLower.includes('abanico')
        ) {
          category = 'Feite y Batidos';
        }

        const isMini = item.itemType === 'Mini' || nameLower.includes('mini');

        list.push({
          orderId: order.id,
          itemIdx,
          breadName: item.name,
          category,
          quantity: item.quantity,
          unit: (item.unit as 'PZ' | 'CH' | 'KG') || 'PZ',
          itemType: isMini ? 'Mini' : 'Normal',
          priorityOrder,
          priorityLabel,
          priorityBadgeClass,
          priorityIcon,
          customerName: order.customerName,
          deliveryTime: order.deliveryTime,
          deliveryDate: order.deliveryDate,
          assignedDriverId: order.assignedDriverId,
          folio: order.folio,
          notes: order.notes,
          done: !!item.done
        });
      });
    });

    // Sort: Priority (1. Pide y Recoge -> 2. Reparto -> 3. Venta en Tienda), then Time, then Bread Name
    return list.sort((a, b) => {
      if (a.priorityOrder !== b.priorityOrder) return a.priorityOrder - b.priorityOrder;
      if (a.deliveryTime !== b.deliveryTime) return a.deliveryTime.localeCompare(b.deliveryTime);
      return a.breadName.localeCompare(b.breadName);
    });
  }, [relevantOrders]);

  // Filtered by Category
  const filteredProductionList = useMemo(() => {
    return sortedProductionList.filter(item => {
      if (bakerCategoryFilter === 'TODOS') return true;
      return item.category === bakerCategoryFilter;
    });
  }, [sortedProductionList, bakerCategoryFilter]);

  // Batido & Piezas Calculation per Category
  const batidoMetrics = useMemo(() => {
    const calc = {
      salado: { total: 0, done: 0, normal: 0, mini: 0, charolas: 0, breads: {} as Record<string, number> },
      dulce: { total: 0, done: 0, normal: 0, mini: 0, charolas: 0, breads: {} as Record<string, number> },
      feite: { total: 0, done: 0, normal: 0, mini: 0, charolas: 0, breads: {} as Record<string, number> }
    };

    sortedProductionList.forEach(item => {
      let target = calc.dulce;
      if (item.category === 'Salado') target = calc.salado;
      else if (item.category === 'Feite y Batidos') target = calc.feite;

      target.total += item.quantity;
      if (item.done) target.done += item.quantity;
      if (item.itemType === 'Mini') target.mini += item.quantity;
      else target.normal += item.quantity;

      if (item.unit === 'CH') target.charolas += item.quantity;

      target.breads[item.breadName] = (target.breads[item.breadName] || 0) + item.quantity;
    });

    return calc;
  }, [sortedProductionList]);

  // Checklist Item Toggle with Sound + Smiling Pan de Orejita Toast
  const handleCheckItem = (orderId: string, itemIdx: number, currentlyDone?: boolean) => {
    if (!currentlyDone) {
      playBakerCheckSound();
      const order = orders.find(o => o.id === orderId);
      if (order) {
        const item = order.items[itemIdx];
        const nextDoneCount = completedBreadPieces + (item ? item.quantity : 1);
        const nextPct = totalBreadPieces > 0 ? Math.round((nextDoneCount / totalBreadPieces) * 100) : 100;

        setSmilingOrejitaState({
          show: true,
          breadName: item ? item.name : 'Pan',
          quantity: item ? item.quantity : 1,
          unit: item ? (item.unit || 'PZ') : 'PZ',
          itemType: item ? (item.itemType as 'Normal' | 'Mini') : 'Normal'
        });

        // Check if all order items or all day items are completed
        const remainingInOrder = order.items.filter((it, idx) => idx !== itemIdx && !it.done).length;
        if (remainingInOrder === 0) {
          playCelebrationFanfare();
          confetti({
            particleCount: 110,
            spread: 85,
            origin: { y: 0.5 },
            colors: ['#D95D39', '#eab308', '#22c55e', '#ffffff']
          });
        }
      }
    }
    onToggleItemDone(orderId, itemIdx);
  };

  const handleCompleteAllItems = (order: BakeryOrder) => {
    playCelebrationFanfare();
    confetti({
      particleCount: 130,
      spread: 90,
      origin: { y: 0.5 },
      colors: ['#D95D39', '#eab308', '#22c55e', '#ffffff']
    });
    setCelebrationModalOrder(order);

    order.items.forEach((it, idx) => {
      if (!it.done) {
        onToggleItemDone(order.id, idx);
      }
    });
  };

  // Weekly grouped demands (Lunes a Domingo)
  const weeklyOrdersByDay = useMemo(() => {
    const days: { key: DayKey; label: string; dateStr: string; itemsCount: number; piecesCount: number; ordersCount: number }[] = [];
    const baseDate = new Date();
    // Monday of current week
    const currentDay = baseDate.getDay();
    const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const monday = new Date(baseDate);
    monday.setDate(baseDate.getDate() + distanceToMonday);

    const dayKeys: DayKey[] = ['lun', 'mar', 'mier', 'juev', 'vier', 'sab', 'dom'];

    dayKeys.forEach((dKey, idx) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + idx);
      const dStr = d.toISOString().split('T')[0];

      const dayOrders = orders.filter(o => o.deliveryDate === dStr);
      let pCount = 0;
      let iCount = 0;

      dayOrders.forEach(o => {
        o.items.forEach(it => {
          iCount += 1;
          pCount += it.quantity;
        });
      });

      days.push({
        key: dKey,
        label: DAY_LABELS[dKey],
        dateStr: dStr,
        itemsCount: iCount,
        piecesCount: pCount,
        ordersCount: dayOrders.length
      });
    });

    return days;
  }, [orders]);

  const saladosRows = sheetRows.filter(r => r.category === 'Salado');
  const dulceRows = sheetRows.filter(r => r.category === 'Pan Dulce / Bizcocho');
  const feiteRows = sheetRows.filter(r => r.category === 'Feite y Batidos');

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* Top Banner with Navigation */}
      <div className="bg-[#2D3142] text-white rounded-3xl p-5 md:p-6 shadow-xl border border-[#E5E1DA]/20">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-500 text-slate-950 p-2 shadow-md border-2 border-amber-300 shrink-0 overflow-hidden flex items-center justify-center text-3xl font-black">
              👨‍🍳
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-[#D95D39] text-white text-xs font-black px-3 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-xs">
                  <Flame className="w-3.5 h-3.5" /> Pizarrón del Taller
                </span>
                <span className="text-xs text-[#FAF8F6]/80 font-medium">
                  {settings.bakeryName}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold font-serif italic mt-0.5 text-white">
                Pedidos para Panaderos & Batidos
              </h1>
              <p className="text-xs sm:text-sm text-[#FAF8F6]/90 mt-0.5">
                Cálculo de masas por categoría, prioridad de horneado y lista de control sin precios.
              </p>
            </div>
          </div>

          {/* Master Tabs Switcher */}
          <div className="flex flex-wrap items-center bg-black/40 p-1.5 rounded-2xl border border-white/25 gap-1.5 w-full md:w-auto">
            <button
              id="tab-pedidos-horno"
              onClick={() => setActiveMainTab('pedidos')}
              className={`flex-1 md:flex-none px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeMainTab === 'pedidos'
                  ? 'bg-[#D95D39] text-white shadow-lg ring-2 ring-white/50 scale-101'
                  : 'text-[#FAF8F6]/80 hover:text-white hover:bg-white/10'
              }`}
            >
              <Flame className="w-4 h-4" />
              <span>📦 Pedidos & Batidos ({relevantOrders.length})</span>
            </button>

            <button
              id="tab-vista-semana"
              onClick={() => setActiveMainTab('semana')}
              className={`flex-1 md:flex-none px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeMainTab === 'semana'
                  ? 'bg-amber-600 text-white shadow-lg ring-2 ring-white/50 scale-101'
                  : 'text-[#FAF8F6]/80 hover:text-white hover:bg-white/10'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>📅 Vista por Semana</span>
            </button>

            <button
              id="tab-formatos-produccion"
              onClick={() => setActiveMainTab('formatos')}
              className={`flex-1 md:flex-none px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeMainTab === 'formatos'
                  ? 'bg-slate-800 text-white shadow-lg ring-2 ring-white/50 scale-101'
                  : 'text-[#FAF8F6]/80 hover:text-white hover:bg-white/10'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>📋 Hoja Matriz ({sheetRows.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Save Alert Toast */}
      {saveAlert && (
        <div className="bg-emerald-600 text-white px-5 py-3 rounded-2xl text-sm font-black shadow-lg border-2 border-emerald-300 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <Check className="w-5 h-5 text-white" />
            <span>{saveAlert}</span>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 1: PEDIDOS PANADEROS & BATIDOS DEL DÍA (PRIMARY / DEFAULT VIEW)  */}
      {/* ========================================================================= */}
      {activeMainTab === 'pedidos' && (
        <div className="space-y-6">
          {/* TOP MASTER PROGRESS BAR & SUMMARY */}
          <div className="bg-white rounded-3xl p-5 md:p-6 shadow-sm border-2 border-[#E5E1DA] space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Title & Priority Explanation */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="bg-amber-100 text-amber-950 font-black text-xs px-3 py-1 rounded-xl border border-amber-300 flex items-center gap-1.5">
                    <span>🥐😊</span>
                    <span>Lista de Producción y Control</span>
                  </span>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                    Avance Total de Horneado
                  </h2>
                </div>
                <p className="text-xs sm:text-sm text-slate-600">
                  Prioridad obligatoria: <strong className="text-purple-800 bg-purple-100 px-2 py-0.5 rounded font-black">🥇 1. Pide y Recoge</strong> ➔ <strong className="text-blue-800 bg-blue-100 px-2 py-0.5 rounded font-black">🥈 2. Reparto</strong> ➔ <strong className="text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded font-black">🥉 3. Venta en Tienda</strong>.
                </p>
              </div>

              {/* Date Filters: Hoy | Mañana | Todos */}
              <div className="flex items-center bg-[#FAF8F6] p-1.5 rounded-2xl border-2 border-[#E5E1DA] gap-1.5 w-full lg:w-auto">
                <button
                  id="filter-date-hoy"
                  onClick={() => setFilterDate('hoy')}
                  className={`flex-1 lg:flex-none px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    filterDate === 'hoy'
                      ? 'bg-[#D95D39] text-white shadow-md'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <span>🌞 Solo de Hoy</span>
                  <span className="bg-black/20 px-1.5 py-0.2 rounded text-xs">
                    {orders.filter(o => o.deliveryDate === todayStr).length}
                  </span>
                </button>

                <button
                  id="filter-date-manana"
                  onClick={() => setFilterDate('manana')}
                  className={`flex-1 lg:flex-none px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    filterDate === 'manana'
                      ? 'bg-[#D95D39] text-white shadow-md'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <span>📅 Mañana</span>
                  <span className="bg-black/20 px-1.5 py-0.2 rounded text-xs">
                    {orders.filter(o => o.deliveryDate === tomorrowStr).length}
                  </span>
                </button>

                <button
                  id="filter-date-todos"
                  onClick={() => setFilterDate('todos')}
                  className={`flex-1 lg:flex-none px-3 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer ${
                    filterDate === 'todos'
                      ? 'bg-[#D95D39] text-white shadow-md'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <span>Todos ({orders.length})</span>
                </button>
              </div>
            </div>

            {/* LIVE ANIMATED PROGRESS BAR */}
            <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-emerald-50 p-4 sm:p-5 rounded-2xl border-2 border-amber-200 space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between text-sm sm:text-base font-extrabold flex-wrap gap-2">
                <div className="flex items-center gap-2 text-slate-800">
                  <Flame className="w-5 h-5 text-[#D95D39] animate-pulse" />
                  <span className="text-base sm:text-lg">
                    Progreso General: <strong className="text-slate-950 text-2xl sm:text-3xl font-black font-mono">{completedBreadPieces}</strong> de <strong className="text-slate-950 text-2xl sm:text-3xl font-black font-mono">{totalBreadPieces}</strong> piezas horneadas
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-base sm:text-lg font-black text-[#D95D39] bg-white px-4 py-1.5 rounded-full border-2 border-amber-300 shadow-xs font-mono">
                    {progressPercentage}% Completado
                  </span>
                </div>
              </div>

              {/* Progress Track */}
              <div className="w-full bg-slate-200 h-6 rounded-full overflow-hidden p-1 border-2 border-slate-300 relative shadow-inner">
                <div
                  className="h-full bg-gradient-to-r from-[#D95D39] via-amber-500 to-emerald-500 rounded-full transition-all duration-500 ease-out flex items-center justify-end pr-1"
                  style={{ width: `${Math.max(4, progressPercentage)}%` }}
                >
                  {progressPercentage > 15 && (
                    <span className="text-xs text-white font-black drop-shadow">🥐</span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-slate-700">
                <span>Total de renglones: <strong className="text-slate-950 text-sm font-mono">{completedItemsCount}</strong> de <strong className="text-slate-950 text-sm font-mono">{totalItemsCount}</strong> concluidos</span>
                <span>
                  {totalBreadPieces - completedBreadPieces > 0
                    ? <span>Faltan <strong className="text-[#D95D39] text-base font-mono">{totalBreadPieces - completedBreadPieces}</strong> piezas en el horno</span>
                    : '¡Todo el pan programado ha sido horneado! 🎉'
                  }
                </span>
              </div>
            </div>

            {/* SUBCATEGORY FILTER TABS & BATIDO CALCULATOR SUMMARY */}
            <div className="pt-2 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Filter className="w-4 h-4 text-[#D95D39]" />
                  <span>Filtrar por Categoría / Tipo de Batido:</span>
                </label>

                {/* View Layout Toggle */}
                <div className="flex items-center bg-[#FAF8F6] p-1 rounded-xl border border-slate-200">
                  <button
                    onClick={() => setBakerViewLayout('lista_prioridades')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1 ${
                      bakerViewLayout === 'lista_prioridades'
                        ? 'bg-white text-slate-900 shadow-xs border border-slate-300'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5 text-[#D95D39]" />
                    <span>Lista por Prioridad</span>
                  </button>
                  <button
                    onClick={() => setBakerViewLayout('tarjetas_pedidos')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1 ${
                      bakerViewLayout === 'tarjetas_pedidos'
                        ? 'bg-white text-slate-900 shadow-xs border border-slate-300'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <Box className="w-3.5 h-3.5 text-blue-600" />
                    <span>Por Pedido Cliente</span>
                  </button>
                </div>
              </div>

              {/* 4 Interactive Category Cards with Batido Count */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 1. Salado */}
                <button
                  id="cat-salado-btn"
                  onClick={() => setBakerCategoryFilter('Salado')}
                  className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${
                    bakerCategoryFilter === 'Salado'
                      ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-lg scale-102 ring-2 ring-amber-300'
                      : 'bg-amber-50/70 hover:bg-amber-100 text-slate-900 border-amber-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1">
                      <span>🥖</span> Pan Salado
                    </span>
                    <span className={`text-sm font-mono font-black px-2.5 py-0.5 rounded-full ${
                      bakerCategoryFilter === 'Salado' ? 'bg-slate-950 text-amber-400' : 'bg-amber-200 text-amber-950'
                    }`}>
                      {batidoMetrics.salado.done} / {batidoMetrics.salado.total} pz
                    </span>
                  </div>
                  <div className="mt-2">
                    <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight">
                      {batidoMetrics.salado.total} <span className="text-xs font-black uppercase tracking-normal">Piezas a Batir</span>
                    </div>
                    <p className={`text-xs mt-1 ${bakerCategoryFilter === 'Salado' ? 'text-slate-900 font-bold' : 'text-slate-600 font-medium'}`}>
                      Bolillos, teleras, baguettes, chapatas, birotes
                    </p>
                  </div>
                </button>

                {/* 2. Pan Dulce / Bizcocho */}
                <button
                  id="cat-dulce-btn"
                  onClick={() => setBakerCategoryFilter('Pan Dulce / Bizcocho')}
                  className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${
                    bakerCategoryFilter === 'Pan Dulce / Bizcocho'
                      ? 'bg-orange-500 text-white border-orange-600 shadow-lg scale-102 ring-2 ring-orange-300'
                      : 'bg-orange-50/70 hover:bg-orange-100 text-slate-900 border-orange-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1">
                      <span>🥐</span> Bizcocho & Danés
                    </span>
                    <span className={`text-sm font-mono font-black px-2.5 py-0.5 rounded-full ${
                      bakerCategoryFilter === 'Pan Dulce / Bizcocho' ? 'bg-white text-orange-950' : 'bg-orange-200 text-orange-950'
                    }`}>
                      {batidoMetrics.dulce.done} / {batidoMetrics.dulce.total} pz
                    </span>
                  </div>
                  <div className="mt-2">
                    <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight">
                      {batidoMetrics.dulce.total} <span className="text-xs font-black uppercase tracking-normal">Piezas a Batir</span>
                    </div>
                    <p className={`text-xs mt-1 ${bakerCategoryFilter === 'Pan Dulce / Bizcocho' ? 'text-white/90 font-bold' : 'text-slate-600 font-medium'}`}>
                      Conchas, novias, manteconchas, cuernitos, donas
                    </p>
                  </div>
                </button>

                {/* 3. Feite y Batidos */}
                <button
                  id="cat-feite-btn"
                  onClick={() => setBakerCategoryFilter('Feite y Batidos')}
                  className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${
                    bakerCategoryFilter === 'Feite y Batidos'
                      ? 'bg-rose-600 text-white border-rose-700 shadow-lg scale-102 ring-2 ring-rose-300'
                      : 'bg-rose-50/70 hover:bg-rose-100 text-slate-900 border-rose-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1">
                      <span>🥧</span> Feité & Batidos Esp.
                    </span>
                    <span className={`text-sm font-mono font-black px-2.5 py-0.5 rounded-full ${
                      bakerCategoryFilter === 'Feite y Batidos' ? 'bg-white text-rose-950' : 'bg-rose-200 text-rose-950'
                    }`}>
                      {batidoMetrics.feite.done} / {batidoMetrics.feite.total} pz
                    </span>
                  </div>
                  <div className="mt-2">
                    <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight">
                      {batidoMetrics.feite.total} <span className="text-xs font-black uppercase tracking-normal">Piezas Especiales</span>
                    </div>
                    <p className={`text-xs mt-1 ${bakerCategoryFilter === 'Feite y Batidos' ? 'text-white/90 font-bold' : 'text-slate-600 font-medium'}`}>
                      Orejas, empanadas, strudells, panqués, cubiletes
                    </p>
                  </div>
                </button>

                {/* 4. Todos */}
                <button
                  id="cat-todos-btn"
                  onClick={() => setBakerCategoryFilter('TODOS')}
                  className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${
                    bakerCategoryFilter === 'TODOS'
                      ? 'bg-[#2D3142] text-white border-slate-900 shadow-lg scale-102 ring-2 ring-slate-400'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-900 border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1">
                      <span>📋</span> Todas las Categorías
                    </span>
                    <span className={`text-sm font-mono font-black px-2.5 py-0.5 rounded-full ${
                      bakerCategoryFilter === 'TODOS' ? 'bg-amber-400 text-slate-950' : 'bg-slate-300 text-slate-900'
                    }`}>
                      {completedBreadPieces} / {totalBreadPieces} pz
                    </span>
                  </div>
                  <div className="mt-2">
                    <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight">
                      {totalBreadPieces} <span className="text-xs font-black uppercase tracking-normal">Total General</span>
                    </div>
                    <p className={`text-xs mt-1 ${bakerCategoryFilter === 'TODOS' ? 'text-white/90 font-bold' : 'text-slate-600 font-medium'}`}>
                      Ver todo el horno consolidado sin filtro
                    </p>
                  </div>
                </button>
              </div>

              {/* BATIDO DETAIL ACCORDION PILL SUMMARY */}
              {bakerCategoryFilter !== 'TODOS' && (
                <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-200 flex flex-wrap items-center gap-3 text-xs font-bold text-amber-950">
                  <span className="font-black flex items-center gap-1">
                    <span>🥣</span> Resumen para Medir Masa de {bakerCategoryFilter}:
                  </span>
                  {Object.entries(
                    bakerCategoryFilter === 'Salado' 
                      ? batidoMetrics.salado.breads 
                      : bakerCategoryFilter === 'Pan Dulce / Bizcocho' 
                      ? batidoMetrics.dulce.breads 
                      : batidoMetrics.feite.breads
                  ).map(([bread, qty]) => (
                    <span key={bread} className="bg-white px-2.5 py-1 rounded-xl border border-amber-300 font-black shadow-2xs">
                      {bread}: <strong className="text-[#D95D39]">{qty} pz</strong>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ======================================================================= */}
          {/* MAIN VIEW A: LISTA DE PRODUCCIÓN ORDENADA POR PRIORIDAD (SINGLE-VIEW)   */}
          {/* ======================================================================= */}
          {bakerViewLayout === 'lista_prioridades' && (
            <div className="space-y-4">
              {filteredProductionList.length === 0 ? (
                <div className="bg-white rounded-3xl p-12 text-center border-2 border-[#E5E1DA] space-y-3">
                  <ChefHat className="w-14 h-14 text-slate-300 mx-auto animate-bounce" />
                  <h3 className="text-lg font-black text-slate-800">
                    No hay encargos pendientes para esta categoría y fecha
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Todos los panes de este turno han sido completados o no se han registrado encargos para este día.
                  </p>
                </div>
              ) : (
                <div className="bg-white rounded-3xl shadow-sm border-2 border-[#E5E1DA] overflow-hidden">
                  {/* Table Header (Hidden on small screens, grid on large) */}
                  <div className="hidden lg:grid grid-cols-12 bg-slate-900 text-white text-xs font-black px-6 py-3.5 gap-3 uppercase tracking-wider">
                    <div className="col-span-2">Prioridad</div>
                    <div className="col-span-2">Categoría</div>
                    <div className="col-span-3">Nombre del Pan</div>
                    <div className="col-span-1 text-center">Unidad / Tipo</div>
                    <div className="col-span-2">Cantidad a Hornear</div>
                    <div className="col-span-2 text-right">Check List (Horneado)</div>
                  </div>

                  <div className="divide-y-2 divide-slate-100">
                    {filteredProductionList.map((item, idx) => {
                      const isEven = idx % 2 === 0;
                      return (
                        <div
                          key={`${item.orderId}-${item.itemIdx}`}
                          className={`p-4 sm:p-5 transition-all flex flex-col lg:grid lg:grid-cols-12 gap-3 items-start lg:items-center ${
                            item.done
                              ? 'bg-emerald-50/50 text-slate-600'
                              : isEven
                              ? 'bg-white hover:bg-amber-50/30'
                              : 'bg-[#FAF8F6] hover:bg-amber-50/30'
                          }`}
                        >
                          {/* Priority Badge */}
                          <div className="col-span-2 flex flex-wrap items-center gap-1.5">
                            <span className={`text-xs font-black px-3 py-1.5 rounded-xl flex items-center gap-1 shadow-xs ${item.priorityBadgeClass}`}>
                              <span>{item.priorityIcon}</span>
                              <span>{item.priorityLabel}</span>
                            </span>
                            <span className="text-[11px] text-slate-600 font-extrabold flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                              <Clock className="w-3.5 h-3.5 text-[#D95D39]" />
                              {item.deliveryTime}
                            </span>
                          </div>

                          {/* Category Badge */}
                          <div className="col-span-2">
                            <span className={`text-xs font-black px-3 py-1 rounded-xl border ${
                              item.category === 'Salado'
                                ? 'bg-amber-100 text-amber-950 border-amber-300'
                                : item.category === 'Feite y Batidos'
                                ? 'bg-rose-100 text-rose-950 border-rose-300'
                                : 'bg-orange-100 text-orange-950 border-orange-300'
                            }`}>
                              {item.category === 'Salado' && '🥖 '}
                              {item.category === 'Pan Dulce / Bizcocho' && '🥐 '}
                              {item.category === 'Feite y Batidos' && '🥧 '}
                              {item.category}
                            </span>
                          </div>

                          {/* Bread Name & Customer info */}
                          <div className="col-span-3 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-base sm:text-lg font-black ${item.done ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                                {item.breadName}
                              </span>
                            </div>
                            <div className="text-xs text-slate-600 flex flex-wrap items-center gap-1.5">
                              <span className="font-bold text-slate-800">Para: {item.customerName}</span>
                              <span className="text-slate-400 font-mono">({item.folio})</span>
                              {item.assignedDriverId === 'osvaldo' && (
                                <span className="bg-blue-100 text-blue-900 text-[10px] font-black px-2 py-0.5 rounded-md border border-blue-300">
                                  🛵 Osvaldo
                                </span>
                              )}
                              {item.assignedDriverId === 'simon' && (
                                <span className="bg-emerald-100 text-emerald-900 text-[10px] font-black px-2 py-0.5 rounded-md border border-emerald-300">
                                  🛵 Simón
                                </span>
                              )}
                            </div>
                            {item.notes && (
                              <p className="text-xs text-amber-950 bg-amber-100/80 px-2.5 py-1 rounded-lg border border-amber-300 font-medium inline-block">
                                📝 Nota: {item.notes}
                              </p>
                            )}
                          </div>

                          {/* Unit & Type (CH, PZ, KG, Mini / Normal) */}
                          <div className="col-span-1 flex lg:flex-col items-center lg:items-center justify-start lg:justify-center gap-1.5">
                            <span className="text-xs font-black bg-slate-200 text-slate-900 px-2.5 py-1 rounded-lg border border-slate-300">
                              {item.unit}
                            </span>
                            {item.itemType === 'Mini' ? (
                              <span className="bg-purple-100 text-purple-950 text-[10px] font-black px-2 py-0.5 rounded-md border border-purple-300">
                                Miniatura
                              </span>
                            ) : (
                              <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                Normal
                              </span>
                            )}
                          </div>

                          {/* Quantity (LARGE AND VISIBLE, NO PRICES) */}
                          <div className="col-span-2">
                            <div className="flex items-center gap-2">
                              <span className="text-3xl sm:text-4xl font-black text-[#D95D39] font-mono tracking-tight">
                                {item.quantity}
                              </span>
                              <span className="text-sm font-black text-slate-800 uppercase">
                                {item.unit}
                              </span>
                            </div>
                          </div>

                          {/* Check List button with smiling ear effect */}
                          <div className="col-span-2 w-full lg:w-auto flex items-center justify-end">
                            <button
                              id={`btn-check-${item.orderId}-${item.itemIdx}`}
                              type="button"
                              onClick={() => handleCheckItem(item.orderId, item.itemIdx, item.done)}
                              className={`w-full lg:w-auto px-5 py-3 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-md active:scale-95 ${
                                item.done
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-2 border-emerald-400'
                                  : 'bg-white hover:bg-amber-100 text-amber-950 border-2 border-amber-400 hover:border-amber-500'
                              }`}
                            >
                              {item.done ? (
                                <>
                                  <CheckCircle className="w-5 h-5 text-white" />
                                  <span>✓ ¡Horneado!</span>
                                  <span className="text-lg">🥐</span>
                                </>
                              ) : (
                                <>
                                  <div className="w-5 h-5 rounded-full border-2 border-amber-500 bg-amber-50 flex items-center justify-center" />
                                  <span>Marcar Listo</span>
                                  <span className="text-lg">🥐</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======================================================================= */}
          {/* MAIN VIEW B: TARJETAS POR PEDIDO (LARGE TOUCH CARDS)                   */}
          {/* ======================================================================= */}
          {bakerViewLayout === 'tarjetas_pedidos' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {relevantOrders.map(order => {
                const allDone = order.items.every(it => it.done);
                const isOsvaldo = order.assignedDriverId === 'osvaldo';
                const isSimon = order.assignedDriverId === 'simon';

                return (
                  <div
                    key={order.id}
                    className={`bg-white rounded-3xl p-5 sm:p-6 border-2 transition-all space-y-4 shadow-sm ${
                      allDone ? 'border-emerald-400 bg-emerald-50/30' : 'border-[#E5E1DA] hover:border-amber-400'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-black text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            {order.folio}
                          </span>
                          {isOsvaldo && (
                            <span className="bg-blue-100 text-blue-900 text-xs font-black px-2.5 py-0.5 rounded-full border border-blue-300">
                              🛵 Osvaldo
                            </span>
                          )}
                          {isSimon && (
                            <span className="bg-emerald-100 text-emerald-900 text-xs font-black px-2.5 py-0.5 rounded-full border border-emerald-300">
                              🛵 Simón
                            </span>
                          )}
                          {order.deliveryType === 'tienda' && (
                            order.origin === 'mostrador' || order.customerName.includes('Venta en Tienda') ? (
                              <span className="bg-emerald-100 text-emerald-900 text-xs font-black px-2.5 py-0.5 rounded-full border border-emerald-300">
                                🏪 Venta en Tienda
                              </span>
                            ) : (
                              <span className="bg-purple-100 text-purple-900 text-xs font-black px-2.5 py-0.5 rounded-full border border-purple-300">
                                🛍️ Pide y Recoge
                              </span>
                            )
                          )}
                        </div>
                        <h3 className="text-lg font-black text-slate-900 leading-tight">
                          {order.customerName}
                        </h3>
                        <p className="text-xs text-slate-600 flex items-center gap-1 font-bold">
                          <Clock className="w-4 h-4 text-[#D95D39]" />
                          <span>Entrega: <strong className="text-slate-900">{order.deliveryTime}</strong> ({order.deliveryDate})</span>
                        </p>
                      </div>

                      <button
                        onClick={() => handleCompleteAllItems(order)}
                        className={`px-4 py-2 rounded-2xl text-xs font-black transition-all cursor-pointer ${
                          allDone
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-slate-100 hover:bg-emerald-500 hover:text-white text-slate-700 border border-slate-300'
                        }`}
                      >
                        {allDone ? '✓ ¡Todo Horneado!' : 'Completar Todo'}
                      </button>
                    </div>

                    {/* Order Items Checkable List (NO PRICES) */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      {order.items.map((item, idx) => (
                        <div
                          key={idx}
                          onClick={() => handleCheckItem(order.id, idx, item.done)}
                          className={`p-3 rounded-2xl border-2 transition-all flex items-center justify-between cursor-pointer ${
                            item.done
                              ? 'bg-emerald-50 text-emerald-950 border-emerald-300 line-through opacity-80'
                              : 'bg-[#FAF8F6] text-slate-900 border-[#E5E1DA] hover:border-amber-400'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-sm border-2 ${
                              item.done ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-400 border-slate-300'
                            }`}>
                              {item.done ? '✓' : ''}
                            </div>
                            <div>
                              <strong className="text-sm font-black block">{item.name}</strong>
                              <span className="text-[11px] text-slate-600 flex items-center gap-1">
                                <span>{item.category}</span>
                                {item.itemType === 'Mini' && (
                                  <span className="bg-purple-100 text-purple-900 px-1.5 py-0.2 rounded text-[10px] font-black">Mini</span>
                                )}
                              </span>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="text-2xl sm:text-3xl font-black text-[#D95D39] font-mono">
                              {item.quantity} {item.unit || 'pz'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {order.notes && (
                      <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-xs text-amber-950 font-medium">
                        📝 <strong>Nota Especial:</strong> {order.notes}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: VISTA POR SEMANA (CONSOLIDADO DE PEDIDOS DE LUNES A DOMINGO)    */}
      {/* ========================================================================= */}
      {activeMainTab === 'semana' && (
        <div className="bg-white rounded-3xl p-5 md:p-6 shadow-sm border-2 border-[#E5E1DA] space-y-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-amber-100 text-amber-950 font-black text-xs px-3 py-1 rounded-xl border border-amber-300">
                  📅 Calendario Semanal de Encargos
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                  Resumen de Producción por Días
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 mt-1">
                Visualiza el volumen total de piezas programadas para cada día de la semana y planifica las materias primas y batidos.
              </p>
            </div>

            <button
              onClick={() => setActiveMainTab('pedidos')}
              className="px-4 py-2 bg-[#D95D39] text-white rounded-2xl text-xs font-black shadow-md flex items-center gap-1.5 hover:bg-[#b84524] transition-all cursor-pointer"
            >
              <span>Ir a Lista de Hoy ➔</span>
            </button>
          </div>

          {/* 7 Days of the Week Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
            {weeklyOrdersByDay.map(day => {
              const isToday = day.dateStr === todayStr;
              return (
                <div
                  key={day.key}
                  className={`p-4 rounded-2xl border-2 flex flex-col justify-between transition-all ${
                    isToday
                      ? 'bg-amber-50 border-amber-400 shadow-md ring-2 ring-amber-300'
                      : day.piecesCount > 0
                      ? 'bg-white border-slate-300 hover:border-amber-400'
                      : 'bg-slate-50 border-slate-200 opacity-70'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-black uppercase ${isToday ? 'text-amber-900' : 'text-slate-600'}`}>
                        {day.label}
                      </span>
                      {isToday && (
                        <span className="bg-[#D95D39] text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                          HOY
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">
                      {day.dateStr}
                    </div>
                  </div>

                  <div className="my-3 space-y-1">
                    <div className="text-2xl font-black text-slate-900 font-mono">
                      {day.piecesCount} <span className="text-xs text-slate-600 font-bold uppercase">pz</span>
                    </div>
                    <p className="text-[11px] text-slate-600 font-bold">
                      {day.ordersCount} {day.ordersCount === 1 ? 'pedido' : 'pedidos'} ({day.itemsCount} tipos)
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setFilterDate(day.dateStr === todayStr ? 'hoy' : day.dateStr === tomorrowStr ? 'manana' : 'todos');
                      setActiveMainTab('pedidos');
                    }}
                    className={`w-full py-2 rounded-xl text-xs font-black transition-all cursor-pointer text-center ${
                      isToday
                        ? 'bg-amber-500 text-slate-950 hover:bg-amber-600'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                    }`}
                  >
                    Ver Encargos
                  </button>
                </div>
              );
            })}
          </div>

          {/* Consolidated Orders Breakdown */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#D95D39]" />
              <span>Todos los Encargos Programados en el Sistema ({orders.length})</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {orders.map(order => (
                <div key={order.id} className="bg-[#FAF8F6] p-4 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-black text-slate-500">{order.folio}</span>
                    <span className="bg-amber-100 text-amber-900 text-xs font-black px-2 py-0.5 rounded-lg border border-amber-300">
                      📅 {order.deliveryDate} ({order.deliveryTime})
                    </span>
                  </div>
                  <strong className="text-sm font-black text-slate-900 block">{order.customerName}</strong>
                  <div className="text-xs text-slate-600 space-y-1">
                    {order.items.map((it, i) => (
                      <div key={i} className="flex justify-between">
                        <span>{it.name} ({it.unit || 'pz'})</span>
                        <strong className="text-[#D95D39] font-mono">{it.quantity}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 3: FORMATOS DE PRODUCCIÓN SEMANAL COMPLETA (HOJA MATRIZ)          */}
      {/* ========================================================================= */}
      {activeMainTab === 'formatos' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-5 shadow-xs border border-[#E5E1DA] space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-xl font-black text-slate-900">
                  Hoja Matriz Semanal de Panadería
                </h2>
                <p className="text-xs text-slate-600">
                  Formato tradicional de producción con casillas semanales (Lunes a Domingo) y teclado táctil.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-black shadow-xs flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir</span>
                </button>
              </div>
            </div>

            {/* Category Dropdown */}
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as CategoryFilter)}
                className="flex-1 bg-[#FAF8F6] border-2 border-[#D95D39] text-slate-900 font-extrabold text-sm rounded-2xl py-3 px-4"
              >
                <option value="TODOS">📄 TODAS LAS CATEGORÍAS ({sheetRows.length} variedades)</option>
                <option value="Salado">🥖 SALADO ({saladosRows.length} panes)</option>
                <option value="Pan Dulce / Bizcocho">🥐 PAN DULCE / BIZCOCHO ({dulceRows.length} panes)</option>
                <option value="Feite y Batidos">🥧 FEITE Y BATIDOS ({feiteRows.length} panes)</option>
              </select>

              <div className="relative sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar pan..."
                  value={searchBread}
                  onChange={(e) => setSearchBread(e.target.value)}
                  className="w-full bg-[#FAF8F6] border border-[#E5E1DA] rounded-2xl py-3 pl-10 pr-4 text-sm font-bold text-slate-900"
                />
              </div>
            </div>

            {/* Table Matrix */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900 text-white font-black uppercase text-[11px]">
                  <tr>
                    <th className="p-3 border-r border-slate-700">Nombre del Pan</th>
                    <th className="p-3 border-r border-slate-700">Categoría</th>
                    <th className="p-3 text-center border-r border-slate-700">Lun</th>
                    <th className="p-3 text-center border-r border-slate-700">Mar</th>
                    <th className="p-3 text-center border-r border-slate-700">Mié</th>
                    <th className="p-3 text-center border-r border-slate-700">Jue</th>
                    <th className="p-3 text-center border-r border-slate-700">Vie</th>
                    <th className="p-3 text-center border-r border-slate-700">Sáb</th>
                    <th className="p-3 text-center">Dom</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sheetRows
                    .filter(r => (selectedCategory === 'TODOS' || r.category === selectedCategory) && (!searchBread || r.breadName.toLowerCase().includes(searchBread.toLowerCase())))
                    .map((row, idx) => {
                      const days: DayKey[] = ['lun', 'mar', 'mier', 'juev', 'vier', 'sab', 'dom'];
                      return (
                        <tr key={row.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="p-3 font-black text-slate-900 border-r border-slate-200">
                            {row.breadName}
                          </td>
                          <td className="p-3 text-slate-600 border-r border-slate-200 text-[11px]">
                            {row.category}
                          </td>
                          {days.map(d => (
                            <td 
                              key={d}
                              onClick={() => handleOpenKeypad(row, d)}
                              className={`p-2.5 text-center font-bold border-r border-slate-200 cursor-pointer hover:bg-amber-100 transition-colors ${
                                currentDayKey === d ? 'bg-amber-50 font-black' : ''
                              }`}
                            >
                              {row[d] || '-'}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SMILING PAN DE OREJITA MODAL / TOAST CELEBRATION */}
      {smilingOrejitaState && (
        <SmilingPanDeOrejita
          show={smilingOrejitaState.show}
          breadName={smilingOrejitaState.breadName}
          quantity={smilingOrejitaState.quantity}
          unit={smilingOrejitaState.unit}
          itemType={smilingOrejitaState.itemType}
          progressPercentage={progressPercentage}
          completedPieces={completedBreadPieces}
          totalPieces={totalBreadPieces}
          onClose={() => setSmilingOrejitaState(null)}
        />
      )}

      {/* Virtual Keypad Modal for Format Sheet */}
      <VirtualBakerKeypad
        isOpen={keypadModal.isOpen}
        onClose={() => setKeypadModal(prev => ({ ...prev, isOpen: false }))}
        breadName={keypadModal.breadName}
        category={keypadModal.category}
        dayName={DAY_LABELS[keypadModal.dayKey]}
        currentValue={keypadModal.currentValue}
        orderDemandQuantity={keypadModal.orderDemandQuantity}
        orderDemandClients={keypadModal.orderDemandClients}
        onSave={handleSaveFromKeypad}
      />
    </div>
  );
};
