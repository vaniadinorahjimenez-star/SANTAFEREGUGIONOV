import React, { useState, useEffect } from 'react';
import { X, Check, Delete, Sparkles, Scale, Layers, Box, CheckCircle2, XCircle } from 'lucide-react';
import { playBeep, playBakerCheckSound } from '../../utils/audio';

export type UnitType = 'pz' | 'ch' | 'k' | 'custom';

interface VirtualBakerKeypadProps {
  isOpen: boolean;
  onClose: () => void;
  breadName: string;
  category: string;
  dayName: string; // e.g. "LUNES", "MARTES", etc.
  currentValue: string;
  orderDemandQuantity?: number; // Sum of customer orders for this bread/day
  orderDemandClients?: string[]; // Names of clients ordering this bread
  onSave: (value: string) => void;
}

export const VirtualBakerKeypad: React.FC<VirtualBakerKeypadProps> = ({
  isOpen,
  onClose,
  breadName,
  category,
  dayName,
  currentValue,
  orderDemandQuantity = 0,
  orderDemandClients = [],
  onSave
}) => {
  // Parse initial value and unit
  const [numValue, setNumValue] = useState<string>('');
  const [selectedUnit, setSelectedUnit] = useState<UnitType>('pz');
  const [customText, setCustomText] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;

    const trimmed = (currentValue || '').trim();
    if (!trimmed) {
      if (orderDemandQuantity > 0) {
        setNumValue(orderDemandQuantity.toString());
        setSelectedUnit('pz');
      } else {
        setNumValue('');
        setSelectedUnit('pz');
      }
      setCustomText('');
      return;
    }

    // Try parsing numbers and unit
    const lower = trimmed.toLowerCase();
    if (lower === 'si' || lower === '✓' || lower === 'no' || lower === '1/2' || lower === '1 placa' || lower === 'poco') {
      setCustomText(trimmed);
      setNumValue('');
      setSelectedUnit('custom');
    } else if (lower.endsWith('k') || lower.endsWith('kg') || lower.includes('kilo')) {
      const match = trimmed.match(/^([\d.]+)/);
      setNumValue(match ? match[1] : trimmed);
      setSelectedUnit('k');
      setCustomText('');
    } else if (lower.endsWith('ch') || lower.includes('charola')) {
      const match = trimmed.match(/^([\d.]+)/);
      setNumValue(match ? match[1] : trimmed);
      setSelectedUnit('ch');
      setCustomText('');
    } else if (lower.endsWith('pz') || lower.includes('pieza')) {
      const match = trimmed.match(/^([\d.]+)/);
      setNumValue(match ? match[1] : trimmed);
      setSelectedUnit('pz');
      setCustomText('');
    } else {
      // Check if pure numeric
      if (!isNaN(Number(trimmed))) {
        setNumValue(trimmed);
        setSelectedUnit('pz');
        setCustomText('');
      } else {
        setCustomText(trimmed);
        setNumValue('');
        setSelectedUnit('custom');
      }
    }
  }, [isOpen, currentValue, orderDemandQuantity]);

  if (!isOpen) return null;

  // Build the formatted string
  const getFormattedValue = (): string => {
    if (customText) return customText;
    if (!numValue) return '';

    if (selectedUnit === 'k') {
      return `${numValue}k`;
    }
    if (selectedUnit === 'ch') {
      return `${numValue}ch`;
    }
    if (selectedUnit === 'pz') {
      return `${numValue} pz`;
    }
    return numValue;
  };

  const handleDigit = (digit: string) => {
    playBeep(700, 'sine', 0.03);
    setCustomText('');
    if (digit === '.' && numValue.includes('.')) return;
    if (numValue.length >= 8) return;
    setNumValue(prev => prev + digit);
  };

  const handleClear = () => {
    playBeep(450, 'sine', 0.05);
    setNumValue('');
    setCustomText('');
  };

  const handleBackspace = () => {
    playBeep(550, 'sine', 0.03);
    if (customText) {
      setCustomText('');
      return;
    }
    setNumValue(prev => prev.slice(0, -1));
  };

  const handleAddQuickNumber = (addAmount: number) => {
    playBeep(800, 'sine', 0.04);
    setCustomText('');
    const currentNum = parseFloat(numValue) || 0;
    const result = Math.max(0, currentNum + addAmount);
    setNumValue(result.toString());
  };

  const handleSetQuickPreset = (preset: string) => {
    playBeep(750, 'sine', 0.04);
    setCustomText(preset);
    setNumValue('');
    setSelectedUnit('custom');
  };

  const handleSelectUnit = (unit: UnitType) => {
    playBeep(650, 'sine', 0.03);
    setSelectedUnit(unit);
    if (customText) {
      setCustomText('');
    }
  };

  const handleApplyOrderDemand = () => {
    if (orderDemandQuantity > 0) {
      playBakerCheckSound();
      setNumValue(orderDemandQuantity.toString());
      setSelectedUnit('pz');
      setCustomText('');
    }
  };

  const handleConfirm = () => {
    const formatted = getFormattedValue();
    playBakerCheckSound();
    onSave(formatted);
    onClose();
  };

  const displayFormatted = getFormattedValue();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-xs animate-in fade-in">
      <div className="bg-[#2D3142] text-white w-full max-w-lg rounded-3xl shadow-2xl border-2 border-[#D95D39]/50 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header with Bread Name & Day */}
        <div className="p-4 bg-black/40 border-b border-white/10 flex items-start justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="bg-[#D95D39] text-white text-[11px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                Teclado Táctil de Panadería
              </span>
              <span className="text-amber-300 text-xs font-extrabold uppercase">
                📅 {dayName}
              </span>
            </div>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              {breadName}
            </h2>
            <p className="text-xs text-white/70">
              Categoría: <span className="font-semibold text-amber-200">{category}</span>
            </p>
          </div>

          <button
            onClick={onClose}
            className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-2xl transition-all"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          {/* Order Demand Sync Helper if orders exist */}
          {orderDemandQuantity > 0 && (
            <div className="bg-amber-500/20 border-2 border-amber-400/60 p-3 rounded-2xl flex items-center justify-between gap-2">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-amber-300 text-xs font-black">
                  <Sparkles className="w-4 h-4" />
                  <span>📦 Pedidos Registrados para {dayName}:</span>
                </div>
                <p className="text-sm font-extrabold text-white">
                  {orderDemandQuantity} Piezas solicitadas
                </p>
                {orderDemandClients.length > 0 && (
                  <p className="text-[11px] text-amber-200/90 font-medium truncate max-w-xs">
                    Clientes: {orderDemandClients.join(', ')}
                  </p>
                )}
              </div>

              <button
                onClick={handleApplyOrderDemand}
                className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black text-xs rounded-xl shadow-md transition-all shrink-0"
              >
                Cargar {orderDemandQuantity} pz
              </button>
            </div>
          )}

          {/* Value Display Box */}
          <div className="bg-black/60 p-4 rounded-2xl border-2 border-white/20 text-center relative shadow-inner">
            <span className="text-[11px] font-bold text-white/60 uppercase tracking-wider block mb-1">
              Cantidad a mostrar en la Hoja de Producción:
            </span>
            <div className="min-h-[48px] flex items-center justify-center">
              <span className="text-3xl sm:text-4xl font-black text-amber-400 font-mono tracking-wide">
                {displayFormatted || <span className="text-white/30 text-2xl font-sans">- vacía -</span>}
              </span>
            </div>
            {displayFormatted && (
              <span className="text-xs text-emerald-300 font-bold block mt-1">
                {selectedUnit === 'k' && `⚖️ ${numValue} Kilos (${numValue}k)`}
                {selectedUnit === 'ch' && `🥖 ${numValue} Charolas (${numValue}ch)`}
                {selectedUnit === 'pz' && `📦 ${numValue} Piezas (${numValue} pz)`}
                {selectedUnit === 'custom' && `📝 Texto especial: "${customText}"`}
              </span>
            )}
          </div>

          {/* Unit Selector Bar: PZ / CHAROLAS / KILOS */}
          <div className="space-y-1.5">
            <label className="text-xs font-black text-white/80 uppercase tracking-wider flex items-center gap-1.5">
              <span>Selecciona la Unidad:</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleSelectUnit('pz')}
                className={`py-3 px-2 rounded-2xl font-black text-sm sm:text-base border-2 transition-all flex flex-col items-center justify-center gap-1 ${
                  selectedUnit === 'pz' && !customText
                    ? 'bg-[#D95D39] text-white border-white shadow-lg scale-102 ring-2 ring-white/50'
                    : 'bg-white/10 text-white/90 border-white/20 hover:bg-white/20'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Box className="w-4 h-4" />
                  <span>PIEZAS</span>
                </div>
                <span className="text-[11px] font-mono opacity-90">ej. 12 pz</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectUnit('ch')}
                className={`py-3 px-2 rounded-2xl font-black text-sm sm:text-base border-2 transition-all flex flex-col items-center justify-center gap-1 ${
                  selectedUnit === 'ch' && !customText
                    ? 'bg-[#D95D39] text-white border-white shadow-lg scale-102 ring-2 ring-white/50'
                    : 'bg-white/10 text-white/90 border-white/20 hover:bg-white/20'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Layers className="w-4 h-4" />
                  <span>CHAROLAS</span>
                </div>
                <span className="text-[11px] font-mono opacity-90">ej. 3ch</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectUnit('k')}
                className={`py-3 px-2 rounded-2xl font-black text-sm sm:text-base border-2 transition-all flex flex-col items-center justify-center gap-1 ${
                  selectedUnit === 'k' && !customText
                    ? 'bg-[#D95D39] text-white border-white shadow-lg scale-102 ring-2 ring-white/50'
                    : 'bg-white/10 text-white/90 border-white/20 hover:bg-white/20'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Scale className="w-4 h-4" />
                  <span>KILOS</span>
                </div>
                <span className="text-[11px] font-mono opacity-90">ej. 5k</span>
              </button>
            </div>
          </div>

          {/* Quick Increment Buttons */}
          <div className="grid grid-cols-6 gap-1.5">
            {[1, 5, 10, 20, 50, 100].map(add => (
              <button
                key={add}
                type="button"
                onClick={() => handleAddQuickNumber(add)}
                className="py-2 bg-white/10 hover:bg-white/25 active:bg-[#D95D39] text-white font-extrabold text-xs rounded-xl border border-white/20 transition-all"
              >
                +{add}
              </button>
            ))}
          </div>

          {/* Main Numeric Keypad */}
          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
              <button
                key={d}
                type="button"
                onClick={() => handleDigit(d)}
                className="py-3.5 bg-white/15 hover:bg-white/30 active:bg-amber-500 active:text-slate-950 text-white font-black text-2xl rounded-2xl border border-white/20 shadow-md transition-all flex items-center justify-center"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              className="py-3.5 bg-rose-600/80 hover:bg-rose-600 active:bg-rose-700 text-white font-black text-lg rounded-2xl border border-rose-400 shadow-md transition-all flex items-center justify-center"
            >
              C
            </button>
            <button
              type="button"
              onClick={() => handleDigit('0')}
              className="py-3.5 bg-white/15 hover:bg-white/30 active:bg-amber-500 active:text-slate-950 text-white font-black text-2xl rounded-2xl border border-white/20 shadow-md transition-all flex items-center justify-center"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="py-3.5 bg-amber-600/80 hover:bg-amber-600 active:bg-amber-700 text-white font-black text-lg rounded-2xl border border-amber-400 shadow-md transition-all flex items-center justify-center"
              title="Borrar último dígito"
            >
              <Delete className="w-6 h-6" />
            </button>
          </div>

          {/* Quick status chips */}
          <div className="space-y-1 pt-1">
            <span className="text-[11px] font-bold text-white/60 uppercase tracking-wider block">
              Atajos de Estado Rápido:
            </span>
            <div className="grid grid-cols-5 gap-1.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => handleSetQuickPreset('✓ Si')}
                className="py-2 bg-emerald-700/80 hover:bg-emerald-600 text-white rounded-xl border border-emerald-400 flex items-center justify-center gap-1"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>✓ Si</span>
              </button>
              <button
                type="button"
                onClick={() => handleSetQuickPreset('✕ NO')}
                className="py-2 bg-rose-800/80 hover:bg-rose-700 text-white rounded-xl border border-rose-400 flex items-center justify-center gap-1"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>✕ NO</span>
              </button>
              <button
                type="button"
                onClick={() => handleSetQuickPreset('1/2')}
                className="py-2 bg-blue-800/80 hover:bg-blue-700 text-white rounded-xl border border-blue-400"
              >
                1/2
              </button>
              <button
                type="button"
                onClick={() => handleSetQuickPreset('1 Placa')}
                className="py-2 bg-purple-800/80 hover:bg-purple-700 text-white rounded-xl border border-purple-400"
              >
                1 Placa
              </button>
              <button
                type="button"
                onClick={() => handleSetQuickPreset('Poco')}
                className="py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl border border-slate-400"
              >
                Poco
              </button>
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div className="p-4 bg-black/40 border-t border-white/10 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="w-1/3 py-3.5 bg-white/15 hover:bg-white/25 text-white font-black text-sm rounded-2xl border border-white/20 transition-all"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            className="w-2/3 py-3.5 bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-black text-base rounded-2xl shadow-xl border-2 border-emerald-300 flex items-center justify-center gap-2 transition-all"
          >
            <Check className="w-5 h-5" />
            <span>✓ Guardar en Hoja</span>
          </button>
        </div>
      </div>
    </div>
  );
};
