import React, { useEffect, useState } from 'react';
import { Sparkles, Printer, Check, X, Clock, User, Phone, ShoppingBag, CheckCircle2, AlertCircle } from 'lucide-react';
import { BakeryOrder, Settings } from '../types';
import { playCelebrationFanfare, playCashSound } from '../utils/audio';
import { printOrderTicketDirectToPrinter } from '../utils/thermalPrinter';

interface SmilingCheeseCubileteCelebrationProps {
  order: BakeryOrder;
  settings: Settings;
  onPrintTicket?: () => void;
  onClose: () => void;
}

export const SmilingCheeseCubileteCelebration: React.FC<SmilingCheeseCubileteCelebrationProps> = ({
  order,
  settings,
  onPrintTicket,
  onClose
}) => {
  const [isWinking, setIsWinking] = useState(false);
  const [printed, setPrinted] = useState(false);

  useEffect(() => {
    playCelebrationFanfare();

    // Fun wink animation timer
    const interval = setInterval(() => {
      setIsWinking(prev => !prev);
    }, 1800);

    return () => clearInterval(interval);
  }, []);

  const handlePrint = () => {
    playCashSound();
    setPrinted(true);
    if (onPrintTicket) {
      onPrintTicket();
    } else {
      printOrderTicketDirectToPrinter(order, settings);
    }
  };

  const totalPieces = order.items.reduce((acc, it) => acc + it.quantity, 0);

  return (
    <div 
      id="smiling-cubilete-modal-overlay"
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-3xl p-5 sm:p-7 shadow-2xl max-w-md w-full border-4 border-amber-300 relative text-center my-auto animate-in zoom-in-95 duration-300 flex flex-col items-center">
        
        {/* Close Button */}
        <button
          id="close-cubilete-modal-btn"
          type="button"
          onClick={onClose}
          className="absolute top-3.5 right-3.5 w-8 h-8 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-900 flex items-center justify-center transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Floating Sparkles & Badges */}
        <div className="flex items-center gap-1.5 bg-amber-100 text-amber-900 px-3.5 py-1 rounded-full text-xs font-black mb-2 border border-amber-300 shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-amber-600 animate-spin" />
          <span>¡PEDIDO GENERADO CON ÉXITO!</span>
          <Sparkles className="w-3.5 h-3.5 text-amber-600 animate-spin" />
        </div>

        {/* ANIMATED SMILING CUBILETE DE QUESO SVG */}
        <div className="relative my-2 select-none">
          {/* Ambient Glow */}
          <div className="absolute inset-0 bg-amber-300/30 rounded-full blur-xl scale-110 animate-pulse"></div>

          {/* SVG Artwork of the Smiling Mexican Cheese Cubilete */}
          <svg 
            className="w-36 h-36 sm:w-44 sm:h-44 relative z-10 transition-transform duration-300 hover:scale-105"
            viewBox="0 0 200 200" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Soft Shadow */}
            <ellipse cx="100" cy="180" rx="65" ry="12" fill="#D4AF37" opacity="0.25" />

            {/* Tart Shell / Capacillo Base (Pastry crust) */}
            <path 
              d="M48 95 L60 168 C61 174 68 178 76 178 L124 178 C132 178 139 174 140 168 L152 95 Z" 
              fill="url(#crustGradient)" 
              stroke="#A7601B" 
              strokeWidth="3.5" 
              strokeLinejoin="round"
            />

            {/* Fluted ridges on the crust (Estriado artesanal del cubilete) */}
            <path d="M68 98 L76 176" stroke="#B87326" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
            <path d="M84 99 L89 177" stroke="#B87326" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
            <path d="M100 100 L100 178" stroke="#B87326" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
            <path d="M116 99 L111 177" stroke="#B87326" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
            <path d="M132 98 L124 176" stroke="#B87326" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />

            {/* Golden Baked Cheese Top (Relleno cremoso de queso esponjosito) */}
            <path 
              d="M42 96 C42 65 65 42 100 42 C135 42 158 65 158 96 C158 104 150 108 140 106 C128 104 115 106 100 106 C85 106 72 104 60 106 C50 108 42 104 42 96 Z" 
              fill="url(#cheeseFillingGradient)" 
              stroke="#D97706" 
              strokeWidth="3.5"
            />

            {/* Baked Golden Crust Spots (Toque tostado de queso horneado tradicional) */}
            <ellipse cx="78" cy="62" rx="14" ry="7" fill="#C2781E" opacity="0.45" />
            <ellipse cx="122" cy="60" rx="16" ry="8" fill="#C2781E" opacity="0.45" />
            <ellipse cx="100" cy="52" rx="18" ry="6" fill="#C2781E" opacity="0.35" />
            <ellipse cx="98" cy="72" rx="10" ry="4" fill="#D97706" opacity="0.3" />

            {/* Powdered Sugar Dusting Particles (Chispitas de azúcar glas) */}
            <circle cx="62" cy="78" r="2" fill="#FFFFFF" opacity="0.9" />
            <circle cx="85" cy="55" r="1.5" fill="#FFFFFF" opacity="0.9" />
            <circle cx="112" cy="53" r="2" fill="#FFFFFF" opacity="0.9" />
            <circle cx="138" cy="76" r="1.8" fill="#FFFFFF" opacity="0.9" />
            <circle cx="100" cy="46" r="1.5" fill="#FFFFFF" opacity="0.9" />

            {/* Rosy Cheeks (Mejillas sonrosadas tiernas) */}
            <ellipse cx="66" cy="90" rx="7" ry="4.5" fill="#F43F5E" opacity="0.5" />
            <ellipse cx="134" cy="90" rx="7" ry="4.5" fill="#F43F5E" opacity="0.5" />

            {/* Happy Eyes (Ojos animados con parpadeo) */}
            {isWinking ? (
              <>
                {/* Left Winking Eye (Arch) */}
                <path d="M72 82 Q80 74 88 82" stroke="#451A03" strokeWidth="3.5" strokeLinecap="round" fill="none" />
                {/* Right Big Open Eye */}
                <circle cx="120" cy="80" r="6" fill="#451A03" />
                <circle cx="122" cy="78" r="2.2" fill="#FFFFFF" />
                <circle cx="118" cy="82" r="1" fill="#FFFFFF" />
              </>
            ) : (
              <>
                {/* Left Eye */}
                <circle cx="80" cy="80" r="6" fill="#451A03" />
                <circle cx="82" cy="78" r="2.2" fill="#FFFFFF" />
                <circle cx="78" cy="82" r="1" fill="#FFFFFF" />

                {/* Right Eye */}
                <circle cx="120" cy="80" r="6" fill="#451A03" />
                <circle cx="122" cy="78" r="2.2" fill="#FFFFFF" />
                <circle cx="118" cy="82" r="1" fill="#FFFFFF" />
              </>
            )}

            {/* Cute Happy Smile (Sonrisa radiante con lengüita) */}
            <path 
              d="M90 88 Q100 102 110 88" 
              stroke="#451A03" 
              strokeWidth="3.5" 
              strokeLinecap="round" 
              fill="#BE123C" 
            />
            <path 
              d="M95 93 Q100 99 105 93" 
              fill="#FB7185" 
            />

            {/* Gradients */}
            <defs>
              <linearGradient id="crustGradient" x1="100" y1="95" x2="100" y2="178" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#EAB308" />
                <stop offset="50%" stopColor="#D97706" />
                <stop offset="100%" stopColor="#92400E" />
              </linearGradient>
              <linearGradient id="cheeseFillingGradient" x1="100" y1="42" x2="100" y2="106" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#FEF08A" />
                <stop offset="60%" stopColor="#FDE047" />
                <stop offset="100%" stopColor="#F59E0B" />
              </linearGradient>
            </defs>
          </svg>

          {/* Little Floating Chef Hat / Heart */}
          <div className="absolute -top-1 right-2 text-2xl animate-bounce">
            💖
          </div>
          <div className="absolute -bottom-1 left-2 text-xl animate-bounce" style={{ animationDelay: '0.3s' }}>
            🧀
          </div>
        </div>

        {/* Order Details Banner */}
        <div className="w-full bg-amber-50/80 border border-amber-200 rounded-2xl p-3.5 space-y-2 mt-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-amber-950 uppercase tracking-wider">
              Folio: <strong className="text-amber-700 font-black">{order.folio}</strong>
            </span>
            {order.paymentStatus === 'pagado' ? (
              <span className="bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                <CheckCircle2 className="w-3 h-3" />
                PAGADO
              </span>
            ) : (
              <span className="bg-amber-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                <AlertCircle className="w-3 h-3" />
                POR COBRAR
              </span>
            )}
          </div>

          <div className="text-left space-y-1 text-xs">
            <div className="flex items-center gap-1.5 font-extrabold text-slate-800">
              <User className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <span className="truncate">{order.customerName}</span>
            </div>
            {order.customerPhone && (
              <div className="flex items-center gap-1.5 font-bold text-slate-600">
                <Phone className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <span>{order.customerPhone}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 font-bold text-slate-600">
              <ShoppingBag className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <span>{totalPieces} piezas de pan para recoger en tienda</span>
            </div>
          </div>

          {/* Amount Box */}
          <div className="pt-2 border-t border-amber-200 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">Total del Pedido:</span>
            <span className="text-xl font-black text-slate-900">${order.total}.00</span>
          </div>
        </div>

        {/* Action Buttons: Imprimir Ticket & Listo */}
        <div className="grid grid-cols-2 gap-2.5 w-full mt-4">
          <button
            id="cubilete-print-ticket-btn"
            type="button"
            onClick={handlePrint}
            className={`py-3 px-3 rounded-2xl font-black text-xs flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-98 cursor-pointer ${
              printed 
                ? 'bg-emerald-600 text-white border-2 border-emerald-500' 
                : 'bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 text-white border border-purple-500 hover:shadow-lg'
            }`}
          >
            <Printer className="w-4 h-4" />
            <span>{printed ? '✓ Reimprimir Ticket' : 'Imprimir Ticket'}</span>
          </button>

          <button
            id="cubilete-done-btn"
            type="button"
            onClick={onClose}
            className="py-3 px-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-2xl font-black text-xs shadow-md hover:shadow-lg transition-all active:scale-98 flex items-center justify-center gap-1.5 cursor-pointer border border-amber-400"
          >
            <Check className="w-4 h-4" />
            <span>Listo / Cerrar</span>
          </button>
        </div>
      </div>
    </div>
  );
};
