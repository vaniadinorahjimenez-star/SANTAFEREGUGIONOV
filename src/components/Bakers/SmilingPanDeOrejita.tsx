import React, { useState, useEffect } from 'react';
import { Sparkles, CheckCircle2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SmilingPanDeOrejitaProps {
  show: boolean;
  breadName: string;
  quantity: number;
  unit: string;
  itemType?: 'Normal' | 'Mini';
  progressPercentage: number;
  completedPieces: number;
  totalPieces: number;
  onClose: () => void;
}

export const SmilingPanDeOrejita: React.FC<SmilingPanDeOrejitaProps> = ({
  show,
  breadName,
  quantity,
  unit,
  itemType,
  progressPercentage,
  completedPieces,
  totalPieces,
  onClose
}) => {
  const [isWinking, setIsWinking] = useState(false);

  useEffect(() => {
    if (!show) return;
    const timer = setInterval(() => {
      setIsWinking(prev => !prev);
    }, 1200);
    return () => clearInterval(timer);
  }, [show]);

  if (!show) return null;

  return (
    <AnimatePresence>
      <div 
        id="smiling-orejita-modal"
        className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.85, opacity: 0, y: 20 }}
          transition={{ type: "spring", stiffness: 350, damping: 25 }}
          className="bg-white rounded-3xl p-5 sm:p-7 shadow-2xl max-w-md w-full border-4 border-amber-400 relative text-center my-auto flex flex-col items-center"
        >
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3.5 right-3.5 w-8 h-8 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-900 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Badge */}
          <div className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-1.5 rounded-full text-xs font-black mb-3 shadow-md">
            <Sparkles className="w-4 h-4 text-amber-200 animate-spin" />
            <span>¡TANDA HORNEADA Y LISTA!</span>
            <Sparkles className="w-4 h-4 text-amber-200 animate-spin" />
          </div>

          {/* SVG Artwork: Smiling Mexican Pan de Orejita */}
          <div className="relative my-2 select-none">
            {/* Ambient Warm Golden Glow */}
            <div className="absolute inset-0 bg-amber-400/30 rounded-full blur-xl scale-110 animate-pulse"></div>

            <svg
              className="w-36 h-36 sm:w-44 sm:h-44 relative z-10 transition-transform duration-300 hover:scale-105"
              viewBox="0 0 200 200"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                {/* Orejita Caramelized Golden Pastry Gradient */}
                <linearGradient id="orejaCrust" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FDE68A" />
                  <stop offset="30%" stopColor="#F59E0B" />
                  <stop offset="70%" stopColor="#D97706" />
                  <stop offset="100%" stopColor="#B45309" />
                </linearGradient>

                {/* Inner Caramel Spiral */}
                <linearGradient id="orejaInner" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#92400E" />
                  <stop offset="50%" stopColor="#D97706" />
                  <stop offset="100%" stopColor="#FBBF24" />
                </linearGradient>
              </defs>

              {/* Shadow */}
              <ellipse cx="100" cy="180" rx="65" ry="12" fill="#92400E" opacity="0.2" />

              {/* Left Palmier Heart Ear */}
              <path
                d="M100 160 C75 160 30 145 25 95 C20 50 65 35 90 60 C98 68 100 78 100 85 C100 78 102 68 110 60 C135 35 180 50 175 95 C170 145 125 160 100 160 Z"
                fill="url(#orejaCrust)"
                stroke="#78350F"
                strokeWidth="4"
                strokeLinejoin="round"
              />

              {/* Left Inner Swirl / Spirals of Puff Pastry */}
              <path
                d="M42 98 C40 68 68 54 82 72 C90 82 88 105 74 110 C62 114 55 102 60 92 C65 84 75 86 78 92"
                fill="none"
                stroke="url(#orejaInner)"
                strokeWidth="4.5"
                strokeLinecap="round"
              />

              {/* Right Inner Swirl / Spirals of Puff Pastry */}
              <path
                d="M158 98 C160 68 132 54 118 72 C110 82 112 105 126 110 C138 114 145 102 140 92 C135 84 125 86 122 92"
                fill="none"
                stroke="url(#orejaInner)"
                strokeWidth="4.5"
                strokeLinecap="round"
              />

              {/* Crunchy Sugar Grains (Azúcar Cristalizada) */}
              <circle cx="50" cy="65" r="2" fill="#FFFFFF" opacity="0.9" />
              <circle cx="70" cy="48" r="2.5" fill="#FFFFFF" opacity="0.9" />
              <circle cx="130" cy="48" r="2.5" fill="#FFFFFF" opacity="0.9" />
              <circle cx="150" cy="65" r="2" fill="#FFFFFF" opacity="0.9" />
              <circle cx="100" cy="148" r="2" fill="#FFFFFF" opacity="0.9" />
              <circle cx="40" cy="120" r="2" fill="#FFFFFF" opacity="0.9" />
              <circle cx="160" cy="120" r="2" fill="#FFFFFF" opacity="0.9" />
              <circle cx="90" cy="135" r="2" fill="#FFFFFF" opacity="0.9" />
              <circle cx="110" cy="135" r="2" fill="#FFFFFF" opacity="0.9" />

              {/* Cute Eyes */}
              {isWinking ? (
                // Winking Left Eye
                <path d="M78 126 Q85 120 92 126" stroke="#451A03" strokeWidth="4" strokeLinecap="round" fill="none" />
              ) : (
                // Happy Open Left Eye
                <g>
                  <circle cx="85" cy="126" r="6" fill="#451A03" />
                  <circle cx="83" cy="124" r="2" fill="#FFFFFF" />
                </g>
              )}

              {/* Happy Open Right Eye */}
              <g>
                <circle cx="115" cy="126" r="6" fill="#451A03" />
                <circle cx="113" cy="124" r="2" fill="#FFFFFF" />
              </g>

              {/* Rosy Cheeks */}
              <ellipse cx="72" cy="134" rx="6" ry="3.5" fill="#F43F5E" opacity="0.65" />
              <ellipse cx="128" cy="134" rx="6" ry="3.5" fill="#F43F5E" opacity="0.65" />

              {/* Big Joyful Smile */}
              <path
                d="M92 136 Q100 148 108 136"
                stroke="#451A03"
                strokeWidth="3.5"
                strokeLinecap="round"
                fill="#DC2626"
              />

              {/* Mini Chef Hat on Top Center */}
              <g transform="translate(85, 30) scale(0.65)">
                <path
                  d="M10 32 L36 32 L34 26 C38 24 42 16 38 10 C32 4 28 8 23 4 C18 0 10 4 8 10 C4 16 8 24 12 26 Z"
                  fill="#FFFFFF"
                  stroke="#CBD5E1"
                  strokeWidth="2"
                />
                <rect x="10" y="30" width="26" height="6" rx="2" fill="#E2E8F0" />
              </g>
            </svg>
          </div>

          {/* Bread details */}
          <div className="space-y-1 mb-4">
            <h3 className="text-xl font-black text-slate-900 leading-snug">
              {quantity} {unit} de {breadName}
            </h3>
            {itemType === 'Mini' && (
              <span className="inline-block bg-purple-100 text-purple-900 text-xs font-black px-2.5 py-0.5 rounded-full border border-purple-200">
                Tamaño Miniatura
              </span>
            )}
            <p className="text-xs font-bold text-slate-600">
              ¡Partida horneada y marcada como terminada!
            </p>
          </div>

          {/* Live Progress Bar Section inside the Modal */}
          <div className="w-full bg-amber-50 p-4 rounded-2xl border-2 border-amber-200 space-y-2 mb-4">
            <div className="flex items-center justify-between text-xs font-black text-slate-800">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Avance del Día:</span>
              </span>
              <span className="text-amber-950 font-black text-sm">
                {completedPieces} de {totalPieces} piezas ({progressPercentage}%)
              </span>
            </div>

            {/* Visual Bar */}
            <div className="w-full bg-slate-200 h-4 rounded-full overflow-hidden p-0.5 border border-slate-300">
              <motion.div
                className="h-full bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, Math.max(5, progressPercentage))}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>

            <p className="text-[11px] font-bold text-slate-500 text-right">
              {totalPieces - completedPieces > 0 
                ? `Faltan ${totalPieces - completedPieces} piezas por hornear`
                : '¡Todo el pan del día ha sido horneado! 🎉'
              }
            </p>
          </div>

          {/* Action Button */}
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-600 active:scale-98 text-white font-black text-sm rounded-2xl shadow-lg border border-amber-300 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <span>Continuar Horneando 👨‍🍳</span>
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
