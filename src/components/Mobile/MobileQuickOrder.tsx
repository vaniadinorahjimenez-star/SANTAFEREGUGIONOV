import React, { useState, useMemo } from 'react';
import { 
  BakeryOrder, 
  OrderItem, 
  BreadProduct, 
  DriverCustomer, 
  Customer 
} from '../../types';
import { 
  Search, 
  Plus, 
  Minus, 
  RotateCcw, 
  Check, 
  Calendar, 
  Clock, 
  Truck, 
  Store, 
  ShoppingBag, 
  X, 
  Share2, 
  CheckCircle2, 
  Sparkles,
  ArrowLeft,
  ChevronDown,
  UserCheck
} from 'lucide-react';
import { getTodayString } from '../../utils/storage';
import { playBeep } from '../../utils/audio';

interface MobileQuickOrderProps {
  products: BreadProduct[];
  customers: Customer[];
  driverCustomers: DriverCustomer[];
  orders: BakeryOrder[];
  onSaveOrder: (order: BakeryOrder) => void;
  onClose: () => void;
}

export const MobileQuickOrder: React.FC<MobileQuickOrderProps> = ({
  products,
  customers,
  driverCustomers,
  orders,
  onSaveOrder,
  onClose
}) => {
  const todayStr = getTodayString();

  // Helper date shortcuts
  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }, []);

  const saturdayStr = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = (6 - day + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return d.toISOString().split('T')[0];
  }, []);

  const sundayStr = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = (7 - day) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return d.toISOString().split('T')[0];
  }, []);

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [clientSearch, setClientSearch] = useState<string>('');
  const [showClientPicker, setShowClientPicker] = useState<boolean>(false);

  const [orderChannel, setOrderChannel] = useState<'reparto' | 'recoger_tienda' | 'venta_tienda'>('reparto');
  const [assignedDriverId, setAssignedDriverId] = useState<'simon' | 'osvaldo' | 'ninguno'>('simon');
  const [deliveryDate, setDeliveryDate] = useState<string>(todayStr);
  const [deliveryTime, setDeliveryTime] = useState<string>('07:30');
  const [notes, setNotes] = useState<string>('');
  const [deposit, setDeposit] = useState<string>('0');

  // Items State in Order
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customPrices, setCustomPrices] = useState<Record<string, number>>({});
  const [catalogSearch, setCatalogSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('TODOS');
  const [savedOrderSuccess, setSavedOrderSuccess] = useState<BakeryOrder | null>(null);

  // Active matched client profile
  const matchedDriverCustomer = useMemo(() => {
    if (!selectedCustomerId) return null;
    return driverCustomers.find(c => c.id === selectedCustomerId) || null;
  }, [selectedCustomerId, driverCustomers]);

  // Load custom prices when client is selected
  const applyClientPricing = (driverCust: DriverCustomer | null) => {
    if (!driverCust) return;
    const overrides: Record<string, number> = {};
    if (driverCust.items && driverCust.items.length > 0) {
      driverCust.items.forEach(it => {
        const prod = products.find(p => p.name.trim().toLowerCase() === it.breadName.trim().toLowerCase());
        if (prod) {
          overrides[prod.id] = it.unitPrice;
        }
      });
    }
    if (driverCust.customPriceOverrides) {
      Object.entries(driverCust.customPriceOverrides).forEach(([nameOrId, pr]) => {
        const prod = products.find(p => p.id === nameOrId || p.name.trim().toLowerCase() === nameOrId.trim().toLowerCase());
        if (prod) {
          overrides[prod.id] = pr;
        }
      });
    }
    setCustomPrices(overrides);
  };

  const handleSelectClient = (cust: DriverCustomer) => {
    setSelectedCustomerId(cust.id);
    setCustomerName(cust.name);
    setCustomerPhone(cust.phone || '');
    if (cust.driverId === 'osvaldo' || cust.driverId === 'simon') {
      setAssignedDriverId(cust.driverId);
      setOrderChannel('reparto');
    } else {
      setAssignedDriverId('ninguno');
      setOrderChannel('recoger_tienda');
    }
    applyClientPricing(cust);
    setShowClientPicker(false);
  };

  // One-tap: "Repetir último pedido"
  const handleRepeatLastOrder = () => {
    if (!customerName.trim()) return;
    const targetName = customerName.trim().toLowerCase();
    const previousOrders = orders.filter(o => 
      o.customerName?.trim().toLowerCase() === targetName && o.items && o.items.length > 0
    );
    if (previousOrders.length === 0) {
      alert(`No se encontró un pedido anterior para "${customerName}". Agrega las piezas manualmente.`);
      return;
    }
    // Most recent order
    const lastOrder = previousOrders[previousOrders.length - 1];
    const newQty: Record<string, number> = {};
    lastOrder.items.forEach(it => {
      const prod = products.find(p => p.id === it.breadId || p.name.trim().toLowerCase() === it.name.trim().toLowerCase());
      if (prod) {
        newQty[prod.id] = it.quantity;
      }
    });
    setQuantities(newQty);
    playBeep(620, 'sine', 0.1);
  };

  // Adjust item quantities
  const updateQuantity = (productId: string, delta: number) => {
    setQuantities(prev => {
      const current = prev[productId] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return { ...prev, [productId]: next };
    });
    playBeep(delta > 0 ? 580 : 420, 'sine', 0.06);
  };

  const setDirectQuantity = (productId: string, val: string) => {
    if (val === '' || val === '0' || val === '00') {
      setQuantities(prev => {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      });
      return;
    }
    const num = parseInt(val, 10);
    if (!isNaN(num) && num >= 0) {
      setQuantities(prev => ({ ...prev, [productId]: num }));
    }
  };

  const clearQuantity = (productId: string) => {
    setQuantities(prev => {
      const copy = { ...prev };
      delete copy[productId];
      return copy;
    });
  };

  // Filtered products list
  const filteredProducts = useMemo(() => {
    let list = [...products];
    if (selectedCategory !== 'TODOS') {
      list = list.filter(p => p.category === selectedCategory);
    }
    if (catalogSearch.trim()) {
      const q = catalogSearch.trim().toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
    }
    // Sort items so those with quantities > 0 appear at top
    return list.sort((a, b) => {
      const qtyA = quantities[a.id] || 0;
      const qtyB = quantities[b.id] || 0;
      if (qtyA > 0 && qtyB === 0) return -1;
      if (qtyA === 0 && qtyB > 0) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [products, selectedCategory, catalogSearch, quantities]);

  // Calculations
  const calculatedItems: OrderItem[] = useMemo(() => {
    const items: OrderItem[] = [];
    Object.entries(quantities).forEach(([prodId, rawQty]) => {
      const qty = Number(rawQty);
      if (qty > 0) {
        const prod = products.find(p => p.id === prodId);
        if (prod) {
          const unitPrice = customPrices[prod.id] !== undefined ? customPrices[prod.id] : prod.price;
          items.push({
            breadId: prod.id,
            name: prod.name,
            category: prod.category,
            quantity: qty,
            unitPrice,
            total: qty * unitPrice,
            unit: 'PZ',
            itemType: 'Normal'
          });
        }
      }
    });
    return items;
  }, [quantities, products, customPrices]);

  const totalAmount = useMemo(() => {
    return calculatedItems.reduce((acc, it) => acc + it.total, 0);
  }, [calculatedItems]);

  const totalPieces = useMemo(() => {
    return calculatedItems.reduce((acc, it) => acc + it.quantity, 0);
  }, [calculatedItems]);

  const numericDeposit = parseFloat(deposit) || 0;
  const pendingAmount = Math.max(0, totalAmount - numericDeposit);

  // Submit Order
  const handleSave = () => {
    if (!customerName.trim()) {
      alert('Por favor escribe o selecciona el nombre del cliente');
      return;
    }
    if (calculatedItems.length === 0) {
      alert('Debes agregar al menos 1 producto al pedido');
      return;
    }

    const folioNum = Math.floor(1000 + Math.random() * 9000);
    const newFolio = `PED-${folioNum}`;
    const newOrder: BakeryOrder = {
      id: `order_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      folio: newFolio,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      deliveryType: orderChannel === 'reparto' ? 'reparto' : 'recoger_tienda',
      orderChannel,
      deliveryDate: deliveryDate || todayStr,
      deliveryTime: deliveryTime || '07:30',
      items: calculatedItems,
      total: totalAmount,
      deposit: numericDeposit,
      pendingAmount,
      paymentStatus: numericDeposit >= totalAmount ? 'pagado' : numericDeposit > 0 ? 'anticipo' : 'pendiente',
      assignedDriverId,
      deliveryStatus: 'pendiente',
      notes: notes.trim(),
      createdAt: new Date().toISOString()
    };

    onSaveOrder(newOrder);
    setSavedOrderSuccess(newOrder);
    playBeep(750, 'sine', 0.15);
  };

  // WhatsApp share
  const handleShareWhatsApp = (order: BakeryOrder) => {
    const phone = order.customerPhone?.replace(/\D/g, '') || '';
    let msg = `🥖 *PANADERÍA SANTA FÉ* 🥖\n`;
    msg += `*Confirmación de Pedido: ${order.folio}*\n\n`;
    msg += `👤 *Cliente:* ${order.customerName}\n`;
    msg += `📅 *Entrega:* ${order.deliveryDate} • ${order.deliveryTime}\n`;
    msg += `🚚 *Modalidad:* ${order.deliveryType === 'reparto' ? 'Reparto a Domicilio' : 'Recoger en Tienda'}\n`;
    msg += `─────────────────\n`;
    order.items.forEach(it => {
      msg += `• ${it.quantity}x ${it.name} - $${it.unitPrice.toFixed(2)} c/u ($${it.total.toFixed(2)})\n`;
    });
    msg += `─────────────────\n`;
    msg += `💰 *Total:* $${order.total.toFixed(2)}\n`;
    if (order.deposit > 0) {
      msg += `💵 *Anticipo:* $${order.deposit.toFixed(2)}\n`;
      msg += `💳 *Saldo Pendiente:* $${order.pendingAmount.toFixed(2)}\n`;
    }
    if (order.notes) {
      msg += `📝 *Notas:* ${order.notes}\n`;
    }
    msg += `\n¡Gracias por tu preferencia! El pan más fresco de Querétaro.`;

    const encoded = encodeURIComponent(msg);
    if (phone.length >= 10) {
      window.open(`https://wa.me/52${phone}?text=${encoded}`, '_blank');
    } else {
      window.open(`https://wa.me/?text=${encoded}`, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#FDFBF7] flex flex-col overflow-hidden text-slate-800">
      {/* Top Header */}
      <div className="bg-[#2D2A26] text-white px-3 py-2.5 flex items-center justify-between shadow-md">
        <div className="flex items-center space-x-2">
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-slate-300"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-base font-bold tracking-tight text-[#F8F4EE]">Nuevo Pedido Rápido</h2>
            <p className="text-[11px] text-amber-300 font-medium">Panadería Santa Fé • Móvil</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-1 hover:bg-white/10 rounded-full text-slate-400"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Success Modal Overlay */}
      {savedOrderSuccess && (
        <div className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full text-center shadow-2xl border border-amber-200 animate-in fade-in zoom-in-95">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">¡Pedido Guardado y Sincronizado!</h3>
            <p className="text-xs text-slate-500 mt-1">
              Folio <span className="font-bold text-[#D95D39]">{savedOrderSuccess.folio}</span> registrado en tiempo real en todas las computadoras y celulares.
            </p>
            <div className="bg-amber-50 rounded-xl p-3 my-3 text-left text-xs border border-amber-100">
              <p className="font-semibold text-slate-700">Cliente: {savedOrderSuccess.customerName}</p>
              <p className="text-slate-600">Total: ${savedOrderSuccess.total.toFixed(2)} ({savedOrderSuccess.items.reduce((a, b) => a + b.quantity, 0)} pzas)</p>
              <p className="text-slate-600">Entrega: {savedOrderSuccess.deliveryDate} ({savedOrderSuccess.deliveryTime})</p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleShareWhatsApp(savedOrderSuccess)}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 shadow"
              >
                <Share2 className="w-4 h-4" />
                <span>Enviar Confirmación por WhatsApp</span>
              </button>
              <button
                onClick={() => {
                  setSavedOrderSuccess(null);
                  onClose();
                }}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs"
              >
                Cerrar y volver al inicio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Form Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 pb-32">
        {/* Section 1: Cliente y Repetición rápida */}
        <div className="bg-white rounded-xl p-3 border border-[#E5E1DA] shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Cliente y Precios</span>
            {customerName && (
              <button
                onClick={handleRepeatLastOrder}
                type="button"
                className="text-[11px] font-bold text-[#D95D39] bg-orange-50 hover:bg-orange-100 px-2.5 py-1 rounded-lg border border-orange-200 flex items-center space-x-1 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Repetir último pedido</span>
              </button>
            )}
          </div>

          <div className="relative">
            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Escribe o busca un cliente..."
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    setSelectedCustomerId('');
                  }}
                  onFocus={() => setShowClientPicker(true)}
                  className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#D95D39]"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
              <button
                type="button"
                onClick={() => setShowClientPicker(!showClientPicker)}
                className="px-2.5 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 flex items-center space-x-1"
              >
                <span>Catálogo</span>
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>

            {/* Dropdown Client Picker */}
            {showClientPicker && (
              <div className="absolute top-11 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-56 overflow-y-auto p-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase px-2 py-1">Clientes de Reparto y Especiales</div>
                {driverCustomers
                  .filter(c => !clientSearch || c.name.toLowerCase().includes(clientSearch.toLowerCase()))
                  .slice(0, 15)
                  .map(cust => (
                    <button
                      key={cust.id}
                      type="button"
                      onClick={() => handleSelectClient(cust)}
                      className="w-full text-left px-2.5 py-2 hover:bg-amber-50 rounded-lg text-xs flex items-center justify-between border-b border-slate-50 last:border-0"
                    >
                      <div>
                        <span className="font-bold text-slate-800">{cust.name}</span>
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {cust.driverId === 'simon' ? 'Simón' : cust.driverId === 'osvaldo' ? 'Osvaldo' : 'Tienda'}
                        </span>
                      </div>
                      {cust.phone && <span className="text-[10px] text-slate-400">{cust.phone}</span>}
                    </button>
                  ))}
                <button
                  type="button"
                  onClick={() => setShowClientPicker(false)}
                  className="w-full text-center py-1.5 text-xs text-slate-500 font-semibold bg-slate-50 rounded-lg mt-1"
                >
                  Cerrar lista
                </button>
              </div>
            )}
          </div>

          {/* Teléfono opcional */}
          <div className="mt-2 flex items-center space-x-2">
            <input
              type="tel"
              placeholder="Teléfono para WhatsApp (ej. 4421234567)"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="flex-1 px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
            {matchedDriverCustomer && (
              <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-1 rounded-md border border-emerald-200 flex items-center space-x-1">
                <UserCheck className="w-3 h-3" />
                <span>Precios Especiales Activos</span>
              </span>
            )}
          </div>
        </div>

        {/* Section 2: Fecha y Entrega */}
        <div className="bg-white rounded-xl p-3 border border-[#E5E1DA] shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-2">Fecha y Destino</span>
          {/* Quick Date Chips */}
          <div className="flex items-center gap-1.5 mb-2 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setDeliveryDate(todayStr)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                deliveryDate === todayStr ? 'bg-[#D95D39] text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              Hoy ({todayStr.slice(5)})
            </button>
            <button
              type="button"
              onClick={() => setDeliveryDate(tomorrowStr)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                deliveryDate === tomorrowStr ? 'bg-[#D95D39] text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              Mañana ({tomorrowStr.slice(5)})
            </button>
            <button
              type="button"
              onClick={() => setDeliveryDate(saturdayStr)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                deliveryDate === saturdayStr ? 'bg-[#D95D39] text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              Sábado
            </button>
            <button
              type="button"
              onClick={() => setDeliveryDate(sundayStr)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                deliveryDate === sundayStr ? 'bg-[#D95D39] text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              Domingo
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-500 font-medium">Fecha exacta</label>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-medium">Hora de entrega</label>
              <input
                type="time"
                value={deliveryTime}
                onChange={(e) => setDeliveryTime(e.target.value)}
                className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          {/* Destino y Ruta */}
          <div className="grid grid-cols-3 gap-1.5 mt-2">
            <button
              type="button"
              onClick={() => {
                setOrderChannel('reparto');
                setAssignedDriverId('simon');
              }}
              className={`py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                assignedDriverId === 'simon' && orderChannel === 'reparto'
                  ? 'bg-amber-500 text-white border-amber-600'
                  : 'bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              Simón
            </button>
            <button
              type="button"
              onClick={() => {
                setOrderChannel('reparto');
                setAssignedDriverId('osvaldo');
              }}
              className={`py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                assignedDriverId === 'osvaldo' && orderChannel === 'reparto'
                  ? 'bg-sky-600 text-white border-sky-700'
                  : 'bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              Osvaldo
            </button>
            <button
              type="button"
              onClick={() => {
                setOrderChannel('recoger_tienda');
                setAssignedDriverId('ninguno');
              }}
              className={`py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                orderChannel === 'recoger_tienda'
                  ? 'bg-emerald-600 text-white border-emerald-700'
                  : 'bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              En Tienda
            </button>
          </div>
        </div>

        {/* Section 3: Productos con Filas Delgadas (36px) */}
        <div className="bg-white rounded-xl p-3 border border-[#E5E1DA] shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Piezas de Pan ({totalPieces} pzas)
            </span>
            <div className="flex items-center space-x-1">
              <span className="text-[11px] font-bold text-slate-700">Subtotal:</span>
              <span className="text-xs font-black text-[#D95D39]">${totalAmount.toFixed(2)}</span>
            </div>
          </div>

          {/* Mini Search & Category Filters */}
          <div className="flex items-center space-x-1.5 mb-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Filtrar pan..."
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                className="w-full pl-7 pr-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md"
              />
              <Search className="w-3 h-3 text-slate-400 absolute left-2 top-2" />
            </div>
            {['TODOS', 'Salado', 'Pan Dulce / Bizcocho', 'Feite y Batidos'].map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-2 py-1 text-[10px] font-semibold rounded-md whitespace-nowrap transition-colors ${
                  selectedCategory === cat ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {cat === 'Pan Dulce / Bizcocho' ? 'Dulce' : cat === 'Feite y Batidos' ? 'Feite' : cat}
              </button>
            ))}
          </div>

          {/* Listado con Filas Delgadas */}
          <div className="space-y-1 max-h-[380px] overflow-y-auto pr-0.5">
            {filteredProducts.map(prod => {
              const qty = quantities[prod.id] || 0;
              const hasQty = qty > 0;
              const finalPrice = customPrices[prod.id] !== undefined ? customPrices[prod.id] : prod.price;

              return (
                <div
                  key={prod.id}
                  className={`h-9 px-2 flex items-center justify-between rounded-lg border transition-colors ${
                    hasQty 
                      ? 'bg-amber-50/70 border-amber-300 shadow-xs' 
                      : 'bg-white border-slate-100 hover:border-slate-200'
                  }`}
                >
                  {/* Name and Price */}
                  <div className="flex items-center space-x-1.5 min-w-0 flex-1 mr-2">
                    <span className={`text-xs font-medium truncate ${hasQty ? 'font-bold text-slate-900' : 'text-slate-700'}`}>
                      {prod.name}
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold whitespace-nowrap">
                      ${finalPrice.toFixed(2)}
                    </span>
                  </div>

                  {/* Quantity Stepper (Thin & Ergonomic) */}
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => updateQuantity(prod.id, -1)}
                      className="w-7 h-7 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 rounded-md font-bold text-xs flex items-center justify-center transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>

                    <input
                      type="number"
                      min="0"
                      value={qty === 0 ? '' : qty}
                      placeholder="0"
                      onChange={(e) => setDirectQuantity(prod.id, e.target.value)}
                      onFocus={(e) => e.target.select()}
                      className={`w-11 h-7 text-center text-xs font-bold rounded-md border focus:outline-none ${
                        hasQty 
                          ? 'bg-white border-amber-400 text-slate-900 font-black' 
                          : 'bg-slate-50 border-slate-200 text-slate-400'
                      }`}
                    />

                    <button
                      type="button"
                      onClick={() => updateQuantity(prod.id, 1)}
                      className="w-7 h-7 bg-[#D95D39] hover:bg-orange-700 active:bg-orange-800 text-white rounded-md font-bold text-xs flex items-center justify-center shadow-xs transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>

                    {/* Quick 00 Reset Button */}
                    <button
                      type="button"
                      onClick={() => clearQuantity(prod.id)}
                      title="Regresar a 00"
                      className="w-6 h-7 text-[10px] font-bold text-slate-400 hover:text-rose-600 bg-slate-50 hover:bg-rose-50 border border-slate-200 rounded-md flex items-center justify-center transition-colors"
                    >
                      00
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 4: Anticipo y Notas */}
        <div className="bg-white rounded-xl p-3 border border-[#E5E1DA] shadow-sm grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-slate-500 font-medium block">Anticipo ($)</label>
            <input
              type="number"
              min="0"
              placeholder="0.00"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 font-medium block">Notas especiales</label>
            <input
              type="text"
              placeholder="Ej. Bien cocido, en caja"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Floating Bottom Action Bar (Fixed, Single Thumb Tap) */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#2D2A26] border-t border-slate-700 p-3 shadow-2xl flex items-center justify-between z-40">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs text-amber-300 font-medium">{totalPieces} piezas</span>
            <span className="text-slate-400">•</span>
            <span className="text-base font-black text-white">${totalAmount.toFixed(2)}</span>
          </div>
          {numericDeposit > 0 && (
            <p className="text-[10px] text-emerald-400">
              Anticipo: ${numericDeposit.toFixed(2)} • Saldo: ${pendingAmount.toFixed(2)}
            </p>
          )}
        </div>

        <button
          onClick={handleSave}
          disabled={totalPieces === 0 || !customerName.trim()}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center space-x-1.5 shadow-lg transition-all ${
            totalPieces > 0 && customerName.trim()
              ? 'bg-[#D95D39] hover:bg-orange-600 text-white active:scale-95'
              : 'bg-slate-700 text-slate-400 cursor-not-allowed'
          }`}
        >
          <Check className="w-4 h-4" />
          <span>Guardar y Sincronizar</span>
        </button>
      </div>
    </div>
  );
};
