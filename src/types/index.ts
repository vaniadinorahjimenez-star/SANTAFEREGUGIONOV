export type BreadCategory = 
  | 'Salado'
  | 'Pan Dulce / Bizcocho'
  | 'Feite y Batidos'
  | 'Lácteos y Acompañamientos'
  | 'Pan Dulce Tradicional'
  | 'Bolillo y Telera'
  | 'Pasteles y Tartas'
  | 'Roscas y Especiales'
  | 'Panqués y Galletas'
  | 'Bocadillos y Empanadas';

export interface ProductionSheetRow {
  id: string;
  category: 'Salado' | 'Pan Dulce / Bizcocho' | 'Feite y Batidos';
  breadName: string;
  subgroup?: string; // e.g. "Danés"
  suggestedPrice?: number;
  lun: string;
  mar: string;
  mier: string;
  juev: string;
  vier: string;
  sab: string;
  dom: string;
}

export interface BreadProduct {
  id: string;
  name: string;
  price: number;
  category: BreadCategory;
  isQuickPreset?: boolean;
}

export interface TicketItem {
  id: string;
  productId?: string;
  name: string;
  price: number;
  quantity: number;
  total: number;
}

export interface SaleTicket {
  id: string;
  folio: string;
  timestamp: string; // ISO string
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  items: TicketItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: 'efectivo' | 'tarjeta';
  cardTerminal?: 'zettle' | 'clip' | 'terminal_bancaria' | 'otro';
  cardAuthCode?: string;
  cardReference?: string;
  cardLast4?: string;
  amountPaid: number;
  change: number;
  customerName?: string;
  customerPhone?: string;
  pointsEarned: number;
  pointsRedeemed: number;
  isSpecialDiscount?: boolean;
  specialDiscount?: number;
  cashier: string;
  shift?: 'turno1' | 'turno2';
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  points: number; // 1 point = 1 peso
  totalSpent: number;
  visitsCount: number;
  lastVisit: string;
}

export interface OrderItem {
  breadId: string;
  name: string;
  category: string;
  quantity: number;
  unitPrice: number;
  total: number;
  unit?: 'PZ' | 'CH' | 'KG';
  itemType?: 'Normal' | 'Mini';
  done?: boolean;
}

export interface BakeryOrder {
  id: string;
  folio: string;
  customerName: string;
  customerPhone: string;
  deliveryType: 'tienda_venta' | 'reparto' | 'recoger_tienda' | 'tienda' | 'domicilio';
  orderChannel?: 'venta_tienda' | 'reparto' | 'recoger_tienda';
  address?: string;
  deliveryDate: string; // YYYY-MM-DD
  deliveryTime: string; // HH:MM
  items: OrderItem[];
  total: number;
  deposit: number; // anticipo
  pendingAmount: number; // saldo pendiente
  paymentStatus: 'pendiente' | 'anticipo' | 'pagado';
  assignedDriverId: 'osvaldo' | 'simon' | 'ninguno';
  deliveryStatus: 'pendiente' | 'en_camino' | 'entregado';
  notes?: string;
  createdAt: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  collectedAmount?: number;
  deliveredAt?: string;
  // Campos de Crédito a Fin de Mes y Facturación / Contabilidad
  isMonthlyCredit?: boolean; // Cliente con pago a fin de mes / Crédito comercial
  requiresInvoice?: boolean; // ¿Requiere factura fiscal?
  invoiceStatus?: 'no_requerida' | 'pendiente' | 'facturado' | 'emitida' | 'cancelada'; // Estado de facturación
  invoiceFolio?: string; // Folio de Factura (ej. FAC-2024-88) o UUID SAT
  rfc?: string; // RFC para timbrado
  businessName?: string; // Razón Social del cliente / empresa
  cfdiUse?: string; // Uso de CFDI (ej. G03 - Gastos en general)
  paidDate?: string; // Fecha en que se liquidó
  paidMethod?: 'efectivo' | 'transferencia' | 'tarjeta' | 'cheque'; // Método de cobro liquidado
  paidReference?: string; // Referencia bancaria o folio de pago
  accountingNotes?: string; // Notas de la contadora
  origin?: 'mostrador' | 'pedido_directo';
}

export interface DriverCustomer {
  id: string;
  name: string;
  driverId: 'osvaldo' | 'simon' | 'tienda';
  customerType?: 'reparto' | 'recoger_tienda';
  phone?: string;
  address?: string;
  notes?: string;
  defaultPayment?: 'credito' | 'contado';
  priceListKey?: string;
  customPriceOverrides?: Record<string, number>;
}

