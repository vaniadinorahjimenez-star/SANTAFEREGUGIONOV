import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Truck, 
  Printer, 
  Check, 
  User, 
  Phone, 
  FileText, 
  Sparkles,
  AlertCircle,
  Search,
  CheckCheck
} from 'lucide-react';
import { TicketItem, Customer, DriverCustomer } from '../../types';
import { playBeep, playCashSound } from '../../utils/audio';

interface UnpaidOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticketItems: TicketItem[];
  totalAmount: number;
  totalPieces: number;
  selectedCustomer: Customer | null;
  customers?: Customer[];
  driverCustomers?: DriverCustomer[];
  onConfirm: (data: {
    customerName: string;
    customerPhone: string;
    notes: string;
    shouldPrint: boolean;
  }) => void;
}

export const UnpaidOrderModal: React.FC<UnpaidOrderModalProps> = ({
  isOpen,
  onClose,
  ticketItems,
  totalAmount,
  totalPieces,
  selectedCustomer,
  customers = [],
  driverCustomers = [],
  onConfirm
}) => {
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [shouldPrint, setShouldPrint] = useState<boolean>(true);
  const [customTotalInput, setCustomTotalInput] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(true);

  // Auto-llenar si ya había cliente seleccionado en mostrador al abrir
  useEffect(() => {
    if (isOpen) {
      setValidationError(null);
      if (selectedCustomer) {
        setCustomerName(selectedCustomer.name);
        setCustomerPhone(selectedCustomer.phone);
      } else {
        setCustomerName('');
        setCustomerPhone('');
      }
      setNotes('');
      setShouldPrint(true);
      setShowSuggestions(true);
      setCustomTotalInput(totalAmount > 0 ? totalAmount.toString() : '');
    }
  }, [isOpen, selectedCustomer, totalAmount]);

  // Lista maestra de homologación de nombres de clientes
  const masterHomologationList = useMemo(() => {
    const list: { name: string; phone?: string; icon?: string; tag?: string }[] = [
      { name: 'Barra Verde', icon: '🥗', tag: 'Negocio' },
      { name: 'Burger Fuentes', icon: '🍔', tag: 'Hamburguesas' },
      { name: 'Barba', icon: '👨', tag: 'Cliente' },
      { name: 'Barba Jr', icon: '👦', tag: 'Cliente' },
      { name: 'Barbacoa', icon: '🍖', tag: 'Negocio' },
      { name: 'Tarascos', icon: '🌮', tag: 'Taquería' },
      { name: 'Trascos', icon: '🌮', tag: 'Taquería' },
      { name: 'Magda', icon: '👩', tag: 'Cliente Frecuente' },
      { name: 'Bollos David', icon: '🥯', tag: 'Cliente' },
      { name: 'Deliz', icon: '✨', tag: 'Pastelería / Cliente' },
      { name: 'Venta Mostrador', icon: '🏪', tag: 'Mostrador' }
    ];

    // Combinar con clientes frecuentes de mostrador
    customers.forEach(c => {
      if (!list.some(item => item.name.trim().toLowerCase() === c.name.trim().toLowerCase())) {
        list.push({
          name: c.name,
          phone: c.phone,
          icon: '⭐',
          tag: `${c.points || 0} pts`
        });
      }
    });

    // Combinar con clientes de repartidores
    driverCustomers.forEach(dc => {
      if (!list.some(item => item.name.trim().toLowerCase() === dc.name.trim().toLowerCase())) {
        list.push({
          name: dc.name,
          phone: dc.phone,
          icon: '🛵',
          tag: dc.businessName || 'Reparto'
        });
      }
    });

    return list;
  }, [customers, driverCustomers]);

  // Sugerencias filtradas cuando escriben (ej. "ba..", "bar..", "tr..", etc.)
  const matchingSuggestions = useMemo(() => {
    const query = customerName.trim().toLowerCase();
    if (!query) return [];
    return masterHomologationList.filter(item => 
      item.name.toLowerCase().includes(query)
    ).slice(0, 8);
  }, [customerName, masterHomologationList]);

  if (!isOpen) return null;

  // Botones de acceso rápido principales
  const quickOptions = [
    { label: 'Barra Verde', icon: '🥗', colorClass: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-950 border-emerald-400 ring-2 ring-emerald-400/30' },
    { label: 'Burger Fuentes', icon: '🍔', colorClass: 'bg-amber-50 hover:bg-amber-100 text-amber-950 border-amber-400 ring-2 ring-amber-400/30' },
    { label: 'Barba', icon: '👨', colorClass: 'bg-sky-50 hover:bg-sky-100 text-sky-950 border-sky-400' },
    { label: 'Barba Jr', icon: '👦', colorClass: 'bg-indigo-50 hover:bg-indigo-100 text-indigo-950 border-indigo-400' },
    { label: 'Tarascos', icon: '🌮', colorClass: 'bg-orange-50 hover:bg-orange-100 text-orange-950 border-orange-400' },
    { label: 'Magda', icon: '👩', colorClass: 'bg-purple-50 hover:bg-purple-100 text-purple-950 border-purple-400' },
    { label: 'Bollos David', icon: '🥯', colorClass: 'bg-slate-50 hover:bg-slate-100 text-slate-900 border-slate-300' },
    { label: 'Deliz', icon: '✨', colorClass: 'bg-slate-50 hover:bg-slate-100 text-slate-900 border-slate-300' }
  ];

  const handleSelectClient = (name: string, phone?: string) => {
    playBeep(700, 'sine', 0.04);
    setCustomerName(name);
    if (phone) {
      setCustomerPhone(phone);
    }
    setShowSuggestions(false);
  };

  const effectiveTotal = totalAmount > 0 
    ? totalAmount 
    : (parseFloat(customTotalInput) || 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    const trimmed = customerName.trim();
    if (!trimmed) {
      playBeep(400, 'sawtooth', 0.08);
      setValidationError('Por favor escribe o selecciona el nombre del cliente');
      return;
    }

    if (ticketItems.length === 0 && effectiveTotal <= 0) {
      playBeep(400, 'sawtooth', 0.08);
      setValidationError('El pedido debe tener al menos un producto o un importe total');
      return;
    }

    playCashSound();
    onConfirm({
      customerName: trimmed,
      customerPhone: customerPhone.trim(),
      notes: notes.trim(),
      shouldPrint
    });
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="bg-white text-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border-2 border-amber-400 overflow-hidden my-auto animate-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera / Barra Superior Verde/Ámbar distintiva: PEDIDO REPARTO */}
        <div className="bg-gradient-to-r from-emerald-600 via-teal-700 to-[#2D3142] text-white px-4 py-3 flex items-center justify-between shadow-xs shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-xs flex items-center justify-center border border-white/25 shadow-2xs">
              <Truck className="w-5 h-5 text-amber-300 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-black text-sm sm:text-base leading-tight">
                  Pedido Reparto
                </h3>
                <span className="bg-amber-400 text-amber-950 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Doble Ticket
                </span>
              </div>
              <p className="text-[11px] text-emerald-100 font-medium">
                Folio asignado • 1 copia para Repartidor + 1 copia para Mostrador
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              playBeep(450, 'sine', 0.03);
              onClose();
            }}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-white flex items-center justify-center cursor-pointer transition-colors"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3.5 overflow-y-auto flex-1">
          {validationError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold">
              ⚠️ {validationError}
            </div>
          )}
          
          {/* Tarjeta de Resumen del Mostrador */}
          <div className="bg-gradient-to-r from-amber-50/80 to-orange-50/80 border border-amber-300 rounded-xl p-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black text-amber-900 uppercase tracking-wider block">
                  Resumen de Pan Marcado para Reparto
                </span>
                <span className="text-xs font-bold text-slate-700">
                  {ticketItems.length > 0 ? (
                    <span>{totalPieces} piezas en el ticket</span>
                  ) : (
                    <span className="text-amber-800 font-semibold">Sin piezas previas marcadas</span>
                  )}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Total a cobrar
                </span>
                <span className="text-2xl font-black font-mono text-[#D95D39] leading-none">
                  ${effectiveTotal.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Desglose rápido si hay piezas */}
            {ticketItems.length > 0 ? (
              <div className="mt-2 pt-2 border-t border-amber-200/80 max-h-24 overflow-y-auto space-y-1">
                {ticketItems.map((it) => (
                  <div key={it.id} className="flex justify-between items-center text-[11px] text-slate-700 font-medium">
                    <span className="truncate pr-2">
                      <strong className="font-mono text-slate-900">{it.quantity}×</strong> {it.name}
                    </span>
                    <span className="font-mono font-bold text-slate-900 shrink-0">
                      ${it.total.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 pt-2 border-t border-amber-200/80 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-xs text-amber-900 font-bold">Importe Total: $</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder="Monto $"
                    value={customTotalInput}
                    onChange={(e) => setCustomTotalInput(e.target.value)}
                    className="w-28 bg-white border border-amber-400 rounded-lg px-2 py-1 text-sm font-mono font-black text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#D95D39]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Campo: Nombre del Cliente con HOMOLOGACIÓN AUTOMÁTICA */}
          <div className="space-y-1 relative">
            <label className="block text-xs font-black uppercase tracking-wider text-slate-800 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-emerald-700" />
                <span>Cliente o Negocio <span className="text-rose-600">*</span></span>
              </span>
              {customerName && (
                <button
                  type="button"
                  onClick={() => {
                    playBeep(450, 'sine', 0.02);
                    setCustomerName('');
                    setShowSuggestions(true);
                  }}
                  className="text-[10px] text-slate-500 hover:text-rose-600 font-bold cursor-pointer"
                >
                  Limpiar
                </button>
              )}
            </label>

            <div className="relative">
              <input
                type="text"
                autoFocus
                required
                placeholder="Escribe cliente (ej: ba.. para Barra Verde, Barba...)"
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                className="w-full bg-white border-2 border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none transition-all shadow-2xs"
              />
              {customerName ? (
                <button
                  type="button"
                  onClick={() => {
                    setCustomerName('');
                    setShowSuggestions(true);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold cursor-pointer"
                >
                  ✕
                </button>
              ) : (
                <Search className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              )}
            </div>

            {/* CAJA DE HOMOLOGACIÓN EN TIEMPO REAL: Aparece cuando escriben 'ba..' */}
            {showSuggestions && matchingSuggestions.length > 0 && (
              <div className="bg-emerald-50 border-2 border-emerald-400 rounded-xl p-2.5 shadow-lg space-y-1.5 animate-in fade-in slide-in-from-top-1">
                <div className="flex items-center justify-between text-[11px] font-black text-emerald-950 uppercase tracking-wide">
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    <span>Homologar nombre con un toque:</span>
                  </span>
                  <span className="text-[10px] text-emerald-700 font-bold">
                    {matchingSuggestions.length} coincidencias
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-1.5">
                  {matchingSuggestions.map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => handleSelectClient(item.name, item.phone)}
                      className="bg-white hover:bg-emerald-100 border border-emerald-300 hover:border-emerald-500 rounded-lg p-2 text-left transition-all active:scale-95 shadow-2xs flex items-center justify-between gap-1.5 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="font-black text-xs text-slate-900 truncate flex items-center gap-1">
                          <span>{item.icon || '📍'}</span>
                          <span className="underline decoration-emerald-500 underline-offset-2">
                            {item.name}
                          </span>
                        </div>
                        {item.tag && (
                          <span className="text-[10px] text-emerald-700 font-semibold block leading-tight">
                            {item.tag}
                          </span>
                        )}
                      </div>
                      <CheckCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Opciones Rápidas Más Usadas (Un solo toque) */}
          <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wide text-slate-700 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>Clientes Frecuentes / Homologados:</span>
              </span>
              <span className="text-[10px] text-slate-500 font-medium">Toca para seleccionar</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-0.5">
              {quickOptions.map((opt) => {
                const isSelected = customerName.trim().toLowerCase() === opt.label.toLowerCase();
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => handleSelectClient(opt.label)}
                    className={`px-2 py-1.5 rounded-xl border text-left font-black text-xs transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-2xs ${opt.colorClass} ${
                      isSelected ? 'ring-2 ring-slate-900 shadow-xs scale-[1.02]' : ''
                    }`}
                  >
                    <span className="text-base leading-none shrink-0">{opt.icon}</span>
                    <span className="truncate leading-tight text-[11px]">{opt.label}</span>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 ml-auto text-emerald-700 stroke-[3] shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fila: Teléfono y Notas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-700 flex items-center gap-1">
                <Phone className="w-3 h-3 text-slate-500" />
                <span>Teléfono para acumular puntos (Opcional):</span>
              </label>
              <input
                type="tel"
                placeholder="10 dígitos..."
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="w-full bg-white border border-slate-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-200 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 placeholder:text-slate-400 outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-700 flex items-center gap-1">
                <FileText className="w-3 h-3 text-slate-500" />
                <span>Notas o Detalle de Reparto (Opcional):</span>
              </label>
              <input
                type="text"
                placeholder="Ej. Entregar en la esquina, cobrar en efectivo..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-white border border-slate-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-900 placeholder:text-slate-400 outline-none"
              />
            </div>
          </div>

          {/* Opción de Impresión Térmica: Doble Ticket */}
          <div 
            className="bg-amber-50/80 border-2 border-amber-300 rounded-xl p-2.5 flex items-center justify-between cursor-pointer" 
            onClick={() => setShouldPrint(!shouldPrint)}
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-400 text-amber-950 flex items-center justify-center shrink-0">
                <Printer className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-black text-slate-900 block leading-tight">
                  Imprimir Doble Ticket Térmico Automático
                </span>
                <span className="text-[10.5px] text-amber-900 font-semibold block leading-tight">
                  1 Copia para Repartidor + 1 Copia para Mostrador/Caja con Folio
                </span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={shouldPrint}
              onChange={(e) => setShouldPrint(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
              className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
            />
          </div>

          {/* Botones de Acción */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => {
                playBeep(450, 'sine', 0.03);
                onClose();
              }}
              className="py-2.5 px-3 rounded-xl border border-slate-300 hover:bg-slate-100 active:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm cursor-pointer transition-colors text-center"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={!customerName.trim()}
              className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xs sm:text-sm shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer border border-emerald-600"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Guardar Pedido Reparto</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
