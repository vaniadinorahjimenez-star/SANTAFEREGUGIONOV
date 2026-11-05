import React, { useState, useMemo } from 'react';
import { 
  Download, 
  ShieldCheck, 
  CheckCircle2, 
  X, 
  HardDrive, 
  FileText, 
  Calendar, 
  DollarSign, 
  Laptop, 
  Monitor, 
  Truck, 
  AlertCircle,
  Copy,
  Check,
  Upload,
  ArrowRight,
  GitMerge,
  Cloud,
  FileCheck,
  RefreshCw
} from 'lucide-react';
import { BakeryOrder, DriverCustomer, SaleTicket } from '../../types';
import { 
  loadOrders, 
  saveOrders,
  loadDriverCustomers, 
  saveDriverCustomers,
  loadTickets, 
  saveTickets,
  mergeOrders,
  mergeTickets,
  mergeDailyDeliverySheets,
  saveDailyDeliverySheet,
  getDailyDeliverySheet,
  DAILY_DELIVERY_PREFIX,
  getTodayString 
} from '../../utils/storage';
import { 
  saveOrderToFirestore, 
  saveDriverCustomerToFirestore, 
  saveDailyDeliveryToFirestore, 
  saveSaleTicketToFirestore,
  isQuotaExceeded 
} from '../../services/firebase';
import { syncWithCloud } from '../../services/cloudSyncService';
import { playCashSound, playBeep } from '../../utils/audio';

interface BackupOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConsolidationSuccess?: () => void;
}

interface BackupFileContent {
  sistema?: string;
  dispositivoOrigen?: string;
  fechaExportacion?: string;
  resumen?: any;
  datos?: {
    pedidos?: BakeryOrder[];
    hojasRepartoDiario?: Array<{
      date: string;
      shift: 'manana' | 'tarde';
      quantities: Record<string, Record<string, number>>;
    }>;
    clientesReparto?: DriverCustomer[];
    ticketsReparto?: SaleTicket[];
  };
}

