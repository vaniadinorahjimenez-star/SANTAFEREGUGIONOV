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
  Zap,
  Banknote
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
  PointFailureKind,
  DEFAULT_MP_PUBLIC_KEY,
  DEFAULT_MP_ACCESS_TOKEN
} from '../../services/mercadoPagoPointService';
import { playBeep, playCashSound } from '../../utils/audio';
import { BranchId } from '../../types';

interface MercadoPagoPaymentModalProps {
  isOpen: boolean;
  amount: number;
  folio: string;
  customerName?: string;
  branch?: BranchId;
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
  branch = 'refugio',
  onClose,
  onPaymentApproved
}) => {
  const activeBranch: BranchId = branch === 'zakia' ? 'zakia' : 'refugio';
  const [config, setConfig] = useState(() => getStoredMercadoPagoConfig(activeBranch));
  const [step, setStep] = useState<MPPaymentStep>('INITIATING');
  const [statusMessage, setStatusMessage] = useState<string>('Enviando orden a la terminal Mercado Pago...');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [failureKind, setFailureKind] = useState<PointFailureKind>('DECLINED');
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
  const hasApprovedExecutedRef = useRef<boolean>(false);
  const isApprovedStateRef = useRef<boolean>(false);
  const autoApproveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeFlowIdRef = useRef<number>(0);
  const activeDeviceIdRef = useRef<string>(config.deviceId || '');
  const activeIntentIdRef = useRef<string>('');
  const serverCreatedAtRef = useRef<number | undefined>(undefined);
  const consecutivePollErrorsRef = useRef<number>(0);
  const pollCountRef = useRef<number>(0);
  const [isManualVerifying, setIsManualVerifying] = useState<boolean>(false);

  // Mantener siempre las props más frescas en refs para que re-renders de sincronización en vivo
  // NUNCA maten el sondeo ni ejecuten un onPaymentApproved obsoleto
  const onPaymentApprovedRef = useRef(onPaymentApproved);
  onPaymentApprovedRef.current = onPaymentApproved;
  const amountRef = useRef(amount);
  amountRef.current = amount;
  const folioRef = useRef(folio);
  folioRef.current = folio;

  // Al abrir el modal (solo cuando isOpen cambia a true o cambia la sucursal)
  useEffect(() => {
    if (!isOpen) {
      activeFlowIdRef.current += 1;
      stopPolling(true);
      hasApprovedExecutedRef.current = false;
      isApprovedStateRef.current = false;
      return;
    }

    hasApprovedExecutedRef.current = false;
    isApprovedStateRef.current = false;
    consecutivePollErrorsRef.current = 0;
    pollCountRef.current = 0;
    if (autoApproveTimerRef.current) {
      clearTimeout(autoApproveTimerRef.current);
      autoApproveTimerRef.current = null;
    }

    const currentConfig = getStoredMercadoPagoConfig(activeBranch);
    setConfig(currentConfig);
    activeDeviceIdRef.current = currentConfig.deviceId || '';
    setCustomDeviceIdInput(currentConfig.deviceId || '');
    setErrorMessage('');
    setFailureKind('DECLINED');
    setAuthCode('');
    setLast4('');
    setManualAuthCode('');
    setManualLast4('');
    setIsManualVerifying(false);

    // Si no hay terminal configurada, buscar terminales vinculadas automáticamente
    if (!currentConfig.deviceId) {
      discoverAndStart(currentConfig);
    } else {
      startPaymentFlow(currentConfig.deviceId, false);
    }

    return () => {
      activeFlowIdRef.current += 1;
      stopPolling(!isApprovedStateRef.current);
    };
  }, [isOpen, activeBranch]);

  const stopPolling = (clearAutoApprove: boolean = false) => {
    isPollingRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (clearAutoApprove && autoApproveTimerRef.current) {
      clearTimeout(autoApproveTimerRef.current);
      autoApproveTimerRef.current = null;
    }
  };

  // Ejecuta la aprobación exactamente una sola vez (previene doble cobro o doble ticket)
  const executeApprovalOnce = (details: {
    terminal: 'mercadopago';
    authCode: string;
    last4: string;
    reference: string;
  }) => {
    if (hasApprovedExecutedRef.current) {
      console.warn('executeApprovalOnce: Cobro ya procesado previamente, omitiendo duplicado.');
      return;
    }
    hasApprovedExecutedRef.current = true;
    if (autoApproveTimerRef.current) {
      clearTimeout(autoApproveTimerRef.current);
      autoApproveTimerRef.current = null;
    }
    stopPolling(true);
    onPaymentApprovedRef.current(details);
  };

  const discoverAndStart = async (currentConfig: any) => {
    setIsLoadingDevices(true);
    setStep('SELECT_DEVICE');
    setStatusMessage('Buscando terminales Mercado Pago Point asociadas a tu cuenta...');

    const res = await fetchPointDevices(activeBranch);
    setIsLoadingDevices(false);

    if (res.success && res.devices.length > 0) {
      setAvailableDevices(res.devices);
      // Si solo hay una terminal, seleccionarla automáticamente
      if (res.devices.length === 1) {
        const singleDevice = res.devices[0];
        const updated = { ...currentConfig, deviceId: singleDevice.id, terminalName: `Point (${singleDevice.id})` };
        saveMercadoPagoConfig(updated, activeBranch);
        setConfig(updated);
        setCustomDeviceIdInput(singleDevice.id);

        // Si el modo no es PDV, cambiarlo
        if (singleDevice.operating_mode !== 'PDV') {
          await setDevicePdvMode(singleDevice.id, activeBranch);
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
    saveMercadoPagoConfig(updated, activeBranch);
    setConfig(updated);
    setCustomDeviceIdInput(device.id);
    setIsEditingDevice(false);

    if (device.operating_mode !== 'PDV') {
      setStatusMessage('Activando modo Punto de Venta (PDV) en la terminal...');
      await setDevicePdvMode(device.id, activeBranch);
    }

    startPaymentFlow(device.id);
  };

  const handleSaveCustomDevice = async () => {
    const trimmed = customDeviceIdInput.trim();
    if (!trimmed) return;
    playBeep(750, 'sine', 0.04);
    const updated = { ...config, deviceId: trimmed, terminalName: `Point (${trimmed})` };
    saveMercadoPagoConfig(updated, activeBranch);
    setConfig(updated);
    setIsEditingDevice(false);
    startPaymentFlow(trimmed);
  };

  const handleApprovedResult = (result: PaymentIntentResult) => {
    if (isApprovedStateRef.current) return;
    isApprovedStateRef.current = true;
    consecutivePollErrorsRef.current = 0;
    stopPolling(false);
    setStep('APPROVED');
    const approvedAuth = result.authCode || 'MP-OK';
    const approvedLast4 = result.last4 || '0000';
    const approvedRef = result.reference || folioRef.current;
    setAuthCode(approvedAuth);
    setLast4(approvedLast4);
    setStatusMessage('¡Cobro Aprobado en Terminal! Registrando venta con tarjeta en el sistema...');
    playCashSound();

    if (!hasApprovedExecutedRef.current) {
      autoApproveTimerRef.current = setTimeout(() => {
        executeApprovalOnce({
          terminal: 'mercadopago',
          authCode: approvedAuth,
          last4: approvedLast4,
          reference: approvedRef
        });
      }, 1100);
    }
  };

  const startPaymentFlow = async (targetDeviceId: string, forceNew: boolean = false) => {
    stopPolling(true);
    const flowId = ++activeFlowIdRef.current;
    activeDeviceIdRef.current = targetDeviceId;
    consecutivePollErrorsRef.current = 0;
    pollCountRef.current = 0;
    isApprovedStateRef.current = false;

    const currentAmount = amountRef.current;
    const currentFolio = folioRef.current;

    setStep('INITIATING');
    setStatusMessage(`Enviando orden de $${currentAmount.toFixed(2)} a la terminal ${targetDeviceId}...`);
    setErrorMessage('');

    // Si es un reintento explícito del cajero, liberar cualquier intento previo antes de enviar el nuevo
    if (forceNew) {
      try {
        await cancelPointPaymentIntent(targetDeviceId, activeBranch, activeIntentIdRef.current || undefined);
      } catch (_) {}
      if (flowId !== activeFlowIdRef.current) return;
    }

    const res = await createPointPaymentIntent(
      currentAmount,
      currentFolio,
      `Panadería Santa Fé #${currentFolio}`,
      targetDeviceId,
      activeBranch,
      { forceNew }
    );

    if (flowId !== activeFlowIdRef.current) return;

    if (!res.success || !res.intentId) {
      setFailureKind(res.failureKind || 'TERMINAL_ERROR');
      setStep('FAILED');
      setErrorMessage(res.message || 'No fue posible conectar con la terminal Mercado Pago');
      return;
    }

    const assignedIntentId = res.intentId;
    activeIntentIdRef.current = assignedIntentId;
    serverCreatedAtRef.current = res.serverCreatedAt;
    setActiveIntentId(assignedIntentId);
    setStep('ON_TERMINAL');
    setStatusMessage('¡Orden en terminal! Inserte, acerque o deslice su tarjeta...');
    playBeep(850, 'sine', 0.06);

    // Iniciar polling pasando el deviceId y timestamp del servidor exactos de este cobro
    startPolling(assignedIntentId, targetDeviceId, res.serverCreatedAt, flowId);
  };

  const startPolling = (intentId: string, targetDeviceId: string, serverCreatedAt: number | undefined, flowId: number) => {
    isPollingRef.current = true;

    const poll = async () => {
      if (!isPollingRef.current || flowId !== activeFlowIdRef.current || isApprovedStateRef.current) return;

      pollCountRef.current += 1;
      const shouldDeepCheck = pollCountRef.current % 3 === 0;

      const result: PaymentIntentResult = await checkPointPaymentIntent(
        intentId,
        folioRef.current,
        targetDeviceId,
        activeBranch,
        {
          serverCreatedAt,
          amount: amountRef.current,
          deepCheck: shouldDeepCheck
        }
      );

      if (!isPollingRef.current || flowId !== activeFlowIdRef.current || isApprovedStateRef.current) return;

      if (result.success && result.status === 'PROCESSED') {
        handleApprovedResult(result);
        return;
      }

      if (result.status === 'CANCELED' || result.status === 'ABANDONED') {
        consecutivePollErrorsRef.current = 0;
        stopPolling(true);
        setFailureKind(result.failureKind || 'CANCELED');
        setStep('FAILED');
        setErrorMessage(result.message || 'Operación cancelada o declinada en la terminal.');
        playBeep(350, 'sawtooth', 0.12);
        return;
      }

      // Tolerar hasta 8 errores transitorios consecutivos de red/API antes de abortar
      if (result.status === 'ERROR') {
        consecutivePollErrorsRef.current += 1;
        if (consecutivePollErrorsRef.current >= 8) {
          stopPolling(true);
          setFailureKind('TERMINAL_ERROR');
          setStep('FAILED');
          setErrorMessage(result.message || 'Se perdió temporalmente la comunicación con Mercado Pago. Verifica la pantalla de tu terminal.');
          playBeep(350, 'sawtooth', 0.12);
          return;
        }
      } else {
        consecutivePollErrorsRef.current = 0;
        if (result.status === 'PROCESSING') {
          setStep('PROCESSING');
          setStatusMessage('Procesando pago en el banco... No retire la tarjeta');
        } else if (result.status === 'ON_TERMINAL') {
          setStep('ON_TERMINAL');
          setStatusMessage('Esperando tarjeta o NIP en la pantalla de la terminal...');
        }
      }

      // Siguiente ciclo de sondeo rápido en 1 segundo
      if (isPollingRef.current && flowId === activeFlowIdRef.current && !isApprovedStateRef.current) {
        timerRef.current = setTimeout(poll, 1000);
      }
    };

    timerRef.current = setTimeout(poll, 600);
  };

  const handleManualVerifyNow = async () => {
    const intentId = activeIntentIdRef.current;
    const targetDeviceId = activeDeviceIdRef.current || config.deviceId;
    if (!intentId || !targetDeviceId || isApprovedStateRef.current) return;
    setIsManualVerifying(true);
    playBeep(700, 'sine', 0.03);
    try {
      const result = await checkPointPaymentIntent(
        intentId,
        folioRef.current,
        targetDeviceId,
        activeBranch,
        {
          serverCreatedAt: serverCreatedAtRef.current,
          amount: amountRef.current,
          deepCheck: true
        }
      );
      if (result.success && result.status === 'PROCESSED') {
        handleApprovedResult(result);
      } else if (result.status === 'CANCELED' || result.status === 'ABANDONED') {
        stopPolling(true);
        setFailureKind(result.failureKind || 'CANCELED');
        setStep('FAILED');
        setErrorMessage(result.message || 'Operación cancelada o declinada en la terminal.');
      } else {
        setStatusMessage('Verificado con Mercado Pago: esperando confirmación de la terminal...');
      }
    } finally {
      setIsManualVerifying(false);
    }
  };

  const handleReleaseAndRetry = async () => {
    const devId = activeDeviceIdRef.current || config.deviceId;
    if (!devId) return;
    setStep('INITIATING');
    setStatusMessage('Liberando terminal y asegurando modo PDV...');
    try {
      await cancelPointPaymentIntent(devId, activeBranch, activeIntentIdRef.current || undefined);
      await setDevicePdvMode(devId, activeBranch);
    } catch (_) {}
    startPaymentFlow(devId, true);
  };

  const handleCancelIntent = async () => {
    activeFlowIdRef.current += 1;
    stopPolling(true);
    hasApprovedExecutedRef.current = true;
    playBeep(450, 'sine', 0.05);
    const devId = activeDeviceIdRef.current || config.deviceId;
    if (devId) {
      await cancelPointPaymentIntent(devId, activeBranch, activeIntentIdRef.current || activeIntentId);
    }
    activeIntentIdRef.current = '';
    onClose();
  };

  const handleFinishApproved = () => {
    playBeep(900, 'sine', 0.05);
    executeApprovalOnce({
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
    executeApprovalOnce({
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
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="font-black text-base leading-tight tracking-tight text-white">
                  Mercado Pago Point
                </h3>
                <span className="bg-white/20 text-[10px] font-black uppercase px-2 py-0.5 rounded-full text-white tracking-wider">
                  {branch === 'zakia' ? '🌿 Zakia' : '🥖 El Refugio'}
                </span>
              </div>
              <p className="text-[11px] text-cyan-100 font-medium">
                Terminal {config.deviceId || (branch === 'zakia' ? 'Point Smart Zakia' : 'El Refugio')} • Cobro con Tarjeta
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

              {step === 'ON_TERMINAL' && activeIntentId && (
                <button
                  type="button"
                  onClick={handleManualVerifyNow}
                  disabled={isManualVerifying}
                  className="w-full py-2 px-3 rounded-xl bg-cyan-50 hover:bg-cyan-100 text-[#007EB5] border border-cyan-200 text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isManualVerifying ? 'animate-spin' : ''}`} />
                  <span>{isManualVerifying ? 'Verificando pago con Mercado Pago...' : '¿Ya pagó en la terminal? Verificar cobro ahora'}</span>
                </button>
              )}
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
              {activeIntentId && (
                <button
                  type="button"
                  onClick={handleManualVerifyNow}
                  disabled={isManualVerifying}
                  className="w-full py-2 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isManualVerifying ? 'animate-spin' : ''}`} />
                  <span>{isManualVerifying ? 'Consultando estado...' : 'Verificar confirmación ahora'}</span>
                </button>
              )}
            </div>
          )}

          {/* PASO 4: APPROVED */}
          {step === 'APPROVED' && (
            <div className="space-y-4 w-full animate-in zoom-in-95">
              {/* Animación de la Donita Sonriente (Celebración Cobro Exitoso con Tarjeta) */}
              <div className="relative mx-auto w-36 h-36 flex items-center justify-center my-1">
                {/* Resplandor cálido de fondo */}
                <div className="absolute inset-0 rounded-full bg-pink-400/30 blur-xl animate-pulse" />

                {/* Donita Sonriente Animada con Glaseado de Fresa y Chispitas */}
                <svg
                  viewBox="0 0 200 200"
                  className="w-full h-full drop-shadow-2xl animate-bounce"
                  style={{ animationDuration: '0.85s', animationIterationCount: 'infinite' }}
                >
                  <defs>
                    <radialGradient id="modalDoughGrad" cx="45%" cy="40%" r="60%">
                      <stop offset="0%" stopColor="#FDE68A" />
                      <stop offset="50%" stopColor="#F59E0B" />
                      <stop offset="85%" stopColor="#D97706" />
                      <stop offset="100%" stopColor="#92400E" />
                    </radialGradient>
                    <linearGradient id="modalPinkGlazeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#FDA4AF" />
                      <stop offset="40%" stopColor="#F43F5E" />
                      <stop offset="100%" stopColor="#BE123C" />
                    </linearGradient>
                    <linearGradient id="modalGlazeHigh" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
                      <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.1" />
                    </linearGradient>
                    <filter id="modalDonutShadow" x="-15%" y="-15%" width="130%" height="130%">
                      <feDropShadow dx="0" dy="6" stdDeviation="4" floodColor="#78350F" floodOpacity="0.3" />
                    </filter>
                  </defs>

                  {/* 1. Aro base de masa horneada dorada */}
                  <path
                    d="M 100 15 A 85 85 0 1 1 99.9 15 Z M 100 70 A 30 30 0 1 0 100.1 70 Z"
                    fill="url(#modalDoughGrad)"
                    stroke="#78350F"
                    strokeWidth="4"
                    fillRule="evenodd"
                    filter="url(#modalDonutShadow)"
                  />

                  {/* 2. Glaseado rosa fresa con gotas deliciosas */}
                  <path
                    d="M 100 20 C 135 20, 168 36, 178 68 C 183 82, 176 96, 174 110 C 172 126, 180 138, 168 152 C 156 166, 142 160, 130 168 C 118 176, 110 180, 95 178 C 78 176, 68 165, 54 165 C 38 165, 26 148, 22 130 C 18 112, 26 98, 22 80 C 18 60, 38 32, 70 22 C 80 18, 90 20, 100 20 Z M 100 68 C 85 68, 72 80, 72 100 C 72 118, 85 132, 100 132 C 116 132, 128 118, 128 100 C 128 80, 116 68, 100 68 Z"
                    fill="url(#modalPinkGlazeGrad)"
                    stroke="#9F1239"
                    strokeWidth="2.5"
                    fillRule="evenodd"
                  />

                  {/* 3. Brillo de glaseado */}
                  <path d="M 52 38 C 72 26, 118 24, 148 40 C 132 32, 92 30, 60 44 Z" fill="url(#modalGlazeHigh)" />
                  <ellipse cx="44" cy="62" rx="7" ry="14" transform="rotate(-30 44 62)" fill="url(#modalGlazeHigh)" />

                  {/* 4. Chispitas crujientes de colores */}
                  <rect x="52" y="48" width="12" height="4" rx="2" transform="rotate(25 52 48)" fill="#FFFFFF" />
                  <rect x="135" y="44" width="12" height="4" rx="2" transform="rotate(-35 135 44)" fill="#FFFFFF" />
                  <rect x="156" y="112" width="12" height="4" rx="2" transform="rotate(40 156 112)" fill="#FFFFFF" />
                  <rect x="80" y="32" width="12" height="4" rx="2" transform="rotate(15 80 32)" fill="#FDE047" />
                  <rect x="158" y="78" width="12" height="4" rx="2" transform="rotate(70 158 78)" fill="#FDE047" />
                  <rect x="115" y="34" width="12" height="4" rx="2" transform="rotate(-15 115 34)" fill="#38BDF8" />
                  <rect x="38" y="58" width="11" height="4" rx="2" transform="rotate(80 38 58)" fill="#4ADE80" />
                  <rect x="68" y="160" width="11" height="4" rx="2" transform="rotate(50 68 160)" fill="#C084FC" />
                  <rect x="98" y="30" width="11" height="4" rx="2" transform="rotate(85 98 30)" fill="#FB923C" />

                  {/* 5. Mejillas sonrojadas tiernas */}
                  <ellipse cx="48" cy="104" rx="10" ry="6" fill="#FB7185" opacity="0.9" />
                  <ellipse cx="152" cy="104" rx="10" ry="6" fill="#FB7185" opacity="0.9" />

                  {/* 6. Ojitos felices curvos cerrados (^_^) */}
                  <path d="M 52 93 Q 65 78 78 93" fill="none" stroke="#3E1F08" strokeWidth="5.5" strokeLinecap="round" />
                  <path d="M 122 93 Q 135 78 148 93" fill="none" stroke="#3E1F08" strokeWidth="5.5" strokeLinecap="round" />

                  {/* 7. Boquita sonriente abierta con lengüita */}
                  <path d="M 84 104 Q 100 130 116 104 Z" fill="#881337" stroke="#3E1F08" strokeWidth="4" />
                  <path d="M 88 112 Q 100 110 112 112 Q 100 128 88 112 Z" fill="#FB7185" />
                </svg>
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

          {/* PASO 5: FAILED / REJECTED / BUSY / CONNECTION ERROR */}
          {step === 'FAILED' && (
            <div className="space-y-4 w-full animate-in zoom-in-95">
              <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center shadow-inner ${
                failureKind === 'TERMINAL_BUSY' || failureKind === 'TERMINAL_ERROR'
                  ? 'bg-amber-100 text-amber-600'
                  : 'bg-rose-100 text-rose-600'
              }`}>
                <AlertTriangle className="w-8 h-8 stroke-[2.5]" />
              </div>

              <div>
                <span className={`text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider inline-flex items-center gap-1 ${
                  failureKind === 'TERMINAL_BUSY' || failureKind === 'TERMINAL_ERROR'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-rose-100 text-rose-800'
                }`}>
                  {failureKind === 'TERMINAL_BUSY'
                    ? 'Terminal Ocupada'
                    : failureKind === 'TERMINAL_ERROR'
                      ? 'Error de Comunicación'
                      : failureKind === 'CANCELED'
                        ? 'Cobro Cancelado'
                        : 'Cobro No Realizado'}
                </span>
                <h4 className="font-black text-xl text-slate-900 mt-2">
                  {failureKind === 'TERMINAL_BUSY'
                    ? 'Hay un Cobro Pendiente en Terminal'
                    : failureKind === 'TERMINAL_ERROR'
                      ? 'No se Pudo Enviar a la Terminal'
                      : failureKind === 'CANCELED'
                        ? 'Operación Cancelada en Terminal'
                        : 'Tarjeta Declinada por el Banco'}
                </h4>
                <p className={`text-xs font-bold mt-1 max-w-xs mx-auto ${
                  failureKind === 'TERMINAL_BUSY' || failureKind === 'TERMINAL_ERROR'
                    ? 'text-amber-700'
                    : 'text-rose-600'
                }`}>
                  {errorMessage || 'No se completó el cobro en la terminal.'}
                </p>
              </div>

              {/* Aviso de seguridad: NO se cobró ni se emitió ticket */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs space-y-1.5 text-slate-700 text-left">
                <div className="flex items-center gap-2 font-bold text-slate-800">
                  <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 font-black flex items-center justify-center text-[10px]">✓</span>
                  <span>NO se registró la venta en el sistema</span>
                </div>
                <div className="flex items-center gap-2 font-bold text-slate-800">
                  <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 font-black flex items-center justify-center text-[10px]">✓</span>
                  <span>NO se imprimió ticket térmico</span>
                </div>
                <p className="text-[11px] text-slate-500 pt-0.5">
                  La cuenta del cliente sigue intacta en el mostrador para reintentar o cobrar en efectivo.
                </p>
              </div>

              {/* Botones de acción: Reintentar en terminal o Cobrar en Efectivo */}
              <div className="space-y-2 w-full pt-1">
                {failureKind === 'TERMINAL_BUSY' || failureKind === 'TERMINAL_ERROR' ? (
                  <button
                    type="button"
                    onClick={handleReleaseAndRetry}
                    className="w-full bg-[#009EE3] hover:bg-[#007EB5] active:bg-[#006A99] text-white font-black py-3 px-4 rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-95 transition-all"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Liberar Terminal y Reintentar 🔄</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const devId = activeDeviceIdRef.current || config.deviceId;
                      if (devId) startPaymentFlow(devId, true);
                    }}
                    className="w-full bg-[#009EE3] hover:bg-[#007EB5] active:bg-[#006A99] text-white font-black py-3 px-4 rounded-xl text-sm flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-95 transition-all"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Reintentar Cobro en Terminal 🔄</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    stopPolling();
                    playBeep(450, 'sine', 0.05);
                    onClose();
                  }}
                  className="w-full bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-black py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all border border-slate-200"
                >
                  <Banknote className="w-4 h-4 text-emerald-600" />
                  <span>Cobrar en Efectivo / Regresar a Cuenta</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStep('MANUAL_AUTH')}
                  className="w-full text-center text-[11px] text-slate-400 hover:text-slate-600 font-bold py-1 hover:underline cursor-pointer"
                >
                  ¿Ya cobraste en terminal con voucher físico? Registrar manualmente
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
