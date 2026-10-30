import React, { useEffect, useState } from 'react';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { playCelebrationFanfare } from '../utils/audio';

interface HeartBreadCelebrationProps {
  total: number;
  folio: string;
  piecesCount: number;
  customerName?: string;
  paymentMethod?: 'efectivo' | 'tarjeta';
  onClose: () => void;
}

type AnimationType = 'bounce' | 'wink' | 'wiggle' | 'glow';

interface DonutVariant {
  type: AnimationType;
  title: string;
  phrase: string;
  glazeColor: string;
  glazeStop: string;
  badgeBg: string;
}

const DONUT_VARIANTS: DonutVariant[] = [
  {
    type: 'bounce',
    title: '¡Venta Registrada con Éxito!',
    phrase: '¡Operación guardada en caja y en la nube!',
    glazeColor: '#F43F5E', // Strawberry pink
    glazeStop: '#BE123C',
    badgeBg: 'bg-rose-500'
  },
  {
    type: 'wink',
    title: '¡Cobro Registrado!',
    phrase: '¡Operación guardada en Firebase y en sistema!',
    glazeColor: '#FB7185', // Rose pink
    glazeStop: '#E11D48',
    badgeBg: 'bg-pink-500'
  },
  {
    type: 'wiggle',
    title: '¡Venta Exitosa!',
    phrase: '¡Dona calientita! Operación asegurada en el sistema.',
    glazeColor: '#EC4899', // Vibrant pink
    glazeStop: '#9D174D',
    badgeBg: 'bg-amber-500'
  },
  {
    type: 'glow',
    title: '¡Cobro Completado!',
    phrase: '¡Venta registrada sin problemas en mostrador y nube!',
    glazeColor: '#F43F5E',
    glazeStop: '#881337',
    badgeBg: 'bg-emerald-500'
  }
];

