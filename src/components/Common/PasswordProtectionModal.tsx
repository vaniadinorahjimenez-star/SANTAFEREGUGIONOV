import React, { useState, useEffect, useRef } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, X, Check, ArrowRight } from 'lucide-react';
import { playBeep } from '../../utils/audio';

interface PasswordProtectionModalProps {
  isOpen: boolean;
  targetTitle: string;
  targetSubtitle?: string;
  expectedPassword: string;
  badgeText?: string;
  badgeColor?: 'orange' | 'emerald' | 'indigo';
  onSuccess: () => void;
  onCancel: () => void;
}

export const PasswordProtectionModal: React.FC<PasswordProtectionModalProps> = ({
  isOpen,
  targetTitle,
  targetSubtitle,
  expectedPassword,
  badgeText,
  badgeColor = 'orange',
  onSuccess,
  onCancel
}) => {
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPasswordInput('');
      setErrorMessage('');
      setIsShaking(false);
      setShowPassword(false);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.value = '';
          inputRef.current.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanInput = passwordInput.trim();
    const cleanExpected = expectedPassword.trim();

    // Comprobación de contraseña (no sensible a mayúsculas para conveniencia del teclado táctil)
    const matches = cleanInput.toLowerCase() === cleanExpected.toLowerCase();

    if (matches) {
      playBeep(880, 'sine', 0.08);
      onSuccess();
    } else {
      playBeep(320, 'square', 0.15);
      setIsShaking(true);
      setErrorMessage('Contraseña incorrecta. Intenta nuevamente.');
      setTimeout(() => setIsShaking(false), 500);
      inputRef.current?.select();
    }
  };

  const handleKeyPress = (num: string) => {
    playBeep(650, 'sine', 0.03);
    setPasswordInput(prev => prev + num);
  };

  const handleDeleteChar = () => {
    playBeep(520, 'sine', 0.03);
    setPasswordInput(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    playBeep(450, 'sine', 0.03);
    setPasswordInput('');
    setErrorMessage('');
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.focus();
    }
  };

  const isNumericOnly = /^\d+$/.test(expectedPassword);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className={`w-full max-w-sm bg-white rounded-3xl shadow-2xl border-2 border-slate-200 overflow-hidden ${
          isShaking ? 'animate-shake' : ''
        }`}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-4 text-white relative">
          <button
            type="button"
            onClick={onCancel}
            className="absolute top-3.5 right-3.5 text-slate-400 hover:text-white p-1 rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-amber-400 shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div className="min-w-0 pr-6">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="font-black text-base text-white truncate leading-tight">
                  {targetTitle}
                </h3>
                {badgeText && (
                  <span className={`text-[9.5px] font-black uppercase px-2 py-0.5 rounded-full ${
                    badgeColor === 'emerald'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                      : badgeColor === 'indigo'
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-400/30'
                        : 'bg-[#D95D39]/30 text-amber-300 border border-[#D95D39]/50'
                  }`}>
                    {badgeText}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-300 font-medium leading-none mt-1">
                {targetSubtitle || 'Ingresa la contraseña para desbloquear este acceso'}
              </p>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="space-y-1.5">
            <label className="block text-[11px] font-black text-slate-600 uppercase tracking-wider">
              Contraseña de Acceso:
            </label>

            <div className="relative flex items-center">
              <input
                ref={inputRef}
                name="modal_security_code"
                type={showPassword ? 'text' : 'password'}
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  if (errorMessage) setErrorMessage('');
                }}
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                data-lpignore="true"
                data-form-type="other"
                className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 rounded-2xl text-lg font-black text-slate-900 border-2 border-slate-300 focus:border-slate-800 focus:bg-white focus:outline-none tracking-widest text-center shadow-inner font-mono transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                className="absolute right-3 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                title={showPassword ? 'Ocultar' : 'Mostrar'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {errorMessage && (
              <p className="text-xs font-bold text-rose-600 text-center animate-in fade-in">
                ⚠️ {errorMessage}
              </p>
            )}
          </div>

          {/* Quick numeric pin pad if expected password is numeric */}
          {isNumericOnly && (
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleKeyPress(num)}
                  className="py-2.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-900 font-black text-base rounded-xl transition-all cursor-pointer select-none"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={handleClear}
                className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-all cursor-pointer select-none uppercase"
              >
                Borrar
              </button>
              <button
                type="button"
                onClick={() => handleKeyPress('0')}
                className="py-2.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-900 font-black text-base rounded-xl transition-all cursor-pointer select-none"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleDeleteChar}
                className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-sm rounded-xl transition-all cursor-pointer select-none"
              >
                ⌫
              </button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-slate-900 hover:bg-black text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
            >
              <span>Entrar</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
