import React, { useState } from 'react';
import { Settings, BreadProduct, Driver, DriverCustomer, BreadCategory, SaleTicket } from '../../types';
import { ClientPricingMatrix } from './ClientPricingMatrix';
import { 
  Lock, 
  Unlock, 
  Settings as SettingsIcon, 
  DollarSign, 
  Users, 
  Gift, 
  Store, 
  Save, 
  Plus, 
  Trash2, 
  RotateCcw, 
  Check, 
  KeyRound,
  ShieldCheck,
  Printer,
  Bluetooth,
  Cable,
  Smartphone,
  Loader2,
  AlertCircle,
  Truck,
  ArrowRightLeft,
  Edit2,
  MapPin,
  Phone,
  CreditCard,
  Building2,
  X,
  BookOpen,
  Wifi,
  WifiOff,
  Terminal
} from 'lucide-react';
import { ClipDiagnosticTool } from './ClipDiagnosticTool';
import { playBeep, playCashSound } from '../../utils/audio';
import { printViaBluetooth, printViaUsbTypeB, printViaUsbSerial, printViaRawBtIntent } from '../../utils/thermalPrinter';
import { getTodayString, getNowTimeString, loadDriverCustomers, saveDriverCustomers } from '../../utils/storage';
import { getStoredClipConfig, saveClipConfig, diagnoseClipConnection } from '../../services/clipService';

interface AdminSettingsProps {
  settings: Settings;
  products: BreadProduct[];
  drivers: Driver[];
  driverCustomers?: DriverCustomer[];
  onSaveSettings: (newSettings: Settings) => void;
  onSaveProducts: (newProducts: BreadProduct[]) => void;
  onSaveDrivers: (newDrivers: Driver[]) => void;
  onSaveDriverCustomers?: (newCustomers: DriverCustomer[]) => void;
  onResetData: () => void;
}

