import React, { useEffect, useState } from 'react';
import {
  Printer,
  X,
  CheckCircle2,
  Usb,
  Cable,
  Bluetooth,
  Smartphone,
  Download,
  RefreshCw,
  AlertCircle,
  Unlink,
  Zap,
  Monitor,
} from 'lucide-react';
import { BranchId, SaleTicket, Settings } from '../../types';
import {
  SilentPrinterStatus,
  clearSilentPrinterPairing,
  downloadMacSilentPrintLauncher,
  downloadWindowsSilentPrintLauncher,
  getSilentPrinterStatus,
  pairSilentBluetoothPrinter,
  pairSilentSerialPrinter,
  pairSilentUsbPrinter,
  printTicketDirectToPrinter,
  saveSilentPrinterConfig,
} from '../../utils/thermalPrinter';
import { getNowTimeString, getTodayString } from '../../utils/storage';

interface SilentPrinterSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeBranch: BranchId;
  settings: Settings;
  onStatusChange?: (status: SilentPrinterStatus) => void;
}

export const SilentPrinterSetupModal: React.FC<SilentPrinterSetupModalProps> = ({
  isOpen,
  onClose,
  activeBranch,
  settings,
  onStatusChange,
}) => {
  const [status, setStatus] = useState<SilentPrinterStatus | null>(null);
  const [busyAction, setBusyAction] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [serialBaudRate, setSerialBaudRate] = useState<number>(9600);

  const isZakia = activeBranch === 'zakia';

  const refreshStatus = async () => {
    const next = await getSilentPrinterStatus();
    setStatus(next);
    if (next.serialBaudRate) setSerialBaudRate(next.serialBaudRate);
    onStatusChange?.(next);
  };

  useEffect(() => {
    if (!isOpen) return;
    setFeedback(null);
    void refreshStatus();
  }, [isOpen]);

  if (!isOpen) return null;

  const buildSampleTicket = (): SaleTicket => ({
    id: `test-${Date.now()}`,
    folio: isZakia ? 'Z-PRUEBA' : 'T-PRUEBA',
    timestamp: new Date().toISOString(),
    date: getTodayString(),
    time: getNowTimeString(true),
    items: [
      { id: '1', name: 'Pan Tradicional (Prueba)', price: 12, quantity: 2, total: 24 },
      { id: '2', name: 'Pan Relleno (Prueba)', price: 18, quantity: 1, total: 18 },
    ],
    subtotal: 42,
    discount: 0,
    total: 42,
    paymentMethod: 'efectivo',
    amountPaid: 50,
    change: 8,
    pointsEarned: 2,
    pointsRedeemed: 0,
    cashier: isZakia ? 'Zakia' : 'Refugio',
    branch: activeBranch,
  });

  const handlePairUsb = async () => {
    setBusyAction('usb');
    setFeedback({ type: 'info', text: 'Selecciona tu impresora térmica USB en la lista del navegador (solo se pide 1 vez)...' });
    const res = await pairSilentUsbPrinter(buildSampleTicket(), settings, (msg) => {
      setFeedback({ type: 'info', text: msg });
    });
    setBusyAction('');
    setFeedback({ type: res.success ? 'success' : 'error', text: res.message });
    await refreshStatus();
  };

  const handlePairSerial = async () => {
    setBusyAction('serial');
    setFeedback({ type: 'info', text: 'Selecciona el puerto USB / COM de tu impresora térmica (solo se pide 1 vez)...' });
    const res = await pairSilentSerialPrinter(buildSampleTicket(), settings, serialBaudRate, (msg) => {
      setFeedback({ type: 'info', text: msg });
    });
    setBusyAction('');
    setFeedback({ type: res.success ? 'success' : 'error', text: res.message });
    await refreshStatus();
  };

  const handlePairBluetooth = async () => {
    setBusyAction('bluetooth');
    setFeedback({ type: 'info', text: 'Buscando impresora térmica Bluetooth cercana...' });
    const res = await pairSilentBluetoothPrinter(buildSampleTicket(), settings, (msg) => {
      setFeedback({ type: 'info', text: msg });
    });
    setBusyAction('');
    setFeedback({ type: res.success ? 'success' : 'error', text: res.message });
    await refreshStatus();
  };

  const handleEnableRawBt = async () => {
    saveSilentPrinterConfig({ mode: 'rawbt', autoPrintEnabled: true });
    setFeedback({
      type: 'success',
      text: 'Modo RawBT Android activado. Al cobrar en este equipo el ticket se enviará automáticamente a RawBT.',
    });
    await refreshStatus();
  };

  const handleDownloadWindowsLauncher = async () => {
    downloadWindowsSilentPrintLauncher();
    setFeedback({
      type: 'success',
      text: 'Se descargó "Panaderia_SantaFe_AutoImpresion_Windows.bat". Guárdalo en el Escritorio de esta caja y ábrelo siempre desde ahí: imprimirá en automático SIN ventana de confirmación.',
    });
    await refreshStatus();
  };

  const handleDownloadMacLauncher = async () => {
    downloadMacSilentPrintLauncher();
    setFeedback({
      type: 'success',
      text: 'Se descargó "Panaderia_SantaFe_AutoImpresion_Mac.command". Ábrelo para imprimir en automático sin cuadro de confirmación.',
    });
    await refreshStatus();
  };

  const handleTestPrintNow = () => {
    const sample = buildSampleTicket();
    setFeedback({ type: 'info', text: 'Enviando ticket de prueba automático...' });
    printTicketDirectToPrinter(sample, settings);
    setTimeout(() => {
      setFeedback({
        type: 'success',
        text: `Ticket de prueba #${sample.folio} enviado al canal activo (${status?.printerName || 'Impresora'}).`,
      });
    }, 350);
  };

  const handleDisconnect = async () => {
    clearSilentPrinterPairing();
    setFeedback({ type: 'info', text: 'Vinculación limpiada. Puedes elegir otro método cuando gustes.' });
    await refreshStatus();
  };

  const channelLabelMap: Record<string, string> = {
    webusb: 'USB Directo (ESC/POS Sin Ventana)',
    serial: 'Puerto USB / COM (ESC/POS Sin Ventana)',
    bluetooth: 'Bluetooth Directo (Sin Ventana)',
    rawbt: 'RawBT Android (Automático)',
    bridge: 'Puente Local Silencioso',
    kiosk: 'Driver Windows/Mac (Modo Sin Ventana)',
    system: 'Driver del Navegador (Pide confirmar si no se vincula)',
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div
          className={`px-5 py-4 flex items-center justify-between text-white ${
            isZakia
              ? 'bg-gradient-to-r from-emerald-700 to-teal-700'
              : 'bg-gradient-to-r from-slate-900 to-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
              <Printer className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black leading-tight">
                Impresión Automática Sin Ventana — {isZakia ? 'Zakia' : 'El Refugio'}
              </h3>
              <p className="text-xs text-white/80 font-medium">
                Configura 1 sola vez en esta computadora para que el ticket salga solo al cobrar
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center cursor-pointer transition-colors"
            title="Cerrar"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {/* Estado Actual */}
          <div
            className={`p-3.5 rounded-2xl border-2 flex flex-wrap items-center justify-between gap-3 ${
              status?.connected
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                : 'bg-amber-50 border-amber-300 text-amber-950'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  status?.connected ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'
                }`}
              >
                {status?.connected ? <Zap className="w-5 h-5" /> : <Printer className="w-5 h-5" />}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-wide flex items-center gap-1.5">
                  <span>{status?.connected ? 'Auto-Impresión Directa Lista' : 'Falta vincular 1 sola vez en esta caja'}</span>
                </div>
                <p className="text-xs font-bold opacity-85 truncate">
                  {status?.printerName || 'Impresora del Sistema'} •{' '}
                  {status ? channelLabelMap[status.channel] || status.channel : 'Verificando...'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleTestPrintNow}
                disabled={Boolean(busyAction)}
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Probar Ticket</span>
              </button>
              {status?.connected && (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  title="Desvincular impresora actual"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  <span>Cambiar</span>
                </button>
              )}
            </div>
          </div>

          {/* Feedback banner */}
          {feedback && (
            <div
              className={`p-3 rounded-xl text-xs font-bold flex items-start gap-2 border ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                  : feedback.type === 'error'
                  ? 'bg-rose-50 text-rose-900 border-rose-200'
                  : 'bg-sky-50 text-sky-900 border-sky-200'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : feedback.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              ) : (
                <RefreshCw className="w-4 h-4 text-sky-600 animate-spin shrink-0 mt-0.5" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          {/* OPCIÓN 1: CONEXIÓN DIRECTA SIN VENTANA (USB / SERIAL / BLUETOOTH) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                Opción 1 (Recomendada): Conectar Impresora Directa (Se vincula 1 sola vez)
              </h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                disabled={Boolean(busyAction)}
                onClick={handlePairUsb}
                className="p-3.5 rounded-2xl border-2 border-slate-800 bg-slate-900 hover:bg-black text-white text-left flex flex-col justify-between gap-2 cursor-pointer transition-all disabled:opacity-50 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <Usb className="w-5 h-5 text-emerald-400" />
                  <span className="text-[10px] font-black bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-md">
                    USB DIRECTO
                  </span>
                </div>
                <div>
                  <div className="text-xs font-black">Vincular Cable USB</div>
                  <p className="text-[10px] text-slate-300 mt-0.5 leading-snug">
                    Cero ventanas al cobrar. Compatible con impresoras POS 58/80mm.
                  </p>
                </div>
              </button>

              <button
                type="button"
                disabled={Boolean(busyAction)}
                onClick={handlePairSerial}
                className="p-3.5 rounded-2xl border-2 border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100/80 text-indigo-950 text-left flex flex-col justify-between gap-2 cursor-pointer transition-all disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <Cable className="w-5 h-5 text-indigo-600" />
                  <span className="text-[10px] font-black bg-indigo-200 text-indigo-900 px-2 py-0.5 rounded-md">
                    PUERTO COM
                  </span>
                </div>
                <div>
                  <div className="text-xs font-black">Vincular Puerto USB / COM</div>
                  <p className="text-[10px] text-indigo-800/80 mt-0.5 leading-snug">
                    Ideal si tu impresora aparece como puerto COM en Windows.
                  </p>
                </div>
              </button>

              <button
                type="button"
                disabled={Boolean(busyAction)}
                onClick={handlePairBluetooth}
                className="p-3.5 rounded-2xl border-2 border-sky-200 bg-sky-50/70 hover:bg-sky-100/80 text-sky-950 text-left flex flex-col justify-between gap-2 cursor-pointer transition-all disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <Bluetooth className="w-5 h-5 text-sky-600" />
                  <span className="text-[10px] font-black bg-sky-200 text-sky-900 px-2 py-0.5 rounded-md">
                    INALÁMBRICA
                  </span>
                </div>
                <div>
                  <div className="text-xs font-black">Vincular Bluetooth</div>
                  <p className="text-[10px] text-sky-800/80 mt-0.5 leading-snug">
                    Impresión automática sin pedir permiso durante todo el turno.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* OPCIÓN 2: DRIVER NORMAL DE WINDOWS / MAC SIN VENTANA (--kiosk-printing) */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50/60 border-2 border-amber-300 space-y-3">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5">
                <Monitor className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-black text-amber-950">
                  Opción 2: Impresora con Driver Normal de Windows / Mac (Epson, Xprinter, EC Line, 58/80mm)
                </h4>
                <p className="text-[11px] text-amber-900/90 font-medium mt-0.5 leading-snug">
                  Si tu impresora ya imprime en Windows pero te sale el cuadro de <strong>&ldquo;Imprimir&rdquo;</strong> cada vez, descarga este acceso directo en el Escritorio de <strong>El Refugio</strong> y <strong>Zakia</strong>. Al abrir la caja desde ahí, Chrome imprime directo en tu impresora predeterminada <strong>sin preguntarte jamás</strong>.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadWindowsLauncher}
                className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black flex items-center gap-2 cursor-pointer shadow-sm transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Descargar Acceso Directo Windows (Sin Ventana)</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadMacLauncher}
                className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-amber-100 text-amber-950 border border-amber-300 text-xs font-black flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Versión Mac</span>
              </button>
            </div>
          </div>

          {/* OPCIÓN 3: TABLET / CELULAR ANDROID (RawBT) */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Smartphone className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <div className="text-xs font-black text-slate-900">¿Usas Tablet o Celular Android en caja?</div>
                <p className="text-[11px] text-slate-600 font-medium">
                  Activa envío automático directo a la app gratuita <strong>RawBT</strong>.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleEnableRawBt}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer transition-colors"
            >
              Activar RawBT Automático
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-bold">
            Al cobrar en Efectivo o con Mercado Pago Point el ticket sale automáticamente.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-black cursor-pointer"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
};
