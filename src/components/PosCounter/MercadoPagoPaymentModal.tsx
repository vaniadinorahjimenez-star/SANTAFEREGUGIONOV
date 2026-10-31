import React, { useState, useEffect, useRef } from 'react';
import { 
  CreditCard, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  X, 
  Sliders, 
  ShieldCheck, 
  Smartphone, 
  Activity, 
  Radio, 
  Wifi, 
  ArrowRight,
  Sparkles,
  Zap
} from 'lucide-react';
import { 
  getStoredMercadoPagoConfig, 
  saveMercadoPagoConfig, 
  fetchPointDevices, 
  setDevicePdvMode, 
  createPointPaymentIntent, 
  checkPointPaymentIntent, 
  cancelPointPaymentIntent, 
  PointDevice, 
  PaymentIntentResult,
  DEFAULT_MP_PUBLIC_KEY,
  DEFAULT_MP_ACCESS_TOKEN
} from '../../services/mercadoPagoPointService';
import { playBeep, playCashSound } from '../../utils/audio';

interface MercadoPagoPaymentModalProps {
  isOpen: boolean;
  amount: number;
  folio: string;
  customerName?: string;
  onClose: () => void;
  onPaymentApproved: (details: {
    terminal: 'mercadopago';
    authCode: string;
    last4?: string;
    reference?: string;
  }) => void;
}

type MPPaymentStep = 
  | 'SELECT_DEVICE'
  | 'INITIATING'
  | 'ON_TERMINAL'
  | 'PROCESSING'
  | 'APPROVED'
  | 'FAILED'
  | 'MANUAL_AUTH';

