import React, { useState } from 'react';
import { Customer, Settings } from '../../types';
import { 
  Gift, 
  Sparkles, 
  Search, 
  UserPlus, 
  Phone, 
  User, 
  Award, 
  MessageCircle, 
  Coins, 
  TrendingUp, 
  ShieldCheck, 
  CheckCircle2, 
  X,
  CreditCard,
  History,
  Calendar,
  Share2
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { playCelebrationFanfare, playBeep } from '../../utils/audio';
import { getTodayString } from '../../utils/storage';

interface LoyaltyManagerProps {
  customers: Customer[];
  settings: Settings;
  onRegisterCustomer: (customer: Customer) => void;
  onUpdateCustomer: (customer: Customer) => void;
}

export const LoyaltyManager: React.FC<LoyaltyManagerProps> = ({
  customers,
  settings,
  onRegisterCustomer,
  onUpdateCustomer
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  
  // Registration Form
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [initialBonusPoints, setInitialBonusPoints] = useState(10); // 10 pts welcome gift
  const [registerError, setRegisterError] = useState<string | null>(null);

  // Adjustment Modal
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustPoints, setAdjustPoints] = useState<string>('');
  const [adjustReason, setAdjustReason] = useState<string>('Bonificación por lealtad');

  // Simulator state
  const [simPurchaseAmount, setSimPurchaseAmount] = useState<number>(100);

  // Filter customers
  const filteredCustomers = customers.filter(c => {
    const q = searchQuery.toLowerCase().trim();
    return c.name.toLowerCase().includes(q) || c.phone.includes(q);
  });

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError(null);
    const cleanPhone = newPhone.replace(/\D/g, '').slice(0, 10);
    if (cleanPhone.length < 10) {
      setRegisterError('Por favor ingrese un teléfono válido de 10 dígitos.');
      return;
    }

    const existing = customers.find(c => c.phone.replace(/\D/g, '') === cleanPhone);
    if (existing) {
      setRegisterError(`Este número ya está registrado en el Club de Puntos: ${existing.phone}`);
      return;
    }

    const newCustomer: Customer = {
      id: `cust-${Date.now()}`,
      name: `Tel: ${cleanPhone}`,
      phone: cleanPhone,
      points: Math.max(0, initialBonusPoints),
      totalSpent: initialBonusPoints * 20, // initial benchmark
      visitsCount: 1,
      lastVisit: getTodayString()
    };

    onRegisterCustomer(newCustomer);
    setSelectedCustomer(newCustomer);
    setShowRegisterModal(false);
    setNewName('');
    setNewPhone('');
    playCelebrationFanfare();
    confetti({
      particleCount: 70,
      spread: 60,
      origin: { y: 0.6 }
    });
  };

  const handleAdjustPointsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    const pts = parseInt(adjustPoints, 10);
    if (isNaN(pts)) return;

    const newTotal = Math.max(0, selectedCustomer.points + pts);
    const updated: Customer = {
      ...selectedCustomer,
      points: newTotal
    };

    onUpdateCustomer(updated);
    setSelectedCustomer(updated);
    setShowAdjustModal(false);
    setAdjustPoints('');
    playBeep(850, 'sine', 0.1);
  };

  const handleSendWhatsAppBalance = (customer: Customer) => {
    const text = `🥖 *${settings.bakeryName}* 🥖\n` +
      `¡Hola *${customer.name}*!\n\n` +
      `Te compartimos tu estado de cuenta del *Programa Santa Fé Puntos* ⭐:\n\n` +
      `🪙 *PUNTOS DISPONIBLES: ${customer.points} PUNTOS*\n` +
      `💵 *Equivalente a: $${customer.points}.00 pesos de descuento directo* en tu próxima compra de pan.\n` +
      `🛍️ Visitas acumuladas: ${customer.visitsCount} veces\n\n` +
      `📌 *¿Cómo funciona?*\n` +
      `• Por cada $20 pesos de compra ganas 1 punto.\n` +
      `• 1 punto = $1 peso de descuento.\n\n` +
      `¡Te esperamos con pan calientito y recién horneado!\n` +
      `📍 ${settings.address}\n` +
      `📞 Tel: ${settings.phone}`;

    const clean = customer.phone.replace(/\D/g, '');
    const fullPhone = clean.length === 10 ? `52${clean}` : clean;
    window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(text)}`, '_blank');
  };

  const getTierInfo = (points: number) => {
    if (points >= 100) return { name: 'Cliente Platino VIP', color: 'bg-purple-100 text-purple-800 border-purple-300', emoji: '👑' };
    if (points >= 50) return { name: 'Cliente Fiel Oro', color: 'bg-amber-100 text-amber-900 border-amber-300', emoji: '🥇' };
    if (points >= 20) return { name: 'Amigo de Santa Fé', color: 'bg-emerald-100 text-emerald-800 border-emerald-300', emoji: '⭐' };
    return { name: 'Panadero Frecuente', color: 'bg-slate-100 text-slate-800 border-slate-300', emoji: '🥖' };
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-5">
      {/* Hero Banner with Official Logo */}
      <div className="bg-[#2D3142] text-white rounded-3xl p-5 md:p-7 shadow-xl border border-[#E5E1DA]/20 relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
          <div className="flex items-center space-x-4">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white p-1 shadow-lg border-2 border-white/40 shrink-0 overflow-hidden flex items-center justify-center">
              <img 
                src="/logo.jpg" 
                alt="Panadería Santa Fé Logo" 
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-[#D95D39] text-white font-serif italic text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-xs">
                  Club Santa Fé
                </span>
                <span className="text-xs text-[#FAF8F6]/80 font-medium">
                  {customers.length} Clientes Inscritos
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold font-serif italic mt-1 tracking-wide">
                Sistema de Puntos y Lealtad
              </h1>
              <p className="text-sm text-[#FAF8F6]/90 mt-1 max-w-xl">
                Por cada <strong>$20 pesos</strong> de compra, el cliente gana <strong>1 Punto</strong> ($1 peso de descuento directo en pan dulce, pasteles y encargos).
              </p>
            </div>
          </div>

          {/* Action to Register */}
          <button
            onClick={() => setShowRegisterModal(true)}
            className="w-full md:w-auto bg-[#D95D39] hover:bg-[#BF4C2A] text-white font-extrabold px-6 py-3.5 rounded-2xl shadow-lg shadow-[#D95D3944] flex items-center justify-center space-x-2.5 transition-all active:scale-95 text-sm shrink-0"
          >
            <UserPlus className="w-5 h-5" />
            <span>Registrar Nuevo Cliente</span>
          </button>
        </div>

        {/* 3 Value Pillars */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-5 border-t border-white/15 text-xs">
          <div className="bg-white/10 backdrop-blur-xs p-3 rounded-xl border border-white/10 flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-[#D95D39] text-white flex items-center justify-center font-bold text-base shrink-0">
              🪙
            </div>
            <div>
              <strong className="block font-bold text-[#FAF8F6]">1. Acumula Fácil</strong>
              <span className="text-[#FAF8F6]/80">$20 pesos gastados = 1 Punto</span>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-xs p-3 rounded-xl border border-white/10 flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-base shrink-0">
              💵
            </div>
            <div>
              <strong className="block font-bold text-[#FAF8F6]">2. Canjea en Dinero</strong>
              <span className="text-[#FAF8F6]/80">1 Punto = $1 peso de descuento</span>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-xs p-3 rounded-xl border border-white/10 flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold text-base shrink-0">
              📱
            </div>
            <div>
              <strong className="block font-bold text-[#FAF8F6]">3. Solo con su Celular</strong>
              <span className="text-[#FAF8F6]/80">10 dígitos sin tarjetas plásticas</span>
            </div>
          </div>
        </div>
      </div>

      {/* Simulator and Fast Search Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Column: Customer Search & List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl p-4 shadow-xs border border-[#E5E1DA] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <span>👥 Directorio de Clientes Frecuentes</span>
                <span className="text-xs bg-[#FFF5F0] text-[#D95D39] px-2 py-0.5 rounded-full font-bold border border-[#E5E1DA]">
                  {filteredCustomers.length} encontrados
                </span>
              </h2>

              {/* Search input */}
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por nombre o celular..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-[#FAF8F6] rounded-xl text-xs font-medium border border-[#E5E1DA] focus:outline-none focus:ring-2 focus:ring-[#D95D39] text-slate-800"
                />
              </div>
            </div>

            {/* List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[520px] overflow-y-auto pr-1">
              {filteredCustomers.length === 0 ? (
                <div className="col-span-full py-12 text-center text-slate-400">
                  <div className="w-14 h-14 rounded-full bg-[#FAF8F6] flex items-center justify-center mx-auto mb-2 text-2xl border border-[#E5E1DA]">
                    🔍
                  </div>
                  <p className="font-bold text-slate-700 text-sm">No se encontraron clientes</p>
                  <p className="text-xs text-slate-500 mt-1">Registra un nuevo cliente con el botón superior.</p>
                </div>
              ) : (
                filteredCustomers.map(customer => {
                  const tier = getTierInfo(customer.points);
                  const isSelected = selectedCustomer?.id === customer.id;

                  return (
                    <div
                      key={customer.id}
                      onClick={() => setSelectedCustomer(customer)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                        isSelected
                          ? 'border-[#D95D39] bg-[#FFF5F0] shadow-md ring-2 ring-[#D95D39]/30'
                          : 'border-[#E5E1DA] bg-white hover:border-slate-300 hover:shadow-xs'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border flex items-center gap-1 w-fit mb-1 ${tier.color}`}>
                            <span>{tier.emoji}</span>
                            <span>{tier.name}</span>
                          </span>
                          <h3 className="font-bold font-mono text-slate-900 text-sm leading-snug line-clamp-1 flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-[#D95D39]" />
                            <span>{customer.phone}</span>
                          </h3>
                        </div>

                        {/* Points badge */}
                        <div className="text-right shrink-0 bg-white p-2 rounded-xl border border-[#E5E1DA]">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block leading-none">
                            Puntos
                          </span>
                          <strong className="text-lg font-black text-[#D95D39] leading-tight block">
                            {customer.points}
                          </strong>
                          <span className="text-[10px] font-bold text-emerald-700 block">
                            ${customer.points}.00 pesos
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-[#E5E1DA] flex items-center justify-between text-[11px] text-slate-500">
                        <span>{customer.visitsCount} compras</span>
                        <span>Última: {customer.lastVisit || 'Hoy'}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Selected Customer Card & Points Simulator */}
        <div className="space-y-4">
          {/* Selected Customer Details / Digital Card */}
          {selectedCustomer ? (
            <div className="bg-white rounded-2xl p-5 shadow-xs border border-[#E5E1DA] space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">
                  Tarjeta Digital de Lealtad
                </span>
                <span className="text-xs bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 rounded-md border border-emerald-200">
                  Activa
                </span>
              </div>

              {/* Card visual */}
              <div className="bg-gradient-to-br from-[#2D3142] to-[#1F222E] text-white p-5 rounded-2xl shadow-lg border border-white/20 relative overflow-hidden space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <img 
                      src="/logo.jpg" 
                      alt="Logo" 
                      className="w-9 h-9 rounded-lg object-cover border border-white/40"
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                    <div>
                      <span className="font-serif italic font-bold text-sm block leading-none text-[#FAF8F6]">
                        Panadería Santa Fé
                      </span>
                      <span className="text-[10px] text-amber-300 font-medium">
                        Puntos de Lealtad
                      </span>
                    </div>
                  </div>
                  <Award className="w-6 h-6 text-amber-300" />
                </div>

                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-300 block">
                    Teléfono Celular Registrado
                  </span>
                  <h3 className="text-xl font-black font-mono text-amber-300 truncate">
                    📱 {selectedCustomer.phone}
                  </h3>
                </div>

                <div className="pt-2 border-t border-white/15 flex items-end justify-between">
                  <div>
                    <span className="text-[10px] text-slate-300 uppercase block">Saldo Disponible</span>
                    <span className="text-2xl font-black text-amber-300 leading-none">
                      {selectedCustomer.points} <span className="text-xs text-white">pts</span>
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-300 uppercase block">Descuento en Caja</span>
                    <span className="text-base font-extrabold text-emerald-300 leading-none">
                      ${selectedCustomer.points}.00 MXN
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => handleSendWhatsAppBalance(selectedCustomer)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center space-x-1.5 shadow-xs transition-transform active:scale-95"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Enviar por WhatsApp</span>
                </button>
                <button
                  onClick={() => setShowAdjustModal(true)}
                  className="bg-[#FAF8F6] hover:bg-[#FFF5F0] text-slate-800 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center space-x-1.5 border border-[#E5E1DA] transition-colors"
                >
                  <Coins className="w-4 h-4 text-[#D95D39]" />
                  <span>Bonificar Puntos</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-6 shadow-xs border border-[#E5E1DA] text-center text-slate-400 space-y-2">
              <Award className="w-12 h-12 text-[#D95D39] mx-auto opacity-70" />
              <h3 className="font-bold text-slate-800 text-sm">Selecciona un cliente</h3>
              <p className="text-xs text-slate-500">
                Haz clic en cualquier cliente de la lista para ver su tarjeta digital, enviar su saldo o bonificar puntos.
              </p>
            </div>
          )}

          {/* Interactive Calculator / Simulator */}
          <div className="bg-white rounded-2xl p-4 shadow-xs border border-[#E5E1DA] space-y-3">
            <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-[#D95D39]" />
              <span>Calculadora de Puntos</span>
            </h3>

            <div className="space-y-2 bg-[#FAF8F6] p-3 rounded-xl border border-[#E5E1DA]">
              <label className="text-[11px] font-bold text-slate-700 block">
                Si el cliente compra en mostrador:
              </label>
              <div className="flex items-center gap-2">
                <span className="text-base font-black text-slate-900">$</span>
                <input
                  type="number"
                  min="20"
                  step="10"
                  value={simPurchaseAmount}
                  onChange={(e) => setSimPurchaseAmount(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full bg-white px-3 py-1.5 rounded-lg border border-[#E5E1DA] text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#D95D39]"
                />
                <span className="text-xs font-bold text-slate-600 shrink-0">pesos</span>
              </div>

              <div className="pt-2 border-t border-[#E5E1DA] space-y-1 text-xs">
                <div className="flex justify-between font-bold">
                  <span className="text-slate-600">Puntos que acumula:</span>
                  <span className="text-[#D95D39]">+{Math.floor(simPurchaseAmount / 20)} Puntos</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span className="text-slate-600">Descuento para su próxima compra:</span>
                  <span className="text-emerald-700">${Math.floor(simPurchaseAmount / 20)}.00 pesos</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* REGISTRATION MODAL */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-[#E5E1DA] animate-in fade-in zoom-in-95">
            <div className="bg-[#2D3142] text-white p-5 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-[#D95D39] flex items-center justify-center text-xl">
                  🎁
                </div>
                <div>
                  <h3 className="font-extrabold text-base">Registrar Nuevo Cliente</h3>
                  <p className="text-xs text-[#FAF8F6]/80">Club de Puntos Santa Fé</p>
                </div>
              </div>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="text-[#FAF8F6]/80 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRegisterSubmit} className="p-5 space-y-4">
              {registerError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold">
                  ⚠️ {registerError}
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Número Celular (10 dígitos) *
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    placeholder="Ej. 4421234567"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, ''))}
                    className="w-full pl-9 pr-3 py-2.5 bg-[#FAF8F6] border border-[#E5E1DA] rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#D95D39] text-slate-900 font-mono"
                  />
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  El cliente acumulará o canjeará puntos dictando este número en cada compra.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Puntos de Bienvenida (Regalo inicial)
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setInitialBonusPoints(0)}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg border ${
                      initialBonusPoints === 0 ? 'bg-[#2D3142] text-white' : 'bg-[#FAF8F6] text-slate-700 border-[#E5E1DA]'
                    }`}
                  >
                    0 pts ($0)
                  </button>
                  <button
                    type="button"
                    onClick={() => setInitialBonusPoints(10)}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg border ${
                      initialBonusPoints === 10 ? 'bg-[#D95D39] text-white' : 'bg-[#FAF8F6] text-slate-700 border-[#E5E1DA]'
                    }`}
                  >
                    +10 pts ($10)
                  </button>
                  <button
                    type="button"
                    onClick={() => setInitialBonusPoints(20)}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg border ${
                      initialBonusPoints === 20 ? 'bg-[#D95D39] text-white' : 'bg-[#FAF8F6] text-slate-700 border-[#E5E1DA]'
                    }`}
                  >
                    +20 pts ($20)
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-[#E5E1DA] flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-[#E5E1DA] text-xs font-bold text-slate-700 hover:bg-[#FAF8F6]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#D95D39] hover:bg-[#BF4C2A] text-white text-xs font-extrabold shadow-md"
                >
                  Guardar e Inscribir
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADJUST POINTS MODAL */}
      {showAdjustModal && selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden border border-[#E5E1DA] animate-in fade-in zoom-in-95">
            <div className="bg-[#2D3142] text-white p-4 flex items-center justify-between">
              <h3 className="font-extrabold text-sm">Bonificar Puntos Manualmente</h3>
              <button onClick={() => setShowAdjustModal(false)} className="text-white/80 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAdjustPointsSubmit} className="p-4 space-y-3">
              <p className="text-xs text-slate-600">
                Cliente: <strong>{selectedCustomer.name}</strong> (Saldo actual: {selectedCustomer.points} pts)
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Puntos a Sumar (o restar con signo -)
                </label>
                <input
                  type="number"
                  required
                  placeholder="Ej. 15"
                  value={adjustPoints}
                  onChange={(e) => setAdjustPoints(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F6] border border-[#E5E1DA] rounded-xl text-sm font-black text-slate-900 focus:ring-2 focus:ring-[#D95D39]"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="flex-1 py-2 text-xs font-bold text-slate-700 bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 text-xs font-extrabold text-white bg-[#D95D39] rounded-xl shadow-xs"
                >
                  Aplicar Ajuste
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
