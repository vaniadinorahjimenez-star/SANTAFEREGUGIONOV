import React, { useState, useEffect, useRef } from 'react';
import { 
  Wifi, 
  WifiOff, 
  CreditCard, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  X, 
  Sliders, 
  ArrowRight,
  ShieldCheck,
  Smartphone,
  KeyRound,
  Activity
} from 'lucide-react';
import { 
  getStoredClipConfig, 
  saveClipConfig, 
  sendPaymentToClipTerminal, 
  pollClipPaymentStatus, 
  diagnoseClipConnection,
  ClipPaymentResult,
  DEFAULT_CLIP_SERIAL
} from '../../services/clipService';

interface ClipPaymentModalProps {
  isOpen: boolean;
  amount: number;
  folio: string;
  customerName?: string;
  onClose: () => void;
  onPaymentApproved: (details: {
    terminal: 'clip';
    authCode: string;
    last4?: string;
    reference?: string;
  }) => void;
}

type PaymentStep = 
  | 'INITIATING'             // Conectando con la terminal por Wi-Fi
  | 'AWAITING_CARD'          // Terminal activa esperando tarjeta o NIP
  | 'APPROVED'               // Cobro aprobado en la terminal
  | 'NETLIFY_REDEPLOY_ERROR' // Faltó hacer deploy en Netlify tras guardar variables
  | 'AUTH_ERROR'             // Error 401: API Key rechazada por Clip
  | 'SERIAL_NOT_FOUND'       // Serie no registrada en la cuenta Clip
  | 'OFFLINE_ERROR'          // Terminal apagada o sin internet Wi-Fi
  | 'TIMEOUT_ERROR'          // Tiempo de espera agotado
  | 'BUSY_ERROR'             // Terminal ocupada
  | 'DIAGNOSTIC'             // Diagnóstico en vivo
  | 'MANUAL_AUTH';           // Autorización manual de respaldo

