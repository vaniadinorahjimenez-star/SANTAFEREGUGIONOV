import React, { useState, useMemo, useRef, useEffect } from 'react';
import { VipCustomer, VipOrder, VipBreadItem, VipOrderItem, Settings } from '../../types';
import {
  Crown,
  Plus,
  Upload,
  CheckCircle2,
  Clock,
  FileText,
  Image as ImageIcon,
  Eye,
  Trash2,
  Edit3,
  Calendar,
  Download,
  X,
  Check,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Printer,
  Copy,
  MessageCircle,
  BarChart2,
  ListOrdered,
  PackagePlus,
  AlertCircle
} from 'lucide-react';
import {
  getTodayString,
  getYesterdayString,
  getTomorrowString,
  shiftLocalDate,
  formatLocalDate,
  resolveCanonicalVipCustomerId
} from '../../utils/storage';
import { playBeep, playCashSound } from '../../utils/audio';
import { syncWithCloud, fetchAndMergeCloud } from '../../services/cloudSyncService';

interface VipCustomersManagerProps {
  vipCustomers: VipCustomer[];
  vipOrders: VipOrder[];
  settings?: Settings;
  onSaveCustomer: (customer: VipCustomer) => void;
  onDeleteCustomer: (id: string) => void;
  onSaveOrder: (order: VipOrder) => void;
  onDeleteOrder: (id: string) => void;
  onManualSyncCloud?: () => Promise<void>;
  isSyncingCloud?: boolean;
}

type PeriodMode = 'dia' | 'semana' | 'mes' | 'mes_pasado' | 'todo';
type ViewTab = 'captura' | 'totales';
type PaymentFilter = 'todos' | 'pendiente' | 'pagado' | 'sin_comprobante';

const CLIENT_DISPLAY_BADGE_COLORS = [
  'bg-amber-100 text-amber-900 border-amber-200',
  'bg-blue-100 text-blue-900 border-blue-200',
  'bg-emerald-100 text-emerald-900 border-emerald-200',
  'bg-indigo-100 text-indigo-900 border-indigo-200',
  'bg-teal-100 text-teal-900 border-teal-200',
  'bg-rose-100 text-rose-900 border-rose-200'
];

function getWeekBounds(refDateStr: string): { start: string; end: string; label: string } {
  const clean = refDateStr.slice(0, 10);
  const parts = clean.split('-').map(Number);
  const d = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1, 12, 0, 0);
  const dayOfWeek = d.getDay(); // 0 = Sun, 1 = Mon...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diffToMonday);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const start = formatLocalDate(mon);
  const end = formatLocalDate(sun);
  const fmt = (dateObj: Date) =>
    dateObj.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
  return { start, end, label: `${fmt(mon)} – ${fmt(sun)}` };
}

function getMonthBounds(refDateStr: string, monthOffset = 0): { start: string; end: string; label: string } {
  const clean = refDateStr.slice(0, 10);
  const parts = clean.split('-').map(Number);
  const first = new Date(parts[0], (parts[1] || 1) - 1 + monthOffset, 1, 12, 0, 0);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12, 0, 0);
  const label = first.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  return {
    start: formatLocalDate(first),
    end: formatLocalDate(last),
    label: label.charAt(0).toUpperCase() + label.slice(1)
  };
}

function formatMoney(n: number): string {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatShortDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  const dateObj = new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
  return dateObj.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' });
}

function formatTicketDayLabel(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  const dateObj = new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
  const raw = dateObj.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' });
  return raw.charAt(0).toUpperCase() + raw.slice(1).replace(/\.$/, '');
}

function isXmlDataOrName(url?: string, fileName?: string): boolean {
  const lowerUrl = (url || '').toLowerCase();
  const lowerName = (fileName || '').toLowerCase();
  return (
    lowerUrl.startsWith('data:text/xml') ||
    lowerUrl.startsWith('data:application/xml') ||
    lowerName.endsWith('.xml')
  );
}

function getOrderInvoicePdf(o: VipOrder): { url: string; fileName?: string } {
  if (o.invoicePdfUrl) {
    return { url: o.invoicePdfUrl, fileName: o.invoicePdfFileName };
  }
  if (o.invoiceFileUrl && !isXmlDataOrName(o.invoiceFileUrl, o.invoiceFileName)) {
    return { url: o.invoiceFileUrl, fileName: o.invoiceFileName };
  }
  return { url: '', fileName: undefined };
}

function getOrderInvoiceXml(o: VipOrder): { url: string; fileName?: string } {
  if (o.invoiceXmlUrl) {
    return { url: o.invoiceXmlUrl, fileName: o.invoiceXmlFileName };
  }
  if (o.invoiceFileUrl && isXmlDataOrName(o.invoiceFileUrl, o.invoiceFileName)) {
    return { url: o.invoiceFileUrl, fileName: o.invoiceFileName };
  }
  return { url: '', fileName: undefined };
}

function decodeXmlDataUrlText(dataUrl?: string): string {
  if (!dataUrl) return '';
  try {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) return '';
    const header = dataUrl.slice(0, commaIdx);
    const body = dataUrl.slice(commaIdx + 1);
    if (header.includes(';base64')) {
      const binary = atob(body);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new TextDecoder('utf-8').decode(bytes);
    }
    return decodeURIComponent(body);
  } catch {
    return '';
  }
}

function parseCfdiSummaryFromDataUrl(dataUrl?: string): { folio?: string; total?: string; uuid?: string } {
  const xmlText = decodeXmlDataUrlText(dataUrl);
  if (!xmlText) return {};
  const serieMatch = xmlText.match(/\bSerie="([^"]+)"/i);
  const folioMatch = xmlText.match(/\bFolio="([^"]+)"/i);
  const totalMatch = xmlText.match(/\bTotal="([^"]+)"/i);
  const uuidMatch = xmlText.match(/\bUUID="([A-Za-z0-9-]+)"/i);
  const folioCombined = [serieMatch?.[1], folioMatch?.[1]].filter(Boolean).join('-');
  return {
    folio: folioCombined || undefined,
    total: totalMatch?.[1] || undefined,
    uuid: uuidMatch?.[1] || undefined
  };
}

