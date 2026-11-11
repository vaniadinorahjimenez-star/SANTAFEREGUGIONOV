import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Minus,
  Trash2, 
  Printer, 
  CreditCard, 
  Banknote, 
  MessageCircle, 
  UserPlus, 
  Sparkles, 
  RotateCcw, 
  CheckCircle2, 
  X, 
  Phone, 
  User, 
  Gift, 
  ArrowRight, 
  Coins, 
  Star, 
  ChevronDown, 
  ChevronUp, 
  Delete, 
  Check,
  Receipt,
  Keyboard,
  Bluetooth,
  Radio,
  Calendar,
  FileText,
  Building,
  Clock,
  Send,
  ClipboardList,
  Search,
  Tag,
  Boxes,
  Calculator,
  ShoppingBag,
  Truck
} from 'lucide-react';
import { BreadProduct, TicketItem, SaleTicket, Customer, Settings, ZettleDeviceInfo, BakeryOrder, DriverCustomer, BranchId } from '../../types';
import { playBeep, playCashSound } from '../../utils/audio';
import { 
  getNextTicketFolio, 
  getNextOrderFolio, 
  getTodayString, 
  getNowTimeString, 
  DEFAULT_DRIVER_CUSTOMERS,
  loadMasterCatalog 
} from '../../utils/storage';
import { 
  REAL_BAKERY_CATALOG, 
  CatalogBreadItem, 
  getProductPriceForCustomer, 
  normalizeCustomerKey 
} from '../../data/bakeryCatalog';
import { 
  connectZettleBluetooth, 
  getZettleConnectionInfo, 
  subscribeZettleConnection 
} from '../../utils/zettleBluetooth';
import { printTicketDirectToPrinter, printOrderTicketDirectToPrinter } from '../../utils/thermalPrinter';
import { ThermalTicket } from '../ThermalTicket';
import { HeartBreadCelebration } from '../HeartBreadCelebration';
import { SmilingCheeseCubileteCelebration } from '../SmilingCheeseCubileteCelebration';
import { CashShiftCutModal } from '../ShiftCut/CashShiftCutModal';
import { ZettleBluetoothModal } from './ZettleBluetoothModal';
import { MercadoPagoPaymentModal } from './MercadoPagoPaymentModal';
import { UnpaidOrderModal } from './UnpaidOrderModal';
import { DriverDailyTicketsModal } from '../Orders/DriverDailyTicketsModal';

interface PosCounterProps {
  products: BreadProduct[];
  settings: Settings;
  customers: Customer[];
  driverCustomers?: DriverCustomer[];
  tickets?: SaleTicket[];
  branch?: BranchId;
  onSaveTicket: (ticket: SaleTicket, updatedCustomer?: Customer) => void;
  onUpdateTicket?: (ticket: SaleTicket) => void;
  onRegisterCustomer: (customer: Customer) => void;
  onSaveOrder?: (order: BakeryOrder) => void;
}