export interface Driver {
  id: 'osvaldo' | 'simon';
  name: string;
  phone: string;
  vehicle: string;
  pin: string;
  avatarColor: string;
  assignedCustomers?: string[];
}

export interface CashOutflowItem {
  id: string;
  concept: string; // e.g. "Pago Harinera", "Gas", "Proveedor Huevo", "Bolsas", etc.
  amount: number;
  time: string; // Auto-recorded time
  recipient?: string;
  notes?: string;
  date?: string; // YYYY-MM-DD
  shiftCode?: 'turno1' | 'turno2' | 'completo' | string;
  shiftName?: string;
  createdAt?: string;
}

export interface NonBreadItemSummary {
  name: string;
  quantity: number;
  total: number;
}

export interface ShiftCutRecord {
  id: string;
  folio: string;
  date: string; // YYYY-MM-DD
  time: string; // Auto-recorded time
  cashierName: string; // Name of cashier / person on duty
  shiftName: 'Turno 1 (Mañana)' | 'Turno 2 (Tarde)' | 'Turno Completo' | string;
  initialCash: number; // Fondo inicial de caja
  totalGrossSales: number; // Ventas totales
  totalCashSales: number; // Ventas en efectivo
  totalCardSales: number; // Ventas con tarjeta
  rawCardTerminalTotal?: number; // Lectura total acumulada en terminal bancaria en Turno 2 antes de restar T1
  shift1CardDeduction?: number; // Venta con tarjeta del Turno 1 descontada para el cierre del Turno 2
  systemGrossSales?: number; // Total de venta registrado en tickets del sistema
  systemCashSales?: number; // Efectivo registrado en tickets
  systemCardSales?: number; // Tarjeta registrada en tickets
  isCardManualOverride?: boolean; // Indica si el monto con tarjeta fue ingresado manualmente
  totalBreadSales?: number; // Venta de Pan ($)
  totalNonBreadSales?: number; // Venta de Otros / No Pan ($)
  breadPieces?: number; // Piezas de pan
  nonBreadPieces?: number; // Piezas / unidades de otros productos
  nonBreadItems?: NonBreadItemSummary[]; // Desglose itemizado de productos no pan registrados (ej. paletas, quesos)
  totalPieces: number; // Piezas totales
  ticketsCount: number; // Total tickets
  outflows: CashOutflowItem[]; // Salidas / Pagos a proveedores
  totalOutflows: number; // Suma de salidas
  expectedCashInDrawer: number; // Efectivo total esperado en el cajón: (initialCash + totalCashSales - totalOutflows)
  nextShiftCash?: number; // Fondo que se deja en caja para el siguiente turno (por default $1,000)
  cashToDeliver?: number; // Efectivo neto a retirar / entregar al patrón o sobre (lo que quedó para la bolsita)
  expectedInBag?: number; // Lo que tenía que ponerse en bolsita según ventas en efectivo menos salidas
  actualInBag?: number; // Lo que realmente quedó contado para la bolsita
  bagDifference?: number; // Diferencia del cuadre de bolsita: actualInBag - expectedInBag
  actualCashInDrawer?: number; // Conteo real físico de dinero
  difference?: number; // Sobrante / Faltante
  nextShiftBillsBreakdown?: { [denom: number]: number }; // Desglose de billetes que se dejan para sig. turno
  drawerCashBreakdown?: { [denom: number]: number }; // Desglose por billetes y monedas contados de lo que quedó
  notes?: string;
  createdAt: string;
}

export interface Settings {
  bakeryName: string;
  slogan: string;
  phone: string;
  address: string;
  ticketFooter: string;
  loyaltyPointsPerPesos: number; // e.g. 20 (every 20 pesos gives 1 point)
  loyaltyValuePerPoint: number; // 1 point = 1 peso
  quickPrices: number[];
  pinAdmin: string;
  adminPin?: string;
  taxRate: number; // 0 for bakeries usually
  ticketPaperWidth?: '58mm' | '80mm'; // Default 58mm standard compact thermal paper
}

export interface ZettleDeviceInfo {
  id: string;
  name: string;
  connected: boolean;
  batteryLevel?: number; // e.g. 85%
  lastConnected?: string;
  deviceType?: 'Zettle Reader 2' | 'Zettle Terminal' | 'Zettle Reader 1' | 'Terminal Bluetooth POS';
}

export interface ZettlePaymentSession {
  amount: number;
  folio: string;
  status: 'idle' | 'connecting' | 'awaiting_card' | 'processing' | 'approved' | 'declined' | 'cancelled';
  authCode?: string;
  reference?: string;
  last4?: string;
  errorMessage?: string;
}