export const MercadoPagoPaymentModal: React.FC<MercadoPagoPaymentModalProps> = ({
  isOpen,
  amount,
  folio,
  customerName,
  onClose,
  onPaymentApproved
}) => {
  const [config, setConfig] = useState(getStoredMercadoPagoConfig);
  const [step, setStep] = useState<MPPaymentStep>('INITIATING');
  const [statusMessage, setStatusMessage] = useState<string>('Enviando orden a la terminal Mercado Pago...');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [activeIntentId, setActiveIntentId] = useState<string>('');
  const [availableDevices, setAvailableDevices] = useState<PointDevice[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState<boolean>(false);
  const [authCode, setAuthCode] = useState<string>('');
  const [last4, setLast4] = useState<string>('');
  
  // Terminal selection / edit
  const [isEditingDevice, setIsEditingDevice] = useState<boolean>(false);
  const [customDeviceIdInput, setCustomDeviceIdInput] = useState<string>('');

  // Fallback manual
  const [manualAuthCode, setManualAuthCode] = useState<string>('');
  const [manualLast4, setManualLast4] = useState<string>('');

  const isPollingRef = useRef<boolean>(false);
  const timerRef = useRef<any>(null);

  // Al abrir el modal
  useEffect(() => {
    if (!isOpen) {
      stopPolling();
      return;
    }

    const currentConfig = getStoredMercadoPagoConfig();
    setConfig(currentConfig);
    setCustomDeviceIdInput(currentConfig.deviceId || '');
    setErrorMessage('');
    setAuthCode('');
    setLast4('');
    setManualAuthCode('');
    setManualLast4('');

    // Si no hay terminal configurada, buscar terminales vinculadas automáticamente
    if (!currentConfig.deviceId) {
      discoverAndStart(currentConfig);
    } else {
      startPaymentFlow(currentConfig.deviceId);
    }

    return () => {
      stopPolling();
    };
  }, [isOpen, amount, folio]);

  const stopPolling = () => {
    isPollingRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const discoverAndStart = async (currentConfig: any) => {
    setIsLoadingDevices(true);
    setStep('SELECT_DEVICE');
    setStatusMessage('Buscando terminales Mercado Pago Point asociadas a tu cuenta...');

    const res = await fetchPointDevices();
    setIsLoadingDevices(false);

    if (res.success && res.devices.length > 0) {
      setAvailableDevices(res.devices);
      // Si solo hay una terminal, seleccionarla automáticamente
      if (res.devices.length === 1) {
        const singleDevice = res.devices[0];
        const updated = { ...currentConfig, deviceId: singleDevice.id, terminalName: `Point (${singleDevice.id})` };
        saveMercadoPagoConfig(updated);
        setConfig(updated);
        setCustomDeviceIdInput(singleDevice.id);

        // Si el modo no es PDV, cambiarlo
        if (singleDevice.operating_mode !== 'PDV') {
          await setDevicePdvMode(singleDevice.id);
        }
        startPaymentFlow(singleDevice.id);
      }
    } else {
      setStep('SELECT_DEVICE');
      if (!res.success && res.message) {
        setErrorMessage(res.message);
      }
    }
  };

  const handleSelectDevice = async (device: PointDevice) => {
    playBeep(700, 'sine', 0.04);
    const updated = { ...config, deviceId: device.id, terminalName: `Point (${device.id})` };
    saveMercadoPagoConfig(updated);
    setConfig(updated);
    setCustomDeviceIdInput(device.id);
    setIsEditingDevice(false);

    if (device.operating_mode !== 'PDV') {
      setStatusMessage('Activando modo Punto de Venta (PDV) en la terminal...');
      await setDevicePdvMode(device.id);
    }

    startPaymentFlow(device.id);
  };

  const handleSaveCustomDevice = async () => {
    const trimmed = customDeviceIdInput.trim();
    if (!trimmed) return;
    playBeep(750, 'sine', 0.04);
    const updated = { ...config, deviceId: trimmed, terminalName: `Point (${trimmed})` };
    saveMercadoPagoConfig(updated);
    setConfig(updated);
    setIsEditingDevice(false);
    startPaymentFlow(trimmed);
  };

  const startPaymentFlow = async (targetDeviceId: string) => {
    stopPolling();
    setStep('INITIATING');
    setStatusMessage(`Enviando orden de $${amount.toFixed(2)} a la terminal ${targetDeviceId}...`);
    setErrorMessage('');

    const res = await createPointPaymentIntent(amount, folio, `Panadería Santa Fé #${folio}`, targetDeviceId);

    if (!res.success || !res.intentId) {
      setStep('FAILED');
      setErrorMessage(res.message || 'No fue posible conectar con la terminal Mercado Pago');
      return;
    }

    const assignedIntentId = res.intentId || `INTENT-${Date.now()}`;
    setActiveIntentId(assignedIntentId);
    setStep('ON_TERMINAL');
    setStatusMessage('¡Orden en terminal! Inserte, acerque o deslice su tarjeta...');
    playBeep(850, 'sine', 0.06);

    // Iniciar polling
    startPolling(assignedIntentId);
  };

  const startPolling = (intentId: string) => {
    isPollingRef.current = true;

    const poll = async () => {
      if (!isPollingRef.current) return;

      const result: PaymentIntentResult = await checkPointPaymentIntent(intentId, folio, config.deviceId);

      if (!isPollingRef.current) return;

      if (result.success && result.status === 'PROCESSED') {
        stopPolling();
        setStep('APPROVED');
        const approvedAuth = result.authCode || 'MP-OK';
        const approvedLast4 = result.last4 || '0000';
        const approvedRef = result.reference || folio;
        setAuthCode(approvedAuth);
        setLast4(approvedLast4);
        setStatusMessage('¡Cobro Aprobado en Terminal! Registrando venta con tarjeta en el sistema...');
        playCashSound();

        // Reconoce la señal y registra automáticamente la venta como tarjeta en el sistema
        setTimeout(() => {
          onPaymentApproved({
            terminal: 'mercadopago',
            authCode: approvedAuth,
            last4: approvedLast4,
            reference: approvedRef
          });
        }, 600);
        return;
      }

      if (result.status === 'CANCELED' || result.status === 'ABANDONED') {
        stopPolling();
        setStep('FAILED');
        setErrorMessage(result.message || 'Operación cancelada en la terminal');
        playBeep(350, 'sawtooth', 0.1);
        return;
      }

      if (result.status === 'PROCESSING') {
        setStep('PROCESSING');
        setStatusMessage('Procesando pago en el banco... No retire la tarjeta');
      } else if (result.status === 'ON_TERMINAL') {
        setStep('ON_TERMINAL');
        setStatusMessage('Esperando tarjeta o NIP en la pantalla de la terminal...');
      }

      // Siguiente ciclo de sondeo rápido en 1 segundo
      if (isPollingRef.current) {
        timerRef.current = setTimeout(poll, 1000);
      }
    };

    timerRef.current = setTimeout(poll, 400);
  };

  const handleCancelIntent = async () => {
    stopPolling();
    playBeep(450, 'sine', 0.05);
    if (config.deviceId) {
      await cancelPointPaymentIntent(config.deviceId);
    }
    onClose();
  };

  const handleFinishApproved = () => {
    playBeep(900, 'sine', 0.05);
    onPaymentApproved({
      terminal: 'mercadopago',
      authCode: authCode || 'MP-AUTO-OK',
      last4: last4 || '0000',
      reference: folio
    });
  };

  const handleConfirmManualAuth = () => {
    const code = manualAuthCode.trim() || `MP-${Math.floor(100000 + Math.random() * 900000)}`;
    const l4 = manualLast4.trim() || '0000';
    playCashSound();
    onPaymentApproved({
      terminal: 'mercadopago',
      authCode: code,
      last4: l4,
      reference: folio
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white text-slate-900 w-full max-w-md rounded-3xl shadow-2xl border-2 border-[#009EE3]/40 overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
        
        {/* Cabecera Mercado Pago */}
        <div className="bg-gradient-to-r from-[#009EE3] to-[#007EB5] text-white p-4 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white p-1 flex items-center justify-center shadow-sm">
              <span className="text-xl">🟦</span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-black text-base leading-tight tracking-tight text-white">
                  Mercado Pago Point
                </h3>
                <span className="bg-white/20 text-[10px] font-black uppercase px-2 py-0.5 rounded-full text-white tracking-wider">
                  Terminal
                </span>
              </div>
              <p className="text-[11px] text-cyan-100 font-medium">
                Cobro directo por tarjeta / Contactless
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCancelIntent}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Cancelar o cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resumen del cobro actual */}
        <div className="bg-cyan-50/70 border-b border-cyan-100 p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
              Folio #{folio} {customerName ? `• ${customerName}` : ''}
            </span>
            <span className="text-2xl font-black font-mono text-[#007EB5]">
              ${amount.toFixed(2)} MXN
            </span>
          </div>

          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              Terminal Asignada
            </span>
            <div className="flex items-center gap-1 text-xs font-bold text-slate-700">
              <Smartphone className="w-3.5 h-3.5 text-[#009EE3]" />
              <span className="font-mono truncate max-w-[140px]">
                {config.deviceId || 'No seleccionada'}
              </span>
              <button
                type="button"
                onClick={() => setIsEditingDevice(!isEditingDevice)}
                className="text-[#009EE3] hover:text-[#007EB5] ml-1 p-0.5 rounded cursor-pointer"
                title="Cambiar terminal"
              >
                <Sliders className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Panel de edición / cambio rápido de terminal */}
        {isEditingDevice && (
          <div className="bg-slate-50 border-b border-slate-200 p-3 space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-800">
                Seleccionar o Ingresar Terminal Point:
              </span>
              <button
                type="button"
                onClick={() => discoverAndStart(config)}
                className="text-[11px] text-[#009EE3] font-bold flex items-center gap-1 hover:underline cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Buscar Terminales</span>
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="ID o Serie de la terminal (ej: GERTEC_MP35P__...)"
                value={customDeviceIdInput}
                onChange={(e) => setCustomDeviceIdInput(e.target.value)}
                className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-mono font-bold focus:ring-2 focus:ring-[#009EE3] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSaveCustomDevice}
                className="bg-[#009EE3] hover:bg-[#007EB5] text-white px-3 py-1.5 rounded-xl font-black text-xs cursor-pointer shadow-xs"
              >
                Usar
              </button>
            </div>

            {availableDevices.length > 0 && (
              <div className="space-y-1 pt-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Terminales vinculadas encontradas:
                </span>
                <div className="grid grid-cols-1 gap-1 max-h-32 overflow-y-auto">
                  {availableDevices.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => handleSelectDevice(d)}
                      className="text-left bg-white hover:bg-cyan-50 border border-slate-200 hover:border-[#009EE3] p-2 rounded-xl flex items-center justify-between text-xs cursor-pointer"
                    >
                      <div>
                        <div className="font-mono font-black text-slate-800">{d.id}</div>
                        <div className="text-[10px] text-slate-400">Modo: {d.operating_mode || 'PDV'}</div>
                      </div>
                      <span className="text-[10px] font-black bg-cyan-100 text-[#007EB5] px-2 py-0.5 rounded-full">
                        Seleccionar
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Contenido según el estado */}
        <div className="p-6 flex-1 flex flex-col items-center justify-center text-center space-y-4">
          
          {/* PASO 1: SELECCIONAR TERMINAL (Si no había ninguna) */}
          {step === 'SELECT_DEVICE' && (
            <div className="space-y-4 w-full">
              <div className="w-16 h-16 rounded-full bg-cyan-100 text-[#009EE3] mx-auto flex items-center justify-center shadow-inner">
                <Smartphone className="w-8 h-8" />
              </div>
              <div>
                <h4 className="font-black text-lg text-slate-900">
                  {isLoadingDevices ? 'Buscando tu Terminal Point...' : 'Conectar Terminal Mercado Pago'}
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                  {isLoadingDevices 
                    ? 'Consultando terminales registradas en tu cuenta de Mercado Pago...'
                    : 'Ingresa el ID de tu terminal o selecciona una de las disponibles para enviar el cobro.'}
                </p>
              </div>

              {isLoadingDevices ? (
                <div className="flex items-center justify-center gap-2 py-4 text-cyan-600 font-bold text-xs">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Conectando con la API de Mercado Pago...</span>
                </div>
              ) : (
                <div className="space-y-2 text-left">
                  <label className="text-[11px] font-bold text-slate-700 block">
                    ID o Número de Terminal (Point Smart / Point Air):
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ej: GERTEC_MP35P__12345678"
                      value={customDeviceIdInput}
                      onChange={(e) => setCustomDeviceIdInput(e.target.value)}
                      className="flex-1 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold"
                    />
                    <button
                      type="button"
                      onClick={handleSaveCustomDevice}
                      disabled={!customDeviceIdInput.trim()}
                      className="bg-[#009EE3] hover:bg-[#007EB5] disabled:opacity-40 text-white font-black text-xs px-4 py-2 rounded-xl cursor-pointer"
                    >
                      Cobrar
                    </button>
                  </div>

                  {errorMessage && (
                    <div className="bg-amber-50 text-amber-900 text-xs p-2.5 rounded-xl border border-amber-200">
                      {errorMessage}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => discoverAndStart(config)}
                    className="w-full text-center text-xs text-[#009EE3] font-bold py-2 hover:underline cursor-pointer"
                  >
                    🔄 Volver a buscar terminales vinculadas
                  </button>
                </div>
              )}
            </div>
          )}

          {/* PASO 2: INITIATING / ON_TERMINAL */}
          {(step === 'INITIATING' || step === 'ON_TERMINAL') && (
            <div className="space-y-4 w-full">
              <div className="relative w-20 h-20 mx-auto">
                {/* Ondas pulsantes de señal */}
                <div className="absolute inset-0 rounded-full bg-[#009EE3]/20 animate-ping"></div>
                <div className="relative w-20 h-20 rounded-full bg-gradient-to-tr from-[#009EE3] to-[#00C1FF] text-white flex items-center justify-center shadow-lg shadow-cyan-500/30">
                  <CreditCard className="w-10 h-10 animate-bounce" />
                </div>
              </div>

              <div>
                <h4 className="font-black text-xl text-slate-900">
                  {step === 'INITIATING' ? 'Enviando a la Terminal...' : 'Esperando Tarjeta en Terminal'}
                </h4>
                <p className="text-xs text-slate-600 font-bold mt-1 max-w-xs mx-auto">
                  {statusMessage}
                </p>
              </div>

              {/* Indicador visual de inserción / contactless */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-left space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span>Pantalla de la terminal Point activa con <strong>${amount.toFixed(2)}</strong></span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] font-bold text-slate-500">
                  <div className="bg-white p-1.5 rounded-lg border border-slate-100">
                    📶 Contactless (NFC)
                  </div>
                  <div className="bg-white p-1.5 rounded-lg border border-slate-100">
                    💳 Chip (Insertar)
                  </div>
                  <div className="bg-white p-1.5 rounded-lg border border-slate-100">
                    🪪 Banda Magnética
                  </div>
                </div>
              </div>

              {/* Botón de acción directa si la terminal ya cobró */}
              <div className="w-full pt-1">
                <button
                  type="button"
                  onClick={() => {
                    stopPolling();
                    playCashSound();
                    onPaymentApproved({
                      terminal: 'mercadopago',
                      authCode: authCode || `MP-${Math.floor(100000 + Math.random() * 900000)}`,
                      last4: last4 || '0000',
                      reference: folio
                    });
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black py-2.5 px-3 rounded-xl text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                  <span>Terminal Aprobada (Registrar Venta con Tarjeta)</span>
                </button>
                <p className="text-[10px] text-slate-400 text-center mt-1">
                  Sondeando señal en vivo... Si la terminal ya emitió su ticket, presiona aquí para registrar de inmediato.
                </p>
              </div>
            </div>
          )}

          {/* PASO 3: PROCESSING */}
          {step === 'PROCESSING' && (
            <div className="space-y-4 w-full">
              <div className="w-20 h-20 rounded-full bg-amber-500 text-white mx-auto flex items-center justify-center shadow-lg shadow-amber-500/30">
                <RefreshCw className="w-10 h-10 animate-spin" />
              </div>
              <div>
                <h4 className="font-black text-xl text-slate-900">
                  Procesando con el Banco
                </h4>
                <p className="text-xs text-amber-700 font-bold mt-1">
                  Tarjeta detectada. Esperando autorización o NIP del cliente...
                </p>
              </div>

              {/* Botón de acción directa si la terminal ya aprobó en banco */}
              <div className="w-full pt-1">
                <button
                  type="button"
                  onClick={() => {
                    stopPolling();
                    playCashSound();
                    onPaymentApproved({
                      terminal: 'mercadopago',
                      authCode: authCode || `MP-${Math.floor(100000 + Math.random() * 900000)}`,
                      last4: last4 || '0000',
                      reference: folio
                    });
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black py-2.5 px-3 rounded-xl text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                  <span>Terminal Aprobada (Registrar Venta con Tarjeta)</span>
                </button>
              </div>
            </div>
          )}

          {/* PASO 4: APPROVED */}
          {step === 'APPROVED' && (
            <div className="space-y-4 w-full animate-in zoom-in-95">
              <div className="w-20 h-20 rounded-full bg-emerald-500 text-white mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/40">
                <CheckCircle2 className="w-12 h-12" />
              </div>

              <div>
                <span className="bg-emerald-100 text-emerald-800 text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider inline-flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> Pago Aprobado
                </span>
                <h4 className="font-black text-2xl text-slate-900 mt-2">
                  ¡Cobro Exitoso!
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  La terminal Mercado Pago aprobó la transacción
                </p>
              </div>

              {/* Recibo digital */}
              <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-3.5 text-xs font-mono space-y-1 text-slate-700 text-left">
                <div className="flex justify-between">
                  <span className="font-bold text-slate-500">Monto:</span>
                  <span className="font-black text-emerald-700">${amount.toFixed(2)} MXN</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-slate-500">Autorización:</span>
                  <span className="font-black">{authCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-slate-500">Tarjeta terminación:</span>
                  <span className="font-black">•••• {last4}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-slate-500">Terminal:</span>
                  <span className="truncate">{config.deviceId}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleFinishApproved}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 rounded-2xl text-sm shadow-lg shadow-emerald-600/30 active:scale-98 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Finalizar y Emitir Ticket 🖨️</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* PASO 5: FAILED / ERROR */}
          {step === 'FAILED' && (
            <div className="space-y-4 w-full">
              <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-600 mx-auto flex items-center justify-center">
                <AlertTriangle className="w-8 h-8" />
              </div>

              <div>
                <h4 className="font-black text-lg text-slate-900">
                  No se completó el cobro
                </h4>
                <p className="text-xs text-rose-600 font-bold mt-1">
                  {errorMessage || 'Ocurrió un error con la terminal Mercado Pago'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 w-full pt-2">
                <button
                  type="button"
                  onClick={() => config.deviceId && startPaymentFlow(config.deviceId)}
                  className="bg-[#009EE3] hover:bg-[#007EB5] text-white font-black py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reintentar</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStep('MANUAL_AUTH')}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-black py-2.5 px-3 rounded-xl text-xs cursor-pointer"
                >
                  Cobro Manual
                </button>
              </div>
            </div>
          )}

          {/* PASO 6: MANUAL AUTH (RESPALDO) */}
          {step === 'MANUAL_AUTH' && (
            <div className="space-y-3 w-full text-left">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-900">
                <strong>Autorización Manual de Respaldo:</strong> Si cobraste directamente en la terminal en modo independiente o tarjeta bancaria, ingresa el código del voucher para cerrar la venta.
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Código de Autorización (Voucher):
                </label>
                <input
                  type="text"
                  placeholder="Ej: 048291"
                  value={manualAuthCode}
                  onChange={(e) => setManualAuthCode(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Últimos 4 dígitos de la tarjeta (opcional):
                </label>
                <input
                  type="text"
                  maxLength={4}
                  placeholder="Ej: 4321"
                  value={manualLast4}
                  onChange={(e) => setManualLast4(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('FAILED')}
                  className="py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs"
                >
                  Regresar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmManualAuth}
                  className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs shadow-md cursor-pointer"
                >
                  Aprobar Venta
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Pie de modal con botón de cancelación */}
        {step !== 'APPROVED' && (
          <div className="bg-slate-50 border-t border-slate-100 p-3 flex justify-between items-center text-xs">
            <span className="text-[11px] text-slate-400 font-medium">
              Panadería Santa Fé • Mercado Pago Point
            </span>

            <button
              type="button"
              onClick={handleCancelIntent}
              className="text-rose-600 hover:text-rose-800 font-bold px-3 py-1.5 rounded-lg hover:bg-rose-50 cursor-pointer transition-colors"
            >
              Cancelar Cobro
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
