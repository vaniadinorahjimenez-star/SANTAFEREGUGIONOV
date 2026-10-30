import React from 'react';
import { 
  OrderItem, 
  BreadProduct, 
  DriverCustomer 
} from '../../types';
import { 
  Plus, 
  Search, 
  Calendar, 
  Clock, 
  User, 
  CheckCircle2, 
  Truck, 
  Store, 
  ShoppingBag, 
  X, 
  Tag, 
  Boxes, 
  ChefHat, 
  FileText 
} from 'lucide-react';
import { playBeep } from '../../utils/audio';

export interface NewOrderModalProps {
  showNewOrderModal: boolean;
  setShowNewOrderModal: (show: boolean) => void;
  orderChannel: 'venta_tienda' | 'reparto' | 'recoger_tienda';
  setOrderChannel: (channel: 'venta_tienda' | 'reparto' | 'recoger_tienda') => void;
  customerName: string;
  setCustomerName: (name: string) => void;
  customerPhone: string;
  setCustomerPhone: (phone: string) => void;
  deliveryDate: string;
  setDeliveryDate: (date: string) => void;
  deliveryTime: string;
  setDeliveryTime: (time: string) => void;
  address: string;
  setAddress: (addr: string) => void;
  notes: string;
  setNotes: (notes: string) => void;
  deposit: string;
  setDeposit: (dep: string) => void;
  deliveryType: 'tienda' | 'domicilio';
  setDeliveryType: (type: 'tienda' | 'domicilio') => void;
  assignedDriverId: string;
  setAssignedDriverId: (driver: string) => void;
  storePaymentMethod: 'efectivo' | 'tarjeta' | 'transferencia';
  setStorePaymentMethod: (m: 'efectivo' | 'tarjeta' | 'transferencia') => void;
  pickupPaymentOption: 'por_cobrar' | 'pagado';
  setPickupPaymentOption: (p: 'por_cobrar' | 'pagado') => void;
  selectedAlphabetLetter: string | null;
  setSelectedAlphabetLetter: (l: string | null) => void;
  clientFilterRoute: 'todos' | 'osvaldo' | 'simon' | 'especiales';
  setClientFilterRoute: (r: 'todos' | 'osvaldo' | 'simon' | 'especiales') => void;
  clientSearchQuery: string;
  setClientSearchQuery: (q: string) => void;
  catalogSearch: string;
  setCatalogSearch: (q: string) => void;
  openCatalogGroup: 'salado' | 'dulce_danes' | 'feite_batidos_especiales' | null;
  setOpenCatalogGroup: (g: 'salado' | 'dulce_danes' | 'feite_batidos_especiales' | null) => void;
  orderItems: OrderItem[];
  itemConfigs: Record<string, { quantity: number; unit: 'PZ' | 'CH' | 'KG'; itemType: 'Normal' | 'Mini'; customPrice?: number }>;
  updateItemConfig: (breadId: string, updates: Partial<{ quantity: number; unit: 'PZ' | 'CH' | 'KG'; itemType: 'Normal' | 'Mini'; customPrice?: number }>) => void;
  getItemConfig: (bread: BreadProduct) => { quantity: number; unit: 'PZ' | 'CH' | 'KG'; itemType: 'Normal' | 'Mini'; customPrice?: number };
  handleAddCatalogItemToOrder: (bread: BreadProduct) => void;
  handleRemoveOrderItem: (idx: number) => void;
  handleUpdateOrderItemQty: (idx: number, qty: number) => void;
  handleCreateOrder: (e: React.FormEvent) => void;
  handleSelectDriverCustomer: (cust: DriverCustomer) => void;
  activeDriverCustomers: DriverCustomer[];
  activeCustomerPricingInfo: { matchedProfileName: string; isCustomRate: boolean };
  alphabetFilteredProducts: BreadProduct[];
  totalOrderAmount: number;
  totalPiecesCount: number;
  effectiveDeposit: number;
  effectivePending: number;
  isMonthlyCredit: boolean;
}