export const BackupOrdersModal: React.FC<BackupOrdersModalProps> = ({
  isOpen,
  onClose,
  onConsolidationSuccess
}) => {
  // Tabs: 'respaldar' (Etapa 2) vs 'consolidar' (Etapa 3 & 4)
  const [activeTab, setActiveTab] = useState<'respaldar' | 'consolidar'>('respaldar');

  // Selector de dispositivo de origen (Etapa 2)
  const [sourceDevice, setSourceDevice] = useState<'Computadora A' | 'Computadora B' | 'Otro'>('Computadora A');
  const [customDeviceName, setCustomDeviceName] = useState<string>('');
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);
  const [downloadedFileName, setDownloadedFileName] = useState<string>('');

  // Estados de Consolidación (Etapa 3)
  const [fileA, setFileA] = useState<BackupFileContent | null>(null);
  const [fileB, setFileB] = useState<BackupFileContent | null>(null);
  const [fileNameA, setFileNameA] = useState<string>('');
  const [fileNameB, setFileNameB] = useState<string>('');
  const [fileErrorA, setFileErrorA] = useState<string>('');
  const [fileErrorB, setFileErrorB] = useState<string>('');
  const [isApplyingConsolidation, setIsApplyingConsolidation] = useState<boolean>(false);
  const [consolidationFinished, setConsolidationFinished] = useState<boolean>(false);
  const [consolidationReportText, setConsolidationReportText] = useState<string>('');

  // 1. Escaneo de solo lectura de todos los datos locales disponibles en ESTA computadora
  const localScan = useMemo(() => {
    // A. Pedidos Especiales y Encargos
    const orders: BakeryOrder[] = loadOrders();

    // B. Catálogo de Clientes de Reparto con Precios Especiales
    const driverCustomers: DriverCustomer[] = loadDriverCustomers();

    // C. Hojas Diarias de Reparto (Simón y Osvaldo) para todas las fechas y turnos
    const dailyDeliveries: Array<{
      key: string;
      date: string;
      shift: 'manana' | 'tarde';
      quantities: Record<string, Record<string, number>>;
      totalPieces: number;
      clientsCount: number;
    }> = [];

    let totalDeliveryPieces = 0;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(DAILY_DELIVERY_PREFIX)) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const quantities = JSON.parse(raw);
            const rest = key.replace(DAILY_DELIVERY_PREFIX, '');
            const isTarde = rest.endsWith('_tarde');
            const dateStr = isTarde ? rest.replace('_tarde', '') : rest;
            const shift: 'manana' | 'tarde' = isTarde ? 'tarde' : 'manana';

            let pieces = 0;
            const clients = Object.keys(quantities || {});
            clients.forEach(cId => {
              Object.values(quantities[cId] || {}).forEach((q: any) => {
                pieces += (Number(q) || 0);
              });
            });

            totalDeliveryPieces += pieces;

            dailyDeliveries.push({
              key,
              date: dateStr,
              shift,
              quantities,
              totalPieces: pieces,
              clientsCount: clients.length
            });
          }
        } catch {
          // ignore corrupted keys
        }
      }
    }

    // Ordenar hojas de reparto por fecha descendente
    dailyDeliveries.sort((a, b) => b.date.localeCompare(a.date));

    // D. Tickets de Reparto generados
    const allTickets: SaleTicket[] = loadTickets();
    const deliveryTickets = allTickets.filter(t => t.isDelivery || (t.folio && t.folio.startsWith('REP-')));

    // Totales monetarios de pedidos
    const totalOrdersAmount = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalPendingAmount = orders.reduce((sum, o) => sum + (o.pendingAmount || 0), 0);
    const totalDepositAmount = orders.reduce((sum, o) => sum + (o.deposit || 0), 0);

    return {
      orders,
      driverCustomers,
      dailyDeliveries,
      deliveryTickets,
      totalOrdersAmount,
      totalPendingAmount,
      totalDepositAmount,
      totalDeliveryPieces
    };
  }, [isOpen]);

  // Auditoría y comparación segura de los dos archivos subidos
  const comparisonAnalysis = useMemo(() => {
    if (!fileA && !fileB) return null;

    const ordersA = fileA?.datos?.pedidos || [];
    const ordersB = fileB?.datos?.pedidos || [];

    const mapA = new Map<string, BakeryOrder>();
    ordersA.forEach(o => {
      const key = o.id || o.folio;
      if (key) mapA.set(key, o);
    });

    const mapB = new Map<string, BakeryOrder>();
    ordersB.forEach(o => {
      const key = o.id || o.folio;
      if (key) mapB.set(key, o);
    });

    // Identificar pedidos en ambos, solo en A, solo en B
    const inBoth: Array<{ orderA: BakeryOrder; orderB: BakeryOrder; merged: BakeryOrder }> = [];
    const onlyInA: BakeryOrder[] = [];
    const onlyInB: BakeryOrder[] = [];

    // Todos los folios y claves únicas
    const allKeys = new Set([...Array.from(mapA.keys()), ...Array.from(mapB.keys())]);

    allKeys.forEach(k => {
      const oA = mapA.get(k);
      const oB = mapB.get(k);
      if (oA && oB) {
        // En ambos: comparar y generar versión combinada inteligente
        const deliveryStatus = (oA.deliveryStatus === 'entregado' || oB.deliveryStatus === 'entregado')
          ? 'entregado'
          : (oA.deliveryStatus || oB.deliveryStatus);
        const paymentStatus = (oA.paymentStatus === 'pagado' || oB.paymentStatus === 'pagado')
          ? 'pagado'
          : (oA.paymentStatus || oB.paymentStatus);
        const deposit = Math.max(oA.deposit || 0, oB.deposit || 0);
        const collectedAmount = Math.max(oA.collectedAmount || 0, oB.collectedAmount || 0);
        const total = Math.max(oA.total || 0, oB.total || 0);
        const pendingAmount = paymentStatus === 'pagado' ? 0 : Math.max(0, total - deposit - collectedAmount);

        const merged: BakeryOrder = {
          ...oA,
          ...oB,
          total,
          deposit,
          collectedAmount,
          pendingAmount,
          paymentStatus,
          deliveryStatus
        };
        inBoth.push({ orderA: oA, orderB: oB, merged });
      } else if (oA && !oB) {
        onlyInA.push(oA);
      } else if (!oA && oB) {
        onlyInB.push(oB);
      }
    });

    // Hojas de reparto diarias combinadas
    const deliveriesA = fileA?.datos?.hojasRepartoDiario || [];
    const deliveriesB = fileB?.datos?.hojasRepartoDiario || [];
    const deliveryMap = new Map<string, { date: string; shift: 'manana' | 'tarde'; quantities: Record<string, Record<string, number>> }>();

    [...deliveriesA, ...deliveriesB].forEach(d => {
      const key = `${d.date}_${d.shift}`;
      if (!deliveryMap.has(key)) {
        deliveryMap.set(key, { date: d.date, shift: d.shift, quantities: { ...d.quantities } });
      } else {
        const existing = deliveryMap.get(key)!;
        existing.quantities = mergeDailyDeliverySheets(existing.quantities, d.quantities);
      }
    });

    // Clientes de reparto combinados
    const clientsA = fileA?.datos?.clientesReparto || [];
    const clientsB = fileB?.datos?.clientesReparto || [];
    const clientMap = new Map<string, DriverCustomer>();
    [...clientsA, ...clientsB].forEach(c => {
      clientMap.set(c.id, c);
    });

    const totalConsolidatedOrdersCount = inBoth.length + onlyInA.length + onlyInB.length;

    return {
      ordersA_count: ordersA.length,
      ordersB_count: ordersB.length,
      inBoth,
      onlyInA,
      onlyInB,
      totalConsolidatedOrdersCount,
      consolidatedDeliveries: Array.from(deliveryMap.values()),
      consolidatedClients: Array.from(clientMap.values())
    };
  }, [fileA, fileB]);

  if (!isOpen) return null;

  const effectiveDeviceName = sourceDevice === 'Otro' ? (customDeviceName.trim() || 'Dispositivo_Personalizado') : sourceDevice;
  const sanitizedDeviceCode = effectiveDeviceName.replace(/\s+/g, '_').toUpperCase();
  const todayStr = getTodayString();
  const defaultFileName = `RESPALDO_PEDIDOS_${sanitizedDeviceCode}_${todayStr}.json`;

  const handleDownloadBackup = () => {
    playCashSound();

    const backupPayload = {
      sistema: 'Panadería Santa Fé - Gestión de Pedidos y Repartos',
      sucursal: 'El Refugio / Zakia',
      etapa: 'ETAPA 2 — Respaldo Independiente de Solo Lectura',
      fechaExportacion: new Date().toISOString(),
      dispositivoOrigen: effectiveDeviceName,
      resumen: {
        totalPedidosEspeciales: localScan.orders.length,
        montoTotalPedidos: localScan.totalOrdersAmount,
        montoAnticipos: localScan.totalDepositAmount,
        montoPendienteCobro: localScan.totalPendingAmount,
        totalHojasRepartoDiario: localScan.dailyDeliveries.length,
        totalPiezasRepartoRegistradas: localScan.totalDeliveryPieces,
        totalClientesRepartoYPrecios: localScan.driverCustomers.length,
        totalTicketsReparto: localScan.deliveryTickets.length
      },
      datos: {
        pedidos: localScan.orders,
        hojasRepartoDiario: localScan.dailyDeliveries,
        clientesReparto: localScan.driverCustomers,
        ticketsReparto: localScan.deliveryTickets
      }
    };

    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(backupPayload, null, 2))}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', defaultFileName);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    setDownloadedFileName(defaultFileName);
    setDownloadSuccess(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'A' | 'B') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text) as BackupFileContent;
        if (!parsed.datos) {
          throw new Error('El archivo no tiene el formato de respaldo de Santa Fé');
        }
        if (target === 'A') {
          setFileA(parsed);
          setFileNameA(file.name);
          setFileErrorA('');
        } else {
          setFileB(parsed);
          setFileNameB(file.name);
          setFileErrorB('');
        }
        playBeep(880, 'sine', 0.08);
      } catch (err: any) {
        if (target === 'A') {
          setFileErrorA(err?.message || 'Archivo JSON inválido');
        } else {
          setFileErrorB(err?.message || 'Archivo JSON inválido');
        }
      }
    };
    reader.readAsText(file);
  };

  const handleApplyConsolidation = async () => {
    if (!comparisonAnalysis) return;
    setIsApplyingConsolidation(true);
    playCashSound();

    try {
      // 1. Armar lista completa consolidada de pedidos sin duplicados
      const allConsolidatedOrders: BakeryOrder[] = [
        ...comparisonAnalysis.inBoth.map(item => item.merged),
        ...comparisonAnalysis.onlyInA,
        ...comparisonAnalysis.onlyInB
      ];

      // 2. Guardar pedidos en localStorage
      saveOrders(allConsolidatedOrders);

      // 3. Guardar clientes de reparto en localStorage
      if (comparisonAnalysis.consolidatedClients.length > 0) {
        saveDriverCustomers(comparisonAnalysis.consolidatedClients);
      }

      // 4. Guardar hojas de reparto en localStorage
      comparisonAnalysis.consolidatedDeliveries.forEach(del => {
        saveDailyDeliverySheet(del.date, del.quantities, del.shift);
      });

      // 5. Enviar pedidos consolidados a Firestore
      if (!isQuotaExceeded()) {
        for (const order of allConsolidatedOrders) {
          await saveOrderToFirestore(order).catch(console.warn);
        }
        for (const client of comparisonAnalysis.consolidatedClients) {
          await saveDriverCustomerToFirestore(client).catch(console.warn);
        }
        for (const del of comparisonAnalysis.consolidatedDeliveries) {
          await saveDailyDeliveryToFirestore(del.date, del.shift, del.quantities).catch(console.warn);
        }
      }

      // Sincronizar en la nube globalmente
      await syncWithCloud({
        orders: allConsolidatedOrders
      });

      window.dispatchEvent(new Event('dailyDeliveryUpdated'));

      setConsolidationFinished(true);
      setConsolidationReportText(
        `Consolidación finalizada con éxito: ${allConsolidatedOrders.length} pedidos unificados, ${comparisonAnalysis.consolidatedDeliveries.length} hojas de reparto actualizadas y ${comparisonAnalysis.consolidatedClients.length} clientes con precios sincronizados.`
      );

      if (onConsolidationSuccess) {
        onConsolidationSuccess();
      }
    } catch (e: any) {
      console.error('Error aplicando consolidación:', e);
      alert('Ocurrió un error al consolidar: ' + e.message);
    } finally {
      setIsApplyingConsolidation(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full border-2 border-indigo-500 overflow-hidden animate-in zoom-in-95 my-auto max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white p-5 flex items-center justify-between border-b border-indigo-400/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/30 border border-indigo-400 flex items-center justify-center text-indigo-300">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-lg text-white">Gestión Segura de Respaldos y Sincronización</h3>
                <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-400/40">
                  Cero Pérdida de Datos
                </span>
              </div>
              <p className="text-xs text-indigo-200">
                Panadería Santa Fé • Sucursal El Refugio & Zákia
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-full cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs between Stages */}
        <div className="bg-indigo-900/10 border-b border-slate-200 px-5 pt-3 flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('respaldar')}
            className={`px-4 py-2 text-xs font-black rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-b-2 ${
              activeTab === 'respaldar'
                ? 'bg-white text-indigo-900 border-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-100/50'
            }`}
          >
            <Download className="w-3.5 h-3.5 text-indigo-600" />
            <span>1. Descargar Respaldo (Etapa 2)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('consolidar')}
            className={`px-4 py-2 text-xs font-black rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-b-2 ${
              activeTab === 'consolidar'
                ? 'bg-white text-indigo-900 border-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-100/50'
            }`}
          >
            <GitMerge className="w-3.5 h-3.5 text-amber-600" />
            <span>2. Consolidar Respaldos A & B (Etapa 3 & 4)</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-slate-800 flex-1">
          {activeTab === 'respaldar' ? (
            <>
              {/* Regla de Oro Banner */}
              <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <strong className="text-amber-950 font-bold block">
                    ETAPA 2: Respaldo Independiente (Solo Lectura)
                  </strong>
                  <p className="text-amber-900 mt-0.5 leading-relaxed">
                    Esta función genera un archivo JSON con todos los pedidos, precios de clientes y piezas cargadas en esta máquina. <strong>No modifica, no borra ni sobrescribe nada</strong>. Descárgalo en ambas computadoras de El Refugio antes de unificar.
                  </p>
                </div>
              </div>

              {/* Selector de Máquina */}
              <div className="space-y-2">
                <label className="block text-xs font-black text-slate-900 uppercase">
                  Identifica en qué computadora te encuentras:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSourceDevice('Computadora A')}
                    className={`p-3.5 rounded-2xl border-2 text-left flex items-center gap-3 transition-all cursor-pointer ${
                      sourceDevice === 'Computadora A'
                        ? 'border-indigo-600 bg-indigo-50/60 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black shrink-0">
                      <Monitor className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-black text-sm text-slate-900">Computadora A</div>
                      <div className="text-[11px] text-slate-500 font-medium">Caja 1 / Mostrador Principal</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSourceDevice('Computadora B')}
                    className={`p-3.5 rounded-2xl border-2 text-left flex items-center gap-3 transition-all cursor-pointer ${
                      sourceDevice === 'Computadora B'
                        ? 'border-indigo-600 bg-indigo-50/60 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-black shrink-0">
                      <Laptop className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-black text-sm text-slate-900">Computadora B</div>
                      <div className="text-[11px] text-slate-500 font-medium">Caja 2 / Oficina / Laptop</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Auditoría en Vivo de Datos Locales Encontrados */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-xs uppercase tracking-wider text-slate-600 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    <span>Datos detectados en esta computadora para respaldar:</span>
                  </h4>
                  <span className="text-[11px] font-bold text-slate-500">
                    Solo lectura (100% seguro)
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="bg-white border border-slate-200 rounded-xl p-2.5 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">Pedidos</span>
                    <span className="text-lg font-black text-slate-900 font-mono">
                      {localScan.orders.length}
                    </span>
                    <span className="text-[10px] text-emerald-700 font-medium block mt-0.5">
                      ${localScan.totalOrdersAmount.toFixed(2)}
                    </span>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-2.5 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">Hojas Reparto</span>
                    <span className="text-lg font-black text-slate-900 font-mono">
                      {localScan.dailyDeliveries.length}
                    </span>
                    <span className="text-[10px] text-indigo-700 font-medium block mt-0.5">
                      {localScan.totalDeliveryPieces} pzs
                    </span>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-2.5 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">Clientes Reparto</span>
                    <span className="text-lg font-black text-slate-900 font-mono">
                      {localScan.driverCustomers.length}
                    </span>
                    <span className="text-[10px] text-slate-600 font-medium block mt-0.5">
                      Con precios
                    </span>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-2.5 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">Tickets Reparto</span>
                    <span className="text-lg font-black text-slate-900 font-mono">
                      {localScan.deliveryTickets.length}
                    </span>
                    <span className="text-[10px] text-amber-700 font-medium block mt-0.5">
                      Vinculados
                    </span>
                  </div>
                </div>
              </div>

              {/* Estado de Éxito de Descarga */}
              {downloadSuccess && (
                <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-4 text-emerald-950 space-y-2 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <h4 className="font-black text-sm text-emerald-900">
                      ¡Respaldo descargado correctamente!
                    </h4>
                  </div>
                  <p className="text-xs text-emerald-800">
                    Archivo guardado: <code className="bg-white px-2 py-0.5 rounded font-mono font-bold border border-emerald-300 text-emerald-950">{downloadedFileName}</code>
                  </p>
                  <div className="bg-white p-3 rounded-xl border border-emerald-200 text-xs text-slate-700 space-y-1 mt-2">
                    <strong className="block text-slate-900 font-bold">Pasos siguientes del Administrador:</strong>
                    <ol className="list-decimal list-inside space-y-0.5 text-[11.5px]">
                      <li>Verifica que el archivo JSON esté en tu carpeta de Descargas.</li>
                      <li>Haz lo mismo en la otra computadora seleccionando <strong>{sourceDevice === 'Computadora A' ? 'Computadora B' : 'Computadora A'}</strong>.</li>
                      <li>Luego abre la pestaña <strong>2. Consolidar Respaldos A & B</strong> para comparar ambos archivos.</li>
                    </ol>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* ETAPA 3: Consolidación Segura */}
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3.5 flex items-start gap-3">
                <GitMerge className="w-5 h-5 text-indigo-700 shrink-0 mt-0.5" />
                <div className="text-xs text-indigo-950">
                  <strong className="font-bold block">ETAPA 3 & 4: Auditoría, Comparación y Sincronización Segura</strong>
                  <p className="mt-0.5 leading-relaxed text-indigo-900">
                    Sube los dos archivos de respaldo descargados de la Computadora A y B. El sistema los auditará, identificará pedidos duplicados por folio/ID, resolverá diferencias y te mostrará el reporte exacto antes de unificarlos en Firestore.
                  </p>
                </div>
              </div>

              {/* Upload Dropzones */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Respaldo A */}
                <div className="border-2 border-dashed border-indigo-300 rounded-2xl p-4 bg-slate-50/70 text-center space-y-2">
                  <div className="flex items-center justify-center gap-2 text-indigo-900 font-black text-xs uppercase">
                    <Monitor className="w-4 h-4 text-indigo-600" />
                    <span>Respaldo Computadora A</span>
                  </div>
                  {fileA ? (
                    <div className="bg-white border border-emerald-300 rounded-xl p-2.5 text-xs text-emerald-900 space-y-1">
                      <div className="flex items-center justify-center gap-1 font-bold text-emerald-700">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Cargado con éxito</span>
                      </div>
                      <div className="font-mono text-[11px] text-slate-600 truncate">{fileNameA}</div>
                      <div className="text-[11px] text-slate-500">
                        {fileA.datos?.pedidos?.length || 0} pedidos • {fileA.datos?.clientesReparto?.length || 0} clientes
                      </div>
                    </div>
                  ) : (
                    <label className="block p-3 rounded-xl bg-white border border-slate-200 hover:border-indigo-400 cursor-pointer transition-all">
                      <Upload className="w-5 h-5 text-indigo-500 mx-auto mb-1" />
                      <span className="text-xs font-bold text-indigo-700 block">Subir archivo JSON de Computadora A</span>
                      <span className="text-[10px] text-slate-400">Clic para seleccionar</span>
                      <input
                        type="file"
                        accept=".json"
                        onChange={(e) => handleFileUpload(e, 'A')}
                        className="hidden"
                      />
                    </label>
                  )}
                  {fileErrorA && <p className="text-[11px] text-rose-600 font-bold">{fileErrorA}</p>}
                </div>

                {/* Respaldo B */}
                <div className="border-2 border-dashed border-purple-300 rounded-2xl p-4 bg-slate-50/70 text-center space-y-2">
                  <div className="flex items-center justify-center gap-2 text-purple-900 font-black text-xs uppercase">
                    <Laptop className="w-4 h-4 text-purple-600" />
                    <span>Respaldo Computadora B</span>
                  </div>
                  {fileB ? (
                    <div className="bg-white border border-emerald-300 rounded-xl p-2.5 text-xs text-emerald-900 space-y-1">
                      <div className="flex items-center justify-center gap-1 font-bold text-emerald-700">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Cargado con éxito</span>
                      </div>
                      <div className="font-mono text-[11px] text-slate-600 truncate">{fileNameB}</div>
                      <div className="text-[11px] text-slate-500">
                        {fileB.datos?.pedidos?.length || 0} pedidos • {fileB.datos?.clientesReparto?.length || 0} clientes
                      </div>
                    </div>
                  ) : (
                    <label className="block p-3 rounded-xl bg-white border border-slate-200 hover:border-purple-400 cursor-pointer transition-all">
                      <Upload className="w-5 h-5 text-purple-500 mx-auto mb-1" />
                      <span className="text-xs font-bold text-purple-700 block">Subir archivo JSON de Computadora B</span>
                      <span className="text-[10px] text-slate-400">Clic para seleccionar</span>
                      <input
                        type="file"
                        accept=".json"
                        onChange={(e) => handleFileUpload(e, 'B')}
                        className="hidden"
                      />
                    </label>
                  )}
                  {fileErrorB && <p className="text-[11px] text-rose-600 font-bold">{fileErrorB}</p>}
                </div>
              </div>

              {/* Reporte de Comparación y Conciliación (Etapa 3) */}
              {comparisonAnalysis && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <h4 className="font-black text-xs uppercase tracking-wider text-slate-800 flex items-center gap-2">
                      <FileCheck className="w-4 h-4 text-emerald-600" />
                      <span>Reporte Oficial de Conciliación (Previo a Guardar):</span>
                    </h4>
                    <span className="bg-indigo-100 text-indigo-900 text-[10px] font-black px-2 py-0.5 rounded-full">
                      Resultado Seguro
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-500 block">Coincidentes (En A y B)</span>
                      <strong className="text-base font-black text-slate-900 font-mono">
                        {comparisonAnalysis.inBoth.length}
                      </strong>
                      <span className="text-[10px] text-slate-500 block">Sin duplicarse</span>
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-500 block">Exclusivos Comp A</span>
                      <strong className="text-base font-black text-indigo-600 font-mono">
                        {comparisonAnalysis.onlyInA.length}
                      </strong>
                      <span className="text-[10px] text-slate-500 block">Se conservarán</span>
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-500 block">Exclusivos Comp B</span>
                      <strong className="text-base font-black text-purple-600 font-mono">
                        {comparisonAnalysis.onlyInB.length}
                      </strong>
                      <span className="text-[10px] text-slate-500 block">Se incorporarán</span>
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-emerald-300 bg-emerald-50/50">
                      <span className="text-[10px] font-bold text-emerald-800 block">Total Unificado</span>
                      <strong className="text-base font-black text-emerald-950 font-mono">
                        {comparisonAnalysis.totalConsolidatedOrdersCount}
                      </strong>
                      <span className="text-[10px] text-emerald-700 block">Pedidos finales</span>
                    </div>
                  </div>

                  {/* Detalle de pedidos de muestra */}
                  <div className="space-y-1.5 pt-2">
                    <span className="text-[10.5px] font-bold text-slate-600 uppercase block">
                      Lista de pedidos a sincronizar en tiempo real:
                    </span>
                    <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 text-xs bg-white">
                      {comparisonAnalysis.inBoth.map(({ merged }) => (
                        <div key={merged.id} className="p-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="bg-slate-100 text-slate-800 font-mono text-[10px] font-black px-1.5 py-0.5 rounded">
                              {merged.folio}
                            </span>
                            <span className="font-semibold text-slate-800">{merged.customerName}</span>
                            <span className="bg-emerald-100 text-emerald-800 text-[9.5px] font-black px-1.5 py-0.2 rounded-full">
                              Coincide en A y B
                            </span>
                          </div>
                          <span className="font-mono font-bold text-slate-900">${merged.total.toFixed(2)}</span>
                        </div>
                      ))}
                      {comparisonAnalysis.onlyInA.map(order => (
                        <div key={order.id} className="p-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="bg-indigo-100 text-indigo-900 font-mono text-[10px] font-black px-1.5 py-0.5 rounded">
                              {order.folio}
                            </span>
                            <span className="font-semibold text-slate-800">{order.customerName}</span>
                            <span className="bg-indigo-100 text-indigo-800 text-[9.5px] font-black px-1.5 py-0.2 rounded-full">
                              Desde Comp A
                            </span>
                          </div>
                          <span className="font-mono font-bold text-slate-900">${order.total.toFixed(2)}</span>
                        </div>
                      ))}
                      {comparisonAnalysis.onlyInB.map(order => (
                        <div key={order.id} className="p-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="bg-purple-100 text-purple-900 font-mono text-[10px] font-black px-1.5 py-0.5 rounded">
                              {order.folio}
                            </span>
                            <span className="font-semibold text-slate-800">{order.customerName}</span>
                            <span className="bg-purple-100 text-purple-800 text-[9.5px] font-black px-1.5 py-0.2 rounded-full">
                              Desde Comp B
                            </span>
                          </div>
                          <span className="font-mono font-bold text-slate-900">${order.total.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Mensaje de Consolidación Exitosa */}
              {consolidationFinished && (
                <div className="bg-emerald-50 border-2 border-emerald-400 rounded-2xl p-4 text-emerald-950 space-y-2 animate-in zoom-in-95">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                    <h4 className="font-black text-sm text-emerald-900">
                      ¡Consolidación y Migración a Firebase Exitosa!
                    </h4>
                  </div>
                  <p className="text-xs text-emerald-800 leading-relaxed">
                    {consolidationReportText}
                  </p>
                  <p className="text-[11px] text-emerald-700 font-medium">
                    A partir de este momento, todos los cambios que se hagan en cualquier computadora o teléfono celular se reflejarán instantáneamente en tiempo real.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {activeTab === 'respaldar' ? (
            <>
              <div className="text-xs text-slate-500">
                Archivo a generar: <span className="font-mono font-bold text-slate-800">{defaultFileName}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={handleDownloadBackup}
                  className="px-5 py-2.5 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white shadow-md flex items-center gap-2 transition-all cursor-pointer border border-indigo-700"
                >
                  <Download className="w-4 h-4 text-indigo-200" />
                  <span>DESCARGAR RESPALDO ({effectiveDeviceName})</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-xs text-slate-500">
                {comparisonAnalysis
                  ? `Listo para unificar ${comparisonAnalysis.totalConsolidatedOrdersCount} pedidos`
                  : 'Sube ambos archivos para comparar'}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cerrar
                </button>
                {comparisonAnalysis && !consolidationFinished && (
                  <button
                    type="button"
                    onClick={handleApplyConsolidation}
                    disabled={isApplyingConsolidation}
                    className="px-5 py-2.5 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white shadow-md flex items-center gap-2 transition-all cursor-pointer border border-emerald-700 disabled:opacity-50"
                  >
                    {isApplyingConsolidation ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                        <span>Sincronizando con Firebase...</span>
                      </>
                    ) : (
                      <>
                        <Cloud className="w-4 h-4 text-emerald-200" />
                        <span>APROBAR Y MIGRAR A FIREBASE EN TIEMPO REAL</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
