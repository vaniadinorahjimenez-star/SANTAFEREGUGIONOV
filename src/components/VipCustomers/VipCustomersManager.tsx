import React, { useState, useMemo, useRef } from 'react';
import { VipCustomer, VipOrder, Settings } from '../../types';
import { 
  Sparkles, 
  Crown, 
  Plus, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  Image as ImageIcon, 
  Eye, 
  Trash2, 
  Edit3, 
  Calendar, 
  Download, 
  X, 
  Check, 
  DollarSign, 
  Building2, 
  Phone, 
  FileSpreadsheet, 
  RefreshCw,
  Search,
  Filter
} from 'lucide-react';
import { getTodayString } from '../../utils/storage';
import { playBeep, playCashSound } from '../../utils/audio';

interface VipCustomersManagerProps {
  vipCustomers: VipCustomer[];
  vipOrders: VipOrder[];
  settings: Settings;
  onSaveCustomer: (customer: VipCustomer) => void;
  onDeleteCustomer: (id: string) => void;
  onSaveOrder: (order: VipOrder) => void;
  onDeleteOrder: (id: string) => void;
  onManualSyncCloud?: () => Promise<void>;
  isSyncingCloud?: boolean;
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
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [activeFilter, setActiveFilter] = useState<'todos' | 'sin_comprobante' | 'sin_factura' | 'cotejados'>('todos');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals state
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState<boolean>(false);
  const [customerToEdit, setCustomerToEdit] = useState<VipCustomer | null>(null);

  // Quick Order Creation Modal
  const [isOrderModalOpen, setIsOrderModalOpen] = useState<boolean>(false);
  const [selectedCustomerForOrder, setSelectedCustomerForOrder] = useState<VipCustomer | null>(null);
  const [manualOrderAmount, setManualOrderAmount] = useState<string>('');
  const [manualOrderBread, setManualOrderBread] = useState<string>('');

  // Transfer Receipt Upload Modal
  const [orderToUploadReceipt, setOrderToUploadReceipt] = useState<VipOrder | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Invoice Modal
  const [orderToManageInvoice, setOrderToManageInvoice] = useState<VipOrder | null>(null);
  const [invoiceFolioInput, setInvoiceFolioInput] = useState<string>('');
  const invoiceFileInputRef = useRef<HTMLInputElement | null>(null);

  // Lightbox Modal for Receipts / Invoices
  const [viewingImage, setViewingImage] = useState<{ title: string; url: string; fileName?: string } | null>(null);

  // Form state for Customer Modal
  const [custName, setCustName] = useState<string>('');
  const [custPhone, setCustPhone] = useState<string>('');
  const [custRfc, setCustRfc] = useState<string>('');
  const [custBusinessName, setCustBusinessName] = useState<string>('');
  const [custBreadType, setCustBreadType] = useState<string>('');
  const [custDefaultAmount, setCustDefaultAmount] = useState<string>('');
  const [custRequiresInvoice, setCustRequiresInvoice] = useState<boolean>(false);
  const [custNotes, setCustNotes] = useState<string>('');

