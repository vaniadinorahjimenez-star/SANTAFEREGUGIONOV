import React from 'react';
import { Plus, Minus, Check, X, RotateCcw, Banknote, Coins, CheckCircle2 } from 'lucide-react';
import { playBeep } from '../../utils/audio';

export const calculateDenominationsTotal = (dens: { [denom: number]: number }): number => {
  return Object.entries(dens).reduce((acc, [val, count]) => {
    const c = typeof count === 'number' ? count : Number(count || 0);
    return acc + (Number(val) * Math.max(0, c));
  }, 0);
};

interface CashDenominationSelectorProps {
  title: string;
  subtitle?: string;
  denominations: { [denom: number]: number };
  onChange: (updated: { [denom: number]: number }, total: number) => void;
  onApply: (total: number) => void;
  onCancel: () => void;
  onlyBills?: boolean;
  autoTargetNotice?: string;
}

const BILL_VALUES = [500, 200, 100, 50, 20];
const COIN_VALUES = [10, 5, 2, 1];

export const CashDenominationSelector: React.FC<CashDenominationSelectorProps> = ({
  title,
  subtitle,
  denominations,
  onChange,
  onApply,
  onCancel,
  onlyBills = false,
  autoTargetNotice
}) => {
  const activeBills = BILL_VALUES;
  const activeCoins = onlyBills ? [] : COIN_VALUES;

  const currentTotal = calculateDenominationsTotal(denominations);

  const handleUpdate = (denom: number, delta: number) => {
    playBeep(delta > 0 ? 700 : 500, 'sine', 0.02);
    const prev = denominations[denom] || 0;
    const nextVal = Math.max(0, prev + delta);
    const updated = { ...denominations, [denom]: nextVal };
    const newTotal = calculateDenominationsTotal(updated);
    onChange(updated, newTotal);
  };

  const handleSetDirect = (denom: number, valStr: string) => {
    const num = parseInt(valStr, 10);
    const safe = isNaN(num) ? 0 : Math.max(0, num);
    const updated = { ...denominations, [denom]: safe };
    const newTotal = calculateDenominationsTotal(updated);
    onChange(updated, newTotal);
  };

  const handleReset = () => {
    playBeep(450, 'sine', 0.03);
    const reset: { [denom: number]: number } = {};
    activeBills.forEach(b => { reset[b] = 0; });
    activeCoins.forEach(c => { reset[c] = 0; });
    onChange(reset, 0);
  };

  return (
    <div className="bg-amber-50/90 border-2 border-amber-400 rounded-2xl p-3 sm:p-4 shadow-md space-y-3 animate-in fade-in zoom-in-95 duration-150">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-amber-300/80 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black shadow-xs">
            {onlyBills ? <Banknote className="w-5 h-5" /> : <Coins className="w-5 h-5" />}
          </div>
          <div>
            <h4 className="text-sm font-black text-amber-950 leading-tight">
              {title}
            </h4>
            {subtitle && (
              <p className="text-[11px] text-amber-800 font-bold leading-none mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {currentTotal > 0 && (
            <button
              type="button"
              onClick={handleReset}
              className="px-2 py-1 bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-amber-300 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
              title="Poner todo en cero"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Limpiar</span>
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-white/80 rounded-lg cursor-pointer"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* BILLETES */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-black uppercase tracking-wider text-amber-950 flex items-center gap-1">
          <Banknote className="w-3.5 h-3.5 text-amber-700" />
          <span>Billetes ({activeBills.map(b => `$${b}`).join(', ')}):</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {activeBills.map((bill) => {
            const count = denominations[bill] || 0;
            const subtotal = bill * count;
            return (
              <div
                key={bill}
                className={`p-2 rounded-xl border-2 transition-all flex flex-col justify-between ${
                  count > 0 
                    ? 'bg-amber-100/90 border-amber-500 shadow-xs' 
                    : 'bg-white border-amber-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-base font-black text-slate-900 font-mono">
                    ${bill}
                  </span>
                  <span className={`text-[10px] font-black font-mono px-1.5 py-0.2 rounded ${
                    count > 0 ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    ${subtotal}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-1 mt-1.5">
                  <button
                    type="button"
                    onClick={() => handleUpdate(bill, -1)}
                    disabled={count <= 0}
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-rose-100 active:bg-rose-200 disabled:opacity-40 text-slate-800 hover:text-rose-700 font-black text-lg flex items-center justify-center cursor-pointer transition-colors"
                  >
                    <Minus className="w-4 h-4" />
                  </button>

                  <input
                    type="number"
                    min="0"
                    value={count === 0 ? '' : count}
                    onChange={(e) => handleSetDirect(bill, e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder="0"
                    className="w-12 h-8 text-center text-sm font-black text-slate-900 bg-white border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                  />

                  <button
                    type="button"
                    onClick={() => handleUpdate(bill, 1)}
                    className="w-8 h-8 rounded-lg bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-black text-lg flex items-center justify-center cursor-pointer shadow-2xs transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MONEDAS (SI NO ES SOLO BILLETES) */}
      {!onlyBills && (
        <div className="space-y-1.5 pt-1">
          <div className="text-[11px] font-black uppercase tracking-wider text-amber-950 flex items-center gap-1">
            <Coins className="w-3.5 h-3.5 text-amber-700" />
            <span>Monedas ($10, $5, $2, $1):</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {COIN_VALUES.map((coin) => {
              const count = denominations[coin] || 0;
              const subtotal = coin * count;
              return (
                <div
                  key={coin}
                  className={`p-2 rounded-xl border-2 transition-all flex flex-col justify-between ${
                    count > 0 
                      ? 'bg-amber-100/90 border-amber-500 shadow-xs' 
                      : 'bg-white border-amber-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-slate-900 font-mono">
                      🪙 ${coin}
                    </span>
                    <span className={`text-[10px] font-black font-mono px-1.5 py-0.2 rounded ${
                      count > 0 ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      ${subtotal}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-1 mt-1.5">
                    <button
                      type="button"
                      onClick={() => handleUpdate(coin, -1)}
                      disabled={count <= 0}
                      className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-rose-100 active:bg-rose-200 disabled:opacity-40 text-slate-800 hover:text-rose-700 font-black text-lg flex items-center justify-center cursor-pointer transition-colors"
                    >
                      <Minus className="w-4 h-4" />
                    </button>

                    <input
                      type="number"
                      min="0"
                      value={count === 0 ? '' : count}
                      onChange={(e) => handleSetDirect(coin, e.target.value)}
                      onFocus={(e) => e.target.select()}
                      placeholder="0"
                      className="w-12 h-8 text-center text-sm font-black text-slate-900 bg-white border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                    />

                    <button
                      type="button"
                      onClick={() => handleUpdate(coin, 1)}
                      className="w-8 h-8 rounded-lg bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-black text-lg flex items-center justify-center cursor-pointer shadow-2xs transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TOTAL Y BOTÓN DE APLICAR */}
      <div className="pt-2 border-t border-amber-300 flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-white p-3 rounded-xl border border-amber-200">
        <div className="space-y-0.5">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-black uppercase text-slate-600">
              Suma Contada:
            </span>
            <span className="text-2xl font-black text-emerald-700 font-mono">
              ${currentTotal}.00
            </span>
          </div>
          {autoTargetNotice && (
            <div className="text-[11px] font-black text-emerald-800 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 inline shrink-0" />
              <span>{autoTargetNotice}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 sm:flex-none px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={() => {
              playBeep(800, 'sine', 0.04);
              onApply(currentTotal);
            }}
            className="flex-1 sm:flex-none px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black text-xs sm:text-sm rounded-xl flex items-center justify-center gap-1.5 shadow-md cursor-pointer transition-all active:scale-95"
          >
            <Check className="w-4 h-4" />
            <span>Listo (${currentTotal}.00)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
