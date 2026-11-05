import React, { useState } from 'react';
import { 
  BakeryOrder, 
  BreadProduct, 
  Settings, 
  OrderItem, 
  Driver, 
  Customer, 
  DriverCustomer,
  SaleTicket
} from '../../types';
import { 
  Plus, 
  Search, 
  Calendar, 
  Clock, 
  MapPin, 
  Phone, 
  User, 
  CheckCircle2, 
  AlertCircle, 
  Truck, 
  Store, 
  ShoppingBag, 
  MessageCircle, 
  Printer, 
  X, 
  ChevronRight,
  ChevronDown,
  Filter, 
  DollarSign, 
  FileText, 
  Check,
  CheckCheck, 
  FileCheck, 
  Receipt, 
  Sparkles,
  LayoutList,
  LayoutGrid,
  ChevronUp,
  Tag,
  Boxes,
  Download,
  HardDrive,
  Trash2
} from 'lucide-react';
import { playBeep, playCashSound } from '../../utils/audio';
import { 
  getNextOrderFolio, 
  getTodayString, 
  generateOrderWhatsAppMessage, 
  loadDriverCustomers,
  loadMasterCatalog 
} from '../../utils/storage';
import { 
  printOrderTicketDirectToPrinter, 
  printAccountStatementDirectToPrinter 
} from '../../utils/thermalPrinter';
import { MercadoPagoPaymentModal } from '../PosCounter/MercadoPagoPaymentModal';
import { 
  REAL_BAKERY_CATALOG, 
  MAIN_CATALOG_GROUPS, 
  CatalogBreadItem,
  normalizeCustomerKey,
  getProductPriceForCustomer 
} from '../../data/bakeryCatalog';
import { NewOrderModal } from './NewOrderModal';
import { DailyDeliverySheet } from './DailyDeliverySheet';
import { BackupOrdersModal } from './BackupOrdersModal';

interface OrdersManagerProps {
  orders: BakeryOrder[];
  products: BreadProduct[];
  settings: Settings;
  drivers: Driver[];
  customers: Customer[];
  driverCustomers?: DriverCustomer[];
  onUpdateDriverCustomers?: (updated: DriverCustomer[]) => void;
  onSaveOrder: (order: BakeryOrder) => void;
  onUpdateOrder: (order: BakeryOrder) => void;
  onSaveTicket?: (ticket: SaleTicket, updatedCustomer?: Customer) => void;
  onUpdateCustomer?: (customer: Customer) => void;
  onDeleteOrder?: (orderId: string) => void;
  onDeleteTicket?: (ticketId: string) => void;
}