export const VipCustomersManager: React.FC<VipCustomersManagerProps> = ({
  vipCustomers,
  vipOrders,
  settings,
  onSaveCustomer,
  onDeleteCustomer,
  onSaveOrder,
  onDeleteOrder,
  onManualSyncCloud,
  isSyncingCloud = false
}) => {
  const todayStr = getTodayString();
  const yesterdayStr = getYesterdayString();
  const tomorrowStr = getTomorrowString();

  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [viewTab, setViewTab] = useState<ViewTab>('captura');

  // Filtros UI
  const [leftFilter, setLeftFilter] = useState<PaymentFilter>('todos');
  const [accumPeriod, setAccumPeriod] = useState<PeriodMode>('semana');
  const [totalsPeriod, setTotalsPeriod] = useState<PeriodMode>('mes');
  const [totalsClientFilter, setTotalsClientFilter] = useState<string>('todos');
  const [focusedClientId, setFocusedClientId] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Control de expansión y categoría por cliente (útil para Star Médica con 43 productos)
  const [expandedCatalogs, setExpandedCatalogs] = useState<Record<string, boolean>>({});
  const [clientCategoryFilter, setClientCategoryFilter] = useState<Record<string, string>>({});
  const [clientProductSearch, setClientProductSearch] = useState<Record<string, string>>({});

  // Confirmaciones rápidas sin window.alert/window.confirm
  const [confirmClearOrderId, setConfirmClearOrderId] = useState<string | null>(null);
  const [confirmDeleteClientId, setConfirmDeleteClientId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone?: 'ok' | 'warn' } | null>(null);
  const [localSyncing, setLocalSyncing] = useState<boolean>(false);

  // Modales
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState<boolean>(false);
  const [customerToEdit, setCustomerToEdit] = useState<VipCustomer | null>(null);
  const [custName, setCustName] = useState<string>('');
  const [custPhone, setCustPhone] = useState<string>('');
  const [custRfc, setCustRfc] = useState<string>('');
  const [custBusinessName, setCustBusinessName] = useState<string>('');
  const [custRequiresInvoice, setCustRequiresInvoice] = useState<boolean>(false);
  const [custNotes, setCustNotes] = useState<string>('');
  const [custItems, setCustItems] = useState<VipBreadItem[]>([]);
  const [newProdName, setNewProdName] = useState<string>('');
  const [newProdPrice, setNewProdPrice] = useState<string>('');
  const [newProdCategory, setNewProdCategory] = useState<string>('');

  // Modal rápido "+ Producto" en tarjeta de cliente
  const [quickAddProductClient, setQuickAddProductClient] = useState<VipCustomer | null>(null);
  const [quickProdName, setQuickProdName] = useState<string>('');
  const [quickProdPrice, setQuickProdPrice] = useState<string>('');
  const [quickProdCategory, setQuickProdCategory] = useState<string>('');

  // Modal unificado Comprobante (Imagen) + Factura (Check + PDF + XML) + Lightbox Visor
  const [docModalOrder, setDocModalOrder] = useState<VipOrder | null>(null);
  const [draftRequiresInvoice, setDraftRequiresInvoice] = useState<boolean>(false);
  const [draftReceiptUrl, setDraftReceiptUrl] = useState<string>('');
  const [draftReceiptFileName, setDraftReceiptFileName] = useState<string>('');
  const [draftInvoiceFolio, setDraftInvoiceFolio] = useState<string>('');
  const [draftInvoicePdfUrl, setDraftInvoicePdfUrl] = useState<string>('');
  const [draftInvoicePdfName, setDraftInvoicePdfName] = useState<string>('');
  const [draftInvoiceXmlUrl, setDraftInvoiceXmlUrl] = useState<string>('');
  const [draftInvoiceXmlName, setDraftInvoiceXmlName] = useState<string>('');
  const [docModalError, setDocModalError] = useState<string>('');
  const [isProcessingDocMedia, setIsProcessingDocMedia] = useState<boolean>(false);

  const docReceiptInputRef = useRef<HTMLInputElement | null>(null);
  const docPdfInputRef = useRef<HTMLInputElement | null>(null);
  const docXmlInputRef = useRef<HTMLInputElement | null>(null);

  const [viewingDoc, setViewingDoc] = useState<{
    title: string;
    url: string;
    fileName?: string;
    kind: 'image' | 'pdf' | 'xml';
  } | null>(null);

  // Modal Ticket Imprimible / WhatsApp
  const [ticketModalOrder, setTicketModalOrder] = useState<VipOrder | null>(null);
  const [periodTicketModal, setPeriodTicketModal] = useState<{
    client: VipCustomer;
    orders: VipOrder[];
    periodLabel: string;
    total: number;
    paid: number;
    pending: number;
    pieces: number;
  } | null>(null);

  // Ref para centrar el día seleccionado en la barra de días del mes
  const dayStripRef = useRef<HTMLDivElement | null>(null);

  const showToast = (text: string, tone: 'ok' | 'warn' = 'ok') => {
    setToast({ text, tone });
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // Ordenar y homologar clientes VIP (sin duplicados por ID canónico)
  const orderedClients = useMemo(() => {
    const map = new Map<string, VipCustomer>();
    for (const c of vipCustomers) {
      if (!c?.id) continue;
      const cid = resolveCanonicalVipCustomerId(c);
      if (!map.has(cid)) {
        map.set(cid, { ...c, id: cid });
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || (a.name || '').localeCompare(b.name || '')
    );
  }, [vipCustomers]);

  // Obtener items de catálogo de un cliente (fallback a defaultBreadType si fue creado sin items)
  const getClientItems = (c: VipCustomer): VipBreadItem[] => {
    if (Array.isArray(c.items) && c.items.length > 0) return c.items;
    return [
      {
        breadName: c.defaultBreadType || 'Pedido Especial',
        unitPrice: c.defaultAmount || 0,
        category: 'General'
      }
    ];
  };

  // Pedidos del día seleccionado
  const dateOrders = useMemo(() => {
    return vipOrders.filter(o => o.date === selectedDate);
  }, [vipOrders, selectedDate]);

  const dateOrderByCustomerId = useMemo(() => {
    const map = new Map<string, VipOrder>();
    for (const o of dateOrders) {
      map.set(o.customerId, o);
    }
    return map;
  }, [dateOrders]);

  // Helper para obtener mapa de cantidades activas de un cliente en selectedDate
  const getClientDayQuantities = (client: VipCustomer): Record<string, number> => {
    const order = dateOrderByCustomerId.get(client.id);
    if (!order) return {};
    if (order.quantities && typeof order.quantities === 'object') return order.quantities;
    if (Array.isArray(order.items)) {
      const q: Record<string, number> = {};
      for (const it of order.items) {
        if (it.quantity > 0) q[it.breadName] = it.quantity;
      }
      return q;
    }
    return {};
  };

  // Calcular totales de un pedido
  const getOrderPieces = (o: VipOrder): number => {
    if (typeof o.totalPieces === 'number') return o.totalPieces;
    if (Array.isArray(o.items) && o.items.length > 0) {
      return o.items.reduce((s, it) => s + (it.quantity || 0), 0);
    }
    if (o.quantities) {
      return Object.values(o.quantities).reduce((s, q) => s + (Number(q) || 0), 0);
    }
    return o.totalAmount > 0 ? 1 : 0;
  };

  const isOrderPaid = (o: VipOrder): boolean => o.paymentStatus === 'pagado';

  // KPIs del día seleccionado
  const dayStats = useMemo(() => {
    let totalAmount = 0;
    let totalPieces = 0;
    let paidAmount = 0;
    let paidCount = 0;
    let pendingAmount = 0;
    let pendingCount = 0;
    let receiptsCount = 0;

    for (const o of dateOrders) {
      totalAmount += o.totalAmount || 0;
      totalPieces += getOrderPieces(o);
      if (o.transferReceiptUrl) receiptsCount++;
      if (isOrderPaid(o)) {
        paidAmount += o.totalAmount || 0;
        paidCount++;
      } else {
        pendingAmount += o.totalAmount || 0;
        pendingCount++;
      }
    }

    return {
      totalAmount,
      totalPieces,
      ordersCount: dateOrders.length,
      paidAmount,
      paidCount,
      pendingAmount,
      pendingCount,
      receiptsCount
    };
  }, [dateOrders]);

  // Pendiente global histórico (todos los días)
  const globalPendingStats = useMemo(() => {
    let amount = 0;
    let count = 0;
    for (const o of vipOrders) {
      if (!isOrderPaid(o) && (o.totalAmount || 0) > 0) {
        amount += o.totalAmount || 0;
        count++;
      }
    }
    return { amount, count };
  }, [vipOrders]);

  // Rangos de fechas para Día / Semana / Mes
  const weekBounds = useMemo(() => getWeekBounds(selectedDate), [selectedDate]);
  const monthBounds = useMemo(() => getMonthBounds(selectedDate, 0), [selectedDate]);
  const prevMonthBounds = useMemo(() => getMonthBounds(selectedDate, -1), [selectedDate]);

  const filterOrdersByPeriod = (period: PeriodMode): VipOrder[] => {
    if (period === 'todo') return vipOrders;
    if (period === 'dia') return vipOrders.filter(o => o.date === selectedDate);
    if (period === 'semana') {
      return vipOrders.filter(o => o.date >= weekBounds.start && o.date <= weekBounds.end);
    }
    if (period === 'mes') {
      return vipOrders.filter(o => o.date >= monthBounds.start && o.date <= monthBounds.end);
    }
    return vipOrders.filter(o => o.date >= prevMonthBounds.start && o.date <= prevMonthBounds.end);
  };

  // Totales de Semana & Mes rápidos para KPI superior
  const quickWeekTotal = useMemo(() => {
    return vipOrders
      .filter(o => o.date >= weekBounds.start && o.date <= weekBounds.end)
      .reduce((s, o) => s + (o.totalAmount || 0), 0);
  }, [vipOrders, weekBounds]);

  const quickMonthTotal = useMemo(() => {
    return vipOrders
      .filter(o => o.date >= monthBounds.start && o.date <= monthBounds.end)
      .reduce((s, o) => s + (o.totalAmount || 0), 0);
  }, [vipOrders, monthBounds]);

  // Días del mes activo (1..30/31) para la barra rápida debajo de la búsqueda
  const monthDaysStrip = useMemo(() => {
    const clean = selectedDate.slice(0, 10);
    const [yearStr, monthStr] = clean.split('-');
    const year = parseInt(yearStr, 10) || new Date().getFullYear();
    const monthIdx = (parseInt(monthStr, 10) || 1) - 1;
    const daysInMonth = new Date(year, monthIdx + 1, 0, 12, 0, 0).getDate();
    const monthTitle = new Date(year, monthIdx, 1, 12, 0, 0).toLocaleDateString('es-MX', {
      month: 'long',
      year: 'numeric'
    });

    const monthPrefix = `${year}-${String(monthIdx + 1).padStart(2, '0')}-`;
    const dayStatusMap = new Map<string, { hasOrders: boolean; hasPending: boolean }>();
    for (const o of vipOrders) {
      if (!o.date || !o.date.startsWith(monthPrefix)) continue;
      const prev = dayStatusMap.get(o.date) || { hasOrders: false, hasPending: false };
      prev.hasOrders = true;
      if (!isOrderPaid(o) && (o.totalAmount || 0) > 0) {
        prev.hasPending = true;
      }
      dayStatusMap.set(o.date, prev);
    }

    const weekdayLetters = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
    const days: Array<{
      dayNum: number;
      dateStr: string;
      weekday: string;
      hasOrders: boolean;
      hasPending: boolean;
    }> = [];

    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const dateStr = `${monthPrefix}${String(dayNum).padStart(2, '0')}`;
      const dObj = new Date(year, monthIdx, dayNum, 12, 0, 0);
      const status = dayStatusMap.get(dateStr);
      days.push({
        dayNum,
        dateStr,
        weekday: weekdayLetters[dObj.getDay()],
        hasOrders: Boolean(status?.hasOrders),
        hasPending: Boolean(status?.hasPending)
      });
    }

    return {
      monthTitle: monthTitle.charAt(0).toUpperCase() + monthTitle.slice(1),
      days
    };
  }, [selectedDate, vipOrders]);

  const handleShiftMonth = (deltaMonths: number) => {
    const clean = selectedDate.slice(0, 10);
    const [y, m, d] = clean.split('-').map(Number);
    const target = new Date(y, (m || 1) - 1 + deltaMonths, 1, 12, 0, 0);
    const maxDay = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12, 0, 0).getDate();
    target.setDate(Math.min(d || 1, maxDay));
    setSelectedDate(formatLocalDate(target));
    playBeep(650, 'sine', 0.02);
  };

  useEffect(() => {
    const container = dayStripRef.current;
    if (!container) return;
    const activeBtn = container.querySelector<HTMLButtonElement>('[data-selected-day="true"]');
    if (activeBtn) {
      const targetLeft = activeBtn.offsetLeft - container.clientWidth / 2 + activeBtn.clientWidth / 2;
      container.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
    }
  }, [selectedDate, viewTab]);

  // Pedidos del día filtrados en panel izquierdo
  const filteredDayOrders = useMemo(() => {
    return dateOrders
      .filter(o => {
        if (leftFilter === 'pendiente' && isOrderPaid(o)) return false;
        if (leftFilter === 'pagado' && !isOrderPaid(o)) return false;
        if (leftFilter === 'sin_comprobante' && o.transferReceiptUrl) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchName = (o.customerName || '').toLowerCase().includes(q);
          const matchBread = (o.breadType || '').toLowerCase().includes(q);
          if (!matchName && !matchBread) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const custA = orderedClients.findIndex(c => c.id === a.customerId);
        const custB = orderedClients.findIndex(c => c.id === b.customerId);
        return (custA === -1 ? 999 : custA) - (custB === -1 ? 999 : custB);
      });
  }, [dateOrders, leftFilter, searchQuery, orderedClients]);

  // Acumulado por cliente para el panel izquierdo (Día / Semana / Mes / Todo)
  const accumulatedByClient = useMemo(() => {
    const periodOrders = filterOrdersByPeriod(accumPeriod);
    return orderedClients.map((client, idx) => {
      const clientOrders = periodOrders.filter(o => o.customerId === client.id);
      const total = clientOrders.reduce((s, o) => s + (o.totalAmount || 0), 0);
      const paid = clientOrders.filter(isOrderPaid).reduce((s, o) => s + (o.totalAmount || 0), 0);
      const pending = Math.max(0, total - paid);
      const pieces = clientOrders.reduce((s, o) => s + getOrderPieces(o), 0);
      const receipts = clientOrders.filter(o => Boolean(o.transferReceiptUrl)).length;
      const dayOrder = dateOrderByCustomerId.get(client.id);
      return {
        client,
        colorIdx: idx % CLIENT_DISPLAY_BADGE_COLORS.length,
        ordersCount: clientOrders.length,
        total,
        paid,
        pending,
        pieces,
        receipts,
        dayTotal: dayOrder?.totalAmount || 0,
        dayPaid: dayOrder ? isOrderPaid(dayOrder) : false
      };
    });
  }, [orderedClients, accumPeriod, vipOrders, selectedDate, weekBounds, monthBounds, dateOrderByCustomerId]);

  const maxAccumTotal = useMemo(() => {
    return Math.max(1, ...accumulatedByClient.map(x => x.total));
  }, [accumulatedByClient]);

  // Tab Totales (Día / Semana / Mes / Mes pasado / Todo)
  const totalsTabOrders = useMemo(() => filterOrdersByPeriod(totalsPeriod), [totalsPeriod, vipOrders, selectedDate, weekBounds, monthBounds, prevMonthBounds]);

  const totalsTabSummary = useMemo(() => {
    let total = 0;
    let paid = 0;
    let pending = 0;
    let pieces = 0;
    let receipts = 0;

    for (const o of totalsTabOrders) {
      total += o.totalAmount || 0;
      pieces += getOrderPieces(o);
      if (o.transferReceiptUrl) receipts++;
      if (isOrderPaid(o)) paid += o.totalAmount || 0;
      else pending += o.totalAmount || 0;
    }
    return { total, paid, pending, pieces, receipts, ordersCount: totalsTabOrders.length };
  }, [totalsTabOrders]);

  const totalsTabByClient = useMemo(() => {
    return orderedClients.map((client) => {
      const list = totalsTabOrders.filter(o => o.customerId === client.id);
      const total = list.reduce((s, o) => s + (o.totalAmount || 0), 0);
      const paid = list.filter(isOrderPaid).reduce((s, o) => s + (o.totalAmount || 0), 0);
      const pending = Math.max(0, total - paid);
      const pieces = list.reduce((s, o) => s + getOrderPieces(o), 0);
      const receipts = list.filter(o => Boolean(o.transferReceiptUrl)).length;
      return {
        client,
        orders: list,
        ordersCount: list.length,
        pieces,
        total,
        paid,
        pending,
        receipts
      };
    });
  }, [orderedClients, totalsTabOrders]);

  // Clientes filtrados en panel derecho de captura
  const captureClients = useMemo(() => {
    return orderedClients.filter(c => {
      if (focusedClientId !== 'todos' && c.id !== focusedClientId) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = c.name.toLowerCase().includes(q);
        const matchBread = getClientItems(c).some(it => it.breadName.toLowerCase().includes(q));
        if (!matchName && !matchBread) return false;
      }
      return true;
    });
  }, [orderedClients, focusedClientId, searchQuery]);

  // =========================================================================
  // HANDLER PRINCIPAL: ACTUALIZAR CANTIDADES ESTILO REPARTOS EN TIEMPO REAL
  // =========================================================================
  const handleUpdateProductQty = (client: VipCustomer, breadName: string, nextQtyRaw: number) => {
    const nextQty = Math.max(0, Math.round(nextQtyRaw));
    const catalog = getClientItems(client);
    const existingOrder = dateOrderByCustomerId.get(client.id);
    const currentQuantities = getClientDayQuantities(client);

    const updatedQuantities: Record<string, number> = { ...currentQuantities };
    if (nextQty > 0) {
      updatedQuantities[breadName] = nextQty;
    } else {
      delete updatedQuantities[breadName];
    }

    const lineItems: VipOrderItem[] = [];
    for (const item of catalog) {
      const q = Number(updatedQuantities[item.breadName] || 0);
      if (q > 0) {
        const lineTotal = Math.round(q * item.unitPrice * 100) / 100;
        lineItems.push({
          breadName: item.breadName,
          quantity: q,
          unitPrice: item.unitPrice,
          total: lineTotal
        });
      }
    }

    // Preservar también si existía algún producto antiguo que ya no esté en catálogo
    if (existingOrder?.items) {
      for (const oldIt of existingOrder.items) {
        if (!catalog.some(c => c.breadName === oldIt.breadName)) {
          const q = Number(updatedQuantities[oldIt.breadName] || 0);
          if (q > 0) {
            const lineTotal = Math.round(q * oldIt.unitPrice * 100) / 100;
            lineItems.push({
              breadName: oldIt.breadName,
              quantity: q,
              unitPrice: oldIt.unitPrice,
              total: lineTotal
            });
          }
        }
      }
    }

    const totalPieces = lineItems.reduce((s, it) => s + it.quantity, 0);
    const totalAmount = Math.round(lineItems.reduce((s, it) => s + it.total, 0) * 100) / 100;

    if (totalPieces === 0) {
      if (existingOrder) {
        onDeleteOrder(existingOrder.id);
      }
      return;
    }

    const summaryStr = lineItems.map(it => `${it.quantity} ${it.breadName}`).join(' · ');
    const orderId = existingOrder?.id || `vipo_${selectedDate}_${client.id}`;
    const nowIso = new Date().toISOString();

    const updatedOrder: VipOrder = {
      id: orderId,
      folio: existingOrder?.folio || `VIP-${String(vipOrders.length + 1).padStart(3, '0')}`,
      date: selectedDate,
      customerId: client.id,
      customerName: client.name,
      customerPhone: client.phone,
      breadType: summaryStr,
      quantities: updatedQuantities,
      items: lineItems,
      totalPieces,
      totalAmount,
      requiresInvoice: existingOrder ? Boolean(existingOrder.requiresInvoice) : Boolean(client.requiresInvoice),
      transferReceiptUrl: existingOrder?.transferReceiptUrl,
      transferReceiptFileName: existingOrder?.transferReceiptFileName,
      transferReceiptUploadedAt: existingOrder?.transferReceiptUploadedAt,
      invoiceFolio: existingOrder?.invoiceFolio,
      invoiceFileUrl: existingOrder?.invoiceFileUrl,
      invoiceFileName: existingOrder?.invoiceFileName,
      invoiceUploadedAt: existingOrder?.invoiceUploadedAt,
      invoicePdfUrl: existingOrder?.invoicePdfUrl,
      invoicePdfFileName: existingOrder?.invoicePdfFileName,
      invoicePdfUploadedAt: existingOrder?.invoicePdfUploadedAt,
      invoiceXmlUrl: existingOrder?.invoiceXmlUrl,
      invoiceXmlFileName: existingOrder?.invoiceXmlFileName,
      invoiceXmlUploadedAt: existingOrder?.invoiceXmlUploadedAt,
      isAudited: existingOrder?.isAudited ?? false,
      auditedAt: existingOrder?.auditedAt,
      paymentStatus: existingOrder?.paymentStatus || 'pendiente',
      paymentMethod: existingOrder?.paymentMethod,
      paidAt: existingOrder?.paidAt,
      notes: existingOrder?.notes,
      createdAt: existingOrder?.createdAt || nowIso,
      updatedAt: nowIso
    };

    onSaveOrder(updatedOrder);
  };

  // Alternar estado de pago Pagado <-> Pendiente (1 tap)
  const handleToggleOrderPaid = (order: VipOrder) => {
    const nextPaid = !isOrderPaid(order);
    const nowIso = new Date().toISOString();
    const updated: VipOrder = {
      ...order,
      paymentStatus: nextPaid ? 'pagado' : 'pendiente',
      isAudited: nextPaid,
      auditedAt: nextPaid ? nowIso : undefined,
      paidAt: nextPaid ? nowIso : undefined,
      paymentMethod: nextPaid ? (order.paymentMethod || 'transferencia') : order.paymentMethod,
      updatedAt: nowIso
    };
    onSaveOrder(updated);
    if (nextPaid) {
      playCashSound();
      showToast(`${order.customerName} marcado como PAGADO ($${formatMoney(order.totalAmount)})`);
    } else {
      playBeep(480, 'sine', 0.05);
      showToast(`${order.customerName} marcado como POR PAGAR`, 'warn');
    }
  };

  // Marcar todos los pedidos pendientes de un cliente como pagados (desde Tab Totales)
  const handleMarkAllClientOrdersPaid = (orders: VipOrder[], clientName: string) => {
    const unpaid = orders.filter(o => !isOrderPaid(o));
    if (unpaid.length === 0) return;
    const nowIso = new Date().toISOString();
    unpaid.forEach(o => {
      onSaveOrder({
        ...o,
        paymentStatus: 'pagado',
        isAudited: true,
        auditedAt: nowIso,
        paidAt: nowIso,
        paymentMethod: o.paymentMethod || 'transferencia',
        updatedAt: nowIso
      });
    });
    playCashSound();
    showToast(`${unpaid.length} pedido(s) de ${clientName} marcados como pagados`);
  };

  // =========================================================================
  // VENTANA DE COMPROBANTE (SOLO IMAGEN) + FACTURA (CHECK + PDF Y XML)
  // =========================================================================
  const processReceiptImageFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 1200;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.78));
          } else {
            resolve(e.target?.result as string);
          }
        };
        img.onerror = () => reject(new Error('invalid_image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) || '');
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  const handleOpenDocsModal = (order: VipOrder) => {
    const existingPdf = getOrderInvoicePdf(order);
    const existingXml = getOrderInvoiceXml(order);
    setDocModalOrder(order);
    setDraftRequiresInvoice(Boolean(order.requiresInvoice));
    setDraftReceiptUrl(order.transferReceiptUrl || '');
    setDraftReceiptFileName(order.transferReceiptFileName || '');
    setDraftInvoiceFolio(order.invoiceFolio || '');
    setDraftInvoicePdfUrl(existingPdf.url || '');
    setDraftInvoicePdfName(existingPdf.fileName || '');
    setDraftInvoiceXmlUrl(existingXml.url || '');
    setDraftInvoiceXmlName(existingXml.fileName || '');
    setDocModalError('');
    playBeep(620, 'sine', 0.03);
  };

  const handleDocReceiptImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;

    const isImgMime = file.type.startsWith('image/');
    const isImgExt = /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(file.name);
    if (!isImgMime && !isImgExt) {
      setDocModalError('El comprobante debe ser una imagen (JPG, PNG, WEBP). No se permiten PDF u otros formatos aquí.');
      return;
    }

    setDocModalError('');
    setIsProcessingDocMedia(true);
    try {
      const compressedBase64 = await processReceiptImageFile(file);
      if (compressedBase64.length > 850000) {
        setDocModalError('La imagen es demasiado pesada. Intenta con una captura o foto más ligera.');
        return;
      }
      setDraftReceiptUrl(compressedBase64);
      setDraftReceiptFileName(file.name);
      playBeep(740, 'sine', 0.04);
    } catch {
      setDocModalError('No se pudo leer la imagen del comprobante. Verifica que sea un archivo de imagen válido.');
    } finally {
      setIsProcessingDocMedia(false);
    }
  };

  const handleDocPdfFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;

    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      setDocModalError('En el apartado PDF solo se permiten archivos con extensión .pdf.');
      return;
    }
    if (file.size > 900 * 1024) {
      setDocModalError('El archivo PDF supera 900 KB. Usa un PDF más ligero para sincronizar sin problemas.');
      return;
    }

    setDocModalError('');
    setIsProcessingDocMedia(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setDraftInvoicePdfUrl(dataUrl);
      setDraftInvoicePdfName(file.name);
      setDraftRequiresInvoice(true);
      playBeep(740, 'sine', 0.04);
    } catch {
      setDocModalError('No se pudo leer el archivo PDF.');
    } finally {
      setIsProcessingDocMedia(false);
    }
  };

  const handleDocXmlFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;

    const isXml =
      file.type === 'text/xml' ||
      file.type === 'application/xml' ||
      /\.xml$/i.test(file.name);
    if (!isXml) {
      setDocModalError('En el apartado XML solo se permiten archivos con extensión .xml.');
      return;
    }
    if (file.size > 650 * 1024) {
      setDocModalError('El archivo XML supera 650 KB.');
      return;
    }

    setDocModalError('');
    setIsProcessingDocMedia(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setDraftInvoiceXmlUrl(dataUrl);
      setDraftInvoiceXmlName(file.name);
      setDraftRequiresInvoice(true);
      if (!draftInvoiceFolio.trim()) {
        const parsed = parseCfdiSummaryFromDataUrl(dataUrl);
        if (parsed.folio) {
          setDraftInvoiceFolio(parsed.folio);
        }
      }
      playBeep(740, 'sine', 0.04);
    } catch {
      setDocModalError('No se pudo leer el archivo XML.');
    } finally {
      setIsProcessingDocMedia(false);
    }
  };

  const handleSaveDocsModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!docModalOrder) return;

    const nowIso = new Date().toISOString();
    const folioClean = draftInvoiceFolio.trim();
    const hasPdf = Boolean(draftInvoicePdfUrl);
    const hasXml = Boolean(draftInvoiceXmlUrl);
    const hasReceipt = Boolean(draftReceiptUrl);

    const updatedOrder: VipOrder = {
      ...docModalOrder,
      requiresInvoice: draftRequiresInvoice,
      transferReceiptUrl: draftReceiptUrl || '',
      transferReceiptFileName: draftReceiptUrl ? (draftReceiptFileName || 'comprobante.jpg') : '',
      transferReceiptUploadedAt: draftReceiptUrl
        ? (docModalOrder.transferReceiptUrl === draftReceiptUrl && docModalOrder.transferReceiptUploadedAt
            ? docModalOrder.transferReceiptUploadedAt
            : nowIso)
        : '',
      paymentMethod: hasReceipt ? (docModalOrder.paymentMethod || 'transferencia') : docModalOrder.paymentMethod,
      invoiceFolio: folioClean || '',
      invoicePdfUrl: draftInvoicePdfUrl || '',
      invoicePdfFileName: hasPdf ? (draftInvoicePdfName || 'factura.pdf') : '',
      invoicePdfUploadedAt: hasPdf
        ? (docModalOrder.invoicePdfUrl === draftInvoicePdfUrl && docModalOrder.invoicePdfUploadedAt
            ? docModalOrder.invoicePdfUploadedAt
            : nowIso)
        : '',
      invoiceXmlUrl: draftInvoiceXmlUrl || '',
      invoiceXmlFileName: hasXml ? (draftInvoiceXmlName || 'factura.xml') : '',
      invoiceXmlUploadedAt: hasXml
        ? (docModalOrder.invoiceXmlUrl === draftInvoiceXmlUrl && docModalOrder.invoiceXmlUploadedAt
            ? docModalOrder.invoiceXmlUploadedAt
            : nowIso)
        : '',
      // Mantener compatibilidad con campo legado
      invoiceFileUrl: draftInvoicePdfUrl || draftInvoiceXmlUrl || '',
      invoiceFileName: hasPdf ? (draftInvoicePdfName || 'factura.pdf') : hasXml ? (draftInvoiceXmlName || 'factura.xml') : '',
      invoiceUploadedAt: hasPdf || hasXml ? nowIso : '',
      updatedAt: nowIso
    };

    onSaveOrder(updatedOrder);
    playCashSound();
    showToast(`Documentos guardados para ${docModalOrder.customerName}`);
    setDocModalOrder(null);
  };

  // =========================================================================
  // CRUD CLIENTES VIP Y SUS PRODUCTOS
  // =========================================================================
  const handleOpenCreateCustomer = () => {
    playBeep(650, 'sine', 0.03);
    setCustomerToEdit(null);
    setCustName('');
    setCustPhone('');
    setCustRfc('');
    setCustBusinessName('');
    setCustRequiresInvoice(false);
    setCustNotes('');
    setCustItems([{ breadName: 'Bolillo', unitPrice: 5 }]);
    setNewProdName('');
    setNewProdPrice('');
    setNewProdCategory('');
    setIsCustomerModalOpen(true);
  };

  const handleOpenEditCustomer = (c: VipCustomer) => {
    playBeep(650, 'sine', 0.03);
    setCustomerToEdit(c);
    setCustName(c.name);
    setCustPhone(c.phone || '');
    setCustRfc(c.rfc || '');
    setCustBusinessName(c.businessName || '');
    setCustRequiresInvoice(Boolean(c.requiresInvoice));
    setCustNotes(c.notes || '');
    setCustItems(getClientItems(c).map(it => ({ ...it })));
    setNewProdName('');
    setNewProdPrice('');
    setNewProdCategory('');
    setIsCustomerModalOpen(true);
  };

  const handleAddItemInCustomerModal = () => {
    const cleanName = newProdName.trim();
    const cleanPrice = parseFloat(newProdPrice);
    if (!cleanName) {
      showToast('Escribe el nombre del pan', 'warn');
      return;
    }
    if (isNaN(cleanPrice) || cleanPrice < 0) {
      showToast('Escribe un precio válido', 'warn');
      return;
    }
    setCustItems(prev => [
      ...prev,
      {
        breadName: cleanName,
        unitPrice: Math.round(cleanPrice * 100) / 100,
        ...(newProdCategory.trim() ? { category: newProdCategory.trim() } : {})
      }
    ]);
    setNewProdName('');
    setNewProdPrice('');
    setNewProdCategory('');
    playBeep(700, 'sine', 0.02);
  };

  const handleSaveCustomerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim()) {
      showToast('Escribe el nombre del cliente', 'warn');
      return;
    }

    // Si dejó algo escrito en el renglón de "nuevo producto" sin darle click a +, incluirlo automáticamente
    const finalItems = [...custItems.filter(it => it.breadName.trim() !== '')];
    if (newProdName.trim()) {
      const p = parseFloat(newProdPrice);
      finalItems.push({
        breadName: newProdName.trim(),
        unitPrice: isNaN(p) || p < 0 ? 0 : Math.round(p * 100) / 100,
        ...(newProdCategory.trim() ? { category: newProdCategory.trim() } : {})
      });
    }

    const summaryBread =
      finalItems.length > 0
        ? finalItems
            .slice(0, 3)
            .map(i => `${i.breadName} ($${i.unitPrice.toFixed(2)})`)
            .join(', ')
        : 'Pan Surtido';

    const savedCustomer: VipCustomer = {
      id: customerToEdit?.id || `vip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: custName.trim(),
      sortOrder: customerToEdit?.sortOrder ?? orderedClients.length + 1,
      phone: custPhone.trim() || undefined,
      rfc: custRfc.trim() || undefined,
      businessName: custBusinessName.trim() || undefined,
      defaultBreadType: summaryBread,
      items: finalItems,
      requiresInvoice: custRequiresInvoice,
      notes: custNotes.trim() || undefined,
      createdAt: customerToEdit?.createdAt || new Date().toISOString()
    };

    onSaveCustomer(savedCustomer);
    playCashSound();
    showToast(customerToEdit ? `Cliente ${savedCustomer.name} actualizado` : `Cliente ${savedCustomer.name} agregado`);
    setIsCustomerModalOpen(false);
  };

  // Modal rápido "+ Producto" directo sobre un cliente
  const handleOpenQuickAddProduct = (client: VipCustomer) => {
    setQuickAddProductClient(client);
    setQuickProdName('');
    setQuickProdPrice('');
    setQuickProdCategory('');
    playBeep(650, 'sine', 0.03);
  };

  const handleSaveQuickProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAddProductClient) return;
    const name = quickProdName.trim();
    const price = parseFloat(quickProdPrice);
    if (!name || isNaN(price) || price < 0) {
      showToast('Escribe nombre del producto y precio válido', 'warn');
      return;
    }

    const currentItems = getClientItems(quickAddProductClient);
    const updatedItems: VipBreadItem[] = [
      ...currentItems,
      {
        breadName: name,
        unitPrice: Math.round(price * 100) / 100,
        ...(quickProdCategory.trim() ? { category: quickProdCategory.trim() } : {})
      }
    ];

    onSaveCustomer({
      ...quickAddProductClient,
      items: updatedItems
    });
    playCashSound();
    showToast(`Producto "${name}" ($${price.toFixed(2)}) agregado a ${quickAddProductClient.name}`);
    setQuickAddProductClient(null);
  };

  // Sincronizar manualmente con Supabase
  const handleForceSync = async () => {
    setLocalSyncing(true);
    try {
      if (onManualSyncCloud) {
        await onManualSyncCloud();
      } else {
        await syncWithCloud({ vipCustomers, vipOrders });
        await fetchAndMergeCloud();
      }
      showToast('Sincronizado con la nube');
    } catch {
      showToast('Respaldo guardado localmente', 'warn');
    } finally {
      setLocalSyncing(false);
    }
  };

  // WhatsApp text & copy
  const buildWhatsAppText = (order: VipOrder): string => {
    const itemsList =
      order.items && order.items.length > 0
        ? order.items
            .map(it => `• ${it.quantity}x ${it.breadName} ($${it.unitPrice.toFixed(2)}) = $${formatMoney(it.total)}`)
            .join('\n')
        : `• ${order.breadType}: $${formatMoney(order.totalAmount)}`;
    const statusText = isOrderPaid(order) ? 'PAGADO ✓' : 'PENDIENTE DE PAGO';
    return (
      `🥖 *${settings?.bakeryName || 'Panadería Santa Fé'}* — Pedido VIP\n` +
      `👤 *Cliente:* ${order.customerName}\n` +
      `📅 *Fecha:* ${order.date}\n` +
      `--------------------------------\n` +
      `${itemsList}\n` +
      `--------------------------------\n` +
      `📦 *Piezas:* ${getOrderPieces(order)} pzs\n` +
      `💰 *TOTAL:* $${formatMoney(order.totalAmount)}\n` +
      `💳 *Estado:* ${statusText}`
    );
  };

  const handleCopyOrderSummary = async (order: VipOrder) => {
    try {
      await navigator.clipboard.writeText(buildWhatsAppText(order));
      showToast('Resumen copiado para WhatsApp');
    } catch {
      showToast('No se pudo copiar al portapapeles', 'warn');
    }
  };

  const totalsPeriodLabel =
    totalsPeriod === 'dia'
      ? formatTicketDayLabel(selectedDate)
      : totalsPeriod === 'semana'
      ? `Sem ${weekBounds.label}`
      : totalsPeriod === 'mes'
      ? monthBounds.label
      : totalsPeriod === 'mes_pasado'
      ? prevMonthBounds.label
      : 'Histórico Completo';

  const handleShiftTotalsPeriod = (delta: number) => {
    if (totalsPeriod === 'dia') {
      setSelectedDate(prev => shiftLocalDate(prev, delta));
    } else if (totalsPeriod === 'semana') {
      setSelectedDate(prev => shiftLocalDate(prev, delta * 7));
    } else if (totalsPeriod === 'mes' || totalsPeriod === 'mes_pasado') {
      handleShiftMonth(delta);
    }
    playBeep(650, 'sine', 0.02);
  };

  const buildPeriodWhatsAppText = (
    client: VipCustomer,
    orders: VipOrder[],
    periodLabel: string,
    total: number,
    paid: number,
    pending: number,
    pieces: number
  ): string => {
    const sorted = [...orders].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const lines: string[] = [
      `🥖 *${settings?.bakeryName || 'Panadería Santa Fé'}* — Estado de Cuenta VIP`,
      `👤 *Cliente:* ${client.name}`,
      `🗓️ *Período:* ${periodLabel}`,
      `================================`
    ];
    for (const o of sorted) {
      const statusMark = isOrderPaid(o) ? '✓' : '⏳';
      lines.push(`📅 *${formatTicketDayLabel(o.date)}* (${statusMark}) — *$${formatMoney(o.totalAmount)}*`);
      if (o.items && o.items.length > 0) {
        for (const it of o.items) {
          lines.push(`   • ${it.quantity}× ${it.breadName} ($${it.unitPrice.toFixed(2)}) = $${formatMoney(it.total)}`);
        }
      } else if (o.breadType) {
        lines.push(`   • ${o.breadType}`);
      }
    }
    lines.push(`================================`);
    lines.push(`📦 *Piezas:* ${pieces} pzs (${sorted.length} pedidos)`);
    lines.push(`✅ *Pagado:* $${formatMoney(paid)}`);
    lines.push(`⏳ *Por Pagar:* $${formatMoney(pending)}`);
    lines.push(`💰 *TOTAL:* $${formatMoney(total)}`);
    return lines.join('\n');
  };

  const handleCopyPeriodTicket = async (
    client: VipCustomer,
    orders: VipOrder[],
    periodLabel: string,
    total: number,
    paid: number,
    pending: number,
    pieces: number
  ) => {
    try {
      await navigator.clipboard.writeText(
        buildPeriodWhatsAppText(client, orders, periodLabel, total, paid, pending, pieces)
      );
      showToast(`Ticket del período de ${client.name} copiado`);
    } catch {
      showToast('No se pudo copiar al portapapeles', 'warn');
    }
  };

  const activeSyncing = isSyncingCloud || localSyncing;
  const targetDateLabel =
    selectedDate === todayStr
      ? 'Hoy'
      : selectedDate === yesterdayStr
      ? 'Ayer'
      : selectedDate === tomorrowStr
      ? 'Mañana'
      : formatShortDate(selectedDate);

  return (
    <div className="space-y-1.5 animate-in fade-in duration-200 pb-2">
      {/* Toast flotante no intrusivo */}
      {toast && (
        <div
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl shadow-lg text-xs font-bold flex items-center gap-2 border ${
            toast.tone === 'warn'
              ? 'bg-amber-950 text-amber-100 border-amber-500'
              : 'bg-slate-900 text-white border-emerald-500'
          }`}
        >
          {toast.tone === 'warn' ? (
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{toast.text}</span>
        </div>
      )}

      {/* =========================================================================
          1. BARRA SUPERIOR COMPACTA (ESTILO REPARTOS)
          ========================================================================= */}
      <div className="bg-white rounded-xl px-2.5 py-1.5 shadow-2xs border border-slate-200 flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center border border-amber-200 shrink-0">
            <Crown className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-black text-sm text-slate-900 leading-none">Clientes VIP</h2>
            <span className="text-[11px] font-bold text-slate-500 tabular-nums">
              {orderedClients.length} clientes · {targetDateLabel}
            </span>
          </div>
        </div>

        {/* Selector rápido de Fecha (Ayer / Hoy / Mañana / Calendario) + Sincronizar */}
        <div className="flex flex-wrap items-center gap-1">
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px]">
            <button
              type="button"
              onClick={() => {
                setSelectedDate(yesterdayStr);
                playBeep(650, 'sine', 0.02);
              }}
              className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                selectedDate === yesterdayStr
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ayer
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedDate(todayStr);
                playBeep(650, 'sine', 0.02);
              }}
              className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                selectedDate === todayStr
                  ? 'bg-amber-500 text-slate-950 font-black shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedDate(tomorrowStr);
                playBeep(650, 'sine', 0.02);
              }}
              className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                selectedDate === tomorrowStr
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mañana
            </button>
          </div>

          <div className="flex items-center bg-white border border-slate-300 rounded-lg px-1 py-0.5">
            <button
              type="button"
              onClick={() => setSelectedDate(prev => shiftLocalDate(prev, -1))}
              className="p-0.5 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"
              title="Día anterior"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <div className="relative flex items-center px-1">
              <Calendar className="w-3 h-3 text-slate-400 mr-1 pointer-events-none" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                className="text-[11px] font-bold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
              />
            </div>
            <button
              type="button"
              onClick={() => setSelectedDate(prev => shiftLocalDate(prev, 1))}
              className="p-0.5 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"
              title="Día siguiente"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Botón de vista: Captura vs Totales */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px]">
            <button
              type="button"
              onClick={() => setViewTab('captura')}
              className={`px-2 py-0.5 rounded-md font-bold flex items-center gap-1 cursor-pointer transition-all ${
                viewTab === 'captura'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ListOrdered className="w-3 h-3" />
              <span>Pedidos</span>
            </button>
            <button
              type="button"
              onClick={() => setViewTab('totales')}
              className={`px-2 py-0.5 rounded-md font-bold flex items-center gap-1 cursor-pointer transition-all ${
                viewTab === 'totales'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart2 className="w-3 h-3" />
              <span>Totales</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleForceSync}
            disabled={activeSyncing}
            className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
            title="Sincronizar con la nube"
          >
            <RefreshCw className={`w-3 h-3 ${activeSyncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{activeSyncing ? 'Sync...' : 'Sync'}</span>
          </button>

          <button
            type="button"
            onClick={handleOpenCreateCustomer}
            className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-black text-white text-[11px] font-bold flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95 transition-all"
          >
            <Plus className="w-3 h-3 text-amber-400" />
            <span>Nuevo Cliente</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          2. KPI STRIP VISUAL COMPACTO (4 TARJETAS LIMPIAS EN UNA SOLA LÍNEA)
          ========================================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5">
        <div className="bg-white rounded-xl px-2.5 py-1.5 border border-slate-200 shadow-2xs flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block leading-tight">
              Pedidos ({targetDateLabel})
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-black text-slate-900 tabular-nums font-mono leading-tight">
                ${formatMoney(dayStats.totalAmount)}
              </span>
              <span className="text-[10.5px] font-semibold text-slate-500 tabular-nums truncate">
                {dayStats.totalPieces} pzs
              </span>
            </div>
          </div>
          <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-black text-xs shrink-0">
            {dayStats.ordersCount}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setViewTab('captura');
            setLeftFilter(prev => (prev === 'pendiente' ? 'todos' : 'pendiente'));
          }}
          className={`text-left rounded-xl px-2.5 py-1.5 border shadow-2xs flex items-center justify-between gap-2 transition-all cursor-pointer ${
            leftFilter === 'pendiente'
              ? 'bg-amber-50 border-amber-400 ring-1 ring-amber-300'
              : 'bg-white border-slate-200 hover:border-amber-300'
          }`}
        >
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block leading-tight">
              Por Pagar ({targetDateLabel})
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-black text-amber-900 tabular-nums font-mono leading-tight">
                ${formatMoney(dayStats.pendingAmount)}
              </span>
              <span className="text-[10.5px] font-semibold text-amber-700 tabular-nums truncate">
                {dayStats.pendingCount} pend.
                {globalPendingStats.count > dayStats.pendingCount && (
                  <> · Gral ${formatMoney(globalPendingStats.amount)}</>
                )}
              </span>
            </div>
          </div>
          <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setViewTab('captura');
            setLeftFilter(prev => (prev === 'pagado' ? 'todos' : 'pagado'));
          }}
          className={`text-left rounded-xl px-2.5 py-1.5 border shadow-2xs flex items-center justify-between gap-2 transition-all cursor-pointer ${
            leftFilter === 'pagado'
              ? 'bg-emerald-50 border-emerald-400 ring-1 ring-emerald-300'
              : 'bg-white border-slate-200 hover:border-emerald-300'
          }`}
        >
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block leading-tight">
              Ya Pagado ({targetDateLabel})
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-black text-emerald-700 tabular-nums font-mono leading-tight">
                ${formatMoney(dayStats.paidAmount)}
              </span>
              <span className="text-[10.5px] font-semibold text-emerald-700 tabular-nums truncate">
                {dayStats.paidCount} pag · {dayStats.receiptsCount} comp
              </span>
            </div>
          </div>
          <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => setViewTab(prev => (prev === 'totales' ? 'captura' : 'totales'))}
          className="text-left bg-white hover:border-blue-300 rounded-xl px-2.5 py-1.5 border border-slate-200 shadow-2xs flex items-center justify-between gap-2 transition-all cursor-pointer"
        >
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block leading-tight">
              Semana / Mes
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-black text-slate-900 tabular-nums font-mono leading-tight">
                ${formatMoney(quickWeekTotal)}
              </span>
              <span className="text-[10.5px] font-semibold text-slate-500 tabular-nums truncate">
                Mes ${formatMoney(quickMonthTotal)}
              </span>
            </div>
          </div>
          <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
            <BarChart2 className="w-4 h-4" />
          </div>
        </button>
      </div>

      {/* =========================================================================
          3. VISTA PRINCIPAL O VISTA TOTALES (DÍA / SEMANA / MES)
          ========================================================================= */}
      {viewTab === 'totales' ? (
        <div className="space-y-1.5">
          {/* Selector de Período + Navegación rápida + Resumen Global */}
          <div className="bg-white rounded-xl px-2.5 py-1.5 border border-slate-200 shadow-2xs space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    { id: 'dia', label: 'Por Día' },
                    { id: 'semana', label: 'Por Semana' },
                    { id: 'mes', label: 'Por Mes' },
                    { id: 'mes_pasado', label: 'Mes Ant.' },
                    { id: 'todo', label: 'Todo' }
                  ] as { id: PeriodMode; label: string }[]
                ).map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setTotalsPeriod(p.id)}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      totalsPeriod === p.id
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}

                {totalsPeriod !== 'todo' && (
                  <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-1 py-0.5 ml-1">
                    <button
                      type="button"
                      onClick={() => handleShiftTotalsPeriod(-1)}
                      className="p-0.5 hover:bg-slate-200 rounded text-slate-600 cursor-pointer"
                      title="Período anterior"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[11px] font-black text-slate-800 px-1.5 min-w-[115px] text-center">
                      {totalsPeriodLabel}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleShiftTotalsPeriod(1)}
                      className="p-0.5 hover:bg-slate-200 rounded text-slate-600 cursor-pointer"
                      title="Período siguiente"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 text-[11px] tabular-nums">
                <div>
                  <span className="text-slate-400 font-bold mr-1">Total:</span>
                  <span className="font-black font-mono text-slate-900">${formatMoney(totalsTabSummary.total)}</span>
                </div>
                <div>
                  <span className="text-emerald-600 font-bold mr-1">Pagado:</span>
                  <span className="font-black font-mono text-emerald-700">${formatMoney(totalsTabSummary.paid)}</span>
                </div>
                <div>
                  <span className="text-amber-700 font-bold mr-1">Por Pagar:</span>
                  <span className="font-black font-mono text-amber-800">${formatMoney(totalsTabSummary.pending)}</span>
                </div>
                <div className="hidden sm:block text-slate-500 font-semibold">
                  {totalsTabSummary.pieces} pzs · {totalsTabSummary.ordersCount} ped
                </div>
              </div>
            </div>

            {/* Filtro rápido de los 5 Clientes VIP */}
            <div className="pt-1 border-t border-slate-100 flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => setTotalsClientFilter('todos')}
                className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  totalsClientFilter === 'todos'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                Todos ({totalsTabByClient.length})
              </button>
              {totalsTabByClient.map(row => {
                const active = totalsClientFilter === row.client.id;
                return (
                  <button
                    key={row.client.id}
                    type="button"
                    onClick={() =>
                      setTotalsClientFilter(prev => (prev === row.client.id ? 'todos' : row.client.id))
                    }
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 border cursor-pointer transition-all ${
                      active
                        ? 'bg-amber-500 text-slate-950 border-amber-600 font-black shadow-2xs'
                        : row.total > 0
                        ? row.pending > 0
                          ? 'bg-amber-50 text-amber-950 border-amber-200 hover:bg-amber-100'
                          : 'bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span>{row.client.name}</span>
                    <span className="font-mono text-[10px] tabular-nums">
                      ${formatMoney(row.total)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Vista unificada tipo TICKET con el detalle de cada día (Lunes 2 nov, Martes 3 nov...) y su total */}
          {(() => {
            const visibleRows = totalsTabByClient.filter(
              row => totalsClientFilter === 'todos' || row.client.id === totalsClientFilter
            );
            const gridClass =
              totalsClientFilter === 'todos'
                ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 items-start'
                : 'grid grid-cols-1 gap-2 max-w-3xl mx-auto';

            return (
              <div className={gridClass}>
                {visibleRows.map((row, idx) => {
                  const sortedOrders = [...row.orders].sort(
                    (a, b) => (a.date || '').localeCompare(b.date || '')
                  );

                  // Resumen acumulado por producto en el período para vista 1-cliente
                  const productTotalsMap = new Map<string, { qty: number; total: number }>();
                  for (const o of sortedOrders) {
                    if (Array.isArray(o.items) && o.items.length > 0) {
                      for (const it of o.items) {
                        const prev = productTotalsMap.get(it.breadName) || { qty: 0, total: 0 };
                        productTotalsMap.set(it.breadName, {
                          qty: prev.qty + (it.quantity || 0),
                          total: prev.total + (it.total || 0)
                        });
                      }
                    }
                  }

                  return (
                    <div
                      key={row.client.id}
                      className={`bg-white rounded-xl border shadow-2xs overflow-hidden flex flex-col ${
                        row.total > 0
                          ? row.pending > 0
                            ? 'border-amber-300'
                            : 'border-emerald-300'
                          : 'border-slate-200 opacity-85'
                      }`}
                    >
                      {/* Encabezado estilo Ticket del Cliente */}
                      <div className="bg-slate-900 text-white px-2.5 py-1.5 flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`w-5 h-5 rounded font-mono font-black text-[10px] flex items-center justify-center border shrink-0 ${
                              CLIENT_DISPLAY_BADGE_COLORS[idx % CLIENT_DISPLAY_BADGE_COLORS.length]
                            }`}
                          >
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <h4 className="font-black text-xs text-white truncate leading-tight">
                              {row.client.name}
                            </h4>
                            <span className="text-[9.5px] text-slate-300 font-mono block leading-tight">
                              {totalsPeriodLabel} · {row.ordersCount} ped · {row.pieces} pzs
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {row.pending > 0 && (
                            <button
                              type="button"
                              onClick={() => handleMarkAllClientOrdersPaid(row.orders, row.client.name)}
                              className="px-1.5 py-0.5 rounded bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-[10px] cursor-pointer"
                              title="Marcar todos los pedidos de este período como pagados"
                            >
                              ✓ Cobrar
                            </button>
                          )}
                          {row.ordersCount > 0 && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopyPeriodTicket(
                                    row.client,
                                    sortedOrders,
                                    totalsPeriodLabel,
                                    row.total,
                                    row.paid,
                                    row.pending,
                                    row.pieces
                                  )
                                }
                                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                                title="Copiar ticket completo para WhatsApp"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setPeriodTicketModal({
                                    client: row.client,
                                    orders: sortedOrders,
                                    periodLabel: totalsPeriodLabel,
                                    total: row.total,
                                    paid: row.paid,
                                    pending: row.pending,
                                    pieces: row.pieces
                                  })
                                }
                                className="p-1 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 cursor-pointer"
                                title="Ver ticket completo / Imprimir / WhatsApp"
                              >
                                <Printer className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Cuerpo del Ticket: Detalle cronológico día por día */}
                      <div className="bg-slate-50/40 divide-y divide-dashed divide-slate-200 font-mono text-[11px]">
                        {sortedOrders.length === 0 ? (
                          <div className="px-3 py-4 text-center text-[11px] font-sans text-slate-400">
                            Sin pedidos en {totalsPeriodLabel}.
                          </div>
                        ) : (
                          sortedOrders.map(order => {
                            const paid = isOrderPaid(order);
                            const hasPdf = Boolean(getOrderInvoicePdf(order).url);
                            const hasXml = Boolean(getOrderInvoiceXml(order).url);
                            return (
                              <div
                                key={order.id}
                                className={`px-2.5 py-1.5 space-y-0.5 ${
                                  paid ? 'bg-emerald-50/20' : 'bg-white'
                                }`}
                              >
                                {/* Cabecera del Día: ej. "Lunes 2 nov" + Estado + Docs + Subtotal Día */}
                                <div className="flex items-center justify-between gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedDate(order.date);
                                      setFocusedClientId(row.client.id);
                                      setViewTab('captura');
                                    }}
                                    className="font-sans font-black text-[11px] text-slate-900 hover:text-blue-700 cursor-pointer truncate text-left"
                                    title="Clic para ir a editar este día"
                                  >
                                    {formatTicketDayLabel(order.date)}
                                  </button>

                                  <div className="flex items-center gap-1 shrink-0 font-sans">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleOrderPaid(order)}
                                      className={`px-1.5 py-0 rounded text-[9.5px] font-bold border cursor-pointer ${
                                        paid
                                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                          : 'bg-amber-100 text-amber-900 border-amber-300'
                                      }`}
                                      title="Cambiar estado de pago"
                                    >
                                      {paid ? 'Pag' : 'Debe'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenDocsModal(order)}
                                      className={`px-1 py-0 rounded text-[9.5px] font-bold border cursor-pointer ${
                                        order.transferReceiptUrl || hasPdf || hasXml
                                          ? 'bg-blue-50 text-blue-800 border-blue-200'
                                          : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'
                                      }`}
                                      title="Comprobante / Factura"
                                    >
                                      {order.transferReceiptUrl ? '📷' : ''}
                                      {hasPdf || hasXml ? '📄' : !order.transferReceiptUrl ? 'Docs' : ''}
                                    </button>
                                    <span className="font-mono font-black text-[11px] text-slate-900 tabular-nums ml-0.5">
                                      ${formatMoney(order.totalAmount)}
                                    </span>
                                  </div>
                                </div>

                                {/* Renglones detallados del ticket de ese día */}
                                <div className="pl-1.5 space-y-0.5 text-[10.5px] text-slate-700">
                                  {Array.isArray(order.items) && order.items.length > 0 ? (
                                    order.items.map(it => (
                                      <div
                                        key={it.breadName}
                                        className="flex items-baseline justify-between gap-2 leading-tight"
                                      >
                                        <span className="truncate">
                                          <strong className="text-slate-900">{it.quantity}×</strong>{' '}
                                          {it.breadName}{' '}
                                          <span className="text-slate-400">(${it.unitPrice.toFixed(2)})</span>
                                        </span>
                                        <span className="font-semibold text-slate-800 tabular-nums shrink-0">
                                          ${formatMoney(it.total)}
                                        </span>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="flex items-baseline justify-between gap-2 leading-tight">
                                      <span className="truncate">{order.breadType}</span>
                                      <span className="font-semibold text-slate-800 tabular-nums shrink-0">
                                        ${formatMoney(order.totalAmount)}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Resumen acumulado por pan cuando se enfoca un solo cliente */}
                      {totalsClientFilter !== 'todos' && productTotalsMap.size > 0 && (
                        <div className="px-2.5 py-1.5 bg-amber-50/40 border-t border-dashed border-slate-300 font-mono text-[10.5px] space-y-0.5">
                          <div className="font-sans font-black text-[10px] uppercase tracking-wider text-slate-500">
                            Acumulado por Producto ({totalsPeriodLabel})
                          </div>
                          {Array.from(productTotalsMap.entries()).map(([breadName, info]) => (
                            <div key={breadName} className="flex items-center justify-between gap-2 text-slate-700">
                              <span className="truncate">
                                <strong className="text-slate-900">{info.qty}×</strong> {breadName}
                              </span>
                              <span className="font-bold text-slate-900 tabular-nums shrink-0">
                                ${formatMoney(info.total)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Pie de Ticket con Total del Período */}
                      <div className="bg-slate-100/90 border-t-2 border-dashed border-slate-300 px-2.5 py-1.5 font-mono tabular-nums space-y-0.5 mt-auto">
                        <div className="flex items-center justify-between text-[10px] font-bold">
                          <span className="text-emerald-700">Pagado: ${formatMoney(row.paid)}</span>
                          <span className={row.pending > 0 ? 'text-amber-800' : 'text-slate-400'}>
                            Pend: ${formatMoney(row.pending)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs font-black text-slate-950">
                          <span>TOTAL ({row.pieces} pzs)</span>
                          <span className="text-sm">${formatMoney(row.total)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      ) : (
        /* =========================================================================
            4. WORKSPACE PRINCIPAL 2 COLUMNAS (ESTILO REPARTOS)
               IZQUIERDA (lg:col-span-7): CAPTURA RÁPIDA DE PEDIDOS POR PRODUCTO
               DERECHA   (lg:col-span-5): PEDIDOS DEL DÍA + ACUMULADO POR CLIENTE
            ========================================================================= */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 items-start">
          {/* ==========================================
              COLUMNA IZQUIERDA (lg:col-span-7): CAPTURA RÁPIDA DE PEDIDOS (ESTILO REPARTOS)
              ========================================== */}
          <div className="lg:col-span-7 space-y-1.5">
            {/* Barra de búsqueda, pestañas rápidas y barra de fechas ultra-compacta */}
            <div className="bg-white rounded-xl p-2 border border-slate-200 shadow-2xs space-y-1.5">
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => setFocusedClientId('todos')}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    focusedClientId === 'todos'
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  Todos ({orderedClients.length})
                </button>
                {orderedClients.map((c) => {
                  const hasOrderToday = dateOrderByCustomerId.has(c.id);
                  const dayOrder = dateOrderByCustomerId.get(c.id);
                  const paid = dayOrder ? isOrderPaid(dayOrder) : false;
                  const active = focusedClientId === c.id;

                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setFocusedClientId(prev => (prev === c.id ? 'todos' : c.id))}
                      className={`px-2 py-0.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer border ${
                        active
                          ? 'bg-amber-500 text-slate-950 border-amber-600 font-black shadow-2xs'
                          : hasOrderToday
                          ? paid
                            ? 'bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-amber-50 text-amber-950 border-amber-200 hover:bg-amber-100'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span>{c.name}</span>
                      {dayOrder && (
                        <span className="font-mono text-[10px] opacity-90 tabular-nums">
                          ${formatMoney(dayOrder.totalAmount)}
                        </span>
                      )}
                    </button>
                  );
                })}

                <div className="relative flex-1 min-w-[160px]">
                  <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Buscar cliente o pan..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-slate-900 rounded-lg pl-6 pr-6 py-0.5 text-[11px] font-semibold text-slate-900 focus:outline-none transition-colors"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Barra rápida de fechas: Hoy, Ayer, o número de día del mes */}
              <div className="pt-1 border-t border-slate-100 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDate(todayStr);
                        playBeep(650, 'sine', 0.02);
                      }}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer border ${
                        selectedDate === todayStr
                          ? 'bg-amber-500 text-slate-950 border-amber-600 font-black shadow-2xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                      }`}
                    >
                      Hoy ({parseInt(todayStr.slice(8, 10), 10)})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDate(yesterdayStr);
                        playBeep(650, 'sine', 0.02);
                      }}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer border ${
                        selectedDate === yesterdayStr
                          ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                      }`}
                    >
                      Ayer ({parseInt(yesterdayStr.slice(8, 10), 10)})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDate(tomorrowStr);
                        playBeep(650, 'sine', 0.02);
                      }}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer border ${
                        selectedDate === tomorrowStr
                          ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                      }`}
                    >
                      Mañana ({parseInt(tomorrowStr.slice(8, 10), 10)})
                    </button>
                  </div>

                  <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-md px-1 py-0.5">
                    <button
                      type="button"
                      onClick={() => handleShiftMonth(-1)}
                      className="p-0.5 hover:bg-slate-200 rounded text-slate-600 cursor-pointer"
                      title="Mes anterior"
                    >
                      <ChevronLeft className="w-3 h-3" />
                    </button>
                    <span className="text-[10.5px] font-bold text-slate-700 px-1 min-w-[82px] text-center">
                      {monthDaysStrip.monthTitle}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleShiftMonth(1)}
                      className="p-0.5 hover:bg-slate-200 rounded text-slate-600 cursor-pointer"
                      title="Mes siguiente"
                    >
                      <ChevronRight className="w-3 h-3" />
                    </button>
                    <div className="border-l border-slate-200 pl-1 flex items-center">
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                        className="text-[10.5px] font-bold text-slate-700 bg-transparent focus:outline-none cursor-pointer w-[98px]"
                        title="Elegir fecha exacta"
                      />
                    </div>
                  </div>
                </div>

                {/* Tira compacta de números de día del mes (1..30/31) */}
                <div
                  ref={dayStripRef}
                  className="flex items-center gap-0.5 overflow-x-auto pb-0.5 scrollbar-thin"
                >
                  {monthDaysStrip.days.map((d) => {
                    const isSelected = d.dateStr === selectedDate;
                    const isToday = d.dateStr === todayStr;

                    return (
                      <button
                        key={d.dateStr}
                        type="button"
                        data-selected-day={isSelected ? 'true' : 'false'}
                        onClick={() => {
                          setSelectedDate(d.dateStr);
                          playBeep(650, 'sine', 0.02);
                        }}
                        className={`min-w-[26px] px-1 py-0.5 rounded-md flex flex-col items-center justify-center transition-all cursor-pointer border shrink-0 tabular-nums ${
                          isSelected
                            ? 'bg-slate-900 text-amber-400 border-slate-900 shadow-2xs'
                            : isToday
                            ? 'bg-amber-50 text-amber-950 border-amber-400 font-black'
                            : d.hasOrders
                            ? 'bg-white text-slate-900 border-slate-300 hover:bg-slate-50'
                            : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-800'
                        }`}
                        title={formatShortDate(d.dateStr)}
                      >
                        <span
                          className={`text-[8.5px] leading-none font-semibold ${
                            isSelected ? 'text-slate-300' : 'text-slate-400'
                          }`}
                        >
                          {d.weekday.slice(0, 1)}
                        </span>
                        <span className="text-[11px] font-mono font-bold leading-none mt-0.5">
                          {d.dayNum}
                        </span>
                        <span
                          className={`w-2 h-0.5 rounded-full mt-0.5 ${
                            d.hasPending
                              ? 'bg-amber-500'
                              : d.hasOrders
                              ? 'bg-emerald-500'
                              : 'bg-transparent'
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Tarjetas de Captura por Cliente (filas ultra-cortas) */}
            <div className="space-y-1.5">
              {captureClients.length === 0 ? (
                <div className="bg-white rounded-xl p-4 text-center border border-slate-200 text-xs font-semibold text-slate-500">
                  No se encontraron clientes con "{searchQuery}".
                </div>
              ) : (
                captureClients.map((client, idx) => {
                  const catalog = getClientItems(client);
                  const qtyMap = getClientDayQuantities(client);
                  const dayOrder = dateOrderByCustomerId.get(client.id);
                  const dayPieces = dayOrder ? getOrderPieces(dayOrder) : 0;
                  const dayTotal = dayOrder?.totalAmount || 0;
                  const paid = dayOrder ? isOrderPaid(dayOrder) : false;

                  const isLargeCatalog = catalog.length > 6;
                  const isExpanded = !isLargeCatalog || focusedClientId === client.id || Boolean(expandedCatalogs[client.id]);

                  const categories = Array.from(
                    new Set(catalog.map(i => i.category).filter((c): c is string => Boolean(c)))
                  );
                  const activeCat = clientCategoryFilter[client.id] || 'todos';
                  const prodSearch = (clientProductSearch[client.id] || '').toLowerCase().trim();

                  const visibleCatalog = catalog.filter(item => {
                    if (activeCat === 'con_piezas') return (qtyMap[item.breadName] || 0) > 0;
                    if (activeCat !== 'todos' && item.category !== activeCat) return false;
                    if (prodSearch && !item.breadName.toLowerCase().includes(prodSearch)) return false;
                    if (searchQuery.trim() && !client.name.toLowerCase().includes(searchQuery.toLowerCase().trim())) {
                      return item.breadName.toLowerCase().includes(searchQuery.toLowerCase().trim());
                    }
                    return true;
                  });

                  const isConfirmDeleteClient = confirmDeleteClientId === client.id;

                  return (
                    <div
                      key={client.id}
                      className={`bg-white rounded-xl border shadow-2xs overflow-hidden transition-all ${
                        dayTotal > 0
                          ? paid
                            ? 'border-emerald-300'
                            : 'border-amber-300'
                          : 'border-slate-200'
                      }`}
                    >
                      {/* Header de una sola línea por Cliente */}
                      <div className="px-2.5 py-1 bg-slate-50/90 border-b border-slate-200 flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`w-5 h-5 rounded-md font-mono font-black text-[10px] flex items-center justify-center border shrink-0 ${
                              CLIENT_DISPLAY_BADGE_COLORS[idx % CLIENT_DISPLAY_BADGE_COLORS.length]
                            }`}
                          >
                            {idx + 1}
                          </span>
                          <h4 className="font-black text-xs text-slate-900 truncate">{client.name}</h4>
                          <span className="text-[10px] font-semibold text-slate-400 shrink-0 hidden sm:inline">
                            ({catalog.length})
                          </span>
                          {client.notes && (
                            <span className="text-[10px] text-slate-400 truncate max-w-[140px] hidden xl:inline">
                              · {client.notes}
                            </span>
                          )}
                        </div>

                        {/* Total en vivo + Pago + Comprobante + Agregar Producto + Editar */}
                        <div className="flex items-center gap-1 shrink-0">
                          <div className="px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-right tabular-nums leading-none">
                            <span className="font-mono font-black text-xs text-slate-900">
                              ${formatMoney(dayTotal)}
                            </span>
                            <span className="text-[10px] text-slate-500 font-bold ml-1">
                              ({dayPieces}p)
                            </span>
                          </div>

                          {dayOrder && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleToggleOrderPaid(dayOrder)}
                                className={`h-6 px-1.5 rounded-md text-[10.5px] font-bold flex items-center gap-1 border cursor-pointer transition-all ${
                                  paid
                                    ? 'bg-emerald-600 text-white border-emerald-700'
                                    : 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-300'
                                }`}
                              >
                                {paid ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                <span>{paid ? 'Pagado' : 'Por Pagar'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenDocsModal(dayOrder)}
                                className={`h-6 px-1.5 rounded-md text-[10.5px] font-bold flex items-center gap-1 border cursor-pointer transition-colors ${
                                  dayOrder.transferReceiptUrl || getOrderInvoicePdf(dayOrder).url || getOrderInvoiceXml(dayOrder).url
                                    ? 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
                                    : dayOrder.requiresInvoice
                                    ? 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100'
                                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                                }`}
                                title="Abrir ventana de comprobante (imagen) y factura (PDF y XML)"
                              >
                                {dayOrder.transferReceiptUrl ? (
                                  <ImageIcon className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Upload className="w-3 h-3" />
                                )}
                                <span className="hidden sm:inline">Docs</span>
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => handleOpenQuickAddProduct(client)}
                            className="h-6 px-1.5 rounded-md bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-[10.5px] font-bold flex items-center gap-0.5 cursor-pointer"
                            title="Agregar otro producto a este cliente"
                          >
                            <PackagePlus className="w-3 h-3 text-amber-600" />
                            <span className="hidden sm:inline">+ Pan</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenEditCustomer(client)}
                            className="w-6 h-6 rounded-md bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-900 border border-slate-200 flex items-center justify-center cursor-pointer"
                            title="Editar cliente y lista de precios"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>

                          {isConfirmDeleteClient ? (
                            <div className="flex items-center gap-1 bg-rose-50 px-1.5 py-0.5 rounded-md border border-rose-200">
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteCustomer(client.id);
                                  setConfirmDeleteClientId(null);
                                  if (focusedClientId === client.id) setFocusedClientId('todos');
                                  showToast(`Cliente ${client.name} eliminado`, 'warn');
                                }}
                                className="text-[10px] font-bold text-rose-700 hover:underline cursor-pointer"
                              >
                                Sí
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteClientId(null)}
                                className="text-[10px] font-bold text-slate-500 cursor-pointer"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteClientId(client.id)}
                              className="w-6 h-6 rounded-md bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 flex items-center justify-center cursor-pointer"
                              title="Eliminar cliente"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}

                          {isLargeCatalog && focusedClientId !== client.id && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedCatalogs(prev => ({ ...prev, [client.id]: !isExpanded }))
                              }
                              className="h-6 px-2 rounded-md bg-slate-900 text-white text-[10.5px] font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <span>{isExpanded ? 'Cerrar' : `Abrir (${catalog.length})`}</span>
                              {isExpanded ? (
                                <ChevronUp className="w-3 h-3" />
                              ) : (
                                <ChevronDown className="w-3 h-3" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Resumen compacto si el catálogo grande está contraído y ya tiene piezas cargadas */}
                      {!isExpanded && dayOrder && dayOrder.items && dayOrder.items.length > 0 && (
                        <div className="px-2.5 py-1 bg-emerald-50/40 flex flex-wrap items-center gap-1 text-[10.5px]">
                          {dayOrder.items.map(it => (
                            <span
                              key={it.breadName}
                              className="bg-white border border-emerald-200 text-slate-800 px-1.5 py-0.5 rounded font-semibold tabular-nums"
                            >
                              <strong className="font-mono text-emerald-700">{it.quantity}×</strong> {it.breadName}{' '}
                              <span className="text-slate-400 font-mono">(${formatMoney(it.total)})</span>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Filtros de categoría + Buscador interno para catálogos grandes (ej. Star Médica) */}
                      {isExpanded && isLargeCatalog && (
                        <div className="px-2.5 py-1.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setClientCategoryFilter(prev => ({ ...prev, [client.id]: 'todos' }))}
                            className={`px-1.5 py-0.5 rounded text-[10.5px] font-bold cursor-pointer ${
                              activeCat === 'todos'
                                ? 'bg-slate-900 text-white'
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            Todos ({catalog.length})
                          </button>
                          {dayPieces > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setClientCategoryFilter(prev => ({ ...prev, [client.id]: 'con_piezas' }))
                              }
                              className={`px-1.5 py-0.5 rounded text-[10.5px] font-bold cursor-pointer ${
                                activeCat === 'con_piezas'
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              }`}
                            >
                              Con pedido ({dayOrder?.items?.length || 0})
                            </button>
                          )}
                          {categories.map(cat => (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setClientCategoryFilter(prev => ({ ...prev, [client.id]: cat }))}
                              className={`px-1.5 py-0.5 rounded text-[10.5px] font-bold cursor-pointer ${
                                activeCat === cat
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {cat}
                            </button>
                          ))}

                          <div className="relative flex-1 min-w-[150px]">
                            <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              placeholder={`Buscar pan en ${client.name}...`}
                              value={clientProductSearch[client.id] || ''}
                              onChange={(e) =>
                                setClientProductSearch(prev => ({ ...prev, [client.id]: e.target.value }))
                              }
                              className="w-full bg-white border border-slate-200 focus:border-blue-600 rounded pl-6 pr-6 py-0.5 text-[11px] font-semibold text-slate-800 focus:outline-none"
                            />
                            {clientProductSearch[client.id] && (
                              <button
                                type="button"
                                onClick={() => setClientProductSearch(prev => ({ ...prev, [client.id]: '' }))}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Filas ultra-cortas de Productos (una sola línea por producto) */}
                      {isExpanded && (
                        <div
                          className={
                            isLargeCatalog
                              ? 'grid grid-cols-1 xl:grid-cols-2 divide-y xl:divide-y-0 xl:gap-px bg-slate-100 max-h-[300px] overflow-y-auto'
                              : 'divide-y divide-slate-100'
                          }
                        >
                          {visibleCatalog.length === 0 ? (
                            <div className="col-span-full p-3 bg-white text-center text-xs text-slate-400 font-semibold">
                              Sin productos que coincidan.
                            </div>
                          ) : (
                            visibleCatalog.map(item => {
                              const qty = qtyMap[item.breadName] || 0;
                              const subtotal = qty * item.unitPrice;

                              return (
                                <div
                                  key={item.breadName}
                                  className={`px-2.5 py-1 flex items-center justify-between gap-2 transition-colors ${
                                    qty > 0 ? 'bg-amber-50/70' : 'bg-white hover:bg-slate-50/70'
                                  }`}
                                >
                                  <div className="min-w-0 flex-1 flex items-baseline gap-1.5">
                                    <span className="font-bold text-xs text-slate-900 truncate">
                                      {item.breadName}
                                    </span>
                                    <span className="text-[10.5px] font-mono font-bold text-slate-500 tabular-nums shrink-0">
                                      ${item.unitPrice.toFixed(2)}
                                    </span>
                                  </div>

                                  {/* Controles rápidos compactos de cantidad */}
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateProductQty(client, item.breadName, Math.max(0, qty - 1))}
                                      disabled={qty === 0}
                                      className={`w-6 h-6 rounded-md font-black text-xs flex items-center justify-center border transition-colors ${
                                        qty > 0
                                          ? 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300 cursor-pointer'
                                          : 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed'
                                      }`}
                                    >
                                      −
                                    </button>

                                    <input
                                      type="number"
                                      min="0"
                                      placeholder="0"
                                      value={qty > 0 ? qty : ''}
                                      onFocus={(e) => e.target.select()}
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        if (raw === '') {
                                          handleUpdateProductQty(client, item.breadName, 0);
                                        } else {
                                          const val = parseInt(raw, 10);
                                          handleUpdateProductQty(client, item.breadName, isNaN(val) ? 0 : Math.max(0, val));
                                        }
                                      }}
                                      className="w-12 h-6 text-center font-mono font-black text-[11px] bg-white border border-slate-300 focus:border-slate-900 rounded-md focus:outline-none tabular-nums"
                                    />

                                    <button
                                      type="button"
                                      onClick={() => handleUpdateProductQty(client, item.breadName, qty + 1)}
                                      className="w-6 h-6 rounded-md bg-slate-900 hover:bg-black text-white font-black text-xs flex items-center justify-center cursor-pointer active:scale-95 transition-all"
                                    >
                                      +
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleUpdateProductQty(client, item.breadName, qty + 10)}
                                      className="h-6 px-1.5 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-950 font-mono font-bold text-[10px] border border-amber-200 cursor-pointer"
                                      title="Sumar 10 piezas"
                                    >
                                      +10
                                    </button>

                                    <div className="w-16 text-right font-mono font-bold text-[11px] tabular-nums">
                                      {qty > 0 ? (
                                        <span className="text-slate-900">${formatMoney(subtotal)}</span>
                                      ) : (
                                        <span className="text-slate-300">$0.00</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ==========================================
              COLUMNA DERECHA (lg:col-span-5): PEDIDOS DEL DÍA + ACUMULADO COMPACTOS
              ========================================== */}
          <div className="lg:col-span-5 space-y-1.5">
            {/* BLOQUE A: PEDIDOS DEL DÍA */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="bg-slate-900 text-white px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5">
                  <ListOrdered className="w-3.5 h-3.5 text-amber-400" />
                  <h3 className="font-black text-[11px] uppercase tracking-wider">
                    Pedidos del Día ({filteredDayOrders.length})
                  </h3>
                  <span className="text-[10px] text-slate-300 font-medium">· {targetDateLabel}</span>
                </div>

                {/* Filtros rápidos de pago */}
                <div className="flex items-center bg-slate-800 p-0.5 rounded-md border border-slate-700 text-[10px]">
                  {(
                    [
                      { id: 'todos', label: 'Todos' },
                      { id: 'pendiente', label: 'Por Pagar' },
                      { id: 'pagado', label: 'Pagados' },
                      { id: 'sin_comprobante', label: 'Sin Foto' }
                    ] as { id: PaymentFilter; label: string }[]
                  ).map(f => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setLeftFilter(f.id)}
                      className={`px-1.5 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                        leftFilter === f.id
                          ? 'bg-amber-400 text-slate-950 font-black'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-slate-100 max-h-[290px] overflow-y-auto">
                {filteredDayOrders.length === 0 ? (
                  <div className="p-4 text-center space-y-0.5">
                    <p className="text-xs font-bold text-slate-600">
                      {dateOrders.length === 0
                        ? `Sin pedidos cargados para ${targetDateLabel}.`
                        : 'Ningún pedido coincide con este filtro.'}
                    </p>
                    <p className="text-[10.5px] text-slate-400">
                      Ingresa las cantidades del lado izquierdo y aparecerán aquí al instante.
                    </p>
                  </div>
                ) : (
                  filteredDayOrders.map((order, idx) => {
                    const paid = isOrderPaid(order);
                    const pieces = getOrderPieces(order);
                    const isConfirmClear = confirmClearOrderId === order.id;
                    const hasPdf = Boolean(getOrderInvoicePdf(order).url);
                    const hasXml = Boolean(getOrderInvoiceXml(order).url);

                    return (
                      <div
                        key={order.id}
                        className={`px-2.5 py-1.5 transition-colors space-y-1 ${
                          paid ? 'bg-emerald-50/20 hover:bg-emerald-50/40' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <button
                            type="button"
                            onClick={() => setFocusedClientId(order.customerId)}
                            className="flex items-center gap-1.5 min-w-0 text-left cursor-pointer group flex-1"
                            title="Ver/editar cantidades de este cliente"
                          >
                            <span className="w-4 h-4 rounded bg-slate-900 text-amber-400 font-mono font-bold text-[9.5px] flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-xs text-slate-900 group-hover:text-blue-700 truncate">
                              {order.customerName}
                            </span>
                            <span className="text-[10px] text-slate-500 truncate">
                              · {pieces}p
                            </span>
                          </button>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="font-mono font-black text-xs text-slate-900 tabular-nums">
                              ${formatMoney(order.totalAmount)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleToggleOrderPaid(order)}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 border cursor-pointer transition-all active:scale-95 ${
                                paid
                                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                                  : 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-300'
                              }`}
                              title={paid ? 'Marcar como Por Pagar' : 'Marcar como Pagado'}
                            >
                              {paid ? <Check className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
                              <span>{paid ? 'Pagado' : 'Por Pagar'}</span>
                            </button>
                          </div>
                        </div>

                        {/* Fila inferior ultra-compacta: Resumen pan + Comprobante + Factura + Ticket + Borrar */}
                        <div className="flex items-center justify-between gap-1 pl-5">
                          <span className="text-[10px] text-slate-500 truncate min-w-0 flex-1">
                            {order.breadType}
                          </span>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleOpenDocsModal(order)}
                              className={`px-1.5 py-0.5 rounded border text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                                order.transferReceiptUrl
                                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                              }`}
                            >
                              {order.transferReceiptUrl ? (
                                <>
                                  <ImageIcon className="w-2.5 h-2.5" />
                                  <span>Ver Foto</span>
                                </>
                              ) : (
                                <>
                                  <Upload className="w-2.5 h-2.5" />
                                  <span>Foto</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenDocsModal(order)}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-0.5 border cursor-pointer transition-colors ${
                                hasPdf && hasXml
                                  ? 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
                                  : order.requiresInvoice || hasPdf || hasXml
                                  ? 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              <FileText className="w-2.5 h-2.5" />
                              <span>
                                {hasPdf && hasXml
                                  ? 'PDF+XML ✓'
                                  : hasPdf
                                  ? 'PDF'
                                  : hasXml
                                  ? 'XML'
                                  : order.requiresInvoice
                                  ? 'Factura'
                                  : '¿Fact?'}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setTicketModalOrder(order)}
                              className="p-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                              title="Ver ticket / WhatsApp"
                            >
                              <Printer className="w-3 h-3" />
                            </button>

                            {isConfirmClear ? (
                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onDeleteOrder(order.id);
                                    setConfirmClearOrderId(null);
                                    showToast(`Pedido de ${order.customerName} eliminado`, 'warn');
                                  }}
                                  className="px-1 py-0.5 rounded bg-rose-600 text-white text-[9.5px] font-bold cursor-pointer"
                                >
                                  Sí
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmClearOrderId(null)}
                                  className="px-1 py-0.5 rounded bg-slate-200 text-slate-700 text-[9.5px] font-bold cursor-pointer"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmClearOrderId(order.id)}
                                className="p-0.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                title="Eliminar pedido del día"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Pie de suma rápida del día */}
              {filteredDayOrders.length > 0 && (
                <div className="bg-slate-50 border-t border-slate-200 px-2.5 py-1 flex items-center justify-between text-[11px] font-bold tabular-nums">
                  <span className="text-slate-600">
                    Total ({dayStats.totalPieces} pzs)
                  </span>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-emerald-700">Pag: ${formatMoney(dayStats.paidAmount)}</span>
                    <span className="text-amber-800">Deben: ${formatMoney(dayStats.pendingAmount)}</span>
                    <span className="text-slate-900 font-black">${formatMoney(dayStats.totalAmount)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* BLOQUE B: ACUMULADO VISUAL POR CLIENTE ULTRA-COMPACTO */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="px-2.5 py-1.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-1.5">
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <h3 className="font-black text-[11px] text-slate-900 uppercase tracking-wider shrink-0">
                    Acumulado
                  </h3>
                  <span className="text-[10px] text-slate-500 font-medium truncate">
                    {accumPeriod === 'dia'
                      ? targetDateLabel
                      : accumPeriod === 'semana'
                      ? `Sem ${weekBounds.label}`
                      : accumPeriod === 'mes'
                      ? monthBounds.label
                      : 'Histórico'}
                  </span>
                </div>

                <div className="flex items-center bg-slate-200/70 p-0.5 rounded-md text-[10px] shrink-0">
                  {(
                    [
                      { id: 'dia', label: 'Día' },
                      { id: 'semana', label: 'Sem' },
                      { id: 'mes', label: 'Mes' },
                      { id: 'todo', label: 'Todo' }
                    ] as { id: PeriodMode; label: string }[]
                  ).map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setAccumPeriod(p.id)}
                      className={`px-1.5 py-0.5 rounded font-bold cursor-pointer transition-all ${
                        accumPeriod === p.id
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {accumulatedByClient.map(item => {
                  const widthPct = item.total > 0 ? Math.max(6, Math.round((item.total / maxAccumTotal) * 100)) : 0;
                  const paidPct = item.total > 0 ? Math.round((item.paid / item.total) * 100) : 0;
                  const isSelected = focusedClientId === item.client.id;

                  return (
                    <button
                      key={item.client.id}
                      type="button"
                      onClick={() =>
                        setFocusedClientId(prev => (prev === item.client.id ? 'todos' : item.client.id))
                      }
                      className={`w-full text-left px-2.5 py-1.5 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-50/70'
                          : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`text-[9.5px] font-black px-1 py-0 rounded border shrink-0 leading-tight ${
                              CLIENT_DISPLAY_BADGE_COLORS[item.colorIdx]
                            }`}
                          >
                            {item.ordersCount}
                          </span>
                          <span className="font-bold text-slate-900 truncate">{item.client.name}</span>
                          <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                            ({item.pieces}p)
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 font-mono tabular-nums">
                          {item.pending > 0 ? (
                            <span className="text-[10px] font-bold text-amber-800">
                              Debe ${formatMoney(item.pending)}
                            </span>
                          ) : item.total > 0 ? (
                            <span className="text-[10px] font-bold text-emerald-700">✓ Pagado</span>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-sans">Sin ped.</span>
                          )}
                          <span className="font-black text-slate-900">
                            ${formatMoney(item.total)}
                          </span>
                        </div>
                      </div>

                      {/* Barra visual ultra-delgada de Pagado vs Por Pagar */}
                      <div className="mt-1 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                        {widthPct > 0 && (
                          <div
                            className="h-full bg-amber-400 rounded-full overflow-hidden flex"
                            style={{ width: `${widthPct}%` }}
                          >
                            <div
                              className="h-full bg-emerald-500 transition-all"
                              style={{ width: `${paidPct}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODALES
          ========================================================================= */}

      {/* 1. Modal Crear / Editar Cliente VIP y sus Productos */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl p-5 max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-600" />
                <h3 className="font-black text-base text-slate-900">
                  {customerToEdit ? `Editar: ${customerToEdit.name}` : 'Nuevo Cliente VIP'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCustomerModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomerSubmit} className="space-y-3 mt-3 text-xs overflow-y-auto pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Nombre del Cliente *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Bollo David, Barra Verde..."
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Teléfono (Opcional)
                  </label>
                  <input
                    type="tel"
                    placeholder="442 000 0000"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Notas (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej. Entrega 7:00 AM / Pago semanal"
                  value={custNotes}
                  onChange={(e) => setCustNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-slate-900"
                />
              </div>

              {/* Catálogo de Productos y Precios del Cliente */}
              <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-black text-[11px] uppercase tracking-wider text-slate-700">
                    Lista de Panes y Precios ({custItems.length})
                  </span>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {custItems.map((it, idx) => (
                    <div key={`${it.breadName}_${idx}`} className="flex items-center gap-1.5 bg-white p-1.5 rounded-xl border border-slate-200">
                      <input
                        type="text"
                        value={it.breadName}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustItems(prev => prev.map((row, rIdx) => (rIdx === idx ? { ...row, breadName: val } : row)));
                        }}
                        placeholder="Producto"
                        className="flex-1 min-w-0 px-2 py-1 text-xs font-bold text-slate-900 bg-slate-50 rounded-lg border border-slate-200 focus:bg-white focus:outline-none"
                      />
                      <div className="relative w-24 shrink-0">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={it.unitPrice}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setCustItems(prev =>
                              prev.map((row, rIdx) =>
                                rIdx === idx ? { ...row, unitPrice: isNaN(val) ? 0 : val } : row
                              )
                            );
                          }}
                          className="w-full pl-5 pr-2 py-1 text-xs font-mono font-bold text-slate-900 bg-slate-50 rounded-lg border border-slate-200 focus:bg-white focus:outline-none text-right"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setCustItems(prev => prev.filter((_, rIdx) => rIdx !== idx))}
                        className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                        title="Quitar producto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Agregar producto nuevo al cliente */}
                <div className="pt-2 border-t border-slate-200 grid grid-cols-12 gap-1.5 items-center">
                  <input
                    type="text"
                    placeholder="Nuevo pan (ej. Chapata)"
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value)}
                    className="col-span-6 px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none"
                  />
                  <div className="col-span-4 relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Precio"
                      value={newProdPrice}
                      onChange={(e) => setNewProdPrice(e.target.value)}
                      className="w-full pl-5 pr-2 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddItemInCustomerModal}
                    className="col-span-2 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs flex items-center justify-center cursor-pointer"
                    title="Agregar pan a la lista"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Facturación opcional */}
              <div className="bg-amber-50/70 p-2.5 rounded-2xl border border-amber-200 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={custRequiresInvoice}
                    onChange={(e) => setCustRequiresInvoice(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-600 border-slate-300 cursor-pointer"
                  />
                  <span className="font-bold text-slate-900 text-xs">Requiere Factura Fiscal</span>
                </label>

                {custRequiresInvoice && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <input
                      type="text"
                      placeholder="RFC"
                      value={custRfc}
                      onChange={(e) => setCustRfc(e.target.value.toUpperCase())}
                      className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono uppercase"
                    />
                    <input
                      type="text"
                      placeholder="Razón Social"
                      value={custBusinessName}
                      onChange={(e) => setCustBusinessName(e.target.value)}
                      className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCustomerModalOpen(false)}
                  className="py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white font-black text-xs shadow-sm cursor-pointer"
                >
                  {customerToEdit ? 'Guardar Cambios' : 'Crear Cliente VIP'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Modal Rápido: + Agregar Producto a un Cliente */}
      {quickAddProductClient && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl p-5 max-w-sm w-full shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-black text-sm text-slate-900">Agregar Producto</h3>
                <p className="text-[11px] text-slate-500 font-semibold">{quickAddProductClient.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setQuickAddProductClient(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickProduct} className="space-y-3 mt-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Nombre del Pan / Producto *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Ej. Bollo con Ajonjolí"
                  value={quickProdName}
                  onChange={(e) => setQuickProdName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Precio ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="0.00"
                    value={quickProdPrice}
                    onChange={(e) => setQuickProdPrice(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-black text-slate-900 focus:bg-white focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Categoría (Opc.)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Bollos"
                    value={quickProdCategory}
                    onChange={(e) => setQuickProdCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQuickAddProductClient(null)}
                  className="py-2 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs cursor-pointer"
                >
                  Agregar Pan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Ventana Comprobante (Solo Imagen) y Factura (Check + PDF + XML lado a lado) */}
      {docModalOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl p-4 sm:p-5 max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 animate-in zoom-in-95">
            {/* Encabezado de la ventana */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-2xl bg-slate-900 text-amber-400 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-black text-sm sm:text-base text-slate-900 truncate">
                    Comprobante y Factura · {docModalOrder.customerName}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono font-semibold">
                    {formatShortDate(docModalOrder.date)} · {getOrderPieces(docModalOrder)} pzs · ${formatMoney(docModalOrder.totalAmount)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDocModalOrder(null)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-100 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDocsModal} className="flex-1 overflow-y-auto space-y-3.5 mt-3 pr-0.5 text-xs">
              {/* Check superior: ¿Necesita Factura? */}
              {(() => {
                const matchedClient = vipCustomers.find(c => c.id === docModalOrder.customerId);
                return (
                  <label
                    className={`flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl border cursor-pointer transition-all ${
                      draftRequiresInvoice
                        ? 'bg-blue-50/90 border-blue-300 ring-1 ring-blue-200'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={draftRequiresInvoice}
                        onChange={(e) => {
                          setDraftRequiresInvoice(e.target.checked);
                          playBeep(e.target.checked ? 720 : 520, 'sine', 0.03);
                        }}
                        className="w-5 h-5 rounded-md text-blue-600 border-slate-300 cursor-pointer accent-blue-600"
                      />
                      <div>
                        <span className="font-black text-xs sm:text-sm text-slate-900 block">
                          ¿Necesita Factura?
                        </span>
                        <span className="text-[11px] text-slate-500 font-medium">
                          {draftRequiresInvoice
                            ? 'Sí requiere factura — adjunta los archivos PDF y XML a un lado de la imagen.'
                            : 'Marca esta casilla si el pedido requiere factura fiscal (PDF y XML).'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {matchedClient?.rfc && (
                        <span className="text-[10.5px] font-mono font-bold bg-white px-2 py-1 rounded-lg border border-slate-200 text-slate-700">
                          RFC: {matchedClient.rfc}
                        </span>
                      )}
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wide ${
                          draftRequiresInvoice
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {draftRequiresInvoice ? 'Sí Factura' : 'Sin Factura'}
                      </span>
                    </div>
                  </label>
                );
              })()}

              {docModalError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{docModalError}</span>
                </div>
              )}

              {/* Inputs ocultos con formatos estrictos */}
              <input
                ref={docReceiptInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/*"
                onChange={handleDocReceiptImageChange}
                className="hidden"
              />
              <input
                ref={docPdfInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleDocPdfFileChange}
                className="hidden"
              />
              <input
                ref={docXmlInputRef}
                type="file"
                accept=".xml,text/xml,application/xml"
                onChange={handleDocXmlFileChange}
                className="hidden"
              />

              {/* Contenedor Lado a Lado: Comprobante (Imagen) | Factura (PDF y XML) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 items-stretch">
                {/* COLUMNA IZQUIERDA: COMPROBANTE DE PAGO (SOLO IMAGEN) */}
                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-3.5 flex flex-col justify-between space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <ImageIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-black text-xs text-slate-900">Comprobante de Pago</h4>
                        <span className="text-[10.5px] font-semibold text-emerald-700">
                          Solo formato Imagen (JPG, PNG, WEBP)
                        </span>
                      </div>
                    </div>
                    {draftReceiptUrl && (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-black">
                        Cargado ✓
                      </span>
                    )}
                  </div>

                  {draftReceiptUrl ? (
                    <div className="space-y-2.5 flex-1 flex flex-col justify-between">
                      <div
                        onClick={() =>
                          setViewingDoc({
                            title: `Comprobante · ${docModalOrder.customerName} (${docModalOrder.date})`,
                            url: draftReceiptUrl,
                            fileName: draftReceiptFileName || 'comprobante.jpg',
                            kind: 'image'
                          })
                        }
                        className="bg-slate-900 rounded-2xl p-2 flex items-center justify-center h-56 overflow-hidden cursor-pointer group relative border border-slate-300"
                        title="Clic para ampliar imagen"
                      >
                        <img
                          src={draftReceiptUrl}
                          alt="Comprobante de pago"
                          className="max-h-full w-auto max-w-full object-contain rounded-lg transition-transform group-hover:scale-[1.02]"
                        />
                        <span className="absolute bottom-2 right-2 bg-slate-900/80 text-white text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          <span>Ampliar</span>
                        </span>
                      </div>

                      <div className="bg-white rounded-xl border border-slate-200 px-2.5 py-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-slate-700 truncate max-w-[170px]">
                          🖼️ {draftReceiptFileName || 'comprobante.jpg'}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <a
                            href={draftReceiptUrl}
                            download={draftReceiptFileName || `comprobante_${docModalOrder.date}.jpg`}
                            className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10.5px] inline-flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            <span>Bajar</span>
                          </a>
                          <button
                            type="button"
                            disabled={isProcessingDocMedia}
                            onClick={() => docReceiptInputRef.current?.click()}
                            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[10.5px] cursor-pointer"
                          >
                            Cambiar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDraftReceiptUrl('');
                              setDraftReceiptFileName('');
                            }}
                            className="p-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 cursor-pointer"
                            title="Quitar imagen"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isProcessingDocMedia}
                      onClick={() => docReceiptInputRef.current?.click()}
                      className="flex-1 min-h-[220px] border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-white hover:bg-emerald-50/40 rounded-2xl p-5 flex flex-col items-center justify-center text-center gap-2 transition-colors cursor-pointer"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                        <Upload className="w-6 h-6" />
                      </div>
                      <span className="font-black text-xs text-slate-900">
                        Subir Imagen de Comprobante
                      </span>
                      <span className="text-[11px] text-slate-500 max-w-[220px]">
                        Captura de transferencia o foto del ticket (solo formato imagen).
                      </span>
                    </button>
                  )}
                </div>

                {/* COLUMNA DERECHA (A UN LADO DE LA IMAGEN): FACTURA EN PDF Y XML */}
                <div
                  className={`rounded-2xl border p-3.5 flex flex-col justify-between space-y-3 transition-colors ${
                    draftRequiresInvoice
                      ? 'bg-blue-50/50 border-blue-200'
                      : 'bg-slate-50/80 border-slate-200'
                  }`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                            draftRequiresInvoice ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-black text-xs text-slate-900">Factura (PDF y XML)</h4>
                          <span className="text-[10.5px] font-semibold text-slate-500">
                            Sube ambos archivos fiscales aquí
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                            draftInvoicePdfUrl ? 'bg-rose-100 text-rose-800' : 'bg-slate-200 text-slate-500'
                          }`}
                        >
                          PDF {draftInvoicePdfUrl ? '✓' : ''}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                            draftInvoiceXmlUrl ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200 text-slate-500'
                          }`}
                        >
                          XML {draftInvoiceXmlUrl ? '✓' : ''}
                        </span>
                      </div>
                    </div>

                    {/* Folio de Factura */}
                    <div>
                      <label className="block text-[10.5px] font-bold text-slate-600 uppercase mb-1">
                        Folio de Factura (Opcional)
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. F-10492 (se llena automático del XML si existe)"
                        value={draftInvoiceFolio}
                        onChange={(e) => setDraftInvoiceFolio(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 focus:border-blue-600 rounded-xl font-bold font-mono text-xs text-slate-900 focus:outline-none"
                      />
                    </div>

                    {/* Archivo PDF (.pdf) */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-[11px] text-rose-800 uppercase tracking-wide flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-rose-600" />
                          <span>1. Archivo PDF (.pdf)</span>
                        </span>
                        {draftInvoicePdfUrl && (
                          <span className="text-[10px] font-bold text-emerald-700">Listo ✓</span>
                        )}
                      </div>

                      {draftInvoicePdfUrl ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 bg-rose-50/70 border border-rose-200 rounded-xl px-2.5 py-2">
                          <span className="text-[11px] font-bold text-slate-800 truncate max-w-[160px]">
                            📄 {draftInvoicePdfName || 'factura.pdf'}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                setViewingDoc({
                                  title: `Factura PDF · ${docModalOrder.customerName} (${docModalOrder.date})`,
                                  url: draftInvoicePdfUrl,
                                  fileName: draftInvoicePdfName || 'factura.pdf',
                                  kind: 'pdf'
                                })
                              }
                              className="px-2 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-bold text-[10.5px] inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Ver</span>
                            </button>
                            <a
                              href={draftInvoicePdfUrl}
                              download={draftInvoicePdfName || `factura_${docModalOrder.date}.pdf`}
                              className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10.5px] inline-flex items-center gap-1"
                            >
                              <Download className="w-3 h-3" />
                            </a>
                            <button
                              type="button"
                              onClick={() => docPdfInputRef.current?.click()}
                              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10.5px] cursor-pointer"
                            >
                              Cambiar
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDraftInvoicePdfUrl('');
                                setDraftInvoicePdfName('');
                              }}
                              className="p-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 cursor-pointer"
                              title="Quitar PDF"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isProcessingDocMedia}
                          onClick={() => docPdfInputRef.current?.click()}
                          className="w-full py-2.5 px-3 border border-dashed border-rose-300 hover:border-rose-500 bg-rose-50/30 hover:bg-rose-50 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-rose-900 cursor-pointer transition-colors"
                        >
                          <Upload className="w-3.5 h-3.5 text-rose-600" />
                          <span>Subir Factura PDF (.pdf)</span>
                        </button>
                      )}
                    </div>

                    {/* Archivo XML (.xml) */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-[11px] text-indigo-800 uppercase tracking-wide flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-indigo-600" />
                          <span>2. Archivo XML (.xml)</span>
                        </span>
                        {draftInvoiceXmlUrl && (
                          <span className="text-[10px] font-bold text-emerald-700">Listo ✓</span>
                        )}
                      </div>

                      {draftInvoiceXmlUrl ? (
                        <div className="space-y-1.5 bg-indigo-50/70 border border-indigo-200 rounded-xl px-2.5 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-slate-800 truncate max-w-[160px]">
                              🧾 {draftInvoiceXmlName || 'factura.xml'}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setViewingDoc({
                                    title: `Factura XML · ${docModalOrder.customerName} (${docModalOrder.date})`,
                                    url: draftInvoiceXmlUrl,
                                    fileName: draftInvoiceXmlName || 'factura.xml',
                                    kind: 'xml'
                                  })
                                }
                                className="px-2 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-bold text-[10.5px] inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Eye className="w-3 h-3" />
                                <span>Ver</span>
                              </button>
                              <a
                                href={draftInvoiceXmlUrl}
                                download={draftInvoiceXmlName || `factura_${docModalOrder.date}.xml`}
                                className="px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10.5px] inline-flex items-center gap-1"
                              >
                                <Download className="w-3 h-3" />
                              </a>
                              <button
                                type="button"
                                onClick={() => docXmlInputRef.current?.click()}
                                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10.5px] cursor-pointer"
                              >
                                Cambiar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDraftInvoiceXmlUrl('');
                                  setDraftInvoiceXmlName('');
                                }}
                                className="p-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 cursor-pointer"
                                title="Quitar XML"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          {(() => {
                            const cfdi = parseCfdiSummaryFromDataUrl(draftInvoiceXmlUrl);
                            if (!cfdi.uuid && !cfdi.total) return null;
                            return (
                              <div className="text-[10px] font-mono text-indigo-900 flex flex-wrap items-center gap-2 pt-0.5">
                                {cfdi.total && <span>Total CFDI: ${cfdi.total}</span>}
                                {cfdi.uuid && <span className="truncate max-w-[210px]">UUID: {cfdi.uuid}</span>}
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isProcessingDocMedia}
                          onClick={() => docXmlInputRef.current?.click()}
                          className="w-full py-2.5 px-3 border border-dashed border-indigo-300 hover:border-indigo-500 bg-indigo-50/30 hover:bg-indigo-50 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-indigo-900 cursor-pointer transition-colors"
                        >
                          <Upload className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Subir Factura XML (.xml)</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Botones inferiores */}
              <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDocModalOrder(null)}
                  className="py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isProcessingDocMedia}
                  className="py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white font-black text-xs shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isProcessingDocMedia ? 'Procesando archivo...' : 'Guardar Comprobante y Factura'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Modal Ticket / Resumen WhatsApp */}
      {ticketModalOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl p-5 max-w-sm w-full shadow-2xl border border-slate-200 animate-in zoom-in-95 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-black text-sm text-slate-900">Nota VIP · {ticketModalOrder.customerName}</h3>
              <button
                type="button"
                onClick={() => setTicketModalOrder(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200 font-mono text-xs space-y-2">
              <div className="text-center border-b border-dashed border-slate-300 pb-2">
                <div className="font-black text-slate-900">{settings?.bakeryName || 'Panadería Santa Fé'}</div>
                <div className="text-[10.5px] text-slate-500">
                  {ticketModalOrder.date} · {ticketModalOrder.folio}
                </div>
              </div>

              <div className="space-y-1">
                {ticketModalOrder.items && ticketModalOrder.items.length > 0 ? (
                  ticketModalOrder.items.map(it => (
                    <div key={it.breadName} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate">
                        {it.quantity}× {it.breadName}
                      </span>
                      <span className="font-bold shrink-0">${formatMoney(it.total)}</span>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center justify-between text-[11px]">
                    <span>{ticketModalOrder.breadType}</span>
                    <span className="font-bold">${formatMoney(ticketModalOrder.totalAmount)}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-dashed border-slate-300 pt-2 flex items-center justify-between font-black text-sm">
                <span>TOTAL ({getOrderPieces(ticketModalOrder)} pzs)</span>
                <span>${formatMoney(ticketModalOrder.totalAmount)}</span>
              </div>
              <div className="text-center text-[11px] font-bold">
                {isOrderPaid(ticketModalOrder) ? '✓ PAGADO' : '⏳ PENDIENTE DE PAGO'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleCopyOrderSummary(ticketModalOrder)}
                className="py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar Texto</span>
              </button>
              <a
                href={`https://wa.me/${
                  ticketModalOrder.customerPhone ? ticketModalOrder.customerPhone.replace(/\D/g, '') : ''
                }?text=${encodeURIComponent(buildWhatsAppText(ticketModalOrder))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 5. Lightbox Ver Comprobante / Factura PDF / Factura XML */}
      {viewingDoc && (
        <div className="fixed inset-0 z-[60] bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {viewingDoc.kind === 'image' ? (
                  <ImageIcon className="w-4 h-4 text-amber-400 shrink-0" />
                ) : (
                  <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                )}
                <h4 className="font-bold text-xs sm:text-sm truncate">{viewingDoc.title}</h4>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={viewingDoc.url}
                  download={viewingDoc.fileName || 'documento_vip'}
                  className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white flex items-center gap-1 text-xs font-bold"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar</span>
                </a>
                <button
                  type="button"
                  onClick={() => setViewingDoc(null)}
                  className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 overflow-auto flex-1 flex items-center justify-center bg-slate-100">
              {viewingDoc.kind === 'pdf' ? (
                <iframe
                  src={viewingDoc.url}
                  className="w-full h-[70vh] rounded-xl border border-slate-300 bg-white"
                  title="Vista previa Factura PDF"
                />
              ) : viewingDoc.kind === 'xml' ? (
                <pre className="w-full h-[65vh] overflow-auto bg-slate-900 text-emerald-200 p-4 rounded-xl text-[11px] font-mono leading-relaxed border border-slate-700 whitespace-pre-wrap break-all">
                  {decodeXmlDataUrlText(viewingDoc.url) || 'Archivo XML disponible para descargar.'}
                </pre>
              ) : (
                <img
                  src={viewingDoc.url}
                  alt="Comprobante de pago"
                  className="max-h-[72vh] w-auto max-w-full object-contain rounded-xl shadow-md border border-slate-200"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. Modal Ticket Completo del Período (Día / Semana / Mes) */}
      {periodTicketModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl p-4 sm:p-5 max-w-md w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 animate-in zoom-in-95 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="font-black text-sm text-slate-900">
                  Ticket Período · {periodTicketModal.client.name}
                </h3>
                <p className="text-[11px] text-slate-500 font-semibold">
                  {periodTicketModal.periodLabel} · {periodTicketModal.orders.length} pedidos
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPeriodTicketModal(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200 font-mono text-xs space-y-2 overflow-y-auto flex-1">
              <div className="text-center border-b border-dashed border-slate-300 pb-2">
                <div className="font-black text-slate-900">{settings?.bakeryName || 'Panadería Santa Fé'}</div>
                <div className="text-[10.5px] text-slate-600 font-bold">
                  {periodTicketModal.client.name} · {periodTicketModal.periodLabel}
                </div>
              </div>

              <div className="divide-y divide-dashed divide-slate-200 space-y-1.5">
                {periodTicketModal.orders.map(o => (
                  <div key={o.id} className="pt-1.5 first:pt-0 space-y-0.5">
                    <div className="flex items-center justify-between font-bold text-[11px] text-slate-900">
                      <span>
                        {formatTicketDayLabel(o.date)} {isOrderPaid(o) ? '(✓)' : '(Pend)'}
                      </span>
                      <span>${formatMoney(o.totalAmount)}</span>
                    </div>
                    {Array.isArray(o.items) && o.items.length > 0 ? (
                      o.items.map(it => (
                        <div key={it.breadName} className="flex items-center justify-between gap-2 text-[10.5px] text-slate-700 pl-2">
                          <span className="truncate">
                            {it.quantity}× {it.breadName} (${it.unitPrice.toFixed(2)})
                          </span>
                          <span className="shrink-0">${formatMoney(it.total)}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-[10.5px] text-slate-600 pl-2">{o.breadType}</div>
                    )}
                  </div>
                ))}
              </div>

              <div className="border-t-2 border-dashed border-slate-300 pt-2 space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-emerald-700 font-bold">Pagado: ${formatMoney(periodTicketModal.paid)}</span>
                  <span className="text-amber-800 font-bold">Por Pagar: ${formatMoney(periodTicketModal.pending)}</span>
                </div>
                <div className="flex items-center justify-between font-black text-sm text-slate-950">
                  <span>TOTAL ({periodTicketModal.pieces} pzs)</span>
                  <span>${formatMoney(periodTicketModal.total)}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 shrink-0">
              <button
                type="button"
                onClick={() =>
                  handleCopyPeriodTicket(
                    periodTicketModal.client,
                    periodTicketModal.orders,
                    periodTicketModal.periodLabel,
                    periodTicketModal.total,
                    periodTicketModal.paid,
                    periodTicketModal.pending,
                    periodTicketModal.pieces
                  )
                }
                className="py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar</span>
              </button>
              <a
                href={`https://wa.me/${
                  periodTicketModal.client.phone ? periodTicketModal.client.phone.replace(/\D/g, '') : ''
                }?text=${encodeURIComponent(
                  buildPeriodWhatsAppText(
                    periodTicketModal.client,
                    periodTicketModal.orders,
                    periodTicketModal.periodLabel,
                    periodTicketModal.total,
                    periodTicketModal.paid,
                    periodTicketModal.pending,
                    periodTicketModal.pieces
                  )
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </a>
              <button
                type="button"
                onClick={() => window.print()}
                className="py-2 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimir</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