export const NewOrderModal: React.FC<NewOrderModalProps> = ({
  showNewOrderModal,
  setShowNewOrderModal,
  orderChannel,
  setOrderChannel,
  customerName,
  setCustomerName,
  deliveryDate,
  setDeliveryDate,
  deliveryTime,
  setDeliveryTime,
  address,
  setAddress,
  notes,
  setNotes,
  setDeposit,
  setDeliveryType,
  assignedDriverId,
  setAssignedDriverId,
  storePaymentMethod,
  setStorePaymentMethod,
  pickupPaymentOption,
  setPickupPaymentOption,
  selectedAlphabetLetter,
  setSelectedAlphabetLetter,
  clientFilterRoute,
  setClientFilterRoute,
  clientSearchQuery,
  setClientSearchQuery,
  catalogSearch,
  setCatalogSearch,
  openCatalogGroup,
  setOpenCatalogGroup,
  orderItems,
  updateItemConfig,
  getItemConfig,
  handleAddCatalogItemToOrder,
  handleRemoveOrderItem,
  handleUpdateOrderItemQty,
  handleCreateOrder,
  handleSelectDriverCustomer,
  activeDriverCustomers,
  activeCustomerPricingInfo,
  alphabetFilteredProducts,
  totalOrderAmount,
  totalPiecesCount,
  effectiveDeposit,
  isMonthlyCredit,
}) => {
  if (!showNewOrderModal) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-6xl xl:max-w-7xl w-full max-h-[95vh] flex flex-col overflow-hidden border border-[#E5E1DA] animate-in fade-in zoom-in-95 my-auto">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-slate-900 via-[#2D3142] to-slate-900 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0 border-b border-white/10">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center">
              <Plus className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="font-black text-base sm:text-lg">
                Levantar Nuevo Pedido
              </h2>
              <p className="text-[11px] text-slate-300 font-medium">
                {orderChannel === 'reparto' && 'Paso 1: Asignar Cliente ➔ Paso 2: Chofer ➔ Paso 3: Buscar Panes por Abecedario A-Z'}
                {orderChannel === 'recoger_tienda' && 'Pedido Pide y Recoge en Mostrador con Catálogo Rápido'}
                {orderChannel === 'venta_tienda' && 'Venta Mostrador en Tienda con Cobro Inmediato'}
              </p>
            </div>
          </div>

          {/* Close Button */}
          <button
            type="button"
            onClick={() => setShowNewOrderModal(false)}
            className="text-slate-300 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition-colors cursor-pointer ml-auto"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3 Channels Switcher in Modal */}
        <div className="grid grid-cols-3 bg-slate-100 p-2 border-b border-slate-200 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setOrderChannel('venta_tienda');
              setDeliveryType('tienda');
              if (!customerName || customerName.includes('Ruta') || customerName === '') {
                setCustomerName('Venta en Tienda (Mostrador)');
              }
              setAssignedDriverId('ninguno');
            }}
            className={`py-2.5 px-3 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center space-x-2 transition-all cursor-pointer ${
              orderChannel === 'venta_tienda'
                ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-400'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <Store className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="truncate">1. Venta en Tienda</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setOrderChannel('reparto');
              setDeliveryType('domicilio');
              if (customerName === 'Venta en Tienda (Mostrador)') setCustomerName('');
              setAssignedDriverId('osvaldo');
            }}
            className={`py-2.5 px-3 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center space-x-2 transition-all cursor-pointer ${
              orderChannel === 'reparto'
                ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-400'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <Truck className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="truncate">2. Reparto (Rutas)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setOrderChannel('recoger_tienda');
              setDeliveryType('tienda');
              if (customerName === 'Venta en Tienda (Mostrador)') setCustomerName('');
              setAssignedDriverId('ninguno');
            }}
            className={`py-2.5 px-3 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center space-x-2 transition-all cursor-pointer ${
              orderChannel === 'recoger_tienda'
                ? 'bg-amber-600 text-white shadow-md ring-2 ring-amber-400'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="truncate">3. Pide y Recoge</span>
          </button>
        </div>

        {/* Modal Body: 2 Columns Side-by-Side on Desktop */}
        <form onSubmit={handleCreateOrder} className="flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            
            {/* ========================================================================= */}
            {/* COLUMNA IZQUIERDA (7 cols): CLIENTE -> CHOFER -> ABECEDARIO & PANES      */}
            {/* ========================================================================= */}
            <div className="lg:col-span-7 space-y-4">

              {/* CASO A: FLUJO DE REPARTO (CLIENTE PRIMERO -> CHOFER -> A-Z) */}
              {orderChannel === 'reparto' && (
                <div className="space-y-4">
                  {/* PASO 1: ASIGNACIÓN POR CLIENTE */}
                  <div className="bg-blue-50/70 border-2 border-blue-200 p-4 rounded-3xl space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-blue-950 font-black text-sm">
                        <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">1</span>
                        <span>Asignar Cliente de la Ruta:</span>
                      </div>
                      {customerName && (
                        <span className="bg-blue-600 text-white text-xs font-black px-3 py-1 rounded-full flex items-center gap-1 shadow-2xs">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Cliente: {customerName}
                        </span>
                      )}
                    </div>

                    {/* Route Filter Tabs for Customers */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setClientFilterRoute('todos')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                          clientFilterRoute === 'todos'
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'bg-white text-slate-700 hover:bg-blue-100 border border-blue-200'
                        }`}
                      >
                        Todos ({activeDriverCustomers.filter(c => c.driverId === 'osvaldo' || c.driverId === 'simon').length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setClientFilterRoute('osvaldo')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1 ${
                          clientFilterRoute === 'osvaldo'
                            ? 'bg-blue-700 text-white shadow-xs'
                            : 'bg-blue-100/80 text-blue-900 hover:bg-blue-200 border border-blue-300'
                        }`}
                      >
                        <span>🛵 Ruta 1: Osvaldo</span>
                        <span className="text-[10px] opacity-80 font-mono">
                          ({activeDriverCustomers.filter(c => c.driverId === 'osvaldo').length})
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setClientFilterRoute('simon')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1 ${
                          clientFilterRoute === 'simon'
                            ? 'bg-emerald-700 text-white shadow-xs'
                            : 'bg-emerald-100/80 text-emerald-950 hover:bg-emerald-200 border border-emerald-300'
                        }`}
                      >
                        <span>🛵 Ruta 2: Simón</span>
                        <span className="text-[10px] opacity-80 font-mono">
                          ({activeDriverCustomers.filter(c => c.driverId === 'simon').length})
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setClientFilterRoute('especiales')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1 ${
                          clientFilterRoute === 'especiales'
                            ? 'bg-amber-600 text-white shadow-xs'
                            : 'bg-amber-100/80 text-amber-950 hover:bg-amber-200 border border-amber-300'
                        }`}
                      >
                        <span>⭐ Especiales</span>
                      </button>
                    </div>

                    {/* Customer Search Box */}
                    <div className="relative">
                      <Search className="w-4 h-4 text-blue-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Buscar cliente por nombre (ej. Cremería, Esperanza, Paola, San José)..."
                        value={clientSearchQuery}
                        onChange={(e) => setClientSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-white rounded-xl text-xs font-bold border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                      />
                    </div>

                    {/* Customer Cards Grid - Big, Touch Friendly */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1 bg-white/80 rounded-2xl border border-blue-200">
                      {activeDriverCustomers
                        .filter(c => {
                          if (clientFilterRoute === 'osvaldo' && c.driverId !== 'osvaldo') return false;
                          if (clientFilterRoute === 'simon' && c.driverId !== 'simon') return false;
                          if (clientFilterRoute === 'especiales' && !c.isSpecialPrice) return false;
                          if (clientSearchQuery.trim()) {
                            return c.name.toLowerCase().includes(clientSearchQuery.toLowerCase().trim());
                          }
                          return true;
                        })
                        .map(cust => {
                          const isSelected = customerName === cust.name;
                          return (
                            <button
                              key={cust.id}
                              type="button"
                              onClick={() => handleSelectDriverCustomer(cust)}
                              className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer flex flex-col justify-between gap-1 shadow-2xs ${
                                isSelected
                                  ? 'bg-blue-600 text-white border-blue-700 ring-2 ring-blue-300 shadow-md scale-102'
                                  : 'bg-white hover:bg-blue-50 text-slate-900 border-slate-200 hover:border-blue-300'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-1">
                                <strong className="text-xs font-black line-clamp-1 block">
                                  {cust.name}
                                </strong>
                                {isSelected && (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                                )}
                              </div>
                              <div className="flex items-center justify-between text-[10px] gap-1">
                                <span className={`font-bold ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>
                                  {cust.driverId === 'osvaldo' ? '🛵 Osvaldo' : cust.driverId === 'simon' ? '🛵 Simón' : 'Tienda'}
                                </span>
                                {cust.defaultPayment === 'credito' && (
                                  <span className={`px-1 rounded text-[9px] font-black ${
                                    isSelected ? 'bg-blue-800 text-white' : 'bg-purple-100 text-purple-900'
                                  }`}>
                                    Fin de Mes
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                    </div>

                    {/* Manual Customer Name Input fallback */}
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-xs font-bold text-slate-600 shrink-0">O escribir cliente:</span>
                      <input
                        type="text"
                        required
                        placeholder="Nombre del cliente..."
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="flex-1 px-3 py-1.5 bg-white border border-blue-300 rounded-xl text-xs font-bold text-slate-800"
                      />
                    </div>
                  </div>

                  {/* PASO 2: ASIGNACIÓN DEL REPARTIDOR RELACIONADO */}
                  <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">2</span>
                        <span>Repartidor Asignado a la Entrega:</span>
                      </label>
                      <span className="text-[11px] text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                        {assignedDriverId === 'osvaldo' ? 'Ruta 1 (Osvaldo Morales)' : 'Ruta 2 (Simón Gómez)'}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setAssignedDriverId('osvaldo')}
                        className={`py-2.5 px-3 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center space-x-2 border transition-all cursor-pointer ${
                          assignedDriverId === 'osvaldo'
                            ? 'bg-blue-600 text-white border-blue-700 ring-2 ring-blue-300 shadow-sm'
                            : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-200'
                        }`}
                      >
                        <User className="w-4 h-4" />
                        <span>🏍️ Osvaldo Morales (Ruta 1)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAssignedDriverId('simon')}
                        className={`py-2.5 px-3 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center space-x-2 border transition-all cursor-pointer ${
                          assignedDriverId === 'simon'
                            ? 'bg-emerald-600 text-white border-emerald-700 ring-2 ring-emerald-300 shadow-sm'
                            : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-200'
                        }`}
                      >
                        <User className="w-4 h-4" />
                        <span>🏍️ Simón Gómez (Ruta 2)</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* CASO B: CANAL PIDE Y RECOGE */}
              {orderChannel === 'recoger_tienda' && (
                <div className="bg-amber-50/70 border-2 border-amber-200 p-4 rounded-3xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-amber-950 font-black text-sm">
                      <ShoppingBag className="w-5 h-5 text-amber-600" />
                      <span>Pide y Recoge en Tienda</span>
                    </div>
                    <span className="bg-amber-600 text-white text-xs font-black px-2.5 py-0.5 rounded-full">
                      ENTREGA MOSTRADOR
                    </span>
                  </div>

                  {/* Quick Pickup Customers */}
                  <div>
                    <span className="text-xs font-bold text-amber-900 block mb-1">
                      Clientes Frecuentes Pide y Recoge:
                    </span>
                    <div className="flex flex-wrap gap-1.5 p-1.5 bg-white rounded-xl border border-amber-200">
                      {activeDriverCustomers
                        .filter(c => {
                          const allowed = ['trascos', 'magda', 'bollos david', 'deliz'];
                          return allowed.includes(c.name.trim().toLowerCase());
                        })
                        .map(cust => (
                          <button
                            key={cust.id}
                            type="button"
                            onClick={() => handleSelectDriverCustomer(cust)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                              customerName.trim().toLowerCase() === cust.name.trim().toLowerCase()
                                ? 'bg-amber-600 text-white border-amber-700 ring-2 ring-amber-300'
                                : 'bg-amber-50 hover:bg-amber-100 text-amber-950 border-amber-200'
                            }`}
                          >
                            <span>🛍️ {cust.name}</span>
                          </button>
                        ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-bold text-amber-950 mb-1">Nombre del Cliente *</label>
                      <input
                        type="text"
                        required
                        placeholder="Ej. Trascos, Magda, Juan..."
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full px-3 py-2 bg-white rounded-xl text-xs font-bold border border-amber-300 text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-amber-950 mb-1">Estado de Pago</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => { setPickupPaymentOption('por_cobrar'); setDeposit('0'); }}
                          className={`py-1.5 px-2 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                            pickupPaymentOption === 'por_cobrar'
                              ? 'bg-amber-600 text-white border-amber-600'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          ⏳ Por Cobrar
                        </button>
                        <button
                          type="button"
                          onClick={() => { setPickupPaymentOption('pagado'); }}
                          className={`py-1.5 px-2 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                            pickupPaymentOption === 'pagado'
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          ✅ Pagado
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CASO C: VENTA EN TIENDA */}
              {orderChannel === 'venta_tienda' && (
                <div className="bg-emerald-50 border-2 border-emerald-200 p-4 rounded-3xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-950 font-black text-sm">
                      <Store className="w-5 h-5 text-emerald-600" />
                      <span>Venta Directa en Tienda / Mostrador</span>
                    </div>
                    <span className="bg-emerald-600 text-white text-xs font-black px-2.5 py-0.5 rounded-full">
                      PAGO INMEDIATO
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-emerald-950 mb-1">Método de Cobro:</label>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setStorePaymentMethod('efectivo')}
                          className={`py-1.5 text-xs font-black rounded-xl border cursor-pointer ${
                            storePaymentMethod === 'efectivo' ? 'bg-emerald-700 text-white' : 'bg-white text-slate-700 border-emerald-200'
                          }`}
                        >
                          💵 Efectivo
                        </button>
                        <button
                          type="button"
                          onClick={() => setStorePaymentMethod('tarjeta')}
                          className={`py-1.5 text-xs font-black rounded-xl border cursor-pointer ${
                            storePaymentMethod === 'tarjeta' ? 'bg-emerald-700 text-white' : 'bg-white text-slate-700 border-emerald-200'
                          }`}
                        >
                          💳 Tarjeta
                        </button>
                        <button
                          type="button"
                          onClick={() => setStorePaymentMethod('transferencia')}
                          className={`py-1.5 text-xs font-black rounded-xl border cursor-pointer ${
                            storePaymentMethod === 'transferencia' ? 'bg-emerald-700 text-white' : 'bg-white text-slate-700 border-emerald-200'
                          }`}
                        >
                          📱 Transf.
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-emerald-950 mb-1">Identificador Mostrador:</label>
                      <input
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Ej. Venta Mostrador..."
                        className="w-full px-3 py-1.5 bg-white border border-emerald-300 rounded-xl text-xs font-bold text-slate-800"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ========================================================================= */}
              {/* SELECCIÓN DE PANES CON ABECEDARIO FÁCIL (A-Z) Y PRECIOS DEL CLIENTE       */}
              {/* ========================================================================= */}
              <div className="bg-white p-4 sm:p-5 rounded-3xl border-2 border-amber-300 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[#D95D39] text-white flex items-center justify-center text-xs font-black">
                        {orderChannel === 'reparto' ? '3' : '2'}
                      </span>
                      <h3 className="font-black text-slate-900 text-sm sm:text-base">
                        Buscar Panes con Abecedario (A-Z)
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Toca una letra para ver sus panes. Precio automático según cliente: <strong className="text-slate-900">{activeCustomerPricingInfo.matchedProfileName}</strong>.
                    </p>
                  </div>

                  {activeCustomerPricingInfo.isCustomRate && (
                    <span className="px-2.5 py-1 bg-amber-500 text-slate-950 rounded-full font-black text-xs flex items-center gap-1 shadow-2xs">
                      <Tag className="w-3.5 h-3.5" /> Tarifa {activeCustomerPricingInfo.matchedProfileName} Activa
                    </span>
                  )}
                </div>

                {/* BARRA INTERACTIVA DE ABECEDARIO A-Z */}
                <div className="bg-[#FAF8F6] p-2 rounded-2xl border border-[#E5E1DA] space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-black text-slate-700 px-1">
                    <span>Abecedario Rápido (A-Z):</span>
                    {selectedAlphabetLetter && selectedAlphabetLetter !== 'TODOS' && (
                      <span className="text-[#D95D39] font-black">
                        Filtrando por letra "{selectedAlphabetLetter}" ({alphabetFilteredProducts.length} panes)
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1 justify-center sm:justify-start">
                    {['TODOS', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'].map((letter) => {
                      const isSelected = selectedAlphabetLetter === letter || (letter === 'TODOS' && !selectedAlphabetLetter);
                      return (
                        <button
                          key={letter}
                          type="button"
                          onClick={() => {
                            setSelectedAlphabetLetter(letter === 'TODOS' ? null : letter);
                            playBeep(750, 'sine', 0.03);
                          }}
                          className={`w-8 h-8 rounded-xl font-black text-xs transition-all cursor-pointer flex items-center justify-center ${
                            isSelected
                              ? 'bg-[#D95D39] text-white shadow-md scale-110 ring-2 ring-amber-300 z-10'
                              : 'bg-white hover:bg-amber-100 text-slate-800 border border-slate-200'
                          }`}
                        >
                          {letter === 'TODOS' ? '★' : letter}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Search by Text & Category Filters */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1">
                  <div className="sm:col-span-6 relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="O escribe nombre (ej. TE para Telera, BO para Bolillo)..."
                      value={catalogSearch}
                      onChange={(e) => setCatalogSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-[#FAF8F6] rounded-xl text-xs font-bold border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-800"
                    />
                  </div>

                  {/* 3 Main Catalog Quick Category Tabs */}
                  <div className="sm:col-span-6 flex gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setOpenCatalogGroup('salado');
                        setSelectedAlphabetLetter(null);
                      }}
                      className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-black border transition-all cursor-pointer truncate ${
                        openCatalogGroup === 'salado' && !selectedAlphabetLetter
                          ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      🥖 Salados
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenCatalogGroup('dulce_danes');
                        setSelectedAlphabetLetter(null);
                      }}
                      className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-black border transition-all cursor-pointer truncate ${
                        openCatalogGroup === 'dulce_danes' && !selectedAlphabetLetter
                          ? 'bg-orange-600 text-white border-orange-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      🍩 Dulce
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenCatalogGroup('feite_batidos_especiales');
                        setSelectedAlphabetLetter(null);
                      }}
                      className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-black border transition-all cursor-pointer truncate ${
                        openCatalogGroup === 'feite_batidos_especiales' && !selectedAlphabetLetter
                          ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      🥐 Feité
                    </button>
                  </div>
                </div>

                {/* PRODUCTS TABLE / CARDS WITH EASY TOUCH CONTROLS */}
                <div className="max-h-72 overflow-y-auto space-y-2 pr-1 divide-y divide-slate-100">
                  {alphabetFilteredProducts.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 space-y-1">
                      <ChefHat className="w-8 h-8 mx-auto text-slate-300" />
                      <p className="text-xs font-bold">No se encontraron panes con ese filtro</p>
                    </div>
                  ) : (
                    alphabetFilteredProducts.map((prod) => {
                      const config = getItemConfig(prod);
                      const isAdded = orderItems.some(it => it.breadId === prod.id);

                      return (
                        <div
                          key={prod.id}
                          className="pt-2 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white hover:bg-amber-50/40 p-2.5 rounded-2xl transition-all border border-transparent hover:border-amber-200"
                        >
                          {/* Bread Info & Price */}
                          <div className="space-y-0.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <strong className="text-sm font-black text-slate-900 truncate">
                                {prod.name}
                              </strong>
                              {isAdded && (
                                <span className="bg-emerald-100 text-emerald-800 text-[9px] px-2 py-0.5 rounded-full font-black shrink-0">
                                  En pedido ✓
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-slate-500 text-[11px]">{prod.category}</span>
                              <span className="font-extrabold text-slate-900 bg-amber-100/80 px-2 py-0.5 rounded-md font-mono text-xs text-amber-950">
                                ${config.customPrice || prod.defaultPrice}.00 c/u
                              </span>
                            </div>
                          </div>

                          {/* Quantity, Unit, Mini and Add Button */}
                          <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto shrink-0">
                            
                            {/* Stepper [-] [10] [+] */}
                            <div className="inline-flex items-center bg-slate-100 rounded-xl p-0.5 border border-slate-200">
                              <button
                                type="button"
                                onClick={() => updateItemConfig(prod.id, { quantity: Math.max(1, config.quantity - 1) })}
                                className="w-7 h-7 rounded-lg bg-white hover:bg-slate-200 text-slate-800 font-black text-sm flex items-center justify-center cursor-pointer shadow-2xs"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min="1"
                                value={config.quantity}
                                onChange={(e) => updateItemConfig(prod.id, { quantity: parseInt(e.target.value) || 1 })}
                                className="w-12 py-1 bg-transparent font-black text-xs text-center text-slate-900 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => updateItemConfig(prod.id, { quantity: config.quantity + 1 })}
                                className="w-7 h-7 rounded-lg bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-sm flex items-center justify-center cursor-pointer shadow-2xs"
                              >
                                +
                              </button>
                            </div>

                            {/* Unit Selector (PZ, CH, KG) */}
                            <div className="inline-flex rounded-xl bg-slate-100 p-0.5 border border-slate-200">
                              {(['PZ', 'CH', 'KG'] as const).map((u) => (
                                <button
                                  key={u}
                                  type="button"
                                  onClick={() => updateItemConfig(prod.id, { unit: u })}
                                  className={`px-2 py-1 rounded-lg text-[10.5px] font-black cursor-pointer transition-colors ${
                                    config.unit === u
                                      ? 'bg-amber-600 text-white shadow-xs'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  {u}
                                </button>
                              ))}
                            </div>

                            {/* Mini Toggle */}
                            <button
                              type="button"
                              onClick={() => updateItemConfig(prod.id, { itemType: config.itemType === 'Mini' ? 'Normal' : 'Mini' })}
                              className={`px-2 py-1 rounded-xl text-[10.5px] font-black border transition-all cursor-pointer ${
                                config.itemType === 'Mini'
                                  ? 'bg-purple-700 text-white border-purple-700 shadow-xs'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              {config.itemType === 'Mini' ? 'Mini' : 'Normal'}
                            </button>

                            {/* ADD BUTTON */}
                            <button
                              type="button"
                              onClick={() => handleAddCatalogItemToOrder(prod)}
                              className="px-3.5 py-1.5 bg-gradient-to-r from-[#D95D39] to-amber-600 hover:from-[#BF4C2A] hover:to-amber-700 text-white font-black text-xs rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1"
                            >
                              <Plus className="w-4 h-4" />
                              <span>Agregar</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* COLUMNA DERECHA (5 cols): RESUMEN EN VIVO, FECHA/HORA & BOTÓN GUARDAR    */}
            {/* ========================================================================= */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-[#FAF8F6] p-4 sm:p-5 rounded-3xl border-2 border-slate-200 space-y-4">
                
                {/* Header Resumen */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-[#D95D39]" />
                    <h3 className="font-black text-slate-900 text-sm sm:text-base">
                      Resumen del Pedido
                    </h3>
                  </div>
                  <span className="bg-slate-900 text-white font-black text-xs px-2.5 py-0.5 rounded-full">
                    {orderItems.length} partidas
                  </span>
                </div>

                {/* Customer & Route info card */}
                <div className="bg-white p-3 rounded-2xl border border-slate-200 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-bold">Cliente:</span>
                    <strong className="text-slate-900 font-black text-sm">{customerName || 'Sin asignar'}</strong>
                  </div>
                  {orderChannel === 'reparto' && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 font-bold">Chofer de Ruta:</span>
                      <span className="font-black text-blue-700">
                        {assignedDriverId === 'osvaldo' ? '🛵 Osvaldo Morales' : '🛵 Simón Gómez'}
                      </span>
                    </div>
                  )}
                  {orderChannel === 'reparto' && (
                    <div className="pt-1">
                      <label className="block text-[10.5px] font-bold text-slate-600 mb-0.5">Dirección / Referencias:</label>
                      <input
                        type="text"
                        placeholder="Calle, número, referencias..."
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="w-full px-2.5 py-1 bg-[#FAF8F6] rounded-lg text-xs font-medium border border-slate-300"
                      />
                    </div>
                  )}
                </div>

                {/* Delivery Date and Time Pickers */}
                <div className="grid grid-cols-2 gap-2 bg-white p-3 rounded-2xl border border-slate-200">
                  <div>
                    <label className="block text-[11px] font-black text-slate-700 mb-1 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-[#D95D39]" />
                      <span>Fecha Entrega:</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                      className="w-full px-2 py-1.5 bg-[#FAF8F6] rounded-xl text-xs font-bold border border-slate-300 text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-slate-700 mb-1 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-[#D95D39]" />
                      <span>Hora Entrega:</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="07:30 AM"
                      value={deliveryTime}
                      onChange={(e) => setDeliveryTime(e.target.value)}
                      className="w-full px-2 py-1.5 bg-[#FAF8F6] rounded-xl text-xs font-bold border border-slate-300 text-slate-800"
                    />
                  </div>
                </div>

                {/* Quick Time Preset Buttons */}
                <div className="flex flex-wrap gap-1 text-[11px]">
                  {['07:00', '07:30', '08:00', '12:00', '16:00'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setDeliveryTime(t)}
                      className={`px-2 py-0.5 rounded-lg font-bold border transition-colors cursor-pointer ${
                        deliveryTime === t ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                {/* Order Items Table in Live Summary */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-black text-slate-800">
                    <span>Panes Seleccionados:</span>
                    <span className="text-[#D95D39] font-bold">Total: {totalPiecesCount} piezas</span>
                  </div>

                  {orderItems.length === 0 ? (
                    <div className="bg-white p-6 rounded-2xl border border-dashed border-slate-300 text-center space-y-1 text-slate-400">
                      <Boxes className="w-6 h-6 mx-auto text-slate-300" />
                      <p className="text-xs font-bold">Aún no agregas panes al pedido</p>
                      <p className="text-[10px]">Toca una letra del abecedario y presiona "+ Agregar"</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                      {orderItems.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-slate-200 text-xs shadow-2xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <button
                              type="button"
                              onClick={() => handleRemoveOrderItem(idx)}
                              className="text-rose-500 hover:text-rose-700 p-0.5 cursor-pointer shrink-0"
                              title="Eliminar"
                            >
                              <X className="w-4 h-4" />
                            </button>
                            <div className="truncate">
                              <div className="font-black text-slate-900 flex items-center gap-1">
                                <span className="truncate">{item.name}</span>
                                {item.itemType === 'Mini' && (
                                  <span className="bg-purple-100 text-purple-900 text-[8.5px] font-black px-1 rounded">Mini</span>
                                )}
                                <span className="bg-slate-100 text-slate-700 text-[8.5px] font-bold px-1 rounded">{item.unit || 'PZ'}</span>
                              </div>
                              <span className="text-slate-400 text-[10px]">(${item.unitPrice}.00 c/u)</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                              <button
                                type="button"
                                onClick={() => handleUpdateOrderItemQty(idx, item.quantity - 1)}
                                className="w-5 h-5 bg-white rounded font-bold text-xs flex items-center justify-center cursor-pointer"
                              >
                                -
                              </button>
                              <span className="font-black w-6 text-center text-xs">{item.quantity}</span>
                              <button
                                type="button"
                                onClick={() => handleUpdateOrderItemQty(idx, item.quantity + 1)}
                                className="w-5 h-5 bg-amber-300 rounded font-bold text-xs flex items-center justify-center cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                            <span className="font-black text-slate-900 w-14 text-right text-xs">
                              ${item.total}.00
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Financial Breakdown */}
                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-base">
                    <span className="font-bold text-slate-700">Total a Pagar:</span>
                    <strong className="text-xl font-black text-slate-900 font-mono">${totalOrderAmount}.00</strong>
                  </div>

                  {orderChannel === 'reparto' ? (
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                      <span className="text-slate-500 font-bold">Cobro de Ruta:</span>
                      <span className="bg-blue-100 text-blue-900 px-2 py-0.5 rounded-lg font-black">
                        {isMonthlyCredit ? 'Crédito Fin de Mes' : 'Por Cobrar en Ruta'}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                      <span className="text-slate-500 font-bold">Anticipo:</span>
                      <input
                        type="number"
                        min="0"
                        max={totalOrderAmount}
                        value={effectiveDeposit}
                        disabled={orderChannel === 'venta_tienda' || (orderChannel === 'recoger_tienda' && pickupPaymentOption === 'pagado')}
                        onChange={(e) => setDeposit(e.target.value)}
                        className="w-24 px-2 py-0.5 bg-[#FAF8F6] rounded border border-slate-300 font-bold text-emerald-700 text-right"
                      />
                    </div>
                  )}
                </div>

                {/* Notes for Bakers */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Notas para Panaderos (Horno):
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Bien dorado, charolas de 20pz, etc..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white rounded-xl text-xs border border-slate-300 text-slate-800"
                  />
                </div>

                {/* ACTION SUBMIT BUTTONS */}
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowNewOrderModal(false)}
                    className="flex-1 py-3 rounded-2xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    id="submit-order-btn"
                    type="submit"
                    disabled={orderItems.length === 0 || !customerName.trim()}
                    className="flex-2 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-700 to-emerald-800 hover:from-emerald-700 hover:to-emerald-900 disabled:opacity-50 text-white font-black text-sm shadow-lg transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    <span>✅ Guardar Pedido</span>
                  </button>
                </div>
              </div>
            </div>

          </div>
        </form>
      </div>
    </div>
  );
};