export const HeartBreadCelebration: React.FC<HeartBreadCelebrationProps> = ({
  total,
  folio,
  piecesCount,
  customerName,
  paymentMethod,
  onClose
}) => {
  const [variant] = useState<DonutVariant>(() => {
    const randomIndex = Math.floor(Math.random() * DONUT_VARIANTS.length);
    return DONUT_VARIANTS[randomIndex];
  });

  const [particles] = useState(() => {
    return Array.from({ length: 16 }).map((_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 260,
      y: (Math.random() - 0.5) * 220 - 30,
      size: Math.floor(Math.random() * 14) + 14,
      rotation: Math.floor(Math.random() * 360),
      emoji: ['🍩', '✨', '💖', '⭐', '🌟', '🍩', '🥐', '❤️'][Math.floor(Math.random() * 8)],
      delay: Math.random() * 0.3
    }));
  });

  useEffect(() => {
    playCelebrationFanfare();

    // Auto dismiss after 2.9 seconds
    const timer = setTimeout(() => {
      onClose();
    }, 2900);

    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      id="donut-celebration-modal-overlay"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 select-none cursor-pointer animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative bg-gradient-to-b from-amber-50 via-white to-pink-50 rounded-3xl p-6 sm:p-7 max-w-sm w-full shadow-2xl border-4 border-pink-300 text-center overflow-hidden animate-in zoom-in-90 duration-300"
      >
        {/* Floating Confetti / Sparkle Emojis */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {particles.map((p) => (
            <span
              key={p.id}
              className="absolute inline-block animate-ping opacity-80"
              style={{
                left: `calc(50% + ${p.x}px)`,
                top: `calc(50% + ${p.y}px)`,
                fontSize: `${p.size}px`,
                transform: `rotate(${p.rotation}deg)`,
                animationDuration: '1.8s',
                animationDelay: `${p.delay}s`
              }}
            >
              {p.emoji}
            </span>
          ))}
        </div>

        {/* Top Mini Badge */}
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-black text-white shadow-sm mb-2 bg-gradient-to-r from-pink-500 to-rose-600 animate-pulse">
          <Sparkles className="w-3.5 h-3.5" />
          <span>
            {paymentMethod === 'tarjeta'
              ? '💳 COBRO CON TARJETA REGISTRADO'
              : '🍩 VENTA REGISTRADA CON ÉXITO'}
          </span>
        </div>

        {/* Animated Smiling Donut Illustration */}
        <div className="relative mx-auto w-40 h-40 sm:w-44 sm:h-44 flex items-center justify-center my-1">
          {/* Subtle Warm Glow Behind Donut */}
          <div
            className={`absolute inset-0 rounded-full bg-pink-400/30 blur-xl ${
              variant.type === 'glow' ? 'animate-ping' : 'animate-pulse'
            }`}
            style={{ animationDuration: '1.8s' }}
          />

          {/* SVG Smiling Donut with Sprinkles & Happy Expression */}
          <svg
            viewBox="0 0 200 200"
            className={`w-full h-full drop-shadow-2xl ${
              variant.type === 'bounce'
                ? 'animate-bounce'
                : variant.type === 'wiggle'
                ? 'animate-spin-slow animate-wiggle'
                : variant.type === 'glow'
                ? 'animate-pulse scale-105'
                : 'animate-bob'
            }`}
            style={{
              animationDuration: variant.type === 'bounce' ? '0.85s' : variant.type === 'wiggle' ? '0.6s' : '1.4s',
              animationIterationCount: 'infinite'
            }}
          >
            <defs>
              {/* Golden Baked Donut Dough Gradient */}
              <radialGradient id="doughGradient" cx="45%" cy="40%" r="60%">
                <stop offset="0%" stopColor="#FDE68A" />
                <stop offset="50%" stopColor="#F59E0B" />
                <stop offset="85%" stopColor="#D97706" />
                <stop offset="100%" stopColor="#92400E" />
              </radialGradient>

              {/* Glossy Pink Glaze Gradient */}
              <linearGradient id="pinkGlaze" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FDA4AF" />
                <stop offset="40%" stopColor={variant.glazeColor} />
                <stop offset="100%" stopColor={variant.glazeStop} />
              </linearGradient>

              {/* Glaze Shine Specular Highlight */}
              <linearGradient id="glazeHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.1" />
              </linearGradient>

              {/* Drop Shadow filter */}
              <filter id="donutShadow" x="-15%" y="-15%" width="130%" height="130%">
                <feDropShadow dx="0" dy="8" stdDeviation="5" floodColor="#78350F" floodOpacity="0.35" />
              </filter>
            </defs>

            {/* 1. Base Baked Donut Ring (Outer & Inner circle) */}
            <path
              d="M 100 15 
                 A 85 85 0 1 1 99.9 15 Z 
                 M 100 70 
                 A 30 30 0 1 0 100.1 70 Z"
              fill="url(#doughGradient)"
              stroke="#78350F"
              strokeWidth="4"
              fillRule="evenodd"
              filter="url(#donutShadow)"
            />

            {/* 2. Delicious Glossy Frosting / Glaze with Dripping Edges */}
            <path
              d="M 100 20 
                 C 135 20, 168 36, 178 68 
                 C 183 82, 176 96, 174 110 
                 C 172 126, 180 138, 168 152 
                 C 156 166, 142 160, 130 168 
                 C 118 176, 110 180, 95 178 
                 C 78 176, 68 165, 54 165 
                 C 38 165, 26 148, 22 130 
                 C 18 112, 26 98, 22 80 
                 C 18 60, 38 32, 70 22 
                 C 80 18, 90 20, 100 20 Z 
                 M 100 68 
                 C 85 68, 72 80, 72 100 
                 C 72 118, 85 132, 100 132 
                 C 116 132, 128 118, 128 100 
                 C 128 80, 116 68, 100 68 Z"
              fill="url(#pinkGlaze)"
              stroke="#9F1239"
              strokeWidth="2.5"
              fillRule="evenodd"
            />

            {/* 3. Glossy Specular Glaze Reflection (Top left shine) */}
            <path
              d="M 52 38 C 72 26, 118 24, 148 40 C 132 32, 92 30, 60 44 Z"
              fill="url(#glazeHighlight)"
            />
            <ellipse cx="44" cy="62" rx="7" ry="14" transform="rotate(-30 44 62)" fill="url(#glazeHighlight)" />

            {/* 4. Colorful Crunchy Sprinkles (Chispitas de Colores) */}
            {/* White sprinkles */}
            <rect x="52" y="48" width="12" height="4" rx="2" transform="rotate(25 52 48)" fill="#FFFFFF" />
            <rect x="135" y="44" width="12" height="4" rx="2" transform="rotate(-35 135 44)" fill="#FFFFFF" />
            <rect x="156" y="112" width="12" height="4" rx="2" transform="rotate(40 156 112)" fill="#FFFFFF" />
            <rect x="36" y="118" width="11" height="4" rx="2" transform="rotate(-20 36 118)" fill="#FFFFFF" />

            {/* Yellow sprinkles */}
            <rect x="80" y="32" width="12" height="4" rx="2" transform="rotate(15 80 32)" fill="#FDE047" />
            <rect x="158" y="78" width="12" height="4" rx="2" transform="rotate(70 158 78)" fill="#FDE047" />
            <rect x="58" y="148" width="12" height="4" rx="2" transform="rotate(-45 58 148)" fill="#FDE047" />

            {/* Cyan/Blue sprinkles */}
            <rect x="115" y="34" width="12" height="4" rx="2" transform="rotate(-15 115 34)" fill="#38BDF8" />
            <rect x="32" y="85" width="12" height="4" rx="2" transform="rotate(60 32 85)" fill="#38BDF8" />
            <rect x="142" y="142" width="12" height="4" rx="2" transform="rotate(30 142 142)" fill="#38BDF8" />

            {/* Lime/Green sprinkles */}
            <rect x="38" y="58" width="11" height="4" rx="2" transform="rotate(80 38 58)" fill="#4ADE80" />
            <rect x="148" y="58" width="11" height="4" rx="2" transform="rotate(-60 148 58)" fill="#4ADE80" />
            <rect x="105" y="162" width="12" height="4" rx="2" transform="rotate(10 105 162)" fill="#4ADE80" />

            {/* Purple/Violet sprinkles */}
            <rect x="68" y="160" width="11" height="4" rx="2" transform="rotate(50 68 160)" fill="#C084FC" />
            <rect x="165" y="98" width="11" height="4" rx="2" transform="rotate(-10 165 98)" fill="#C084FC" />

            {/* Orange sprinkles */}
            <rect x="98" y="30" width="11" height="4" rx="2" transform="rotate(85 98 30)" fill="#FB923C" />
            <rect x="125" y="156" width="11" height="4" rx="2" transform="rotate(-30 125 156)" fill="#FB923C" />

            {/* 5. Rosy Cheeks (Chubby Blush) */}
            <ellipse cx="48" cy="104" rx="10" ry="6" fill="#FB7185" opacity="0.85" />
            <ellipse cx="152" cy="104" rx="10" ry="6" fill="#FB7185" opacity="0.85" />

            {/* 6. Big Cute Smiling Anime Face Expressions */}
            {variant.type === 'wink' ? (
              // Left Eye: Happy Wink Arc, Right Eye: Big Sparkly Eye
              <g>
                <path
                  d="M 52 92 Q 64 80 76 92"
                  fill="none"
                  stroke="#3E1F08"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <circle cx="132" cy="90" r="10" fill="#3E1F08" />
                <circle cx="135" cy="87" r="4" fill="#FFFFFF" />
                <circle cx="130" cy="93" r="2" fill="#FFFFFF" />
              </g>
            ) : variant.type === 'bounce' ? (
              // Two Joyful Happy Curved Closed Eyes (^_^)
              <g>
                <path
                  d="M 52 93 Q 65 78 78 93"
                  fill="none"
                  stroke="#3E1F08"
                  strokeWidth="5.5"
                  strokeLinecap="round"
                />
                <path
                  d="M 122 93 Q 135 78 148 93"
                  fill="none"
                  stroke="#3E1F08"
                  strokeWidth="5.5"
                  strokeLinecap="round"
                />
              </g>
            ) : (
              // Two Big Shiny Anime Star Eyes
              <g>
                <circle cx="65" cy="90" r="10" fill="#3E1F08" />
                <circle cx="68" cy="87" r="4" fill="#FFFFFF" />
                <circle cx="63" cy="93" r="2" fill="#FFFFFF" />

                <circle cx="135" cy="90" r="10" fill="#3E1F08" />
                <circle cx="138" cy="87" r="4" fill="#FFFFFF" />
                <circle cx="133" cy="93" r="2" fill="#FFFFFF" />
              </g>
            )}

            {/* 7. Big Sweet Smiling Open Mouth with Tongue */}
            <g>
              <path
                d="M 84 104 Q 100 130 116 104 Z"
                fill="#881337"
                stroke="#3E1F08"
                strokeWidth="3.5"
                strokeLinejoin="round"
              />
              {/* Pink Cute Tongue */}
              <path
                d="M 91 116 Q 100 129 109 116 Z"
                fill="#FB7185"
              />
            </g>

            {/* 8. Mini Sparkle Star / Heart Accessory */}
            <g transform="translate(138, 25)">
              <circle cx="12" cy="12" r="10" fill="#FFFBEB" stroke="#F59E0B" strokeWidth="2" />
              <path
                d="M 12 6 L 14 10 L 18 11 L 15 14 L 16 18 L 12 16 L 8 18 L 9 14 L 6 11 L 10 10 Z"
                fill="#F59E0B"
              />
            </g>
          </svg>
        </div>

        {/* Big Amount Highlight */}
        <div className="my-2 bg-white/90 rounded-2xl p-3.5 border-2 border-pink-300 shadow-inner">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
            Total Cobrado
          </div>
          <div className="text-3xl sm:text-4xl font-black text-[#D95D39] tracking-tight flex items-center justify-center gap-1">
            <span>${total}.00</span>
          </div>
          <div className="flex items-center justify-center gap-3 text-xs font-bold text-slate-700 mt-1">
            <span className="bg-pink-100 text-pink-950 px-2.5 py-0.5 rounded-md font-black">
              🍩 {piecesCount} {piecesCount === 1 ? 'pieza' : 'piezas'}
            </span>
            <span className="text-slate-500 font-mono">
              Folio: <strong className="text-slate-800">{folio}</strong>
            </span>
          </div>
          {customerName && (
            <div className="text-xs font-black text-emerald-700 mt-1">
              Cliente: {customerName}
            </div>
          )}
          <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 rounded-full border border-emerald-300 text-[11px] font-black shadow-2xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Operación Asegurada en Caja y Firebase</span>
          </div>
        </div>

        {/* Motivational Phrase */}
        <p className="text-xs sm:text-sm font-black text-pink-950 leading-snug my-2">
          {variant.phrase}
        </p>

        {/* Confirm Button to Dismiss Immediately */}
        <button
          type="button"
          id="close-celebration-btn"
          onClick={onClose}
          className="mt-3 w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black py-3 px-4 rounded-xl shadow-lg transition-all active:scale-95 text-sm flex items-center justify-center gap-2 cursor-pointer border border-emerald-400"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>¡Listo! Siguiente Venta 🍩✨</span>
        </button>
      </div>
    </div>
  );
};
