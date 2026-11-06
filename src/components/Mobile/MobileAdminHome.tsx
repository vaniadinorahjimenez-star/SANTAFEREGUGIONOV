import React, { useState, useMemo } from 'react';
import { 
  BakeryOrder, 
  SaleTicket, 
  BreadProduct, 
  Customer, 
  DriverCustomer, 
  Settings, 
  Driver 
} from '../../types';
import { 
  Plus, 
  ShoppingBag, 
  Truck, 
  ChefHat, 
  BarChart3, 
  Clock, 
  Calendar, 
  Search, 
  Phone, 
  Share2, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  ChevronRight, 
  Monitor, 
  RefreshCw, 
  Sparkles,
  MapPin,
  ArrowRight
} from 'lucide-react';
import { getTodayString } from '../../utils/storage';
import { MobileQuickOrder } from './MobileQuickOrder';
import { BakerMobileWorkshop } from '../Bakers/BakerMobileWorkshop';
import { DailyConsolidatedSummary } from '../Production/DailyConsolidatedSummary';

interface MobileAdminHomeProps {
  orders: BakeryOrder[];
  tickets: SaleTicket[];
  products: BreadProduct[];
  customers: Customer[];
  driverCustomers: DriverCustomer[];
  settings: Settings;
  drivers: Driver[];
  firebaseStatus?: { connected: boolean; userEmail?: string };
  isSyncing?: boolean;
  onManualSync?: () => void;
  onSaveOrder: (order: BakeryOrder) => void;
  onUpdateOrder: (order: BakeryOrder) => void;
  onToggleItemDone: (orderId: string, itemIdx: number) => void;
  onSwitchToDesktop: () => void;
  onNavigateToTab: (tab: 'pos' | 'orders' | 'delivery' | 'bakers' | 'history' | 'analytics') => void;
}