export const PosCounter: React.FC<PosCounterProps> = ({
  products,
  settings,
  customers,
  driverCustomers = [],
  tickets = [],
  branch = 'refugio',
  onSaveTicket,
  onUpdateTicket,
  onRegisterCustomer,
  onSaveOrder
}) => {
  // Terminal Mercado Pago Point & PayPal Zettle state
  const [showMercadoPagoModal, setShowMercadoPagoModal] = useState<boolean>(false);
  const [showZettleModal, setShowZettleModal] = useState<boolean>(false);
  const [activeCardFolio, setActiveCardFolio] = useState<string>('');
  const [zettleDevice, setZettleDevice] = useState<ZettleDeviceInfo | null>(getZettleConnectionInfo());
  const [isConnectingZettlePos, setIsConnectingZettlePos] = useState<boolean>(false);

  useEffect(() => {
    const unsub = subscribeZettleConnection((info) => {
      setZettleDevice(info);
    });
    return unsub;
  }, []);

  // Shift cut modal state
  const [showShiftCutModal, setShowShiftCutModal] = useState<boolean>(false);
  // Driver daily tickets modal state (Simón y Osvaldo)
  const [showDriverTicketsModal, setShowDriverTicketsModal] = useState<boolean>(false);

  // Manual Shift Switch (Turno 1 / Turno 2) - Defaults to active shift or by time (< 15:00 = turno1)
  const [activeShift, setActiveShift] = useState<'turno1' | 'turno2'>(() => {
    const saved = localStorage.getItem('santafe_active_shift');
    if (saved === 'turno1' || saved === 'turno2') return saved;
    const hour = new Date().getHours();
    return hour < 15 ? 'turno1' : 'turno2';
  });

  const handleToggleShift = (newShift: 'turno1' | 'turno2') => {
    playBeep(newShift === 'turno1' ? 600 : 750, 'sine', 0.05);
    setActiveShift(newShift);
    localStorage.setItem('santafe_active_shift', newShift);
  };
  
  // Quantity selector state: default 1
  const [selectedMultiplier, setSelectedMultiplier] = useState<number>(1);
  const [customMultiplierInput, setCustomMultiplierInput] = useState<string>('');
  
  // Touch Numpad Modal state for custom quantities
  const [showNumpadModal, setShowNumpadModal] = useState<boolean>(false);
  const [numpadValue, setNumpadValue] = useState<string>('');

  // Custom price input
  const [showCustomPriceModal, setShowCustomPriceModal] = useState<boolean>(false);
  const [customPriceVal, setCustomPriceVal] = useState<string>('');
  const [customPriceName, setCustomPriceName] = useState<string>('Pan Especial / Varios');

  // Expandable bottom customer loyalty section
  const [showLoyaltySection, setShowLoyaltySection] = useState<boolean>(false);
  // Ticket lines
  const [ticketItems, setTicketItems] = useState<TicketItem[]>([]);
  
  // Customer & Loyalty (Solo teléfono, sin nombre)
  const [phoneSearch, setPhoneSearch] = useState<string>('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState<boolean>(false);
  const [pointsToRedeem, setPointsToRedeem] = useState<number>(0);
  const [showCustomerPhoneKeyboardModal, setShowCustomerPhoneKeyboardModal] = useState<boolean>(false);
  const [virtualPhoneInput, setVirtualPhoneInput] = useState<string>('');

  // Completed Ticket Modal state (optional fallback)
  const [completedTicket, setCompletedTicket] = useState<SaleTicket | null>(null);
  const [autoPrintTicket, setAutoPrintTicket] = useState<boolean>(false);

  // Direct Thermal Printing state (Mandar directo a impresión sin abrir ventana secundaria)
  const [directPrintTicket, setDirectPrintTicket] = useState<SaleTicket | null>(null);
  const [printToastNotice, setPrintToastNotice] = useState<string>('');

  // Evitar doble cobro o doble impresión de ticket con terminal de tarjeta
  const isProcessingCardCheckoutRef = useRef<boolean>(false);
  const lastProcessedCardKeyRef = useRef<string>('');
  const lastProcessedCardTimeRef = useRef<number>(0);

  // Pedido para Recoger en Tienda (Botón Morado) state
  const [showOrderModal, setShowOrderModal] = useState<boolean>(false);
  const [orderCustomerName, setOrderCustomerName] = useState<string>('');
  const [orderCustomerPhone, setOrderCustomerPhone] = useState<string>('');
  const [orderDeliveryDate, setOrderDeliveryDate] = useState<string>(getTodayString());
  const [orderDeliveryTime, setOrderDeliveryTime] = useState<string>(getNowTimeString());
  const [orderPaymentMode, setOrderPaymentMode] = useState<'pagado' | 'pendiente'>('pendiente');
  const [orderNotes, setOrderNotes] = useState<string>('');
  const [createdOrder, setCreatedOrder] = useState<BakeryOrder | null>(null);
  const [showCubileteCelebration, setShowCubileteCelebration] = useState<BakeryOrder | null>(null);

  // Pedido Sin Cobrar en Mostrador (Envío directo a Encargos y Pedidos)
  const [showUnpaidOrderModal, setShowUnpaidOrderModal] = useState<boolean>(false);

  // Pide y Recoge Modal Bread Catalog & Custom Item State
  const [orderModalItems, setOrderModalItems] = useState<TicketItem[]>([]);
  const [catalogItemSearch, setCatalogItemSearch] = useState<string>('');
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState<boolean>(false);
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<CatalogBreadItem | null>(null);
  const [orderItemNameInput, setOrderItemNameInput] = useState<string>('');
  const [orderItemQtyInput, setOrderItemQtyInput] = useState<number>(10);
  const [orderItemPriceInput, setOrderItemPriceInput] = useState<string>('8.00');
  const [orderItemUnit, setOrderItemUnit] = useState<string>('PZ');
  const [orderItemType, setOrderItemType] = useState<string>('Normal');
  
  // Virtual Touch Price Keypad state for Pide y Recoge Modal
  const [showOrderVirtualKeypad, setShowOrderVirtualKeypad] = useState<boolean>(false);
  const [virtualKeypadMode, setVirtualKeypadMode] = useState<'new_price' | 'edit_item_price' | 'new_qty' | 'edit_item_qty'>('new_price');
  const [virtualKeypadEditingIndex, setVirtualKeypadEditingIndex] = useState<number | null>(null);
  const [virtualKeypadValue, setVirtualKeypadValue] = useState<string>('8.00');

  // Load Master Dynamic Catalog
  const activeMasterCatalog = React.useMemo(() => {
    return loadMasterCatalog();
  }, [showOrderModal]);

  // Customer rate info for Pide y Recoge modal
  const orderCustomerRateInfo = React.useMemo(() => {
    return normalizeCustomerKey(orderCustomerName);
  }, [orderCustomerName]);

  // Filtered Catalog suggestions for Autocomplete (matches initials e.g. "te" -> "Telera", "bol" -> "Bolillo")
  const catalogSuggestions = React.useMemo(() => {
    const query = catalogItemSearch.trim().toLowerCase();
    if (!query) return [];
    return activeMasterCatalog
      .filter(item => {
        const nameLower = item.name.toLowerCase();
        const queryClean = query.toLowerCase();
        const startsWithMatch = nameLower.startsWith(queryClean);
        const wordMatch = nameLower.split(' ').some(w => w.startsWith(queryClean));
        const containsMatch = nameLower.includes(queryClean);
        const numMatch = item.num.toString() === queryClean;
        return startsWithMatch || wordMatch || containsMatch || numMatch;
      })
      .slice(0, 12);
  }, [catalogItemSearch, activeMasterCatalog]);

  // 5 Top Requested Breads in Pide y Recoge with Customer Dynamic Pricing
  const top5PickupBreads = React.useMemo(() => {
    const list = [
      { key: 'telera', label: 'Telera', emoji: '🥖', fallbackNum: 1 },
      { key: 'bolillo', label: 'Bolillo', emoji: '🥖', fallbackNum: 3 },
      { key: 'concha', label: 'Concha', emoji: '🍩', fallbackNum: 16 },
      { key: 'cuerno', label: 'Cuerno', emoji: '🥐', fallbackNum: 31 },
      { key: 'bisquet', label: 'Bisquet', emoji: '🥯', fallbackNum: 39 }
    ];

    return list.map(b => {
      const found = activeMasterCatalog.find(p => 
        p.name.toLowerCase().includes(b.key) || p.num === b.fallbackNum
      ) || activeMasterCatalog.find(p => p.num === b.fallbackNum);
      const calculatedPrice = found 
        ? getProductPriceForCustomer(found, orderCustomerName, 'recoger_tienda') 
        : 6.5;
      return {
        ...b,
        product: found,
        resolvedPrice: calculatedPrice
      };
    });
  }, [activeMasterCatalog, orderCustomerName]);

  // Totals for Pide y Recoge Modal
  const orderModalSubtotal = orderModalItems.reduce((acc, it) => acc + it.total, 0);
  const orderModalPieces = orderModalItems.reduce((acc, it) => acc + it.quantity, 0);

  // Heart Bread Celebration Popup state (Cobro sin ticket y con ticket)
  const [celebrationData, setCelebrationData] = useState<{
    total: number;
    folio: string;
    piecesCount: number;
    customerName?: string;
    paymentMethod?: 'efectivo' | 'tarjeta';
  } | null>(null);

  // Descuento 10% Cliente Especial (Sucursal Zakia)
  const [isSpecialCustomerDiscount, setIsSpecialCustomerDiscount] = useState<boolean>(false);

  // Cashier / Person on register presets per branch
  const isZakia = branch === 'zakia';
  const activeBranchId: BranchId = isZakia ? 'zakia' : 'refugio';
  const cashierPresets = isZakia
    ? ['Ama', 'Mireya', 'Maggie', 'Gabo', 'Angie']
    : ['Mary', 'Paty', 'Jaz', 'Natty', 'Jonathan'];

  const cashierStorageKey = isZakia ? 'santafe_last_cashier_zakia' : 'santafe_last_cashier_refugio';
  const defaultCashier = isZakia ? 'Ama' : 'Mary';

  const [activeCashier, setActiveCashier] = useState<string>(() => {
    const saved = localStorage.getItem(cashierStorageKey);
    if (saved && cashierPresets.includes(saved)) return saved;
    return defaultCashier;
  });

  useEffect(() => {
    const saved = localStorage.getItem(cashierStorageKey);
    if (saved && cashierPresets.includes(saved)) {
      setActiveCashier(saved);
    } else {
      setActiveCashier(defaultCashier);
    }
  }, [branch]);

  const handleSelectCashier = (name: string) => {
    setActiveCashier(name);
    localStorage.setItem(cashierStorageKey, name);
    playBeep(600, 'sine', 0.04);
  };

  // Cash Change Calculator state for the ticket panel
  const [cashGivenInput, setCashGivenInput] = useState<string>('');
  const [showCashNumpad, setShowCashNumpad] = useState<boolean>(false);

  // Registro en tiempo real inmediato de tickets cobrados en este mostrador
  const [recentlyCreatedTickets, setRecentlyCreatedTickets] = useState<SaleTicket[]>([]);

  // Quick bill denominations for change calculation (Mexican Banknotes)
  const quickBills = [
    { value: 50, label: '$50', bg: 'bg-pink-50 hover:bg-pink-100 text-pink-900 border-pink-300', active: 'bg-pink-600 text-white border-pink-700 ring-2 ring-pink-400 font-black shadow-sm' },
    { value: 100, label: '$100', bg: 'bg-rose-50 hover:bg-rose-100 text-rose-900 border-rose-300', active: 'bg-rose-600 text-white border-rose-700 ring-2 ring-rose-400 font-black shadow-sm' },
    { value: 200, label: '$200', bg: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-300', active: 'bg-emerald-600 text-white border-emerald-700 ring-2 ring-emerald-400 font-black shadow-sm' },
    { value: 500, label: '$500', bg: 'bg-blue-50 hover:bg-blue-100 text-blue-900 border-blue-300', active: 'bg-blue-600 text-white border-blue-700 ring-2 ring-blue-400 font-black shadow-sm' },
    { value: 1000, label: '$1,000', bg: 'bg-purple-50 hover:bg-purple-100 text-purple-900 border-purple-300', active: 'bg-purple-600 text-white border-purple-700 ring-2 ring-purple-400 font-black shadow-sm' }
  ];

  // Postres selection modal
  const [showPostresModal, setShowPostresModal] = useState<boolean>(false);

  // Leche selection modal (Lechita $18 o Leche Grande $35)
  const [showLecheModal, setShowLecheModal] = useState<boolean>(false);

  // Chocolate Abuelita modal (Tableta $60 o Caja $180)
  const [showChocolateModal, setShowChocolateModal] = useState<boolean>(false);

  // Complementos selection modal (Café $130, Miel $170, Nata $90, Cajeta $130)
  const [showComplementosModal, setShowComplementosModal] = useState<boolean>(false);

  // Paletas selection modal (1 a 5 piezas y precios $40, $45, $50)
  const [showPaletasModal, setShowPaletasModal] = useState<boolean>(false);
  const [paletasQty, setPaletasQty] = useState<number>(1);

  // Apartado Precios Especiales de Clientes Especiales (desplegable hacia abajo)
  const [showSpecialPrices, setShowSpecialPrices] = useState<boolean>(false);
  // Precios especiales en orden: 4, 6, 6.50, 7, 9, 10, 11, 12, 13, 16, 18
  const specialClientPrices = [4, 6, 6.5, 7, 9, 10, 11, 12, 13, 16, 18];

  // Precios rápidos de mostrador solicitados: 5, 6.50, 8 (Dona Mini), 12, 15, 18, 20, 25, 30, 35
  const basePrices = (settings.quickPrices && settings.quickPrices.length > 0
    ? settings.quickPrices
    : [5, 6.5, 8, 12, 15, 18, 20, 25, 30, 35]
  )
    .map(p => Number(p))
    .filter(num => !isNaN(num) && num > 0 && !(num >= 90 && num <= 100));

  // Asegurar que $8 (Dona Mini) siempre esté presente y ordenado
  const quickPrices = basePrices.includes(8)
    ? [...basePrices].sort((a, b) => a - b)
    : [...basePrices, 8].sort((a, b) => a - b);

  // Helper formatting for prices
  const formatMoneyLabel = (num: number) => {
    if (num % 1 !== 0) {
      return `$${num.toFixed(2)}`;
    }
    return `$${num}`;
  };

  // Companion & Dairy items (Acompañamientos, Lácteos y Charolas)
  const companionItems = [
    {
      id: 'p_leche',
      name: 'Leche',
      title: 'LECHE',
      price: 35,
      emoji: '🥛',
      tag: 'No es Pan',
      description: 'Lechita $18 / Leche Grande $35'
    },
    {
      id: 'p_choco_abuelita',
      name: 'Chocolate Abuelita',
      title: 'CHOCOLATE',
      price: 30,
      emoji: '🍫',
      tag: 'No es Pan',
      description: 'Tabletilla $30 / Tableta $60 / Caja $180'
    },
    {
      id: 'p_complementos',
      name: 'Complementos',
      title: 'COMPLEMENTOS',
      price: 90,
      emoji: '🍯',
      tag: 'No es Pan',
      description: 'Café $130 / Miel $170 / Nata $90 / Cajeta $130'
    },
    {
      id: 'p_cafe_130',
      name: 'Café $130',
      title: 'CAFÉ 130',
      price: 130,
      emoji: '☕',
      tag: 'No es Pan',
      description: 'Café Artesanal $130'
    },
    {
      id: 'p_miel_170',
      name: 'Miel $170',
      title: 'MIEL 170',
      price: 170,
      emoji: '🍯',
      tag: 'No es Pan',
      description: 'Miel Pura $170'
    },
    {
      id: 'p_nata',
      name: 'Nata $90',
      title: 'NATA 90',
      price: 90,
      emoji: '🍶',
      tag: 'No es Pan',
      description: 'Nata Artesanal $90'
    },
    {
      id: 'p_cajeta_130',
      name: 'Cajeta $130',
      title: 'CAJETA 130',
      price: 130,
      emoji: '🍮',
      tag: 'No es Pan',
      description: 'Cajeta Tradicional $130'
    },
    {
      id: 'p_rosca_50',
      name: 'Rosca $50',
      title: 'ROSCA 50',
      price: 50,
      emoji: '🥮',
      tag: 'Pan',
      description: 'Rosca Tradicional $50'
    },
    {
      id: 'p_queso',
      name: 'Queso $150',
      title: 'QUESO 150',
      price: 150,
      emoji: '🧀',
      tag: 'No es Pan',
      description: 'Queso Rancho'
    },
    {
      id: 'p_granola_160',
      name: 'Granola $160',
      title: 'GRANOLA 160',
      price: 160,
      emoji: '🥣',
      tag: 'No es Pan',
      description: 'Granola Artesanal'
    },
    {
      id: 'p_paletas',
      name: 'Paletas de Hielo',
      title: 'PALETAS',
      price: 40,
      emoji: '🍧',
      tag: 'No es Pan',
      description: 'Paletas de Hielo $40, $45, $50'
    },
    {
      id: 'p_domo_25',
      name: 'Charola / Domo $25',
      title: 'CHAROLA 25',
      price: 25,
      emoji: '🍱',
      tag: 'Charola',
      description: 'Charola Domo'
    },
    {
      id: 'p_pastel_65',
      name: 'Pastel $65',
      title: 'PASTEL 65',
      price: 65,
      emoji: '🎂',
      tag: 'Postre',
      description: 'Pastel $65'
    },
    {
      id: 'p_pastel_35',
      name: 'Pastel $35',
      title: 'PASTEL 35',
      price: 35,
      emoji: '🍰',
      tag: 'Postre',
      description: 'Pastel $35'
    },
    {
      id: 'p_galletas_65',
      name: 'Galletas $65',
      title: 'GALLETAS 65',
      price: 65,
      emoji: '🍪',
      tag: 'Postre',
      description: 'Galletas $65'
    },
    {
      id: 'p_gelatina_20',
      name: 'Gelatina $20',
      title: 'GELATINA 20',
      price: 20,
      emoji: '🍮',
      tag: 'Postre',
      description: 'Gelatina'
    },
    {
      id: 'p_arroz_leche_25',
      name: 'Arroz con Leche $25',
      title: 'ARROZ LECHE 25',
      price: 25,
      emoji: '🍚',
      tag: 'Postre',
      description: 'Arroz c/ Leche'
    }
  ];

  // Auto look up customer when phone number reaches 10 digits
  useEffect(() => {
    const clean = phoneSearch.replace(/\D/g, '');
    if (clean.length === 10) {
      const found = customers.find(c => c.phone.replace(/\D/g, '') === clean);
      if (found) {
        setSelectedCustomer(found);
        setShowNewCustomerForm(false);
        playBeep(800, 'sine', 0.05);
      } else {
        setSelectedCustomer(null);
        setShowNewCustomerForm(true);
      }
    } else if (clean.length === 0) {
      setSelectedCustomer(null);
      setShowNewCustomerForm(false);
      setPointsToRedeem(0);
    }
  }, [phoneSearch, customers]);

  // Calculations
  const subtotal = ticketItems.reduce((acc, item) => acc + item.total, 0);
  const totalPieces = ticketItems.reduce((acc, item) => acc + item.quantity, 0);

  // Descuento del 10% para Clientes Especiales (Sucursal Zakia)
  const specialCustomerDiscount = isSpecialCustomerDiscount
    ? Number((subtotal * 0.10).toFixed(2))
    : 0;

  const subtotalAfterSpecial = Math.max(0, subtotal - specialCustomerDiscount);
  const maxRedeemablePoints = selectedCustomer ? Math.min(selectedCustomer.points, subtotalAfterSpecial) : 0;
  const actualDiscount = Math.min(pointsToRedeem, maxRedeemablePoints);
  const totalDiscount = Number((specialCustomerDiscount + actualDiscount).toFixed(2));
  const total = Math.max(0, Number((subtotal - totalDiscount).toFixed(2)));

  // Cash Change computations for the ticket area (50, 100, 200, 500, 1000)
  const numericCashGiven = parseFloat(cashGivenInput) || 0;
  const calculatedPosChange = numericCashGiven >= total ? numericCashGiven - total : 0;
  const cashShortage = (numericCashGiven > 0 && numericCashGiven < total) ? total - numericCashGiven : 0;

  // Función auxiliar robusta para extraer milisegundos de cualquier ticket
  const getTicketTimestampMs = (t: SaleTicket): number => {
    if (t.timestamp) {
      const ms = new Date(t.timestamp).getTime();
      if (!isNaN(ms) && ms > 0) return ms;
    }
    if (t.date) {
      const ms = new Date(`${t.date}T${t.time || '00:00:00'}`).getTime();
      if (!isNaN(ms) && ms > 0) return ms;
    }
    const match = (t.id || '').match(/\d{10,13}/);
    if (match) {
      const parsed = parseInt(match[0], 10);
      if (parsed > 1000000000) return parsed;
    }
    return 0;
  };

  // Filtrar estrictamente solo los tickets de esta sucursal (Zakia vs El Refugio)
  const branchTickets = React.useMemo(() => {
    return (tickets || []).filter(t => (t.branch || 'refugio') === activeBranchId);
  }, [tickets, activeBranchId]);

  // Limpiar tickets creados recientemente al cambiar de sucursal
  useEffect(() => {
    setRecentlyCreatedTickets(prev => prev.filter(t => (t.branch || 'refugio') === activeBranchId));
  }, [activeBranchId]);

  // Últimos 3 cobros registrados en TIEMPO REAL para verificación inmediata del personal de mostrador
  // Filtrado estrictamente por sucursal (Zakia NUNCA muestra cobros de El Refugio)
  const recent3Tickets = React.useMemo(() => {
    const map = new Map<string, SaleTicket>();

    // 1. Incorporar los tickets cobrados al instante en esta sesión de esta sucursal
    for (const t of recentlyCreatedTickets) {
      if (t && (t.id || t.folio) && (t.branch || 'refugio') === activeBranchId) {
        map.set(t.id || t.folio, t);
      }
    }

    // 2. Incorporar los tickets provistos por almacenamiento general de esta sucursal
    for (const t of branchTickets) {
      if (t && (t.id || t.folio)) {
        const key = t.id || t.folio;
        if (!map.has(key)) {
          map.set(key, t);
        }
      }
    }

    return Array.from(map.values())
      .sort((a, b) => {
        const timeA = getTicketTimestampMs(a);
        const timeB = getTicketTimestampMs(b);
        if (timeA !== timeB) return timeB - timeA;
        return (b.folio || b.id || '').localeCompare(a.folio || a.id || '');
      })
      .slice(0, 3);
  }, [recentlyCreatedTickets, branchTickets, activeBranchId]);

  // Points that will be earned in this purchase ($20 pesos = 1 point)
  const pointsEarned = Math.floor(total / (settings.loyaltyPointsPerPesos || 20));

  // Evitar doble registro en pantallas táctiles por disparos combinados (pointerdown + click)
  const lastPricePointerTimeRef = useRef<number>(0);

  const triggerAddPriceTouch = (price: number, name?: string, productId?: string) => {
    const now = Date.now();
    if (now - lastPricePointerTimeRef.current < 200) {
      return;
    }
    lastPricePointerTimeRef.current = now;
    handleAddPrice(price, name, productId);
  };

  const handlePointerDownPrice = (
    e: React.PointerEvent,
    price: number,
    name?: string,
    productId?: string
  ) => {
    // Si es mouse tradicional, responder únicamente al botón izquierdo (0)
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    triggerAddPriceTouch(price, name, productId);
  };

  const lastMultiplierPointerTimeRef = useRef<number>(0);
  const handlePointerDownMultiplier = (e: React.PointerEvent, num: number) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const now = Date.now();
    if (now - lastMultiplierPointerTimeRef.current < 200) return;
    lastMultiplierPointerTimeRef.current = now;
    playBeep(500 + num * 30, 'sine', 0.04);
    setSelectedMultiplier(num);
    setCustomMultiplierInput('');
  };

  // Add item with current multiplier
  const handleAddPrice = (price: number, name?: string, productId?: string) => {
    playBeep(700, 'sine', 0.06);
    const qty = selectedMultiplier > 0 ? selectedMultiplier : 1;
    const itemName = name || (
      price === 8 ? 'Dona Mini $8' :
      price === 5 ? 'Bolillo / Pan $5' :
      price === 6.5 ? 'Pan Especial $6.50' :
      price === 10 ? 'Pan Dulce Tradicional ($10)' :
      price === 12 ? 'Dona / Especial ($12)' :
      price === 15 ? 'Concha / Especial ($15)' :
      price === 18 ? 'Cuerno Mantequilla ($18)' :
      price === 20 ? 'Oreja / Empanada ($20)' :
      price === 25 ? 'Panqué Nuez/Elote ($25)' :
      price === 30 ? 'Pan Especial ($30)' :
      price === 35 ? 'Baguette Rústica ($35)' :
      price === 90 ? 'Rosca Mediana ($90)' :
      price === 100 ? 'Pastel / Tarta ($100)' :
      price === 150 ? 'Pastel Grande 3 Leches ($150)' :
      `Pan de $${price}`
    );

    setTicketItems(prev => {
      // If same price already exists as the last entry or with same name, merge it or append
      const existingIdx = prev.findIndex(item => item.price === price && item.name === itemName);
      if (existingIdx >= 0) {
        const updated = [...prev];
        const current = updated[existingIdx];
        const newQty = current.quantity + qty;
        updated[existingIdx] = {
          ...current,
          quantity: newQty,
          total: newQty * current.price
        };
        return updated;
      } else {
        return [
          ...prev,
          {
            id: `item-${Date.now()}-${Math.random()}`,
            productId,
            name: itemName,
            price: price,
            quantity: qty,
            total: qty * price
          }
        ];
      }
    });

    // Reset multiplier to 1 for next pick
    setSelectedMultiplier(1);
    setCustomMultiplierInput('');
  };

  const handleCustomMultiplierKeypad = (key: string) => {
    playBeep(750, 'sine', 0.03);
    if (key === 'C') {
      setNumpadValue('');
      return;
    }
    if (key === 'BACKSPACE') {
      setNumpadValue(prev => prev.slice(0, -1));
      return;
    }
    if (key.startsWith('+')) {
      const delta = parseInt(key.replace('+', ''), 10) || 0;
      const current = parseInt(numpadValue, 10) || 0;
      const next = current + delta;
      setNumpadValue(next.toString());
      return;
    }
    // Standard digits 0-9
    if (numpadValue === '0') {
      setNumpadValue(key);
    } else if (numpadValue.length < 4) {
      setNumpadValue(prev => prev + key);
    }
  };

  const handleConfirmCustomMultiplierSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const qty = parseInt(numpadValue, 10);
    if (!isNaN(qty) && qty > 0) {
      playBeep(650, 'sine', 0.04);
      setSelectedMultiplier(qty);
      setCustomMultiplierInput(qty.toString());
      setShowNumpadModal(false);
      setNumpadValue('');
    }
  };

  const handleCustomPriceKeypad = (key: string) => {
    playBeep(750, 'sine', 0.03);
    if (key === 'C') {
      setCustomPriceVal('');
      return;
    }
    if (key === 'BACKSPACE') {
      setCustomPriceVal(prev => prev.slice(0, -1));
      return;
    }
    if (key === '.') {
      if (!customPriceVal) {
        setCustomPriceVal('0.');
      } else if (!customPriceVal.includes('.')) {
        setCustomPriceVal(prev => prev + '.');
      }
      return;
    }
    if (key === '00') {
      if (!customPriceVal || customPriceVal === '0') return;
      if (customPriceVal.length >= 7) return;
      setCustomPriceVal(prev => prev + '00');
      return;
    }
    if (key.startsWith('+')) {
      const delta = parseFloat(key.replace('+', '')) || 0;
      const current = parseFloat(customPriceVal) || 0;
      setCustomPriceVal((current + delta).toString());
      return;
    }
    // Standard digits 0-9
    if (customPriceVal === '0') {
      setCustomPriceVal(key);
    } else if (customPriceVal.length < 7) {
      setCustomPriceVal(prev => prev + key);
    }
  };

  const handleAddCustomPriceSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const p = parseFloat(customPriceVal);
    if (!isNaN(p) && p > 0) {
      handleAddPrice(p, customPriceName.trim() || `Pan Especial $${p}`);
      setShowCustomPriceModal(false);
      setCustomPriceVal('');
      setCustomPriceName('Pan Especial');
    }
  };

  const handleUpdateQuantity = (index: number, delta: number) => {
    playBeep(600, 'sine', 0.04);
    setTicketItems(prev => {
      const updated = [...prev];
      const item = updated[index];
      const newQty = item.quantity + delta;
      if (newQty <= 0) {
        return updated.filter((_, idx) => idx !== index);
      }
      updated[index] = {
        ...item,
        quantity: newQty,
        total: newQty * item.price
      };
      return updated;
    });
  };

  const handleRemoveItem = (index: number) => {
    playBeep(400, 'sawtooth', 0.06);
    setTicketItems(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleClearTicket = () => {
    if (ticketItems.length === 0) return;
    playBeep(350, 'sawtooth', 0.08);
    setTicketItems([]);
    setPointsToRedeem(0);
    setIsSpecialCustomerDiscount(false);
    setCashGivenInput('');
  };

  // Manejo de pulsación en el Teclado Táctil de Teléfono
  const handleVirtualPhoneKeyPress = (key: string) => {
    playBeep(700, 'sine', 0.04);
    if (key === 'CLEAR') {
      setVirtualPhoneInput('');
      setPhoneSearch('');
      setSelectedCustomer(null);
      return;
    }
    if (key === 'BACKSPACE') {
      setVirtualPhoneInput(prev => {
        const next = prev.slice(0, -1);
        setPhoneSearch(next);
        return next;
      });
      return;
    }
    // Dígitos 0-9 (máximo 10 dígitos)
    setVirtualPhoneInput(prev => {
      const clean = prev.replace(/\D/g, '');
      if (clean.length >= 10) return prev;
      const next = clean + key;
      setPhoneSearch(next);
      return next;
    });
  };

  // Afiliar o seleccionar cliente por teléfono inmediatamente (sin pedir nombre)
  const handleRegisterOrSelectPhone = (targetPhone?: string) => {
    const raw = targetPhone || virtualPhoneInput || phoneSearch;
    const clean = raw.replace(/\D/g, '');
    if (clean.length < 7) {
      playBeep(350, 'sawtooth', 0.08);
      return;
    }

    // Verificar si ya existe registrado
    const existing = customers.find(c => c.phone.replace(/\D/g, '') === clean);
    if (existing) {
      setSelectedCustomer(existing);
      setPhoneSearch(existing.phone);
      setShowNewCustomerForm(false);
      setShowCustomerPhoneKeyboardModal(false);
      playCashSound();
      return;
    }

    // Crear y afiliar nuevo cliente solo con su número telefónico
    const newCust: Customer = {
      id: `cust-${Date.now()}`,
      name: `Tel: ${clean}`,
      phone: clean,
      points: 0,
      totalSpent: 0,
      visitsCount: 0,
      lastVisit: getTodayString()
    };
    onRegisterCustomer(newCust);
    setSelectedCustomer(newCust);
    setPhoneSearch(clean);
    setShowNewCustomerForm(false);
    setShowCustomerPhoneKeyboardModal(false);
    playCashSound();
  };

  // Register new customer quickly (solo teléfono)
  const handleCreateCustomer = () => {
    handleRegisterOrSelectPhone(phoneSearch);
  };

  // Process & Complete Sale with Direct Print (Sin abrir ventana secundaria)
  const handleCompleteSale = () => {
    if (ticketItems.length === 0) return;

    playCashSound();

    const folio = getNextTicketFolio(branchTickets, activeBranchId);
    const effectivePaid = numericCashGiven > 0 ? numericCashGiven : total;
    const effectiveChange = effectivePaid >= total ? effectivePaid - total : 0;
    const cleanPhone = selectedCustomer ? selectedCustomer.phone : phoneSearch.replace(/\D/g, '');
    const custIdentifier = cleanPhone ? `Tel: ${cleanPhone}` : undefined;

    const newTicket: SaleTicket = {
      id: `sale-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      folio,
      timestamp: new Date().toISOString(),
      date: getTodayString(),
      time: getNowTimeString(true),
      items: [...ticketItems],
      subtotal,
      discount: totalDiscount,
      total,
      paymentMethod: 'efectivo',
      amountPaid: effectivePaid,
      change: effectiveChange,
      customerName: custIdentifier,
      customerPhone: cleanPhone || undefined,
      pointsEarned,
      pointsRedeemed: actualDiscount,
      isSpecialDiscount: isSpecialCustomerDiscount,
      specialDiscount: specialCustomerDiscount,
      cashier: activeCashier,
      shift: activeShift,
      branch: activeBranchId
    };

    let updatedCust: Customer | undefined;
    if (selectedCustomer) {
      updatedCust = {
        ...selectedCustomer,
        points: selectedCustomer.points - actualDiscount + pointsEarned,
        totalSpent: selectedCustomer.totalSpent + total,
        visitsCount: selectedCustomer.visitsCount + 1,
        lastVisit: getTodayString()
      };
    } else if (cleanPhone.length >= 7) {
      updatedCust = {
        id: `cust-${Date.now()}`,
        name: `Tel: ${cleanPhone}`,
        phone: cleanPhone,
        points: pointsEarned,
        totalSpent: total,
        visitsCount: 1,
        lastVisit: getTodayString()
      };
    }

    onSaveTicket(newTicket, updatedCust);
    // Registrar de inmediato en la lista reactiva de últimos 2 cobros en vivo (solo de esta sucursal)
    setRecentlyCreatedTickets(prev => [newTicket, ...prev.filter(t => t.id !== newTicket.id && (t.branch || 'refugio') === activeBranchId)]);

    // Mostrar siempre la donita sonriente para confirmar la operación
    setCelebrationData({
      total,
      folio,
      piecesCount: totalPieces,
      customerName: custIdentifier,
      paymentMethod: 'efectivo'
    });

    // Mandar DIRECTO a impresión térmica sin ventana secundaria
    setDirectPrintTicket(newTicket);
    setPrintToastNotice(`🖨️ Imprimiendo Ticket #${folio} ($${total}.00)...`);
    setTimeout(() => {
      setPrintToastNotice('');
    }, 3500);

    // Ejecutar impresión directa térmica aislada
    printTicketDirectToPrinter(newTicket, settings);

    // Reset local counter state for next customer
    setTicketItems([]);
    setPointsToRedeem(0);
    setIsSpecialCustomerDiscount(false);
    setCashGivenInput('');
    setPhoneSearch('');
    setSelectedCustomer(null);
    setVirtualPhoneInput('');
    setShowNewCustomerForm(false);
  };

  // Process & Complete Sale WITHOUT Ticket (Triggers celebratory smiling donut animation)
  const handleQuickCheckoutWithoutTicket = () => {
    if (ticketItems.length === 0) return;

    playCashSound();

    const folio = getNextTicketFolio(branchTickets, activeBranchId);
    const currentTotal = total;
    const currentPieces = totalPieces;
    const cleanPhone = selectedCustomer ? selectedCustomer.phone : phoneSearch.replace(/\D/g, '');
    const custIdentifier = cleanPhone ? `Tel: ${cleanPhone}` : undefined;
    const effectivePaid = numericCashGiven > 0 ? numericCashGiven : currentTotal;
    const effectiveChange = effectivePaid >= currentTotal ? effectivePaid - currentTotal : 0;

    const newTicket: SaleTicket = {
      id: `sale-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      folio,
      timestamp: new Date().toISOString(),
      date: getTodayString(),
      time: getNowTimeString(true),
      items: ticketItems,
      subtotal,
      discount: totalDiscount,
      total: currentTotal,
      paymentMethod: 'efectivo',
      amountPaid: effectivePaid,
      change: effectiveChange,
      customerName: custIdentifier,
      customerPhone: cleanPhone || undefined,
      pointsEarned,
      pointsRedeemed: actualDiscount,
      isSpecialDiscount: isSpecialCustomerDiscount,
      specialDiscount: specialCustomerDiscount,
      cashier: activeCashier,
      shift: activeShift,
      branch: activeBranchId
    };

    let updatedCust: Customer | undefined;
    if (selectedCustomer) {
      updatedCust = {
        ...selectedCustomer,
        points: selectedCustomer.points - actualDiscount + pointsEarned,
        totalSpent: selectedCustomer.totalSpent + currentTotal,
        visitsCount: selectedCustomer.visitsCount + 1,
        lastVisit: getTodayString()
      };
    } else if (cleanPhone.length >= 7) {
      updatedCust = {
        id: `cust-${Date.now()}`,
        name: `Tel: ${cleanPhone}`,
        phone: cleanPhone,
        points: pointsEarned,
        totalSpent: currentTotal,
        visitsCount: 1,
        lastVisit: getTodayString()
      };
    }

    onSaveTicket(newTicket, updatedCust);
    // Registrar de inmediato en la lista reactiva de últimos 2 cobros en vivo (solo de esta sucursal)
    setRecentlyCreatedTickets(prev => [newTicket, ...prev.filter(t => t.id !== newTicket.id && (t.branch || 'refugio') === activeBranchId)]);

    // Trigger Donut animation popup
    setCelebrationData({
      total: currentTotal,
      folio,
      piecesCount: currentPieces,
      customerName: custIdentifier
    });

    // Reset local counter state for next customer
    setTicketItems([]);
    setPointsToRedeem(0);
    setIsSpecialCustomerDiscount(false);
    setCashGivenInput('');
    setPhoneSearch('');
    setSelectedCustomer(null);
    setVirtualPhoneInput('');
    setShowNewCustomerForm(false);
  };

  // Process & Complete Sale with Card Terminal (Mercado Pago Point or PayPal Zettle)
  const handleCardCheckout = (cardDetails: {
    terminal: 'mercadopago' | 'zettle';
    authCode: string;
    last4?: string;
    reference?: string;
  }) => {
    if (ticketItems.length === 0) return;

    const folio = cardDetails.reference || activeCardFolio || getNextTicketFolio(branchTickets, activeBranchId);
    const checkoutKey = `${folio}-${cardDetails.authCode || 'auto'}-${total}`;
    const now = Date.now();

    // Bloqueo estricto anti-duplicado: Si ya se está procesando o se mandó el mismo cobro hace menos de 4 segundos
    if (isProcessingCardCheckoutRef.current || (lastProcessedCardKeyRef.current === checkoutKey && now - lastProcessedCardTimeRef.current < 4000)) {
      console.warn('handleCardCheckout omitido para evitar doble cobro e impresión duplicada:', checkoutKey);
      return;
    }
    isProcessingCardCheckoutRef.current = true;
    lastProcessedCardKeyRef.current = checkoutKey;
    lastProcessedCardTimeRef.current = now;

    setTimeout(() => {
      isProcessingCardCheckoutRef.current = false;
    }, 2000);

    playCashSound();
    setActiveCardFolio('');
    const cleanPhone = selectedCustomer ? selectedCustomer.phone : phoneSearch.replace(/\D/g, '');
    const custIdentifier = cleanPhone ? `Tel: ${cleanPhone}` : undefined;

    const newTicket: SaleTicket = {
      id: `sale-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      folio,
      timestamp: new Date().toISOString(),
      date: getTodayString(),
      time: getNowTimeString(true),
      items: ticketItems,
      subtotal,
      discount: totalDiscount,
      total,
      paymentMethod: 'tarjeta',
      cardTerminal: cardDetails.terminal || 'mercadopago',
      cardAuthCode: cardDetails.authCode,
      cardLast4: cardDetails.last4,
      cardReference: cardDetails.reference || folio,
      amountPaid: total,
      change: 0,
      customerName: custIdentifier,
      customerPhone: cleanPhone || undefined,
      pointsEarned,
      pointsRedeemed: actualDiscount,
      isSpecialDiscount: isSpecialCustomerDiscount,
      specialDiscount: specialCustomerDiscount,
      cashier: activeCashier,
      shift: activeShift,
      branch: activeBranchId
    };

    let updatedCust: Customer | undefined;
    if (selectedCustomer) {
      updatedCust = {
        ...selectedCustomer,
        points: selectedCustomer.points - actualDiscount + pointsEarned,
        totalSpent: selectedCustomer.totalSpent + total,
        visitsCount: selectedCustomer.visitsCount + 1,
        lastVisit: getTodayString()
      };
    } else if (cleanPhone.length >= 7) {
      updatedCust = {
        id: `cust-${Date.now()}`,
        name: `Tel: ${cleanPhone}`,
        phone: cleanPhone,
        points: pointsEarned,
        totalSpent: total,
        visitsCount: 1,
        lastVisit: getTodayString()
      };
    }

    onSaveTicket(newTicket, updatedCust);
    // Registrar de inmediato en la lista reactiva de últimos 2 cobros en vivo (solo de esta sucursal)
    setRecentlyCreatedTickets(prev => [newTicket, ...prev.filter(t => t.id !== newTicket.id && (t.branch || 'refugio') === activeBranchId)]);
    setShowZettleModal(false);

    // Mostrar donita sonriente para confirmar la operación de tarjeta
    setCelebrationData({
      total,
      folio,
      piecesCount: totalPieces,
      customerName: custIdentifier,
      paymentMethod: 'tarjeta'
    });

    // Mandar directo a impresión térmica sin abrir modal secundario
    setDirectPrintTicket(newTicket);
    setPrintToastNotice(`🖨️ Imprimiendo Ticket Tarjeta #${folio} ($${total}.00)...`);
    setTimeout(() => {
      setPrintToastNotice('');
    }, 3500);

    // Ejecutar impresión directa térmica aislada
    printTicketDirectToPrinter(newTicket, settings);

    // Reset local counter state for next customer
    setTicketItems([]);
    setPointsToRedeem(0);
    setIsSpecialCustomerDiscount(false);
    setCashGivenInput('');
    setPhoneSearch('');
    setSelectedCustomer(null);
    setVirtualPhoneInput('');
    setShowNewCustomerForm(false);
  };

  // Lista de clientes frecuentes para Pide y Recoge (Trascos, Magda, Bollos David, Deliz)
  const availablePickupCustomers = React.useMemo(() => {
    const allowed = ['trascos', 'magda', 'bollos david', 'deliz'];
    const pool = driverCustomers.length > 0 ? driverCustomers : DEFAULT_DRIVER_CUSTOMERS;
    const filtered = pool.filter(c => 
      (c.driverId === 'tienda' || c.customerType === 'recoger_tienda') &&
      allowed.includes(c.name.trim().toLowerCase())
    );
    if (filtered.length > 0) return filtered;
    return DEFAULT_DRIVER_CUSTOMERS.filter(c => c.driverId === 'tienda');
  }, [driverCustomers]);

  // Abrir modal para registrar Pedido Pide y Recoge (Botón Morado) - Permite abrirse aunque ticket esté vacío
  const handleOpenOrderModal = () => {
    playBeep(700, 'sine', 0.06);
    setCreatedOrder(null);

    // Auto-completar datos si hay cliente seleccionado en mostrador
    if (selectedCustomer) {
      setOrderCustomerName(selectedCustomer.name);
      setOrderCustomerPhone(selectedCustomer.phone);
    } else {
      const cleanP = phoneSearch.replace(/\D/g, '');
      setOrderCustomerName(cleanP ? `Tel: ${cleanP}` : '');
      setOrderCustomerPhone(cleanP);
    }

    // Inicializar la lista de productos por entregar con los items del ticket actual (o lista vacía para llenar desde 0)
    setOrderModalItems(ticketItems.length > 0 ? [...ticketItems] : []);
    setCatalogItemSearch('');
    setIsSearchDropdownOpen(false);
    setSelectedCatalogItem(null);
    setOrderItemNameInput('');
    setOrderItemQtyInput(10);
    setOrderItemPriceInput('8.00');
    setOrderItemUnit('PZ');
    setOrderItemType('Normal');
    setShowOrderVirtualKeypad(false);

    setOrderPaymentMode('pendiente');
    setOrderDeliveryDate(getTodayString());
    setOrderDeliveryTime(getNowTimeString());
    setOrderNotes('');
    setShowOrderModal(true);
  };

  // Seleccionar cliente rápido y auto-llenar su teléfono y recalcular precios
  const handleSelectOrderCustomer = (name: string, phone?: string, notes?: string) => {
    setOrderCustomerName(name);
    if (phone) {
      setOrderCustomerPhone(phone);
    }
    if (notes && !orderNotes) {
      setOrderNotes(notes);
    }
    // Si hay un pan del catálogo seleccionado, recalcular su precio para el nuevo cliente
    if (selectedCatalogItem) {
      const calculated = getProductPriceForCustomer(selectedCatalogItem, name, 'recoger_tienda');
      setOrderItemPriceInput(calculated.toFixed(2));
    }
    playBeep(650, 'sine', 0.04);
  };

  // Seleccionar pan del catálogo interactivo
  const handleSelectCatalogBread = (bread: CatalogBreadItem) => {
    playBeep(700, 'sine', 0.04);
    setSelectedCatalogItem(bread);
    setOrderItemNameInput(bread.name);
    setCatalogItemSearch(bread.name);
    setIsSearchDropdownOpen(false);
    
    // Auto-calcular tarifa negociada del cliente
    const negotiatedPrice = getProductPriceForCustomer(bread, orderCustomerName, 'recoger_tienda');
    setOrderItemPriceInput(negotiatedPrice.toFixed(2));
    setOrderItemUnit(bread.defaultUnit || 'PZ');
    setOrderItemType(bread.name.toLowerCase().includes('mini') ? 'Mini' : 'Normal');
  };

  // Seleccionar uno de los 5 panes más solicitados en Pide y Recoge (Telera, Bolillo, Concha, Cuerno, Bisquet)
  const handleSelectTop5QuickBread = (quick: { label: string; product?: CatalogBreadItem; resolvedPrice: number }) => {
    playBeep(750, 'sine', 0.04);
    if (quick.product) {
      handleSelectCatalogBread(quick.product);
    } else {
      setOrderItemNameInput(quick.label);
      setCatalogItemSearch(quick.label);
      setOrderItemPriceInput(quick.resolvedPrice.toFixed(2));
      setIsSearchDropdownOpen(false);
    }
  };

  // Agregar Producto al Pedido dentro del modal
  const handleAddProductToOrderModal = () => {
    const name = orderItemNameInput.trim() || catalogItemSearch.trim();
    if (!name) {
      playBeep(400, 'sawtooth', 0.06);
      setPrintToastNotice('⚠️ Escribe o selecciona un pan del catálogo');
      setTimeout(() => setPrintToastNotice(''), 3000);
      return;
    }

    const price = parseFloat(orderItemPriceInput) || 0;
    const qty = Math.max(1, orderItemQtyInput || 1);

    playCashSound();
    const newItem: TicketItem = {
      id: `order-item-${Date.now()}-${Math.random()}`,
      productId: selectedCatalogItem?.id || `catalog-custom-${Date.now()}`,
      name: `${name}${orderItemUnit !== 'PZ' ? ` (${orderItemUnit})` : ''}`,
      price: price,
      quantity: qty,
      total: Math.round(price * qty * 100) / 100
    };

    setOrderModalItems(prev => [...prev, newItem]);

    // Limpiar para el siguiente pan
    setCatalogItemSearch('');
    setOrderItemNameInput('');
    setSelectedCatalogItem(null);
    setOrderItemQtyInput(10);
    setIsSearchDropdownOpen(false);
  };

  // Quitar producto de la lista de entrega del pedido
  const handleRemoveOrderModalItem = (index: number) => {
    playBeep(400, 'sawtooth', 0.05);
    setOrderModalItems(prev => prev.filter((_, idx) => idx !== index));
  };

  // Modificar cantidad (+ / -) de un producto en la lista de entrega
  const handleUpdateOrderModalItemQty = (index: number, delta: number) => {
    playBeep(600, 'sine', 0.04);
    setOrderModalItems(prev => {
      const updated = [...prev];
      const it = updated[index];
      const newQty = it.quantity + delta;
      if (newQty <= 0) {
        return updated.filter((_, idx) => idx !== index);
      }
      updated[index] = {
        ...it,
        quantity: newQty,
        total: Math.round(newQty * it.price * 100) / 100
      };
      return updated;
    });
  };

  // Teclado Virtual Táctil para Precio
  const handleOpenPriceKeypadForNewItem = () => {
    playBeep(650, 'sine', 0.03);
    setVirtualKeypadMode('new_price');
    setVirtualKeypadEditingIndex(null);
    setVirtualKeypadValue(orderItemPriceInput || '8.00');
    setShowOrderVirtualKeypad(true);
  };

  const handleOpenPriceKeypadForExistingItem = (index: number) => {
    playBeep(650, 'sine', 0.03);
    setVirtualKeypadMode('edit_item_price');
    setVirtualKeypadEditingIndex(index);
    setVirtualKeypadValue(orderModalItems[index].price.toString());
    setShowOrderVirtualKeypad(true);
  };

  const handleVirtualKeypadInput = (key: string) => {
    playBeep(750, 'sine', 0.03);
    if (key === 'C') {
      setVirtualKeypadValue('');
      return;
    }
    if (key === 'BACKSPACE') {
      setVirtualKeypadValue(prev => prev.slice(0, -1));
      return;
    }
    if (key === '.') {
      if (!virtualKeypadValue) {
        setVirtualKeypadValue('0.');
      } else if (!virtualKeypadValue.includes('.')) {
        setVirtualKeypadValue(prev => prev + '.');
      }
      return;
    }
    if (key === '00') {
      if (!virtualKeypadValue || virtualKeypadValue === '0') return;
      if (virtualKeypadValue.length >= 7) return;
      setVirtualKeypadValue(prev => prev + '00');
      return;
    }
    if (key.startsWith('+')) {
      const delta = parseFloat(key.replace('+', '')) || 0;
      const current = parseFloat(virtualKeypadValue) || 0;
      const res = current + delta;
      setVirtualKeypadValue(res % 1 === 0 ? res.toString() : res.toFixed(2));
      return;
    }
    // Digits 0-9
    if (virtualKeypadValue === '0') {
      setVirtualKeypadValue(key);
    } else if (virtualKeypadValue.length < 7) {
      setVirtualKeypadValue(prev => prev + key);
    }
  };

  const handleConfirmVirtualKeypad = () => {
    const val = parseFloat(virtualKeypadValue) || 0;
    if (virtualKeypadMode === 'new_price') {
      setOrderItemPriceInput(val.toFixed(2));
    } else if (virtualKeypadMode === 'edit_item_price' && virtualKeypadEditingIndex !== null) {
      setOrderModalItems(prev => {
        const updated = [...prev];
        const it = updated[virtualKeypadEditingIndex];
        if (it) {
          updated[virtualKeypadEditingIndex] = {
            ...it,
            price: val,
            total: Math.round(val * it.quantity * 100) / 100
          };
        }
        return updated;
      });
    }
    playCashSound();
    setShowOrderVirtualKeypad(false);
  };

  // Generar Pedido Pide y Recoge
  const handleGenerateStoreOrder = () => {
    if (orderModalItems.length === 0) {
      playBeep(400, 'sawtooth', 0.08);
      setPrintToastNotice('⚠️ Por favor agrega al menos un pan en Productos por Entregar.');
      setTimeout(() => setPrintToastNotice(''), 3000);
      return;
    }

    const trimmedName = orderCustomerName.trim() || (selectedCustomer ? selectedCustomer.name : 'Cliente Pide y Recoge');
    const folio = getNextOrderFolio();
    const isPaid = orderPaymentMode === 'pagado';

    const orderItems = orderModalItems.map((item, idx) => ({
      breadId: item.productId || `pos-${Date.now()}-${idx}`,
      name: item.name,
      category: 'Pan de Mostrador',
      quantity: item.quantity,
      unitPrice: item.price,
      total: item.total,
      done: true
    }));

    const newOrder: BakeryOrder = {
      id: `ord-${Date.now()}`,
      folio,
      customerName: trimmedName,
      customerPhone: orderCustomerPhone.trim() || (selectedCustomer ? selectedCustomer.phone : ''),
      deliveryType: 'tienda',
      orderChannel: 'recoger_tienda',
      address: 'Pide y Recoge en Mostrador de Tienda',
      deliveryDate: orderDeliveryDate || getTodayString(),
      deliveryTime: orderDeliveryTime || getNowTimeString(),
      items: orderItems,
      total: orderModalSubtotal,
      deposit: isPaid ? orderModalSubtotal : 0,
      pendingAmount: isPaid ? 0 : orderModalSubtotal,
      paymentStatus: isPaid ? 'pagado' : 'pendiente',
      assignedDriverId: 'ninguno',
      deliveryStatus: 'pendiente',
      notes: orderNotes.trim() ? `[PIDE Y RECOGE - ${isPaid ? 'PAGADO' : 'POR COBRAR'}] ${orderNotes.trim()}` : `[PIDE Y RECOGE - ${isPaid ? 'PAGADO' : 'POR COBRAR'}]`,
      createdAt: new Date().toISOString(),
      origin: 'mostrador'
    };

    if (onSaveOrder) {
      onSaveOrder(newOrder);
    }

    playCashSound();
    setCreatedOrder(newOrder);
    setShowCubileteCelebration(newOrder);

    setPrintToastNotice(`✨ Pedido Pide y Recoge #${folio} ($${orderModalSubtotal}.00) generado con éxito`);
    setTimeout(() => {
      setPrintToastNotice('');
    }, 4000);
  };

  // Imprimir Ticket del Pedido Generado
  const handlePrintStoreOrderTicket = () => {
    if (!createdOrder) return;
    playCashSound();
    printOrderTicketDirectToPrinter(createdOrder, settings);
    setPrintToastNotice(`🖨️ Imprimiendo Ticket de Pedido #${createdOrder.folio}...`);
    setTimeout(() => {
      setPrintToastNotice('');
    }, 3500);
  };

  // Cerrar modal de pedido y resetear mostrador si ya se generó el pedido
  const handleCloseOrderModal = () => {
    if (createdOrder) {
      setTicketItems([]);
      setPointsToRedeem(0);
      setCashGivenInput('');
      setPhoneSearch('');
      setSelectedCustomer(null);
      setVirtualPhoneInput('');
      setShowNewCustomerForm(false);
    }
    setShowOrderModal(false);
    setCreatedOrder(null);
  };

  // Abrir Modal de Pedido Sin Cobrar en Mostrador
  const handleOpenUnpaidOrderModal = () => {
    playBeep(700, 'sine', 0.05);
    setShowUnpaidOrderModal(true);
  };

  // Confirmar y registrar Pedido Reparto con Doble Ticket y Acumulación de Puntos
  const handleConfirmUnpaidOrder = (data: {
    customerName: string;
    customerPhone: string;
    notes: string;
    shouldPrint: boolean;
  }) => {
    const trimmedName = data.customerName.trim() || 'Cliente Reparto';
    const folio = getNextOrderFolio();
    const currentTotal = total;
    const pointsEarned = Math.floor(currentTotal / (settings.loyaltyPointsPerPesos || 20));

    // Convertir partidas del mostrador a items del pedido
    const orderItems = ticketItems.length > 0 
      ? ticketItems.map((item, idx) => ({
          breadId: item.productId || `pos-reparto-${Date.now()}-${idx}`,
          name: item.name,
          category: 'Pan de Mostrador',
          quantity: item.quantity,
          unitPrice: item.price,
          total: item.total,
          done: false
        }))
      : [
          {
            breadId: `custom-reparto-${Date.now()}`,
            name: 'Pan para Reparto',
            category: 'Pan de Mostrador',
            quantity: 1,
            unitPrice: currentTotal > 0 ? currentTotal : 0,
            total: currentTotal > 0 ? currentTotal : 0,
            done: false
          }
        ];

    const targetPhone = data.customerPhone.trim() || (selectedCustomer ? selectedCustomer.phone : '');

    const newOrder: BakeryOrder = {
      id: `ord-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      folio,
      customerName: trimmedName,
      customerPhone: targetPhone,
      deliveryType: 'reparto',
      orderChannel: 'reparto',
      address: 'Ruta de Reparto (Pendiente Cobro)',
      deliveryDate: getTodayString(),
      deliveryTime: getNowTimeString(),
      items: orderItems,
      total: currentTotal,
      deposit: 0,
      pendingAmount: currentTotal,
      paymentStatus: 'pendiente',
      assignedDriverId: 'osvaldo',
      deliveryStatus: 'pendiente',
      notes: `[PEDIDO REPARTO - DOBLE TICKET]${data.notes ? ` - ${data.notes}` : ''}`,
      createdAt: new Date().toISOString(),
      origin: 'mostrador'
    };

    if (onSaveOrder) {
      onSaveOrder(newOrder);
    }

    // Acumular puntos al cliente frecuente para canjear en compras futuras
    if (pointsEarned > 0 && (targetPhone || selectedCustomer)) {
      const existingCustomer = selectedCustomer || customers.find(c => c.phone === targetPhone || c.name.toLowerCase() === trimmedName.toLowerCase());
      if (existingCustomer) {
        const updatedCustomer: Customer = {
          ...existingCustomer,
          points: (existingCustomer.points || 0) + pointsEarned,
          totalSpent: (existingCustomer.totalSpent || 0) + currentTotal,
          visitsCount: (existingCustomer.visitsCount || 0) + 1,
          lastVisit: getTodayString()
        };
        onRegisterCustomer(updatedCustomer);
      } else if (targetPhone.length >= 7) {
        const newCustomer: Customer = {
          id: `cust-${Date.now()}`,
          name: trimmedName,
          phone: targetPhone,
          points: pointsEarned,
          totalSpent: currentTotal,
          visitsCount: 1,
          lastVisit: getTodayString()
        };
        onRegisterCustomer(newCustomer);
      }
    }

    playCashSound();

    // Imprimir DOBLE TICKET automático: 1 para Repartidor + 1 para Mostrador/Caja
    if (data.shouldPrint) {
      printOrderTicketDirectToPrinter(newOrder, settings, true);
    }

    setPrintToastNotice(`🛵 Pedido Reparto #${folio} ("${trimmedName}", $${currentTotal}.00) registrado. Doble ticket impreso y +${pointsEarned} pts acumulados.`);
    setTimeout(() => {
      setPrintToastNotice('');
    }, 5000);

    // Resetear mostrador
    setTicketItems([]);
    setPointsToRedeem(0);
    setIsSpecialCustomerDiscount(false);
    setCashGivenInput('');
    setPhoneSearch('');
    setSelectedCustomer(null);
    setVirtualPhoneInput('');
    setShowNewCustomerForm(false);
    setShowUnpaidOrderModal(false);
  };

  // Direct Bluetooth Pairing shortcut from top bar or ticket area
  const handleQuickBluetoothPairing = async () => {
    setIsConnectingZettlePos(true);
    playBeep(700, 'sine', 0.05);
    try {
      const res = await connectZettleBluetooth();
      if (res.success && res.device) {
        setZettleDevice(res.device);
        playCashSound();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsConnectingZettlePos(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-2">
      {/* Toast Notificación de Impresión Directa sin ventana secundaria */}
      {printToastNotice && (
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center justify-between border-2 border-amber-400 animate-in slide-in-from-top-3 duration-200">
          <div className="flex items-center gap-2.5 font-black text-xs sm:text-sm">
            <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center animate-pulse shrink-0">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <div className="text-amber-300 font-extrabold text-[11px] uppercase tracking-wide">
                Impresión Directa Térmica
              </div>
              <div className="text-white font-bold">{printToastNotice}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPrintToastNotice('')}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Branch Indicator Header Banner */}
      <div className={`px-3 py-1.5 rounded-xl border flex flex-wrap items-center justify-between gap-2 shadow-2xs ${
        isZakia
          ? 'bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-100/70 border-emerald-300 text-emerald-950'
          : 'bg-gradient-to-r from-amber-50 via-orange-50 to-amber-100/70 border-amber-300 text-amber-950'
      }`}>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-black px-2.5 py-0.5 rounded-lg uppercase tracking-wider shadow-2xs ${
            isZakia ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
          }`}>
            {isZakia ? '🌿 Mostrador Zakia' : '🥖 Mostrador El Refugio'}
          </span>
          <span className="text-xs font-bold text-slate-700">
            Cajera(o): <strong className="text-slate-900 font-black">{activeCashier}</strong>
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-bold">
          <span className="text-slate-500">Terminal MP Point:</span>
          <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-800 font-mono text-[10px] shadow-2xs">
            {isZakia ? 'Smart N950 (Zakia)' : 'Smart N950 (Refugio)'}
          </span>
          <div className="flex items-center gap-1 pl-1">
            {cashierPresets.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => handleSelectCashier(c)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                  activeCashier === c
                    ? 'bg-slate-900 text-white'
                    : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
                }`}
                title={`Cambiar cajera a ${c}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Grid: Left side Price & Quantity controls (58%), Right side Ticket & Checkout (42%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 sm:gap-3 items-start">
        
        {/* LEFT COLUMN: Fast Multiplier + Big Preset Price Buttons & Accompaniments - EN UNA SOLA VISTA EN PANTALLA */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-2 sm:p-2.5 shadow-sm border border-[#E5E1DA] space-y-1.5">
          
          {/* BARRA SUPERIOR INTEGRADA: Turno + Multiplicador Activo */}
          <div className="flex items-center justify-between gap-2 px-1 py-0.5 bg-[#FAF8F6] rounded-xl border border-[#E5E1DA]">
            <div className="flex items-center gap-1.5">
              <span className="text-xs leading-none">{activeShift === 'turno1' ? '🌅' : '🌇'}</span>
              <span className="text-[10px] sm:text-[11px] uppercase tracking-wider text-slate-500 font-bold">Turno:</span>
              <span className={`text-[10px] sm:text-[11px] font-black px-2 py-0.2 rounded-full border ${
                activeShift === 'turno1'
                  ? 'bg-amber-100 text-amber-950 border-amber-300'
                  : 'bg-indigo-100 text-indigo-950 border-indigo-300'
              }`}>
                {activeShift === 'turno1' ? 'Turno 1 (Mañana)' : 'Turno 2 (Tarde)'}
              </span>
            </div>

            {/* Switch Buttons y Multiplicador */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5 bg-white p-0.5 rounded-lg border border-slate-200 shadow-2xs">
                <button
                  id="shift-switch-turno1-btn"
                  type="button"
                  onClick={() => handleToggleShift('turno1')}
                  className={`px-2.5 py-0.5 rounded-md font-black text-[11px] transition-all cursor-pointer ${
                    activeShift === 'turno1'
                      ? 'bg-amber-500 text-amber-950 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Activar Turno 1 (Mañana)"
                >
                  🌅 T1
                </button>

                <button
                  id="shift-switch-turno2-btn"
                  type="button"
                  onClick={() => handleToggleShift('turno2')}
                  className={`px-2.5 py-0.5 rounded-md font-black text-[11px] transition-all cursor-pointer ${
                    activeShift === 'turno2'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Activar Turno 2 (Tarde)"
                >
                  🌇 T2
                </button>
              </div>

              <span className="text-[10px] sm:text-[11px] font-bold text-[#D95D39] bg-[#FFF5F0] px-2 py-0.5 rounded-lg border border-[#E5E1DA] shrink-0">
                Pzas: <strong className="text-xs text-[#D95D39] font-mono">{selectedMultiplier}</strong> {selectedMultiplier === 1 ? 'pza' : 'pzs'}
              </span>
            </div>
          </div>

          {/* PASO 1: Multiplicador Selector Bar (1 al 10 + Teclado en 1 sola fila táctil compacta) */}
          <div>
            <div className="flex items-center justify-between mb-0.5 px-0.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D95D39] inline-block"></span>
                Paso 1: Cantidad
              </span>
              <span className="text-[10px] text-slate-400 font-bold">Toque directo para multiplicar</span>
            </div>

            {/* Quick 1 to 10 + Botón Manual / Teclado Virtual (1 fila completa, ultra responsiva) */}
            <div className="grid grid-cols-11 gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                const isSelected = selectedMultiplier === num && !customMultiplierInput;
                return (
                  <button
                    key={num}
                    id={`qty-btn-${num}`}
                    type="button"
                    onPointerDown={(e) => handlePointerDownMultiplier(e, num)}
                    onClick={() => {
                      playBeep(500 + num * 30, 'sine', 0.04);
                      setSelectedMultiplier(num);
                      setCustomMultiplierInput('');
                    }}
                    className={`touch-pos-btn select-none h-[44px] sm:h-[48px] rounded-xl font-black text-lg sm:text-xl font-mono flex flex-col items-center justify-center transition-all duration-75 active:scale-95 shadow-2xs cursor-pointer ${
                      isSelected
                        ? 'bg-[#D95D39] text-white shadow-sm ring-2 ring-[#D95D39]/40 z-10'
                        : 'bg-[#FAF8F6] hover:bg-[#FFF5F0] text-slate-950 border-2 border-[#E5E1DA] hover:border-[#D95D39]'
                    }`}
                  >
                    <span className="leading-none">{num}</span>
                    <span className={`text-[8px] sm:text-[9px] font-bold leading-none mt-0.5 ${isSelected ? 'text-white/95' : 'text-slate-500'}`}>
                      {num === 1 ? 'pza' : 'pzs'}
                    </span>
                  </button>
                );
              })}

              {/* Botón Manual / Teclado Virtual */}
              <button
                id="custom-multiplier-modal-btn"
                type="button"
                onPointerDown={(e) => {
                  if (e.pointerType === 'mouse' && e.button !== 0) return;
                  playBeep(700, 'sine', 0.04);
                  setNumpadValue(selectedMultiplier > 10 ? selectedMultiplier.toString() : '');
                  setShowNumpadModal(true);
                }}
                onClick={() => {
                  playBeep(700, 'sine', 0.04);
                  setNumpadValue(selectedMultiplier > 10 ? selectedMultiplier.toString() : '');
                  setShowNumpadModal(true);
                }}
                className={`touch-pos-btn select-none border-2 rounded-xl p-0.5 flex flex-col items-center justify-center transition-all duration-75 active:scale-95 shadow-2xs h-[44px] sm:h-[48px] cursor-pointer ${
                  selectedMultiplier > 10 || customMultiplierInput !== ''
                    ? 'bg-[#D95D39] text-white border-[#D95D39] ring-2 ring-[#D95D39]/40'
                    : 'bg-[#FFF5F0] hover:bg-[#FFEAE0] border-dashed border-[#D95D39] text-[#D95D39]'
                }`}
                title="Abrir teclado virtual para cantidad personalizada"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-tight leading-none mt-0.5">
                  {selectedMultiplier > 10 ? `${selectedMultiplier}p` : 'Otro'}
                </span>
              </button>
            </div>
          </div>

          {/* PASO 2: Precios de Pan ($5 a $35 incluyendo $8 Dona Mini, OTRO Manual, y Precios Especiales) */}
          <div className="pt-0.5 relative">
            <div className="flex items-center justify-between mb-1 px-0.5">
              <span className="text-xs sm:text-[13px] font-black uppercase tracking-wider text-amber-950 flex items-center gap-1">
                <span>🥖</span> Paso 2: Precios de Pan
              </span>
              <span className="text-[10px] font-black text-emerald-900 bg-emerald-100 border border-emerald-300 px-2 py-0.2 rounded-full font-mono">
                +{selectedMultiplier} {selectedMultiplier === 1 ? 'pieza' : 'piezas'}
              </span>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 sm:gap-2">
              {quickPrices.map((price) => {
                const prod = products.find(p => p.price === price);
                const displayPrice = price === 6.5 ? '$6.50' : `$${price}`;
                const itemNameForClick = `Pan ${displayPrice}`;
                return (
                  <button
                    key={price}
                    id={`price-btn-${price}`}
                    type="button"
                    onPointerDown={(e) => handlePointerDownPrice(e, price, itemNameForClick, prod?.id)}
                    onClick={() => triggerAddPriceTouch(price, itemNameForClick, prod?.id)}
                    className="touch-pos-btn select-none group relative bg-[#FAF8F6] hover:bg-[#FFF5F0] active:bg-[#FFEAE0] border-2 border-[#D5CFC5] hover:border-[#D95D39] active:border-[#D95D39] rounded-xl sm:rounded-2xl p-1 sm:p-1.5 flex flex-col items-center justify-center transition-all duration-75 active:scale-95 shadow-2xs hover:shadow-xs h-[74px] sm:h-[80px] lg:h-[86px] cursor-pointer"
                  >
                    <div className="absolute top-1.5 left-2">
                      <span className="bg-white text-slate-700 px-1 py-0.2 rounded text-[9px] sm:text-[10px] border border-[#E5E1DA] font-bold font-mono">
                        +{selectedMultiplier}
                      </span>
                    </div>

                    <div className={`font-black text-slate-950 group-hover:text-[#D95D39] tracking-tight leading-none font-mono mt-1 ${
                      price === 6.5 ? 'text-2xl sm:text-3xl lg:text-[34px]' : 'text-3xl sm:text-4xl lg:text-[40px]'
                    }`}>
                      {displayPrice}
                    </div>

                    {/* Live total badge preview when multiplier > 1 */}
                    {selectedMultiplier > 1 && (
                      <div className="absolute -top-2 -right-1 bg-[#D95D39] text-white text-[9px] sm:text-[10px] font-black px-1.5 py-0.2 rounded-full shadow-2xs border border-white font-mono z-10">
                        =${price === 6.5 ? (selectedMultiplier * price).toFixed(2) : selectedMultiplier * price}
                      </div>
                    )}
                  </button>
                );
              })}

              {/* Manual Custom Price Button (+ OTRO) */}
              <button
                id="custom-price-btn"
                type="button"
                onPointerDown={(e) => {
                  if (e.pointerType === 'mouse' && e.button !== 0) return;
                  setShowCustomPriceModal(true);
                }}
                onClick={() => setShowCustomPriceModal(true)}
                className="touch-pos-btn select-none bg-[#FFF5F0] hover:bg-[#FFEAE0] active:bg-[#FFDFD0] border-2 border-dashed border-[#D95D39] hover:border-[#D95D39] rounded-xl sm:rounded-2xl p-1 sm:p-1.5 flex flex-col items-center justify-center transition-all duration-75 active:scale-95 text-[#D95D39] shadow-2xs h-[74px] sm:h-[80px] lg:h-[86px] cursor-pointer col-span-1"
                title="Precio libre manual"
              >
                <Plus className="w-6 h-6 text-[#D95D39] stroke-[2.8]" />
                <span className="text-xs sm:text-sm font-black uppercase tracking-tight leading-none mt-1 text-[#D95D39]">
                  OTRO
                </span>
                <span className="text-[9px] sm:text-[10px] text-slate-700 font-bold leading-none mt-0.5">
                  Manual
                </span>
              </button>

              {/* Botón de Precios Especiales (JUNTO AL DE + OTRO) */}
              <button
                id="toggle-special-client-prices-btn"
                type="button"
                onClick={() => {
                  playBeep(750, 'sine', 0.04);
                  setShowSpecialPrices(prev => !prev);
                }}
                className={`touch-pos-btn select-none relative border-2 rounded-xl sm:rounded-2xl p-1 sm:p-1.5 flex flex-col items-center justify-center transition-all duration-75 active:scale-95 shadow-2xs h-[74px] sm:h-[80px] lg:h-[86px] cursor-pointer col-span-1 ${
                  showSpecialPrices
                    ? 'bg-amber-400 text-amber-950 border-amber-500 ring-2 ring-amber-400 shadow-md'
                    : 'bg-gradient-to-b from-amber-50 to-orange-50/80 hover:bg-amber-100 text-amber-950 border-amber-300 hover:border-amber-500'
                }`}
                title="Precios Especiales de Clientes Especiales (Desplegar hacia abajo)"
              >
                <div className="flex items-center gap-0.5">
                  <span className="text-base sm:text-lg">⭐</span>
                  <ChevronDown className={`w-4 h-4 text-amber-900 transition-transform duration-200 ${showSpecialPrices ? 'rotate-180' : ''}`} />
                </div>
                <span className="text-xs sm:text-sm font-black uppercase tracking-tight leading-none mt-1 text-amber-950">
                  ESPECIAL
                </span>
                <span className="text-[9px] sm:text-[10px] text-amber-800 font-bold leading-none mt-0.5">
                  Clientes
                </span>
              </button>
            </div>

            {/* PANEL FLOTANTE DESPLEGABLE QUE SE DESPLACE HACIA ABAJO SIN MOVER LOS ÚLTIMOS 2 TICKETS */}
            {showSpecialPrices && (
              <>
                {/* Backdrop invisible / sutil para cerrar al hacer clic afuera */}
                <div
                  className="fixed inset-0 z-20 bg-black/10 backdrop-blur-[0.5px]"
                  onClick={() => setShowSpecialPrices(false)}
                />

                <div
                  id="special-prices-dropdown-panel"
                  className="absolute top-full left-0 right-0 z-30 mt-1.5 bg-gradient-to-b from-amber-50/98 via-white to-orange-50/95 rounded-2xl border-2 border-amber-400 shadow-2xl p-2 sm:p-2.5 animate-in fade-in slide-in-from-top-2 duration-150"
                >
                  <div className="flex items-center justify-between mb-1.5 px-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base">⭐</span>
                      <span className="text-xs sm:text-[13px] font-black uppercase tracking-wide text-amber-950">
                        Precios Especiales de Clientes
                      </span>
                      <span className="text-[9px] sm:text-[10px] bg-amber-600 text-white font-black px-1.5 py-0.2 rounded-full font-mono shadow-2xs">
                        11 Precios
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full font-mono">
                        +{selectedMultiplier} {selectedMultiplier === 1 ? 'pieza' : 'piezas'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowSpecialPrices(false)}
                        className="px-2 py-0.5 bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-700 rounded-lg text-xs font-black transition-colors border border-slate-300 cursor-pointer"
                        title="Cerrar panel"
                      >
                        ✕ Cerrar
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-11 gap-1 sm:gap-1.5">
                    {specialClientPrices.map((price) => {
                      const displayPrice = price === 6.5 ? '$6.50' : `$${price}`;
                      const prod = products.find(p => p.price === price);
                      const itemName = `Pan Especial ${displayPrice}`;
                      return (
                        <button
                          key={`special-${price}`}
                          id={`special-client-price-${price}`}
                          type="button"
                          onPointerDown={(e) => handlePointerDownPrice(e, price, itemName, prod?.id)}
                          onClick={() => triggerAddPriceTouch(price, itemName, prod?.id)}
                          className="touch-pos-btn select-none group relative bg-white hover:bg-amber-100 active:bg-amber-200 border-2 border-amber-300 hover:border-amber-600 rounded-xl p-1 flex flex-col items-center justify-center transition-all duration-75 active:scale-95 shadow-2xs hover:shadow-xs h-[52px] sm:h-[58px] cursor-pointer"
                        >
                          <div className="absolute top-0.5 left-1">
                            <span className="bg-amber-100 text-amber-900 px-0.5 py-0.2 rounded text-[7.5px] sm:text-[8px] border border-amber-300 font-bold font-mono">
                              +{selectedMultiplier}
                            </span>
                          </div>
                          <div className="text-xl sm:text-2xl font-black text-amber-950 group-hover:text-amber-800 tracking-tight leading-none font-mono mt-1">
                            {displayPrice}
                          </div>
                          <span className="text-[7.5px] sm:text-[8.5px] font-black text-amber-700 leading-none uppercase tracking-tight mt-0.5">
                            Especial
                          </span>
                          {selectedMultiplier > 1 && (
                            <div className="absolute -top-1.5 -right-1 bg-amber-600 text-white text-[8.5px] sm:text-[9px] font-black px-1.5 py-0.2 rounded-full shadow-2xs border border-white font-mono z-10">
                              =${price === 6.5 ? (selectedMultiplier * price).toFixed(2) : selectedMultiplier * price}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* PASO 3: Acompañamientos, Lácteos y Postres (Compactos en 1 Sola Fila sin hacer 2 filas) */}
          <div className="pt-1 border-t border-dashed border-sky-200">
            <div className="flex items-center justify-between mb-1 px-0.5">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500 inline-block animate-pulse"></span>
                <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-sky-950">
                  Acompañamientos & Lácteos
                </span>
                <span className="text-[8px] bg-sky-100 text-sky-800 font-bold px-1.5 py-0.2 rounded border border-sky-300">
                  No es Pan
                </span>
              </div>
              <span className="text-[10px] font-bold text-sky-800 font-mono">
                +{selectedMultiplier} {selectedMultiplier === 1 ? 'pza' : 'pzs'}
              </span>
            </div>

            {/* 9 Botones en 1 Sola Fila (Leche [Lechita 18/Grande 35], Chocolate [Tableta 60/Caja 180], Complementos [Café 130/Miel 170/Nata 90/Cajeta 130], Rosca $50, Queso, Granola 160, Paletas, Postres, Domo) */}
            <div className="grid grid-cols-3 sm:grid-cols-9 gap-1">
              {/* 1. LECHE (Abre Ventana Emergente: Lechita $18 o Leche Grande $35) */}
              <button
                id="companion-btn-leche-dropdown"
                type="button"
                onPointerDown={(e) => {
                  if (e.pointerType === 'mouse' && e.button !== 0) return;
                  playBeep(750, 'sine', 0.04);
                  setShowLecheModal(true);
                }}
                onClick={() => {
                  playBeep(750, 'sine', 0.04);
                  setShowLecheModal(true);
                }}
                className="touch-pos-btn select-none group relative bg-gradient-to-b from-sky-50 to-white hover:from-sky-100 active:from-sky-200 border-2 border-sky-300 hover:border-sky-600 rounded-xl px-1 py-1 flex items-center justify-between transition-all duration-75 active:scale-95 shadow-2xs h-[42px] sm:h-[46px] cursor-pointer"
                title="Leche: Lechita $18 o Leche Grande $35"
              >
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-xs sm:text-sm shrink-0">🥛</span>
                  <div className="text-left leading-none truncate">
                    <div className="text-[10px] sm:text-[11px] font-black text-sky-950 truncate">LECHE</div>
                    <div className="text-[8.5px] sm:text-[9px] font-bold text-sky-700 leading-none mt-0.5">18/35</div>
                  </div>
                </div>
                <ChevronDown className="w-3 h-3 text-sky-800 shrink-0 group-hover:translate-y-0.5 transition-transform" />
              </button>

              {/* 2. CHOCOLATE ABUELITA (Abre Ventana Emergente: Tabletilla $30, Tableta $60 o Caja $180) */}
              <button
                id="companion-btn-chocolate-dropdown"
                type="button"
                onPointerDown={(e) => {
                  if (e.pointerType === 'mouse' && e.button !== 0) return;
                  playBeep(750, 'sine', 0.04);
                  setShowChocolateModal(true);
                }}
                onClick={() => {
                  playBeep(750, 'sine', 0.04);
                  setShowChocolateModal(true);
                }}
                className="touch-pos-btn select-none group relative bg-gradient-to-b from-amber-50 to-orange-100 hover:from-amber-100 active:from-orange-200 border-2 border-amber-300 hover:border-amber-600 rounded-xl px-1 py-1 flex items-center justify-between transition-all duration-75 active:scale-95 shadow-2xs h-[42px] sm:h-[46px] cursor-pointer"
                title="Chocolate Abuelita: Tabletilla $30, Tableta $60 o Caja $180"
              >
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-xs sm:text-sm shrink-0">🍫</span>
                  <div className="text-left leading-none truncate">
                    <div className="text-[10px] sm:text-[11px] font-black text-amber-950 truncate">CHOCOLATE</div>
                    <div className="text-[8px] sm:text-[8.5px] font-bold text-amber-800 leading-none mt-0.5">30/60/180</div>
                  </div>
                </div>
                <ChevronDown className="w-3 h-3 text-amber-800 shrink-0 group-hover:translate-y-0.5 transition-transform" />
              </button>

              {/* 3. COMPLEMENTOS (Abre Ventana Emergente: Café $130, Miel $170, Nata $90, Cajeta $130) */}
              <button
                id="companion-btn-complementos-dropdown"
                type="button"
                onPointerDown={(e) => {
                  if (e.pointerType === 'mouse' && e.button !== 0) return;
                  playBeep(750, 'sine', 0.04);
                  setShowComplementosModal(true);
                }}
                onClick={() => {
                  playBeep(750, 'sine', 0.04);
                  setShowComplementosModal(true);
                }}
                className="touch-pos-btn select-none group relative bg-gradient-to-b from-amber-50 via-orange-50 to-amber-100 hover:from-amber-100 active:from-amber-200 border-2 border-amber-400 hover:border-amber-600 rounded-xl px-1 py-1 flex items-center justify-between transition-all duration-75 active:scale-95 shadow-2xs h-[42px] sm:h-[46px] cursor-pointer"
                title="Complementos: Café $130, Miel $170, Nata $90, Cajeta $130"
              >
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-xs sm:text-sm shrink-0">🍯</span>
                  <div className="text-left leading-none truncate">
                    <div className="text-[9.5px] sm:text-[10px] font-black text-amber-950 truncate">COMPLEMENTOS</div>
                    <div className="text-[7.5px] sm:text-[8px] font-bold text-amber-800 leading-none mt-0.5">90/130/170</div>
                  </div>
                </div>
                <ChevronDown className="w-3 h-3 text-amber-800 shrink-0 group-hover:translate-y-0.5 transition-transform" />
              </button>

              {/* 4. ROSCA $50 (Marca inmediatamente $50 al tocarlo) */}
              <button
                id="companion-btn-rosca-50"
                type="button"
                onPointerDown={(e) => handlePointerDownPrice(e, 50, 'Rosca $50', 'p_rosca_50')}
                onClick={() => triggerAddPriceTouch(50, 'Rosca $50', 'p_rosca_50')}
                className="touch-pos-btn select-none group relative bg-gradient-to-b from-yellow-50 via-amber-50 to-orange-100 hover:from-yellow-100 active:from-amber-200 border-2 border-amber-400 hover:border-amber-600 rounded-xl px-1 py-1 flex items-center justify-between transition-all duration-75 active:scale-95 shadow-2xs h-[42px] sm:h-[46px] cursor-pointer"
                title="Rosca $50 (Marca $50 inmediatamente)"
              >
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-xs sm:text-sm shrink-0">🥮</span>
                  <div className="text-left leading-none truncate">
                    <div className="text-[10px] sm:text-[11px] font-black text-amber-950 truncate">ROSCA</div>
                    <div className="text-[8.5px] sm:text-[9px] font-bold text-amber-700 leading-none mt-0.5">$50</div>
                  </div>
                </div>
                <span className="bg-white text-slate-800 px-0.5 py-0.2 rounded text-[7px] border border-amber-300 font-bold font-mono shrink-0">
                  +{selectedMultiplier}
                </span>
              </button>

              {/* 4. Queso 150 */}
              <button
                id="companion-btn-p_queso"
                type="button"
                onPointerDown={(e) => handlePointerDownPrice(e, 150, 'Queso $150', 'p_queso')}
                onClick={() => triggerAddPriceTouch(150, 'Queso $150', 'p_queso')}
                className="touch-pos-btn select-none group relative bg-gradient-to-b from-sky-50 to-white hover:from-sky-100 active:from-sky-200 border-2 border-sky-300 hover:border-sky-600 rounded-xl px-1 py-1 flex items-center justify-between transition-all duration-75 active:scale-95 shadow-2xs h-[42px] sm:h-[46px] cursor-pointer"
                title="Queso $150"
              >
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-xs sm:text-sm shrink-0">🧀</span>
                  <div className="text-left leading-none truncate">
                    <div className="text-[10px] sm:text-[11px] font-black text-sky-950 truncate">QUESO</div>
                    <div className="text-[8.5px] sm:text-[9px] font-bold text-sky-700 leading-none mt-0.5">$150</div>
                  </div>
                </div>
                <span className="bg-white text-slate-800 px-0.5 py-0.2 rounded text-[7px] border border-sky-200 font-bold font-mono shrink-0">
                  +{selectedMultiplier}
                </span>
              </button>

              {/* 5. Granola 160 */}
              <button
                id="companion-btn-p_granola"
                type="button"
                onPointerDown={(e) => handlePointerDownPrice(e, 160, 'Granola Artesanal $160', 'p_granola_160')}
                onClick={() => triggerAddPriceTouch(160, 'Granola Artesanal $160', 'p_granola_160')}
                className="touch-pos-btn select-none group relative bg-gradient-to-b from-amber-50 to-orange-50 hover:from-amber-100 active:from-orange-200 border-2 border-amber-300 hover:border-amber-500 rounded-xl px-1 py-1 flex items-center justify-between transition-all duration-75 active:scale-95 shadow-2xs h-[42px] sm:h-[46px] cursor-pointer"
                title="Granola Artesanal $160"
              >
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-xs sm:text-sm shrink-0">🥣</span>
                  <div className="text-left leading-none truncate">
                    <div className="text-[10px] sm:text-[11px] font-black text-amber-950 truncate">GRANOLA</div>
                    <div className="text-[8.5px] sm:text-[9px] font-bold text-amber-800 leading-none mt-0.5">$160</div>
                  </div>
                </div>
                <span className="bg-white text-slate-800 px-0.5 py-0.2 rounded text-[7px] border border-amber-200 font-bold font-mono shrink-0">
                  +{selectedMultiplier}
                </span>
              </button>

              {/* 6. Paletas de Hielo 40, 45, 50 (Abre Ventana Emergente con cantidades 1 al 5 y precios) */}
              <button
                id="companion-btn-paletas-dropdown"
                type="button"
                onPointerDown={(e) => {
                  if (e.pointerType === 'mouse' && e.button !== 0) return;
                  playBeep(750, 'sine', 0.04);
                  setPaletasQty(selectedMultiplier >= 1 && selectedMultiplier <= 5 ? selectedMultiplier : 1);
                  setShowPaletasModal(true);
                }}
                onClick={() => {
                  playBeep(750, 'sine', 0.04);
                  setPaletasQty(selectedMultiplier >= 1 && selectedMultiplier <= 5 ? selectedMultiplier : 1);
                  setShowPaletasModal(true);
                }}
                className="touch-pos-btn select-none group relative bg-gradient-to-b from-purple-50 to-fuchsia-100 hover:from-purple-100 active:from-fuchsia-200 border-2 border-purple-300 hover:border-purple-500 rounded-xl px-1 py-1 flex items-center justify-between transition-all duration-75 active:scale-95 shadow-2xs h-[42px] sm:h-[46px] cursor-pointer"
                title="Paletas de Hielo $40, $45, $50"
              >
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-xs sm:text-sm shrink-0">🍧</span>
                  <div className="text-left leading-none truncate">
                    <div className="text-[10px] sm:text-[11px] font-black text-purple-950 truncate">PALETAS</div>
                    <div className="text-[8.5px] sm:text-[9px] font-bold text-purple-800 leading-none mt-0.5">40/45/50</div>
                  </div>
                </div>
                <ChevronDown className="w-3 h-3 text-purple-800 shrink-0 group-hover:translate-y-0.5 transition-transform" />
              </button>

              {/* 7. POSTRES */}
              <button
                id="companion-btn-postres-dropdown"
                type="button"
                onPointerDown={(e) => {
                  if (e.pointerType === 'mouse' && e.button !== 0) return;
                  playBeep(750, 'sine', 0.04);
                  setShowPostresModal(true);
                }}
                onClick={() => {
                  playBeep(750, 'sine', 0.04);
                  setShowPostresModal(true);
                }}
                className="touch-pos-btn select-none group relative bg-gradient-to-b from-pink-50 to-rose-100 hover:from-pink-100 active:from-rose-200 border-2 border-pink-300 hover:border-pink-500 rounded-xl px-1 py-1 flex items-center justify-between transition-all duration-75 active:scale-95 shadow-2xs h-[42px] sm:h-[46px] cursor-pointer"
                title="Postres: Pastel $65, Pastel $35, Galletas $65, Gelatina $20, Arroz con Leche $25"
              >
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-xs sm:text-sm shrink-0">🍰</span>
                  <div className="text-left leading-none truncate">
                    <div className="text-[10px] sm:text-[11px] font-black text-pink-950 truncate">POSTRES</div>
                    <div className="text-[8px] sm:text-[8.5px] font-bold text-pink-800 leading-none mt-0.5">$65/$35/$20</div>
                  </div>
                </div>
                <ChevronDown className="w-3 h-3 text-pink-800 shrink-0 group-hover:translate-y-0.5 transition-transform" />
              </button>

              {/* 8. CHAROLA / DOMO 25 */}
              <button
                id="companion-btn-domo-25"
                type="button"
                onPointerDown={(e) => handlePointerDownPrice(e, 25, 'Charola / Domo $25', 'p_domo_25')}
                onClick={() => triggerAddPriceTouch(25, 'Charola / Domo $25', 'p_domo_25')}
                className="touch-pos-btn select-none group relative bg-gradient-to-b from-slate-50 to-amber-100 hover:from-amber-100 active:from-amber-200 border-2 border-amber-300 hover:border-amber-500 rounded-xl px-1 py-1 flex items-center justify-between transition-all duration-75 active:scale-95 shadow-2xs h-[42px] sm:h-[46px] cursor-pointer"
                title="Charola / Domo para empaque"
              >
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-xs sm:text-sm shrink-0">🍱</span>
                  <div className="text-left leading-none truncate">
                    <div className="text-[10px] sm:text-[11px] font-black text-amber-950 truncate">DOMO</div>
                    <div className="text-[8.5px] sm:text-[9px] font-bold text-amber-800 leading-none mt-0.5">$25</div>
                  </div>
                </div>
                <span className="bg-white text-slate-800 px-0.5 py-0.2 rounded text-[7px] border border-amber-300 font-bold font-mono shrink-0">
                  +{selectedMultiplier}
                </span>
              </button>
            </div>
          </div>

          {/* MODIFICACIÓN SOLICITADA: Listado ultra compacto de los últimos 2 registros cobrados (para caber en una sola ventana) */}
          <div className="bg-white rounded-xl p-1.5 shadow-2xs border border-slate-200 space-y-1">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-[#D95D39]" />
                <span className="text-[11px] font-black text-slate-900 tracking-tight">
                  ÚLTIMOS 3 COBROS
                </span>
                <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200">
                  En vivo
                </span>
              </div>
              <span className="text-[9.5px] font-bold text-slate-400">
                Verificación inmediata
              </span>
            </div>

            {recent3Tickets.length === 0 ? (
              <div className="py-1 px-2 bg-slate-50 rounded-lg text-center border border-dashed border-slate-200">
                <span className="text-[10px] font-bold text-slate-500">
                  Aún no hay cobros en este turno. Al cobrar aparecerán aquí los últimos 3 tickets.
                </span>
              </div>
            ) : (
              <div className="space-y-1">
                {recent3Tickets.map((tk, idx) => {
                  const piecesCount = tk.items.reduce((sum, item) => sum + item.quantity, 0);
                  const isCard = tk.paymentMethod === 'tarjeta';
                  const isPoints = tk.paymentMethod === 'puntos';

                  // Resumen conciso de productos
                  const itemSummary = tk.items
                    .map(it => `${it.quantity} ${it.name.replace(/\s*\$\d+.*$/, '')}`)
                    .join(', ');

                  return (
                    <div
                      key={tk.id || `recent-tk-${idx}`}
                      className="bg-slate-50/70 hover:bg-amber-50/50 px-2 py-1 rounded-lg border border-slate-200 hover:border-amber-300 transition-colors flex items-center justify-between gap-1.5 h-7.5"
                    >
                      {/* Izquierda: Folio, Hora, Método, y Resumen en una sola línea */}
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span className="text-[9.5px] font-black font-mono text-slate-800 bg-white px-1 py-0.2 rounded border border-slate-200 shrink-0">
                          #{tk.folio}
                        </span>
                        <span className="text-[9.5px] font-bold font-mono text-slate-500 shrink-0">
                          {tk.time}
                        </span>
                        <span className={`px-1 py-0.2 rounded text-[8.5px] font-black border shrink-0 ${
                          isCard 
                            ? 'bg-blue-50 text-blue-800 border-blue-200' 
                            : isPoints 
                              ? 'bg-amber-50 text-amber-800 border-amber-200' 
                              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}>
                          {isCard ? 'Tarjeta' : isPoints ? 'Puntos' : 'Efec'}
                        </span>
                        <span className="text-[10px] text-slate-600 font-medium truncate" title={itemSummary}>
                          {itemSummary || 'Pan surtido'}
                        </span>
                      </div>

                      {/* Derecha: Piezas, Total en pesos y Botón Reimprimir */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[9px] font-bold text-amber-900 bg-amber-100/70 px-1 py-0.2 rounded font-mono">
                          {piecesCount} pz
                        </span>
                        <span className="text-xs font-black font-mono text-slate-950">
                          ${tk.total}.00
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            playBeep(650, 'sine', 0.03);
                            setCompletedTicket(tk);
                          }}
                          className="p-1 bg-white hover:bg-amber-100 active:bg-amber-200 text-slate-700 hover:text-amber-950 rounded border border-slate-200 hover:border-amber-300 cursor-pointer shadow-2xs transition-colors"
                          title="Ver o reimprimir ticket térmico"
                        >
                          <Printer className="w-3 h-3 text-[#D95D39]" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Club de Puntos + Live Ticket Preview + Checkout (42% width, col-span-5) */}
        <div className="lg:col-span-5 space-y-1.5 lg:sticky lg:top-16 z-20 self-start">
          
          {/* 1. CLUB DE PUNTOS SANTA FÉ (Barra delgada compacta para ahorrar espacio - Solo Teléfono) */}
          <div className="bg-gradient-to-r from-amber-50 via-orange-50/60 to-amber-100/70 rounded-xl px-2 py-1 shadow-2xs border border-amber-300">
            {selectedCustomer ? (
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs shrink-0">⭐</span>
                  <div className="truncate flex items-center gap-1.5">
                    <span className="text-xs font-mono font-black text-slate-900 truncate">
                      📱 Tel: {selectedCustomer.phone}
                    </span>
                    <span className="text-[10px] font-black bg-amber-200 text-amber-950 px-1.5 py-0.2 rounded border border-amber-400 font-mono shrink-0">
                      {selectedCustomer.points} pts
                    </span>
                    {pointsEarned > 0 && (
                      <span className="text-[10px] font-black text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded border border-emerald-300 font-mono shrink-0">
                        +{pointsEarned} pts ganados
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomer(null);
                    setPhoneSearch('');
                    setVirtualPhoneInput('');
                    setPointsToRedeem(0);
                  }}
                  className="text-slate-500 hover:text-rose-600 bg-white hover:bg-rose-50 px-2 py-0.5 rounded-md border border-slate-200 text-[10px] font-bold transition-colors cursor-pointer shrink-0"
                  title="Cambiar cliente"
                >
                  ✕ Cambiar
                </button>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs">⭐</span>
                    <span className="text-[11px] font-black uppercase tracking-tight text-amber-950">Club Puntos:</span>
                    <span className="hidden sm:inline-block text-[9px] font-bold text-amber-800 bg-amber-200/80 px-1 py-0.2 rounded border border-amber-300 font-mono">
                      $20=1pt
                    </span>
                  </div>

                  <div 
                    onClick={() => {
                      setVirtualPhoneInput(phoneSearch);
                      setShowCustomerPhoneKeyboardModal(true);
                    }}
                    className="relative flex-1 max-w-[210px] cursor-pointer"
                    title="Toca para abrir teclado virtual"
                  >
                    <Phone className="w-3 h-3 text-amber-700 absolute left-2 top-1/2 -translate-y-1/2" />
                    <input
                      id="customer-phone-search"
                      type="tel"
                      placeholder="Teléfono (10 dígitos)..."
                      value={phoneSearch}
                      readOnly
                      onClick={() => {
                        setVirtualPhoneInput(phoneSearch);
                        setShowCustomerPhoneKeyboardModal(true);
                      }}
                      className="w-full bg-white pl-5 pr-2 py-0.5 rounded-lg text-[11px] border border-amber-300 focus:outline-none font-bold text-slate-900 placeholder:text-slate-400 cursor-pointer"
                    />
                  </div>

                  {/* Botón táctil para abrir teclado virtual */}
                  <button
                    id="open-phone-keyboard-btn"
                    type="button"
                    onClick={() => {
                      setVirtualPhoneInput(phoneSearch);
                      setShowCustomerPhoneKeyboardModal(true);
                    }}
                    className="bg-amber-400 hover:bg-amber-500 active:scale-95 text-amber-950 text-[10px] font-black px-2 py-0.5 rounded-lg border border-amber-500 flex items-center gap-1 shadow-2xs cursor-pointer shrink-0"
                    title="Abrir teclado virtual en pantalla"
                  >
                    <Keyboard className="w-3 h-3" />
                    <span>Teclado</span>
                  </button>

                  {phoneSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setPhoneSearch('');
                        setVirtualPhoneInput('');
                        setSelectedCustomer(null);
                        setShowNewCustomerForm(false);
                      }}
                      className="text-[10px] text-slate-600 hover:text-slate-900 px-1.5 py-0.5 bg-white rounded-md font-bold border border-amber-300 shrink-0 cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Afiliación rápida táctil sin pedir nombre si el teléfono no está registrado */}
                {showNewCustomerForm && !selectedCustomer && (
                  <div className="mt-1 pt-1 border-t border-amber-200 flex items-center justify-between gap-1.5 animate-in fade-in">
                    <span className="text-[10px] font-bold text-amber-950 truncate">
                      Teléfono: <strong className="font-mono">{phoneSearch}</strong>
                    </span>
                    <button
                      id="register-customer-btn"
                      type="button"
                      onClick={() => handleRegisterOrSelectPhone(phoneSearch)}
                      className="bg-[#D95D39] hover:bg-[#BF4C2A] active:scale-95 text-white text-[11px] font-black px-2.5 py-0.5 rounded-md shadow-2xs transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Afiliar Teléfono</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. PREVISUALIZACIÓN DEL PEDIDO EN VIVO + TOTAL Y COBRO */}
          <div className="bg-white rounded-xl shadow-sm border border-[#E5E1DA] flex flex-col overflow-hidden">
            
            {/* Header del Ticket Delgado */}
            <div className="bg-[#2D3142] text-white px-2.5 py-1 flex items-center justify-between shadow-xs shrink-0">
              <div className="flex items-center space-x-1.5">
                <Printer className="w-3.5 h-3.5 text-[#FAF8F6]" />
                <div className="flex items-center gap-1.5">
                  <h2 className="font-bold text-xs sm:text-sm leading-tight">Previsualización del Pedido</h2>
                  <span className="text-[11px] text-amber-300 font-black">
                    ({totalPieces} piezas)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  id="quick-unpaid-order-header-btn"
                  type="button"
                  onClick={handleOpenUnpaidOrderModal}
                  className="text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1 font-black transition-all cursor-pointer border border-emerald-400 shadow-2xs"
                  title="Guardar como pedido sin cobrar en Encargos y Pedidos"
                >
                  <ShoppingBag className="w-3 h-3" />
                  <span>Sin Cobrar</span>
                </button>

                {ticketItems.length > 0 && (
                  <button
                    id="clear-ticket-btn"
                    onClick={handleClearTicket}
                    className="text-slate-200 hover:text-white bg-rose-500/30 hover:bg-rose-500/50 text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1 font-bold transition-colors cursor-pointer border border-rose-400/40"
                    title="Limpiar todo el ticket"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Borrar</span>
                  </button>
                )}
              </div>
            </div>

            {/* Lista de partidas del Ticket (Compacta: 5 partidas caben en ~135px sin scroll) */}
            <div className="p-1 flex-1 min-h-[50px] max-h-[145px] overflow-y-auto space-y-1 bg-[#FAF8F6] border-b border-[#E5E1DA]">
              {ticketItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-2 text-slate-400">
                  <p className="font-black text-slate-800 text-xs">Sin piezas marcadas aún</p>
                  <p className="text-[10px] text-slate-600 max-w-[240px] font-bold">
                    Toca la cantidad y el precio del pan a la izquierda
                  </p>
                </div>
              ) : (
                ticketItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className="bg-white px-2 py-0.5 rounded-md border border-[#E5E1DA] shadow-2xs flex items-center justify-between gap-1 hover:border-amber-300 transition-colors"
                  >
                    {/* Descripción & Cantidad */}
                    <div className="flex-1 min-w-0 flex items-center gap-1.5">
                      <span className="font-mono font-black text-xs sm:text-sm text-slate-900 shrink-0">
                        {item.quantity}×
                      </span>
                      <div className="truncate leading-tight">
                        <span className="text-xs font-bold text-slate-800 truncate block">
                          {item.name}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-[10px] text-slate-500 shrink-0">
                        (@${item.price})
                      </span>
                    </div>

                    {/* Subtotal Partida */}
                    <span className="font-mono font-black text-xs sm:text-sm text-[#D95D39] shrink-0">
                      ${item.total.toFixed(2)}
                    </span>

                    {/* Botones de incremento/decremento y borrado compactos */}
                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        onClick={() => handleUpdateQuantity(idx, -1)}
                        className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-black flex items-center justify-center text-xs active:scale-95 border border-slate-300 cursor-pointer"
                        title="Restar una pieza"
                      >
                        -
                      </button>
                      <span className="w-4 text-center font-black font-mono text-xs text-slate-900">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => handleUpdateQuantity(idx, 1)}
                        className="w-5 h-5 rounded bg-[#FFF5F0] hover:bg-[#FFEAE0] text-[#D95D39] font-black flex items-center justify-center text-xs active:scale-95 border border-[#D95D39]/40 cursor-pointer"
                        title="Sumar una pieza"
                      >
                        +
                      </button>
                      <button
                        onClick={() => handleRemoveItem(idx)}
                        className="w-5 h-5 rounded text-rose-600 hover:bg-rose-50 flex items-center justify-center ml-0.5 transition-colors cursor-pointer border border-rose-200"
                        title="Eliminar partida"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Canje de puntos de fidelidad si el cliente tiene saldo */}
            {selectedCustomer && selectedCustomer.points > 0 && subtotal > 0 && (
              <div className="bg-[#FFF5F0] px-2 py-0.5 border-b border-[#E5E1DA] flex items-center justify-between text-xs shrink-0">
                <div className="flex items-center gap-1 text-slate-900 font-bold truncate">
                  <Sparkles className="w-3 h-3 text-[#D95D39] shrink-0" />
                  <span className="truncate">{selectedCustomer.name.split(' ')[0]}:</span>
                  <strong className="text-emerald-700 font-mono font-black text-xs">{selectedCustomer.points} pts disp.</strong>
                </div>
                {pointsToRedeem === 0 ? (
                  <button
                    onClick={() => {
                      playBeep(850, 'sine', 0.08);
                      setPointsToRedeem(maxRedeemablePoints);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-2 py-0.5 rounded text-[11px] shadow-2xs shrink-0 cursor-pointer font-mono"
                  >
                    Canjear -${maxRedeemablePoints}
                  </button>
                ) : (
                  <button
                    onClick={() => setPointsToRedeem(0)}
                    className="bg-white hover:bg-slate-100 text-slate-800 border border-[#E5E1DA] font-bold px-2 py-0.5 rounded text-[11px] shrink-0 cursor-pointer"
                  >
                    Quitar Canje
                  </button>
                )}
              </div>
            )}

            {/* Sección de Totales, Descuento Especial al Cobrar y Botones de Cobro */}
            <div className="p-2 bg-white space-y-1 shrink-0 border-t border-[#E5E1DA]">
              {/* Fila Subtotal + Botón Descuento 10% Especial unificados en una sola línea */}
              <div className="flex items-center justify-between text-slate-700 font-bold text-xs">
                <span>Subtotal ({totalPieces} pzs): <strong className="font-mono font-black text-slate-950 text-xs sm:text-sm">${subtotal.toFixed(2)}</strong></span>
                
                {ticketItems.length > 0 && (
                  <button
                    id="checkout-special-discount-btn"
                    type="button"
                    onClick={() => {
                      playBeep(isSpecialCustomerDiscount ? 450 : 750, 'triangle', 0.05);
                      setIsSpecialCustomerDiscount(!isSpecialCustomerDiscount);
                    }}
                    className={`py-0.5 px-2 rounded-md text-[11px] font-black transition-all flex items-center gap-1 cursor-pointer border active:scale-95 ${
                      isSpecialCustomerDiscount
                        ? 'bg-amber-400 text-amber-950 border-amber-600 font-black shadow-2xs'
                        : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
                    }`}
                    title="Aplicar o remover el 10% de descuento especial"
                  >
                    <Star className={`w-3 h-3 ${isSpecialCustomerDiscount ? 'fill-amber-950 text-amber-950' : 'fill-amber-600 text-amber-700'}`} />
                    <span>{isSpecialCustomerDiscount ? '10% Especial: SÍ (-$' + specialCustomerDiscount.toFixed(2) + ')' : '⭐ Desc. 10% Especial'}</span>
                  </button>
                )}
              </div>

              {/* Descuentos de puntos si existen */}
              {actualDiscount > 0 && (
                <div className="flex justify-between text-emerald-700 font-black text-xs">
                  <span>Desc. Puntos ({actualDiscount} pts):</span>
                  <span className="font-mono text-xs sm:text-sm">-${actualDiscount.toFixed(2)}</span>
                </div>
              )}

              {/* TOTAL A COBRAR (Muy visible pero con altura optimizada) */}
              <div className="flex justify-between items-center py-0.5 border-t border-[#E5E1DA]">
                <span className="text-xs sm:text-sm font-black text-slate-950 uppercase tracking-tight">Total a Cobrar:</span>
                <span className="text-3xl sm:text-4xl font-black text-[#D95D39] font-mono tracking-tight leading-none drop-shadow-2xs">
                  ${total.toFixed(2)}
                </span>
              </div>

              {/* CALCULADORA DE CAMBIO RÁPIDO CON BILLETES */}
              {ticketItems.length > 0 && total > 0 && (
                <div className="bg-[#FAF8F6] rounded-lg p-1.5 border border-amber-400 shadow-2xs space-y-1 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-800 flex items-center gap-1">
                      <Banknote className="w-3 h-3 text-[#D95D39]" />
                      <span>¿Con cuánto pagan? (Cambio)</span>
                    </span>
                    {cashGivenInput && (
                      <button
                        type="button"
                        onClick={() => {
                          playBeep(450, 'sine', 0.03);
                          setCashGivenInput('');
                        }}
                        className="text-[10px] font-black text-slate-600 hover:text-[#D95D39] underline cursor-pointer"
                        title="Borrar cálculo"
                      >
                        Limpiar
                      </button>
                    )}
                  </div>

                  {/* Fila de Billetes Rápidos: Exacto, 50, 100, 200, 500, 1000 */}
                  <div className="grid grid-cols-6 gap-1">
                    <button
                      id="quick-bill-exact-btn"
                      type="button"
                      onClick={() => {
                        playBeep(750, 'sine', 0.03);
                        setCashGivenInput(total.toString());
                      }}
                      className={`py-1 px-0.5 rounded-md font-black text-xs font-mono transition-all text-center border cursor-pointer active:scale-95 ${
                        numericCashGiven === total
                          ? 'bg-emerald-600 text-white border-emerald-700 ring-1 ring-emerald-400 shadow-2xs'
                          : 'bg-white hover:bg-emerald-50 text-emerald-900 border-emerald-300'
                      }`}
                      title="Pago exacto sin cambio"
                    >
                      Exacto
                    </button>

                    {quickBills.map((bill) => {
                      const isSelected = numericCashGiven === bill.value;
                      return (
                        <button
                          key={bill.value}
                          id={`quick-bill-${bill.value}-btn`}
                          type="button"
                          onClick={() => {
                            playBeep(700, 'sine', 0.03);
                            setCashGivenInput(bill.value.toString());
                          }}
                          className={`py-1 px-0.5 rounded-md font-black text-xs font-mono transition-all text-center border cursor-pointer active:scale-95 ${
                            isSelected ? bill.active : bill.bg
                          }`}
                          title={`Calcular cambio si pagan con billete de ${bill.label}`}
                        >
                          {bill.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Entrada manual de billete recibido (Abre ventana emergente al hacer clic) */}
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black text-slate-500">$</span>
                      <input
                        id="custom-cash-input-field"
                        type="text"
                        readOnly
                        placeholder="Otro billete..."
                        value={cashGivenInput ? `$${cashGivenInput}.00` : ''}
                        onClick={() => {
                          playBeep(600, 'sine', 0.03);
                          setShowCashNumpad(true);
                        }}
                        className="w-full pl-5 pr-2 py-0.5 h-6.5 bg-white hover:bg-amber-50/60 rounded-md text-xs font-black font-mono border border-amber-300 focus:outline-none focus:ring-1 focus:ring-[#D95D39] text-slate-900 cursor-pointer transition-colors shadow-2xs"
                        title="Toca para ingresar otro billete"
                      />
                    </div>

                    {numericCashGiven > 0 && numericCashGiven < total && (
                      <div className="bg-amber-500 text-amber-950 px-2 py-0.5 h-6.5 rounded-md font-black font-mono text-xs shrink-0 border border-amber-600 flex items-center">
                        Faltan: ${cashShortage}.00
                      </div>
                    )}
                  </div>

                  {/* CAMBIO GIGANTE */}
                  {numericCashGiven > 0 && numericCashGiven > total && (
                    <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-1 px-2.5 rounded-md flex items-center justify-between shadow-2xs border border-emerald-400 animate-in zoom-in-95">
                      <div className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wide text-emerald-100">
                        <span>💵 CAMBIO:</span>
                      </div>
                      <div className="text-xl sm:text-2xl font-black font-mono text-amber-200 tracking-tight leading-none">
                        ${calculatedPosChange}.00
                      </div>
                      <div className="text-[10px] font-black text-emerald-100 font-mono">
                        (${numericCashGiven} - ${total})
                      </div>
                    </div>
                  )}

                  {numericCashGiven === total && numericCashGiven > 0 && (
                    <div className="bg-emerald-100 border border-emerald-300 text-emerald-950 py-0.5 px-2 rounded-md text-center text-xs font-black">
                      ✅ Pago Exacto (${total}.00) — Sin cambio
                    </div>
                  )}
                </div>
              )}

              {/* BOTONES DE COBRO DEFINITIVOS: 3 BOTONES (Sin Ticket, Con Ticket, Terminal Mercado Pago Point) */}
              <div className="space-y-1.5 pt-0.5">
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                  {/* Botón 1: Cobro Rápido Sin Ticket */}
                  <button
                    id="quick-checkout-no-ticket-btn"
                    type="button"
                    disabled={ticketItems.length === 0}
                    onClick={handleQuickCheckoutWithoutTicket}
                    className={`text-white font-black py-2.5 px-1.5 rounded-xl transition-all active:scale-95 flex flex-col items-center justify-center gap-0.5 text-center min-h-[48px] ${
                      ticketItems.length > 0
                        ? 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer border-2 border-emerald-300 ring-2 ring-emerald-400 ring-offset-1 shadow-lg shadow-emerald-500/40 blink-sin-ticket'
                        : 'bg-gradient-to-r from-emerald-600 to-teal-600 opacity-40 cursor-not-allowed border border-emerald-500'
                    }`}
                    title="Registrar venta en efectivo sin imprimir ticket (animación de dona sonriente)"
                  >
                    <span className="text-base leading-none">🍩</span>
                    <span className="text-xs font-black leading-tight whitespace-nowrap">Sin Ticket</span>
                  </button>

                  {/* Botón 2: Cobrar con Ticket Térmico */}
                  <button
                    id="checkout-and-print-btn"
                    type="button"
                    disabled={ticketItems.length === 0}
                    onClick={() => handleCompleteSale()}
                    className="bg-gradient-to-r from-[#D95D39] to-[#BF4C2A] hover:from-[#BF4C2A] hover:to-[#9E3B1C] disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-2.5 px-1.5 rounded-xl shadow-xs hover:shadow transition-all active:scale-95 flex flex-col items-center justify-center gap-0.5 text-center cursor-pointer border border-[#BF4C2A] min-h-[48px]"
                    title="Cobrar en efectivo e imprimir ticket térmico directo"
                  >
                    <Printer className="w-4 h-4 shrink-0 stroke-[2.5]" />
                    <span className="text-xs font-black leading-tight whitespace-nowrap">Con Ticket</span>
                  </button>

                  {/* Botón 3: Cobro Directo con Terminal Mercado Pago Point */}
                  <button
                    id="checkout-mercadopago-btn"
                    type="button"
                    disabled={ticketItems.length === 0}
                    onClick={() => {
                      if (ticketItems.length === 0) return;
                      playBeep(750, 'sine', 0.05);
                      const f = getNextTicketFolio(branchTickets, activeBranchId);
                      setActiveCardFolio(f);
                      setShowMercadoPagoModal(true);
                    }}
                    className="bg-gradient-to-r from-[#009EE3] to-[#007EB5] hover:from-[#008AC6] hover:to-[#006A99] disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-2.5 px-1.5 rounded-xl shadow-md hover:shadow-lg transition-all active:scale-95 flex flex-col items-center justify-center gap-0.5 text-center cursor-pointer border-2 border-cyan-300 ring-2 ring-cyan-400/40 min-h-[48px]"
                    title="Cobrar mandando orden directamente a la terminal física Mercado Pago Point (N950NCD500070018)"
                  >
                    <div className="flex items-center gap-1 leading-none">
                      <CreditCard className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span className="text-sm">🟦</span>
                    </div>
                    <span className="text-xs font-black leading-tight whitespace-nowrap">M. Pago Point</span>
                  </button>
                </div>

                {/* BOTÓN: PEDIDO REPARTO (Encargos y Pedidos con Doble Ticket) - Solo Refugio */}
                {!isZakia && (
                  <button
                    id="unpaid-order-main-btn"
                    type="button"
                    onClick={handleOpenUnpaidOrderModal}
                    className="w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 text-white font-black py-2 px-2.5 rounded-xl shadow-md hover:shadow-lg transition-all active:scale-98 flex items-center justify-between gap-1.5 text-xs sm:text-sm cursor-pointer border-2 border-emerald-400/80 ring-2 ring-emerald-400/25"
                    title="Guardar Pedido Reparto e imprimir Doble Ticket (Repartidor + Mostrador)"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                        <Truck className="w-3.5 h-3.5 text-white stroke-[2.5]" />
                      </div>
                      <span className="font-black tracking-tight text-white truncate">Pedido Reparto</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {ticketItems.length > 0 && (
                        <span className="bg-white/20 px-2 py-0.5 rounded-md text-[11px] font-mono font-black text-white">
                          {totalPieces} pzs • ${total}.00
                        </span>
                      )}
                      <span className="text-[10px] font-black bg-amber-400 text-amber-950 px-1.5 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-0.5 shadow-2xs">
                        Doble Ticket
                      </span>
                    </div>
                  </button>
                )}

                <div className={`grid ${isZakia ? 'grid-cols-1' : 'grid-cols-2'} gap-1.5`}>
                  {/* BOTÓN: TICKETS DE REPARTO POR DÍA (Simón y Osvaldo) - Solo Refugio */}
                  {!isZakia && (
                    <button
                      id="driver-daily-tickets-btn"
                      type="button"
                      onClick={() => {
                        playBeep(650, 'sine', 0.04);
                        setShowDriverTicketsModal(true);
                      }}
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-1.5 px-2 rounded-lg shadow-2xs transition-all active:scale-98 flex items-center justify-center gap-1 text-[11px] cursor-pointer border border-slate-700"
                      title="Consultar y reimprimir tickets de reparto por día de Simón y Osvaldo"
                    >
                      <span>🛵</span>
                      <span className="truncate">Tickets Reparto</span>
                    </button>
                  )}

                  {/* BOTÓN: CORTE DE CAJA / TURNO */}
                  <button
                    id="shift-cut-open-btn"
                    type="button"
                    onClick={() => {
                      playBeep(650, 'sine', 0.05);
                      setShowShiftCutModal(true);
                    }}
                    className={`w-full bg-[#FAF8F6] hover:bg-[#FFF5F0] text-slate-900 hover:text-[#D95D39] border border-amber-300 hover:border-[#D95D39] font-black py-1.5 px-2 rounded-lg shadow-2xs transition-all active:scale-98 flex items-center justify-center gap-1 text-[11px] cursor-pointer ${isZakia ? 'py-2 text-xs' : ''}`}
                    title={`Abrir ventana de Corte de Caja / Corte del Turno (${cashierPresets.join(', ')})`}
                  >
                    <Receipt className="w-3.5 h-3.5 text-[#D95D39]" />
                    <span className="truncate">Corte de Caja {isZakia ? '(Zakia)' : ''}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Floating Sticky Checkout Bar (Only on small screens when ticket has items so buttons never get lost) */}
      {ticketItems.length > 0 && (
        <div className="lg:hidden fixed bottom-3 left-2 right-2 z-40 bg-[#2D3142] text-white p-2 rounded-2xl shadow-2xl border-2 border-white/20 flex items-center justify-between gap-1.5 animate-in slide-in-from-bottom-5">
          <div className="flex flex-col pl-1 min-w-[48px] shrink-0">
            <span className="text-[9px] text-slate-300 font-bold uppercase">{totalPieces} pzs</span>
            <span className="text-sm sm:text-base font-black text-amber-400 leading-none">${total}.00</span>
          </div>

          <div className={`grid ${isZakia ? 'grid-cols-3' : 'grid-cols-4'} gap-1 flex-1`}>
            <button
              id="mobile-quick-checkout-no-ticket-btn"
              type="button"
              onClick={handleQuickCheckoutWithoutTicket}
              className="bg-emerald-600 text-white font-black text-[9px] py-2 px-0.5 rounded-xl shadow-lg border-2 border-emerald-300 ring-2 ring-emerald-400 ring-offset-1 flex items-center justify-center gap-0.5 active:scale-95 cursor-pointer whitespace-nowrap blink-sin-ticket"
              title="Cobro rápido sin ticket"
            >
              <span>🍩</span>
              <span className="truncate">Sin Ticket</span>
            </button>

            <button
              id="mobile-checkout-print-btn"
              type="button"
              onClick={() => handleCompleteSale()}
              className="bg-gradient-to-r from-[#D95D39] to-[#BF4C2A] text-white font-black text-[9px] py-2 px-0.5 rounded-xl shadow-xs flex items-center justify-center gap-0.5 active:scale-95 cursor-pointer border border-[#BF4C2A] whitespace-nowrap"
              title="Cobrar con ticket"
            >
              <Printer className="w-3 h-3 shrink-0" />
              <span className="truncate">Ticket</span>
            </button>

            <button
              id="mobile-checkout-mercadopago-btn"
              type="button"
              onClick={() => {
                playBeep(750, 'sine', 0.05);
                const f = getNextTicketFolio(branchTickets, activeBranchId);
                setActiveCardFolio(f);
                setShowMercadoPagoModal(true);
              }}
              className="bg-gradient-to-r from-[#009EE3] to-[#007EB5] text-white font-black text-[9px] py-2 px-1 rounded-xl shadow-xs flex items-center justify-center gap-0.5 active:scale-95 cursor-pointer border border-[#007EB5] whitespace-nowrap"
              title="Cobrar con terminal Mercado Pago Point"
            >
              <span className="text-xs">🟦</span>
              <span className="truncate">M. Pago</span>
            </button>

            {!isZakia && (
              <button
                id="mobile-unpaid-order-btn"
                type="button"
                onClick={handleOpenUnpaidOrderModal}
                className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-black text-[9px] py-2 px-1 rounded-xl shadow-xs flex items-center justify-center gap-0.5 active:scale-95 cursor-pointer border border-emerald-400 whitespace-nowrap"
                title="Guardar Pedido Reparto (Doble Ticket)"
              >
                <Truck className="w-3 h-3 shrink-0" />
                <span className="truncate">Reparto</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Manual Custom Price Modal with On-Screen Touch Keypad */}
      {showCustomPriceModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl p-5 shadow-2xl max-w-md w-full border-2 border-[#D95D39]/30 animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#FFF5F0] text-[#D95D39] flex items-center justify-center font-bold">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-lg text-slate-900 leading-tight">
                    Precio Manual
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Toca las teclas para ingresar el monto sin teclado
                  </p>
                </div>
              </div>
              <button
                id="close-custom-price-modal-btn"
                type="button"
                onClick={() => {
                  setShowCustomPriceModal(false);
                  setCustomPriceVal('');
                }}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Display: Big Digital Screen */}
            <div className="mt-3 bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-3.5 text-white shadow-inner text-center">
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Monto Unitario
              </div>
              <div className="text-4xl font-black tracking-tight text-white flex items-center justify-center gap-1 my-0.5">
                <span className="text-amber-400 font-extrabold">$</span>
                <span>{customPriceVal || '0'}</span>
                <span className="w-0.5 h-8 bg-amber-400 animate-pulse ml-0.5 rounded-full inline-block"></span>
              </div>
              <div className="flex items-center justify-center gap-2 text-xs font-bold text-slate-300">
                <span className="bg-slate-700/80 px-2 py-0.5 rounded-md">
                  +{selectedMultiplier} {selectedMultiplier === 1 ? 'pieza' : 'piezas'}
                </span>
                <span>=</span>
                <span className="text-emerald-400 font-black text-sm">
                  ${((parseFloat(customPriceVal) || 0) * selectedMultiplier).toFixed(customPriceVal.includes('.') ? 2 : 0)}
                </span>
              </div>
            </div>

            {/* Fast 1-Touch Category Tags */}
            <div className="mt-3">
              <div className="text-[10px] font-extrabold uppercase text-slate-500 mb-1 flex items-center justify-between">
                <span>Concepto / Nombre:</span>
                <span className="text-slate-700 font-bold">{customPriceName}</span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {[
                  { label: 'Pan Esp.', fullName: 'Pan Especial', icon: '🥖' },
                  { label: 'Pastel', fullName: 'Pastel / Tarta', icon: '🎂' },
                  { label: 'Galletas', fullName: 'Galletas', icon: '🍪' },
                  { label: 'Repostería', fullName: 'Repostería Fina', icon: '🍩' },
                  { label: 'Varios', fullName: 'Producto Varios', icon: '🛒' }
                ].map((cat) => (
                  <button
                    key={cat.label}
                    type="button"
                    onClick={() => {
                      playBeep(700, 'sine', 0.02);
                      setCustomPriceName(cat.fullName);
                    }}
                    className={`py-1.5 px-1 rounded-xl text-[10px] font-extrabold flex flex-col items-center justify-center transition-all cursor-pointer border ${
                      customPriceName === cat.fullName
                        ? 'bg-[#D95D39] text-white border-[#D95D39] shadow-xs scale-102'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    <span className="text-xs mb-0.5">{cat.icon}</span>
                    <span className="truncate w-full text-center">{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* On-Screen Touch Keypad */}
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {/* Row 1 */}
              <button
                type="button"
                onClick={() => handleCustomPriceKeypad('7')}
                className="h-12 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-900 font-black text-xl rounded-xl border border-slate-200 shadow-2xs cursor-pointer flex items-center justify-center"
              >
                7
              </button>
              <button
                type="button"
                onClick={() => handleCustomPriceKeypad('8')}
                className="h-12 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-900 font-black text-xl rounded-xl border border-slate-200 shadow-2xs cursor-pointer flex items-center justify-center"
              >
                8
              </button>
              <button
                type="button"
                onClick={() => handleCustomPriceKeypad('9')}
                className="h-12 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-900 font-black text-xl rounded-xl border border-slate-200 shadow-2xs cursor-pointer flex items-center justify-center"
              >
                9
              </button>
              <button
                type="button"
                onClick={() => handleCustomPriceKeypad('BACKSPACE')}
                className="h-12 bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-700 font-bold text-sm rounded-xl border border-rose-200 shadow-2xs cursor-pointer flex flex-col items-center justify-center"
                title="Borrar último dígito"
              >
                <Delete className="w-5 h-5" />
                <span className="text-[8px] font-black uppercase leading-none mt-0.5">Borrar</span>
              </button>

              {/* Row 2 */}
              <button
                type="button"
                onClick={() => handleCustomPriceKeypad('4')}
                className="h-12 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-900 font-black text-xl rounded-xl border border-slate-200 shadow-2xs cursor-pointer flex items-center justify-center"
              >
                4
              </button>
              <button
                type="button"
                onClick={() => handleCustomPriceKeypad('5')}
                className="h-12 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-900 font-black text-xl rounded-xl border border-slate-200 shadow-2xs cursor-pointer flex items-center justify-center"
              >
                5
              </button>
              <button
                type="button"
                onClick={() => handleCustomPriceKeypad('6')}
                className="h-12 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-900 font-black text-xl rounded-xl border border-slate-200 shadow-2xs cursor-pointer flex items-center justify-center"
              >
                6
              </button>
              <button
                type="button"
                onClick={() => handleCustomPriceKeypad('C')}
                className="h-12 bg-slate-200 hover:bg-slate-300 active:scale-95 text-slate-800 font-black text-sm rounded-xl border border-slate-300 shadow-2xs cursor-pointer flex flex-col items-center justify-center"
                title="Limpiar monto a 0"
              >
                <span className="text-base font-black leading-none">C</span>
                <span className="text-[8px] font-black uppercase leading-none mt-0.5">Limpiar</span>
              </button>

              {/* Row 3 */}
              <button
                type="button"
                onClick={() => handleCustomPriceKeypad('1')}
                className="h-12 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-900 font-black text-xl rounded-xl border border-slate-200 shadow-2xs cursor-pointer flex items-center justify-center"
              >
                1
              </button>
              <button
                type="button"
                onClick={() => handleCustomPriceKeypad('2')}
                className="h-12 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-900 font-black text-xl rounded-xl border border-slate-200 shadow-2xs cursor-pointer flex items-center justify-center"
              >
                2
              </button>
              <button
                type="button"
                onClick={() => handleCustomPriceKeypad('3')}
                className="h-12 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-900 font-black text-xl rounded-xl border border-slate-200 shadow-2xs cursor-pointer flex items-center justify-center"
              >
                3
              </button>
              <button
                type="button"
                onClick={() => handleCustomPriceKeypad('+10')}
                className="h-12 bg-amber-50 hover:bg-amber-100 active:scale-95 text-amber-900 font-black text-sm rounded-xl border border-amber-300 shadow-2xs cursor-pointer flex flex-col items-center justify-center"
              >
                <span className="text-xs font-black">+10</span>
                <span className="text-[7.5px] font-bold text-amber-700">pesos</span>
              </button>

              {/* Row 4 */}
              <button
                type="button"
                onClick={() => handleCustomPriceKeypad('0')}
                className="h-12 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-900 font-black text-xl rounded-xl border border-slate-200 shadow-2xs cursor-pointer flex items-center justify-center"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => handleCustomPriceKeypad('00')}
                className="h-12 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-900 font-black text-base rounded-xl border border-slate-200 shadow-2xs cursor-pointer flex items-center justify-center"
              >
                00
              </button>
              <button
                type="button"
                onClick={() => handleCustomPriceKeypad('.')}
                className="h-12 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-900 font-black text-xl rounded-xl border border-slate-200 shadow-2xs cursor-pointer flex items-center justify-center"
              >
                .
              </button>
              <button
                type="button"
                onClick={() => handleCustomPriceKeypad('+50')}
                className="h-12 bg-amber-50 hover:bg-amber-100 active:scale-95 text-amber-900 font-black text-sm rounded-xl border border-amber-300 shadow-2xs cursor-pointer flex flex-col items-center justify-center"
              >
                <span className="text-xs font-black">+50</span>
                <span className="text-[7.5px] font-bold text-amber-700">pesos</span>
              </button>
            </div>

            {/* Modal Bottom Actions */}
            <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowCustomPriceModal(false);
                  setCustomPriceVal('');
                }}
                className="w-1/3 py-3 rounded-2xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                id="confirm-custom-price-btn"
                disabled={!customPriceVal || parseFloat(customPriceVal) <= 0}
                onClick={() => handleAddCustomPriceSubmit()}
                className="w-2/3 py-3 rounded-2xl bg-gradient-to-r from-[#D95D39] to-[#bf4c2a] hover:from-[#bf4c2a] hover:to-[#a33e20] disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm shadow-md shadow-[#D95D3933] transition-all active:scale-98 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>
                  Agregar ${( (parseFloat(customPriceVal) || 0) * selectedMultiplier ).toFixed(customPriceVal.includes('.') ? 2 : 0)}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Cantidad Personalizada / Multiplicador de Piezas con Teclado Virtual Táctil */}
      {showNumpadModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl p-5 shadow-2xl max-w-md w-full border-2 border-[#D95D39]/30 animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#FFF5F0] text-[#D95D39] flex items-center justify-center font-bold">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-lg text-slate-900 leading-tight">
                    Cantidad de Piezas
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Toca las teclas para ingresar el número de piezas sin teclado físico
                  </p>
                </div>
              </div>
              <button
                id="close-numpad-modal-btn"
                type="button"
                onClick={() => {
                  setShowNumpadModal(false);
                  setNumpadValue('');
                }}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Display: Big Digital Screen */}
            <div className="mt-3 bg-gradient-to-br from-slate-950 to-slate-900 rounded-2xl p-4 text-white shadow-inner text-center border-2 border-amber-400">
              <div className="text-xs uppercase font-black text-amber-300 tracking-wider">
                Multiplicador / Cantidad de Piezas
              </div>
              <div className="text-5xl sm:text-6xl font-black tracking-tight text-white flex items-center justify-center gap-2 my-1">
                <span className="text-amber-400 font-black font-mono">{numpadValue || '0'}</span>
                <span className="text-2xl font-black text-slate-300 ml-1">piezas</span>
                <span className="w-1 h-10 bg-amber-400 animate-pulse ml-0.5 rounded-full inline-block"></span>
              </div>
              <div className="text-xs font-bold text-slate-300">
                Al tocar cualquier precio de pan se multiplicará por{' '}
                <strong className="text-amber-300 text-sm font-black font-mono">{numpadValue || '0'}</strong>
              </div>
            </div>

            {/* Botones de Acceso Rápido Frecuentes (+5, +10, +20, +50, +100) */}
            <div className="mt-3">
              <div className="text-xs font-black uppercase text-slate-700 mb-1">
                Sumar Rápido:
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {['+5', '+10', '+12', '+20', '+50'].map((btn) => (
                  <button
                    key={btn}
                    type="button"
                    onClick={() => handleCustomMultiplierKeypad(btn)}
                    className="py-2 px-1 rounded-xl text-sm font-black bg-amber-50 hover:bg-amber-100 text-amber-950 border-2 border-amber-400 active:scale-95 cursor-pointer shadow-xs transition-all flex flex-col items-center justify-center"
                  >
                    <span>{btn}</span>
                    <span className="text-[9px] font-bold text-amber-800">pzs</span>
                  </button>
                ))}
              </div>
            </div>

            {/* On-Screen Touch Keypad for Quantities */}
            <div className="mt-3.5 grid grid-cols-4 gap-2">
              {/* Row 1 */}
              <button
                type="button"
                onClick={() => handleCustomMultiplierKeypad('7')}
                className="h-14 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-950 font-black text-2xl rounded-2xl border-2 border-slate-300 shadow-xs cursor-pointer flex items-center justify-center"
              >
                7
              </button>
              <button
                type="button"
                onClick={() => handleCustomMultiplierKeypad('8')}
                className="h-14 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-950 font-black text-2xl rounded-2xl border-2 border-slate-300 shadow-xs cursor-pointer flex items-center justify-center"
              >
                8
              </button>
              <button
                type="button"
                onClick={() => handleCustomMultiplierKeypad('9')}
                className="h-14 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-950 font-black text-2xl rounded-2xl border-2 border-slate-300 shadow-xs cursor-pointer flex items-center justify-center"
              >
                9
              </button>
              <button
                type="button"
                onClick={() => handleCustomMultiplierKeypad('BACKSPACE')}
                className="h-14 bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-800 font-black text-sm rounded-2xl border-2 border-rose-300 shadow-xs cursor-pointer flex flex-col items-center justify-center"
                title="Borrar último dígito"
              >
                <Delete className="w-6 h-6 stroke-[2.5]" />
                <span className="text-[9px] font-black uppercase leading-none mt-0.5">Borrar</span>
              </button>

              {/* Row 2 */}
              <button
                type="button"
                onClick={() => handleCustomMultiplierKeypad('4')}
                className="h-14 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-950 font-black text-2xl rounded-2xl border-2 border-slate-300 shadow-xs cursor-pointer flex items-center justify-center"
              >
                4
              </button>
              <button
                type="button"
                onClick={() => handleCustomMultiplierKeypad('5')}
                className="h-14 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-950 font-black text-2xl rounded-2xl border-2 border-slate-300 shadow-xs cursor-pointer flex items-center justify-center"
              >
                5
              </button>
              <button
                type="button"
                onClick={() => handleCustomMultiplierKeypad('6')}
                className="h-14 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-950 font-black text-2xl rounded-2xl border-2 border-slate-300 shadow-xs cursor-pointer flex items-center justify-center"
              >
                6
              </button>
              <button
                type="button"
                onClick={() => handleCustomMultiplierKeypad('C')}
                className="h-14 bg-slate-200 hover:bg-slate-300 active:scale-95 text-slate-900 font-black text-base rounded-2xl border-2 border-slate-400 shadow-xs cursor-pointer flex flex-col items-center justify-center"
                title="Limpiar a 0"
              >
                <span className="text-xl font-black leading-none">C</span>
                <span className="text-[9px] font-black uppercase leading-none mt-0.5">Limpiar</span>
              </button>

              {/* Row 3 */}
              <button
                type="button"
                onClick={() => handleCustomMultiplierKeypad('1')}
                className="h-14 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-950 font-black text-2xl rounded-2xl border-2 border-slate-300 shadow-xs cursor-pointer flex items-center justify-center"
              >
                1
              </button>
              <button
                type="button"
                onClick={() => handleCustomMultiplierKeypad('2')}
                className="h-14 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-950 font-black text-2xl rounded-2xl border-2 border-slate-300 shadow-xs cursor-pointer flex items-center justify-center"
              >
                2
              </button>
              <button
                type="button"
                onClick={() => handleCustomMultiplierKeypad('3')}
                className="h-14 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-950 font-black text-2xl rounded-2xl border-2 border-slate-300 shadow-xs cursor-pointer flex items-center justify-center"
              >
                3
              </button>
              <button
                type="button"
                onClick={() => handleCustomMultiplierKeypad('+100')}
                className="h-14 bg-amber-50 hover:bg-amber-100 active:scale-95 text-amber-950 font-black text-sm rounded-2xl border-2 border-amber-400 shadow-xs cursor-pointer flex flex-col items-center justify-center"
              >
                <span className="text-sm font-black">+100</span>
                <span className="text-[9px] font-bold text-amber-800">pzs</span>
              </button>

              {/* Row 4 */}
              <button
                type="button"
                onClick={() => handleCustomMultiplierKeypad('0')}
                className="col-span-2 h-14 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-950 font-black text-2xl rounded-2xl border-2 border-slate-300 shadow-xs cursor-pointer flex items-center justify-center"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => handleCustomMultiplierKeypad('00')}
                className="h-14 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-950 font-black text-xl rounded-2xl border-2 border-slate-300 shadow-xs cursor-pointer flex items-center justify-center"
              >
                00
              </button>
              <button
                type="button"
                onClick={() => handleCustomMultiplierKeypad('+1')}
                className="h-14 bg-amber-50 hover:bg-amber-100 active:scale-95 text-amber-950 font-black text-sm rounded-2xl border-2 border-amber-400 shadow-xs cursor-pointer flex flex-col items-center justify-center"
              >
                <span className="text-sm font-black">+1</span>
                <span className="text-[9px] font-bold text-amber-800">pza</span>
              </button>
            </div>

            {/* Modal Bottom Actions */}
            <div className="flex gap-2.5 mt-4 pt-3 border-t-2 border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowNumpadModal(false);
                  setNumpadValue('');
                }}
                className="w-1/3 py-3.5 rounded-2xl border-2 border-slate-300 text-slate-800 font-black text-sm hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                id="confirm-custom-multiplier-btn"
                disabled={!numpadValue || parseInt(numpadValue, 10) <= 0}
                onClick={() => handleConfirmCustomMultiplierSubmit()}
                className="w-2/3 py-3.5 rounded-2xl bg-gradient-to-r from-[#D95D39] to-[#bf4c2a] hover:from-[#bf4c2a] hover:to-[#a33e20] disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-base shadow-md shadow-[#D95D3933] transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer border-2 border-[#a33e20]"
              >
                <Check className="w-5 h-5 stroke-[2.5]" />
                <span>
                  Establecer {numpadValue || '0'} {parseInt(numpadValue, 10) === 1 ? 'Pieza' : 'Piezas'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Teclado Virtual para Cliente / Club de Puntos (Solo Teléfono, Sin Nombre) */}
      {showCustomerPhoneKeyboardModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl p-5 shadow-2xl max-w-md w-full border-2 border-amber-400 animate-in fade-in zoom-in-95">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-amber-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-2xl bg-amber-100 text-amber-900 border border-amber-300 flex items-center justify-center font-bold shadow-xs">
                  <Phone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base sm:text-lg text-slate-900 leading-tight flex items-center gap-1.5">
                    <span>Club Puntos Santa Fé</span>
                    <span className="text-[10px] bg-amber-200 text-amber-950 font-bold px-1.5 py-0.2 rounded font-mono">
                      $20 = 1pt
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-600 font-bold">
                    Ingresa el teléfono del cliente (solo 10 dígitos)
                  </p>
                </div>
              </div>
              <button
                id="close-phone-keyboard-modal-btn"
                type="button"
                onClick={() => setShowCustomerPhoneKeyboardModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Display Pantalla Digital del Teléfono */}
            <div className="mt-3 bg-gradient-to-br from-slate-950 to-slate-900 rounded-2xl p-4 text-white shadow-inner border-2 border-amber-400 text-center">
              <div className="text-[10px] uppercase font-black text-amber-300 tracking-wider flex items-center justify-between px-1">
                <span>Teléfono Celular</span>
                <span className="font-mono">{virtualPhoneInput.replace(/\D/g, '').length} / 10 dígitos</span>
              </div>
              <div className="text-2xl sm:text-3xl font-mono font-black text-amber-400 tracking-wider py-1 select-none flex items-center justify-center gap-1">
                {virtualPhoneInput.replace(/\D/g, '').length === 0 ? (
                  <span className="text-slate-500 text-lg sm:text-xl font-sans font-bold">_ _ _  _ _ _  _ _ _ _</span>
                ) : (
                  (() => {
                    const clean = virtualPhoneInput.replace(/\D/g, '');
                    if (clean.length <= 3) return clean;
                    if (clean.length <= 6) return `${clean.slice(0, 3)} ${clean.slice(3)}`;
                    return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6)}`;
                  })()
                )}
                <span className="inline-block w-1.5 h-6 bg-amber-400 animate-pulse ml-1" />
              </div>
            </div>

            {/* Estado de Detección en tiempo real */}
            {(() => {
              const clean = virtualPhoneInput.replace(/\D/g, '');
              const found = clean.length >= 7 ? customers.find(c => c.phone.replace(/\D/g, '') === clean) : null;

              if (found) {
                return (
                  <div className="mt-2.5 p-2.5 rounded-xl bg-emerald-50 border border-emerald-300 flex items-center justify-between gap-2 animate-in fade-in">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-black text-emerald-950">
                        <span>✅ Cliente Registrado</span>
                      </div>
                      <div className="text-[11px] text-emerald-800 font-bold">
                        Saldo: <strong className="font-mono text-emerald-900 font-black">{found.points} pts</strong> (${found.points}.00 de descuento)
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRegisterOrSelectPhone(found.phone)}
                      className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-black px-3 py-1.5 rounded-lg shadow-xs cursor-pointer shrink-0"
                    >
                      Seleccionar ⭐
                    </button>
                  </div>
                );
              }

              if (clean.length >= 7) {
                return (
                  <div className="mt-2.5 p-2.5 rounded-xl bg-amber-50 border border-amber-300 flex items-center justify-between gap-2 animate-in fade-in">
                    <div className="min-w-0">
                      <div className="text-xs font-black text-amber-950">
                        ⭐ Teléfono Nuevo
                      </div>
                      <div className="text-[10px] text-amber-800 font-bold">
                        Listo para afiliar y acumular puntos en esta venta
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRegisterOrSelectPhone(clean)}
                      className="bg-[#D95D39] hover:bg-[#BF4C2A] active:scale-95 text-white text-xs font-black px-3 py-1.5 rounded-lg shadow-xs cursor-pointer shrink-0 flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Afiliar Ahora</span>
                    </button>
                  </div>
                );
              }

              return (
                <div className="mt-2.5 py-1.5 text-center text-slate-500 text-xs font-medium">
                  Presiona los números en pantalla para ingresar los 10 dígitos.
                </div>
              );
            })()}

            {/* Teclado Numérico Virtual Táctil */}
            <div className="grid grid-cols-3 gap-2 mt-3">
              {[
                { label: '1', key: '1' },
                { label: '2', key: '2' },
                { label: '3', key: '3' },
                { label: '4', key: '4' },
                { label: '5', key: '5' },
                { label: '6', key: '6' },
                { label: '7', key: '7' },
                { label: '8', key: '8' },
                { label: '9', key: '9' },
                { label: 'C', sub: 'Limpiar', key: 'CLEAR', bg: 'bg-slate-200 hover:bg-slate-300 text-slate-900 border-slate-300' },
                { label: '0', key: '0' },
                { label: '⌫', sub: 'Borrar', key: 'BACKSPACE', bg: 'bg-rose-100 hover:bg-rose-200 text-rose-900 border-rose-300' }
              ].map((btn, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleVirtualPhoneKeyPress(btn.key)}
                  className={`h-13 sm:h-15 active:scale-95 font-black rounded-2xl border-2 shadow-xs cursor-pointer flex flex-col items-center justify-center transition-transform ${
                    btn.bg || 'bg-slate-100 hover:bg-slate-200 text-slate-950 text-2xl border-slate-300'
                  }`}
                >
                  <span className={btn.key === 'CLEAR' || btn.key === 'BACKSPACE' ? 'text-lg leading-none' : 'text-2xl leading-none'}>
                    {btn.label}
                  </span>
                  {btn.sub && (
                    <span className="text-[9px] font-black uppercase tracking-tight leading-none mt-0.5">
                      {btn.sub}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Acciones Inferiores del Modal */}
            <div className="flex gap-2.5 mt-3.5 pt-3 border-t-2 border-slate-100">
              <button
                type="button"
                onClick={() => setShowCustomerPhoneKeyboardModal(false)}
                className="w-1/3 py-3 rounded-2xl border-2 border-slate-300 text-slate-800 font-black text-xs sm:text-sm hover:bg-slate-50 cursor-pointer"
              >
                Cerrar
              </button>
              {(() => {
                const clean = virtualPhoneInput.replace(/\D/g, '');
                const found = clean.length >= 7 ? customers.find(c => c.phone.replace(/\D/g, '') === clean) : null;
                const canAffiliate = clean.length >= 7;

                return (
                  <button
                    type="button"
                    disabled={!canAffiliate}
                    onClick={() => handleRegisterOrSelectPhone(clean)}
                    className="w-2/3 py-3 rounded-2xl bg-gradient-to-r from-[#D95D39] to-[#bf4c2a] hover:from-[#bf4c2a] hover:to-[#a33e20] disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm shadow-md shadow-[#D95D3933] transition-all active:scale-98 flex items-center justify-center gap-1.5 cursor-pointer border-2 border-[#a33e20]"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {found ? `Seleccionar (${found.points} pts)` : canAffiliate ? `Afiliar Teléfono` : `Ingresa Teléfono`}
                    </span>
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Modal / Selector Rápido de Postres (Pastel 65, Pastel 35, Galletas 65, Gelatina 20, Arroz con Leche 25) */}
      {showPostresModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 shadow-2xl max-w-md w-full border-2 border-pink-400 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-pink-100">
              <div className="flex items-center gap-2">
                <span className="text-3xl">🍰</span>
                <div>
                  <h3 className="font-black text-lg text-slate-900 leading-tight">
                    Seleccionar Postre
                  </h3>
                  <p className="text-xs text-pink-800 font-bold">
                    Se agregarán {selectedMultiplier} {selectedMultiplier === 1 ? 'pieza' : 'piezas'}
                  </p>
                </div>
              </div>
              <button
                id="close-postres-modal-btn"
                onClick={() => setShowPostresModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 my-3.5">
              {/* 1. Pastel $65 */}
              <button
                id="postre-opt-pastel-65"
                type="button"
                onClick={() => {
                  handleAddPrice(65, 'Pastel $65', 'p_pastel_65');
                  setShowPostresModal(false);
                }}
                className="group relative bg-gradient-to-b from-rose-50 to-white hover:from-rose-100 hover:to-rose-50 border-2 border-rose-300 hover:border-rose-500 rounded-2xl p-3 flex flex-col items-center justify-center text-center transition-all active:scale-95 shadow-sm hover:shadow-md cursor-pointer h-28"
              >
                <span className="text-3xl mb-1">🎂</span>
                <span className="text-2xl font-black text-rose-950 group-hover:text-rose-700 tracking-tight">
                  $65
                </span>
                <span className="text-xs font-black text-rose-900 mt-0.5">
                  Pastel $65
                </span>
                {selectedMultiplier > 1 && (
                  <span className="mt-1 bg-rose-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full shadow-xs">
                    =${selectedMultiplier * 65}
                  </span>
                )}
              </button>

              {/* 2. Pastel $35 */}
              <button
                id="postre-opt-pastel-35"
                type="button"
                onClick={() => {
                  handleAddPrice(35, 'Pastel $35', 'p_pastel_35');
                  setShowPostresModal(false);
                }}
                className="group relative bg-gradient-to-b from-pink-50 to-white hover:from-pink-100 hover:to-pink-50 border-2 border-pink-300 hover:border-pink-500 rounded-2xl p-3 flex flex-col items-center justify-center text-center transition-all active:scale-95 shadow-sm hover:shadow-md cursor-pointer h-28"
              >
                <span className="text-3xl mb-1">🍰</span>
                <span className="text-2xl font-black text-pink-950 group-hover:text-pink-700 tracking-tight">
                  $35
                </span>
                <span className="text-xs font-black text-pink-900 mt-0.5">
                  Pastel $35
                </span>
                {selectedMultiplier > 1 && (
                  <span className="mt-1 bg-pink-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full shadow-xs">
                    =${selectedMultiplier * 35}
                  </span>
                )}
              </button>

              {/* 3. Galletas $65 */}
              <button
                id="postre-opt-galletas-65"
                type="button"
                onClick={() => {
                  handleAddPrice(65, 'Galletas $65', 'p_galletas_65');
                  setShowPostresModal(false);
                }}
                className="group relative bg-gradient-to-b from-amber-50 to-white hover:from-amber-100 hover:to-amber-50 border-2 border-amber-300 hover:border-amber-500 rounded-2xl p-3 flex flex-col items-center justify-center text-center transition-all active:scale-95 shadow-sm hover:shadow-md cursor-pointer h-28"
              >
                <span className="text-3xl mb-1">🍪</span>
                <span className="text-2xl font-black text-amber-950 group-hover:text-amber-700 tracking-tight">
                  $65
                </span>
                <span className="text-xs font-black text-amber-900 mt-0.5">
                  Galletas $65
                </span>
                {selectedMultiplier > 1 && (
                  <span className="mt-1 bg-amber-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full shadow-xs">
                    =${selectedMultiplier * 65}
                  </span>
                )}
              </button>

              {/* 4. Gelatina $20 */}
              <button
                id="postre-opt-gelatina-20"
                type="button"
                onClick={() => {
                  handleAddPrice(20, 'Gelatina $20', 'p_gelatina_20');
                  setShowPostresModal(false);
                }}
                className="group relative bg-gradient-to-b from-purple-50 to-white hover:from-purple-100 hover:to-purple-50 border-2 border-purple-300 hover:border-purple-500 rounded-2xl p-3 flex flex-col items-center justify-center text-center transition-all active:scale-95 shadow-sm hover:shadow-md cursor-pointer h-28"
              >
                <span className="text-3xl mb-1">🍮</span>
                <span className="text-2xl font-black text-purple-950 group-hover:text-purple-700 tracking-tight">
                  $20
                </span>
                <span className="text-xs font-black text-purple-900 mt-0.5">
                  Gelatina $20
                </span>
                {selectedMultiplier > 1 && (
                  <span className="mt-1 bg-purple-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full shadow-xs">
                    =${selectedMultiplier * 20}
                  </span>
                )}
              </button>

              {/* 5. Arroz con Leche $25 */}
              <button
                id="postre-opt-arroz-25"
                type="button"
                onClick={() => {
                  handleAddPrice(25, 'Arroz con Leche $25', 'p_arroz_leche_25');
                  setShowPostresModal(false);
                }}
                className="group relative bg-gradient-to-b from-orange-50 to-white hover:from-orange-100 hover:to-orange-50 border-2 border-orange-300 hover:border-orange-500 rounded-2xl p-3 flex flex-col items-center justify-center text-center transition-all active:scale-95 shadow-sm hover:shadow-md cursor-pointer h-28 col-span-2 sm:col-span-1"
              >
                <span className="text-3xl mb-1">🍚</span>
                <span className="text-2xl font-black text-orange-950 group-hover:text-orange-700 tracking-tight">
                  $25
                </span>
                <span className="text-xs font-black text-orange-900 mt-0.5">
                  Arroz con Leche
                </span>
                {selectedMultiplier > 1 && (
                  <span className="mt-1 bg-orange-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full shadow-xs">
                    =${selectedMultiplier * 25}
                  </span>
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowPostresModal(false)}
              className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modal / Selector Rápido de Leche (Lechita 18 o Leche Grande 35) */}
      {showLecheModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 shadow-2xl max-w-sm w-full border-2 border-sky-400 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-sky-100">
              <div className="flex items-center gap-2">
                <span className="text-3xl">🥛</span>
                <div>
                  <h3 className="font-black text-lg text-slate-900 leading-tight">
                    Seleccionar Leche
                  </h3>
                  <p className="text-xs text-sky-800 font-bold">
                    Se agregarán {selectedMultiplier} {selectedMultiplier === 1 ? 'pieza' : 'piezas'}
                  </p>
                </div>
              </div>
              <button
                id="close-leche-modal-btn"
                type="button"
                onClick={() => setShowLecheModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 my-4">
              <button
                id="leche-opt-lechita-18"
                type="button"
                onClick={() => {
                  handleAddPrice(18, 'Lechita $18', 'p_lechitas_18');
                  setShowLecheModal(false);
                }}
                className="group relative bg-gradient-to-b from-sky-50 to-white hover:from-sky-100 hover:to-sky-50 border-2 border-sky-300 hover:border-sky-500 rounded-2xl p-4 flex flex-col items-center justify-center text-center transition-all active:scale-95 shadow-sm hover:shadow-md cursor-pointer h-28"
              >
                <span className="text-3xl mb-1">🧃</span>
                <span className="text-2xl font-black text-sky-950 group-hover:text-sky-700 tracking-tight">
                  $18
                </span>
                <span className="text-xs font-black text-sky-900 mt-0.5">
                  Lechita
                </span>
                {selectedMultiplier > 1 && (
                  <span className="mt-1 bg-sky-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full shadow-xs">
                    =${selectedMultiplier * 18}
                  </span>
                )}
              </button>

              <button
                id="leche-opt-grande-35"
                type="button"
                onClick={() => {
                  handleAddPrice(35, 'Leche Grande $35', 'p_leche_grande_35');
                  setShowLecheModal(false);
                }}
                className="group relative bg-gradient-to-b from-blue-50 to-white hover:from-blue-100 hover:to-blue-50 border-2 border-blue-300 hover:border-blue-500 rounded-2xl p-4 flex flex-col items-center justify-center text-center transition-all active:scale-95 shadow-sm hover:shadow-md cursor-pointer h-28"
              >
                <span className="text-3xl mb-1">🥛</span>
                <span className="text-2xl font-black text-blue-950 group-hover:text-blue-700 tracking-tight">
                  $35
                </span>
                <span className="text-xs font-black text-blue-900 mt-0.5">
                  Leche Grande
                </span>
                {selectedMultiplier > 1 && (
                  <span className="mt-1 bg-blue-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full shadow-xs">
                    =${selectedMultiplier * 35}
                  </span>
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowLecheModal(false)}
              className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modal / Selector Rápido de Chocolate Abuelita (Tableta 60 o Caja 180) */}
      {showChocolateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 shadow-2xl max-w-md w-full border-2 border-amber-400 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-amber-100">
              <div className="flex items-center gap-2">
                <span className="text-3xl">🍫</span>
                <div>
                  <h3 className="font-black text-lg text-slate-900 leading-tight">
                    Chocolate Abuelita
                  </h3>
                  <p className="text-xs text-amber-800 font-bold">
                    Se agregarán {selectedMultiplier} {selectedMultiplier === 1 ? 'pieza' : 'piezas'}
                  </p>
                </div>
              </div>
              <button
                id="close-chocolate-modal-btn"
                type="button"
                onClick={() => setShowChocolateModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5 my-4">
              <button
                id="chocolate-opt-tabletilla-30"
                type="button"
                onClick={() => {
                  handleAddPrice(30, 'Chocolate Abuelita Tabletilla $30', 'p_choco_abuelita_tab_30');
                  setShowChocolateModal(false);
                }}
                className="group relative bg-gradient-to-b from-amber-50 to-white hover:from-amber-100 hover:to-amber-50 border-2 border-amber-300 hover:border-amber-500 rounded-2xl p-3 flex flex-col items-center justify-center text-center transition-all active:scale-95 shadow-sm hover:shadow-md cursor-pointer h-28"
              >
                <span className="text-2xl mb-1">🍫</span>
                <span className="text-xl font-black text-amber-950 group-hover:text-amber-700 tracking-tight">
                  $30
                </span>
                <span className="text-[11px] font-black text-amber-900 mt-0.5 truncate max-w-full">
                  Tabletilla
                </span>
                {selectedMultiplier > 1 && (
                  <span className="mt-1 bg-amber-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full shadow-xs">
                    =${selectedMultiplier * 30}
                  </span>
                )}
              </button>

              <button
                id="chocolate-opt-tableta-60"
                type="button"
                onClick={() => {
                  handleAddPrice(60, 'Chocolate Abuelita Tableta $60', 'p_choco_abuelita_tab_60');
                  setShowChocolateModal(false);
                }}
                className="group relative bg-gradient-to-b from-amber-50 to-white hover:from-amber-100 hover:to-amber-50 border-2 border-amber-300 hover:border-amber-500 rounded-2xl p-3 flex flex-col items-center justify-center text-center transition-all active:scale-95 shadow-sm hover:shadow-md cursor-pointer h-28"
              >
                <span className="text-2xl mb-1">🍫</span>
                <span className="text-xl font-black text-amber-950 group-hover:text-amber-700 tracking-tight">
                  $60
                </span>
                <span className="text-[11px] font-black text-amber-900 mt-0.5 truncate max-w-full">
                  Tableta
                </span>
                {selectedMultiplier > 1 && (
                  <span className="mt-1 bg-amber-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full shadow-xs">
                    =${selectedMultiplier * 60}
                  </span>
                )}
              </button>

              <button
                id="chocolate-opt-caja-180"
                type="button"
                onClick={() => {
                  handleAddPrice(180, 'Chocolate Abuelita Caja $180', 'p_choco_abuelita_caja_180');
                  setShowChocolateModal(false);
                }}
                className="group relative bg-gradient-to-b from-orange-50 to-white hover:from-orange-100 hover:to-orange-50 border-2 border-orange-300 hover:border-orange-500 rounded-2xl p-3 flex flex-col items-center justify-center text-center transition-all active:scale-95 shadow-sm hover:shadow-md cursor-pointer h-28"
              >
                <span className="text-2xl mb-1">📦</span>
                <span className="text-xl font-black text-orange-950 group-hover:text-orange-700 tracking-tight">
                  $180
                </span>
                <span className="text-[11px] font-black text-orange-900 mt-0.5 truncate max-w-full">
                  Caja
                </span>
                {selectedMultiplier > 1 && (
                  <span className="mt-1 bg-orange-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full shadow-xs">
                    =${selectedMultiplier * 180}
                  </span>
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowChocolateModal(false)}
              className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modal / Selector Rápido de Complementos (Café 130, Miel 170, Nata 90, Cajeta 130) */}
      {showComplementosModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 shadow-2xl max-w-md w-full border-2 border-amber-400 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-amber-100">
              <div className="flex items-center gap-2">
                <span className="text-3xl">🍯</span>
                <div>
                  <h3 className="font-black text-lg text-slate-900 leading-tight">
                    Complementos
                  </h3>
                  <p className="text-xs text-amber-800 font-bold">
                    Se agregarán {selectedMultiplier} {selectedMultiplier === 1 ? 'pieza' : 'piezas'}
                  </p>
                </div>
              </div>
              <button
                id="close-complementos-modal-btn"
                type="button"
                onClick={() => setShowComplementosModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 my-4">
              {/* Café $130 */}
              <button
                id="complemento-opt-cafe-130"
                type="button"
                onClick={() => {
                  handleAddPrice(130, 'Café $130', 'p_cafe_130');
                  setShowComplementosModal(false);
                }}
                className="group relative bg-gradient-to-b from-amber-50 to-orange-100/60 hover:from-amber-100 hover:to-orange-100 border-2 border-amber-300 hover:border-amber-500 rounded-2xl p-3 flex flex-col items-center justify-center text-center transition-all active:scale-95 shadow-sm hover:shadow-md cursor-pointer h-28"
              >
                <span className="text-2xl mb-1">☕</span>
                <span className="text-xl font-black text-amber-950 group-hover:text-amber-800 tracking-tight">
                  $130
                </span>
                <span className="text-xs font-black text-amber-900 mt-0.5">
                  Café
                </span>
                {selectedMultiplier > 1 && (
                  <span className="mt-1 bg-amber-700 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full shadow-xs">
                    =${selectedMultiplier * 130}
                  </span>
                )}
              </button>

              {/* Miel $170 */}
              <button
                id="complemento-opt-miel-170"
                type="button"
                onClick={() => {
                  handleAddPrice(170, 'Miel $170', 'p_miel_170');
                  setShowComplementosModal(false);
                }}
                className="group relative bg-gradient-to-b from-yellow-50 to-amber-100/70 hover:from-yellow-100 hover:to-amber-100 border-2 border-yellow-400 hover:border-yellow-600 rounded-2xl p-3 flex flex-col items-center justify-center text-center transition-all active:scale-95 shadow-sm hover:shadow-md cursor-pointer h-28"
              >
                <span className="text-2xl mb-1">🍯</span>
                <span className="text-xl font-black text-amber-950 group-hover:text-amber-800 tracking-tight">
                  $170
                </span>
                <span className="text-xs font-black text-amber-900 mt-0.5">
                  Miel
                </span>
                {selectedMultiplier > 1 && (
                  <span className="mt-1 bg-yellow-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full shadow-xs">
                    =${selectedMultiplier * 170}
                  </span>
                )}
              </button>

              {/* Nata $90 */}
              <button
                id="complemento-opt-nata-90"
                type="button"
                onClick={() => {
                  handleAddPrice(90, 'Nata $90', 'p_nata');
                  setShowComplementosModal(false);
                }}
                className="group relative bg-gradient-to-b from-sky-50 to-white hover:from-sky-100 hover:to-sky-50 border-2 border-sky-300 hover:border-sky-500 rounded-2xl p-3 flex flex-col items-center justify-center text-center transition-all active:scale-95 shadow-sm hover:shadow-md cursor-pointer h-28"
              >
                <span className="text-2xl mb-1">🍶</span>
                <span className="text-xl font-black text-sky-950 group-hover:text-sky-700 tracking-tight">
                  $90
                </span>
                <span className="text-xs font-black text-sky-900 mt-0.5">
                  Nata
                </span>
                {selectedMultiplier > 1 && (
                  <span className="mt-1 bg-sky-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full shadow-xs">
                    =${selectedMultiplier * 90}
                  </span>
                )}
              </button>

              {/* Cajeta $130 */}
              <button
                id="complemento-opt-cajeta-130"
                type="button"
                onClick={() => {
                  handleAddPrice(130, 'Cajeta $130', 'p_cajeta_130');
                  setShowComplementosModal(false);
                }}
                className="group relative bg-gradient-to-b from-orange-50 to-amber-100/80 hover:from-orange-100 hover:to-amber-100 border-2 border-orange-300 hover:border-orange-500 rounded-2xl p-3 flex flex-col items-center justify-center text-center transition-all active:scale-95 shadow-sm hover:shadow-md cursor-pointer h-28"
              >
                <span className="text-2xl mb-1">🍮</span>
                <span className="text-xl font-black text-orange-950 group-hover:text-orange-800 tracking-tight">
                  $130
                </span>
                <span className="text-xs font-black text-orange-900 mt-0.5">
                  Cajeta
                </span>
                {selectedMultiplier > 1 && (
                  <span className="mt-1 bg-orange-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full shadow-xs">
                    =${selectedMultiplier * 130}
                  </span>
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowComplementosModal(false)}
              className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modal / Selector Rápido de Paletas (Cantidades del 1 al 5 y Precios $40, $45, $50 en la misma ventana emergente) */}
      {showPaletasModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 shadow-2xl max-w-sm w-full border-2 border-purple-400 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-purple-100">
              <div className="flex items-center gap-2">
                <span className="text-3xl">🍧</span>
                <div>
                  <h3 className="font-black text-lg text-slate-900 leading-tight">
                    Paletas de Hielo
                  </h3>
                  <p className="text-xs text-purple-800 font-bold">
                    Elige cantidad (1 a 5) y luego el precio
                  </p>
                </div>
              </div>
              <button
                id="close-paletas-modal-btn"
                type="button"
                onClick={() => setShowPaletasModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Paso 1 en la ventana: Selección de Cantidad del 1 al 5 */}
            <div className="my-3">
              <div className="flex items-center justify-between mb-1.5 px-1">
                <span className="text-[11px] font-black uppercase text-purple-950 tracking-wider">
                  1. Cantidad de Paletas:
                </span>
                <span className="text-xs font-black text-purple-700 font-mono bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                  {paletasQty} {paletasQty === 1 ? 'paleta' : 'paletas'}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {[1, 2, 3, 4, 5].map((qty) => {
                  const isSelected = paletasQty === qty;
                  return (
                    <button
                      key={qty}
                      id={`paleta-qty-btn-${qty}`}
                      type="button"
                      onClick={() => {
                        playBeep(520 + qty * 40, 'sine', 0.04);
                        setPaletasQty(qty);
                      }}
                      className={`h-12 rounded-xl font-black text-lg flex flex-col items-center justify-center transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-purple-600 text-white shadow-md ring-2 ring-purple-400 scale-102'
                          : 'bg-purple-50/70 hover:bg-purple-100 text-purple-950 border border-purple-200 hover:border-purple-400'
                      }`}
                    >
                      <span className="leading-none">{qty}</span>
                      <span className={`text-[8px] font-bold leading-none mt-0.5 ${isSelected ? 'text-purple-100' : 'text-purple-600'}`}>
                        {qty === 1 ? 'pza' : 'pzs'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Paso 2 en la ventana: Selección de Precio ($40, $45, $50) */}
            <div className="my-3">
              <div className="flex items-center justify-between mb-1.5 px-1">
                <span className="text-[11px] font-black uppercase text-purple-950 tracking-wider">
                  2. Precio de las Paletas:
                </span>
                <span className="text-[10px] text-slate-500 font-semibold">
                  Toca para agregar
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[40, 45, 50].map((price) => {
                  const total = paletasQty * price;
                  return (
                    <button
                      key={price}
                      id={`paleta-price-btn-${price}`}
                      type="button"
                      onClick={() => {
                        playBeep(800, 'sine', 0.05);
                        const itemId = `p_paleta_${price}`;
                        const itemName = `Paleta de Hielo $${price}`;
                        const qtyToAdd = paletasQty > 0 ? paletasQty : 1;
                        
                        setTicketItems((prev) => {
                          const existingIndex = prev.findIndex(
                            (item) => (item.productId === itemId || item.name === itemName) && item.price === price
                          );
                          const totalItemPrice = price * qtyToAdd;

                          if (existingIndex >= 0) {
                            const updated = [...prev];
                            const curr = updated[existingIndex];
                            const newQty = curr.quantity + qtyToAdd;
                            updated[existingIndex] = {
                              ...curr,
                              quantity: newQty,
                              total: newQty * curr.price
                            };
                            return updated;
                          }

                          return [
                            ...prev,
                            {
                              id: `item-${Date.now()}-${Math.random()}`,
                              productId: itemId,
                              name: itemName,
                              price: price,
                              quantity: qtyToAdd,
                              total: totalItemPrice
                            }
                          ];
                        });

                        setShowPaletasModal(false);
                      }}
                      className="group relative bg-gradient-to-b from-purple-50 to-white hover:from-purple-100 hover:to-purple-50 border-2 border-purple-300 hover:border-purple-600 rounded-2xl p-3 flex flex-col items-center justify-center text-center transition-all active:scale-95 shadow-xs hover:shadow-md cursor-pointer h-24"
                    >
                      <span className="text-xl font-black text-purple-950 group-hover:text-purple-700 tracking-tight">
                        ${price}
                      </span>
                      <span className="text-[10px] font-black text-purple-800 mt-0.5">
                        Paleta
                      </span>
                      <span className="mt-1 bg-purple-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full shadow-xs font-mono">
                        =${total}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              id="cancel-paletas-modal-btn"
              type="button"
              onClick={() => setShowPaletasModal(false)}
              className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Completed Ticket Receipt Modal */}
      {completedTicket && (
        <ThermalTicket
          ticket={completedTicket}
          settings={settings}
          customerPointsBalance={selectedCustomer ? selectedCustomer.points : undefined}
          autoPrint={autoPrintTicket}
          onUpdateTicket={onUpdateTicket}
          onClose={() => setCompletedTicket(null)}
        />
      )}

      {/* Ticket Oculto en Pantalla para Impresión Directa Térmica (Visible únicamente por @media print al imprimir) */}
      {directPrintTicket && (
        <div className="hidden print:block">
          <div
            id="printable-ticket"
            className="w-full max-w-[290px] bg-white p-4 font-mono text-[12px] font-black text-black leading-tight select-none mx-auto"
            style={{ fontWeight: 900, color: '#000000' }}
          >
            {/* Store Header */}
            <div className="text-center space-y-0.5 pb-2.5 border-b-2 border-dashed border-black">
              <div className="text-sm sm:text-base font-black tracking-wider text-black leading-tight">
                {settings.bakeryName || 'Panaderia Santa Fé el refugio'}
              </div>
              <div className="text-[11px] font-black text-black leading-tight">
                {settings.slogan || 'Pan calientito y tradicional.'}
              </div>
              <div className="text-[10.5px] font-black text-black leading-tight mt-0.5">
                {settings.address || '7:00 am a 10:00 pm'}
              </div>
              <div className="text-[11px] font-black text-black leading-tight">
                {settings.phone || '442 816 3291'}
              </div>
            </div>

            {/* Folio & Date */}
            <div className="py-2 border-b-2 border-dashed border-black text-[11px] font-black space-y-1">
              <div className="flex justify-between font-black text-black">
                <span>FOLIO: {directPrintTicket.folio}</span>
                <span>{directPrintTicket.time}</span>
              </div>
              <div className="flex justify-between text-black font-black">
                <span>FECHA: {directPrintTicket.date}</span>
                <span>CAJA: {directPrintTicket.cashier || '1'}</span>
              </div>
              {directPrintTicket.customerName && (
                <div className="pt-0.5 text-black font-black truncate">
                  CLIENTE: {directPrintTicket.customerName}
                </div>
              )}
              {directPrintTicket.customerPhone && (
                <div className="text-black font-black">
                  TEL: {directPrintTicket.customerPhone}
                </div>
              )}
            </div>

            {/* Items Breakdown */}
            <div className="py-2.5 border-b-2 border-dashed border-black space-y-1.5 font-black">
              <div className="flex justify-between font-black text-[10px] text-black uppercase pb-1 border-b border-black">
                <span>CANT x PRECIO</span>
                <span>IMPORTE</span>
              </div>
              {directPrintTicket.items.map((item, idx) => (
                <div key={idx} className="space-y-0.5 font-black">
                  <div className="flex justify-between items-baseline font-black text-[12px] text-black">
                    <span className="truncate pr-1">
                      {item.quantity}x ${item.price.toFixed(item.price % 1 !== 0 ? 2 : 0)}
                    </span>
                    <span className="font-black">${item.total.toFixed(2)}</span>
                  </div>
                  <div className="text-[10px] font-black text-black pl-2 truncate">
                    {item.name}
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="py-2 border-b-2 border-dashed border-black space-y-1 text-[11px] font-black text-black">
              <div className="flex justify-between font-black">
                <span>SUBTOTAL:</span>
                <span>${directPrintTicket.subtotal.toFixed(2)}</span>
              </div>
              {directPrintTicket.discount > 0 && (
                <div className="flex justify-between font-black text-amber-900">
                  <span>{directPrintTicket.isSpecialDiscount ? 'DESCUENTO (10% ESPECIAL):' : 'DESCUENTO PUNTOS:'}</span>
                  <span>-${directPrintTicket.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-sm font-black text-black pt-1 border-t-2 border-black">
                <span>TOTAL:</span>
                <span className="text-base font-black">${directPrintTicket.total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[11px] font-black pt-0.5">
                <span>PAGO:</span>
                <span className="uppercase font-black">
                  {directPrintTicket.paymentMethod === 'efectivo' ? 'EFECTIVO' : 'TARJETA'}
                </span>
              </div>
              {directPrintTicket.paymentMethod === 'tarjeta' && (
                <>
                  <div className="flex justify-between text-[10px] font-black">
                    <span>TERMINAL:</span>
                    <span>{directPrintTicket.cardTerminal === 'mercadopago' ? 'MERCADO PAGO POINT' : (directPrintTicket.cardTerminal === 'zettle' ? 'PAYPAL ZETTLE (BT)' : 'TERMINAL BANCARIA')}</span>
                  </div>
                  {directPrintTicket.cardAuthCode && (
                    <div className="flex justify-between text-[10px] font-black">
                      <span>AUT:</span>
                      <span>{directPrintTicket.cardAuthCode}</span>
                    </div>
                  )}
                  {directPrintTicket.cardLast4 && (
                    <div className="flex justify-between text-[10px] font-black">
                      <span>TARJETA:</span>
                      <span>**** **** **** {directPrintTicket.cardLast4}</span>
                    </div>
                  )}
                  <div className="text-[9.5px] font-black text-center py-0.5 bg-black/5 rounded">
                    OPERACION APROBADA EN LINEA
                  </div>
                </>
              )}
              {directPrintTicket.paymentMethod === 'efectivo' && directPrintTicket.amountPaid > 0 && (
                <>
                  <div className="flex justify-between text-[10.5px] font-black">
                    <span>PAGÓ CON:</span>
                    <span>${directPrintTicket.amountPaid.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-black text-black">
                    <span>CAMBIO:</span>
                    <span>${directPrintTicket.change.toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Loyalty Points Section */}
            <div className="py-2 border-b-2 border-dashed border-black text-center space-y-1 font-black">
              <div className="text-[11px] font-black uppercase tracking-wide">
                PROGRAMA DE LEALTAD ⭐
              </div>
              <div className="text-[10.5px] font-black">
                Ganó en esta compra: +{directPrintTicket.pointsEarned} Pts (${directPrintTicket.pointsEarned} pesos)
              </div>
              <div className="text-[9.5px] font-black">
                ($20 pesos de compra = $1 peso de descuento)
              </div>
            </div>

            {/* Footer Message & Barcode */}
            <div className="pt-2 text-center space-y-1 font-black">
              <div className="text-[10px] font-black">
                {settings.ticketFooter || '¡Gracias por su compra! Vuelva pronto.'}
              </div>
              <div className="pt-1 flex flex-col items-center justify-center font-black">
                <div className="font-mono text-[9px] font-black tracking-widest text-black select-none flex space-x-0.5 items-center justify-center py-0.5">
                  ||| | |||| | || ||||| | ||| || |||| | |||
                </div>
                <span className="text-[9px] font-black text-black">{directPrintTicket.folio}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Registrar Pedido Pide y Recoge (Botón Morado) */}
      {showOrderModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-4 sm:p-6 shadow-2xl max-w-lg w-full border-2 border-purple-300 animate-in zoom-in-95 my-auto max-h-[95vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-700 via-purple-800 to-indigo-800 text-white flex items-center justify-center shadow-md">
                  <ClipboardList className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight flex items-center gap-1.5">
                    <span>Pedido Cliente VIP</span>
                    <span className="text-base">👑</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 font-semibold">
                    Cargado desde mostrador para clientes VIP (transferencia y factura)
                  </p>
                </div>
              </div>
              <button
                id="close-order-modal-btn"
                type="button"
                onClick={handleCloseOrderModal}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* SECCIÓN SUPERIOR: CLIENTE, TELÉFONO Y OBSERVACIONES */}
            <div className="mt-3 space-y-3">
              {/* Acceso Rápido a Clientes Favoritos VIP (Trascos, Magda, Bollos David, Deliz) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider">
                    Clientes VIP Frecuentes:
                  </label>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {availablePickupCustomers.map((c) => {
                    const isSelected = orderCustomerName.trim().toLowerCase() === c.name.trim().toLowerCase();
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelectOrderCustomer(c.name, c.phone, c.notes)}
                        className={`py-1.5 px-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1 border shadow-2xs active:scale-95 ${
                          isSelected
                            ? 'bg-purple-700 text-white border-purple-800 ring-2 ring-purple-300'
                            : 'bg-purple-50 hover:bg-purple-100 text-purple-900 border-purple-200'
                        }`}
                      >
                        <span>🛍️</span>
                        <span>{c.name}</span>
                        {c.phone && <span className="text-[10px] opacity-75 font-normal">({c.phone.slice(-4)})</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Nombre de Cliente y Teléfono */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                    Nombre del Cliente: *
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-purple-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="order-customer-name-input"
                      type="text"
                      required
                      placeholder="Ej. Trascos / Magda / Bollos David / Deliz"
                      value={orderCustomerName}
                      onChange={(e) => setOrderCustomerName(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                    Teléfono (Auto-llenado):
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-purple-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="order-customer-phone-input"
                      type="tel"
                      placeholder="Ej. 4421234567"
                      value={orderCustomerPhone}
                      onChange={(e) => setOrderCustomerPhone(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                    />
                  </div>
                </div>
              </div>

              {/* Observaciones */}
              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                  Observaciones / Notas del Pedido:
                </label>
                <textarea
                  id="order-notes-input"
                  rows={2}
                  placeholder="Ej. Entregar en bolsas de 10 piezas, pasan a las 5:00 pm, bien dorado..."
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none"
                />
              </div>

              {/* Fecha y Hora de Entrega en Tienda */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-purple-700" />
                    <span>Fecha Entrega:</span>
                  </label>
                  <input
                    type="date"
                    value={orderDeliveryDate}
                    onChange={(e) => setOrderDeliveryDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-purple-400"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-purple-700" />
                    <span>Hora Estimada:</span>
                  </label>
                  <input
                    type="time"
                    value={orderDeliveryTime}
                    onChange={(e) => setOrderDeliveryTime(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-purple-400"
                  />
                </div>
              </div>

              {/* PRODUCTOS POR ENTREGAR (Catálogo, Selecciones Rápidas y Teclado Virtual) */}
              <div className="bg-slate-50 border-2 border-purple-200/80 rounded-2xl p-3 sm:p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Boxes className="w-4 h-4 text-purple-700" />
                    <span className="text-xs font-black uppercase text-purple-950 tracking-wider">
                      Productos por Entregar
                    </span>
                  </div>
                  <span className="text-xs font-black text-purple-800 bg-purple-100 px-2.5 py-0.5 rounded-full border border-purple-200 shadow-2xs">
                    {orderModalPieces} piezas
                  </span>
                </div>

                {/* 1. SELECCIONES RÁPIDAS: LOS 5 PANES MÁS SOLICITADOS EN PIDE Y RECOGE */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider flex items-center gap-1">
                      <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                      <span>5 Panes Más Solicitados (Pide y Recoge):</span>
                    </span>
                    {orderCustomerRateInfo.matchedProfile && (
                      <span className="text-[9.5px] font-extrabold text-purple-700 bg-purple-100/70 px-1.5 py-0.2 rounded">
                        Tarifa: {orderCustomerRateInfo.matchedProfile.customerName}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                    {top5PickupBreads.map((b) => (
                      <button
                        key={b.key}
                        type="button"
                        onClick={() => handleSelectTop5QuickBread(b)}
                        className={`py-1.5 px-2 rounded-xl text-xs font-black border transition-all cursor-pointer flex flex-col items-center justify-center text-center shadow-2xs active:scale-95 ${
                          (selectedCatalogItem && selectedCatalogItem.name.toLowerCase().includes(b.key)) || orderItemNameInput.toLowerCase().includes(b.key)
                            ? 'bg-purple-700 text-white border-purple-800 ring-2 ring-purple-300 shadow-sm'
                            : 'bg-white hover:bg-purple-50 text-slate-800 border-slate-200 hover:border-purple-300'
                        }`}
                      >
                        <span className="text-sm">{b.emoji}</span>
                        <span className="leading-tight truncate max-w-full font-bold">{b.label}</span>
                        <span className={`text-[10px] font-black ${
                          (selectedCatalogItem && selectedCatalogItem.name.toLowerCase().includes(b.key)) || orderItemNameInput.toLowerCase().includes(b.key)
                            ? 'text-amber-300'
                            : 'text-purple-700'
                        }`}>
                          ${b.resolvedPrice}.00
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. BARRA DE BÚSQUEDA DEL CATÁLOGO (AUTOCOMPLETADO AL ESCRIBIR INICIALES EJ. "TE" -> TELERA) */}
                <div className="relative">
                  <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider mb-1">
                    Buscar en Catálogo o Escribir Pan:
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-purple-600 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="catalog-bread-search-input"
                      type="text"
                      placeholder="Escribe para buscar... ej. 'te' (Telera), 'bol' (Bolillo), 'con'..."
                      value={catalogItemSearch}
                      onChange={(e) => {
                        setCatalogItemSearch(e.target.value);
                        setOrderItemNameInput(e.target.value);
                        setIsSearchDropdownOpen(true);
                      }}
                      onFocus={() => {
                        if (catalogItemSearch.trim()) {
                          setIsSearchDropdownOpen(true);
                        }
                      }}
                      className="w-full pl-9 pr-8 py-2 bg-white border border-purple-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-400 shadow-2xs"
                    />
                    {catalogItemSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setCatalogItemSearch('');
                          setOrderItemNameInput('');
                          setSelectedCatalogItem(null);
                          setIsSearchDropdownOpen(false);
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5 rounded-full"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Dropdown de opciones del catálogo al escribir */}
                  {isSearchDropdownOpen && catalogSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border-2 border-purple-300 rounded-2xl shadow-2xl z-30 max-h-56 overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95">
                      <div className="p-2 bg-purple-50 text-[10px] font-black text-purple-900 uppercase flex items-center justify-between border-b border-purple-100">
                        <span>Coincidencias en Catálogo ({catalogSuggestions.length})</span>
                        <span className="text-purple-600">Toca para seleccionar</span>
                      </div>
                      {catalogSuggestions.map((item) => {
                        const price = getProductPriceForCustomer(item, orderCustomerName, 'recoger_tienda');
                        return (
                          <div
                            key={item.id}
                            onClick={() => handleSelectCatalogBread(item)}
                            className="p-2 hover:bg-purple-50 transition-colors cursor-pointer flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-md bg-purple-100 text-purple-900 text-[10px] font-black flex items-center justify-center shrink-0">
                                #{item.num}
                              </span>
                              <div>
                                <div className="font-black text-slate-900">{item.name}</div>
                                <div className="text-[10px] text-slate-500 font-medium">
                                  {item.mainGroup} • {item.subGroup} ({item.defaultUnit})
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="font-black text-purple-900 text-sm">${price}.00</span>
                              <div className="text-[9.5px] text-emerald-600 font-bold">Cliente VIP</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 3. CONTROLES DE CANTIDAD, PRECIO Y TECLADO VIRTUAL */}
                <div className="bg-white border border-purple-200 rounded-xl p-2.5 space-y-2">
                  <div className="grid grid-cols-12 gap-2 items-center">
                    {/* Cantidad Stepper */}
                    <div className="col-span-5 sm:col-span-4">
                      <label className="block text-[9.5px] font-black uppercase text-slate-500 mb-0.5">
                        Cantidad:
                      </label>
                      <div className="flex items-center bg-slate-100 rounded-xl p-0.5 border border-slate-200">
                        <button
                          type="button"
                          onClick={() => setOrderItemQtyInput(prev => Math.max(1, (prev || 1) - 1))}
                          className="w-7 h-7 rounded-lg bg-white hover:bg-slate-200 text-slate-700 flex items-center justify-center font-black cursor-pointer shadow-2xs"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={orderItemQtyInput}
                          onChange={(e) => setOrderItemQtyInput(parseInt(e.target.value) || 1)}
                          className="w-full text-center font-black text-xs text-slate-900 bg-transparent focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setOrderItemQtyInput(prev => (prev || 0) + 1)}
                          className="w-7 h-7 rounded-lg bg-white hover:bg-slate-200 text-slate-700 flex items-center justify-center font-black cursor-pointer shadow-2xs"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Precio Unitario con Botón de Teclado Virtual Táctil */}
                    <div className="col-span-7 sm:col-span-5">
                      <div className="flex items-center justify-between mb-0.5">
                        <label className="block text-[9.5px] font-black uppercase text-slate-500">
                          Precio Unitario:
                        </label>
                        <button
                          type="button"
                          onClick={handleOpenPriceKeypadForNewItem}
                          className="text-[9.5px] font-black text-purple-700 hover:text-purple-900 flex items-center gap-0.5 cursor-pointer bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200"
                          title="Abrir teclado virtual táctil"
                        >
                          <Calculator className="w-2.5 h-2.5" />
                          <span>Teclado</span>
                        </button>
                      </div>
                      <div className="relative flex items-center">
                        <span className="absolute left-2.5 font-bold text-slate-400 text-xs">$</span>
                        <input
                          type="text"
                          value={orderItemPriceInput}
                          onChange={(e) => setOrderItemPriceInput(e.target.value)}
                          className="w-full pl-6 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                        />
                        <button
                          type="button"
                          onClick={handleOpenPriceKeypadForNewItem}
                          className="absolute right-1.5 p-1 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-900 cursor-pointer"
                          title="Abrir teclado numérico táctil para ingresar precio"
                        >
                          <Calculator className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Botón Agregar al Pedido */}
                    <div className="col-span-12 sm:col-span-3 pt-1 sm:pt-4">
                      <button
                        id="add-bread-to-order-btn"
                        type="button"
                        onClick={handleAddProductToOrderModal}
                        className="w-full py-2 px-2 bg-gradient-to-r from-purple-700 to-indigo-800 hover:from-purple-800 hover:to-indigo-900 text-white font-black text-xs rounded-xl shadow-xs transition-all active:scale-95 flex items-center justify-center gap-1 cursor-pointer border border-purple-500"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Agregar</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 4. LISTA DE PRODUCTOS AGREGADOS AL PEDIDO */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                    Lista de Entrega ({orderModalItems.length} productos):
                  </div>

                  {orderModalItems.length === 0 ? (
                    <div className="p-4 rounded-xl bg-purple-50/60 border border-dashed border-purple-200 text-center space-y-1">
                      <ShoppingBag className="w-6 h-6 text-purple-400 mx-auto" />
                      <p className="text-xs font-black text-purple-900">
                        No hay productos en la lista todavía
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Usa las selecciones rápidas o busca un pan en el catálogo para agregarlo.
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-200/80">
                      {orderModalItems.map((item, idx) => (
                        <div key={item.id || idx} className="pt-1.5 first:pt-0 flex items-center justify-between text-xs bg-white p-2 rounded-xl border border-slate-200/70 shadow-2xs">
                          <div className="flex items-center gap-2">
                            {/* Stepper pequeño de cantidad */}
                            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                              <button
                                type="button"
                                onClick={() => handleUpdateOrderModalItemQty(idx, -1)}
                                className="w-5 h-5 rounded bg-white hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[10px] cursor-pointer"
                              >
                                -
                              </button>
                              <span className="w-6 text-center font-black text-xs text-purple-900">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateOrderModalItemQty(idx, 1)}
                                className="w-5 h-5 rounded bg-white hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[10px] cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                            <span className="font-black text-slate-900 truncate max-w-[140px] sm:max-w-[190px]">
                              {item.name}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Precio editable con teclado virtual */}
                            <button
                              type="button"
                              onClick={() => handleOpenPriceKeypadForExistingItem(idx)}
                              className="text-[11px] font-bold text-slate-600 hover:text-purple-900 bg-slate-50 hover:bg-purple-50 px-1.5 py-0.5 rounded border border-slate-200 cursor-pointer flex items-center gap-0.5"
                              title="Modificar precio unitario con teclado virtual"
                            >
                              <span>${item.price} c/u</span>
                              <Calculator className="w-2.5 h-2.5 text-purple-600" />
                            </button>

                            <span className="font-black text-slate-900 text-xs min-w-[50px] text-right">
                              ${item.total}.00
                            </span>

                            <button
                              type="button"
                              onClick={() => handleRemoveOrderModalItem(idx)}
                              className="text-slate-400 hover:text-rose-600 p-1 rounded-md hover:bg-rose-50 cursor-pointer transition-colors"
                              title="Eliminar del pedido"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Total Box */}
                  <div className="pt-2 border-t-2 border-purple-200 flex items-center justify-between px-1">
                    <span className="text-xs font-black text-purple-950 uppercase">
                      Total del Pedido ({orderModalPieces} pzs):
                    </span>
                    <span className="text-xl font-black text-purple-900">
                      ${orderModalSubtotal}.00
                    </span>
                  </div>
                </div>
              </div>

              {/* TECLADO VIRTUAL TÁCTIL (MODAL FLOTANTE PARA INGRESAR PRECIOS FÁCILMENTE) */}
              {showOrderVirtualKeypad && (
                <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3">
                  <div className="bg-white rounded-3xl p-4 shadow-2xl max-w-xs w-full border-2 border-purple-400 animate-in zoom-in-95">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
                      <div className="flex items-center gap-1.5 text-purple-900 font-black text-xs">
                        <Calculator className="w-4 h-4" />
                        <span>Teclado Virtual de Precio</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowOrderVirtualKeypad(false)}
                        className="text-slate-400 hover:text-slate-600 p-1 rounded-full cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Digital Screen Display */}
                    <div className="bg-slate-900 rounded-2xl p-3 text-center text-white mb-3">
                      <div className="text-[9px] uppercase font-bold text-slate-400">
                        Precio Unitario Seleccionado
                      </div>
                      <div className="text-3xl font-black text-amber-400 flex items-center justify-center gap-1 my-1">
                        <span>$</span>
                        <span>{virtualKeypadValue || '0'}</span>
                        <span className="w-0.5 h-6 bg-amber-400 animate-pulse inline-block"></span>
                      </div>
                    </div>

                    {/* Quick Add Buttons (+1, +5, +10, +0.50) */}
                    <div className="grid grid-cols-4 gap-1 mb-2">
                      {['+0.50', '+1', '+5', '+10'].map((btn) => (
                        <button
                          key={btn}
                          type="button"
                          onClick={() => handleVirtualKeypadInput(btn)}
                          className="py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-900 rounded-lg text-[10px] font-black border border-purple-200 cursor-pointer active:scale-95"
                        >
                          {btn}
                        </button>
                      ))}
                    </div>

                    {/* Numeric Keypad Grid */}
                    <div className="grid grid-cols-3 gap-1.5">
                      {['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '00', '.'].map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => handleVirtualKeypadInput(k)}
                          className="py-2.5 bg-slate-50 hover:bg-slate-100 active:bg-purple-100 text-slate-900 font-black text-base rounded-xl border border-slate-200 cursor-pointer active:scale-95 transition-all"
                        >
                          {k}
                        </button>
                      ))}
                    </div>

                    {/* Action buttons (Clear, Backspace, Confirm) */}
                    <div className="grid grid-cols-3 gap-1.5 mt-2">
                      <button
                        type="button"
                        onClick={() => handleVirtualKeypadInput('C')}
                        className="py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                      >
                        Limpiar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleVirtualKeypadInput('BACKSPACE')}
                        className="py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer flex items-center justify-center"
                      >
                        <Delete className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmVirtualKeypad}
                        className="py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black text-xs rounded-xl cursor-pointer shadow-md active:scale-95 flex items-center justify-center gap-1"
                      >
                        <Check className="w-4 h-4" />
                        <span>Listo</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* MODALIDAD DE COBRO: PAGADO O POR COBRAR */}
              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1.5">
                  Modalidad de Cobro:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    id="order-payment-mode-pagado-btn"
                    type="button"
                    onClick={() => {
                      playBeep(750, 'sine', 0.04);
                      setOrderPaymentMode('pagado');
                    }}
                    className={`py-3 px-3 rounded-2xl text-xs font-black border transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                      orderPaymentMode === 'pagado'
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-md ring-2 ring-emerald-300 scale-101'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="text-sm font-black">Pagado</span>
                    </div>
                    <span className="text-[10px] font-normal opacity-90">(Liquidó en mostrador)</span>
                  </button>

                  <button
                    id="order-payment-mode-pendiente-btn"
                    type="button"
                    onClick={() => {
                      playBeep(650, 'sine', 0.04);
                      setOrderPaymentMode('pendiente');
                    }}
                    className={`py-3 px-3 rounded-2xl text-xs font-black border transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                      orderPaymentMode === 'pendiente'
                        ? 'bg-amber-500 text-white border-amber-600 shadow-md ring-2 ring-amber-300 scale-101'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4" />
                      <span className="text-sm font-black">Por Cobrar</span>
                    </div>
                    <span className="text-[10px] font-normal opacity-90">(Paga al recoger - Cliente VIP)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* BOTONES FINALES: GENERAR PEDIDO E IMPRIMIR TICKET */}
            <div className="mt-5 pt-3 border-t border-slate-100 space-y-2">
              <div className="grid grid-cols-2 gap-2.5">
                {/* Botón 1: Generar Pedido */}
                <button
                  id="generate-store-order-btn"
                  type="button"
                  onClick={handleGenerateStoreOrder}
                  className={`py-3 px-3 rounded-2xl font-black text-xs shadow-md transition-all active:scale-98 flex items-center justify-center gap-1.5 cursor-pointer border ${
                    createdOrder
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500 ring-2 ring-emerald-300'
                      : 'bg-gradient-to-r from-purple-700 via-purple-800 to-indigo-800 hover:from-purple-800 hover:to-indigo-900 text-white border-purple-500 hover:shadow-lg'
                  }`}
                >
                  <Send className="w-4 h-4" />
                  <span>{createdOrder ? `✓ Pedido Generado (${createdOrder.folio})` : 'Generar Pedido 🛍️'}</span>
                </button>

                {/* Botón 2: Imprimir Ticket (Deshabilitado hasta que se genere el pedido) */}
                <button
                  id="print-store-order-ticket-btn"
                  type="button"
                  disabled={!createdOrder}
                  onClick={handlePrintStoreOrderTicket}
                  className={`py-3 px-3 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-1.5 border ${
                    createdOrder
                      ? 'bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white border-indigo-400 shadow-md hover:shadow-lg active:scale-98 cursor-pointer'
                      : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                  }`}
                  title={createdOrder ? 'Imprimir ticket de Pide y Recoge' : 'Primero debes generar el pedido para poder imprimir'}
                >
                  <Printer className="w-4 h-4" />
                  <span>{createdOrder ? 'Imprimir Ticket 🖨️' : 'Imprimir Ticket'}</span>
                </button>
              </div>

              {!createdOrder ? (
                <p className="text-[10px] text-center text-slate-400 font-semibold">
                  ℹ️ Para imprimir el ticket primero haz clic en <strong className="text-purple-700">Generar Pedido</strong>
                </p>
              ) : (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>¡Pedido #{createdOrder.folio} registrado!</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleCloseOrderModal}
                    className="text-xs font-black text-purple-700 hover:text-purple-900 underline cursor-pointer"
                  >
                    Cerrar y Nueva Venta
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Smiling Cheese Cubilete Celebration Modal (Cuando se genera pedido) */}
      {showCubileteCelebration && (
        <SmilingCheeseCubileteCelebration
          order={showCubileteCelebration}
          settings={settings}
          onPrintTicket={handlePrintStoreOrderTicket}
          onClose={() => setShowCubileteCelebration(null)}
        />
      )}

      {/* Smiling Donut Celebration Modal (Confirmación visual de cobro registrado) */}
      {celebrationData && (
        <HeartBreadCelebration
          total={celebrationData.total}
          folio={celebrationData.folio}
          piecesCount={celebrationData.piecesCount}
          customerName={celebrationData.customerName}
          paymentMethod={celebrationData.paymentMethod}
          onClose={() => setCelebrationData(null)}
        />
      )}

      {/* Ventana Secundaria: Corte de Caja / Corte del Turno */}
      {showShiftCutModal && (
        <CashShiftCutModal
          isOpen={showShiftCutModal}
          onClose={() => {
            setShowShiftCutModal(false);
            const saved = localStorage.getItem(cashierStorageKey);
            if (saved && saved.trim() && saved !== activeCashier) {
              setActiveCashier(saved.trim());
            }
          }}
          tickets={branchTickets}
          settings={settings}
          branch={activeBranchId}
        />
      )}



      {/* Ventana de Cobro con Terminal Mercado Pago Point */}
      {showMercadoPagoModal && (
        <MercadoPagoPaymentModal
          isOpen={showMercadoPagoModal}
          amount={total}
          folio={activeCardFolio || getNextTicketFolio(branchTickets, activeBranchId)}
          customerName={selectedCustomer ? selectedCustomer.name : (phoneSearch.replace(/\D/g, '') ? `Tel: ${phoneSearch.replace(/\D/g, '')}` : undefined)}
          branch={activeBranchId}
          onClose={() => {
            setShowMercadoPagoModal(false);
            setActiveCardFolio('');
          }}
          onPaymentApproved={(cardDetails) => {
            setShowMercadoPagoModal(false);
            handleCardCheckout(cardDetails);
          }}
        />
      )}

      {/* Ventana de Cobro con Terminal PayPal Zettle por Bluetooth */}
      {showZettleModal && (
        <ZettleBluetoothModal
          isOpen={showZettleModal}
          amount={total}
          folio={activeCardFolio || getNextTicketFolio(branchTickets, activeBranchId)}
          customerName={selectedCustomer ? selectedCustomer.name : (phoneSearch.replace(/\D/g, '') ? `Tel: ${phoneSearch.replace(/\D/g, '')}` : undefined)}
          onClose={() => {
            setShowZettleModal(false);
            setActiveCardFolio('');
          }}
          onPaymentApproved={(cardDetails) => handleCardCheckout(cardDetails)}
          onConfirmCardPayment={(cardDetails) => handleCardCheckout(cardDetails)}
        />
      )}

      {/* Ventana Emergente (Modal): Pedido Reparto (Encargos y Pedidos con Doble Ticket) */}
      <UnpaidOrderModal
        isOpen={showUnpaidOrderModal}
        onClose={() => setShowUnpaidOrderModal(false)}
        ticketItems={ticketItems}
        totalAmount={total}
        totalPieces={totalPieces}
        selectedCustomer={selectedCustomer}
        customers={customers}
        driverCustomers={driverCustomers}
        onConfirm={handleConfirmUnpaidOrder}
      />

      {/* Ventana Emergente (Modal): Teclado Virtual para Cambio ("Otro Billete") */}
      {showCashNumpad && (
        <div 
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setShowCashNumpad(false)}
        >
          <div 
            className="bg-slate-900 text-white w-full max-w-sm rounded-2xl shadow-2xl border-2 border-amber-400 p-4 space-y-3 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabecera con botón cerrar */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30 shrink-0">
                  <Banknote className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white leading-tight">
                    ¿Con cuánto pagan?
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Total a cobrar: <strong className="text-amber-300 font-mono">${total}.00</strong>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  playBeep(450, 'sine', 0.03);
                  setShowCashNumpad(false);
                }}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
                title="Cerrar ventana"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Visor digital con Pago Recibido y Cambio */}
            <div className="grid grid-cols-2 gap-2 bg-slate-950/90 p-3 rounded-xl border border-slate-800">
              <div>
                <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">
                  Monto Recibido
                </span>
                <span className="text-2xl font-black font-mono text-emerald-400 tracking-tight">
                  ${cashGivenInput || '0'}.00
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">
                  {numericCashGiven >= total ? 'Cambio a dar' : 'Falta cubrir'}
                </span>
                <span className={`text-2xl font-black font-mono tracking-tight ${
                  numericCashGiven >= total ? 'text-amber-300' : 'text-rose-400'
                }`}>
                  {numericCashGiven >= total ? `$${calculatedPosChange}.00` : `-$${cashShortage}.00`}
                </span>
              </div>
            </div>

            {/* Billetes rápidos de suma (+20, +50, +100, +200) y botón Exacto */}
            <div className="grid grid-cols-5 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  playBeep(750, 'sine', 0.03);
                  setCashGivenInput(total.toString());
                }}
                className="py-1.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 rounded-lg font-black font-mono text-xs cursor-pointer active:scale-95 transition-all text-center shadow-xs"
                title="Cobrar importe exacto"
              >
                Exacto
              </button>
              {[20, 50, 100, 200].map((billAdd) => (
                <button
                  key={billAdd}
                  type="button"
                  onClick={() => {
                    playBeep(700, 'sine', 0.02);
                    const current = parseFloat(cashGivenInput) || 0;
                    setCashGivenInput((current + billAdd).toString());
                  }}
                  className="py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-amber-600 border border-slate-700 text-amber-300 rounded-lg font-black font-mono text-xs cursor-pointer active:scale-95 transition-all text-center"
                  title={`Sumar billete de $${billAdd}`}
                >
                  +{billAdd}
                </button>
              ))}
            </div>

            {/* Teclado numérico táctil (1-9, C, 0, ⌫) */}
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => {
                    playBeep(600 + digit * 20, 'sine', 0.02);
                    setCashGivenInput(prev => `${prev}${digit}`);
                  }}
                  className="h-11 bg-slate-800 hover:bg-slate-700 active:bg-amber-500 active:text-slate-950 rounded-xl font-black font-mono text-lg text-white border border-slate-700 cursor-pointer active:scale-95 transition-all shadow-xs flex items-center justify-center"
                >
                  {digit}
                </button>
              ))}

              {/* Fila inferior: C, 0, ⌫ */}
              <button
                type="button"
                onClick={() => {
                  playBeep(400, 'sine', 0.03);
                  setCashGivenInput('');
                }}
                className="h-11 bg-rose-950/80 hover:bg-rose-900 active:bg-rose-800 text-rose-200 rounded-xl font-black text-sm border border-rose-800 cursor-pointer active:scale-95 transition-all flex items-center justify-center"
                title="Borrar todo"
              >
                C
              </button>

              <button
                type="button"
                onClick={() => {
                  playBeep(600, 'sine', 0.02);
                  setCashGivenInput(prev => (prev ? `${prev}0` : '0'));
                }}
                className="h-11 bg-slate-800 hover:bg-slate-700 active:bg-amber-500 active:text-slate-950 rounded-xl font-black font-mono text-lg text-white border border-slate-700 cursor-pointer active:scale-95 transition-all flex items-center justify-center"
              >
                0
              </button>

              <button
                type="button"
                onClick={() => {
                  playBeep(550, 'sine', 0.02);
                  setCashGivenInput(prev => prev.slice(0, -1));
                }}
                className="h-11 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-slate-200 rounded-xl font-black text-sm border border-slate-600 cursor-pointer active:scale-95 transition-all flex items-center justify-center"
                title="Retroceso"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>

            {/* Fila inferior de acciones: 00 y Listo */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  playBeep(620, 'sine', 0.02);
                  if (cashGivenInput) {
                    setCashGivenInput(prev => `${prev}00`);
                  }
                }}
                className="py-2 bg-slate-800 hover:bg-slate-700 active:bg-amber-500 text-amber-200 rounded-xl font-black font-mono text-sm border border-slate-700 cursor-pointer active:scale-95 transition-all text-center"
              >
                00 (Ceros)
              </button>

              <button
                type="button"
                onClick={() => {
                  playBeep(750, 'triangle', 0.05);
                  setShowCashNumpad(false);
                }}
                className="py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl font-black text-sm border border-emerald-500 cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-md"
              >
                <Check className="w-4 h-4" />
                <span>Listo</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Consultar y Reimprimir Tickets de Reparto por Día (Simón y Osvaldo) */}
      <DriverDailyTicketsModal
        isOpen={showDriverTicketsModal}
        onClose={() => setShowDriverTicketsModal(false)}
        settings={settings}
        driverCustomers={driverCustomers}
        onRegisterLiquidationToCash={(ticket) => onSaveTicket(ticket)}
      />
    </div>
  );
};