export const ClipPaymentModal: React.FC<ClipPaymentModalProps> = ({
  isOpen,
  amount,
  folio,
  customerName,
  onClose,
  onPaymentApproved
}) => {
  const [step, setStep] = useState<PaymentStep>('INITIATING');
  const [statusMessage, setStatusMessage] = useState<string>('Enviando orden a la terminal Clip por Wi-Fi...');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [errorDetails, setErrorDetails] = useState<any>(null);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const [authCode, setAuthCode] = useState<string>('');
  const [last4, setLast4] = useState<string>('');
  const [isEditingSerial, setIsEditingSerial] = useState<boolean>(false);
  const [isEditingCredentials, setIsEditingCredentials] = useState<boolean>(false);
  const [serialInput, setSerialInput] = useState<string>('');
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [secretKeyInput, setSecretKeyInput] = useState<string>('');
  const [config, setConfig] = useState(getStoredClipConfig());

  // Fallback manual de respaldo
  const [manualAuthCode, setManualAuthCode] = useState<string>('');
  const [manualLast4, setManualLast4] = useState<string>('');

  // Diagnóstico
  const [diagnosticLoading, setDiagnosticLoading] = useState<boolean>(false);
  const [diagnosticResult, setDiagnosticResult] = useState<any>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Inicializar y lanzar el cobro REAL al abrir el modal
  useEffect(() => {
    if (!isOpen) return;

    const stored = getStoredClipConfig();
    setConfig(stored);
    setSerialInput(stored.serialNumber || DEFAULT_CLIP_SERIAL);
    setApiKeyInput(stored.apiKey || '');
    setSecretKeyInput(stored.secretKey || '');
    startClipTransaction();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [isOpen]);

  const startClipTransaction = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setStep('INITIATING');
    setStatusMessage('Contactando a la terminal Clip P8C2240805000156 vía Wi-Fi...');
    setErrorMessage('');
    setErrorDetails(null);
    setHttpStatus(null);

    const sendRes = await sendPaymentToClipTerminal(amount, folio);

    if (!sendRes.success) {
      setErrorDetails(sendRes.details);
      setHttpStatus(sendRes.httpStatus || null);
      
      if (sendRes.errorType === 'NETLIFY_REDEPLOY_NEEDED') {
        setStep('NETLIFY_REDEPLOY_ERROR');
        setErrorMessage(
          sendRes.message || 'Se requiere desplegar nuevamente el sitio en Netlify para activar CLIP_API_KEY.'
        );
      } else if (sendRes.errorType === 'CLIP_AUTH_ERROR' || sendRes.httpStatus === 401) {
        setStep('AUTH_ERROR');
        setErrorMessage(
          sendRes.message || 'Clip no reconoció la clave de autorización (Error 401). Verifica tu API Key y Secret Key de developer.clip.mx.'
        );
      } else if (sendRes.errorType === 'DEVICE_NOT_FOUND' || sendRes.httpStatus === 404) {
        setStep('SERIAL_NOT_FOUND');
        setErrorMessage(
          sendRes.message || `La terminal con serie "${config.serialNumber}" no fue encontrada en tu cuenta de Clip.`
        );
      } else if (sendRes.errorType === 'TERMINAL_OFFLINE' || sendRes.httpStatus === 503) {
        setStep('OFFLINE_ERROR');
        setErrorMessage(
          sendRes.message || 'La terminal Clip está apagada, en reposo o sin señal Wi-Fi.'
        );
      } else if (sendRes.errorType === 'TERMINAL_BUSY' || sendRes.httpStatus === 409) {
        setStep('BUSY_ERROR');
        setErrorMessage(
          sendRes.message || 'La terminal Clip está ocupada con otra transacción.'
        );
      } else {
        setStep('OFFLINE_ERROR');
        setErrorMessage(
          sendRes.message || 'No fue posible contactar a la terminal Clip. Revisa que esté encendida y conectada a Wi-Fi.'
        );
      }
      return;
    }

    setStep('AWAITING_CARD');
    setStatusMessage('Terminal conectada. Pasa, inserta o acerca la tarjeta en la pantalla Clip...');

    // Iniciar sondeo (polling) REAL en la terminal Clip
    const pollRes: ClipPaymentResult = await pollClipPaymentStatus(
      sendRes.pinpadRequestId || folio,
      (msg) => setStatusMessage(msg),
      controller.signal
    );

    if (pollRes.success && pollRes.status === 'APPROVED') {
      const confirmedAuth = pollRes.authCode || 'APROBADO';
      const confirmedLast4 = pollRes.last4 || '••••';
      setAuthCode(confirmedAuth);
      setLast4(confirmedLast4);
      setStep('APPROVED');

      setTimeout(() => {
        onPaymentApproved({
          terminal: 'clip',
          authCode: confirmedAuth,
          last4: confirmedLast4,
          reference: folio
        });
      }, 1400);
    } else {
      if (pollRes.errorType === 'CANCELLED') {
        return;
      }
      if (pollRes.errorType === 'TERMINAL_TIMEOUT' || pollRes.status === 'TIMEOUT') {
        setStep('TIMEOUT_ERROR');
        setErrorMessage(pollRes.message || 'Tiempo agotado sin pasar la tarjeta en la terminal.');
      } else {
        setStep('OFFLINE_ERROR');
        setErrorMessage(pollRes.message || 'La operación en la terminal no pudo completarse.');
      }
    }
  };

  const handleSaveSerial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!serialInput.trim()) return;
    const updated = { ...config, serialNumber: serialInput.trim() };
    setConfig(updated);
    saveClipConfig(updated);
    setIsEditingSerial(false);
    startClipTransaction();
  };

  const handleSaveCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = {
      ...config,
      apiKey: apiKeyInput.trim(),
      secretKey: secretKeyInput.trim()
    };
    setConfig(updated);
    saveClipConfig(updated);
    setIsEditingCredentials(false);
    startClipTransaction();
  };

  const handleManualAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualAuthCode.trim()) return;

    onPaymentApproved({
      terminal: 'clip',
      authCode: manualAuthCode.trim().toUpperCase(),
      last4: manualLast4.trim() || undefined,
      reference: folio
    });
  };

  const runDiagnostic = async () => {
    setStep('DIAGNOSTIC');
    setDiagnosticLoading(true);
    const result = await diagnoseClipConnection(config.serialNumber);
    setDiagnosticResult(result);
    setDiagnosticLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-[#FF5A00] to-[#E04D00] p-5 text-white flex items-center justify-between relative shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-xs">
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base tracking-tight leading-tight">Terminal Clip Wi-Fi</h3>
                <span className="text-[10px] bg-white/25 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                  En Vivo
                </span>
              </div>
              <p className="text-xs text-orange-100 font-medium">
                Serie: {config.serialNumber || DEFAULT_CLIP_SERIAL}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Resumen del cobro */}
        <div className="px-6 py-4 bg-orange-50/60 border-b border-orange-100 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-orange-800 uppercase tracking-wider block">
              Folio {folio}
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Total a cobrar:
            </span>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black text-slate-900 tracking-tight">
              ${amount.toFixed(2)}
            </span>
            <span className="text-[10px] text-slate-400 font-bold block">MXN</span>
          </div>
        </div>

        {/* Info de la Terminal y botón para cambiar serie */}
        <div className="px-6 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-slate-600 font-mono text-[11px]">
            <Wifi className="w-3.5 h-3.5 text-emerald-600" />
            <span>Serie: <strong>{config.serialNumber}</strong></span>
          </div>

          <button
            type="button"
            onClick={() => setIsEditingSerial(!isEditingSerial)}
            className="text-[11px] font-bold text-orange-600 hover:text-orange-700 cursor-pointer flex items-center gap-1"
          >
            <Sliders className="w-3 h-3" />
            {isEditingSerial ? 'Cerrar' : 'Modificar serie'}
          </button>
        </div>

        {/* Edición rápida de número de serie */}
        {isEditingSerial && (
          <form onSubmit={handleSaveSerial} className="p-4 bg-slate-100 border-b border-slate-200 space-y-2">
            <label className="block text-xs font-bold text-slate-700">
              Número de Serie de la Terminal Clip:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={serialInput}
                onChange={(e) => setSerialInput(e.target.value)}
                placeholder="P8C2240805000156"
                className="flex-1 px-3 py-1.5 bg-white rounded-xl border border-slate-300 text-xs font-mono font-bold focus:ring-2 focus:ring-orange-500"
              />
              <button
                type="submit"
                className="bg-[#FF5A00] text-white text-xs font-bold px-3 py-1.5 rounded-xl cursor-pointer hover:bg-orange-600 shrink-0"
              >
                Guardar y Conectar
              </button>
            </div>
          </form>
        )}

        {/* Contenido Dinámico por Estado */}
        <div className="p-6 flex flex-col items-center justify-center min-h-[260px] text-center">

          {/* ESTADO 1: INICIANDO COBRO EN LA TERMINAL */}
          {step === 'INITIATING' && (
            <div className="flex flex-col items-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center text-[#FF5A00]">
                  <Wifi className="w-8 h-8 animate-pulse" />
                </div>
                <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-[#FF5A00] border-2 border-white animate-ping" />
              </div>
              <div>
                <h4 className="font-extrabold text-slate-900 text-base">Enviando monto a la terminal...</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">{statusMessage}</p>
              </div>
            </div>
          )}

          {/* ESTADO 2: ESPERANDO TARJETA REAL EN LA TERMINAL CLIP */}
          {step === 'AWAITING_CARD' && (
            <div className="flex flex-col items-center space-y-4 animate-in fade-in">
              <div className="relative">
                <div className="w-20 h-20 rounded-3xl bg-orange-50 border-2 border-orange-300 flex items-center justify-center text-[#FF5A00] shadow-md">
                  <Smartphone className="w-10 h-10 animate-bounce" />
                </div>
                <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs">
                  <Wifi className="w-3.5 h-3.5" />
                </div>
              </div>

              <div className="space-y-1">
                <h4 className="font-black text-slate-900 text-lg">Pasa la tarjeta en la terminal</h4>
                <p className="text-xs text-slate-600 font-medium max-w-xs">
                  {statusMessage}
                </p>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold mt-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  Terminal {config.serialNumber} Conectada
                </div>
              </div>
            </div>
          )}

          {/* ESTADO 3: PAGO APROBADO EXITOSAMENTE */}
          {step === 'APPROVED' && (
            <div className="flex flex-col items-center space-y-3 animate-in zoom-in-95">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shadow-lg shadow-emerald-600/20">
                <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
              </div>
              <div>
                <h4 className="font-black text-emerald-700 text-xl">¡Pago Aprobado!</h4>
                <p className="text-xs text-slate-600 mt-1">
                  Autorización: <strong className="font-mono">{authCode}</strong>
                </p>
                {last4 && (
                  <p className="text-xs text-slate-500">
                    Tarjeta terminación: <strong className="font-mono">**** {last4}</strong>
                  </p>
                )}
                <span className="text-[11px] text-emerald-600 font-bold block mt-2 animate-pulse">
                  Generando ticket e imprimiendo comprobante...
                </span>
              </div>
            </div>
          )}

          {/* ESTADO 4A: ERROR - FALTA TRIGGER DEPLOY EN NETLIFY */}
          {step === 'NETLIFY_REDEPLOY_ERROR' && (
            <div className="flex flex-col items-center space-y-3 w-full text-left">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 self-center">
                <AlertTriangle className="w-6 h-6" />
              </div>

              <div className="text-center w-full">
                <h4 className="font-black text-slate-900 text-base">Falta Desplegar en Netlify</h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  Las variables fueron guardadas, pero los servidores de Netlify necesitan recargarlas.
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-slate-700 space-y-1.5 w-full">
                <strong className="text-amber-900 font-bold block">Pasos en tu panel de Netlify:</strong>
                <ol className="list-decimal pl-4 space-y-1 text-[11px]">
                  <li>Ve a la pestaña <strong>Deploys</strong> en tu panel de Netlify.</li>
                  <li>Haz clic en el botón <strong>Trigger deploy</strong> (arriba a la derecha).</li>
                  <li>Selecciona <strong>Clear cache and deploy site</strong>.</li>
                  <li>Espera 1 minuto a que termine el despliegue y presiona <strong>Reintentar</strong> aquí abajo.</li>
                </ol>
              </div>

              <div className="grid grid-cols-2 gap-2 w-full pt-2">
                <button
                  type="button"
                  onClick={startClipTransaction}
                  className="bg-[#FF5A00] hover:bg-[#E04D00] text-white font-black py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reintentar
                </button>
                <button
                  type="button"
                  onClick={runDiagnostic}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Activity className="w-3.5 h-3.5" />
                  Diagnóstico
                </button>
              </div>
            </div>
          )}

          {/* ESTADO 4B: ERROR 401 DE AUTENTICACIÓN CLIP */}
          {step === 'AUTH_ERROR' && (
            <div className="flex flex-col items-center space-y-3 w-full text-left">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 self-center">
                <KeyRound className="w-6 h-6" />
              </div>

              <div className="text-center w-full">
                <h4 className="font-black text-red-700 text-base">Error 401: Credenciales Rechazadas por Clip</h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  Clip requiere tu <strong>API Key</strong> y tu <strong>Secret Key</strong> de producción.
                </p>
              </div>

              {/* Formulario rápido para corregir API Key y Secret Key */}
              <form onSubmit={handleSaveCredentials} className="w-full bg-red-50/80 border border-red-200 rounded-2xl p-3.5 space-y-2.5 text-xs">
                <div className="font-bold text-red-950 flex items-center justify-between">
                  <span>Actualizar Credenciales de Clip:</span>
                  <span className="text-[10px] text-red-700 font-normal">developer.clip.mx</span>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                    Token de Acceso o API Key:
                  </label>
                  <input
                    type="text"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="Pega aquí tu Token o API Key"
                    className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 font-mono text-xs focus:ring-2 focus:ring-[#FF5A00]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                    Secret Key (opcional si pegaste el Token):
                  </label>
                  <input
                    type="password"
                    value={secretKeyInput}
                    onChange={(e) => setSecretKeyInput(e.target.value)}
                    placeholder="Clave secreta (solo si no pegaste el token directo)"
                    className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 font-mono text-xs focus:ring-2 focus:ring-[#FF5A00]"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    className="flex-1 bg-[#FF5A00] hover:bg-[#E04D00] text-white font-black py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Guardar y Reintentar Cobro
                  </button>
                </div>
              </form>

              <div className="grid grid-cols-2 gap-2 w-full pt-1">
                <button
                  type="button"
                  onClick={runDiagnostic}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Activity className="w-3.5 h-3.5 text-orange-600" />
                  Diagnóstico en Vivo
                </button>
                <button
                  type="button"
                  onClick={() => setStep('MANUAL_AUTH')}
                  className="bg-slate-800 hover:bg-slate-900 text-white font-black py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Autorizar Manual
                </button>
              </div>
            </div>
          )}

          {/* ESTADO 4C: SERIE NO ENCONTRADA EN CLIP */}
          {step === 'SERIAL_NOT_FOUND' && (
            <div className="flex flex-col items-center space-y-3 w-full text-left">
              <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 self-center">
                <Smartphone className="w-6 h-6" />
              </div>

              <div className="text-center w-full">
                <h4 className="font-black text-slate-900 text-base">Terminal no Registrada en Modo PinPad</h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  Clip no detectó la terminal <strong className="font-mono">{config.serialNumber}</strong> habilitada para recibir cobros remotos vía API.
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-950 space-y-1.5 w-full text-left">
                <p className="text-[11px] font-semibold text-amber-900">
                  ⚠️ ¿Por qué ocurre esto?
                </p>
                <p className="text-[11px] text-slate-700">
                  Las terminales Clip de fábrica requieren que Clip les instale la aplicación <strong>PinPad</strong> para poder enlazarse a la API. Se solicita a Clip vía <strong>developers@payclip.com</strong> con el número de serie <span className="font-mono font-bold">{config.serialNumber}</span>.
                </p>
                <p className="text-[11px] text-blue-800 font-semibold pt-1 border-t border-amber-200/60">
                  💡 Para no detener la venta: Puedes cobrar tecleando el monto en la pantalla física de tu terminal y luego presionar "Autorizar Manual".
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 w-full pt-2">
                <button
                  type="button"
                  onClick={() => runDiagnostic()}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Activity className="w-3.5 h-3.5 text-orange-600" />
                  Ver Diagnóstico
                </button>
                <button
                  type="button"
                  onClick={() => setStep('MANUAL_AUTH')}
                  className="bg-[#FF5A00] hover:bg-[#E04D00] text-white font-black py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1 shadow-md cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Autorizar Manual
                </button>
              </div>
            </div>
          )}

          {/* ESTADO 4D: TERMINAL APAGADA O SIN SEÑAL WI-FI */}
          {step === 'OFFLINE_ERROR' && (
            <div className="flex flex-col items-center space-y-3 w-full">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                <WifiOff className="w-8 h-8 stroke-[2]" />
              </div>

              <div className="space-y-1">
                <h4 className="font-black text-red-700 text-base">Terminal Clip Apagada o Sin Señal</h4>
                <p className="text-xs text-slate-600 px-2 leading-relaxed">
                  {errorMessage}
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-left text-xs text-amber-900 w-full space-y-1">
                <div className="flex items-center gap-1 font-bold text-amber-800">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Pasos para solucionar:</span>
                </div>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-slate-700">
                  <li>Verifica que la terminal Clip <strong>{config.serialNumber}</strong> esté encendida con pantalla activa.</li>
                  <li>Revisa que el ícono de <strong>Wi-Fi</strong> en la terminal esté conectado a tu red.</li>
                  <li>Si acabas de agregar variables en Netlify, haz <strong>Trigger deploy</strong>.</li>
                </ul>
              </div>

              <div className="grid grid-cols-2 gap-2 w-full pt-2">
                <button
                  type="button"
                  onClick={startClipTransaction}
                  className="bg-[#FF5A00] hover:bg-[#E04D00] text-white font-black py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reintentar
                </button>

                <button
                  type="button"
                  onClick={() => setStep('MANUAL_AUTH')}
                  className="bg-slate-800 hover:bg-slate-900 text-white font-black py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Autorizar Manual
                </button>
              </div>

              <button
                type="button"
                onClick={runDiagnostic}
                className="text-[11px] text-slate-500 hover:text-slate-800 underline font-semibold mt-1 cursor-pointer flex items-center gap-1"
              >
                <Activity className="w-3 h-3" />
                Ver diagnóstico en vivo
              </button>
            </div>
          )}

          {/* ESTADO 5: TIMEOUT */}
          {step === 'TIMEOUT_ERROR' && (
            <div className="flex flex-col items-center space-y-3 w-full">
              <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                <AlertTriangle className="w-8 h-8 stroke-[2]" />
              </div>
              <div>
                <h4 className="font-black text-slate-900 text-base">Tiempo de Espera Agotado</h4>
                <p className="text-xs text-slate-600 mt-1 max-w-xs">{errorMessage}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 w-full pt-2">
                <button
                  type="button"
                  onClick={startClipTransaction}
                  className="bg-[#FF5A00] hover:bg-[#E04D00] text-white font-black py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reintentar Cobro
                </button>
                <button
                  type="button"
                  onClick={() => setStep('MANUAL_AUTH')}
                  className="bg-slate-800 hover:bg-slate-900 text-white font-black py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                >
                  Autorizar Manual
                </button>
              </div>
            </div>
          )}

          {/* ESTADO 6: DIAGNÓSTICO EN VIVO */}
          {step === 'DIAGNOSTIC' && (
            <div className="flex flex-col items-center space-y-3 w-full text-left">
              <div className="flex items-center justify-between w-full border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-orange-600" />
                  <h4 className="font-black text-slate-900 text-sm">Diagnóstico de Terminal Clip</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('OFFLINE_ERROR')}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Cerrar
                </button>
              </div>

              {diagnosticLoading ? (
                <div className="py-8 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-6 h-6 text-orange-500 animate-spin" />
                  <span className="text-xs text-slate-500 font-bold">Consultando conexión con Clip...</span>
                </div>
              ) : diagnosticResult ? (
                <div className="space-y-2 w-full text-xs">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-600 font-medium">CLIP_API_KEY:</span>
                      <strong className={diagnosticResult.diagnosis?.has_api_key ? 'text-emerald-700' : 'text-red-600'}>
                        {diagnosticResult.diagnosis?.has_api_key ? '✅ Activa' : '❌ No detectada (Haz Trigger Deploy)'}
                      </strong>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-600 font-medium">Serie de Terminal:</span>
                      <span className="font-mono text-[11px] text-slate-800 font-bold">
                        {diagnosticResult.diagnosis?.env_serial_value || config.serialNumber}
                      </span>
                    </div>

                    {diagnosticResult.clip_http_status && (
                      <div className="flex justify-between pt-1 border-t border-slate-200">
                        <span className="text-slate-600 font-medium">Respuesta Servidor Clip:</span>
                        <span className={`font-mono font-bold ${diagnosticResult.clip_http_status === 200 ? 'text-emerald-600' : 'text-orange-600'}`}>
                          HTTP {diagnosticResult.clip_http_status}
                        </span>
                      </div>
                    )}
                  </div>

                  {diagnosticResult.message && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900">
                      {diagnosticResult.message}
                    </div>
                  )}

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={runDiagnostic}
                      className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Volver a diagnosticar
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* ESTADO 7: AUTORIZACIÓN MANUAL DE RESPALDO */}
          {step === 'MANUAL_AUTH' && (
            <form onSubmit={handleManualAuthSubmit} className="w-full text-left space-y-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs">
                <span className="font-bold text-slate-800 block mb-1">
                  Respaldo: ¿Cobraste directo en la terminal?
                </span>
                <p className="text-[11px] text-slate-600">
                  Si pasaste la tarjeta directamente en la terminal Clip y se imprimió el comprobante, ingresa el número de autorización para cerrar la venta:
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Código de Autorización / Aprobación (ej. 123456):
                </label>
                <input
                  type="text"
                  required
                  value={manualAuthCode}
                  onChange={(e) => setManualAuthCode(e.target.value)}
                  placeholder="Ej. 654321"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#FF5A00]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Últimos 4 dígitos de la tarjeta (Opcional):
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={manualLast4}
                  onChange={(e) => setManualLast4(e.target.value.replace(/\D/g, ''))}
                  placeholder="Ej. 1234"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#FF5A00]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('OFFLINE_ERROR')}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 px-3 rounded-xl text-xs cursor-pointer"
                >
                  Volver
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer"
                >
                  Confirmar Cobro
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          )}

        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex items-center justify-between text-xs text-slate-500">
          <span className="text-[11px] font-medium flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
            Terminal Clip P8C2240805000156 • Wi-Fi Activo
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-600 hover:text-slate-900 font-bold text-xs cursor-pointer hover:underline"
          >
            Cancelar
          </button>
        </div>

      </div>
    </div>
  );
};