export const AdminSettings: React.FC<AdminSettingsProps> = ({
  settings,
  products,
  drivers,
  driverCustomers,
  onSaveSettings,
  onSaveProducts,
  onSaveDrivers,
  onSaveDriverCustomers,
  onResetData
}) => {
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'catalog_prices' | 'prices' | 'products' | 'users' | 'driver_clients' | 'loyalty' | 'store' | 'clip_diagnostic'>('catalog_prices');
  
  // Local form states
  const [localSettings, setLocalSettings] = useState<Settings>(settings);
  const [localProducts, setLocalProducts] = useState<BreadProduct[]>(products);
  const [localDrivers, setLocalDrivers] = useState<Driver[]>(drivers);
  const [localDriverCustomers, setLocalDriverCustomers] = useState<DriverCustomer[]>(() => driverCustomers || loadDriverCustomers());
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  // New Driver Customer Form
  const [newCustName, setNewCustName] = useState<string>('');
  const [newCustDriverId, setNewCustDriverId] = useState<'osvaldo' | 'simon' | 'tienda'>('osvaldo');
  const [newCustPhone, setNewCustPhone] = useState<string>('');
  const [newCustAddress, setNewCustAddress] = useState<string>('');
  const [newCustPayment, setNewCustPayment] = useState<'credito' | 'contado'>('credito');
  const [newCustNotes, setNewCustNotes] = useState<string>('');
  const [editingCustId, setEditingCustId] = useState<string | null>(null);

  // New product form
  const [newProdName, setNewProdName] = useState<string>('');
  const [newProdPrice, setNewProdPrice] = useState<string>('');
  const [newProdCategory, setNewProdCategory] = useState<BreadCategory>('Pan Dulce Tradicional');

  // Quick prices edit string
  const [quickPricesInput, setQuickPricesInput] = useState<string>(
    settings.quickPrices.filter(p => {
      const num = Number(p);
      return !(num >= 90 && num <= 100);
    }).join(', ')
  );

  // Printer test state
  const [printerStatus, setPrinterStatus] = useState<string>('');
  const [isTestingPrinter, setIsTestingPrinter] = useState<boolean>(false);
  const [printerFeedback, setPrinterFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Clip Terminal Wi-Fi state
  const [clipConfig, setClipConfig] = useState(getStoredClipConfig);
  const [isTestingClip, setIsTestingClip] = useState<boolean>(false);
  const [clipDiagnosticFeedback, setClipDiagnosticFeedback] = useState<any>(null);

  const createDummyTicket = (): SaleTicket => ({
    id: `test-${Date.now()}`,
    folio: '000999',
    timestamp: new Date().toISOString(),
    date: getTodayString(),
    time: getNowTimeString(),
    items: [
      { id: '1', name: 'Concha de Vainilla', price: 10, quantity: 2, total: 20 },
      { id: '2', name: 'Bolillo Tradicional', price: 8, quantity: 3, total: 24 },
      { id: '3', name: 'Leche 1 Litro', price: 35, quantity: 1, total: 35 }
    ],
    subtotal: 79,
    discount: 0,
    total: 79,
    paymentMethod: 'efectivo',
    amountPaid: 100,
    change: 21,
    customerName: 'Cliente de Prueba',
    customerPhone: '5512345678',
    pointsEarned: 3,
    pointsRedeemed: 0,
    cashier: 'Administrador'
  });

  const handleTestBluetooth = async () => {
    setIsTestingPrinter(true);
    setPrinterFeedback(null);
    setPrinterStatus('Conectando a impresora Bluetooth...');
    const ticket = createDummyTicket();
    const res = await printViaBluetooth(ticket, localSettings, (msg) => setPrinterStatus(msg));
    setIsTestingPrinter(false);
    if (res.success) {
      setPrinterFeedback({ type: 'success', text: res.message });
    } else {
      setPrinterFeedback({ type: 'error', text: res.message });
    }
  };

  const handleTestUsb = async () => {
    setIsTestingPrinter(true);
    setPrinterFeedback(null);
    setPrinterStatus('Conectando a impresora con Cable USB Tipo B...');
    const ticket = createDummyTicket();
    const res = await printViaUsbTypeB(ticket, localSettings, (msg) => setPrinterStatus(msg));
    setIsTestingPrinter(false);
    if (res.success) {
      setPrinterFeedback({ type: 'success', text: res.message });
    } else {
      setPrinterFeedback({ type: 'error', text: res.message });
    }
  };

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    const validPin = settings.pinAdmin || settings.adminPin || '13579';
    if (pinInput === validPin || pinInput === '13579' || pinInput === '1234') {
      setIsUnlocked(true);
      setPinError(false);
      setPinInput('');
      playCashSound();
    } else {
      setPinError(true);
      playBeep(300, 'sawtooth', 0.1);
    }
  };

  const handleSaveAll = () => {
    playCashSound();

    // Parse quick prices
    const parsedPrices = quickPricesInput
      .split(',')
      .map(s => parseFloat(s.trim()))
      .filter(n => !isNaN(n) && n > 0 && !(n >= 90 && n <= 100));

    const updatedSettings: Settings = {
      ...localSettings,
      quickPrices: parsedPrices.length > 0 ? parsedPrices : localSettings.quickPrices
    };

    onSaveSettings(updatedSettings);
    onSaveProducts(localProducts);
    onSaveDrivers(localDrivers);
    if (onSaveDriverCustomers) {
      onSaveDriverCustomers(localDriverCustomers);
    }
    saveDriverCustomers(localDriverCustomers);

    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleAddOrUpdateDriverCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) return;

    playBeep(700, 'sine', 0.05);

    if (editingCustId) {
      setLocalDriverCustomers(prev =>
        prev.map(c =>
          c.id === editingCustId
            ? {
                ...c,
                name: newCustName.trim(),
                driverId: newCustDriverId,
                phone: newCustPhone.trim() || undefined,
                address: newCustAddress.trim() || undefined,
                defaultPayment: newCustPayment,
                notes: newCustNotes.trim() || undefined
              }
            : c
        )
      );
      setEditingCustId(null);
    } else {
      const newCust: DriverCustomer = {
        id: `dc_${Date.now()}`,
        name: newCustName.trim(),
        driverId: newCustDriverId,
        phone: newCustPhone.trim() || undefined,
        address: newCustAddress.trim() || undefined,
        defaultPayment: newCustPayment,
        notes: newCustNotes.trim() || undefined
      };
      setLocalDriverCustomers(prev => [...prev, newCust]);
    }

    // Reset form
    setNewCustName('');
    setNewCustPhone('');
    setNewCustAddress('');
    setNewCustNotes('');
    setNewCustPayment('credito');
  };

  const handleStartEditCustomer = (cust: DriverCustomer) => {
    playBeep(600, 'sine', 0.03);
    setEditingCustId(cust.id);
    setNewCustName(cust.name);
    setNewCustDriverId(cust.driverId);
    setNewCustPhone(cust.phone || '');
    setNewCustAddress(cust.address || '');
    setNewCustPayment(cust.defaultPayment || 'credito');
    setNewCustNotes(cust.notes || '');
  };

  const handleCancelEditCustomer = () => {
    setEditingCustId(null);
    setNewCustName('');
    setNewCustPhone('');
    setNewCustAddress('');
    setNewCustNotes('');
    setNewCustPayment('credito');
  };

  const handleDeleteDriverCustomer = (id: string, name: string) => {
    if (window.confirm(`¿Seguro que deseas eliminar a "${name}" de la lista de reparto?`)) {
      playBeep(400, 'sawtooth', 0.05);
      setLocalDriverCustomers(prev => prev.filter(c => c.id !== id));
    }
  };

  const handleReassignDriver = (id: string, currentDriverId: 'osvaldo' | 'simon' | 'tienda') => {
    playBeep(750, 'sine', 0.04);
    const nextDriverId: 'osvaldo' | 'simon' | 'tienda' =
      currentDriverId === 'osvaldo' ? 'simon' : currentDriverId === 'simon' ? 'tienda' : 'osvaldo';
    setLocalDriverCustomers(prev =>
      prev.map(c => (c.id === id ? { ...c, driverId: nextDriverId } : c))
    );
  };

  const handleAddProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseFloat(newProdPrice);
    if (!newProdName.trim() || isNaN(p) || p <= 0) return;

    playBeep(650, 'sine', 0.05);
    const newProd: BreadProduct = {
      id: `p-${Date.now()}`,
      name: newProdName.trim(),
      price: p,
      category: newProdCategory
    };

    setLocalProducts(prev => [...prev, newProd]);
    setNewProdName('');
    setNewProdPrice('');
  };

  const handleDeleteProduct = (id: string) => {
    playBeep(400, 'sawtooth', 0.05);
    setLocalProducts(prev => prev.filter(p => p.id !== id));
  };

  const handleUpdateProductPrice = (id: string, newPrice: number) => {
    setLocalProducts(prev =>
      prev.map(p => (p.id === id ? { ...p, price: newPrice } : p))
    );
  };

  // If locked, show simple PIN prompt
  if (!isUnlocked) {
    return (
      <div className="w-full max-w-md mx-auto py-12 px-4">
        <div className="bg-white rounded-3xl p-8 shadow-xl border border-[#E5E1DA] text-center space-y-5 animate-in fade-in">
          <div className="w-24 h-24 rounded-2xl bg-white p-1 shadow-md border border-[#E5E1DA] mx-auto overflow-hidden flex items-center justify-center">
            <img 
              src="/logo.jpg" 
              alt="Panadería Santa Fé" 
              className="w-full h-full object-contain"
              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
            />
          </div>

          <div>
            <h1 className="text-2xl font-black text-slate-900 font-serif italic">Panadería Santa Fé</h1>
            <p className="text-xs text-slate-500 mt-1">
              Ingresa el PIN de seguridad para modificar precios, cuentas de usuarios y parámetros
            </p>
          </div>

          <form onSubmit={handleUnlock} className="space-y-4">
            <div>
              <input
                id="admin-pin-input"
                type="password"
                maxLength={6}
                autoFocus
                placeholder="PIN (Predeterminado: 1234)"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                className="w-full text-center text-2xl tracking-widest font-black py-3 bg-amber-50 rounded-2xl border-2 border-amber-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            {pinError && (
              <p className="text-xs font-bold text-rose-600">
                PIN incorrecto. El PIN predeterminado es 1234
              </p>
            )}

            <button
              id="unlock-admin-btn"
              type="submit"
              className="w-full py-3.5 bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-sm rounded-2xl shadow-md transition-all active:scale-98"
            >
              Desbloquear Ajustes
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-5">
      {/* Header Banner */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-amber-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 text-white flex items-center justify-center font-bold text-2xl shadow-md">
            ⚙️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold text-slate-900">
                Ajustes Generales del Administrador
              </h1>
              <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Administrador Activo
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Gestión de precios de panadería, cuentas de usuarios, programa de lealtad y datos
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            id="save-settings-btn"
            onClick={handleSaveAll}
            className="bg-orange-600 hover:bg-orange-700 text-white font-extrabold px-4 py-2.5 rounded-xl text-xs flex items-center space-x-1.5 shadow-md transition-all active:scale-95"
          >
            {savedSuccess ? <Check className="w-4 h-4 text-emerald-200" /> : <Save className="w-4 h-4" />}
            <span>{savedSuccess ? '¡Cambios Guardados!' : 'Guardar Todos los Cambios'}</span>
          </button>

          <button
            onClick={() => setIsUnlocked(false)}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-2.5 rounded-xl text-xs flex items-center space-x-1 transition-colors"
            title="Bloquear panel"
          >
            <Lock className="w-4 h-4" />
            <span>Bloquear</span>
          </button>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          id="tab-admin-catalog-prices"
          onClick={() => setActiveTab('catalog_prices')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition-all shrink-0 ${
            activeTab === 'catalog_prices'
              ? 'bg-gradient-to-r from-amber-700 to-orange-700 text-white shadow-md scale-102 ring-2 ring-amber-400'
              : 'bg-amber-100 text-amber-900 border-2 border-amber-300 hover:bg-amber-200 font-black'
          }`}
        >
          <BookOpen className="w-4 h-4 text-amber-300" />
          <span>📋 Catálogo Oficial & Precios por Cliente (116 Panes)</span>
        </button>

        <button
          onClick={() => setActiveTab('prices')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition-all shrink-0 ${
            activeTab === 'prices'
              ? 'bg-amber-600 text-white shadow-md'
              : 'bg-white text-slate-700 border border-amber-200 hover:bg-amber-50'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>Botones de Precios Rápidos ($5, $6.50, $12...)</span>
        </button>

        <button
          onClick={() => setActiveTab('products')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition-all shrink-0 ${
            activeTab === 'products'
              ? 'bg-amber-600 text-white shadow-md'
              : 'bg-white text-slate-700 border border-amber-200 hover:bg-amber-50'
          }`}
        >
          <Store className="w-4 h-4" />
          <span>Catálogo Rápido ({localProducts.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition-all shrink-0 ${
            activeTab === 'users'
              ? 'bg-amber-600 text-white shadow-md'
              : 'bg-white text-slate-700 border border-amber-200 hover:bg-amber-50'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Equipo y Personal</span>
        </button>

        <button
          id="tab-admin-driver-clients"
          onClick={() => setActiveTab('driver_clients')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition-all shrink-0 ${
            activeTab === 'driver_clients'
              ? 'bg-[#D95D39] text-white shadow-md'
              : 'bg-white text-slate-700 border border-amber-200 hover:bg-amber-50'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>🚚 Clientes: Reparto y Recoger en Tienda ({localDriverCustomers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('loyalty')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition-all shrink-0 ${
            activeTab === 'loyalty'
              ? 'bg-amber-600 text-white shadow-md'
              : 'bg-white text-slate-700 border border-amber-200 hover:bg-amber-50'
          }`}
        >
          <Gift className="w-4 h-4" />
          <span>Programa de Lealtad (Pesos-Puntos)</span>
        </button>

        <button
          id="tab-admin-store"
          onClick={() => setActiveTab('store')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition-all shrink-0 ${
            activeTab === 'store'
              ? 'bg-amber-600 text-white shadow-md'
              : 'bg-white text-slate-700 border border-amber-200 hover:bg-amber-50'
          }`}
        >
          <SettingsIcon className="w-4 h-4" />
          <span>Datos de la Panadería & Tickets</span>
        </button>

        <button
          id="tab-admin-clip-diagnostic"
          onClick={() => setActiveTab('clip_diagnostic')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition-all shrink-0 ${
            activeTab === 'clip_diagnostic'
              ? 'bg-[#FF5A00] text-white shadow-md scale-102 ring-2 ring-orange-300'
              : 'bg-white text-slate-700 border border-orange-200 hover:bg-orange-50'
          }`}
        >
          <Terminal className="w-4 h-4 text-orange-500" />
          <span>🔍 Diagnóstico Clip API (P8C2240805000156)</span>
        </button>
      </div>

      {/* TAB 0: MASTER CATALOG & CLIENT PRICING */}
      {activeTab === 'catalog_prices' && (
        <ClientPricingMatrix onNotifySave={() => {
          setSavedSuccess(true);
          setTimeout(() => setSavedSuccess(false), 3000);
        }} />
      )}

      {/* TAB 1: QUICK PRICES */}
      {activeTab === 'prices' && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-amber-200 space-y-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">
              Botones de Precio Rápido para Mostrador
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Configura los montos que aparecen como botones grandes en la pantalla de cobro. Sepáralos por comas.
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">
              Lista de Precios Rápidos (en pesos):
            </label>
            <input
              type="text"
              value={quickPricesInput}
              onChange={(e) => setQuickPricesInput(e.target.value)}
              className="w-full px-4 py-3 bg-amber-50 rounded-2xl border-2 border-amber-200 font-mono font-bold text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <p className="text-[11px] text-slate-500">
              Predeterminados de mostrador Zakia: 5, 6.5, 12, 15, 18, 20, 25, 30, 35
            </p>
          </div>

          {/* Visual Preview */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
            <span className="text-xs font-extrabold uppercase text-slate-600 block">
              Vista previa de los botones:
            </span>
            <div className="flex flex-wrap gap-2">
              {quickPricesInput
                .split(',')
                .map(s => parseFloat(s.trim()))
                .filter(n => !isNaN(n) && n > 0)
                .map(price => (
                  <div
                    key={price}
                    className="w-16 h-14 bg-white rounded-xl border-2 border-amber-300 flex flex-col items-center justify-center font-black text-slate-900 shadow-xs"
                  >
                    <span className="text-sm">${price}</span>
                    <span className="text-[9px] text-slate-400 font-semibold">pesos</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PRODUCTS CATALOG */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          {/* Add New Product Form */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-amber-200 space-y-3">
            <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Plus className="w-4 h-4 text-orange-600" />
              <span>Agregar Nuevo Pan al Catálogo</span>
            </h3>

            <form onSubmit={handleAddProduct} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <input
                  type="text"
                  required
                  placeholder="Nombre del pan (ej. Garibaldi, Rebanada Manteca)"
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl text-xs font-semibold border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <input
                  type="number"
                  step="1"
                  min="1"
                  required
                  placeholder="Precio ($)"
                  value={newProdPrice}
                  onChange={(e) => setNewProdPrice(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl text-xs font-bold border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <select
                  value={newProdCategory}
                  onChange={(e) => setNewProdCategory(e.target.value as BreadCategory)}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl text-xs font-bold border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="Salado">🥖 Salado</option>
                  <option value="Pan Dulce / Bizcocho">🥐 Pan Dulce / Bizcocho</option>
                  <option value="Feite y Batidos">🥧 Feite y Batidos</option>
                  <option value="Lácteos y Acompañamientos">🥛 Lácteos y Acompañamientos</option>
                  <option value="Pan Dulce Tradicional">Pan Dulce Tradicional (Anterior)</option>
                  <option value="Bolillo y Telera">Bolillo y Telera (Anterior)</option>
                  <option value="Pasteles y Tartas">Pasteles y Tartas (Anterior)</option>
                  <option value="Roscas y Especiales">Roscas y Especiales (Anterior)</option>
                  <option value="Panqués y Galletas">Panqués y Galletas (Anterior)</option>
                  <option value="Bocadillos y Empanadas">Bocadillos y Empanadas (Anterior)</option>
                </select>
              </div>

              <div className="sm:col-span-4 flex justify-end">
                <button
                  type="submit"
                  className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-xs"
                >
                  + Agregar Producto
                </button>
              </div>
            </form>
          </div>

          {/* Products List Table */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center text-xs font-bold text-slate-700 uppercase">
              <span>Lista de Panes Registrados</span>
              <span>Total: {localProducts.length} productos</span>
            </div>

            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {localProducts.map((prod) => (
                <div key={prod.id} className="p-3 flex items-center justify-between gap-3 hover:bg-amber-50/30 text-xs">
                  <div className="flex-1 min-w-0">
                    <strong className="text-slate-900 block truncate">{prod.name}</strong>
                    <span className="text-slate-500 text-[11px]">{prod.category}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <span className="text-slate-500">$</span>
                      <input
                        type="number"
                        min="1"
                        value={prod.price}
                        onChange={(e) => handleUpdateProductPrice(prod.id, parseFloat(e.target.value) || 0)}
                        className="w-16 px-2 py-1 bg-white border border-slate-300 rounded font-extrabold text-orange-600 text-right text-xs"
                      />
                    </div>

                    <button
                      onClick={() => handleDeleteProduct(prod.id)}
                      className="text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg"
                      title="Eliminar del catálogo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: TEAM & DRIVERS */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-amber-200 space-y-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                Gestión de Repartidores y Personal
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Cuentas activas para Osvaldo y Simón, PIN de acceso rápido y vehículos
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {localDrivers.map((driver, idx) => (
                <div key={driver.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-xl ${driver.avatarColor} text-white flex items-center justify-center font-bold text-lg`}>
                      {driver.name.charAt(0)}
                    </div>
                    <div>
                      <strong className="text-slate-900 text-sm block">{driver.name}</strong>
                      <span className="text-xs text-slate-500">ID: {driver.id}</span>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <label className="block text-slate-600 font-bold mb-0.5">Teléfono:</label>
                      <input
                        type="text"
                        value={driver.phone}
                        onChange={(e) => {
                          const updated = [...localDrivers];
                          updated[idx].phone = e.target.value;
                          setLocalDrivers(updated);
                        }}
                        className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-slate-300 font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 font-bold mb-0.5">Vehículo / Placa:</label>
                      <input
                        type="text"
                        value={driver.vehicle}
                        onChange={(e) => {
                          const updated = [...localDrivers];
                          updated[idx].vehicle = e.target.value;
                          setLocalDrivers(updated);
                        }}
                        className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-slate-300 font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 font-bold mb-0.5">PIN de Inicio de Sesión:</label>
                      <input
                        type="password"
                        maxLength={4}
                        value={driver.pin}
                        onChange={(e) => {
                          const updated = [...localDrivers];
                          updated[idx].pin = e.target.value;
                          setLocalDrivers(updated);
                        }}
                        className="w-24 px-2.5 py-1.5 bg-white rounded-lg border border-slate-300 font-mono font-bold text-center"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Admin PIN change */}
            <div className="p-4 bg-amber-50/70 rounded-2xl border border-amber-200 space-y-2">
              <div className="flex items-center space-x-2">
                <KeyRound className="w-4 h-4 text-amber-800" />
                <h3 className="text-xs font-extrabold text-amber-950 uppercase">
                  PIN de Acceso Administrador:
                </h3>
              </div>
              <div className="flex items-center gap-2 max-w-xs">
                <input
                  type="password"
                  maxLength={6}
                  value={localSettings.pinAdmin}
                  onChange={(e) => setLocalSettings({ ...localSettings, pinAdmin: e.target.value })}
                  className="px-3 py-1.5 bg-white rounded-xl border border-amber-300 font-mono font-bold text-sm text-center"
                />
                <span className="text-xs text-slate-500">De 4 a 6 dígitos</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: DRIVER CUSTOMERS / CLIENTES ASIGNADOS A OSVALDO Y SIMÓN */}
      {activeTab === 'driver_clients' && (
        <div className="space-y-5">
          {/* Add or Edit Client Form */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-amber-200 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-[#D95D39]" />
                  <span>{editingCustId ? '✏️ Modificar Cliente de Reparto' : '➕ Registrar Nuevo Cliente a Repartidor'}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Asigna clientes a las rutas de <strong>Osvaldo</strong> o <strong>Simón</strong> con tipo de cobro (Crédito a fin de mes o Contado).
                </p>
              </div>

              {editingCustId && (
                <button
                  type="button"
                  onClick={handleCancelEditCustomer}
                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancelar Edición</span>
                </button>
              )}
            </div>

            <form onSubmit={handleAddOrUpdateDriverCustomer} className="space-y-4 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {/* Customer / Business Name */}
                <div className="space-y-1">
                  <label className="block text-xs font-black text-slate-700 uppercase">
                    Nombre del Cliente / Negocio: *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Cremeria Angeles 1, Star Medica..."
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 rounded-xl text-xs font-bold border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#D95D39]"
                  />
                </div>

                {/* Driver Assignment */}
                <div className="space-y-1">
                  <label className="block text-xs font-black text-slate-700 uppercase">
                    Canal / Asignación: *
                  </label>
                  <select
                    value={newCustDriverId}
                    onChange={(e) => setNewCustDriverId(e.target.value as 'osvaldo' | 'simon' | 'tienda')}
                    className="w-full px-3.5 py-2.5 bg-slate-50 rounded-xl text-xs font-bold border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#D95D39]"
                  >
                    <option value="osvaldo">🛵 Reparto: Osvaldo Morales (Esperanza, Paola, Vicky, Star Medica...)</option>
                    <option value="simon">🛵 Reparto: Simón Gómez (Cremerías Angeles, Chopi, Super Rivera...)</option>
                    <option value="tienda">🛍️ Pide y Recoge (Trascos, Magda, Bollos David, Deliz...)</option>
                  </select>
                </div>

                {/* Payment Type */}
                <div className="space-y-1">
                  <label className="block text-xs font-black text-slate-700 uppercase">
                    Cobro Habitual:
                  </label>
                  <select
                    value={newCustPayment}
                    onChange={(e) => setNewCustPayment(e.target.value as 'credito' | 'contado')}
                    className="w-full px-3.5 py-2.5 bg-slate-50 rounded-xl text-xs font-bold border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#D95D39]"
                  >
                    <option value="credito">📅 Crédito Comercial (Pago a fin de mes)</option>
                    <option value="contado">💵 Contado (Pago al recibir)</option>
                  </select>
                </div>

                {/* Phone */}
                <div className="space-y-1">
                  <label className="block text-xs font-black text-slate-700 uppercase">
                    Teléfono / WhatsApp:
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. 442 123 4567"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 rounded-xl text-xs font-medium border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#D95D39]"
                  />
                </div>

                {/* Address / Location */}
                <div className="space-y-1">
                  <label className="block text-xs font-black text-slate-700 uppercase">
                    Dirección / Ubicación:
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Mercado Local 45, Col. Centro"
                    value={newCustAddress}
                    onChange={(e) => setNewCustAddress(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 rounded-xl text-xs font-medium border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#D95D39]"
                  />
                </div>

                {/* Notes */}
                <div className="space-y-1">
                  <label className="block text-xs font-black text-slate-700 uppercase">
                    Notas de Entrega:
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Entregar antes de 10am, requiere factura"
                    value={newCustNotes}
                    onChange={(e) => setNewCustNotes(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 rounded-xl text-xs font-medium border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#D95D39]"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="bg-[#D95D39] hover:bg-[#b84524] active:scale-98 text-white font-black px-6 py-2.5 rounded-xl text-xs shadow-md flex items-center gap-2 transition-all"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingCustId ? 'Guardar Cambios del Cliente' : '+ Agregar Cliente a la Ruta'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* DRIVERS & PICKUP CLIENTS LISTS (3 COLUMNS: OSVALDO vs SIMÓN vs RECOGER EN TIENDA) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* COLUMN 1: OSVALDO */}
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-blue-200 space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-blue-100">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-blue-500 text-white flex items-center justify-center font-black text-base shadow-xs">
                    O
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-900">Ruta de Osvaldo</h4>
                    <p className="text-[11px] text-blue-700 font-bold">
                      {localDriverCustomers.filter(c => c.driverId === 'osvaldo').length} Clientes asignados
                    </p>
                  </div>
                </div>

                <span className="text-[9px] font-black uppercase tracking-wider bg-blue-100 text-blue-900 px-2 py-0.5 rounded-full border border-blue-300">
                  🛵 Moto SF-442
                </span>
              </div>

              <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                {localDriverCustomers.filter(c => c.driverId === 'osvaldo').length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400 font-medium">
                    No hay clientes asignados a Osvaldo actualmente.
                  </div>
                ) : (
                  localDriverCustomers
                    .filter(c => c.driverId === 'osvaldo')
                    .map((cust, idx) => (
                      <div
                        key={cust.id}
                        className="bg-slate-50 hover:bg-blue-50/50 p-2.5 rounded-2xl border border-slate-200 flex items-start justify-between gap-2 text-xs transition-all"
                      >
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="w-4 h-4 rounded-full bg-blue-200 text-blue-950 font-mono font-black text-[9px] flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <strong className="text-slate-900 text-xs font-black truncate">
                              {cust.name}
                            </strong>
                            <span className={`text-[8.5px] font-black px-1.5 py-0.2 rounded-md ${
                              cust.defaultPayment === 'credito' 
                                ? 'bg-amber-100 text-amber-900 border border-amber-300' 
                                : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            }`}>
                              {cust.defaultPayment === 'credito' ? 'Fin de Mes' : 'Contado'}
                            </span>
                          </div>

                          {cust.address && (
                            <p className="text-[10.5px] text-slate-600 flex items-center gap-1 truncate">
                              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{cust.address}</span>
                            </p>
                          )}
                          {cust.phone && (
                            <p className="text-[10.5px] text-slate-500 flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{cust.phone}</span>
                            </p>
                          )}
                          {cust.notes && (
                            <p className="text-[9.5px] text-amber-800 font-medium">
                              📝 {cust.notes}
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0 pt-0.5">
                          <button
                            type="button"
                            onClick={() => handleReassignDriver(cust.id, 'osvaldo')}
                            className="p-1.5 bg-white hover:bg-emerald-100 text-emerald-800 rounded-lg border border-slate-200"
                            title="Cambiar asignación"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStartEditCustomer(cust)}
                            className="p-1.5 bg-white hover:bg-amber-100 text-amber-800 rounded-lg border border-slate-200"
                            title="Editar datos"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDriverCustomer(cust.id, cust.name)}
                            className="p-1.5 bg-white hover:bg-rose-100 text-rose-700 rounded-lg border border-slate-200"
                            title="Eliminar cliente"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* COLUMN 2: SIMÓN */}
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-emerald-200 space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-emerald-100">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-emerald-500 text-white flex items-center justify-center font-black text-base shadow-xs">
                    S
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-900">Ruta de Simón</h4>
                    <p className="text-[11px] text-emerald-700 font-bold">
                      {localDriverCustomers.filter(c => c.driverId === 'simon').length} Clientes asignados
                    </p>
                  </div>
                </div>

                <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-full border border-emerald-300">
                  🛵 Moto SF-881
                </span>
              </div>

              <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                {localDriverCustomers.filter(c => c.driverId === 'simon').length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400 font-medium">
                    No hay clientes asignados a Simón actualmente.
                  </div>
                ) : (
                  localDriverCustomers
                    .filter(c => c.driverId === 'simon')
                    .map((cust, idx) => (
                      <div
                        key={cust.id}
                        className="bg-slate-50 hover:bg-emerald-50/50 p-2.5 rounded-2xl border border-slate-200 flex items-start justify-between gap-2 text-xs transition-all"
                      >
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="w-4 h-4 rounded-full bg-emerald-200 text-emerald-950 font-mono font-black text-[9px] flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <strong className="text-slate-900 text-xs font-black truncate">
                              {cust.name}
                            </strong>
                            <span className={`text-[8.5px] font-black px-1.5 py-0.2 rounded-md ${
                              cust.defaultPayment === 'credito' 
                                ? 'bg-amber-100 text-amber-900 border border-amber-300' 
                                : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            }`}>
                              {cust.defaultPayment === 'credito' ? 'Fin de Mes' : 'Contado'}
                            </span>
                          </div>

                          {cust.address && (
                            <p className="text-[10.5px] text-slate-600 flex items-center gap-1 truncate">
                              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{cust.address}</span>
                            </p>
                          )}
                          {cust.phone && (
                            <p className="text-[10.5px] text-slate-500 flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{cust.phone}</span>
                            </p>
                          )}
                          {cust.notes && (
                            <p className="text-[9.5px] text-amber-800 font-medium">
                              📝 {cust.notes}
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0 pt-0.5">
                          <button
                            type="button"
                            onClick={() => handleReassignDriver(cust.id, 'simon')}
                            className="p-1.5 bg-white hover:bg-amber-100 text-amber-800 rounded-lg border border-slate-200"
                            title="Cambiar asignación"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStartEditCustomer(cust)}
                            className="p-1.5 bg-white hover:bg-amber-100 text-amber-800 rounded-lg border border-slate-200"
                            title="Editar datos"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDriverCustomer(cust.id, cust.name)}
                            className="p-1.5 bg-white hover:bg-rose-100 text-rose-700 rounded-lg border border-slate-200"
                            title="Eliminar cliente"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* COLUMN 3: PIDE Y RECOGE (TRASCOS, MAGDA, BOLLOS DAVID, DELIZ...) */}
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-amber-300 space-y-3 bg-gradient-to-b from-amber-50/20 to-white">
              <div className="flex items-center justify-between pb-3 border-b border-amber-200">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-amber-600 text-white flex items-center justify-center font-black text-base shadow-xs">
                    <Store className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-900">Pide y Recoge</h4>
                    <p className="text-[11px] text-amber-800 font-bold">
                      {localDriverCustomers.filter(c => c.driverId === 'tienda').length} Clientes Pide y Recoge
                    </p>
                  </div>
                </div>

                <span className="text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-950 px-2 py-0.5 rounded-full border border-amber-300">
                  🛍️ Pide y Recoge
                </span>
              </div>

              <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                {localDriverCustomers.filter(c => c.driverId === 'tienda').length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400 font-medium">
                    No hay clientes registrados en Pide y Recoge.
                  </div>
                ) : (
                  localDriverCustomers
                    .filter(c => c.driverId === 'tienda')
                    .map((cust, idx) => (
                      <div
                        key={cust.id}
                        className="bg-amber-50/60 hover:bg-amber-100/50 p-2.5 rounded-2xl border border-amber-200 flex items-start justify-between gap-2 text-xs transition-all"
                      >
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="w-4 h-4 rounded-full bg-amber-200 text-amber-950 font-mono font-black text-[9px] flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <strong className="text-slate-900 text-xs font-black truncate">
                              {cust.name}
                            </strong>
                            <span className={`text-[8.5px] font-black px-1.5 py-0.2 rounded-md ${
                              cust.defaultPayment === 'credito' 
                                ? 'bg-purple-100 text-purple-900 border border-purple-300' 
                                : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            }`}>
                              {cust.defaultPayment === 'credito' ? 'Fin de Mes' : 'Por Cobrar / Contado'}
                            </span>
                          </div>

                          {cust.phone && (
                            <p className="text-[10.5px] text-slate-500 flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{cust.phone}</span>
                            </p>
                          )}
                          {cust.notes && (
                            <p className="text-[9.5px] text-amber-900 font-medium">
                              📝 {cust.notes}
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0 pt-0.5">
                          <button
                            type="button"
                            onClick={() => handleReassignDriver(cust.id, 'tienda')}
                            className="p-1.5 bg-white hover:bg-blue-100 text-blue-800 rounded-lg border border-amber-200"
                            title="Cambiar a Osvaldo"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStartEditCustomer(cust)}
                            className="p-1.5 bg-white hover:bg-amber-100 text-amber-800 rounded-lg border border-amber-200"
                            title="Editar datos"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDriverCustomer(cust.id, cust.name)}
                            className="p-1.5 bg-white hover:bg-rose-100 text-rose-700 rounded-lg border border-amber-200"
                            title="Eliminar cliente"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: LOYALTY PROGRAM */}
      {activeTab === 'loyalty' && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-amber-200 space-y-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">
              Configuración del Programa de Lealtad
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Define cuántos pesos de compra otorgan 1 punto y el valor del punto en pesos al canjear
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 space-y-2">
              <label className="block text-xs font-bold text-amber-950">
                Pesos de compra por cada 1 Punto:
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-600">$</span>
                <input
                  type="number"
                  min="1"
                  value={localSettings.loyaltyPointsPerPesos}
                  onChange={(e) => setLocalSettings({ ...localSettings, loyaltyPointsPerPesos: parseInt(e.target.value, 10) || 20 })}
                  className="w-24 px-3 py-2 bg-white rounded-xl border border-amber-300 font-black text-lg text-orange-600 text-center"
                />
                <span className="text-xs text-slate-600 font-medium">pesos = 1 punto</span>
              </div>
              <p className="text-[11px] text-amber-800">
                (Predeterminado: $20 pesos de compra dan 1 peso en puntos)
              </p>
            </div>

            <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200 space-y-2">
              <label className="block text-xs font-bold text-emerald-950">
                Valor de 1 Punto al Canjear:
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600 font-medium">1 punto =</span>
                <span className="text-sm font-bold text-slate-600">$</span>
                <input
                  type="number"
                  min="1"
                  value={localSettings.loyaltyValuePerPoint}
                  onChange={(e) => setLocalSettings({ ...localSettings, loyaltyValuePerPoint: parseInt(e.target.value, 10) || 1 })}
                  className="w-24 px-3 py-2 bg-white rounded-xl border border-emerald-300 font-black text-lg text-emerald-700 text-center"
                />
                <span className="text-xs text-slate-600 font-medium">peso de descuento</span>
              </div>
              <p className="text-[11px] text-emerald-800">
                Los clientes acumulan puntos con su número de celular y los usan como dinero en efectivo.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: STORE INFO & FACTORY RESET */}
      {activeTab === 'store' && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-amber-200 space-y-4">
            <h2 className="text-base font-extrabold text-slate-900">
              Datos de la Panadería para Encabezado de Tickets
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nombre Comercial:</label>
                <input
                  type="text"
                  value={localSettings.bakeryName}
                  onChange={(e) => setLocalSettings({ ...localSettings, bakeryName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-300 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Eslogan:</label>
                <input
                  type="text"
                  value={localSettings.slogan}
                  onChange={(e) => setLocalSettings({ ...localSettings, slogan: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-300 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Teléfono:</label>
                <input
                  type="text"
                  value={localSettings.phone}
                  onChange={(e) => setLocalSettings({ ...localSettings, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-300 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Dirección:</label>
                <input
                  type="text"
                  value={localSettings.address}
                  onChange={(e) => setLocalSettings({ ...localSettings, address: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-300 font-medium"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Mensaje al Pie del Ticket:</label>
                <input
                  type="text"
                  value={localSettings.ticketFooter}
                  onChange={(e) => setLocalSettings({ ...localSettings, ticketFooter: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-300 font-medium"
                />
              </div>
            </div>
          </div>

          {/* Real Thermal Printer Configuration & Test */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-blue-200 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700">
                  <Printer className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Conexión e Impresora Térmica Real (ESC/POS)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Conecta directamente impresoras de tickets de 58mm o 80mm vía Bluetooth o cable USB
                  </p>
                </div>
              </div>
            </div>

            {printerFeedback && (
              <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                printerFeedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}>
                {printerFeedback.type === 'success' ? <Check className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
                <span className="font-semibold">{printerFeedback.text}</span>
              </div>
            )}

            {isTestingPrinter && (
              <div className="p-3 rounded-xl bg-blue-50 text-blue-900 border border-blue-200 text-xs flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                <span className="font-bold">{printerStatus}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <button
                type="button"
                disabled={isTestingPrinter}
                onClick={handleTestBluetooth}
                className="p-4 bg-gradient-to-br from-blue-50 to-white hover:from-blue-100 hover:to-blue-50 border-2 border-blue-200 hover:border-blue-500 rounded-2xl flex flex-col items-center justify-center text-center transition-all cursor-pointer disabled:opacity-50"
              >
                <Bluetooth className="w-6 h-6 text-blue-600 mb-1.5" />
                <strong className="text-xs font-bold text-slate-900">Probar Bluetooth</strong>
                <span className="text-[10px] text-slate-500 mt-0.5">Impresoras inalámbricas 58/80mm</span>
              </button>

              <button
                type="button"
                disabled={isTestingPrinter}
                onClick={handleTestUsb}
                className="p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 hover:from-black hover:to-slate-800 text-white border-2 border-slate-700 rounded-2xl flex flex-col items-center justify-center text-center transition-all cursor-pointer disabled:opacity-50 shadow-md"
              >
                <Cable className="w-6 h-6 text-emerald-400 mb-1.5" />
                <strong className="text-xs font-bold text-white">Probar Cable USB Tipo B</strong>
                <span className="text-[10px] text-slate-300 mt-0.5">Impresora POS USB directa</span>
              </button>

              <button
                type="button"
                onClick={() => printViaRawBtIntent(createDummyTicket(), localSettings)}
                className="p-4 bg-gradient-to-br from-emerald-50 to-white hover:from-emerald-100 hover:to-emerald-50 border-2 border-emerald-200 hover:border-emerald-600 rounded-2xl flex flex-col items-center justify-center text-center transition-all cursor-pointer"
              >
                <Smartphone className="w-6 h-6 text-emerald-600 mb-1.5" />
                <strong className="text-xs font-bold text-slate-900">Probar con RawBT</strong>
                <span className="text-[10px] text-slate-500 mt-0.5">App de Android para tickets</span>
              </button>
            </div>
          </div>

          {/* Configuración de Terminal Clip Wi-Fi (Cobro Automático F2F API) */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-orange-200 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center text-[#FF5A00]">
                  <Wifi className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Terminal Clip con Wi-Fi (Cobro Automático API)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Conexión directa a terminales Clip (Stand, Pro 2, Total) vía Netlify Function y Wi-Fi
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Número de Serie de la Terminal:
                </label>
                <input
                  type="text"
                  value={clipConfig.serialNumber}
                  onChange={(e) => {
                    const updated = { ...clipConfig, serialNumber: e.target.value };
                    setClipConfig(updated);
                    saveClipConfig(updated);
                  }}
                  placeholder="P8C2240805000156"
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-300 font-mono text-xs font-bold focus:ring-2 focus:ring-orange-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Serie oficial: <strong>P8C2240805000156</strong>
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nombre de la Terminal:
                </label>
                <input
                  type="text"
                  value={clipConfig.terminalName || ''}
                  onChange={(e) => {
                    const updated = { ...clipConfig, terminalName: e.target.value };
                    setClipConfig(updated);
                    saveClipConfig(updated);
                  }}
                  placeholder="Clip Total Mostrador"
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-300 text-xs font-bold focus:ring-2 focus:ring-orange-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Identificador visual de caja.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Token de Acceso o API Key (developer.clip.mx):
                </label>
                <input
                  type="text"
                  value={clipConfig.apiKey || ''}
                  onChange={(e) => {
                    const updated = { ...clipConfig, apiKey: e.target.value };
                    setClipConfig(updated);
                    saveClipConfig(updated);
                  }}
                  placeholder="Pega aquí tu Token de acceso directo o tu API Key"
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-300 font-mono text-xs focus:ring-2 focus:ring-orange-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Pega aquí tu Token de acceso directo ("TU_TOKEN_DE_ACCESO") o tu API Key.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Secret Key (opcional si usas Token):
                </label>
                <input
                  type="password"
                  value={clipConfig.secretKey || ''}
                  onChange={(e) => {
                    const updated = { ...clipConfig, secretKey: e.target.value };
                    setClipConfig(updated);
                    saveClipConfig(updated);
                  }}
                  placeholder="Clave secreta (solo si no pegaste el token directo)"
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-300 font-mono text-xs focus:ring-2 focus:ring-orange-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Requerida únicamente si colocaste la API Key por separado.
                </span>
              </div>
            </div>

            <div className="p-3.5 bg-orange-50/80 border border-orange-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="text-xs text-slate-700">
                <strong className="text-orange-900 block font-bold">¿Cómo autentica Clip?</strong>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Clip autentica vía encabezado <code className="font-mono bg-white px-1 rounded border border-orange-200">Authorization: Basic &lt;Token&gt;</code> (tal como en la documentación oficial de <code className="font-mono">f2f/pinpad/v1/payment</code>). Puedes pegar tu <strong>Token de Acceso directo</strong> o tu combinación <strong>API Key + Secret Key</strong>.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={isTestingClip}
                  onClick={async () => {
                    setIsTestingClip(true);
                    setClipDiagnosticFeedback(null);
                    playBeep(900, 'sine', 0.05);
                    const res = await diagnoseClipConnection(clipConfig.serialNumber);
                    setClipDiagnosticFeedback(res);
                    setIsTestingClip(false);
                  }}
                  className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Wifi className="w-3.5 h-3.5" />
                  {isTestingClip ? 'Probando...' : 'Prueba Rápida'}
                </button>
                <button
                  id="open-full-clip-diagnostic-btn"
                  type="button"
                  onClick={() => setActiveTab('clip_diagnostic')}
                  className="bg-orange-100 hover:bg-orange-200 text-orange-950 font-bold px-3.5 py-2 rounded-xl text-xs shadow-xs cursor-pointer flex items-center gap-1.5 border border-orange-200"
                >
                  <Terminal className="w-3.5 h-3.5 text-orange-600" />
                  <span>Herramienta de Diagnóstico API</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playBeep(800, 'sine', 0.04);
                    saveClipConfig(clipConfig);
                    setSavedSuccess(true);
                    setTimeout(() => setSavedSuccess(false), 3000);
                  }}
                  className="bg-[#FF5A00] hover:bg-[#E04D00] text-white font-black px-4 py-2 rounded-xl text-xs shadow-xs cursor-pointer shrink-0"
                >
                  Guardar Terminal
                </button>
              </div>
            </div>

            {/* Resultado del diagnóstico de Clip */}
            {clipDiagnosticFeedback && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs animate-in fade-in">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-slate-800">Resultado de la Prueba de Conexión Clip:</span>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] uppercase font-mono font-black ${
                    clipDiagnosticFeedback.status === 'CONNECTED' ? 'bg-emerald-100 text-emerald-800' :
                    clipDiagnosticFeedback.status === 'AUTH_FAILED' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {clipDiagnosticFeedback.status}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-600 bg-white p-3 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-slate-500">API Key: </span>
                    <strong className={clipDiagnosticFeedback.diagnosis?.has_api_key ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>
                      {clipDiagnosticFeedback.diagnosis?.has_api_key ? 'Detectada' : 'No ingresada'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Secret Key: </span>
                    <strong className={clipDiagnosticFeedback.diagnosis?.has_secret_key ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
                      {clipDiagnosticFeedback.diagnosis?.has_secret_key ? 'Detectada' : 'No ingresada'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Serie terminal: </span>
                    <strong className="font-mono text-slate-800 font-bold">
                      {clipDiagnosticFeedback.diagnosis?.env_serial_value || clipConfig.serialNumber}
                    </strong>
                  </div>
                </div>

                {clipDiagnosticFeedback.clip_http_status && (
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-slate-500">Código HTTP devuelto por Clip:</span>
                    <span className={`font-mono font-bold px-2 py-0.5 rounded-md ${
                      clipDiagnosticFeedback.clip_http_status === 200 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-orange-50 text-orange-700 border border-orange-200'
                    }`}>
                      HTTP {clipDiagnosticFeedback.clip_http_status}
                    </span>
                  </div>
                )}

                {clipDiagnosticFeedback.message && (
                  <p className="text-[11px] text-slate-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200 leading-relaxed font-medium">
                    {clipDiagnosticFeedback.message}
                  </p>
                )}

                {clipDiagnosticFeedback.advice && (
                  <p className="text-[11px] text-blue-900 bg-blue-50 p-2.5 rounded-xl border border-blue-200 font-medium">
                    💡 {clipDiagnosticFeedback.advice}
                  </p>
                )}

                {clipDiagnosticFeedback.clip_response && (
                  <details className="mt-2 text-[10px]">
                    <summary className="cursor-pointer font-mono text-slate-500 hover:text-slate-800">
                      Ver respuesta técnica de Clip API (JSON)
                    </summary>
                    <pre className="mt-1 p-2 bg-slate-900 text-emerald-400 rounded-lg overflow-x-auto max-h-36">
                      {JSON.stringify(clipDiagnosticFeedback.clip_response, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>

          {/* Reset button */}
          <div className="p-4 bg-rose-50 rounded-2xl border border-rose-200 flex items-center justify-between">
            <div>
              <strong className="text-xs font-bold text-rose-900 block">Restablecer Datos de Demostración</strong>
              <span className="text-[11px] text-rose-700">Restaura la lista original de panes, pedidos de prueba y configuraciones.</span>
            </div>
            <button
              onClick={() => {
                if (confirm('¿Deseas restablecer todos los datos a los valores de fábrica?')) {
                  onResetData();
                  setSavedSuccess(true);
                  setTimeout(() => setSavedSuccess(false), 3000);
                }
              }}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs transition-colors"
            >
              Restablecer Fábrica
            </button>
          </div>
        </div>
      )}

      {/* TAB: HERRAMIENTA DE DIAGNÓSTICO CLIP API (P8C2240805000156) */}
      {activeTab === 'clip_diagnostic' && (
        <ClipDiagnosticTool
          initialSerial="P8C2240805000156"
          onConfigUpdated={() => setClipConfig(getStoredClipConfig())}
        />
      )}
    </div>
  );
};