  // Compute yesterday and tomorrow relative to today
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }, []);

  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }, []);

  // Filter orders for selected date
  const dateOrders = useMemo(() => {
    return vipOrders.filter(o => o.date === selectedDate);
  }, [vipOrders, selectedDate]);

  // Orders filtered by search and status
  const filteredOrders = useMemo(() => {
    return dateOrders.filter(o => {
      if (activeFilter === 'sin_comprobante' && o.transferReceiptUrl) return false;
      if (activeFilter === 'sin_factura' && (!o.requiresInvoice || o.invoiceFolio || o.invoiceFileUrl)) return false;
      if (activeFilter === 'cotejados' && !o.isAudited) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = o.customerName.toLowerCase().includes(q);
        const matchBread = o.breadType.toLowerCase().includes(q);
        const matchFolio = o.folio.toLowerCase().includes(q);
        if (!matchName && !matchBread && !matchFolio) return false;
      }
      return true;
    });
  }, [dateOrders, activeFilter, searchQuery]);

  // Metrics for selected date
  const totalDayAmount = useMemo(() => {
    return dateOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  }, [dateOrders]);

  const missingReceiptsCount = useMemo(() => {
    return dateOrders.filter(o => !o.transferReceiptUrl).length;
  }, [dateOrders]);

  const missingInvoicesCount = useMemo(() => {
    return dateOrders.filter(o => o.requiresInvoice && !o.invoiceFolio && !o.invoiceFileUrl).length;
  }, [dateOrders]);

  const auditedCount = useMemo(() => {
    return dateOrders.filter(o => o.isAudited).length;
  }, [dateOrders]);

  // Open Create Customer Modal
  const handleOpenCreateCustomer = () => {
    playBeep(650, 'sine', 0.03);
    setCustomerToEdit(null);
    setCustName('');
    setCustPhone('');
    setCustRfc('');
    setCustBusinessName('');
    setCustBreadType('');
    setCustDefaultAmount('');
    setCustRequiresInvoice(false);
    setCustNotes('');
    setIsCustomerModalOpen(true);
  };

  // Open Edit Customer Modal
  const handleOpenEditCustomer = (c: VipCustomer) => {
    playBeep(650, 'sine', 0.03);
    setCustomerToEdit(c);
    setCustName(c.name);
    setCustPhone(c.phone || '');
    setCustRfc(c.rfc || '');
    setCustBusinessName(c.businessName || '');
    setCustBreadType(c.defaultBreadType || '');
    setCustDefaultAmount(c.defaultAmount ? c.defaultAmount.toString() : '');
    setCustRequiresInvoice(Boolean(c.requiresInvoice));
    setCustNotes(c.notes || '');
    setIsCustomerModalOpen(true);
  };

  // Save Customer
  const handleSaveCustomerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim()) {
      alert('Por favor escribe el nombre del cliente VIP.');
      return;
    }

    const newCustomer: VipCustomer = {
      id: customerToEdit?.id || `vip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: custName.trim(),
      phone: custPhone.trim() || undefined,
      rfc: custRfc.trim() || undefined,
      businessName: custBusinessName.trim() || undefined,
      defaultBreadType: custBreadType.trim() || 'Pan Surtido Especial',
      defaultAmount: parseFloat(custDefaultAmount) || undefined,
      requiresInvoice: custRequiresInvoice,
      notes: custNotes.trim() || undefined,
      createdAt: customerToEdit?.createdAt || new Date().toISOString()
    };

    onSaveCustomer(newCustomer);
    playCashSound();
    setIsCustomerModalOpen(false);
  };

  // Open Quick Order Modal for a Customer
  const handleOpenOrderModal = (c?: VipCustomer) => {
    playBeep(650, 'sine', 0.03);
    const targetCust = c || vipCustomers[0] || null;
    setSelectedCustomerForOrder(targetCust);
    setManualOrderAmount(targetCust?.defaultAmount ? targetCust.defaultAmount.toString() : '');
    setManualOrderBread(targetCust?.defaultBreadType || '');
    setIsOrderModalOpen(true);
  };

  // Submit Order
  const handleSaveOrderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerForOrder) return;
    const amount = parseFloat(manualOrderAmount) || 0;
    if (amount <= 0) {
      alert('Por favor ingresa un monto válido mayor a $0.');
      return;
    }

    const orderId = `vipo_${selectedDate}_${selectedCustomerForOrder.id}`;
    // Check if order already exists for this client and date
    const existing = vipOrders.find(o => o.id === orderId);

    const newOrder: VipOrder = {
      id: orderId,
      folio: existing?.folio || `VIP-${String(vipOrders.length + 1).padStart(3, '0')}`,
      date: selectedDate,
      customerId: selectedCustomerForOrder.id,
      customerName: selectedCustomerForOrder.name,
      customerPhone: selectedCustomerForOrder.phone,
      breadType: manualOrderBread.trim() || selectedCustomerForOrder.defaultBreadType,
      totalAmount: amount,
      requiresInvoice: selectedCustomerForOrder.requiresInvoice,
      transferReceiptUrl: existing?.transferReceiptUrl,
      transferReceiptFileName: existing?.transferReceiptFileName,
      transferReceiptUploadedAt: existing?.transferReceiptUploadedAt,
      invoiceFolio: existing?.invoiceFolio,
      invoiceFileUrl: existing?.invoiceFileUrl,
      invoiceFileName: existing?.invoiceFileName,
      invoiceUploadedAt: existing?.invoiceUploadedAt,
      isAudited: existing?.isAudited || false,
      paymentStatus: 'pagado',
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    onSaveOrder(newOrder);
    playCashSound();
    setIsOrderModalOpen(false);
  };

  // Cargar pedidos para todos los clientes VIP en la fecha seleccionada en 1 clic
  const handleLoadAllVipOrdersForDate = () => {
    if (vipCustomers.length === 0) {
      alert('Primero crea al menos un Cliente VIP.');
      return;
    }

    let createdCount = 0;
    vipCustomers.forEach(c => {
      const orderId = `vipo_${selectedDate}_${c.id}`;
      const existing = vipOrders.find(o => o.id === orderId);
      if (!existing) {
        const newOrder: VipOrder = {
          id: orderId,
          folio: `VIP-${String(vipOrders.length + createdCount + 1).padStart(3, '0')}`,
          date: selectedDate,
          customerId: c.id,
          customerName: c.name,
          customerPhone: c.phone,
          breadType: c.defaultBreadType,
          totalAmount: c.defaultAmount || 0,
          requiresInvoice: c.requiresInvoice,
          isAudited: false,
          paymentStatus: 'pagado',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        onSaveOrder(newOrder);
        createdCount++;
      }
    });

    playCashSound();
    if (createdCount > 0) {
      alert(`Se cargaron ${createdCount} pedidos VIP para la fecha ${selectedDate}.`);
    } else {
      alert(`Todos los clientes VIP ya tienen su pedido cargado para la fecha ${selectedDate}.`);
    }
  };

  // Helper to compress and convert image file to Base64
  const handleProcessImageFile = (file: File): Promise<string> => {
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
            // Compress to jpeg quality 0.8
            const compressed = canvas.toDataURL('image/jpeg', 0.8);
            resolve(compressed);
          } else {
            resolve(e.target?.result as string);
          }
        };
        img.onerror = () => resolve(e.target?.result as string);
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Handle Upload Transfer Receipt
  const handleReceiptFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !orderToUploadReceipt) return;

    try {
      const base64 = await handleProcessImageFile(file);
      const updatedOrder: VipOrder = {
        ...orderToUploadReceipt,
        transferReceiptUrl: base64,
        transferReceiptFileName: file.name,
        transferReceiptUploadedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      onSaveOrder(updatedOrder);
      playCashSound();
      setOrderToUploadReceipt(null);
    } catch {
      alert('No se pudo procesar la imagen del comprobante.');
    }
  };

  // Handle Delete Transfer Receipt
  const handleRemoveReceipt = (order: VipOrder) => {
    if (!confirm(`¿Eliminar comprobante de ${order.customerName}?`)) return;
    const updated: VipOrder = {
      ...order,
      transferReceiptUrl: undefined,
      transferReceiptFileName: undefined,
      transferReceiptUploadedAt: undefined,
      updatedAt: new Date().toISOString()
    };
    onSaveOrder(updated);
    playBeep(450, 'sawtooth', 0.1);
  };

  // Handle Invoice Submit / Upload
  const handleSaveInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderToManageInvoice) return;

    let invoiceBase64 = orderToManageInvoice.invoiceFileUrl;
    let fileName = orderToManageInvoice.invoiceFileName;

    const file = invoiceFileInputRef.current?.files?.[0];
    if (file) {
      if (file.type.startsWith('image/')) {
        invoiceBase64 = await handleProcessImageFile(file);
      } else {
        // PDF or XML as direct base64
        invoiceBase64 = await new Promise((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.readAsDataURL(file);
        });
      }
      fileName = file.name;
    }

    const updated: VipOrder = {
      ...orderToManageInvoice,
      invoiceFolio: invoiceFolioInput.trim() || undefined,
      invoiceFileUrl: invoiceBase64,
      invoiceFileName: fileName,
      invoiceUploadedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    onSaveOrder(updated);
    playCashSound();
    setOrderToManageInvoice(null);
  };

  // Toggle Audit Status
  const handleToggleAudit = (order: VipOrder) => {
    playBeep(650, 'sine', 0.03);
    const updated: VipOrder = {
      ...order,
      isAudited: !order.isAudited,
      auditedBy: !order.isAudited ? 'Contadora' : undefined,
      auditedAt: !order.isAudited ? new Date().toISOString() : undefined,
      updatedAt: new Date().toISOString()
    };
    onSaveOrder(updated);
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-4 pb-12">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-amber-900 via-amber-800 to-slate-900 text-white rounded-3xl p-4 sm:p-5 shadow-sm flex flex-wrap items-center justify-between gap-4 border border-amber-700/50">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black text-2xl shadow-md border-2 border-amber-300">
            👑
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-white leading-tight">
                Módulo de Clientes VIP
              </h1>
              <span className="text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full">
                Contabilidad & Facturación
              </span>
            </div>
            <p className="text-xs text-amber-200/90 font-medium mt-0.5">
              Control de pedidos especiales, cotejo de transferencias y carga de facturas fiscales
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center flex-wrap gap-2">
          {onManualSyncCloud && (
            <button
              type="button"
              onClick={onManualSyncCloud}
              disabled={isSyncingCloud}
              className="bg-white/10 hover:bg-white/20 text-white font-black px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all border border-white/20 cursor-pointer disabled:opacity-50"
              title="Sincronizar en tiempo real con la nube"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCloud ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isSyncingCloud ? 'Sincronizando...' : 'Sincronizar Nube'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleOpenCreateCustomer}
            className="bg-amber-400 hover:bg-amber-300 active:scale-95 text-slate-950 font-black px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-md transition-all cursor-pointer border border-amber-300"
          >
            <Plus className="w-4 h-4 text-slate-950" />
            <span>+ Crear Cliente VIP</span>
          </button>
        </div>
      </div>

      {/* 2. Resumen Ejecutivo (KPIs de Primera Vista para la Contadora y el Dueño) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* KPI 1: Total Facturado/Venta del Día */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
            Venta VIP del Día ({selectedDate.slice(5)})
          </span>
          <div className="text-2xl font-black text-slate-900 mt-0.5">
            ${totalDayAmount.toLocaleString('es-MX')}.00
          </div>
          <span className="text-[10.5px] text-slate-500 font-bold">
            {dateOrders.length} pedidos registrados
          </span>
        </div>

        {/* KPI 2: Sin Comprobante de Transferencia (Filtro Rápido) */}
        <div 
          onClick={() => setActiveFilter(activeFilter === 'sin_comprobante' ? 'todos' : 'sin_comprobante')}
          className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer ${
            activeFilter === 'sin_comprobante' 
              ? 'bg-rose-50 border-rose-500 shadow-xs ring-2 ring-rose-300' 
              : 'bg-white border-rose-200 hover:border-rose-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-rose-800 tracking-wider">
              Sin Comprobante Foto
            </span>
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          </div>
          <div className="text-2xl font-black text-rose-700 mt-0.5">
            {missingReceiptsCount}
          </div>
          <span className="text-[10.5px] text-rose-900 font-bold underline">
            {missingReceiptsCount === 0 ? '✓ Todos con foto' : 'Clic para filtrar pendientes'}
          </span>
        </div>

        {/* KPI 3: Facturas Pendientes (Filtro Rápido) */}
        <div 
          onClick={() => setActiveFilter(activeFilter === 'sin_factura' ? 'todos' : 'sin_factura')}
          className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer ${
            activeFilter === 'sin_factura' 
              ? 'bg-amber-50 border-amber-500 shadow-xs ring-2 ring-amber-300' 
              : 'bg-white border-amber-200 hover:border-amber-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-amber-900 tracking-wider">
              Facturas Pendientes
            </span>
            <FileText className="w-3.5 h-3.5 text-amber-700" />
          </div>
          <div className="text-2xl font-black text-amber-800 mt-0.5">
            {missingInvoicesCount}
          </div>
          <span className="text-[10.5px] text-amber-900 font-bold underline">
            {missingInvoicesCount === 0 ? '✓ Facturas al día' : 'Clic para ver faltantes'}
          </span>
        </div>

        {/* KPI 4: Cotejados por Contadora */}
        <div 
          onClick={() => setActiveFilter(activeFilter === 'cotejados' ? 'todos' : 'cotejados')}
          className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer ${
            activeFilter === 'cotejados' 
              ? 'bg-emerald-50 border-emerald-500 shadow-xs ring-2 ring-emerald-300' 
              : 'bg-white border-emerald-200 hover:border-emerald-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-emerald-800 tracking-wider">
              Cotejados / Auditados
            </span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700 mt-0.5">
            {auditedCount} / {dateOrders.length}
          </div>
          <span className="text-[10.5px] text-emerald-800 font-bold">
            {dateOrders.length > 0 ? `${Math.round((auditedCount / dateOrders.length) * 100)}% auditado` : 'Sin pedidos'}
          </span>
        </div>
      </div>

      {/* 3. Barra de Control de Fecha y Filtros */}
      <div className="bg-white rounded-2xl p-2.5 shadow-xs border border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-black uppercase text-slate-400 px-1">Fecha:</span>
          
          <button
            type="button"
            onClick={() => {
              setSelectedDate(todayStr);
              playBeep(650, 'sine', 0.03);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
              selectedDate === todayStr ? 'bg-amber-500 text-white shadow-2xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Hoy ({todayStr.slice(5)})
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedDate(yesterdayStr);
              playBeep(650, 'sine', 0.03);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
              selectedDate === yesterdayStr ? 'bg-blue-700 text-white shadow-2xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Ayer ({yesterdayStr.slice(5)})
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedDate(tomorrowStr);
              playBeep(650, 'sine', 0.03);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
              selectedDate === tomorrowStr ? 'bg-purple-700 text-white shadow-2xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Mañana ({tomorrowStr.slice(5)})
          </button>

          <div className="flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-xl border border-slate-200">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) setSelectedDate(e.target.value);
              }}
              className="bg-transparent text-xs font-black text-slate-800 cursor-pointer focus:outline-none"
            />
          </div>
        </div>

        {/* Acciones para cargar pedidos */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleOpenOrderModal()}
            className="bg-slate-900 hover:bg-slate-800 text-white font-black px-3 py-1.5 rounded-xl text-xs transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Cargar Pedido VIP</span>
          </button>

          <button
            type="button"
            onClick={handleLoadAllVipOrdersForDate}
            className="bg-amber-100 hover:bg-amber-200 text-amber-950 font-black px-3 py-1.5 rounded-xl text-xs transition-colors flex items-center gap-1 cursor-pointer border border-amber-300"
            title="Carga todos los clientes VIP con sus montos habituales para este día"
          >
            <span>⚡ Cargar Todos</span>
          </button>
        </div>
      </div>

      {/* 4. Filtros de Estado y Buscador */}
      <div className="bg-white rounded-2xl p-2.5 shadow-xs border border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveFilter('todos')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'todos' ? 'bg-slate-900 text-white font-black' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Todos ({dateOrders.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('sin_comprobante')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              activeFilter === 'sin_comprobante' ? 'bg-rose-700 text-white font-black' : 'text-rose-700 hover:bg-rose-50'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Sin Comprobante ({missingReceiptsCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('sin_factura')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              activeFilter === 'sin_factura' ? 'bg-amber-600 text-white font-black' : 'text-amber-800 hover:bg-amber-50'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Factura Pendiente ({missingInvoicesCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('cotejados')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              activeFilter === 'cotejados' ? 'bg-emerald-700 text-white font-black' : 'text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Cotejados ({auditedCount})</span>
          </button>
        </div>

        {/* Buscador */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por cliente o pan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* 5. TABLA DE PEDIDOS VIP (DISEÑO LIMPIO, COMPACTO Y FILAS DELGADAS) */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-amber-600" />
            <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">
              Control Diario de Clientes VIP ({filteredOrders.length} pedidos para {selectedDate})
            </h2>
          </div>
          <span className="text-xs font-black text-amber-950">
            Total del Listado: ${filteredOrders.reduce((s, o) => s + (o.totalAmount || 0), 0)}.00
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-black uppercase text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">Folio</th>
                <th className="py-2.5 px-3">Cliente VIP</th>
                <th className="py-2.5 px-3">Pan Habitual</th>
                <th className="py-2.5 px-3 text-right">Monto Total</th>
                <th className="py-2.5 px-3 text-center">Foto Transferencia</th>
                <th className="py-2.5 px-3 text-center">Factura Fiscal</th>
                <th className="py-2.5 px-3 text-center">Cotejo Contadora</th>
                <th className="py-2.5 px-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400 font-bold">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Sparkles className="w-7 h-7 text-amber-400" />
                      <span className="text-sm font-black text-slate-700">No hay pedidos VIP cargados para esta fecha</span>
                      <p className="text-xs text-slate-400 max-w-sm">
                        Usa el botón <strong>"+ Cargar Pedido VIP"</strong> o <strong>"⚡ Cargar Todos"</strong> para registrar los pedidos del día.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const hasReceipt = Boolean(order.transferReceiptUrl);
                  const hasInvoice = Boolean(order.invoiceFolio || order.invoiceFileUrl);

                  return (
                    <tr 
                      key={order.id} 
                      className={`hover:bg-amber-50/30 transition-colors ${
                        !hasReceipt 
                          ? 'bg-rose-50/20' 
                          : order.requiresInvoice && !hasInvoice 
                          ? 'bg-amber-50/20' 
                          : ''
                      }`}
                    >
                      {/* Folio */}
                      <td className="py-2 px-3 font-mono font-black text-slate-900 text-[11px]">
                        {order.folio}
                      </td>

                      {/* Cliente VIP */}
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">👑</span>
                          <div>
                            <strong className="text-slate-900 block font-black text-xs leading-tight">
                              {order.customerName}
                            </strong>
                            {order.customerPhone && (
                              <span className="text-[10px] text-slate-500 font-mono block">
                                📞 {order.customerPhone}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Tipo de Pan */}
                      <td className="py-2 px-3 text-slate-700 text-xs font-semibold">
                        {order.breadType}
                      </td>

                      {/* Monto Total */}
                      <td className="py-2 px-3 text-right">
                        <span className="font-mono font-black text-slate-900 text-sm bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                          ${order.totalAmount}.00
                        </span>
                      </td>

                      {/* Comprobante de Transferencia (FOTO) */}
                      <td className="py-2 px-3 text-center">
                        {hasReceipt ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setViewingImage({
                                title: `Comprobante de Transferencia - ${order.customerName}`,
                                url: order.transferReceiptUrl!,
                                fileName: order.transferReceiptFileName
                              })}
                              className="group relative flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 px-2 py-0.5 rounded-lg text-[10.5px] font-black transition-all cursor-pointer"
                              title="Ver foto del comprobante"
                            >
                              <img 
                                src={order.transferReceiptUrl} 
                                alt="Miniatura" 
                                className="w-4 h-4 object-cover rounded shrink-0 border border-emerald-400"
                              />
                              <span>Ver Foto</span>
                              <Eye className="w-3 h-3 text-emerald-700 group-hover:scale-110 transition-transform" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleRemoveReceipt(order)}
                              className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-slate-100 cursor-pointer"
                              title="Eliminar comprobante"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setOrderToUploadReceipt(order);
                              fileInputRef.current?.click();
                            }}
                            className="bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-300 font-black px-2 py-0.5 rounded-lg text-[10.5px] inline-flex items-center gap-1 cursor-pointer transition-all shadow-2xs active:scale-95"
                            title="Subir foto de la transferencia"
                          >
                            <Upload className="w-3 h-3 text-rose-700" />
                            <span>Subir Foto</span>
                          </button>
                        )}
                      </td>

                      {/* Factura Fiscal */}
                      <td className="py-2 px-3 text-center">
                        {order.requiresInvoice ? (
                          hasInvoice ? (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  if (order.invoiceFileUrl) {
                                    setViewingImage({
                                      title: `Factura Fiscal - ${order.customerName}`,
                                      url: order.invoiceFileUrl,
                                      fileName: order.invoiceFileName
                                    });
                                  } else {
                                    setOrderToManageInvoice(order);
                                    setInvoiceFolioInput(order.invoiceFolio || '');
                                  }
                                }}
                                className="bg-blue-50 hover:bg-blue-100 text-blue-950 border border-blue-300 px-2 py-0.5 rounded-lg text-[10.5px] font-black inline-flex items-center gap-1 cursor-pointer"
                                title="Ver factura"
                              >
                                <FileText className="w-3 h-3 text-blue-700" />
                                <span>{order.invoiceFolio ? `#${order.invoiceFolio}` : 'Factura Lista'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setOrderToManageInvoice(order);
                                  setInvoiceFolioInput(order.invoiceFolio || '');
                                }}
                                className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-100 cursor-pointer"
                                title="Modificar folio o archivo de factura"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setOrderToManageInvoice(order);
                                setInvoiceFolioInput('');
                              }}
                              className="bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 font-black px-2 py-0.5 rounded-lg text-[10.5px] inline-flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
                              title="Registrar factura solicitada por el cliente"
                            >
                              <FileText className="w-3 h-3 text-amber-700" />
                              <span>Pendiente</span>
                            </button>
                          )
                        ) : (
                          <span className="text-[10px] text-slate-400 font-bold">
                            ⚪ No requiere
                          </span>
                        )}
                      </td>

                      {/* Cotejo Contadora */}
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleAudit(order)}
                          className={`px-2.5 py-0.5 rounded-lg text-[10.5px] font-black border transition-all cursor-pointer inline-flex items-center gap-1 ${
                            order.isAudited
                              ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                          }`}
                          title="Haz clic para marcar o desmarcar cotejo por la contadora"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{order.isAudited ? 'Cotejado' : 'Por Cotejar'}</span>
                        </button>
                      </td>

                      {/* Acciones */}
                      <td className="py-2 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              const newAmountStr = prompt(`Actualizar monto para ${order.customerName}:`, order.totalAmount.toString());
                              if (newAmountStr !== null) {
                                const val = parseFloat(newAmountStr);
                                if (!isNaN(val) && val >= 0) {
                                  onSaveOrder({
                                    ...order,
                                    totalAmount: val,
                                    updatedAt: new Date().toISOString()
                                  });
                                  playCashSound();
                                }
                              }
                            }}
                            className="p-1 rounded text-slate-400 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"
                            title="Editar monto"
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`¿Eliminar pedido de ${order.customerName} del día ${selectedDate}?`)) {
                                onDeleteOrder(order.id);
                                playBeep(450, 'sawtooth', 0.1);
                              }
                            }}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                            title="Eliminar pedido de la fecha"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. CATÁLOGO / DIRECTORIO DE CLIENTES VIP REGISTRADOS */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-700" />
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
              Directorio de Clientes VIP ({vipCustomers.length})
            </h3>
          </div>
          <button
            type="button"
            onClick={handleOpenCreateCustomer}
            className="text-xs font-black text-amber-900 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-xl transition-colors cursor-pointer border border-amber-300"
          >
            + Agregar Cliente
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {vipCustomers.map(c => (
            <div key={c.id} className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5 text-xs hover:border-amber-300 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <strong className="font-black text-slate-900 block text-xs">{c.name}</strong>
                  {c.phone && <span className="text-[10px] text-slate-500 font-mono block">📞 {c.phone}</span>}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleOpenEditCustomer(c)}
                    className="p-1 text-slate-400 hover:text-slate-800 rounded hover:bg-white cursor-pointer"
                    title="Editar cliente"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`¿Eliminar al cliente VIP "${c.name}"?`)) {
                        onDeleteCustomer(c.id);
                        playBeep(450, 'sawtooth', 0.1);
                      }
                    }}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-white cursor-pointer"
                    title="Eliminar cliente"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="text-[11px] text-slate-600 bg-white p-1.5 rounded-lg border border-slate-200/80">
                <span className="text-[10px] text-slate-400 font-bold block">Pan Habitual:</span>
                <span className="font-semibold text-slate-800">{c.defaultBreadType}</span>
                {c.defaultAmount ? <span className="block font-black text-amber-900 text-[10.5px]">Monto Habitual: ${c.defaultAmount}.00</span> : null}
              </div>

              <div className="flex items-center justify-between text-[10px]">
                <span className={`font-bold px-1.5 py-0.2 rounded border ${
                  c.requiresInvoice 
                    ? 'bg-blue-50 text-blue-900 border-blue-200' 
                    : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}>
                  {c.requiresInvoice ? '📄 Requiere Factura' : '⚪ Sin Factura'}
                </span>
                
                <button
                  type="button"
                  onClick={() => handleOpenOrderModal(c)}
                  className="font-black text-amber-800 hover:underline cursor-pointer"
                >
                  + Cargar Pedido
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Hidden File Input for Transfer Receipt */}
      <input 
        type="file"
        ref={fileInputRef}
        onChange={handleReceiptFileUpload}
        accept="image/*"
        capture="environment"
        className="hidden"
      />

      {/* =========================================================================
          MODALS
          ========================================================================= */}

      {/* 1. Modal: Crear / Editar Cliente VIP */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl p-5 max-w-md w-full shadow-2xl border-2 border-amber-300 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-600" />
                <h3 className="font-black text-base text-slate-900 leading-tight">
                  {customerToEdit ? 'Editar Cliente VIP' : 'Nuevo Cliente VIP'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCustomerModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomerSubmit} className="space-y-3 mt-3 text-xs">
              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                  Nombre del Cliente VIP *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Taquería Trascos, Café Deliz, Doña Magda..."
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                    Teléfono (Opcional)
                  </label>
                  <input
                    type="tel"
                    placeholder="442 000 0000"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                    Monto Habitual ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Ej. 350"
                    value={custDefaultAmount}
                    onChange={(e) => setCustDefaultAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                  Tipo de Pan Habitual
                </label>
                <input
                  type="text"
                  placeholder="Ej. Bolillo tradicional para torta, Telera especial, Pan dulce..."
                  value={custBreadType}
                  onChange={(e) => setCustBreadType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* ¿Requiere Factura? */}
              <div className="bg-amber-50/70 p-3 rounded-2xl border border-amber-200 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={custRequiresInvoice}
                    onChange={(e) => setCustRequiresInvoice(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 cursor-pointer"
                  />
                  <span className="font-black text-slate-900 text-xs">
                    ¿Este cliente solicita factura fiscal?
                  </span>
                </label>

                {custRequiresInvoice && (
                  <div className="space-y-2 pt-1 border-t border-amber-200">
                    <div>
                      <label className="block text-[10px] font-black text-slate-600 uppercase mb-0.5">
                        RFC (Opcional):
                      </label>
                      <input
                        type="text"
                        placeholder="XAXX010101000"
                        value={custRfc}
                        onChange={(e) => setCustRfc(e.target.value.toUpperCase())}
                        className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800 uppercase"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-600 uppercase mb-0.5">
                        Razón Social / Nombre Fiscal:
                      </label>
                      <input
                        type="text"
                        placeholder="Razón social para la factura..."
                        value={custBusinessName}
                        onChange={(e) => setCustBusinessName(e.target.value)}
                        className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                  Notas / Observaciones
                </label>
                <input
                  type="text"
                  placeholder="Ej. Pasa por el pedido a las 8:30 AM / Pago semanal los viernes"
                  value={custNotes}
                  onChange={(e) => setCustNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCustomerModalOpen(false)}
                  className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-full bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-black py-2.5 rounded-xl text-xs shadow-md transition-all cursor-pointer"
                >
                  {customerToEdit ? 'Actualizar Cliente' : 'Guardar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Modal: Cargar Pedido VIP para la Fecha */}
      {isOrderModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl p-5 max-w-sm w-full shadow-2xl border-2 border-slate-900 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-black text-sm text-slate-900 uppercase tracking-wider">
                Cargar Pedido VIP ({selectedDate})
              </h3>
              <button
                type="button"
                onClick={() => setIsOrderModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveOrderSubmit} className="space-y-3 mt-3 text-xs">
              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                  Seleccionar Cliente VIP:
                </label>
                <select
                  value={selectedCustomerForOrder?.id || ''}
                  onChange={(e) => {
                    const found = vipCustomers.find(c => c.id === e.target.value);
                    if (found) {
                      setSelectedCustomerForOrder(found);
                      setManualOrderBread(found.defaultBreadType);
                      setManualOrderAmount(found.defaultAmount ? found.defaultAmount.toString() : '');
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 cursor-pointer"
                >
                  {vipCustomers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.defaultAmount ? `($${c.defaultAmount})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                  Tipo de Pan del Pedido:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Bolillo y telera surtida"
                  value={manualOrderBread}
                  onChange={(e) => setManualOrderBread(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                  Monto Total ($):
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-slate-400">$</span>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="0"
                    value={manualOrderAmount}
                    onChange={(e) => setManualOrderAmount(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-lg font-black text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsOrderModalOpen(false)}
                  className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-2.5 rounded-xl text-xs shadow-md"
                >
                  Confirmar Pedido
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Modal: Registrar / Cargar Factura Fiscal */}
      {orderToManageInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl p-5 max-w-sm w-full shadow-2xl border-2 border-blue-400 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="font-black text-sm text-slate-900">
                    Factura Fiscal - {orderToManageInvoice.customerName}
                  </h3>
                  <span className="text-[10px] text-slate-500 font-bold font-mono">
                    Pedido #{orderToManageInvoice.folio} (${orderToManageInvoice.totalAmount}.00)
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOrderToManageInvoice(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveInvoiceSubmit} className="space-y-3 mt-3 text-xs">
              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                  Número / Folio de Factura (SAT):
                </label>
                <input
                  type="text"
                  placeholder="Ej. F-10492 o UUID..."
                  value={invoiceFolioInput}
                  onChange={(e) => setInvoiceFolioInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                  Subir Archivo de Factura (PDF / Imagen / XML):
                </label>
                <input
                  type="file"
                  ref={invoiceFileInputRef}
                  accept=".pdf,image/*,.xml"
                  className="w-full text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-blue-100 file:text-blue-900 hover:file:bg-blue-200 cursor-pointer"
                />
                {orderToManageInvoice.invoiceFileName && (
                  <span className="text-[10px] text-emerald-700 font-bold block mt-1">
                    Archivo actual: {orderToManageInvoice.invoiceFileName}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setOrderToManageInvoice(null)}
                  className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-2.5 rounded-xl text-xs shadow-md"
                >
                  Guardar Factura
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Lightbox Modal para Ver Foto de Comprobante o Factura */}
      {viewingImage && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border-2 border-amber-400">
            <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-amber-400" />
                <h4 className="font-black text-xs sm:text-sm text-white truncate max-w-xs sm:max-w-md">
                  {viewingImage.title}
                </h4>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={viewingImage.url}
                  download={viewingImage.fileName || 'comprobante.jpg'}
                  className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white text-xs font-bold flex items-center gap-1 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Descargar</span>
                </a>
                <button
                  type="button"
                  onClick={() => setViewingImage(null)}
                  className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 overflow-auto flex-1 flex items-center justify-center bg-slate-100">
              {viewingImage.url.startsWith('data:application/pdf') ? (
                <iframe src={viewingImage.url} className="w-full h-96 rounded-xl border border-slate-300" title="PDF Factura" />
              ) : (
                <img
                  src={viewingImage.url}
                  alt="Comprobante"
                  className="max-h-[70vh] w-auto max-w-full object-contain rounded-xl shadow-md border border-slate-200"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