export const OrdersManager: React.FC<OrdersManagerProps> = ({
  orders,
  products,
  settings,
  drivers,
  customers,
  driverCustomers: propDriverCustomers,
  onUpdateDriverCustomers,
  onSaveOrder,
  onUpdateOrder,
  onSaveTicket,
  onUpdateCustomer,
  onDeleteOrder,
  onDeleteTicket
}) => {
  // Main view switcher: 'repartos' (Hoja diaria de repartos Excel por default) or 'pedidos' (Encargos y pedidos especiales)
  const [mainView, setMainView] = useState<'repartos' | 'pedidos'>('repartos');
  const [showBackupModal, setShowBackupModal] = useState<boolean>(false);

  const [showNewOrderModal, setShowNewOrderModal] = useState<boolean>(false);
  const [orderChannel, setOrderChannel] = useState<'venta_tienda' | 'reparto' | 'recoger_tienda'>('venta_tienda');
  
  // View Mode: 'lista' (default requested by user) or 'tarjetas'
  const [viewMode, setViewMode] = useState<'lista' | 'tarjetas'>('lista');

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterDate, setFilterDate] = useState<string>('todos'); // 'hoy', 'manana', 'todos'
  const [filterChannel, setFilterChannel] = useState<string>('todos'); // 'todos' | 'venta_tienda' | 'reparto' | 'recoger_tienda'
  
  // Accountant & Credit Filter
  const [accountingFilter, setAccountingFilter] = useState<string>('todos');
  
  // Selected Order for detail & accounting management modal
  const [selectedOrder, setSelectedOrder] = useState<BakeryOrder | null>(null);

  // Driver customers list
  const activeDriverCustomers = propDriverCustomers && propDriverCustomers.length > 0
    ? propDriverCustomers
    : loadDriverCustomers();

  // Quick Payment Modal for Accountant
  const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'transferencia' | 'efectivo' | 'cheque' | 'tarjeta' | 'mercadopago'>('transferencia');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [orderChargingWithMp, setOrderChargingWithMp] = useState<BakeryOrder | null>(null);

  // Quick Invoicing Modal for Accountant
  const [showInvoiceModal, setShowInvoiceModal] = useState<boolean>(false);
  const [invoiceFolioInput, setInvoiceFolioInput] = useState<string>('');
  const [invoiceStatusSelect, setInvoiceStatusSelect] = useState<'no_requerida' | 'pendiente' | 'emitida' | 'cancelada'>('emitida');
  const [invoiceRfcInput, setInvoiceRfcInput] = useState<string>('');
  const [invoiceBusinessInput, setInvoiceBusinessInput] = useState<string>('');
  const [invoiceCfdiInput, setInvoiceCfdiInput] = useState<string>('G03 - Gastos en general');

  // Print Toast notification
  const [printNotice, setPrintNotice] = useState<string>('');

  // New Order Form state
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [deliveryType, setDeliveryType] = useState<'tienda' | 'domicilio'>('tienda');
  const [address, setAddress] = useState<string>('');
  const [deliveryDate, setDeliveryDate] = useState<string>(getTodayString());
  const [deliveryTime, setDeliveryTime] = useState<string>('08:00');
  const [assignedDriverId, setAssignedDriverId] = useState<'osvaldo' | 'simon' | 'ninguno'>('ninguno');
  const [deposit, setDeposit] = useState<string>('0');
  const [pickupPaymentOption, setPickupPaymentOption] = useState<'por_cobrar' | 'pagado'>('por_cobrar');
  const [storePaymentMethod, setStorePaymentMethod] = useState<'efectivo' | 'tarjeta' | 'transferencia'>('efectivo');
  const [notes, setNotes] = useState<string>('');
  const [isMonthlyCredit, setIsMonthlyCredit] = useState<boolean>(false);
  const [requiresInvoice, setRequiresInvoice] = useState<boolean>(false);
  const [rfc, setRfc] = useState<string>('');
  const [businessName, setBusinessName] = useState<string>('');
  const [cfdiUse, setCfdiUse] = useState<string>('G03 - Gastos en general');
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  
  // 3 Dropdown / Accordion Catalog Group state
  const [openCatalogGroup, setOpenCatalogGroup] = useState<'salado' | 'dulce_danes' | 'feite_batidos_especiales' | null>('salado');
  const [catalogSearch, setCatalogSearch] = useState<string>('');
  const [selectedAlphabetLetter, setSelectedAlphabetLetter] = useState<string | null>(null);
  const [clientFilterRoute, setClientFilterRoute] = useState<'todos' | 'osvaldo' | 'simon' | 'especiales'>('todos');
  const [clientSearchQuery, setClientSearchQuery] = useState<string>('');

  // Dynamic Master Catalog loaded from Storage / Default list
  const activeCatalog = React.useMemo(() => {
    return loadMasterCatalog();
  }, [showNewOrderModal]);

  // Customer Rate Info for current order
  const activeCustomerPricingInfo = React.useMemo(() => {
    return normalizeCustomerKey(customerName);
  }, [customerName]);

  // Filtered breads by Alphabet letter and search
  const alphabetFilteredProducts = React.useMemo(() => {
    let list = activeCatalog;

    // Filter by search query if any
    if (catalogSearch.trim()) {
      const q = catalogSearch.toLowerCase().trim();
      list = list.filter(p => 
        p.name.toLowerCase().includes(q) || 
        (p.subgroup && p.subgroup.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
      );
    }

    // Filter by Alphabet letter
    if (selectedAlphabetLetter && selectedAlphabetLetter !== 'TODOS') {
      const targetLetter = selectedAlphabetLetter.toLowerCase();
      list = list.filter(p => {
        const name = p.name.toLowerCase().trim();
        if (name.startsWith(targetLetter)) return true;
        const words = name.split(/\s+/);
        return words.some(w => w.startsWith(targetLetter));
      });
    }

    return list;
  }, [activeCatalog, catalogSearch, selectedAlphabetLetter]);

  // Row item configuration states for catalog insertion (default values mapped per product id)
  const [itemRowConfigs, setItemRowConfigs] = useState<Record<string, {
    quantity: number;
    unit: 'PZ' | 'CH' | 'KG';
    itemType: 'Normal' | 'Mini';
    customPrice?: number;
  }>>({});

  const getItemConfig = (prod: CatalogBreadItem) => {
    const negotiatedPrice = getProductPriceForCustomer(prod, customerName, orderChannel);
    const existing = itemRowConfigs[prod.id];
    return {
      quantity: existing?.quantity ?? 10,
      unit: existing?.unit ?? (prod.defaultUnit || 'PZ'),
      itemType: existing?.itemType ?? (prod.name.toLowerCase().includes('mini') ? 'Mini' : 'Normal'),
      customPrice: existing?.customPrice !== undefined ? existing.customPrice : negotiatedPrice
    };
  };

  const updateItemConfig = (prodId: string, updates: Partial<{
    quantity: number;
    unit: 'PZ' | 'CH' | 'KG';
    itemType: 'Normal' | 'Mini';
    customPrice: number;
  }>) => {
    setItemRowConfigs(prev => ({
      ...prev,
      [prodId]: {
        ...(prev[prodId] || { quantity: 10, unit: 'PZ', itemType: 'Normal', customPrice: 0 }),
        ...updates
      }
    }));
  };

  const resetForm = () => {
    setCustomerName('');
    setCustomerPhone('');
    setDeliveryType('tienda');
    setAddress('');
    setDeliveryDate(getTodayString());
    setDeliveryTime('08:00');
    setAssignedDriverId('ninguno');
    setDeposit('0');
    setPickupPaymentOption('por_cobrar');
    setStorePaymentMethod('efectivo');
    setNotes('');
    setIsMonthlyCredit(false);
    setRequiresInvoice(false);
    setRfc('');
    setBusinessName('');
    setCfdiUse('G03 - Gastos en general');
    setOrderItems([]);
    setOpenCatalogGroup('salado');
    setCatalogSearch('');
    setSelectedAlphabetLetter(null);
    setClientFilterRoute('todos');
    setClientSearchQuery('');
  };

  // 1. Button 1: Pedido para Venta en Tienda (Mostrador)
  const handleOpenVentaTienda = () => {
    resetForm();
    setOrderChannel('venta_tienda');
    setDeliveryType('tienda');
    setCustomerName('Venta en Tienda (Mostrador)');
    setDeliveryTime('Inmediato');
    setAssignedDriverId('ninguno');
    setIsMonthlyCredit(false);
    setOpenCatalogGroup('salado');
    setShowNewOrderModal(true);
    playBeep(700, 'sine', 0.06);
  };

  // 2. Button 2: Pedido para Reparto (Rutas Osvaldo y Simón)
  const handleOpenReparto = (preferredDriver: 'osvaldo' | 'simon' = 'osvaldo') => {
    resetForm();
    setOrderChannel('reparto');
    setDeliveryType('domicilio');
    setCustomerName('');
    setAssignedDriverId(preferredDriver);
    setDeliveryTime('07:30');
    setIsMonthlyCredit(true);
    setDeposit('0');
    setOpenCatalogGroup('salado');
    setShowNewOrderModal(true);
    playBeep(600, 'sine', 0.06);
  };

  // 3. Button 3: Pedido Pide y Recoge
  const handleOpenRecogerTienda = (clientName?: string) => {
    resetForm();
    setOrderChannel('recoger_tienda');
    setDeliveryType('tienda');
    setCustomerName(clientName || '');
    setAssignedDriverId('ninguno');
    setDeliveryTime('12:00');
    setPickupPaymentOption('por_cobrar');
    setDeposit('0');
    setOpenCatalogGroup('salado');
    setShowNewOrderModal(true);
    playBeep(650, 'sine', 0.06);
  };

  // Select driver client
  const handleSelectDriverCustomer = (cust: DriverCustomer) => {
    setCustomerName(cust.name);
    if (cust.driverId === 'osvaldo' || cust.driverId === 'simon') {
      setAssignedDriverId(cust.driverId);
    }
    if (cust.phone) setCustomerPhone(cust.phone);
    if (cust.address) setAddress(cust.address);
    if (cust.notes) setNotes(cust.notes);
    if (cust.defaultPayment === 'credito') {
      setIsMonthlyCredit(true);
    } else {
      setIsMonthlyCredit(false);
    }
    playBeep(800, 'triangle', 0.04);
  };

  // Add Item to Order from Real Catalog Row
  const handleAddCatalogItemToOrder = (prod: CatalogBreadItem) => {
    const config = getItemConfig(prod);
    const qty = config.quantity > 0 ? config.quantity : 1;
    const unit = config.unit || 'PZ';
    const itemType = config.itemType || 'Normal';
    const unitPrice = typeof config.customPrice === 'number' && config.customPrice >= 0 
      ? config.customPrice 
      : prod.defaultPrice;

    const displayName = itemType === 'Mini' && !prod.name.toLowerCase().includes('mini')
      ? `${prod.name} (Mini)`
      : prod.name;

    const itemTotal = qty * unitPrice;

    playBeep(650, 'sine', 0.05);

    setOrderItems(prev => {
      // Find if item with same id, unit and itemType exists
      const idx = prev.findIndex(
        it => it.breadId === prod.id && (it.unit || 'PZ') === unit && (it.itemType || 'Normal') === itemType
      );
      if (idx >= 0) {
        const updated = [...prev];
        const newQty = updated[idx].quantity + qty;
        updated[idx] = {
          ...updated[idx],
          quantity: newQty,
          total: newQty * updated[idx].unitPrice
        };
        return updated;
      } else {
        return [
          ...prev,
          {
            breadId: prod.id,
            name: displayName,
            category: prod.category,
            quantity: qty,
            unitPrice,
            total: itemTotal,
            unit,
            itemType,
            done: false
          }
        ];
      }
    });

    setPrintNotice(`🥖 Agregado: ${qty} ${unit} de ${displayName}`);
    setTimeout(() => setPrintNotice(''), 2500);
  };

  const handleRemoveOrderItem = (index: number) => {
    playBeep(400, 'sawtooth', 0.05);
    setOrderItems(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateOrderItemQty = (index: number, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveOrderItem(index);
      return;
    }
    setOrderItems(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        quantity: newQty,
        total: newQty * updated[index].unitPrice
      };
      return updated;
    });
  };

  const totalOrderAmount = orderItems.reduce((acc, it) => acc + it.total, 0);
  const totalPiecesCount = orderItems.reduce((acc, it) => acc + it.quantity, 0);
  
  // Dynamic deposit calculation based on channel
  const effectiveDeposit = orderChannel === 'venta_tienda' 
    ? totalOrderAmount 
    : orderChannel === 'recoger_tienda' && pickupPaymentOption === 'pagado'
    ? totalOrderAmount
    : parseFloat(deposit) || 0;

  const effectivePending = Math.max(0, totalOrderAmount - effectiveDeposit);

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (orderItems.length === 0) {
      setPrintNotice('⚠️ Por favor agrega al menos un producto de pan al pedido');
      setTimeout(() => setPrintNotice(''), 3000);
      return;
    }

    playCashSound();
    const folio = getNextOrderFolio();

    const isPaidInFull = effectiveDeposit >= totalOrderAmount;
    const paymentStatus: 'pendiente' | 'anticipo' | 'pagado' = 
      isPaidInFull ? 'pagado' : effectiveDeposit > 0 ? 'anticipo' : 'pendiente';

    let orderNotes = notes.trim();
    if (orderChannel === 'venta_tienda') {
      orderNotes = `[VENTA MOSTRADOR - ${storePaymentMethod.toUpperCase()}] ${orderNotes}`.trim();
    } else if (orderChannel === 'recoger_tienda') {
      orderNotes = `[PIDE Y RECOGE - ${pickupPaymentOption === 'pagado' ? 'PAGADO' : 'POR COBRAR'}] ${orderNotes}`.trim();
    } else if (isMonthlyCredit) {
      orderNotes = `[REPARTO - PAGO FIN DE MES] ${orderNotes}`.trim();
    }

    const newOrder: BakeryOrder = {
      id: `ord-${Date.now()}`,
      folio,
      customerName: customerName.trim() || (orderChannel === 'venta_tienda' ? 'Venta en Tienda (Mostrador)' : 'Cliente General'),
      customerPhone: customerPhone.trim(),
      deliveryType: orderChannel === 'reparto' ? 'domicilio' : 'tienda',
      orderChannel,
      address: orderChannel === 'reparto' ? address.trim() : 'Mostrador / Tienda',
      deliveryDate,
      deliveryTime,
      items: orderItems,
      total: totalOrderAmount,
      deposit: effectiveDeposit,
      pendingAmount: effectivePending,
      paymentStatus,
      paidDate: isPaidInFull ? getTodayString() : undefined,
      paidMethod: orderChannel === 'venta_tienda' ? storePaymentMethod : undefined,
      assignedDriverId: orderChannel === 'reparto' ? assignedDriverId : 'ninguno',
      deliveryStatus: 'pendiente',
      notes: orderNotes || undefined,
      createdAt: new Date().toISOString(),
      isMonthlyCredit: orderChannel === 'reparto' ? isMonthlyCredit : false,
      requiresInvoice,
      invoiceStatus: requiresInvoice ? 'pendiente' : 'no_requerida',
      rfc: requiresInvoice ? rfc.trim().toUpperCase() : undefined,
      businessName: requiresInvoice ? (businessName.trim() || customerName.trim()) : undefined,
      cfdiUse: requiresInvoice ? cfdiUse : undefined,
      origin: orderChannel === 'venta_tienda' ? 'mostrador' : 'pedido_directo',
      coordinates: orderChannel === 'reparto' ? {
        lat: 19.4326 + (Math.random() - 0.5) * 0.08,
        lng: -99.1332 + (Math.random() - 0.5) * 0.08
      } : undefined
    };

    onSaveOrder(newOrder);
    setShowNewOrderModal(false);
    resetForm();
    setSelectedOrder(newOrder);

    setPrintNotice(`✨ Pedido #${newOrder.folio} creado con éxito`);
    setTimeout(() => setPrintNotice(''), 3500);
  };

  // Direct print order thermal ticket
  const handlePrintOrderDirect = (order: BakeryOrder) => {
    printOrderTicketDirectToPrinter(order, settings);
    setPrintNotice(`🖨️ Imprimiendo Comanda Térmica #${order.folio}...`);
    setTimeout(() => setPrintNotice(''), 3500);
  };

  // Direct print account statement for customer
  const handlePrintCustomerStatement = (custName: string, custPhone?: string) => {
    const customerOrders = orders.filter(
      o => o.customerName.toLowerCase().trim() === custName.toLowerCase().trim()
    );
    printAccountStatementDirectToPrinter(custName, custPhone || '', customerOrders, settings);
    setPrintNotice(`🖨️ Imprimiendo Estado de Cuenta de "${custName}"...`);
    setTimeout(() => setPrintNotice(''), 3500);
  };

  // Accountant actions: Register payment
  const handleOpenPaymentModal = (order: BakeryOrder) => {
    setPaymentAmount(order.pendingAmount.toString());
    setPaymentMethod('transferencia');
    setPaymentReference('');
    setShowPaymentModal(true);
  };

  const handleConfirmPayment = () => {
    if (!selectedOrder) return;
    const paidNum = parseFloat(paymentAmount) || 0;
    const newDeposit = selectedOrder.deposit + paidNum;
    const newPending = Math.max(0, selectedOrder.total - newDeposit);
    const newStatus: 'pendiente' | 'anticipo' | 'pagado' = newPending === 0 ? 'pagado' : newDeposit > 0 ? 'anticipo' : 'pendiente';

    const updated: BakeryOrder = {
      ...selectedOrder,
      deposit: newDeposit,
      pendingAmount: newPending,
      paymentStatus: newStatus,
      paidDate: getTodayString(),
      paidMethod: paymentMethod,
      paidReference: paymentReference.trim() || undefined,
      accountingNotes: `${selectedOrder.accountingNotes ? selectedOrder.accountingNotes + ' | ' : ''}Cobro $${paidNum} via ${paymentMethod} (${paymentReference.trim() || 'Sin ref'}) el ${getTodayString()}`
    };

    onUpdateOrder(updated);
    setSelectedOrder(updated);
    setShowPaymentModal(false);
    playCashSound();
  };

  // Accountant actions: Update Invoicing
  const handleOpenInvoiceModal = (order: BakeryOrder) => {
    setInvoiceStatusSelect(order.invoiceStatus || (order.requiresInvoice ? 'pendiente' : 'no_requerida'));
    setInvoiceFolioInput(order.invoiceFolio || '');
    setInvoiceRfcInput(order.rfc || '');
    setInvoiceBusinessInput(order.businessName || order.customerName);
    setInvoiceCfdiInput(order.cfdiUse || 'G03 - Gastos en general');
    setShowInvoiceModal(true);
  };

  const handleConfirmInvoice = () => {
    if (!selectedOrder) return;
    const updated: BakeryOrder = {
      ...selectedOrder,
      requiresInvoice: invoiceStatusSelect !== 'no_requerida',
      invoiceStatus: invoiceStatusSelect,
      invoiceFolio: invoiceFolioInput.trim() || undefined,
      rfc: invoiceRfcInput.trim().toUpperCase() || undefined,
      businessName: invoiceBusinessInput.trim() || undefined,
      cfdiUse: invoiceCfdiInput
    };

    onUpdateOrder(updated);
    setSelectedOrder(updated);
    setShowInvoiceModal(false);
    playBeep(750, 'sine', 0.08);
  };

  // Quick toggle status
  const handleQuickStatusChange = (order: BakeryOrder, newStatus: 'pendiente' | 'en_camino' | 'entregado') => {
    playBeep(700, 'sine', 0.05);
    const updated: BakeryOrder = {
      ...order,
      deliveryStatus: newStatus,
      deliveredAt: newStatus === 'entregado' ? new Date().toISOString() : undefined
    };
    onUpdateOrder(updated);
    if (selectedOrder && selectedOrder.id === order.id) {
      setSelectedOrder(updated);
    }
  };

  // Repartos Pendientes de Cobro (Cuando los repartidores regresan con el dinero)
  const pendingRepartosOrders = orders.filter(o => 
    (o.orderChannel === 'reparto' || o.deliveryType === 'domicilio' || (o.notes && (o.notes.includes('[PEDIDO REPARTO') || o.notes.includes('[PEDIDO SIN COBRAR')))) &&
    o.pendingAmount > 0 &&
    o.paymentStatus !== 'pagado'
  );

  // Modal / Confirmación de Cobro Directo para Repartidores
  const [orderToSettle, setOrderToSettle] = useState<BakeryOrder | null>(null);

  const handlePromptDirectSettle = (order: BakeryOrder) => {
    playBeep(700, 'sine', 0.05);
    setOrderToSettle(order);
  };

  const handleConfirmDirectSettle = () => {
    if (!orderToSettle) return;
    const order = orderToSettle;
    const amountToSettle = order.pendingAmount > 0 ? order.pendingAmount : order.total;
    const pointsEarned = Math.floor(order.total / (settings.loyaltyPointsPerPesos || 20));

    // 1. Actualizar orden a pagada
    const updatedOrder: BakeryOrder = {
      ...order,
      paymentStatus: 'pagado',
      pendingAmount: 0,
      deposit: order.total,
      deliveryStatus: 'entregado',
      deliveredAt: new Date().toISOString()
    };
    onUpdateOrder(updatedOrder);
    if (selectedOrder && selectedOrder.id === order.id) {
      setSelectedOrder(updatedOrder);
    }

    // 2. Registrar ticket de venta en efectivo para corte de caja
    if (onSaveTicket) {
      const activeShift = (typeof window !== 'undefined' ? localStorage.getItem('santafe_active_shift') : null) || 'turno1';
      const cashTicket: SaleTicket = {
        id: `ticket-ord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        folio: `T-${order.folio.replace(/\D/g, '') || Date.now().toString().slice(-4)}`,
        timestamp: new Date().toISOString(),
        date: getTodayString(),
        time: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false }),
        items: order.items.map((it, idx) => ({
          id: `item-${it.breadId || idx}-${Date.now()}`,
          productId: it.breadId || `item-${Date.now()}-${idx}`,
          name: it.name,
          price: it.unitPrice,
          quantity: it.quantity,
          total: it.total
        })),
        subtotal: order.total,
        discount: 0,
        total: order.total,
        paymentMethod: 'efectivo',
        amountPaid: order.total,
        change: 0,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        pointsEarned,
        pointsRedeemed: 0,
        cashier: (typeof window !== 'undefined' ? localStorage.getItem('santafe_last_cashier_name') : null) || 'Caja Santa Fé',
        shift: (activeShift === 'turno1' || activeShift === 'turno2') ? activeShift : 'turno1'
      };
      onSaveTicket(cashTicket);
    }

    // 3. Acumular puntos al cliente
    if (onUpdateCustomer && pointsEarned > 0) {
      const matchedCustomer = customers.find(c => 
        (order.customerPhone && c.phone === order.customerPhone) ||
        c.name.trim().toLowerCase() === order.customerName.trim().toLowerCase()
      );
      if (matchedCustomer) {
        const updatedCust: Customer = {
          ...matchedCustomer,
          points: (matchedCustomer.points || 0) + pointsEarned,
          totalSpent: (matchedCustomer.totalSpent || 0) + order.total,
          visitsCount: (matchedCustomer.visitsCount || 0) + 1,
          lastVisit: getTodayString()
        };
        onUpdateCustomer(updatedCust);
      }
    }

    playCashSound();
    setPrintNotice(`💰 ¡Folio ${order.folio} marcado como COBRADO! $${amountToSettle}.00 ingresados a caja y +${pointsEarned} puntos para ${order.customerName}.`);
    setTimeout(() => {
      setPrintNotice('');
    }, 5500);

    setOrderToSettle(null);
  };

  const handleOrderMpPaymentApproved = (order: BakeryOrder, cardDetails: {
    terminal: 'mercadopago';
    authCode: string;
    last4?: string;
    reference?: string;
  }) => {
    const amountToSettle = order.pendingAmount > 0 ? order.pendingAmount : order.total;
    const pointsEarned = Math.floor(order.total / (settings.loyaltyPointsPerPesos || 20));

    // 1. Actualizar orden a pagada
    const updatedOrder: BakeryOrder = {
      ...order,
      paymentStatus: 'pagado',
      pendingAmount: 0,
      deposit: order.total,
      deliveryStatus: 'entregado',
      deliveredAt: new Date().toISOString(),
      paidDate: getTodayString(),
      paidMethod: 'mercadopago',
      paidReference: cardDetails.authCode || cardDetails.reference || 'MP-TERM',
      accountingNotes: `${order.accountingNotes ? order.accountingNotes + ' | ' : ''}Cobro $${amountToSettle} con Terminal Mercado Pago (Aut: ${cardDetails.authCode}) el ${getTodayString()}`
    };
    onUpdateOrder(updatedOrder);
    if (selectedOrder && selectedOrder.id === order.id) {
      setSelectedOrder(updatedOrder);
    }
    setOrderChargingWithMp(null);
    setShowPaymentModal(false);
    setOrderToSettle(null);

    // 2. Registrar ticket de venta con tarjeta para corte de caja
    if (onSaveTicket) {
      const activeShift = (typeof window !== 'undefined' ? localStorage.getItem('santafe_active_shift') : null) || 'turno1';
      const cardTicket: SaleTicket = {
        id: `ticket-mp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        folio: `T-${order.folio.replace(/\D/g, '') || Date.now().toString().slice(-4)}`,
        timestamp: new Date().toISOString(),
        date: getTodayString(),
        time: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false }),
        items: order.items.map((it, idx) => ({
          id: `item-${it.breadId || idx}-${Date.now()}`,
          productId: it.breadId || `item-${Date.now()}-${idx}`,
          name: it.name,
          price: it.unitPrice,
          quantity: it.quantity,
          total: it.total
        })),
        subtotal: order.total,
        discount: 0,
        total: amountToSettle,
        paymentMethod: 'tarjeta',
        cardTerminal: 'mercadopago',
        cardAuthCode: cardDetails.authCode,
        cardLast4: cardDetails.last4,
        cardReference: order.folio,
        amountPaid: amountToSettle,
        change: 0,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        pointsEarned,
        pointsRedeemed: 0,
        cashier: (typeof window !== 'undefined' ? localStorage.getItem('santafe_last_cashier_name') : null) || 'Caja Santa Fé',
        shift: (activeShift === 'turno1' || activeShift === 'turno2') ? activeShift : 'turno1'
      };
      onSaveTicket(cardTicket);
    }

    // 3. Acumular puntos al cliente
    if (onUpdateCustomer && pointsEarned > 0) {
      const matchedCustomer = customers.find(c => 
        (order.customerPhone && c.phone === order.customerPhone) ||
        c.name.trim().toLowerCase() === order.customerName.trim().toLowerCase()
      );
      if (matchedCustomer) {
        const updatedCust: Customer = {
          ...matchedCustomer,
          points: (matchedCustomer.points || 0) + pointsEarned,
          totalSpent: (matchedCustomer.totalSpent || 0) + order.total,
          visitsCount: (matchedCustomer.visitsCount || 0) + 1,
          lastVisit: getTodayString()
        };
        onUpdateCustomer(updatedCust);
      }
    }

    playCashSound();
    setPrintNotice(`🟦 ¡Cobro con Terminal Mercado Pago APROBADO! Folio #${order.folio} ($${amountToSettle}.00) registrado.`);
    setTimeout(() => {
      setPrintNotice('');
    }, 5500);
  };

  // Filter orders
  const todayStr = getTodayString();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const filteredOrders = orders.filter(order => {
    // Search query
    const matchSearch = 
      order.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customerPhone.includes(searchQuery) ||
      order.folio.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.rfc && order.rfc.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (order.businessName && order.businessName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (order.address && order.address.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchSearch) return false;

    // Date filter
    if (filterDate === 'hoy' && order.deliveryDate !== todayStr) return false;
    if (filterDate === 'manana' && order.deliveryDate !== tomorrowStr) return false;

    // Channel filter
    if (filterChannel === 'repartos_por_cobrar') {
      const isRepartoOrDelivery = order.orderChannel === 'reparto' ||
        order.deliveryType === 'domicilio' || 
        (order.assignedDriverId && order.assignedDriverId !== 'ninguno') ||
        (order.notes && (order.notes.includes('[PEDIDO REPARTO') || order.notes.includes('[PEDIDO SIN COBRAR')));
      if (!isRepartoOrDelivery || order.pendingAmount <= 0 || order.paymentStatus === 'pagado') return false;
    }
    if (filterChannel === 'venta_tienda') {
      const isStore = order.orderChannel === 'venta_tienda' ||
        order.origin === 'mostrador' || 
        order.customerName.toLowerCase().includes('venta en tienda') || 
        order.customerName.toLowerCase().includes('mostrador') ||
        (order.notes && (order.notes.includes('[VENTA MOSTRADOR') || order.notes.includes('[PEDIDO SIN COBRAR')));
      if (!isStore) return false;
    }
    if (filterChannel === 'reparto') {
      const isReparto = order.orderChannel === 'reparto' ||
        order.deliveryType === 'domicilio' || 
        (order.assignedDriverId && order.assignedDriverId !== 'ninguno') ||
        (order.notes && order.notes.includes('[REPARTO'));
      if (!isReparto) return false;
    }
    if (filterChannel === 'recoger_tienda') {
      const isPickup = order.orderChannel === 'recoger_tienda' ||
        (order.notes && (order.notes.includes('[PIDE Y RECOGE') || order.notes.includes('[RECOGER EN TIENDA') || order.notes.includes('[PEDIDO SIN COBRAR'))) ||
        (!order.customerName.toLowerCase().includes('mostrador') && !order.customerName.toLowerCase().includes('venta en tienda') && order.deliveryType === 'tienda');
      if (!isPickup) return false;
    }

    // Accountant filters
    if (accountingFilter === 'credito' && !order.isMonthlyCredit) return false;
    if (accountingFilter === 'requiere_factura' && !order.requiresInvoice) return false;
    if (accountingFilter === 'factura_pendiente' && (!order.requiresInvoice || order.invoiceStatus !== 'pendiente')) return false;
    if (accountingFilter === 'facturado' && order.invoiceStatus !== 'emitida') return false;
    if (accountingFilter === 'pendiente_cobro' && order.pendingAmount <= 0) return false;
    if (accountingFilter === 'pagados' && order.paymentStatus !== 'pagado') return false;

    return true;
  });

  // Calculate Metrics
  const monthlyCreditOrders = orders.filter(o => o.isMonthlyCredit);
  const totalPendingMonthlyCredit = monthlyCreditOrders.reduce((sum, o) => sum + o.pendingAmount, 0);
  const pendingInvoicesCount = orders.filter(o => o.requiresInvoice && o.invoiceStatus === 'pendiente').length;
  const totalGeneralPending = orders.reduce((sum, o) => sum + o.pendingAmount, 0);

  // Channel counts
  const storeOrders = orders.filter(o => 
    o.orderChannel === 'venta_tienda' ||
    o.origin === 'mostrador' || 
    o.customerName.toLowerCase().includes('venta en tienda') || 
    o.customerName.toLowerCase().includes('mostrador') ||
    (o.notes && o.notes.includes('[VENTA MOSTRADOR'))
  );

  const deliveryOrders = orders.filter(o => 
    o.orderChannel === 'reparto' ||
    o.deliveryType === 'domicilio' || 
    (o.assignedDriverId && orderChannel === 'reparto') ||
    (o.notes && o.notes.includes('[REPARTO'))
  );

  const pickupOrders = orders.filter(o => 
    o.orderChannel === 'recoger_tienda' ||
    (o.notes && (o.notes.includes('[PIDE Y RECOGE') || o.notes.includes('[RECOGER EN TIENDA'))) ||
    (!o.customerName.toLowerCase().includes('mostrador') && !o.customerName.toLowerCase().includes('venta en tienda') && o.deliveryType === 'tienda' && o.origin !== 'mostrador')
  );

  const handleSendWhatsApp = (order: BakeryOrder) => {
    const text = generateOrderWhatsAppMessage(order, settings);
    const phone = order.customerPhone ? order.customerPhone.replace(/\D/g, '') : '';
    const cleanPhone = phone.length === 10 ? `52${phone}` : phone;
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, '_blank');
  };

  const handleDeleteOrder = (order: BakeryOrder) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar permanentemente el pedido con folio #${order.folio} de "${order.customerName}"?`)) {
      return;
    }
    playBeep(450, 'sawtooth', 0.05);
    if (selectedOrder && selectedOrder.id === order.id) {
      setSelectedOrder(null);
    }
    if (onDeleteOrder) {
      onDeleteOrder(order.id);
    }
    setPrintNotice(`🗑️ Pedido #${order.folio} eliminado con éxito`);
    setTimeout(() => setPrintNotice(''), 3000);
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-4">
      {/* Toast Notice */}
      {printNotice && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-2xl shadow-2xl border-2 border-amber-400 font-bold text-xs animate-in slide-in-from-top-3 flex items-center gap-2">
          <span>{printNotice}</span>
        </div>
      )}

      {/* Selector Principal: Hoja Diaria de Repartos (Por defecto) vs Encargos y Especiales */}
      <div className="bg-white rounded-2xl p-3 shadow-xs border border-[#E5E1DA] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-orange-500 text-white flex items-center justify-center font-bold text-lg shadow-sm">
            🛵
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900 leading-tight flex items-center gap-2">
              <span>Repartos Santa Fé</span>
              <span className="bg-amber-100 text-amber-900 text-[10px] font-black px-2 py-0.5 rounded-md border border-amber-300">
                Mostrador & Rutas
              </span>
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Hoja diaria de repartidores Simón y Osvaldo, captura de piezas y tickets
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Botón ETAPA 2: Respaldar Pedidos */}
          <button
            type="button"
            id="btn-respaldar-pedidos"
            onClick={() => {
              playBeep(750, 'sine', 0.03);
              setShowBackupModal(true);
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white shadow-xs flex items-center gap-1.5 transition-all cursor-pointer border border-indigo-700"
            title="Descargar respaldo JSON de solo lectura de pedidos y repartos locales"
          >
            <Download className="w-3.5 h-3.5 text-indigo-200" />
            <span>RESPALDAR PEDIDOS</span>
          </button>

          <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1">
            <button
              type="button"
              onClick={() => setMainView('repartos')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                mainView === 'repartos'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🛵 Hoja de Reparto Diaria</span>
            </button>
            <button
              type="button"
              onClick={() => setMainView('pedidos')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                mainView === 'pedidos'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>📋 Encargos & Especiales</span>
            </button>
          </div>
        </div>
      </div>

      {mainView === 'repartos' ? (
        <DailyDeliverySheet
          driverCustomers={activeDriverCustomers}
          settings={settings}
          onUpdateDriverCustomers={onUpdateDriverCustomers}
          onSaveTicket={onSaveTicket}
          onDeleteTicket={onDeleteTicket}
        />
      ) : (
        <>
          {/* Top Section with Title */}
          <div className="bg-white rounded-2xl p-4 shadow-xs border border-[#E5E1DA]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#D95D39] to-amber-600 text-white flex items-center justify-center font-bold text-xl shadow-md">
                  📋
                </div>
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900 leading-tight flex items-center gap-2">
                    <span>Encargos y Pedidos Especiales</span>
                    <span className="bg-amber-100 text-amber-900 text-[11px] font-black px-2 py-0.5 rounded-md border border-amber-300">
                      Santa Fé El Refugio
                    </span>
                  </h1>
                  <p className="text-xs text-slate-500 font-medium">
                    Panel central para Tienda, Reparto y Pide y Recoge con Catálogo Real
                  </p>
                </div>
              </div>
            </div>

            {/* 3 MAIN CHANNELS BUTTONS WITH "+ AGREGAR PEDIDO" DIRECTLY UNDERNEATH */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-3 mt-3 border-t border-slate-100">
          
          {/* BOTÓN / BLOQUE 1: VENTA EN TIENDA (MOSTRADOR) */}
          <div className="flex flex-col justify-between bg-gradient-to-br from-emerald-50 via-white to-emerald-50/40 rounded-2xl p-3.5 border-2 border-emerald-300 shadow-xs hover:shadow-md transition-all">
            <div 
              onClick={() => setFilterChannel(filterChannel === 'venta_tienda' ? 'todos' : 'venta_tienda')}
              className="cursor-pointer space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-black text-sm text-emerald-950">
                  <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                    <Store className="w-4 h-4" />
                  </div>
                  <span>1. Venta en Tienda</span>
                </div>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                  filterChannel === 'venta_tienda' 
                    ? 'bg-emerald-700 text-white border-emerald-800' 
                    : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                }`}>
                  {storeOrders.length} pedidos
                </span>
              </div>
              <p className="text-[11px] text-emerald-800 font-medium">
                Cobro en mostrador / Pago inmediato en caja
              </p>
              <div className="flex items-center justify-between text-[11px] font-bold text-emerald-900 pt-1 border-t border-emerald-200/70">
                <span>Hoy: ${storeOrders.reduce((s, o) => s + o.total, 0)}.00</span>
                <span className="text-[10px] text-emerald-700 font-black">
                  {filterChannel === 'venta_tienda' ? '● Filtro activo' : 'Toca para filtrar'}
                </span>
              </div>
            </div>

            {/* BOTÓN COLOCADO EXACTAMENTE ABAJO: AGREGAR PEDIDO */}
            <button
              id="btn-add-order-store"
              type="button"
              onClick={handleOpenVentaTienda}
              className="mt-3 w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-extrabold text-xs shadow-xs hover:shadow-md transition-all active:scale-98 flex items-center justify-center gap-1.5 cursor-pointer border border-emerald-500"
            >
              <Plus className="w-4 h-4" />
              <span>Agregar Pedido</span>
            </button>
          </div>

          {/* BOTÓN / BLOQUE 2: PEDIDO PARA REPARTO (RUTAS Y CHOFERES) */}
          <div className="flex flex-col justify-between bg-gradient-to-br from-blue-50 via-white to-blue-50/40 rounded-2xl p-3.5 border-2 border-blue-300 shadow-xs hover:shadow-md transition-all">
            <div 
              onClick={() => setFilterChannel(filterChannel === 'reparto' ? 'todos' : 'reparto')}
              className="cursor-pointer space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-black text-sm text-blue-950">
                  <div className="w-7 h-7 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                    <Truck className="w-4 h-4" />
                  </div>
                  <span>2. Pedido para Reparto</span>
                </div>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                  filterChannel === 'reparto' 
                    ? 'bg-blue-700 text-white border-blue-800' 
                    : 'bg-blue-100 text-blue-900 border-blue-300'
                }`}>
                  {deliveryOrders.length} repartos
                </span>
              </div>
              <p className="text-[11px] text-blue-800 font-medium">
                Ruta Osvaldo & Simón (Por cobrar / Crédito Fin de Mes)
              </p>
              <div className="flex items-center justify-between text-[11px] font-bold text-blue-900 pt-1 border-t border-blue-200/70">
                <span>Por cobrar: ${deliveryOrders.reduce((s, o) => s + o.pendingAmount, 0)}.00</span>
                <span className="text-[10px] text-blue-700 font-black">
                  {filterChannel === 'reparto' ? '● Filtro activo' : 'Toca para filtrar'}
                </span>
              </div>
            </div>

            {/* BOTÓN COLOCADO EXACTAMENTE ABAJO: AGREGAR PEDIDO */}
            <button
              id="btn-add-order-delivery"
              type="button"
              onClick={() => handleOpenReparto('osvaldo')}
              className="mt-3 w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-extrabold text-xs shadow-xs hover:shadow-md transition-all active:scale-98 flex items-center justify-center gap-1.5 cursor-pointer border border-blue-500"
            >
              <Plus className="w-4 h-4" />
              <span>Agregar Pedido</span>
            </button>
          </div>

          {/* BOTÓN / BLOQUE 3: PIDE Y RECOGE (TIENDA) */}
          <div className="flex flex-col justify-between bg-gradient-to-br from-amber-50 via-white to-amber-50/40 rounded-2xl p-3.5 border-2 border-amber-300 shadow-xs hover:shadow-md transition-all">
            <div 
              onClick={() => setFilterChannel(filterChannel === 'recoger_tienda' ? 'todos' : 'recoger_tienda')}
              className="cursor-pointer space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-black text-sm text-amber-950">
                  <div className="w-7 h-7 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <span>3. Pide y Recoge</span>
                </div>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                  filterChannel === 'recoger_tienda' 
                    ? 'bg-amber-700 text-white border-amber-800' 
                    : 'bg-amber-100 text-amber-900 border-amber-300'
                }`}>
                  {pickupOrders.length} pedidos
                </span>
              </div>
              <p className="text-[11px] text-amber-800 font-medium">
                Trascos, Magda, Bollos David, Deliz y clientes manuales
              </p>
              <div className="flex items-center justify-between text-[11px] font-bold text-amber-900 pt-1 border-t border-amber-200/70">
                <span>Por recoger: {pickupOrders.filter(o => o.deliveryStatus !== 'entregado').length}</span>
                <span className="text-[10px] text-amber-700 font-black">
                  {filterChannel === 'recoger_tienda' ? '● Filtro activo' : 'Toca para filtrar'}
                </span>
              </div>
            </div>

            {/* BOTÓN COLOCADO EXACTAMENTE ABAJO: AGREGAR PEDIDO */}
            <button
              id="btn-add-order-pickup"
              type="button"
              onClick={() => handleOpenRecogerTienda()}
              className="mt-3 w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-700 hover:from-amber-700 hover:to-orange-800 text-white font-extrabold text-xs shadow-xs hover:shadow-md transition-all active:scale-98 flex items-center justify-center gap-1.5 cursor-pointer border border-amber-500"
            >
              <Plus className="w-4 h-4" />
              <span>Agregar Pedido</span>
            </button>
          </div>
        </div>
      </div>

      {/* Control Bar: Filters, Search & View Mode (Lista vs Tarjetas) */}
      <div className="bg-white rounded-2xl p-3.5 shadow-xs border border-[#E5E1DA] space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          
          {/* Search */}
          <div className="flex-1 min-w-[220px] relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por cliente, teléfono, folio, RFC o producto..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#FAF8F6] rounded-xl text-xs font-medium border border-[#E5E1DA] focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-800"
            />
          </div>

          {/* Date Filter Tabs */}
          <div className="flex items-center bg-[#FAF8F6] p-1 rounded-xl gap-1 border border-[#E5E1DA]">
            <button
              onClick={() => setFilterDate('hoy')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                filterDate === 'hoy' ? 'bg-[#D95D39] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hoy ({orders.filter(o => o.deliveryDate === todayStr).length})
            </button>
            <button
              onClick={() => setFilterDate('manana')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                filterDate === 'manana' ? 'bg-[#D95D39] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mañana ({orders.filter(o => o.deliveryDate === tomorrowStr).length})
            </button>
            <button
              onClick={() => setFilterDate('todos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                filterDate === 'todos' ? 'bg-[#D95D39] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos ({orders.length})
            </button>
          </div>

          {/* VIEW MODE TOGGLE (LISTA VS TARJETAS) */}
          <div className="flex items-center bg-[#FAF8F6] p-1 rounded-xl gap-1 border border-[#E5E1DA]">
            <button
              id="toggle-view-list-btn"
              type="button"
              onClick={() => setViewMode('lista')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'lista'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>Vista en Lista</span>
            </button>
            <button
              id="toggle-view-grid-btn"
              type="button"
              onClick={() => setViewMode('tarjetas')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'tarjetas'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cuadrícula</span>
            </button>
          </div>
        </div>

        {/* Channel Filter Chips */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center flex-wrap gap-1.5 text-xs">
            <span className="font-black text-slate-500 text-[11px] mr-1">Canal:</span>
            
            <button
              onClick={() => setFilterChannel('todos')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                filterChannel === 'todos' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Todos ({orders.length})
            </button>

            {/* ACCESO RÁPIDO PARA LAS CHICAS AL REGRESO DE LOS REPARTIDORES CON EL DINERO */}
            <button
              id="filter-repartos-por-cobrar-btn"
              type="button"
              onClick={() => setFilterChannel(filterChannel === 'repartos_por_cobrar' ? 'todos' : 'repartos_por_cobrar')}
              className={`px-3 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
                filterChannel === 'repartos_por_cobrar'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 ring-2 ring-amber-400 font-extrabold'
                  : 'bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-400'
              }`}
            >
              <Truck className="w-3.5 h-3.5 text-amber-900 shrink-0" />
              <span>🛵 Repartos Por Cobrar</span>
              <span className="bg-amber-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-black">
                {pendingRepartosOrders.length}
              </span>
            </button>

            <button
              onClick={() => setFilterChannel('venta_tienda')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                filterChannel === 'venta_tienda' ? 'bg-emerald-700 text-white' : 'bg-emerald-50 text-emerald-900 border border-emerald-200'
              }`}
            >
              <Store className="w-3 h-3" />
              <span>1. Venta en Tienda ({storeOrders.length})</span>
            </button>

            <button
              onClick={() => setFilterChannel('reparto')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                filterChannel === 'reparto' ? 'bg-blue-700 text-white' : 'bg-blue-50 text-blue-900 border border-blue-200'
              }`}
            >
              <Truck className="w-3 h-3" />
              <span>2. Reparto ({deliveryOrders.length})</span>
            </button>

            <button
              onClick={() => setFilterChannel('recoger_tienda')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                filterChannel === 'recoger_tienda' ? 'bg-amber-700 text-white' : 'bg-amber-50 text-amber-900 border border-amber-200'
              }`}
            >
              <ShoppingBag className="w-3 h-3" />
              <span>3. Pide y Recoge ({pickupOrders.length})</span>
            </button>
          </div>

          {/* Sub-Filters: Accounting */}
          <div className="flex items-center flex-wrap gap-1 text-[11px]">
            <button
              onClick={() => setAccountingFilter(accountingFilter === 'credito' ? 'todos' : 'credito')}
              className={`px-2 py-0.5 rounded-md font-bold transition-colors cursor-pointer ${
                accountingFilter === 'credito' ? 'bg-purple-800 text-white' : 'bg-purple-50 text-purple-900 border border-purple-200'
              }`}
            >
              📅 Fin de Mes (${totalPendingMonthlyCredit})
            </button>

            <button
              onClick={() => setAccountingFilter(accountingFilter === 'factura_pendiente' ? 'todos' : 'factura_pendiente')}
              className={`px-2 py-0.5 rounded-md font-bold transition-colors cursor-pointer ${
                accountingFilter === 'factura_pendiente' ? 'bg-amber-800 text-white' : 'bg-amber-50 text-amber-900 border border-amber-200'
              }`}
            >
              🧾 Facturas ({pendingInvoicesCount})
            </button>

            <button
              onClick={() => setAccountingFilter(accountingFilter === 'pendiente_cobro' ? 'todos' : 'pendiente_cobro')}
              className={`px-2 py-0.5 rounded-md font-bold transition-colors cursor-pointer ${
                accountingFilter === 'pendiente_cobro' ? 'bg-rose-800 text-white' : 'bg-rose-50 text-rose-900 border border-rose-200'
              }`}
            >
              💰 Por Cobrar (${totalGeneralPending})
            </button>
          </div>
        </div>
      </div>

      {/* ORDERS DISPLAY AREA */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-[#E5E1DA] text-slate-400">
          <div className="w-16 h-16 rounded-full bg-[#FFF5F0] text-[#D95D39] flex items-center justify-center mx-auto mb-3 text-3xl border border-[#E5E1DA]">
            📋
          </div>
          <h3 className="font-bold text-slate-700 text-base">No hay pedidos con los filtros seleccionados</h3>
          <p className="text-xs text-slate-500 mt-1">Usa los botones superiores para agregar un nuevo pedido</p>
        </div>
      ) : viewMode === 'lista' ? (
        
        /* ========================================================================= */
        /* MODO VISTA EN LISTA (LIST VIEW) CON ESTATUS Y DETALLES EN FILAS CLARAS    */
        /* ========================================================================= */
        <div className="bg-white rounded-2xl shadow-xs border border-[#E5E1DA] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white text-[11px] uppercase tracking-wider font-extrabold select-none">
                  <th className="py-3 px-3">Canal</th>
                  <th className="py-3 px-3">Folio & Horario</th>
                  <th className="py-3 px-3">Cliente & Contacto</th>
                  <th className="py-3 px-3">Panes / Detalle Solicitado</th>
                  <th className="py-3 px-3 text-right">Importes ($)</th>
                  <th className="py-3 px-3 text-center">Estatus Entrega</th>
                  <th className="py-3 px-3 text-center">Estatus Cobro</th>
                  <th className="py-3 px-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {filteredOrders.map((order) => {
                  const isToday = order.deliveryDate === todayStr;
                  const totalPieces = order.items.reduce((s, i) => s + i.quantity, 0);
                  const isStore = order.orderChannel === 'venta_tienda' || order.origin === 'mostrador' || order.customerName.toLowerCase().includes('mostrador');
                  const isPickup = order.orderChannel === 'recoger_tienda' || (order.notes && order.notes.includes('[PIDE Y RECOGE'));
                  const isDelivery = order.orderChannel === 'reparto' || order.deliveryType === 'domicilio' || (order.assignedDriverId && order.assignedDriverId !== 'ninguno');
                  const isUnpaidPos = (order.notes && order.notes.includes('[PEDIDO SIN COBRAR')) || (order.origin === 'mostrador' && order.pendingAmount > 0 && order.paymentStatus === 'pendiente');

                  return (
                    <tr 
                      key={order.id}
                      className="hover:bg-amber-50/30 transition-colors"
                    >
                      {/* 1. Canal */}
                      <td className="py-3 px-3 align-top whitespace-nowrap">
                        {isUnpaidPos ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-950 border border-emerald-400 px-2 py-1 rounded-lg text-[10.5px] font-black shadow-2xs ring-1 ring-emerald-500/20">
                            <ShoppingBag className="w-3 h-3 text-emerald-700" />
                            <span>Mostrador Sin Cobrar</span>
                          </span>
                        ) : isDelivery ? (
                          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-900 border border-blue-200 px-2 py-1 rounded-lg text-[10.5px] font-black">
                            <Truck className="w-3 h-3 text-blue-600" />
                            <span>Reparto ({order.assignedDriverId === 'osvaldo' ? 'Osvaldo' : order.assignedDriverId === 'simon' ? 'Simón' : 'Ruta'})</span>
                          </span>
                        ) : isPickup ? (
                          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-950 border border-amber-200 px-2 py-1 rounded-lg text-[10.5px] font-black">
                            <ShoppingBag className="w-3 h-3 text-amber-600" />
                            <span>Pide y Recoge</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-900 border border-emerald-200 px-2 py-1 rounded-lg text-[10.5px] font-black">
                            <Store className="w-3 h-3 text-emerald-600" />
                            <span>Venta Tienda</span>
                          </span>
                        )}
                      </td>

                      {/* 2. Folio & Horario */}
                      <td className="py-3 px-3 align-top whitespace-nowrap">
                        <div className="font-mono font-black text-[#D95D39] text-xs">
                          {order.folio}
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-slate-600 font-bold mt-0.5">
                          <Calendar className="w-3 h-3 text-[#D95D39]" />
                          <span>{isToday ? 'HOY' : order.deliveryDate}</span>
                          <span className="text-slate-400">•</span>
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{order.deliveryTime}</span>
                        </div>
                      </td>

                      {/* 3. Cliente & Contacto */}
                      <td className="py-3 px-3 align-top min-w-[170px]">
                        <div className="font-extrabold text-slate-900 text-xs">
                          {order.customerName}
                        </div>
                        {order.customerPhone && (
                          <div className="text-[11px] text-slate-500 font-semibold flex items-center gap-1 mt-0.5">
                            <Phone className="w-2.5 h-2.5 text-slate-400" />
                            <span>{order.customerPhone}</span>
                          </div>
                        )}
                        {order.address && order.deliveryType === 'domicilio' && (
                          <div className="text-[10px] text-slate-500 truncate max-w-[200px] flex items-center gap-1 mt-0.5">
                            <MapPin className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                            <span className="truncate">{order.address}</span>
                          </div>
                        )}
                      </td>

                      {/* 4. Panes / Detalle Solicitado */}
                      <td className="py-3 px-3 align-top min-w-[220px]">
                        <div className="flex items-center gap-1.5 mb-1 font-bold text-[11px] text-slate-700">
                          <span className="bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded font-black text-[10px]">
                            {totalPieces} pzs
                          </span>
                          <span>{order.items.length} partidas:</span>
                        </div>
                        <div className="text-[11px] text-slate-600 space-y-0.5 max-h-16 overflow-y-auto pr-1">
                          {order.items.map((it, idx) => (
                            <div key={idx} className="flex justify-between items-center bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                              <span className="font-semibold text-slate-800 truncate max-w-[170px]">
                                {it.quantity} {it.unit || 'PZ'} {it.name} {it.itemType === 'Mini' && !it.name.toLowerCase().includes('mini') ? '(Mini)' : ''}
                              </span>
                              <span className="font-bold text-slate-900 ml-1 shrink-0">
                                ${it.total}.00
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>

                      {/* 5. Importes */}
                      <td className="py-3 px-3 align-top text-right whitespace-nowrap">
                        <div className="font-black text-slate-900 text-sm">
                          ${order.total}.00
                        </div>
                        {order.pendingAmount > 0 ? (
                          <div className="text-[10.5px] text-rose-600 font-extrabold mt-0.5">
                            Resta: ${order.pendingAmount}.00
                          </div>
                        ) : (
                          <div className="text-[10.5px] text-emerald-700 font-bold mt-0.5">
                            ✓ Liquidado
                          </div>
                        )}
                      </td>

                      {/* 6. Estatus Entrega */}
                      <td className="py-3 px-3 align-top text-center whitespace-nowrap">
                        <div className="inline-flex flex-col gap-1 items-center">
                          <button
                            type="button"
                            onClick={() => {
                              const next = order.deliveryStatus === 'pendiente' ? 'en_camino' : order.deliveryStatus === 'en_camino' ? 'entregado' : 'pendiente';
                              handleQuickStatusChange(order, next);
                            }}
                            className={`px-2.5 py-1 rounded-full text-[10.5px] font-black cursor-pointer border transition-all active:scale-95 ${
                              order.deliveryStatus === 'entregado'
                                ? 'bg-emerald-600 text-white border-emerald-700'
                                : order.deliveryStatus === 'en_camino'
                                ? 'bg-blue-600 text-white border-blue-700'
                                : 'bg-amber-100 text-amber-900 border-amber-300'
                            }`}
                            title="Toca para cambiar estatus de entrega"
                          >
                            {order.deliveryStatus === 'entregado' && '✓ Entregado'}
                            {order.deliveryStatus === 'en_camino' && '🛵 En Camino'}
                            {order.deliveryStatus === 'pendiente' && '⏳ Pendiente'}
                          </button>
                        </div>
                      </td>

                      {/* 7. Estatus Cobro */}
                      <td className="py-3 px-3 align-top text-center whitespace-nowrap">
                        <div className="inline-flex flex-col gap-1 items-center">
                          {order.paymentStatus === 'pagado' ? (
                            <span className="bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-black px-2 py-0.5 rounded-full">
                              ✓ Pagado
                            </span>
                          ) : (
                            <span className="bg-rose-100 text-rose-900 border border-rose-300 text-[10px] font-black px-2 py-0.5 rounded-full">
                              ⏳ Por Cobrar
                            </span>
                          )}

                          {order.isMonthlyCredit && (
                            <span className="bg-purple-100 text-purple-900 border border-purple-300 text-[9px] font-black px-1.5 py-0.2 rounded">
                              Fin de Mes
                            </span>
                          )}
                          {order.requiresInvoice && (
                            <span className="bg-blue-100 text-blue-900 border border-blue-300 text-[9px] font-black px-1.5 py-0.2 rounded">
                              {order.invoiceStatus === 'emitida' ? 'Facturado' : 'Factura Pend.'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 8. Acciones */}
                      <td className="py-3 px-3 align-top text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          {/* Ver Detalle */}
                          <button
                            type="button"
                            onClick={() => setSelectedOrder(order)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                            title="Ver Detalle y Facturación"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>

                          {/* BOTÓN COBRADO DESTACADO (VALIDAR FOLIO Y COBRAR AL REGRESO DEL REPARTIDOR) */}
                          {order.pendingAmount > 0 && (
                            <button
                              id={`btn-cobrado-${order.folio}`}
                              type="button"
                              onClick={() => handlePromptDirectSettle(order)}
                              className="px-2.5 py-1 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-lg font-black text-xs shadow-xs hover:shadow active:scale-95 transition-all flex items-center gap-1 cursor-pointer border border-emerald-500 whitespace-nowrap"
                              title={`Marcar folio ${order.folio} como COBRADO ($${order.pendingAmount}.00)`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>Cobrado</span>
                            </button>
                          )}

                          {/* Cobrar / Liquidar Contable */}
                          {order.pendingAmount > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOrder(order);
                                handleOpenPaymentModal(order);
                              }}
                              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                              title="Abono Parcial o Detalle de Pago"
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Ticket Térmico Directo */}
                          <button
                            type="button"
                            onClick={() => handlePrintOrderDirect(order)}
                            className="p-1.5 bg-slate-900 hover:bg-slate-800 text-amber-300 rounded-lg transition-colors cursor-pointer"
                            title="Imprimir Ticket Térmico Directo"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>

                          {/* WhatsApp */}
                          <button
                            type="button"
                            onClick={() => handleSendWhatsApp(order)}
                            className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer"
                            title="Enviar WhatsApp"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </button>

                          {/* Eliminar Pedido */}
                          <button
                            type="button"
                            onClick={() => handleDeleteOrder(order)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors cursor-pointer"
                            title={`Eliminar pedido #${order.folio}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        
        /* ========================================================================= */
        /* MODO CUADRÍCULA / TARJETAS (GRID VIEW)                                   */
        /* ========================================================================= */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredOrders.map((order) => {
            const isToday = order.deliveryDate === todayStr;
            const completedItems = order.items.filter(it => it.done).length;
            const totalItemsCount = order.items.length;
            const isReady = completedItems === totalItemsCount && totalItemsCount > 0;
            const driver = drivers.find(d => d.id === order.assignedDriverId);

            return (
              <div
                key={order.id}
                onClick={() => setSelectedOrder(order)}
                className={`bg-white rounded-2xl p-4 shadow-xs hover:shadow-md border transition-all cursor-pointer flex flex-col justify-between space-y-3 relative ${
                  order.isMonthlyCredit
                    ? 'border-purple-300 hover:border-purple-600 ring-1 ring-purple-100'
                    : 'border-[#E5E1DA] hover:border-[#D95D39]'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-xs font-extrabold text-[#D95D39] bg-[#FFF5F0] px-2 py-0.5 rounded-md border border-[#E5E1DA]">
                        {order.folio}
                      </span>
                      {order.isMonthlyCredit && (
                        <span className="bg-purple-100 text-purple-900 text-[10px] font-black px-1.5 py-0.5 rounded-md border border-purple-300">
                          📅 FIN DE MES
                        </span>
                      )}
                      {order.origin === 'mostrador' && (
                        <span className="bg-slate-100 text-slate-700 text-[9.5px] font-bold px-1.5 py-0.5 rounded">
                          Mostrador
                        </span>
                      )}
                    </div>
                    <h3 className="font-extrabold text-slate-900 text-base mt-1 line-clamp-1">
                      {order.customerName}
                    </h3>
                  </div>

                  {/* Channel Badge */}
                  {(order.notes && order.notes.includes('[PEDIDO SIN COBRAR')) || (order.origin === 'mostrador' && order.pendingAmount > 0 && order.paymentStatus === 'pendiente') ? (
                    <span className="bg-emerald-100 text-emerald-950 text-[11px] font-black px-2 py-1 rounded-lg border border-emerald-400 flex items-center gap-1 shrink-0 shadow-2xs">
                      <ShoppingBag className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Sin Cobrar</span>
                    </span>
                  ) : order.orderChannel === 'reparto' || order.deliveryType === 'domicilio' || (order.assignedDriverId && order.assignedDriverId !== 'ninguno') ? (
                    <span className="bg-blue-50 text-blue-800 text-[11px] font-bold px-2 py-1 rounded-lg border border-blue-200 flex items-center gap-1 shrink-0">
                      <Truck className="w-3.5 h-3.5 text-blue-600" />
                      <span>{driver ? driver.name.split(' ')[0] : 'Reparto'}</span>
                    </span>
                  ) : order.orderChannel === 'recoger_tienda' || (order.notes && order.notes.includes('[PIDE Y RECOGE')) ? (
                    <span className="bg-amber-50 text-amber-800 text-[11px] font-bold px-2 py-1 rounded-lg border border-amber-200 flex items-center gap-1 shrink-0">
                      <ShoppingBag className="w-3.5 h-3.5 text-amber-600" />
                      <span>Pide y Recoge</span>
                    </span>
                  ) : (
                    <span className="bg-emerald-50 text-emerald-800 text-[11px] font-bold px-2 py-1 rounded-lg border border-emerald-200 flex items-center gap-1 shrink-0">
                      <Store className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Mostrador</span>
                    </span>
                  )}
                </div>

                {/* Date & Time */}
                <div className="bg-[#FAF8F6] p-2.5 rounded-xl text-xs space-y-1 text-slate-700 border border-[#E5E1DA]">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="flex items-center gap-1 text-slate-600">
                      <Calendar className="w-3.5 h-3.5 text-[#D95D39]" />
                      {isToday ? <strong className="text-[#D95D39]">HOY</strong> : order.deliveryDate}
                    </span>
                    <span className="flex items-center gap-1 font-bold text-slate-900">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {order.deliveryTime}
                    </span>
                  </div>
                  {order.address && order.deliveryType === 'domicilio' && (
                    <div className="flex items-start gap-1 text-[11px] text-slate-600 truncate pt-0.5">
                      <MapPin className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                      <span className="truncate">{order.address}</span>
                    </div>
                  )}
                </div>

                {/* Items Summary */}
                <div className="space-y-1">
                  <div className="text-[11px] font-bold text-slate-500 uppercase flex justify-between">
                    <span>Piezas ({order.items.reduce((s, i) => s + i.quantity, 0)} pzs):</span>
                    <span className={isReady ? 'text-emerald-600 font-bold' : 'text-[#D95D39]'}>
                      {completedItems}/{totalItemsCount} listos
                    </span>
                  </div>
                  <div className="text-xs text-slate-800 line-clamp-2 bg-[#FAF8F6] p-2 rounded-lg border border-[#E5E1DA] font-medium">
                    {order.items.map(it => `${it.quantity} ${it.unit || 'PZ'} ${it.name}`).join(' • ')}
                  </div>
                </div>

                {/* Footer */}
                <div className="pt-2 border-t border-[#E5E1DA] flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-500 text-[11px]">Total: </span>
                    <strong className="text-slate-900 font-extrabold text-sm">${order.total}.00</strong>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {order.pendingAmount > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <span className="bg-[#FFF5F0] text-[#D95D39] font-bold text-[11px] px-2 py-0.5 rounded-full border border-[#E5E1DA]">
                          Resta: ${order.pendingAmount}.00
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePromptDirectSettle(order);
                          }}
                          className="px-2 py-1 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-lg font-black text-xs shadow-xs hover:shadow active:scale-95 transition-all flex items-center gap-1 cursor-pointer border border-emerald-500"
                          title={`Marcar folio ${order.folio} como cobrado`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>Cobrado</span>
                        </button>
                      </div>
                    ) : (
                      <span className="bg-emerald-50 text-emerald-800 font-bold text-[11px] px-2.5 py-0.5 rounded-full border border-emerald-200">
                        ✓ Liquidado
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteOrder(order);
                      }}
                      className="p-1 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      title={`Eliminar pedido #${order.folio}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
        </>
      )}

      {/* ========================================================================= */}
      {/* MODAL DE CREAR PEDIDO (VISTA AMPLIA Y ACCESIBLE)                          */}
      {/* ========================================================================= */}
      <NewOrderModal
        showNewOrderModal={showNewOrderModal}
        setShowNewOrderModal={setShowNewOrderModal}
        orderChannel={orderChannel}
        setOrderChannel={setOrderChannel}
        customerName={customerName}
        setCustomerName={setCustomerName}
        customerPhone={customerPhone}
        setCustomerPhone={setCustomerPhone}
        deliveryDate={deliveryDate}
        setDeliveryDate={setDeliveryDate}
        deliveryTime={deliveryTime}
        setDeliveryTime={setDeliveryTime}
        address={address}
        setAddress={setAddress}
        notes={notes}
        setNotes={setNotes}
        deposit={deposit}
        setDeposit={setDeposit}
        deliveryType={deliveryType}
        setDeliveryType={setDeliveryType}
        assignedDriverId={assignedDriverId}
        setAssignedDriverId={setAssignedDriverId}
        storePaymentMethod={storePaymentMethod}
        setStorePaymentMethod={setStorePaymentMethod}
        pickupPaymentOption={pickupPaymentOption}
        setPickupPaymentOption={setPickupPaymentOption}
        selectedAlphabetLetter={selectedAlphabetLetter}
        setSelectedAlphabetLetter={setSelectedAlphabetLetter}
        clientFilterRoute={clientFilterRoute}
        setClientFilterRoute={setClientFilterRoute}
        clientSearchQuery={clientSearchQuery}
        setClientSearchQuery={setClientSearchQuery}
        catalogSearch={catalogSearch}
        setCatalogSearch={setCatalogSearch}
        openCatalogGroup={openCatalogGroup}
        setOpenCatalogGroup={setOpenCatalogGroup}
        orderItems={orderItems}
        itemConfigs={itemRowConfigs}
        updateItemConfig={updateItemConfig}
        getItemConfig={getItemConfig}
        handleAddCatalogItemToOrder={handleAddCatalogItemToOrder}
        handleRemoveOrderItem={handleRemoveOrderItem}
        handleUpdateOrderItemQty={handleUpdateOrderItemQty}
        handleCreateOrder={handleCreateOrder}
        handleSelectDriverCustomer={handleSelectDriverCustomer}
        activeDriverCustomers={activeDriverCustomers}
        activeCustomerPricingInfo={activeCustomerPricingInfo}
        alphabetFilteredProducts={alphabetFilteredProducts}
        totalOrderAmount={totalOrderAmount}
        totalPiecesCount={totalPiecesCount}
        effectiveDeposit={effectiveDeposit}
        effectivePending={effectivePending}
        isMonthlyCredit={isMonthlyCredit}
      />

      {/* ========================================================================= */}
      {/* MODAL DE DETALLE DEL PEDIDO & GESTIÓN CONTABLE / FISCAL                   */}
      {/* ========================================================================= */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden border-2 border-amber-400 animate-in fade-in zoom-in-95 my-auto max-h-[95vh] overflow-y-auto">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-5 py-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs bg-white/20 px-2 py-0.5 rounded font-black text-amber-300">
                    {selectedOrder.folio}
                  </span>
                  {selectedOrder.isMonthlyCredit && (
                    <span className="bg-purple-400 text-purple-950 text-[10px] font-black px-2 py-0.5 rounded-full">
                      📅 FIN DE MES
                    </span>
                  )}
                  {selectedOrder.origin === 'mostrador' && (
                    <span className="bg-slate-700 text-slate-200 text-[10px] font-bold px-1.5 py-0.5 rounded">
                      Desde Mostrador
                    </span>
                  )}
                </div>
                <h3 className="font-black text-lg mt-1 text-white">{selectedOrder.customerName}</h3>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-slate-300 hover:text-white p-1 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200 text-slate-700">
                <div>
                  <span className="text-slate-400 block text-[10.5px] uppercase font-bold">Fecha y Hora:</span>
                  <strong className="font-bold text-slate-900">{selectedOrder.deliveryDate} a las {selectedOrder.deliveryTime}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10.5px] uppercase font-bold">Modalidad:</span>
                  <strong className="font-bold text-slate-900">
                    {selectedOrder.orderChannel === 'reparto' || selectedOrder.deliveryType === 'domicilio' ? '🛵 A Domicilio' : selectedOrder.orderChannel === 'recoger_tienda' ? '🛍️ Pide y Recoge' : '🏬 En Mostrador'}
                  </strong>
                </div>
                {selectedOrder.customerPhone && (
                  <div className="col-span-2">
                    <span className="text-slate-400 block text-[10.5px] uppercase font-bold">Teléfono / WhatsApp:</span>
                    <strong className="font-bold text-slate-900">{selectedOrder.customerPhone}</strong>
                  </div>
                )}
                {selectedOrder.address && selectedOrder.deliveryType === 'domicilio' && (
                  <div className="col-span-2">
                    <span className="text-slate-400 block text-[10.5px] uppercase font-bold">Dirección:</span>
                    <strong className="font-bold text-slate-900">{selectedOrder.address}</strong>
                  </div>
                )}
              </div>

              {/* Items */}
              <div className="space-y-1.5">
                <div className="font-bold text-slate-700 uppercase text-[11px] flex justify-between">
                  <span>Panes Solicitados ({selectedOrder.items.reduce((s, i) => s + i.quantity, 0)} pzs):</span>
                  <span className="text-[#D95D39] font-extrabold">{selectedOrder.items.length} partidas</span>
                </div>
                <div className="bg-amber-50/40 p-3 rounded-2xl space-y-1.5 border border-amber-100 max-h-36 overflow-y-auto">
                  {selectedOrder.items.map((it, idx) => (
                    <div key={idx} className="flex justify-between items-center text-slate-800 text-xs">
                      <span>• {it.quantity} {it.unit || 'PZ'} {it.name} <span className="text-slate-400 font-normal">(${it.unitPrice} c/u)</span></span>
                      <span className="font-black text-slate-900">${it.total}.00</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Breakdown */}
              <div className="bg-slate-100 p-3 rounded-2xl space-y-2">
                <div className="grid grid-cols-3 gap-2 font-bold text-center">
                  <div className="bg-white p-2 rounded-xl border border-slate-200">
                    <span className="text-slate-400 block text-[10px] uppercase">Total:</span>
                    <span className="text-sm font-black text-slate-900">${selectedOrder.total}.00</span>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-slate-200">
                    <span className="text-slate-400 block text-[10px] uppercase">Abonado / Pagado:</span>
                    <span className="text-sm font-black text-emerald-700">${selectedOrder.deposit}.00</span>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-slate-200">
                    <span className="text-slate-400 block text-[10px] uppercase">Saldo por Cobrar:</span>
                    <span className="text-sm font-black text-rose-600">${selectedOrder.pendingAmount}.00</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                {selectedOrder.pendingAmount > 0 && (
                  <button
                    type="button"
                    onClick={() => handlePromptDirectSettle(selectedOrder)}
                    className="w-full bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all active:scale-98 border-2 border-emerald-400"
                  >
                    <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
                    <span className="text-sm">Validar Folio {selectedOrder.folio} y Marcar como COBRADO (${selectedOrder.pendingAmount}.00)</span>
                  </button>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleOpenPaymentModal(selectedOrder)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 px-3 rounded-xl flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs transition-all active:scale-98"
                  >
                    <DollarSign className="w-4 h-4" />
                    <span>Registrar Cobro</span>
                  </button>

                  <button
                    onClick={() => handleOpenInvoiceModal(selectedOrder)}
                    className="bg-purple-700 hover:bg-purple-800 text-white font-black py-2.5 px-3 rounded-xl flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs transition-all active:scale-98"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Gestionar Factura</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handlePrintOrderDirect(selectedOrder)}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-black py-2 px-2 rounded-xl flex items-center justify-center gap-1 cursor-pointer text-[11px]"
                  >
                    <Printer className="w-3.5 h-3.5 text-amber-300" />
                    <span>Ticket</span>
                  </button>

                  <button
                    onClick={() => handlePrintCustomerStatement(selectedOrder.customerName, selectedOrder.customerPhone)}
                    className="bg-indigo-700 hover:bg-indigo-800 text-white font-black py-2 px-2 rounded-xl flex items-center justify-center gap-1 cursor-pointer text-[11px]"
                  >
                    <Receipt className="w-3.5 h-3.5 text-amber-300" />
                    <span>Estado Cuenta</span>
                  </button>

                  <button
                    onClick={() => handleSendWhatsApp(selectedOrder)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2 px-2 rounded-xl flex items-center justify-center gap-1 cursor-pointer text-[11px]"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </button>
                </div>

                {/* Botón de Eliminar Pedido */}
                <button
                  type="button"
                  onClick={() => handleDeleteOrder(selectedOrder)}
                  className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer text-xs transition-colors mt-2"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Eliminar Pedido #{selectedOrder.folio}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QUICK PAYMENT MODAL FOR ACCOUNTANT */}
      {showPaymentModal && selectedOrder && (
        <div className="fixed inset-0 z-60 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-2xl max-w-md w-full border-2 border-emerald-400 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Registrar Cobro / Pago</h3>
                  <p className="text-[11px] text-slate-500 font-bold">Folio: {selectedOrder.folio} - {selectedOrder.customerName}</p>
                </div>
              </div>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                  Monto Cobrado ($):
                </label>
                <input
                  type="number"
                  min="0"
                  max={selectedOrder.pendingAmount || selectedOrder.total}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-emerald-50 border border-emerald-300 rounded-xl text-lg font-black text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                  Método de Pago:
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="mercadopago">🟦 Terminal Mercado Pago Point</option>
                  <option value="transferencia">🏦 Transferencia Bancaria (SPEI)</option>
                  <option value="cheque">📝 Cheque</option>
                  <option value="tarjeta">💳 Tarjeta Bancaria</option>
                  <option value="efectivo">💵 Efectivo en Caja</option>
                </select>
              </div>

              {/* Botón rápido directo para cobrar con Terminal Point */}
              <button
                type="button"
                onClick={() => {
                  const target = selectedOrder;
                  setShowPaymentModal(false);
                  setOrderChargingWithMp(target);
                }}
                className="w-full py-2.5 px-3 bg-gradient-to-r from-[#009EE3] to-[#007EB5] hover:from-[#008AC6] hover:to-[#006A99] text-white rounded-xl font-black text-xs shadow-md cursor-pointer flex items-center justify-center gap-1.5 transition-all active:scale-95"
              >
                <span>🟦 Cobrar con Terminal Mercado Pago Point</span>
              </button>

              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                  Referencia / Folio de Transferencia o Cheque:
                </label>
                <input
                  type="text"
                  placeholder="Ej. SPEI 8492019 / Cheque #004"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPayment}
                  className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs shadow-md cursor-pointer flex items-center justify-center gap-1"
                >
                  <CheckCheck className="w-4 h-4" />
                  <span>Guardar Cobro</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QUICK INVOICE MODAL FOR ACCOUNTANT */}
      {showInvoiceModal && selectedOrder && (
        <div className="fixed inset-0 z-60 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-2xl max-w-md w-full border-2 border-purple-400 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Estado de Facturación</h3>
                  <p className="text-[11px] text-slate-500 font-bold">Folio: {selectedOrder.folio}</p>
                </div>
              </div>
              <button
                onClick={() => setShowInvoiceModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                  Estado de la Factura:
                </label>
                <select
                  value={invoiceStatusSelect}
                  onChange={(e) => setInvoiceStatusSelect(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="emitida">✅ Factura Emitida / Timbrada</option>
                  <option value="pendiente">⏳ Pendiente de Timbrar</option>
                  <option value="cancelada">❌ Cancelada</option>
                  <option value="no_requerida">🚫 No Requerida</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                  Folio Fiscal / UUID / Número de Factura:
                </label>
                <input
                  type="text"
                  placeholder="Ej. F-9481 / A1B2C3D4-..."
                  value={invoiceFolioInput}
                  onChange={(e) => setInvoiceFolioInput(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                  RFC del Receptor:
                </label>
                <input
                  type="text"
                  placeholder="XAXX010101000"
                  value={invoiceRfcInput}
                  onChange={(e) => setInvoiceRfcInput(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold uppercase text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                  Razón Social:
                </label>
                <input
                  type="text"
                  placeholder="Nombre de la empresa o cliente"
                  value={invoiceBusinessInput}
                  onChange={(e) => setInvoiceBusinessInput(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-1">
                  Uso de CFDI:
                </label>
                <select
                  value={invoiceCfdiInput}
                  onChange={(e) => setInvoiceCfdiInput(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="G03 - Gastos en general">G03 - Gastos en general</option>
                  <option value="G01 - Adquisición de mercancías">G01 - Adquisición de mercancías</option>
                  <option value="P01 - Por definir">P01 - Por definir</option>
                  <option value="S01 - Sin efectos fiscales">S01 - Sin efectos fiscales</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShowInvoiceModal(false)}
                  className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmInvoice}
                  className="py-2.5 px-3 bg-purple-700 hover:bg-purple-800 text-white rounded-xl font-black text-xs shadow-md cursor-pointer flex items-center justify-center gap-1"
                >
                  <FileCheck className="w-4 h-4" />
                  <span>Guardar Factura</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Validación de Folio y Cobro de Reparto */}
      {orderToSettle && (
        <div className="fixed inset-0 z-60 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-5 shadow-2xl max-w-sm w-full border-2 border-emerald-500 animate-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-emerald-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-2xs">
                  <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900 leading-tight">
                    Validar Folio y Cobro
                  </h3>
                  <span className="text-[11px] text-emerald-700 font-bold">
                    Ingreso a corte de caja
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOrderToSettle(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-emerald-50 rounded-2xl p-3 border border-emerald-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] uppercase font-black text-emerald-950">
                  Folio del Ticket:
                </span>
                <span className="text-base font-black font-mono text-[#D95D39] bg-white px-2 py-0.5 rounded-lg border border-emerald-300">
                  {orderToSettle.folio}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[10.5px] uppercase font-bold text-slate-600">
                  Cliente:
                </span>
                <span className="text-xs font-black text-slate-900 text-right truncate max-w-[170px]">
                  {orderToSettle.customerName}
                </span>
              </div>

              <div className="pt-2 border-t border-emerald-200 flex items-center justify-between">
                <span className="text-xs font-black text-slate-700 uppercase">
                  Monto a Cobrar:
                </span>
                <span className="text-2xl font-black font-mono text-emerald-700">
                  ${orderToSettle.pendingAmount > 0 ? orderToSettle.pendingAmount : orderToSettle.total}.00
                </span>
              </div>

              <div className="pt-1 text-[10.5px] text-emerald-800 font-semibold flex items-center justify-between">
                <span>Puntos acumulados al cliente:</span>
                <span className="font-mono font-black text-emerald-900">
                  +{Math.floor(orderToSettle.total / (settings.loyaltyPointsPerPesos || 20))} pts ⭐
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-600 font-medium text-center">
              Al confirmar, el pedido se marcará como pagado y el dinero en efectivo se registrará en el corte de caja del turno actual.
            </p>

            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOrderToSettle(null)}
                  className="py-2.5 px-3 rounded-xl border border-slate-300 hover:bg-slate-100 font-bold text-xs text-slate-700 cursor-pointer text-center"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDirectSettle}
                  className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black text-xs shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer border border-emerald-600"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Efectivo en Caja</span>
                </button>
              </div>

              {/* Botón para cobrar con Mercado Pago */}
              <button
                type="button"
                onClick={() => {
                  const target = orderToSettle;
                  setOrderToSettle(null);
                  setOrderChargingWithMp(target);
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#009EE3] to-[#007EB5] hover:from-[#008AC6] hover:to-[#006A99] text-white font-black text-xs shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer border border-[#007EB5]"
              >
                <span>🟦 Cobrar con Terminal Mercado Pago</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ventana de Cobro de Pedido con Terminal Mercado Pago Point */}
      {orderChargingWithMp && (
        <MercadoPagoPaymentModal
          isOpen={Boolean(orderChargingWithMp)}
          amount={orderChargingWithMp.pendingAmount > 0 ? orderChargingWithMp.pendingAmount : orderChargingWithMp.total}
          folio={orderChargingWithMp.folio}
          customerName={orderChargingWithMp.customerName}
          onClose={() => setOrderChargingWithMp(null)}
          onPaymentApproved={(cardDetails) => {
            handleOrderMpPaymentApproved(orderChargingWithMp, cardDetails);
          }}
        />
      )}

      {/* Modal ETAPA 2: Respaldo Independiente de Pedidos y Repartos */}
      <BackupOrdersModal
        isOpen={showBackupModal}
        onClose={() => setShowBackupModal(false)}
      />
    </div>
  );
};