export const MobileAdminHome: React.FC<MobileAdminHomeProps> = ({
  orders,
  tickets,
  products,
  customers,
  driverCustomers,
  settings,
  drivers,
  firebaseStatus,
  isSyncing = false,
  onManualSync,
  onSaveOrder,
  onUpdateOrder,
  onToggleItemDone,
  onSwitchToDesktop,
  onNavigateToTab
}) => {
  const todayStr = getTodayString();
  const [activeBranch, setActiveBranch] = useState<'El Refugio' | 'Zákia'>('El Refugio');
  const [showQuickOrderModal, setShowQuickOrderModal] = useState<boolean>(false);
  const [showBakerModal, setShowBakerModal] = useState<boolean>(false);
  const [showProductionModal, setShowProductionModal] = useState<boolean>(false);
  const [orderSearch, setOrderSearch] = useState<string>('');

  // Today tickets and sales
  const todayTickets = useMemo(() => {
    return tickets.filter(t => {
      const d = t.date?.trim() || (t.timestamp ? t.timestamp.split('T')[0] : '');
      return d === todayStr;
    });
  }, [tickets, todayStr]);

  const todaySalesTotal = useMemo(() => {
    return todayTickets.reduce((acc, t) => acc + (t.total || 0), 0);
  }, [todayTickets]);

  // Today orders
  const todayOrders = useMemo(() => {
    return orders.filter(o => (o.deliveryDate || todayStr) === todayStr);
  }, [orders, todayStr]);

  const todayOrdersPieces = useMemo(() => {
    return todayOrders.reduce((acc, o) => {
      return acc + (o.items || []).reduce((sum, it) => sum + (it.quantity || 0), 0);
    }, 0);
  }, [todayOrders]);

  // Filtered orders list for today
  const filteredTodayOrders = useMemo(() => {
    let list = [...todayOrders];
    if (orderSearch.trim()) {
      const q = orderSearch.trim().toLowerCase();
      list = list.filter(o => 
        o.customerName?.toLowerCase().includes(q) || 
        o.folio?.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [todayOrders, orderSearch]);

  // Quick WhatsApp share
  const handleShareTicketWhatsApp = (order: BakeryOrder) => {
    const phone = order.customerPhone?.replace(/\D/g, '') || '';
    let msg = `🥖 *PANADERÍA SANTA FÉ* 🥖\n`;
    msg += `*Ticket de Pedido: ${order.folio}*\n\n`;
    msg += `👤 *Cliente:* ${order.customerName}\n`;
    msg += `📅 *Fecha:* ${order.deliveryDate} • ${order.deliveryTime}\n`;
    msg += `─────────────────\n`;
    (order.items || []).forEach(it => {
      msg += `• ${it.quantity}x ${it.name} ($${it.total.toFixed(2)})\n`;
    });
    msg += `─────────────────\n`;
    msg += `💰 *Total:* $${order.total.toFixed(2)}\n`;
    if (order.deposit > 0) {
      msg += `💵 *Anticipo:* $${order.deposit.toFixed(2)}\n`;
      msg += `💳 *Saldo:* $${order.pendingAmount.toFixed(2)}\n`;
    }
    const encoded = encodeURIComponent(msg);
    if (phone.length >= 10) {
      window.open(`https://wa.me/52${phone}?text=${encoded}`, '_blank');
    } else {
      window.open(`https://wa.me/?text=${encoded}`, '_blank');
    }
  };

  return (
    <div className="bg-[#FDFBF7] min-h-screen text-slate-800 flex flex-col font-sans pb-16">
      {/* Modals */}
      {showQuickOrderModal && (
        <MobileQuickOrder
          products={products}
          customers={customers}
          driverCustomers={driverCustomers}
          orders={orders}
          onSaveOrder={(newOrder) => {
            onSaveOrder(newOrder);
          }}
          onClose={() => setShowQuickOrderModal(false)}
        />
      )}

      {showBakerModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <BakerMobileWorkshop
            orders={orders}
            onToggleItemDone={onToggleItemDone}
            onClose={() => setShowBakerModal(false)}
          />
        </div>
      )}

      {showProductionModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <DailyConsolidatedSummary
            orders={orders}
            products={products}
            driverCustomers={driverCustomers}
            tickets={tickets}
            onClose={() => setShowProductionModal(false)}
          />
        </div>
      )}

      {/* Mobile Top App Bar */}
      <header className="bg-[#2D2A26] text-white px-3 py-2 shadow-md sticky top-0 z-30">
        <div className="flex items-center justify-between">
          {/* Logo & Branch */}
          <div className="flex items-center space-x-2">
            <span className="font-serif italic font-bold text-lg text-[#D95D39] tracking-tight">Santa Fé</span>
            <div className="h-4 w-px bg-slate-700" />
            <select
              value={activeBranch}
              onChange={(e) => setActiveBranch(e.target.value as any)}
              aria-label="Seleccionar sucursal activa"
              className="bg-black/40 text-amber-300 font-bold text-xs py-0.5 px-2 rounded-md border border-slate-700 focus:outline-none"
            >
              <option value="El Refugio">El Refugio</option>
              <option value="Zákia">Zákia</option>
            </select>
          </div>

          {/* Sync badge & Desktop toggle */}
          <div className="flex items-center space-x-2">
            <div 
              onClick={onManualSync}
              className="flex items-center space-x-1 bg-black/40 px-2 py-1 rounded-md text-[10px] cursor-pointer hover:bg-black/60 border border-slate-700"
              title="Sincronización en tiempo real con Firebase"
            >
              <div className={`w-2 h-2 rounded-full ${firebaseStatus?.connected !== false ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="font-semibold text-slate-300">
                {isSyncing ? 'Sincronizando...' : 'En línea'}
              </span>
            </div>

            <button
              onClick={onSwitchToDesktop}
              className="bg-slate-700 hover:bg-slate-600 text-slate-200 p-1.5 rounded-lg text-[10px] font-bold flex items-center space-x-1"
              title="Cambiar a vista completa de computadora"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Escritorio</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="p-3 space-y-3">
        {/* Prominent Quick Order Button (Thumb zone) */}
        <button
          onClick={() => setShowQuickOrderModal(true)}
          className="w-full py-3 bg-[#D95D39] hover:bg-orange-600 active:scale-[0.99] text-white rounded-xl font-black text-sm tracking-wide shadow-lg shadow-orange-900/20 flex items-center justify-center space-x-2 transition-transform"
        >
          <Plus className="w-5 h-5 stroke-[3]" />
          <span>+ NUEVO PEDIDO RÁPIDO</span>
        </button>

        {/* 4 Compact Real-Time KPI Cards (2x2 Grid) */}
        <div className="grid grid-cols-2 gap-2">
          {/* Card 1: Ventas Hoy */}
          <div 
            onClick={() => onNavigateToTab('pos')}
            className="bg-white p-2.5 rounded-xl border border-[#E5E1DA] shadow-xs active:bg-amber-50 cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between text-slate-400 mb-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider">Ventas Hoy</span>
              <ShoppingBag className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="text-base font-black text-slate-900">
              ${todaySalesTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-500 font-medium">
              {todayTickets.length} tickets en caja
            </div>
          </div>

          {/* Card 2: Pedidos Activos */}
          <div 
            onClick={() => onNavigateToTab('orders')}
            className="bg-white p-2.5 rounded-xl border border-[#E5E1DA] shadow-xs active:bg-amber-50 cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between text-slate-400 mb-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider">Pedidos Hoy</span>
              <Calendar className="w-3.5 h-3.5 text-[#D95D39]" />
            </div>
            <div className="text-base font-black text-[#D95D39]">
              {todayOrders.length} pedidos
            </div>
            <div className="text-[10px] text-slate-500 font-medium">
              {todayOrdersPieces} piezas totales
            </div>
          </div>

          {/* Card 3: Rutas de Reparto */}
          <div 
            onClick={() => onNavigateToTab('orders')}
            className="bg-white p-2.5 rounded-xl border border-[#E5E1DA] shadow-xs active:bg-amber-50 cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between text-slate-400 mb-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider">Rutas Reparto</span>
              <Truck className="w-3.5 h-3.5 text-sky-600" />
            </div>
            <div className="text-base font-black text-sky-700">
              Simón y Osvaldo
            </div>
            <div className="text-[10px] text-slate-500 font-medium">
              Cotejo y liquidación
            </div>
          </div>

          {/* Card 4: Taller Panadero */}
          <div 
            onClick={() => setShowBakerModal(true)}
            className="bg-white p-2.5 rounded-xl border border-[#E5E1DA] shadow-xs active:bg-amber-50 cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between text-slate-400 mb-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider">Taller Panadero</span>
              <ChefHat className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div className="text-base font-black text-amber-700">
              {todayOrdersPieces} pzas
            </div>
            <div className="text-[10px] text-emerald-600 font-bold">
              Botón "Ya está hecho"
            </div>
          </div>
        </div>

        {/* Quick Nav Action Strip */}
        <div className="grid grid-cols-3 gap-1.5">
          <button
            onClick={() => setShowBakerModal(true)}
            className="py-2 px-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl flex items-center justify-center space-x-1.5 text-amber-900 font-bold text-xs"
          >
            <ChefHat className="w-3.5 h-3.5 text-amber-700" />
            <span>Panaderos</span>
          </button>
          <button
            onClick={() => setShowProductionModal(true)}
            className="py-2 px-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-center space-x-1.5 text-slate-800 font-bold text-xs"
          >
            <BarChart3 className="w-3.5 h-3.5 text-slate-700" />
            <span>Producción</span>
          </button>
          <button
            onClick={() => onNavigateToTab('orders')}
            className="py-2 px-2 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl flex items-center justify-center space-x-1.5 text-sky-900 font-bold text-xs"
          >
            <Truck className="w-3.5 h-3.5 text-sky-700" />
            <span>Repartos</span>
          </button>
        </div>

        {/* Today Orders List (Thin Compact Rows, 32px) */}
        <div className="bg-white rounded-xl p-2.5 border border-[#E5E1DA] shadow-xs">
          <div className="flex items-center justify-between mb-1.5">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Pedidos de Hoy ({todayOrders.length})
              </h2>
              <p className="text-[9.5px] text-slate-400">Sincronizados en tiempo real</p>
            </div>
            <div className="relative w-32">
              <input
                type="text"
                placeholder="Buscar..."
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                className="w-full pl-6 pr-2 py-0.5 text-[11px] bg-slate-50 border border-slate-200 rounded-md"
              />
              <Search className="w-3 h-3 text-slate-400 absolute left-1.5 top-1.5" />
            </div>
          </div>

          {filteredTodayOrders.length === 0 ? (
            <div className="text-center py-5 text-slate-400 text-xs">
              No hay pedidos registrados para hoy. Presiona <span className="font-bold text-[#D95D39]">+ Nuevo Pedido</span>.
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredTodayOrders.map(order => {
                const totalPieces = (order.items || []).reduce((a, b) => a + (b.quantity || 0), 0);
                const isPaid = order.paymentStatus === 'pagado';
                const hasDeposit = order.deposit > 0 && !isPaid;

                return (
                  <div
                    key={order.id}
                    className="h-8 px-2 bg-slate-50 hover:bg-amber-50/60 rounded-md border border-slate-200/80 flex items-center justify-between text-xs transition-colors"
                  >
                    {/* Folio & Client */}
                    <div className="flex items-center space-x-1.5 min-w-0 flex-1 mr-1.5">
                      <span className="text-[9.5px] font-mono font-black text-[#D95D39] bg-orange-50 px-1 py-0.2 rounded border border-orange-200 shrink-0">
                        {order.folio}
                      </span>
                      <span className="text-[11.5px] font-bold text-slate-800 truncate" title={order.customerName}>
                        {order.customerName}
                      </span>
                      <span className="text-[9.5px] text-slate-400 font-semibold shrink-0 hidden xs:inline">
                        • {totalPieces}pz
                      </span>
                    </div>

                    {/* Amount & Status */}
                    <div className="flex items-center space-x-1.5 shrink-0">
                      <span className="text-[11.5px] font-black text-slate-900 font-mono">
                        ${order.total.toFixed(2)}
                      </span>

                      {/* Payment Chip */}
                      <span className={`text-[8.5px] font-bold px-1.5 py-0.2 rounded shrink-0 ${
                        isPaid ? 'bg-emerald-100 text-emerald-800' : hasDeposit ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {isPaid ? 'PAGADO' : hasDeposit ? `ANT $${order.deposit}` : 'PEND'}
                      </span>

                      {/* WhatsApp Share Button */}
                      <button
                        type="button"
                        onClick={() => handleShareTicketWhatsApp(order)}
                        title="Enviar confirmación por WhatsApp"
                        className="p-1 hover:bg-emerald-100 text-emerald-600 rounded transition-colors"
                      >
                        <Share2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
