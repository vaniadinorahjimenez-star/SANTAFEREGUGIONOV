import React, { useState, useEffect, useMemo } from 'react';
import { DriverCustomer, Settings, DeliveryClientBreadItem, SaleTicket, TicketItem, DeliveryRunMetadata } from '../../types';
import { 
  Truck, 
  Calendar, 
  Printer, 
  Plus, 
  Search, 
  Check, 
  ChevronLeft, 
  ChevronRight, 
  Edit3, 
  Trash2, 
  X, 
  DollarSign, 
  AlertCircle,
  FileSpreadsheet,
  RefreshCw,
  Wifi,
  Clock,
  Sparkles,
  CheckCircle2,
  ListOrdered,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  BarChart2
} from 'lucide-react';
import { playBeep, playCashSound } from '../../utils/audio';
import { 
  getTodayString, 
  getTomorrowString,
  getDailyDeliverySheet, 
  saveDailyDeliverySheet, 
  getDailyDeliveryPiecesCount,
  saveDriverCustomers,
  saveTickets,
  loadTickets,
  loadDrivers,
  mergeTickets,
  mergeDailyDeliverySheets,
  markDeliveryAsDeleted,
  unmarkDeliveryAsDeleted,
  getDeletedDeliveryKeys,
  loadDeliveryRunMeta,
  saveDeliveryRunMeta,
  DAILY_DELIVERY_PREFIX 
} from '../../utils/storage';
import { 
  printDeliveryClientTicketDirectToPrinter, 
  printDriverConsolidatedTicketDirectToPrinter 
} from '../../utils/thermalPrinter';
import {
  subscribeToDailyDelivery,
  saveDailyDeliveryToFirestore,
  fetchDailyDeliveryFromFirestore,
  deleteClientDeliveryFromFirestore,
  saveSaleTicketToFirestore,
  deleteSaleTicketFromFirestore,
  saveDriverCustomerToFirestore,
  deleteDriverCustomerFromFirestore
} from '../../services/firebase';
import { DeliveryComparisonChart } from './DeliveryComparisonChart';

interface DailyDeliverySheetProps {
  driverCustomers: DriverCustomer[];
  settings: Settings;
  onUpdateDriverCustomers: (updated: DriverCustomer[]) => void;
  onSaveTicket?: (ticket: SaleTicket) => void;
  onDeleteTicket?: (ticketId: string) => void;
}

export const DailyDeliverySheet: React.FC<DailyDeliverySheetProps> = ({
  driverCustomers,
  settings,
  onUpdateDriverCustomers,
  onSaveTicket,
  onDeleteTicket
}) => {
  // Fecha seleccionada persistida (para no cambiar de fecha al recargar la página)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('santafe_active_delivery_date');
      if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved)) return saved;
    } catch {}
    return getTodayString();
  });
  // Turno de reparto persistido: 'manana' | 'tarde'
  const [deliveryShift, setDeliveryShift] = useState<'manana' | 'tarde'>(() => {
    try {
      const saved = localStorage.getItem('santafe_active_delivery_shift');
      if (saved === 'manana' || saved === 'tarde') return saved;
    } catch {}
    return 'manana';
  });

  // Guardar en localStorage inmediatamente al cambiar fecha o turno
  useEffect(() => {
    try {
      localStorage.setItem('santafe_active_delivery_date', selectedDate);
    } catch {}
  }, [selectedDate]);

  useEffect(() => {
    try {
      localStorage.setItem('santafe_active_delivery_shift', deliveryShift);
    } catch {}
  }, [deliveryShift]);
  // Cantidades del día: { [runKey]: { [breadName]: quantity } }
  const [dailyQuantities, setDailyQuantities] = useState<Record<string, Record<string, number>>>({});
  // Metadatos de vueltas/entregas del día { [runKey]: DeliveryRunMetadata }
  const [deliveryRunMeta, setDeliveryRunMeta] = useState<Record<string, DeliveryRunMetadata>>(() => {
    return loadDeliveryRunMeta(selectedDate, deliveryShift);
  });
  // Vuelta activa por cliente para la columna de captura { [clientId]: activeRunKey }
  const [activeRunPerClient, setActiveRunPerClient] = useState<Record<string, string>>({});

  useEffect(() => {
    setDeliveryRunMeta(loadDeliveryRunMeta(selectedDate, deliveryShift));
    setActiveRunPerClient({});
  }, [selectedDate, deliveryShift]);

  // Filtro de repartidor: 'todos' | 'osvaldo' | 'simon'
  const [driverFilter, setDriverFilter] = useState<'todos' | 'osvaldo' | 'simon'>('todos');
  // Filtro de captura: 'todos' | 'pendientes' | 'cargados'
  const [completionFilter, setCompletionFilter] = useState<'todos' | 'pendientes' | 'cargados'>('todos');
  // Filtro de repartidor para la lista cotejo: 'todos' | 'osvaldo' | 'simon'
  const [checklistDriverFilter, setChecklistDriverFilter] = useState<'todos' | 'osvaldo' | 'simon'>('todos');
  const [searchQuery, setSearchQuery] = useState<string>('');
  // Vista dual dividida (anti-scroll), tabla ancha o gráfica comparativa de choferes
  const [viewLayout, setViewLayout] = useState<'dual_cotejo' | 'tabla_excel' | 'grafica_estadisticas'>('dual_cotejo');
  // Clientes con variedad de panes expandidos (para que las filas se mantengan delgadas y sobrias por defecto)
  const [expandedClients, setExpandedClients] = useState<Record<string, boolean>>({});

  const toggleExpandClient = (clientId: string) => {
    setExpandedClients(prev => ({ ...prev, [clientId]: !prev[clientId] }));
  };
  
  // Feedback toast
  const [toastNotice, setToastNotice] = useState<string>('');

  // Modal para Agregar / Editar Cliente
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [editingClient, setEditingClient] = useState<DriverCustomer | null>(null);

  // Formulario de Cliente
  const [formDriverId, setFormDriverId] = useState<'osvaldo' | 'simon'>('simon');
  const [formClientName, setFormClientName] = useState<string>('');
  const [formPhone, setFormPhone] = useState<string>('');
  const [formAddress, setFormAddress] = useState<string>('');
  const [formBreadItems, setFormBreadItems] = useState<Array<{ breadName: string; unitPrice: number }>>([
    { breadName: 'Bolillo', unitPrice: 4.00 },
    { breadName: 'Dulce', unitPrice: 8.50 }
  ]);

  // Estado de sincronización en tiempo real
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(true);
  const [isLiveSyncing, setIsLiveSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const syncTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Clientes de reparto activos (excluyendo solo mostrador "tienda" a menos que se desee)
  const deliveryClients = useMemo(() => {
    return driverCustomers.filter(c => c.driverId === 'osvaldo' || c.driverId === 'simon');
  }, [driverCustomers]);

  // Helper para obtener items de un cliente con valores por defecto si no tiene
  const getClientItems = (c: DriverCustomer): DeliveryClientBreadItem[] => {
    if (c.items && c.items.length > 0) return c.items;
    return [
      { breadName: 'Bolillo', unitPrice: 4.00 },
      { breadName: 'Dulce', unitPrice: 8.50 }
    ];
  };

  // Cálculo de totales por cliente o vuelta específica
  const getClientTotals = (c: DriverCustomer, overrideQuantities?: Record<string, number>) => {
    const items = getClientItems(c);
    const clientQty = overrideQuantities || dailyQuantities[c.id] || {};
    let totalPieces = 0;
    let totalAmount = 0;
    const itemsSummary: Array<{ name: string; quantity: number; unitPrice: number; total: number }> = [];

    items.forEach(it => {
      const q = clientQty[it.breadName] || 0;
      if (q > 0) {
        const itemTotal = q * it.unitPrice;
        totalPieces += q;
        totalAmount += itemTotal;
        itemsSummary.push({
          name: it.breadName,
          quantity: q,
          unitPrice: it.unitPrice,
          total: itemTotal
        });
      }
    });

    return { totalPieces, totalAmount, itemsSummary };
  };

  // Helper para obtener todas las vueltas/entregas de un cliente (vuelta 1 = client.id, vueltas 2+ = client.id__run_X)
  const getRunsForClient = (client: DriverCustomer) => {
    const runs: Array<{
      runKey: string;
      deliveryNumber: number;
      time: string;
      totalPieces: number;
      totalAmount: number;
      itemsSummary: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
      previousTime?: string;
      previousPieces?: number;
      previousAmount?: number;
      previousDeliveryNote?: string;
    }> = [];

    const prefix = `${client.id}__run_`;
    const runKeys = new Set<string>();
    runKeys.add(client.id);

    Object.keys(dailyQuantities).forEach(k => {
      if (k === client.id || k.startsWith(prefix)) {
        runKeys.add(k);
      }
    });

    Object.keys(deliveryRunMeta).forEach(k => {
      if (k === client.id || k.startsWith(prefix)) {
        runKeys.add(k);
      }
    });

    const sortedKeys = Array.from(runKeys).sort((a, b) => {
      if (a === client.id) return -1;
      if (b === client.id) return 1;
      const numA = parseInt(a.replace(prefix, ''), 10) || 0;
      const numB = parseInt(b.replace(prefix, ''), 10) || 0;
      return numA - numB;
    });

    sortedKeys.forEach((key, index) => {
      const deliveryNumber = index + 1;
      const meta = deliveryRunMeta[key];
      const defaultTime = deliveryShift === 'manana' ? '07:00 AM' : '04:00 PM';
      const time = meta?.time || defaultTime;
      const totals = getClientTotals(client, dailyQuantities[key] || {});

      let previousDeliveryNote: string | undefined = undefined;
      let previousTime: string | undefined = meta?.previousTime;
      let previousPieces: number | undefined = meta?.previousPieces;
      let previousAmount: number | undefined = meta?.previousAmount;

      if (deliveryNumber > 1 && runs.length > 0) {
        const prev = runs[runs.length - 1];
        previousTime = previousTime || prev.time;
        previousPieces = previousPieces !== undefined ? previousPieces : prev.totalPieces;
        previousAmount = previousAmount !== undefined ? previousAmount : prev.totalAmount;
        previousDeliveryNote = `${previousPieces} pzs a las ${previousTime}${previousAmount ? ` ($${previousAmount.toFixed(2)})` : ''}`;
      }

      runs.push({
        runKey: key,
        deliveryNumber,
        time,
        totalPieces: totals.totalPieces,
        totalAmount: totals.totalAmount,
        itemsSummary: totals.itemsSummary,
        previousTime,
        previousPieces,
        previousAmount,
        previousDeliveryNote
      });
    });

    return runs;
  };

  // Crear una nueva entrega/vuelta para el cliente (ej. Miriam viene por 20 bolillos más a las 09:00)
  const handleCreateNewDeliveryRun = (client: DriverCustomer) => {
    playCashSound();
    const currentRuns = getRunsForClient(client);
    const nextNumber = currentRuns.length + 1;
    const newKey = `${client.id}__run_${nextNumber}`;
    const nowTime = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });

    const lastRun = currentRuns[currentRuns.length - 1];
    const prevTime = lastRun?.time || (deliveryShift === 'manana' ? '07:00 AM' : '04:00 PM');
    const prevPieces = lastRun?.totalPieces || 0;
    const prevAmount = lastRun?.totalAmount || 0;

    const newMetaItem: DeliveryRunMetadata = {
      key: newKey,
      clientId: client.id,
      clientName: client.name,
      deliveryNumber: nextNumber,
      time: nowTime,
      timestamp: new Date().toISOString(),
      previousTime: prevTime,
      previousPieces: prevPieces,
      previousAmount: prevAmount
    };

    const updatedMeta = {
      ...deliveryRunMeta,
      [newKey]: newMetaItem
    };

    if (!updatedMeta[client.id]) {
      updatedMeta[client.id] = {
        key: client.id,
        clientId: client.id,
        clientName: client.name,
        deliveryNumber: 1,
        time: prevTime,
        timestamp: new Date().toISOString()
      };
    }

    setDeliveryRunMeta(updatedMeta);
    saveDeliveryRunMeta(selectedDate, deliveryShift, updatedMeta);

    setActiveRunPerClient(prev => ({ ...prev, [client.id]: newKey }));
    showToast(`✨ Entrega #${nextNumber} creada para ${client.name} (${nowTime}). Ya puedes ingresar las piezas.`);
  };

  // Eliminar una entrega/vuelta específica
  const handleDeleteDeliveryRun = (client: DriverCustomer, runKey: string, runNumber: number) => {
    if (!confirm(`¿Eliminar la entrega #${runNumber} de "${client.name}"?`)) return;
    playBeep(450, 'sawtooth', 0.05);

    setDailyQuantities(prev => {
      const updated = { ...prev };
      delete updated[runKey];
      saveDailyDeliverySheet(selectedDate, updated, deliveryShift);
      saveDailyDeliveryToFirestore(selectedDate, deliveryShift, updated).catch(console.warn);
      return updated;
    });

    const updatedMeta = { ...deliveryRunMeta };
    delete updatedMeta[runKey];
    setDeliveryRunMeta(updatedMeta);
    saveDeliveryRunMeta(selectedDate, deliveryShift, updatedMeta);

    deleteClientDeliveryFromFirestore(selectedDate, deliveryShift, runKey).catch(console.warn);

    const ticketId = `rep_${selectedDate}_${deliveryShift}_${runKey}`;
    const currentTickets = loadTickets();
    const filtered = currentTickets.filter(t => t.id !== ticketId);
    saveTickets(filtered, true);
    deleteSaleTicketFromFirestore(ticketId).catch(() => {});
    if (onDeleteTicket) onDeleteTicket(ticketId);

    setActiveRunPerClient(prev => ({ ...prev, [client.id]: client.id }));
    showToast(`🗑️ Entrega #${runNumber} de ${client.name} eliminada`);
  };

  // Construir objeto SaleTicket oficial para vincular a Historial de Ventas, Caja y Firestore
  const buildDeliverySaleTicket = (
    client: DriverCustomer,
    runKey: string = client.id,
    overrideQuantities?: Record<string, number>,
    runMeta?: { deliveryNumber?: number; time?: string }
  ): SaleTicket | null => {
    const clientQty = overrideQuantities || dailyQuantities[runKey] || {};
    const { totalPieces, totalAmount, itemsSummary } = getClientTotals(client, clientQty);
    if (totalPieces === 0) return null;

    const deliveryNumber = runMeta?.deliveryNumber || (runKey === client.id ? 1 : (parseInt(runKey.split('__run_')[1] || '1', 10) || 1));
    const runTime = runMeta?.time || (deliveryShift === 'manana' ? '06:30' : '16:00');
    const driverName = client.driverId === 'osvaldo' ? 'Osvaldo' : 'Simón';
    const ticketId = runKey === client.id ? `rep_${selectedDate}_${deliveryShift}_${client.id}` : `rep_${selectedDate}_${deliveryShift}_${runKey}`;
    const folioSuffix = deliveryNumber > 1 ? `-V${deliveryNumber}` : '';
    const folioCode = `${client.driverId === 'osvaldo' ? 'OSV' : 'SIM'}-${client.name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 4).toUpperCase()}${folioSuffix}`;

    const ticketItems: TicketItem[] = itemsSummary.map(it => ({
      id: `it_${ticketId}_${it.name.replace(/\s+/g, '_')}`,
      name: it.name,
      price: it.unitPrice,
      quantity: it.quantity,
      total: it.total
    }));

    const ticket: SaleTicket = {
      id: ticketId,
      folio: `REP-${folioCode}-${selectedDate.replace(/-/g, '')}`,
      timestamp: `${selectedDate}T${runTime.replace(/\s*[AP]M/i, '')}:00.000Z`,
      date: selectedDate,
      time: runTime,
      items: ticketItems,
      subtotal: totalAmount,
      discount: 0,
      total: totalAmount,
      paymentMethod: 'efectivo',
      amountPaid: totalAmount,
      change: 0,
      customerName: deliveryNumber > 1 ? `${client.name} (Entrega #${deliveryNumber})` : client.name,
      customerPhone: client.phone || '',
      pointsEarned: 0,
      pointsRedeemed: 0,
      cashier: `Reparto (${driverName})`,
      shift: deliveryShift === 'manana' ? 'turno1' : 'turno2',
      driverId: client.driverId,
      driverName,
      isDelivery: true,
      deliveryShift,
      deliveryDate: selectedDate,
      deliveryStatus: 'cargado'
    };

    return ticket;
  };

  // Vincular y sincronizar un cliente / entrega individual con Caja, Historial y Firestore
  const syncClientToCashAndHistory = (
    client: DriverCustomer,
    runKey: string = client.id,
    overrideQuantities?: Record<string, number>,
    runMeta?: { deliveryNumber?: number; time?: string }
  ) => {
    const ticket = buildDeliverySaleTicket(client, runKey, overrideQuantities, runMeta);
    const ticketId = runKey === client.id ? `rep_${selectedDate}_${deliveryShift}_${client.id}` : `rep_${selectedDate}_${deliveryShift}_${runKey}`;
    const currentTickets = loadTickets();

    if (!ticket) {
      // Si ya no tiene piezas, eliminar ticket existente de almacenamiento local y Firestore
      const filtered = currentTickets.filter(t => t.id !== ticketId);
      if (filtered.length !== currentTickets.length) {
        saveTickets(filtered, true);
        deleteSaleTicketFromFirestore(ticketId).catch(() => {});
        if (onDeleteTicket) onDeleteTicket(ticketId);
      }
      return null;
    }

    // Guardar / actualizar en almacenamiento local de forma inmediata
    const merged = mergeTickets([ticket], currentTickets);
    saveTickets(merged);

    // Notificar a App.tsx para que actualice en memoria Caja e Historial
    if (onSaveTicket) {
      onSaveTicket(ticket);
    }

    // Persistir directamente a Firestore en la colección 'tickets' para visibilidad global
    saveSaleTicketToFirestore(ticket).catch((err) => {
      console.warn('Error syncing delivery ticket to Firestore:', err);
    });

    return ticket;
  };

  // Vincular y sincronizar TODOS los clientes cargados hacia Caja, Historial y Firestore
  const handleSyncAllToCashAndHistory = async () => {
    setIsLiveSyncing(true);
    playCashSound();
    let syncedCount = 0;
    let totalAmountSynced = 0;

    // 1. Guardar la hoja completa en Firestore
    await saveDailyDeliveryToFirestore(selectedDate, deliveryShift, dailyQuantities);

    // 2. Generar y unificar tickets de venta
    const currentTickets = loadTickets();
    const newTicketsToMerge: SaleTicket[] = [];

    deliveryClients.forEach(client => {
      const runs = getRunsForClient(client);
      runs.forEach(r => {
        const ticketId = r.runKey === client.id
          ? `rep_${selectedDate}_${deliveryShift}_${client.id}`
          : `rep_${selectedDate}_${deliveryShift}_${r.runKey}`;

        if (r.totalPieces > 0) {
          const ticket = buildDeliverySaleTicket(client, r.runKey, undefined, {
            deliveryNumber: r.deliveryNumber,
            time: r.time
          });
          if (ticket) {
            newTicketsToMerge.push(ticket);
            saveSaleTicketToFirestore(ticket).catch(() => {});
            syncedCount++;
            totalAmountSynced += ticket.total;
          }
        } else {
          deleteSaleTicketFromFirestore(ticketId).catch(() => {});
        }
      });
    });

    if (newTicketsToMerge.length > 0) {
      const merged = mergeTickets(newTicketsToMerge, currentTickets);
      saveTickets(merged);
      newTicketsToMerge.forEach(t => onSaveTicket && onSaveTicket(t));
    }

    setIsLiveSyncing(false);
    setLastSyncTime(new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    showToast(`✅ ${syncedCount} repartos vinculados a Caja e Historial ($${totalAmountSynced.toFixed(2)}) y sincronizados en la nube.`);
  };

  const dailyQuantitiesRef = React.useRef(dailyQuantities);
  useEffect(() => {
    dailyQuantitiesRef.current = dailyQuantities;
  }, [dailyQuantities]);

  // 1. Cargar cantidades guardadas al cambiar fecha o turno + Escuchar en tiempo real de Firestore
  useEffect(() => {
    // Carga inmediata de respaldo local para evitar cualquier retraso visual
    const local = getDailyDeliverySheet(selectedDate, deliveryShift);
    setDailyQuantities(local);

    // Descarga directa desde Firestore respetando eliminaciones
    fetchDailyDeliveryFromFirestore(selectedDate, deliveryShift).then(cloudQuantities => {
      if (cloudQuantities && !syncTimeoutRef.current) {
        const deletedSet = getDeletedDeliveryKeys();
        const filteredRemote: Record<string, Record<string, number>> = {};
        for (const [cId, breads] of Object.entries(cloudQuantities)) {
          if (!deletedSet.has(`${selectedDate}_${deliveryShift}_${cId}`)) {
            filteredRemote[cId] = breads;
          }
        }
        setDailyQuantities(filteredRemote);
        saveDailyDeliverySheet(selectedDate, filteredRemote, deliveryShift);
      }
    });

    // Conectar escucha en tiempo real a Firestore
    setIsLiveSyncing(true);
    const unsubscribeFirestore = subscribeToDailyDelivery(
      selectedDate,
      deliveryShift,
      (cloudQuantities) => {
        setIsLiveConnected(true);
        setIsLiveSyncing(false);
        setLastSyncTime(new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        if (cloudQuantities && !syncTimeoutRef.current) {
          const deletedSet = getDeletedDeliveryKeys();
          const filteredRemote: Record<string, Record<string, number>> = {};
          for (const [cId, breads] of Object.entries(cloudQuantities)) {
            if (!deletedSet.has(`${selectedDate}_${deliveryShift}_${cId}`)) {
              filteredRemote[cId] = breads;
            }
          }
          setDailyQuantities(filteredRemote);
          saveDailyDeliverySheet(selectedDate, filteredRemote, deliveryShift);
        }
      }
    );

    // Escucha de evento de sincronización en segundo plano de la app
    const handleDailyDeliveryUpdated = () => {
      const fresh = getDailyDeliverySheet(selectedDate, deliveryShift);
      setDailyQuantities(fresh);
    };
    window.addEventListener('dailyDeliveryUpdated', handleDailyDeliveryUpdated);

    // Escucha entre pestañas abiertas en el mismo dispositivo
    const handleStorage = (e: StorageEvent) => {
      const targetKey = deliveryShift === 'tarde'
        ? `${DAILY_DELIVERY_PREFIX}${selectedDate}_tarde`
        : `${DAILY_DELIVERY_PREFIX}${selectedDate}`;
      if (e.key === targetKey && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          const deletedSet = getDeletedDeliveryKeys();
          const filtered: Record<string, Record<string, number>> = {};
          for (const [cId, breads] of Object.entries(parsed || {})) {
            if (!deletedSet.has(`${selectedDate}_${deliveryShift}_${cId}`)) {
              filtered[cId] = breads as Record<string, number>;
            }
          }
          setDailyQuantities(filtered);
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handleStorage);

    const handleBeforeUnload = () => {
      saveDailyDeliverySheet(selectedDate, dailyQuantitiesRef.current, deliveryShift);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      unsubscribeFirestore();
      window.removeEventListener('dailyDeliveryUpdated', handleDailyDeliveryUpdated);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [selectedDate, deliveryShift]);

  // Forzar sincronización manual a Firestore
  const handleForceSync = async () => {
    setIsLiveSyncing(true);
    playBeep(800, 'sine', 0.05);
    const ok = await saveDailyDeliveryToFirestore(selectedDate, deliveryShift, dailyQuantities);
    setIsLiveSyncing(false);
    if (ok) {
      setLastSyncTime(new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      showToast('☁️ Repartos sincronizados en tiempo real con Firebase');
    } else {
      showToast('⚠️ Datos guardados localmente, reconectando con la nube...');
    }
  };

  // Guardar cantidades en tiempo real (localStorage inmediato + Firestore debounced + vinculación a Caja/Historial)
  const updateQuantity = (runKey: string, breadName: string, qty: number) => {
    const safeQty = Math.max(0, isNaN(qty) ? 0 : Math.round(qty));
    setDailyQuantities(prev => {
      const clientObj = { ...(prev[runKey] || {}) };
      clientObj[breadName] = safeQty;

      const hasAnyBread = Object.values(clientObj).some(val => Number(val) > 0);
      const updated = {
        ...prev,
        [runKey]: clientObj
      };

      // Si tiene piezas activas, limpiar lápida. Si no tiene piezas, marcar como eliminado
      if (hasAnyBread) {
        unmarkDeliveryAsDeleted(selectedDate, deliveryShift, runKey);
      } else {
        markDeliveryAsDeleted(selectedDate, deliveryShift, runKey);
      }
      
      // 1. Respaldo local inmediato de la hoja de repartos
      saveDailyDeliverySheet(selectedDate, updated, deliveryShift);

      // 2. Transmisión a Firestore en tiempo real con debounce rápido (250ms)
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      setIsLiveSyncing(true);
      syncTimeoutRef.current = setTimeout(() => {
        if (!hasAnyBread) {
          deleteClientDeliveryFromFirestore(selectedDate, deliveryShift, runKey).catch(console.warn);
        }

        // Limpiar para Firestore enviando solo los clientes y panes con piezas > 0
        const cleanedFirestorePayload: Record<string, Record<string, number>> = {};
        Object.entries(updated).forEach(([cId, breads]) => {
          const activeBreads: Record<string, number> = {};
          Object.entries(breads || {}).forEach(([bName, bQty]) => {
            if (Number(bQty) > 0) activeBreads[bName] = Number(bQty);
          });
          if (Object.keys(activeBreads).length > 0) {
            cleanedFirestorePayload[cId] = activeBreads;
          }
        });

        saveDailyDeliveryToFirestore(selectedDate, deliveryShift, cleanedFirestorePayload).then(ok => {
          setIsLiveSyncing(false);
          if (ok) {
            setLastSyncTime(new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
          }
        });

        // 3. Vincular automáticamente este cliente a Caja, Historial y colección 'tickets' de Firestore
        const targetClient = deliveryClients.find(c => c.id === runKey || runKey.startsWith(`${c.id}__run_`));
        if (targetClient) {
          const ticketId = runKey === targetClient.id
            ? `rep_${selectedDate}_${deliveryShift}_${targetClient.id}`
            : `rep_${selectedDate}_${deliveryShift}_${runKey}`;

          if (!hasAnyBread) {
            const currentTickets = loadTickets();
            const filtered = currentTickets.filter(t => t.id !== ticketId);
            saveTickets(filtered, true);
            deleteSaleTicketFromFirestore(ticketId).catch(() => {});
            if (onDeleteTicket) onDeleteTicket(ticketId);
          } else {
            const runNum = runKey === targetClient.id ? 1 : (parseInt(runKey.split('__run_')[1] || '1', 10) || 1);
            const runMeta = deliveryRunMeta[runKey];
            syncClientToCashAndHistory(targetClient, runKey, clientObj, {
              deliveryNumber: runNum,
              time: runMeta?.time
            });
          }
        }
      }, 800);

      return updated;
    });
  };

  // Lista viva de entregas que se van cargando (para la columna de cotejo en tiempo real)
  // Cada entrega/vuelta aparece como una fila independiente con su hora y nota de entrega previa
  const clientsWithOrders = useMemo(() => {
    const firstDeliveries: Array<{
      client: DriverCustomer;
      runKey: string;
      deliveryNumber: number;
      time: string;
      totalPieces: number;
      totalAmount: number;
      itemsSummary: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
      previousDeliveryNote?: string;
      dayAccumulatedPieces?: number;
      dayAccumulatedAmount?: number;
      isRepeated: boolean;
    }> = [];

    const repeatedDeliveries: Array<{
      client: DriverCustomer;
      runKey: string;
      deliveryNumber: number;
      time: string;
      totalPieces: number;
      totalAmount: number;
      itemsSummary: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
      previousDeliveryNote?: string;
      dayAccumulatedPieces?: number;
      dayAccumulatedAmount?: number;
      isRepeated: boolean;
    }> = [];

    deliveryClients.forEach(c => {
      const runs = getRunsForClient(c);
      const dayTotalPieces = runs.reduce((sum, r) => sum + r.totalPieces, 0);
      const dayTotalAmount = runs.reduce((sum, r) => sum + r.totalAmount, 0);

      runs.forEach(r => {
        if (r.totalPieces > 0) {
          const item = {
            client: c,
            runKey: r.runKey,
            deliveryNumber: r.deliveryNumber,
            time: r.time,
            totalPieces: r.totalPieces,
            totalAmount: r.totalAmount,
            itemsSummary: r.itemsSummary,
            previousDeliveryNote: r.previousDeliveryNote,
            dayAccumulatedPieces: dayTotalPieces,
            dayAccumulatedAmount: dayTotalAmount,
            isRepeated: r.deliveryNumber > 1
          };
          if (r.deliveryNumber === 1) {
            firstDeliveries.push(item);
          } else {
            repeatedDeliveries.push(item);
          }
        }
      });
    });

    // Ordenar las repetidas por deliveryNumber y hora
    repeatedDeliveries.sort((a, b) => a.deliveryNumber - b.deliveryNumber);

    // "coloca el primer pedido primero y el los siguientes en orden"
    return [...firstDeliveries, ...repeatedDeliveries];
  }, [deliveryClients, dailyQuantities, deliveryRunMeta]);

  // Filtrado de la lista cotejo de entregas
  const filteredChecklist = useMemo(() => {
    return clientsWithOrders.filter(item => {
      if (checklistDriverFilter !== 'todos' && item.client.driverId !== checklistDriverFilter) return false;
      return true;
    });
  }, [clientsWithOrders, checklistDriverFilter]);

  // Filtrado para la lista de captura de clientes (con búsqueda y filtros)
  const filteredClients = useMemo(() => {
    return deliveryClients.filter(c => {
      if (driverFilter !== 'todos' && c.driverId !== driverFilter) return false;

      const runs = getRunsForClient(c);
      const totalPieces = runs.reduce((sum, r) => sum + r.totalPieces, 0);
      if (completionFilter === 'cargados' && totalPieces === 0) return false;
      if (completionFilter === 'pendientes' && totalPieces > 0) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = c.name.toLowerCase().includes(q);
        const matchItems = (c.items || []).some(it => it.breadName.toLowerCase().includes(q));
        if (!matchName && !matchItems) return false;
      }
      return true;
    });
  }, [deliveryClients, driverFilter, completionFilter, searchQuery, dailyQuantities, deliveryRunMeta]);

  // Totales de Osvaldo (incluye todas las vueltas, primeras entregas primero y siguientes en orden)
  const osvaldoTotals = useMemo(() => {
    let pieces = 0;
    let amount = 0;
    const firstSummaries: Array<{
      clientName: string;
      itemsSummary: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
      clientTotal: number;
      clientPieces: number;
      deliveryNumber?: number;
      deliveryTime?: string;
      previousDeliveryNote?: string;
    }> = [];
    const repeatedSummaries: Array<{
      clientName: string;
      itemsSummary: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
      clientTotal: number;
      clientPieces: number;
      deliveryNumber?: number;
      deliveryTime?: string;
      previousDeliveryNote?: string;
    }> = [];

    deliveryClients.filter(c => c.driverId === 'osvaldo').forEach(c => {
      const runs = getRunsForClient(c);
      runs.forEach(r => {
        if (r.totalPieces > 0) {
          pieces += r.totalPieces;
          amount += r.totalAmount;
          const summary = {
            clientName: r.deliveryNumber > 1 ? `${c.name} (Vuelta #${r.deliveryNumber})` : c.name,
            itemsSummary: r.itemsSummary,
            clientTotal: r.totalAmount,
            clientPieces: r.totalPieces,
            deliveryNumber: r.deliveryNumber,
            deliveryTime: r.time,
            previousDeliveryNote: r.previousDeliveryNote
          };
          if (r.deliveryNumber === 1) {
            firstSummaries.push(summary);
          } else {
            repeatedSummaries.push(summary);
          }
        }
      });
    });

    repeatedSummaries.sort((a, b) => (a.deliveryNumber || 1) - (b.deliveryNumber || 1));
    const clientSummaries = [...firstSummaries, ...repeatedSummaries];

    return { pieces, amount, clientSummaries };
  }, [deliveryClients, dailyQuantities, deliveryRunMeta]);

  // Totales de Simón (incluye todas las vueltas, primeras entregas primero y siguientes en orden)
  const simonTotals = useMemo(() => {
    let pieces = 0;
    let amount = 0;
    const firstSummaries: Array<{
      clientName: string;
      itemsSummary: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
      clientTotal: number;
      clientPieces: number;
      deliveryNumber?: number;
      deliveryTime?: string;
      previousDeliveryNote?: string;
    }> = [];
    const repeatedSummaries: Array<{
      clientName: string;
      itemsSummary: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
      clientTotal: number;
      clientPieces: number;
      deliveryNumber?: number;
      deliveryTime?: string;
      previousDeliveryNote?: string;
    }> = [];

    deliveryClients.filter(c => c.driverId === 'simon').forEach(c => {
      const runs = getRunsForClient(c);
      runs.forEach(r => {
        if (r.totalPieces > 0) {
          pieces += r.totalPieces;
          amount += r.totalAmount;
          const summary = {
            clientName: r.deliveryNumber > 1 ? `${c.name} (Vuelta #${r.deliveryNumber})` : c.name,
            itemsSummary: r.itemsSummary,
            clientTotal: r.totalAmount,
            clientPieces: r.totalPieces,
            deliveryNumber: r.deliveryNumber,
            deliveryTime: r.time,
            previousDeliveryNote: r.previousDeliveryNote
          };
          if (r.deliveryNumber === 1) {
            firstSummaries.push(summary);
          } else {
            repeatedSummaries.push(summary);
          }
        }
      });
    });

    repeatedSummaries.sort((a, b) => (a.deliveryNumber || 1) - (b.deliveryNumber || 1));
    const clientSummaries = [...firstSummaries, ...repeatedSummaries];

    return { pieces, amount, clientSummaries };
  }, [deliveryClients, dailyQuantities, deliveryRunMeta]);

  // Desglose de piezas por pan para Osvaldo (bolillos, teleras, rellenos, etc.)
  const osvaldoBreadBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    osvaldoTotals.clientSummaries.forEach(c => {
      (c.itemsSummary || []).forEach(it => {
        const name = (it.name || 'Pan').trim();
        map[name] = (map[name] || 0) + it.quantity;
      });
    });
    return map;
  }, [osvaldoTotals]);

  // Desglose de piezas por pan para Simón (bolillos, teleras, rellenos, etc.)
  const simonBreadBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    simonTotals.clientSummaries.forEach(c => {
      (c.itemsSummary || []).forEach(it => {
        const name = (it.name || 'Pan').trim();
        map[name] = (map[name] || 0) + it.quantity;
      });
    });
    return map;
  }, [simonTotals]);

  // Gran Total del Turno Activo
  const grandTotalAmount = osvaldoTotals.amount + simonTotals.amount;
  const grandTotalPieces = osvaldoTotals.pieces + simonTotals.pieces;
  const totalClientsServed = osvaldoTotals.clientSummaries.length + simonTotals.clientSummaries.length;

  // Conteo de piezas para los botones switch de Mañana y Tarde
  const mananaPiecesCount = useMemo(() => {
    if (deliveryShift === 'manana') return grandTotalPieces;
    return getDailyDeliveryPiecesCount(selectedDate, 'manana');
  }, [selectedDate, deliveryShift, grandTotalPieces, dailyQuantities]);

  const tardePiecesCount = useMemo(() => {
    if (deliveryShift === 'tarde') return grandTotalPieces;
    return getDailyDeliveryPiecesCount(selectedDate, 'tarde');
  }, [selectedDate, deliveryShift, grandTotalPieces, dailyQuantities]);

  const currentShiftLabel = deliveryShift === 'manana' ? 'Turno Mañana' : 'Turno Tarde';

  // Cambiar fecha
  const changeDateByDays = (delta: number) => {
    playBeep(600, 'sine', 0.03);
    const d = new Date(`${selectedDate}T12:00:00`);
    d.setDate(d.getDate() + delta);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    setSelectedDate(`${year}-${month}-${day}`);
  };

  const showToast = (msg: string) => {
    setToastNotice(msg);
    setTimeout(() => setToastNotice(''), 3500);
  };

  // Imprimir Ticket Individual de una entrega/vuelta específica (SEPARADO)
  const handlePrintRunTicket = (item: {
    client: DriverCustomer;
    runKey: string;
    deliveryNumber: number;
    time: string;
    totalPieces: number;
    totalAmount: number;
    itemsSummary: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
    previousDeliveryNote?: string;
    dayAccumulatedPieces?: number;
    dayAccumulatedAmount?: number;
  }) => {
    playCashSound();
    if (item.totalPieces === 0) {
      showToast(`⚠️ Ingresa al menos una pieza para imprimir el ticket de ${item.client.name}`);
      return;
    }

    // Asegurar sincronización en Caja, Historial y Firestore
    syncClientToCashAndHistory(item.client, item.runKey, undefined, {
      deliveryNumber: item.deliveryNumber,
      time: item.time
    });

    const driverName = item.client.driverId === 'osvaldo' ? 'Osvaldo' : 'Simón';
    printDeliveryClientTicketDirectToPrinter(
      item.client.name,
      driverName,
      selectedDate,
      item.itemsSummary,
      item.totalAmount,
      item.totalPieces,
      settings,
      currentShiftLabel,
      {
        deliveryNumber: item.deliveryNumber,
        deliveryTime: item.time,
        previousDeliveryNote: item.previousDeliveryNote,
        dayAccumulatedPieces: item.dayAccumulatedPieces,
        dayAccumulatedAmount: item.dayAccumulatedAmount
      }
    );
    showToast(`🖨️ Imprimiendo ticket separado para ${item.client.name} (Entrega #${item.deliveryNumber} • ${item.time})`);
  };

  // Imprimir Ticket Individual por Cliente (Usa la vuelta activa seleccionada)
  const handlePrintClientTicket = (client: DriverCustomer) => {
    const activeKey = activeRunPerClient[client.id] || client.id;
    const runs = getRunsForClient(client);
    const currentRun = runs.find(r => r.runKey === activeKey) || runs[0];
    const dayTotalPieces = runs.reduce((sum, r) => sum + r.totalPieces, 0);
    const dayTotalAmount = runs.reduce((sum, r) => sum + r.totalAmount, 0);

    if (!currentRun || currentRun.totalPieces === 0) {
      showToast(`⚠️ Ingresa al menos una pieza para imprimir el ticket de ${client.name}`);
      return;
    }

    handlePrintRunTicket({
      client,
      runKey: currentRun.runKey,
      deliveryNumber: currentRun.deliveryNumber,
      time: currentRun.time,
      totalPieces: currentRun.totalPieces,
      totalAmount: currentRun.totalAmount,
      itemsSummary: currentRun.itemsSummary,
      previousDeliveryNote: currentRun.previousDeliveryNote,
      dayAccumulatedPieces: dayTotalPieces,
      dayAccumulatedAmount: dayTotalAmount
    });
  };

  // Imprimir Ticket Consolidado Osvaldo (primeros pedidos primero, siguientes en orden)
  const handlePrintConsolidatedOsvaldo = () => {
    playCashSound();
    if (osvaldoTotals.clientSummaries.length === 0) {
      showToast(`⚠️ No hay pedidos con piezas cargadas para Osvaldo en ${currentShiftLabel}.`);
      return;
    }

    // Asegurar que todos los clientes de Osvaldo y sus vueltas estén sincronizados en Caja e Historial
    deliveryClients.filter(c => c.driverId === 'osvaldo').forEach(c => {
      const runs = getRunsForClient(c);
      runs.forEach(r => {
        if (r.totalPieces > 0) {
          syncClientToCashAndHistory(c, r.runKey, undefined, {
            deliveryNumber: r.deliveryNumber,
            time: r.time
          });
        }
      });
    });

    printDriverConsolidatedTicketDirectToPrinter(
      'Osvaldo',
      selectedDate,
      osvaldoTotals.clientSummaries,
      osvaldoTotals.amount,
      osvaldoTotals.pieces,
      settings,
      currentShiftLabel
    );
    showToast(`🖨️ Consolidado Osvaldo (${currentShiftLabel}): ${osvaldoTotals.pieces} pzs • $${osvaldoTotals.amount.toFixed(2)}`);
  };

  // Imprimir Ticket Consolidado Simón (primeros pedidos primero, siguientes en orden)
  const handlePrintConsolidatedSimon = () => {
    playCashSound();
    if (simonTotals.clientSummaries.length === 0) {
      showToast(`⚠️ No hay pedidos con piezas cargadas para Simón en ${currentShiftLabel}.`);
      return;
    }

    // Asegurar que todos los clientes de Simón y sus vueltas estén sincronizados en Caja e Historial
    deliveryClients.filter(c => c.driverId === 'simon').forEach(c => {
      const runs = getRunsForClient(c);
      runs.forEach(r => {
        if (r.totalPieces > 0) {
          syncClientToCashAndHistory(c, r.runKey, undefined, {
            deliveryNumber: r.deliveryNumber,
            time: r.time
          });
        }
      });
    });

    printDriverConsolidatedTicketDirectToPrinter(
      'Simón',
      selectedDate,
      simonTotals.clientSummaries,
      simonTotals.amount,
      simonTotals.pieces,
      settings,
      currentShiftLabel
    );
    showToast(`🖨️ Consolidado Simón (${currentShiftLabel}): ${simonTotals.pieces} pzs • $${simonTotals.amount.toFixed(2)}`);
  };

  // Abrir Modal para Nuevo Cliente
  const handleOpenAddClient = () => {
    playBeep(700, 'sine', 0.03);
    setEditingClient(null);
    setFormDriverId(driverFilter === 'osvaldo' ? 'osvaldo' : 'simon');
    setFormClientName('');
    setFormPhone('');
    setFormAddress('');
    setFormBreadItems([
      { breadName: 'Bolillo', unitPrice: 4.00 },
      { breadName: 'Dulce', unitPrice: 8.50 }
    ]);
    setShowAddModal(true);
  };

  // Abrir Modal para Editar Cliente Existente
  const handleOpenEditClient = (c: DriverCustomer) => {
    playBeep(700, 'sine', 0.03);
    setEditingClient(c);
    setFormDriverId(c.driverId === 'osvaldo' ? 'osvaldo' : 'simon');
    setFormClientName(c.name);
    setFormPhone(c.phone || '');
    setFormAddress(c.address || '');
    setFormBreadItems(getClientItems(c));
    setShowAddModal(true);
  };

  // Guardar Cliente (Nuevo o Editado)
  const handleSaveClient = () => {
    if (!formClientName.trim()) {
      alert('Ingresa el nombre del cliente');
      return;
    }

    playCashSound();
    const validItems = formBreadItems
      .filter(it => it.breadName.trim() !== '')
      .map(it => ({
        breadName: it.breadName.trim(),
        unitPrice: Number(it.unitPrice) || 0
      }));

    if (validItems.length === 0) {
      validItems.push({ breadName: 'Bolillo', unitPrice: 4.00 });
    }

    if (editingClient) {
      // Modificar existente
      let updatedClientObj: DriverCustomer | null = null;
      const updated = driverCustomers.map(c => {
        if (c.id === editingClient.id) {
          const mod = {
            ...c,
            name: formClientName.trim(),
            driverId: formDriverId,
            phone: formPhone.trim() || undefined,
            address: formAddress.trim() || undefined,
            items: validItems
          };
          updatedClientObj = mod;
          return mod;
        }
        return c;
      });
      onUpdateDriverCustomers(updated);
      saveDriverCustomers(updated);
      if (updatedClientObj) {
        saveDriverCustomerToFirestore(updatedClientObj);
      }
      showToast(`✅ Cliente "${formClientName.trim()}" actualizado correctamente`);
    } else {
      // Crear nuevo cliente
      const newId = `dc_${formDriverId}_${Date.now()}`;
      const newClient: DriverCustomer = {
        id: newId,
        name: formClientName.trim(),
        driverId: formDriverId,
        customerType: 'reparto',
        phone: formPhone.trim() || undefined,
        address: formAddress.trim() || undefined,
        items: validItems
      };
      const updated = [...driverCustomers, newClient];
      onUpdateDriverCustomers(updated);
      saveDriverCustomers(updated);
      saveDriverCustomerToFirestore(newClient);
      showToast(`✅ Nuevo cliente "${formClientName.trim()}" agregado a ${formDriverId === 'osvaldo' ? 'Osvaldo' : 'Simón'}`);
    }

    setShowAddModal(false);
  };

  // Eliminar Cliente
  const handleDeleteClient = (c: DriverCustomer) => {
    if (!confirm(`¿Eliminar al cliente "${c.name}" de la lista de reparto?`)) return;
    playBeep(450, 'sawtooth', 0.05);
    const updated = driverCustomers.filter(item => item.id !== c.id);
    onUpdateDriverCustomers(updated);
    saveDriverCustomers(updated);
    deleteDriverCustomerFromFirestore(c.id);
    showToast(`🗑️ Cliente "${c.name}" eliminado`);
  };

  // Limpiar / Eliminar todos los pedidos cargados de un cliente en este turno (incluyendo todas sus vueltas)
  const handleClearClient = (c: DriverCustomer) => {
    if (!confirm(`¿Eliminar y borrar los pedidos cargados para "${c.name}" en este turno?`)) return;
    playBeep(450, 'sawtooth', 0.05);

    // Cancelar cualquier debounce pendiente para este cliente
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    const clientId = c.id;
    const prefix = `${clientId}__run_`;

    // 1. Marcar lápida para client.id y todas sus vueltas
    markDeliveryAsDeleted(selectedDate, deliveryShift, clientId);
    deleteClientDeliveryFromFirestore(selectedDate, deliveryShift, clientId).catch(console.warn);

    // 2. Limpiar cantidades en el estado y en localStorage
    setDailyQuantities(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(k => {
        if (k === clientId || k.startsWith(prefix)) {
          delete updated[k];
          markDeliveryAsDeleted(selectedDate, deliveryShift, k);
          deleteClientDeliveryFromFirestore(selectedDate, deliveryShift, k).catch(console.warn);
        }
      });
      saveDailyDeliverySheet(selectedDate, updated, deliveryShift);
      saveDailyDeliveryToFirestore(selectedDate, deliveryShift, updated).catch(console.warn);
      return updated;
    });

    // 3. Limpiar deliveryRunMeta
    const updatedMeta = { ...deliveryRunMeta };
    Object.keys(updatedMeta).forEach(k => {
      if (k === clientId || k.startsWith(prefix)) {
        delete updatedMeta[k];
      }
    });
    setDeliveryRunMeta(updatedMeta);
    saveDeliveryRunMeta(selectedDate, deliveryShift, updatedMeta);

    // 4. Eliminar tickets de venta asociados para este cliente en Caja, Historial y Firestore
    const currentTickets = loadTickets();
    const filtered = currentTickets.filter(t => {
      if (t.id === `rep_${selectedDate}_${deliveryShift}_${clientId}` || t.id.startsWith(`rep_${selectedDate}_${deliveryShift}_${clientId}__run_`)) return false;
      if (
        t.isDelivery && 
        t.deliveryDate === selectedDate && 
        (t.deliveryShift === deliveryShift || 
          (deliveryShift === 'manana' && t.shift === 'turno1') || 
          (deliveryShift === 'tarde' && t.shift === 'turno2')) && 
        (t.customerName?.trim().toLowerCase().startsWith(c.name.trim().toLowerCase()) || (t as any).customerId === clientId)
      ) {
        return false;
      }
      return true;
    });
    // Guardar con forceOverwrite: true para que no se re-fusione con loadTickets
    saveTickets(filtered, true);
    deleteSaleTicketFromFirestore(`rep_${selectedDate}_${deliveryShift}_${clientId}`).catch(() => {});
    if (onDeleteTicket) {
      onDeleteTicket(`rep_${selectedDate}_${deliveryShift}_${clientId}`);
    }

    setActiveRunPerClient(prev => {
      const next = { ...prev };
      delete next[clientId];
      return next;
    });

    // 5. Notificar a otros componentes
    window.dispatchEvent(new Event('dailyDeliveryUpdated'));
    showToast(`🗑️ Pedidos de "${c.name}" eliminados permanentemente`);
  };

  // Ajustar cantidad rápida (+1, -1, +10, -10)
  const adjustQty = (clientId: string, breadName: string, delta: number) => {
    playBeep(delta > 0 ? 800 : 500, 'sine', 0.02);
    const current = (dailyQuantities[clientId] || {})[breadName] || 0;
    const next = Math.max(0, current + delta);
    updateQuantity(clientId, breadName, next);
  };

  // Helper de Formateo de Fecha Amigable
  const formatDayDateText = (dateStr: string) => {
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        const weekdayFull = d.toLocaleDateString('es-MX', { weekday: 'long' });
        const weekdayShort = d.toLocaleDateString('es-MX', { weekday: 'short' });
        const monthFull = d.toLocaleDateString('es-MX', { month: 'long' });
        const monthShort = d.toLocaleDateString('es-MX', { month: 'short' });
        const dayNum = String(d.getDate());
        const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
        return {
          weekdayFull: cap(weekdayFull),
          weekdayShort: cap(weekdayShort),
          dayNum,
          monthFull: cap(monthFull),
          monthShort: cap(monthShort),
          shortLabel: `${cap(weekdayFull)} ${dayNum} ${cap(monthShort)}`,
          fullLabel: `${cap(weekdayFull)}, ${dayNum} de ${cap(monthFull)}`
        };
      }
    } catch (e) {}
    return {
      weekdayFull: '',
      weekdayShort: '',
      dayNum: '',
      monthFull: '',
      monthShort: '',
      shortLabel: dateStr,
      fullLabel: dateStr
    };
  };

  // Fechas de referencia
  const todayStr = getTodayString();
  const tomorrowStr = getTomorrowString();
  const targetDateInfo = useMemo(() => formatDayDateText(selectedDate), [selectedDate]);
  const tomorrowDateInfo = useMemo(() => formatDayDateText(tomorrowStr), [tomorrowStr]);
  const todayDateInfo = useMemo(() => formatDayDateText(todayStr), [todayStr]);

  // Textos dinámicos solicitados para los botones de Turno
  const morningShiftButtonText = useMemo(() => {
    if (selectedDate === tomorrowStr) {
      return `🌅 Entrega para Mañana: ${targetDateInfo.shortLabel}`;
    }
    if (selectedDate === todayStr) {
      return `🌅 Entrega Hoy (Mañana): ${targetDateInfo.shortLabel}`;
    }
    return `🌅 Entrega Mañana: ${targetDateInfo.shortLabel}`;
  }, [selectedDate, tomorrowStr, todayStr, targetDateInfo]);

  const afternoonShiftButtonText = useMemo(() => {
    if (selectedDate === tomorrowStr) {
      return `🌇 Entrega para la Tarde: ${targetDateInfo.shortLabel}`;
    }
    if (selectedDate === todayStr) {
      return `🌇 Entrega Hoy (Tarde): ${targetDateInfo.shortLabel}`;
    }
    return `🌇 Entrega Tarde: ${targetDateInfo.shortLabel}`;
  }, [selectedDate, tomorrowStr, todayStr, targetDateInfo]);

  // Enviar ticket individual por WhatsApp al cliente (acepta entrega/vuelta específica)
  const handleSendWhatsAppClientTicket = (client: DriverCustomer, runItem?: {
    deliveryNumber: number;
    time: string;
    totalPieces: number;
    totalAmount: number;
    itemsSummary: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
    previousDeliveryNote?: string;
  }) => {
    const runs = getRunsForClient(client);
    const activeKey = activeRunPerClient[client.id] || client.id;
    const currentRun = runItem || runs.find(r => r.runKey === activeKey) || runs[0];

    const { totalPieces, totalAmount, itemsSummary } = currentRun
      ? { totalPieces: currentRun.totalPieces, totalAmount: currentRun.totalAmount, itemsSummary: currentRun.itemsSummary }
      : getClientTotals(client);

    if (totalPieces === 0) {
      showToast(`⚠️ No hay piezas cargadas para ${client.name}`);
      return;
    }

    playCashSound();
    const driverName = client.driverId === 'osvaldo' ? 'Osvaldo' : 'Simón';
    const shiftLabel = deliveryShift === 'manana' ? 'Turno Mañana' : 'Turno Tarde';
    const dateFormatted = targetDateInfo.fullLabel;
    const deliveryNumber = currentRun?.deliveryNumber || 1;
    const deliveryTime = currentRun?.time || (deliveryShift === 'manana' ? '07:00 AM' : '04:00 PM');

    const itemsText = itemsSummary
      .map(it => `• *${it.quantity} pzs* ${it.name} ($${it.unitPrice.toFixed(2)} c/u) = *$${it.total.toFixed(2)}*`)
      .join('\n');

    let previousText = '';
    if (deliveryNumber > 1 && currentRun?.previousDeliveryNote) {
      previousText = `\n⚠️ *Entrega previa hoy:* ${currentRun.previousDeliveryNote}\n`;
    }

    const message = 
`🥖 *PANADERÍA SANTA FÉ* 🛵
*TICKET DE ENTREGA - REPARTO*
----------------------------------------
👤 *Cliente:* ${client.name}${deliveryNumber > 1 ? ` *(Entrega #${deliveryNumber})*` : ''}
📅 *Fecha:* ${dateFormatted}
⏰ *Hora:* ${deliveryTime} (${shiftLabel})
🛵 *Repartidor:* ${driverName}
----------------------------------------${previousText}
*DETALLE DEL PEDIDO:*
${itemsText}
----------------------------------------
📦 *Total Piezas:* ${totalPieces} pzs
💵 *TOTAL A PAGAR:* $${totalAmount.toFixed(2)}
----------------------------------------
¡Muchas gracias por su preferencia! 🥖✨
_Panadería Santa Fé • Calidad y Tradición_`;

    const phone = client.phone ? client.phone.replace(/\D/g, '') : '';
    const cleanPhone = phone.length === 10 ? `52${phone}` : phone;
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;

    window.open(url, '_blank');
    showToast(`📲 Abriendo WhatsApp para ticket de ${client.name}`);
  };

  // Enviar ticket consolidado por WhatsApp a Osvaldo o a Simón
  const handleSendWhatsAppDriverTicket = (driverId: 'osvaldo' | 'simon') => {
    const isOsvaldo = driverId === 'osvaldo';
    const driverName = isOsvaldo ? 'Osvaldo' : 'Simón';
    const totals = isOsvaldo ? osvaldoTotals : simonTotals;

    if (totals.pieces === 0) {
      showToast(`⚠️ No hay repartos cargados para ${driverName} en esta fecha/turno.`);
      return;
    }

    playCashSound();
    const shiftLabel = deliveryShift === 'manana' ? 'Turno Mañana' : 'Turno Tarde';
    const dateFormatted = targetDateInfo.fullLabel;

    const clientListText = totals.clientSummaries.map((c, i) => {
      const breakdown = c.itemsSummary.map(it => `   • ${it.quantity} ${it.name} ($${it.unitPrice.toFixed(2)})`).join('\n');
      return `${i + 1}. *${c.clientName}* (${c.clientPieces} pzs) -> *$${c.clientTotal.toFixed(2)}*\n${breakdown}`;
    }).join('\n\n');

    const breadTotalsMap: Record<string, number> = {};
    totals.clientSummaries.forEach(c => {
      (c.itemsSummary || []).forEach(it => {
        const name = (it.name || 'Pan').trim();
        breadTotalsMap[name] = (breadTotalsMap[name] || 0) + Number(it.quantity || 0);
      });
    });

    const breadBreakdownText = Object.entries(breadTotalsMap)
      .filter(([_, qty]) => qty > 0)
      .map(([name, qty]) => `   • ${name}: ${qty} pzs`)
      .join('\n');

    const message = 
`🛵 *PANADERÍA SANTA FÉ* 🥖
*HOJA DE RUTA Y LIQUIDACIÓN CONSOLIDADA*
----------------------------------------
👤 *Repartidor:* ${driverName} (${isOsvaldo ? 'Ruta 1' : 'Ruta 2'})
📅 *Fecha:* ${dateFormatted}
⏰ *Turno:* ${shiftLabel}
----------------------------------------
📦 *CLIENTES A SURTIR (${totals.clientSummaries.length} entregas):*

${clientListText}

----------------------------------------
📊 *TOTAL PIEZAS:* ${totals.pieces} pzs
🥖 *RESUMEN DE PIEZAS A LLEVAR:*
${breadBreakdownText || '   • Sin piezas cargadas'}
💵 *MONTO TOTAL A LIQUIDAR:* $${totals.amount.toFixed(2)}
----------------------------------------
⚠️ *Nota:* Al terminar la ruta entregar este monto total a mostrador/caja. ¡Buen viaje y excelente reparto! 🥖🛵`;

    // Buscar teléfono del chofer
    const allDrivers = loadDrivers();
    const foundDriver = allDrivers.find(d => d.id === driverId);
    const driverPhone = foundDriver?.phone || (isOsvaldo ? '442 816 3291' : '442 765 4321');
    const cleanDigits = driverPhone.replace(/\D/g, '');
    const cleanPhone = cleanDigits.length === 10 ? `52${cleanDigits}` : cleanDigits;

    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;

    window.open(url, '_blank');
    showToast(`📲 Enviando reporte consolidado por WhatsApp a ${driverName}`);
  };

  return (
    <div className="space-y-2 max-w-[1650px] mx-auto pb-6">
      {/* Toast Notification */}
      {toastNotice && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white px-3 py-2 rounded-xl shadow-2xl border-2 border-amber-400 font-bold text-xs animate-in slide-in-from-top-3 flex items-center gap-2">
          <span>{toastNotice}</span>
        </div>
      )}

      {/* 1. CABECERA PRINCIPAL COMPACTA: TÍTULO, SELECTOR DE DÍA Y SWITCH DE TURNO */}
      <div className="bg-white rounded-xl p-2 sm:p-2.5 shadow-2xs border border-slate-200 space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          
          {/* Título & Badge */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-base shadow-2xs">
              🛵
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-base font-black text-slate-900 leading-tight">
                  Repartos
                </h1>
                <span className="bg-blue-100 text-blue-900 text-[10px] font-bold px-1.5 py-0.2 rounded border border-blue-200">
                  Mostrador
                </span>
                <span className="bg-emerald-100 text-emerald-900 text-[10px] font-bold px-1.5 py-0.2 rounded border border-emerald-300">
                  {clientsWithOrders.length} cargados
                </span>
              </div>
              <p className="text-[10.5px] text-slate-500 font-medium">
                {targetDateInfo.fullLabel} • <span className="text-slate-800 font-bold">{deliveryShift === 'manana' ? 'Turno Mañana' : 'Turno Tarde'}</span>
              </p>
            </div>
          </div>

          {/* Selector de Fecha Rápido (Mañana por defecto, Hoy o Calendario) */}
          <div className="flex flex-wrap items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
            <span className="text-[9.5px] font-bold uppercase text-slate-400 px-1">
              Entrega:
            </span>

            {/* Botón Hoy (Primero a la izquierda) */}
            <button
              type="button"
              onClick={() => {
                setSelectedDate(todayStr);
                playBeep(650, 'sine', 0.03);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedDate === todayStr
                  ? 'bg-blue-600 text-white shadow-2xs font-black'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
              }`}
              title="Cargar pedidos para hoy"
            >
              Hoy ({todayDateInfo.weekdayShort} {todayDateInfo.dayNum})
            </button>

            {/* Botón Mañana (A la derecha) */}
            <button
              type="button"
              onClick={() => {
                setSelectedDate(tomorrowStr);
                playBeep(650, 'sine', 0.03);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedDate === tomorrowStr
                  ? 'bg-blue-600 text-white shadow-2xs font-black'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
              }`}
              title="Cargar pedidos para mañana"
            >
              ⚡ Mañana ({tomorrowDateInfo.weekdayShort} {tomorrowDateInfo.dayNum})
            </button>

            {/* Selector Calendario */}
            <div className="flex items-center gap-0.5 bg-white border border-slate-300 rounded-lg px-1 py-0.5">
              <button
                type="button"
                onClick={() => changeDateByDays(-1)}
                className="p-0.5 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"
                title="Día Anterior"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <Calendar className="w-3 h-3 text-blue-600 shrink-0" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="text-[11px] font-bold text-slate-800 bg-transparent focus:outline-none cursor-pointer w-24"
                title="Elegir otra fecha"
              />
              <button
                type="button"
                onClick={() => changeDateByDays(1)}
                className="p-0.5 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"
                title="Día Siguiente"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Sincronización en Tiempo Real */}
            <div className="flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-lg text-[10.5px] font-bold ml-1">
              <span className={`w-1.5 h-1.5 rounded-full ${isLiveSyncing ? 'bg-amber-500 animate-ping' : 'bg-emerald-500'}`}></span>
              <span>{isLiveSyncing ? 'Sincronizando' : 'En vivo'}</span>
              <button
                type="button"
                onClick={handleForceSync}
                className="p-0.5 hover:bg-emerald-100 rounded text-emerald-700 cursor-pointer ml-0.5"
                title="Actualizar nube"
              >
                <RefreshCw className={`w-2.5 h-2.5 ${isLiveSyncing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* BOTONES SWITCH DE TURNO DINÁMICOS COMPACTOS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 border-t border-slate-100">
          <button
            type="button"
            id="btn-shift-manana"
            onClick={() => {
              setDeliveryShift('manana');
              playBeep(650, 'sine', 0.03);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center justify-between gap-2 cursor-pointer border ${
              deliveryShift === 'manana'
                ? 'bg-amber-400 text-slate-950 border-amber-500 shadow-2xs ring-1 ring-amber-300'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <div className="flex items-center gap-1.5 truncate">
              <span>🌅</span>
              <span className="truncate">{morningShiftButtonText}</span>
            </div>
            <span className="bg-slate-900 text-white text-[10px] px-2 py-0.5 rounded-full font-mono shrink-0">
              {mananaPiecesCount} pzs
            </span>
          </button>

          <button
            type="button"
            id="btn-shift-tarde"
            onClick={() => {
              setDeliveryShift('tarde');
              playBeep(650, 'sine', 0.03);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center justify-between gap-2 cursor-pointer border ${
              deliveryShift === 'tarde'
                ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs ring-1 ring-indigo-300'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <div className="flex items-center gap-1.5 truncate">
              <span>🌇</span>
              <span className="truncate">{afternoonShiftButtonText}</span>
            </div>
            <span className="bg-white text-indigo-950 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold shrink-0">
              {tardePiecesCount} pzs
            </span>
          </button>
        </div>
      </div>

      {/* 2. BARRA COMPACTA DE CONSOLIDADOS POR REPARTIDOR Y TOTAL */}
      <div className="bg-white rounded-xl p-1.5 sm:p-2 shadow-2xs border border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Simón */}
          <div className="flex items-center gap-1.5 bg-blue-50/80 border border-blue-200 rounded-lg px-2.5 py-1">
            <span className="text-base">🚴</span>
            <div className="text-xs">
              <span className="font-black text-blue-950 mr-1">Simón:</span>
              <span className="font-mono font-bold text-blue-900">${simonTotals.amount.toFixed(2)}</span>
              <span className="text-[10.5px] text-blue-700 ml-1">({simonTotals.pieces} pzs)</span>
            </div>
            <button
              type="button"
              onClick={handlePrintConsolidatedSimon}
              disabled={simonTotals.pieces === 0}
              className={`ml-1 px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                simonTotals.pieces > 0
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
              title="Ticket consolidado Simón"
            >
              <Printer className="w-3 h-3" />
              <span>Ticket Simón 📋</span>
            </button>
            <button
              type="button"
              onClick={() => handleSendWhatsAppDriverTicket('simon')}
              disabled={simonTotals.pieces === 0}
              className={`px-1.5 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                simonTotals.pieces > 0
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
              title="Enviar ticket consolidado por WhatsApp a Simón"
            >
              <MessageCircle className="w-3 h-3" />
              <span>Whats</span>
            </button>
          </div>

          {/* Osvaldo */}
          <div className="flex items-center gap-1.5 bg-amber-50/80 border border-amber-200 rounded-lg px-2.5 py-1">
            <span className="text-base">🛵</span>
            <div className="text-xs">
              <span className="font-black text-amber-950 mr-1">Osvaldo:</span>
              <span className="font-mono font-bold text-amber-950">${osvaldoTotals.amount.toFixed(2)}</span>
              <span className="text-[10.5px] text-amber-800 ml-1">({osvaldoTotals.pieces} pzs)</span>
            </div>
            <button
              type="button"
              onClick={handlePrintConsolidatedOsvaldo}
              disabled={osvaldoTotals.pieces === 0}
              className={`ml-1 px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                osvaldoTotals.pieces > 0
                  ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-2xs'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
              title="Ticket consolidado Osvaldo"
            >
              <Printer className="w-3 h-3" />
              <span>Ticket Osvaldo 📋</span>
            </button>
            <button
              type="button"
              onClick={() => handleSendWhatsAppDriverTicket('osvaldo')}
              disabled={osvaldoTotals.pieces === 0}
              className={`px-1.5 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                osvaldoTotals.pieces > 0
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
              title="Enviar ticket consolidado por WhatsApp a Osvaldo"
            >
              <MessageCircle className="w-3 h-3" />
              <span>Whats</span>
            </button>
          </div>
        </div>

        {/* Total Turno, Botón Conectar a Caja y Selector de Modo */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Botón explícito para conectar y sincronizar todos los repartos a Caja e Historial */}
          <button
            type="button"
            onClick={handleSyncAllToCashAndHistory}
            disabled={clientsWithOrders.length === 0}
            className={`px-2.5 py-1 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
              clientsWithOrders.length > 0
                ? 'bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white shadow-xs active:scale-95'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
            title="Conectar y sincronizar todos los pedidos cargados con Historial de Ventas, Caja y Firebase"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Conectar a Caja e Historial ({clientsWithOrders.length})</span>
          </button>

          <div className="text-right">
            <span className="text-[9.5px] uppercase font-bold text-slate-400 block">
              Total {currentShiftLabel}:
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-base font-black font-mono text-emerald-700">
                ${grandTotalAmount.toFixed(2)}
              </span>
              <span className="text-[11px] font-bold text-slate-500">
                ({grandTotalPieces} pzs)
              </span>
            </div>
          </div>

          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setViewLayout('dual_cotejo')}
              className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                viewLayout === 'dual_cotejo'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Vista Dividida: Carga y Cotejo en la misma pantalla"
            >
              👥 Cotejo en Vivo
            </button>
            <button
              type="button"
              onClick={() => setViewLayout('tabla_excel')}
              className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                viewLayout === 'tabla_excel'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Vista de Tabla clásica"
            >
              📑 Tabla
            </button>
            <button
              type="button"
              onClick={() => setViewLayout('grafica_estadisticas')}
              className={`px-2.5 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                viewLayout === 'grafica_estadisticas'
                  ? 'bg-blue-600 text-white shadow-2xs font-black'
                  : 'text-blue-900 hover:text-blue-950 bg-blue-50/80 font-black'
              }`}
              title="Gráfica interactiva de Simón vs Osvaldo por semana, mes o día"
            >
              <BarChart2 className="w-3.5 h-3.5 text-amber-300" />
              <span>📊 Gráfica Simón vs Osvaldo</span>
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          3. VISTAS DE REPARTO: GRÁFICA COMPARATIVA, VISTA DUAL O TABLA
          ========================================================================= */}
      {viewLayout === 'grafica_estadisticas' ? (
        <DeliveryComparisonChart 
          onSelectDate={(d) => setSelectedDate(d)} 
          currentSelectedDate={selectedDate}
        />
      ) : viewLayout === 'dual_cotejo' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-start">
          
          {/* ==========================================
              COLUMNA IZQUIERDA (lg:col-span-7): BUSCADOR Y CAPTURA ULTRA-COMPACTA
              ========================================== */}
          <div className="lg:col-span-7 space-y-1.5">
            {/* Barra de Filtros y Búsqueda Compacta */}
            <div className="bg-white rounded-xl p-1.5 shadow-2xs border border-slate-200 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
                {/* Filtro Repartidor */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setDriverFilter('todos')}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                      driverFilter === 'todos' ? 'bg-slate-900 text-white shadow-2xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    Todos ({deliveryClients.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDriverFilter('simon')}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                      driverFilter === 'simon' ? 'bg-blue-600 text-white shadow-2xs' : 'bg-blue-50 text-blue-900 hover:bg-blue-100'
                    }`}
                  >
                    Simón
                  </button>
                  <button
                    type="button"
                    onClick={() => setDriverFilter('osvaldo')}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                      driverFilter === 'osvaldo' ? 'bg-amber-500 text-slate-950 shadow-2xs' : 'bg-amber-50 text-amber-950 hover:bg-amber-100'
                    }`}
                  >
                    Osvaldo
                  </button>
                </div>

                {/* Filtro Estado */}
                <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-md text-[10.5px]">
                  <button
                    type="button"
                    onClick={() => setCompletionFilter('todos')}
                    className={`px-1.5 py-0.5 rounded font-bold cursor-pointer ${
                      completionFilter === 'todos' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompletionFilter('pendientes')}
                    className={`px-1.5 py-0.5 rounded font-bold cursor-pointer ${
                      completionFilter === 'pendientes' ? 'bg-amber-500 text-slate-950 shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    ⏳ Pendientes
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompletionFilter('cargados')}
                    className={`px-1.5 py-0.5 rounded font-bold cursor-pointer ${
                      completionFilter === 'cargados' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    ✓ Cargados ({clientsWithOrders.length})
                  </button>
                </div>

                <button
                  id="btn-add-delivery-client-quick"
                  type="button"
                  onClick={handleOpenAddClient}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-0.5 px-2 rounded-md text-[11px] flex items-center gap-1 shadow-2xs transition-all active:scale-95 cursor-pointer ml-auto"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ Cliente</span>
                </button>
              </div>

              {/* Buscador Simple y Directo */}
              <div className="relative w-full">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="🔍 Buscar cliente por nombre (ej. San Jose, Bolillo, Liz, Hope)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-600 rounded-lg pl-8 pr-7 py-1 text-xs font-bold text-slate-900 focus:outline-none transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* TABLA DE FILAS DELGADAS Y SOBRIAS (QUEPAN 22 CLIENTES CÓMODAMENTE) */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
              <div className="bg-slate-100 text-slate-700 px-2.5 py-1 text-[10.5px] font-bold flex items-center justify-between border-b border-slate-200">
                <span className="w-44 truncate">Cliente / Repartidor</span>
                <span className="flex-1 text-center">Piezas de Pan (Ingreso rápido)</span>
                <span className="w-20 text-right pr-6">Cuenta</span>
              </div>

              <div className="max-h-[calc(100vh-220px)] min-h-[560px] overflow-y-auto divide-y divide-slate-100">
                {filteredClients.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 font-bold text-xs">
                    No se encontraron clientes para "{searchQuery || driverFilter}".
                  </div>
                ) : (
                  filteredClients.map((client) => {
                    const items = getClientItems(client);
                    const runs = getRunsForClient(client);
                    const activeKey = activeRunPerClient[client.id] || client.id;
                    const activeRun = runs.find(r => r.runKey === activeKey) || runs[0];
                    const clientQtyObj = dailyQuantities[activeKey] || {};
                    const { totalPieces, totalAmount, itemsSummary } = getClientTotals(client, clientQtyObj);
                    const dayTotalPieces = runs.reduce((sum, r) => sum + r.totalPieces, 0);
                    const dayTotalAmount = runs.reduce((sum, r) => sum + r.totalAmount, 0);
                    const isSimon = client.driverId === 'simon';
                    const isExpanded = !!expandedClients[client.id];

                    // Encontrar índice de entrega si ya está cargado
                    const deliveryIndex = clientsWithOrders.findIndex(item => item.client.id === client.id && item.runKey === activeKey);

                    return (
                      <div
                        key={client.id}
                        className={`transition-colors p-1.5 ${
                          totalPieces > 0 ? 'bg-emerald-50/25' : 'hover:bg-slate-50/80'
                        }`}
                      >
                        {/* Selector de Vueltas / Entregas si tiene varias o si ya cargó piezas en la 1ra */}
                        {(runs.length > 1 || runs[0].totalPieces > 0) && (
                          <div className="flex items-center gap-1 mb-1 flex-wrap">
                            {runs.map((r) => {
                              const isSelected = r.runKey === activeKey;
                              return (
                                <button
                                  key={r.runKey}
                                  type="button"
                                  onClick={() => setActiveRunPerClient(prev => ({ ...prev, [client.id]: r.runKey }))}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer border ${
                                    isSelected
                                      ? 'bg-slate-900 text-amber-400 border-slate-900 shadow-2xs font-black ring-1 ring-amber-400'
                                      : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                                  }`}
                                >
                                  <span>Entrega #{r.deliveryNumber}</span>
                                  <span className="text-[9px] opacity-75">({r.time})</span>
                                  {r.totalPieces > 0 && (
                                    <span className={`px-1 rounded-full text-[8.5px] ${isSelected ? 'bg-amber-400 text-slate-950 font-bold' : 'bg-slate-200 text-slate-700'}`}>
                                      {r.totalPieces}p
                                    </span>
                                  )}
                                </button>
                              );
                            })}

                            {/* Botón para agregar una nueva entrega/vuelta */}
                            <button
                              type="button"
                              onClick={() => handleCreateNewDeliveryRun(client)}
                              className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 flex items-center gap-0.5 shadow-2xs cursor-pointer transition-all active:scale-95"
                              title={`Agregar entrega #${runs.length + 1} para ${client.name} (ej. si viene por más pan más tarde)`}
                            >
                              <Plus className="w-2.5 h-2.5" />
                              <span>{runs.length === 1 && runs[0].totalPieces === 0 ? '+ Otra vuelta' : `+ ${runs.length + 1}da Entrega`}</span>
                            </button>

                            {/* Si la vuelta activa es la 2da o superior, dar opción de eliminarla */}
                            {activeRun.deliveryNumber > 1 && (
                              <button
                                type="button"
                                onClick={() => handleDeleteDeliveryRun(client, activeRun.runKey, activeRun.deliveryNumber)}
                                className="px-1.5 py-0.5 rounded text-[9.5px] font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 cursor-pointer ml-auto"
                                title={`Eliminar Entrega #${activeRun.deliveryNumber}`}
                              >
                                ✕ Quitar #{activeRun.deliveryNumber}
                              </button>
                            )}
                          </div>
                        )}

                        {/* Banner de Entrega Previa si es vuelta 2 o posterior */}
                        {activeRun.deliveryNumber > 1 && (
                          <div className="bg-amber-50 border border-amber-300 rounded px-2 py-0.5 text-[10px] font-medium text-amber-950 flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1 truncate">
                              <span className="text-amber-700 font-bold">⚠️ Entrega previa hoy:</span>
                              <span className="font-semibold text-slate-800">{activeRun.previousDeliveryNote || `${activeRun.previousPieces || 0} pzs a las ${activeRun.previousTime}`}</span>
                            </div>
                            <span className="text-[9.5px] text-amber-800 font-bold ml-1 shrink-0">
                              Hora de esta vuelta: {activeRun.time}
                            </span>
                          </div>
                        )}

                        {/* Fila principal delgada */}
                        <div className="px-1 py-0.5 min-h-[34px] flex items-center justify-between gap-1.5 text-xs">
                          {/* 1. Cliente & Ruta */}
                          <div className="flex items-center gap-1.5 w-44 shrink-0 min-w-0">
                            <span className={`text-[9px] font-black px-1.5 py-0.2 rounded shrink-0 ${
                              isSimon ? 'bg-blue-100 text-blue-900' : 'bg-amber-100 text-amber-900'
                            }`}>
                              {isSimon ? 'S' : 'O'}
                            </span>
                            <span className="font-bold text-slate-800 text-xs truncate" title={client.name}>
                              {client.name}
                            </span>
                            {activeRun.deliveryNumber > 1 ? (
                              <span className="bg-amber-500 text-slate-950 font-mono text-[9px] font-black px-1 rounded shrink-0">
                                #{activeRun.deliveryNumber}
                              </span>
                            ) : deliveryIndex >= 0 ? (
                              <span className="bg-slate-900 text-amber-400 font-mono text-[9px] font-bold px-1 rounded shrink-0">
                                #{deliveryIndex + 1}
                              </span>
                            ) : null}
                          </div>

                          {/* 2. Ingreso Directo de Piezas */}
                          {items.length <= 2 ? (
                            <div className="flex items-center gap-2.5 flex-1 justify-center min-w-0">
                              {items.map((it) => (
                                <div key={it.breadName} className="flex items-center gap-1">
                                  <span className="text-[11px] text-slate-600 font-medium truncate max-w-[65px]" title={it.breadName}>
                                    {it.breadName}
                                  </span>
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={clientQtyObj[it.breadName] !== undefined && clientQtyObj[it.breadName] !== null ? clientQtyObj[it.breadName] : ''}
                                    onFocus={(e) => e.target.select()}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      if (raw === '' || raw === '0' || raw === '00') {
                                        updateQuantity(activeKey, it.breadName, 0);
                                      } else {
                                        const val = parseInt(raw, 10);
                                        updateQuantity(activeKey, it.breadName, isNaN(val) ? 0 : Math.max(0, val));
                                      }
                                    }}
                                    className="w-12 h-6 text-center font-mono font-bold text-xs bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 focus:border-blue-600 rounded focus:outline-none transition-colors"
                                  />
                                  {Number(clientQtyObj[it.breadName] || 0) > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => updateQuantity(activeKey, it.breadName, 0)}
                                      className="text-[9.5px] font-black font-mono text-slate-400 hover:text-rose-600 hover:bg-rose-50 px-1 py-0.5 rounded cursor-pointer transition-colors"
                                      title="Poner en 00 (quitar piezas de este pan)"
                                    >
                                      00
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 flex-1 justify-center min-w-0">
                              <button
                                type="button"
                                onClick={() => toggleExpandClient(client.id)}
                                className="text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded cursor-pointer flex items-center gap-1"
                              >
                                <span>{items.length} variedades</span>
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                              {totalPieces > 0 && !isExpanded && (
                                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                  {totalPieces} pzs
                                </span>
                              )}
                            </div>
                          )}

                          {/* 3. Subtotal y Botones de Acción Rápidos */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <div className="w-16 text-right font-mono font-bold text-xs text-slate-900">
                              ${totalAmount.toFixed(2)}
                            </div>

                            {/* 1. Imprimir Ticket Individual Separado */}
                            <button
                              type="button"
                              onClick={() => handlePrintRunTicket({
                                client,
                                runKey: activeRun.runKey,
                                deliveryNumber: activeRun.deliveryNumber,
                                time: activeRun.time,
                                totalPieces,
                                totalAmount,
                                itemsSummary,
                                previousDeliveryNote: activeRun.previousDeliveryNote,
                                dayAccumulatedPieces: dayTotalPieces,
                                dayAccumulatedAmount: dayTotalAmount
                              })}
                              disabled={totalPieces === 0}
                              className={`p-1 rounded transition-all cursor-pointer ${
                                totalPieces > 0
                                  ? 'bg-slate-900 hover:bg-black text-amber-400 active:scale-95 shadow-2xs'
                                  : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                              }`}
                              title={`Imprimir ticket individual de Entrega #${activeRun.deliveryNumber} ($${totalAmount.toFixed(2)})`}
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>

                            {/* 2. Enviar Ticket por WhatsApp */}
                            <button
                              type="button"
                              onClick={() => handleSendWhatsAppClientTicket(client, {
                                deliveryNumber: activeRun.deliveryNumber,
                                time: activeRun.time,
                                totalPieces,
                                totalAmount,
                                itemsSummary,
                                previousDeliveryNote: activeRun.previousDeliveryNote
                              })}
                              disabled={totalPieces === 0}
                              className={`p-1 rounded transition-all cursor-pointer ${
                                totalPieces > 0
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95 shadow-2xs'
                                  : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                              }`}
                              title={`Enviar ticket por WhatsApp a ${client.name}`}
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </button>

                            {/* 3. Eliminar Pedidos Cargados */}
                            {totalPieces > 0 && (
                              <button
                                type="button"
                                onClick={() => handleClearClient(client)}
                                className="p-1 rounded text-rose-400 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                                title={`Eliminar pedido cargado de ${client.name}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* 4. Editar Cliente */}
                            <button
                              type="button"
                              onClick={() => handleOpenEditClient(client)}
                              className="p-1 text-slate-300 hover:text-blue-600 cursor-pointer"
                              title="Editar cliente"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Desglose Expandible para clientes con más de 2 panes (como Hope Wash) */}
                        {items.length > 2 && isExpanded && (
                          <div className="px-2.5 py-1.5 bg-slate-50/90 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-3 gap-1 animate-in fade-in">
                            {items.map((it) => (
                              <div key={it.breadName} className="flex items-center justify-between gap-1 bg-white px-1.5 py-0.5 rounded border border-slate-200 text-xs">
                                <span className="truncate text-[10.5px] font-medium text-slate-700" title={it.breadName}>
                                  {it.breadName} <span className="text-slate-400 text-[9.5px]">(${it.unitPrice.toFixed(2)})</span>
                                </span>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={clientQtyObj[it.breadName] !== undefined && clientQtyObj[it.breadName] !== null ? clientQtyObj[it.breadName] : ''}
                                    onFocus={(e) => e.target.select()}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      if (raw === '' || raw === '0' || raw === '00') {
                                        updateQuantity(activeKey, it.breadName, 0);
                                      } else {
                                        const val = parseInt(raw, 10);
                                        updateQuantity(activeKey, it.breadName, isNaN(val) ? 0 : Math.max(0, val));
                                      }
                                    }}
                                    className="w-11 h-5 text-center font-mono font-bold text-xs bg-slate-50 border border-slate-300 rounded focus:bg-white focus:border-blue-600 focus:outline-none"
                                  />
                                  {Number(clientQtyObj[it.breadName] || 0) > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => updateQuantity(activeKey, it.breadName, 0)}
                                      className="text-[9px] font-black font-mono text-slate-400 hover:text-rose-600 hover:bg-rose-50 px-0.5 py-0.2 rounded cursor-pointer transition-colors"
                                      title="Poner en 00"
                                    >
                                      00
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* ==========================================
              COLUMNA DERECHA (lg:col-span-5): COTEJO EN VIVO DE ENTREGAS ENUMERADAS (#1, #2, #3...)
              Filas delgadas y sobrias donde caben 22 entregas en pantalla
              ========================================== */}
          <div className="lg:col-span-5 space-y-1.5">
            {/* Header del Cotejo */}
            <div className="bg-slate-900 text-white rounded-xl px-2.5 py-1.5 shadow-2xs flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <ListOrdered className="w-3.5 h-3.5 text-amber-400" />
                <h3 className="font-black text-xs uppercase tracking-wider text-white">
                  Entregas Cargadas ({filteredChecklist.length})
                </h3>
                <span className="text-[10px] text-slate-400 hidden sm:inline">
                  • Cotejo {targetDateInfo.shortLabel}
                </span>
              </div>

              {/* Filtro rápido por repartidor */}
              <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700 text-[10.5px]">
                <button
                  type="button"
                  onClick={() => setChecklistDriverFilter('todos')}
                  className={`px-1.5 py-0.2 rounded font-bold cursor-pointer ${
                    checklistDriverFilter === 'todos' ? 'bg-amber-400 text-slate-950 font-black' : 'text-slate-300'
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setChecklistDriverFilter('simon')}
                  className={`px-1.5 py-0.2 rounded font-bold cursor-pointer ${
                    checklistDriverFilter === 'simon' ? 'bg-blue-500 text-white font-black' : 'text-slate-300'
                  }`}
                >
                  Simón
                </button>
                <button
                  type="button"
                  onClick={() => setChecklistDriverFilter('osvaldo')}
                  className={`px-1.5 py-0.2 rounded font-bold cursor-pointer ${
                    checklistDriverFilter === 'osvaldo' ? 'bg-amber-500 text-slate-950 font-black' : 'text-slate-300'
                  }`}
                >
                  Osvaldo
                </button>
              </div>
            </div>

            {/* Lista Delgada de Entregas (#1, #2, #3...) */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
              <div className="max-h-[calc(100vh-220px)] min-h-[560px] overflow-y-auto divide-y divide-slate-100">
                {filteredChecklist.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 font-bold border-2 border-dashed border-slate-100 m-2 rounded-xl space-y-1">
                    <p className="text-xs font-bold text-slate-600">Aún no hay entregas cargadas.</p>
                    <p className="text-[10.5px] text-slate-400 font-normal">
                      Ingresa piezas en la lista izquierda y aparecerán aquí enumeradas en tiempo real.
                    </p>
                  </div>
                ) : (
                  filteredChecklist.map((item, idx) => (
                    <div
                      key={`${item.client.id}_${item.runKey}_${idx}`}
                      className={`px-2.5 py-1.5 min-h-[38px] flex flex-col justify-center gap-0.5 text-xs transition-colors border-b border-slate-100 ${
                        item.isRepeated ? 'bg-amber-50/50 hover:bg-amber-50/80 border-l-4 border-l-amber-500' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        {/* # Número + Chofer + Cliente + Vuelta */}
                        <div className="flex items-center gap-1.5 min-w-0 max-w-[190px]">
                          <span className="w-5 h-5 rounded bg-slate-900 text-amber-400 font-bold font-mono text-[10px] flex items-center justify-center shrink-0">
                            #{idx + 1}
                          </span>
                          <span className={`text-[8.5px] font-black px-1 py-0.2 rounded shrink-0 ${
                            item.client.driverId === 'simon' ? 'bg-blue-100 text-blue-900' : 'bg-amber-100 text-amber-900'
                          }`}>
                            {item.client.driverId === 'simon' ? 'S' : 'O'}
                          </span>
                          <div className="truncate min-w-0">
                            <span className="font-bold text-slate-900 text-xs truncate" title={item.client.name}>
                              {item.client.name}
                            </span>
                            {item.isRepeated && (
                              <span className="ml-1 bg-amber-500 text-slate-950 font-black text-[9px] px-1 py-0.2 rounded shrink-0">
                                Vuelta #{item.deliveryNumber}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Hora de entrega */}
                        <div className="flex items-center gap-0.5 text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded shrink-0">
                          <Clock className="w-2.5 h-2.5 text-slate-400" />
                          <span>{item.time}</span>
                        </div>

                        {/* Resumen de Panes (Sobrio y conciso) */}
                        <div 
                          className="text-[10.5px] text-slate-600 truncate flex-1 min-w-0 max-w-[120px] hidden sm:block font-medium" 
                          title={item.itemsSummary.map(it => `${it.quantity} ${it.name}`).join(', ')}
                        >
                          {item.itemsSummary.map(it => `${it.quantity} ${it.name}`).join(' • ')}
                        </div>

                        {/* Monto y Botones Rápidos */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className="text-right font-mono font-bold text-xs text-slate-950">
                            ${item.totalAmount.toFixed(2)}
                            <span className="text-[10px] text-slate-400 font-normal ml-1">({item.totalPieces}p)</span>
                          </div>

                          {/* Imprimir Ticket Individual Separado */}
                          <button
                            type="button"
                            onClick={() => handlePrintRunTicket(item)}
                            className="p-1 rounded bg-slate-900 hover:bg-black text-amber-400 font-bold transition-all active:scale-95 cursor-pointer shadow-2xs"
                            title={`Imprimir ticket individual de Entrega #${item.deliveryNumber} ($${item.totalAmount.toFixed(2)})`}
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>

                          {/* Enviar WhatsApp Ticket */}
                          <button
                            type="button"
                            onClick={() => handleSendWhatsAppClientTicket(item.client, item)}
                            className="p-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all active:scale-95 cursor-pointer shadow-2xs"
                            title={`Enviar ticket por WhatsApp a ${item.client.name}`}
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </button>

                          {/* Modificar */}
                          <button
                            type="button"
                            onClick={() => {
                              setActiveRunPerClient(prev => ({ ...prev, [item.client.id]: item.runKey }));
                              setSearchQuery(item.client.name);
                              playBeep(700, 'sine', 0.02);
                            }}
                            className="p-1 text-slate-400 hover:text-blue-600 cursor-pointer"
                            title={`Modificar Entrega #${item.deliveryNumber}`}
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>

                          {/* Eliminar Pedido */}
                          <button
                            type="button"
                            onClick={() => {
                              if (item.deliveryNumber > 1) {
                                handleDeleteDeliveryRun(item.client, item.runKey, item.deliveryNumber);
                              } else {
                                handleClearClient(item.client);
                              }
                            }}
                            className="p-1 rounded hover:bg-rose-100 text-rose-500 hover:text-rose-700 cursor-pointer transition-colors"
                            title={`Eliminar pedido cargado de ${item.client.name} (Entrega #${item.deliveryNumber})`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Aviso explícito de entrega previa si es una vuelta repetida */}
                      {item.isRepeated && item.previousDeliveryNote && (
                        <div className="text-[10px] bg-amber-100/90 text-amber-950 px-2 py-0.5 rounded font-medium flex items-center justify-between">
                          <span className="truncate">⚠️ <b>Entrega previa:</b> {item.previousDeliveryNote}</span>
                          {item.dayAccumulatedAmount !== undefined && (
                            <span className="font-bold font-mono text-[9.5px] text-amber-950 ml-1 shrink-0">
                              Total día: ${item.dayAccumulatedAmount.toFixed(2)} ({item.dayAccumulatedPieces}p)
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* =========================================================================
            VISTA TABLA CLÁSICA (TAMBIÉN CON FILAS DELGADAS Y SOBRIAS)
            ========================================================================= */
        <div className="bg-white rounded-xl shadow-2xs border border-slate-200 overflow-hidden">
          {/* Cabecera de la Tabla */}
          <div className="bg-slate-900 text-white px-3 py-1.5 grid grid-cols-12 gap-2 text-[10.5px] font-bold uppercase tracking-wider items-center">
            <div className="col-span-1">Ruta</div>
            <div className="col-span-3">Cliente</div>
            <div className="col-span-5">Piezas por Tipo de Pan</div>
            <div className="col-span-2 text-right">Cuenta</div>
            <div className="col-span-1 text-center">Ticket</div>
          </div>

          {/* Filas Delgadas y Sobrias */}
          <div className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
            {filteredClients.length === 0 ? (
              <div className="p-6 text-center text-slate-400 font-bold text-xs">
                No se encontraron clientes para el filtro seleccionado.
              </div>
            ) : (
              filteredClients.map((client) => {
                const items = getClientItems(client);
                const runs = getRunsForClient(client);
                const activeKey = activeRunPerClient[client.id] || client.id;
                const activeRun = runs.find(r => r.runKey === activeKey) || runs[0];
                const clientQtyObj = dailyQuantities[activeKey] || {};
                const { totalPieces, totalAmount } = getClientTotals(client, clientQtyObj);
                const isSimon = client.driverId === 'simon';

                return (
                  <div 
                    key={client.id}
                    className={`px-3 py-1 text-xs grid grid-cols-12 gap-2 items-center min-h-[34px] transition-colors ${
                      totalPieces > 0 ? 'bg-amber-50/30' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="col-span-1">
                      <span className={`text-[9px] font-black px-1.5 py-0.2 rounded ${
                        isSimon ? 'bg-blue-100 text-blue-900' : 'bg-amber-100 text-amber-900'
                      }`}>
                        {isSimon ? 'Simón' : 'Osvaldo'}
                      </span>
                    </div>

                    <div className="col-span-3 flex items-center gap-1.5 min-w-0 flex-wrap">
                      <span className="font-bold text-slate-900 text-xs truncate" title={client.name}>
                        {client.name}
                      </span>
                      {activeRun.deliveryNumber > 1 && (
                        <span className="bg-amber-500 text-slate-950 font-black text-[9px] px-1 rounded">
                          V#{activeRun.deliveryNumber}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleOpenEditClient(client)}
                        className="text-slate-300 hover:text-blue-600 p-0.5"
                        title="Editar"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="col-span-5 flex flex-wrap items-center gap-2">
                      {items.map((it) => (
                        <div key={it.breadName} className="flex items-center gap-1 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                          <span className="text-[10.5px] font-medium text-slate-700 truncate max-w-[70px]" title={it.breadName}>
                            {it.breadName}
                          </span>
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={clientQtyObj[it.breadName] !== undefined && clientQtyObj[it.breadName] !== null ? clientQtyObj[it.breadName] : ''}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (raw === '' || raw === '0' || raw === '00') {
                                updateQuantity(activeKey, it.breadName, 0);
                              } else {
                                const val = parseInt(raw, 10);
                                updateQuantity(activeKey, it.breadName, isNaN(val) ? 0 : Math.max(0, val));
                              }
                            }}
                            className="w-12 h-5 text-center font-mono font-bold text-xs bg-white border border-slate-300 rounded focus:border-blue-600 focus:outline-none"
                          />
                          {Number(clientQtyObj[it.breadName] || 0) > 0 && (
                            <button
                              type="button"
                              onClick={() => updateQuantity(activeKey, it.breadName, 0)}
                              className="text-[9px] font-black font-mono text-slate-400 hover:text-rose-600 hover:bg-rose-50 px-1 py-0.2 rounded cursor-pointer transition-colors"
                              title="Poner en 00"
                            >
                              00
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="col-span-2 text-right">
                      <span className="font-bold font-mono text-xs text-slate-900">
                        ${totalAmount.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal ml-1">
                        ({totalPieces}p)
                      </span>
                    </div>

                    <div className="col-span-1 flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => handlePrintClientTicket(client)}
                        disabled={totalPieces === 0}
                        className={`p-1 rounded transition-all cursor-pointer ${
                          totalPieces > 0
                            ? 'bg-slate-900 hover:bg-black text-amber-400 shadow-2xs active:scale-95'
                            : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                        }`}
                        title="Imprimir ticket"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSendWhatsAppClientTicket(client)}
                        disabled={totalPieces === 0}
                        className={`p-1 rounded transition-all cursor-pointer ${
                          totalPieces > 0
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs active:scale-95'
                            : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                        }`}
                        title={`Enviar ticket por WhatsApp a ${client.name}`}
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                      </button>

                      {totalPieces > 0 && (
                        <button
                          type="button"
                          onClick={() => handleClearClient(client)}
                          className="p-1 rounded hover:bg-rose-100 text-rose-500 hover:text-rose-700 cursor-pointer transition-colors"
                          title={`Eliminar pedido cargado de ${client.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          BOTONES Y TARJETAS DE CONSOLIDADO Y LIQUIDACIÓN AL FONDO
          ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1">
        {/* REPARTIDOR: OSVALDO */}
        <div className="bg-gradient-to-br from-amber-500 via-amber-600 to-orange-600 text-white rounded-3xl p-4 shadow-sm flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🛵</span>
              <div>
                <h3 className="font-black text-base leading-tight">Osvaldo</h3>
                <p className="text-[11px] text-amber-100 font-medium">
                  {osvaldoTotals.clientSummaries.length} clientes surtidos ({currentShiftLabel})
                </p>
              </div>
            </div>
            <span className="bg-white/20 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
              Ruta 1
            </span>
          </div>

          <div className="bg-black/15 rounded-2xl p-3 flex items-baseline justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-amber-100 block">Total a Liquidar</span>
              <span className="text-2xl font-black font-mono tracking-tight">${osvaldoTotals.amount.toFixed(2)}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-amber-100 block">Piezas Cargadas</span>
              <span className="text-lg font-black font-mono">{osvaldoTotals.pieces} pzs</span>
            </div>
          </div>

          {/* Desglose de piezas por pan para Osvaldo */}
          {Object.keys(osvaldoBreadBreakdown).length > 0 && (
            <div className="bg-black/20 rounded-2xl p-2.5 text-[11px] space-y-1">
              <span className="text-[10px] uppercase font-black text-amber-100 block tracking-wider">🥖 Desglose de piezas:</span>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(osvaldoBreadBreakdown).map(([name, qty]) => (
                  <span key={name} className="bg-black/30 text-white font-bold px-2 py-0.5 rounded-lg text-xs flex items-center gap-1 border border-amber-300/30">
                    <span>{name}:</span>
                    <span className="font-mono font-black text-amber-200">{qty} pzs</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              id="btn-print-consolidated-osvaldo"
              type="button"
              onClick={handlePrintConsolidatedOsvaldo}
              className="flex-1 bg-white hover:bg-amber-50 text-slate-900 font-black py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs hover:shadow-md transition-all active:scale-98 cursor-pointer"
            >
              <Printer className="w-4 h-4 text-amber-600" />
              <span>Imprimir Ticket Osvaldo 📋</span>
            </button>
            <button
              type="button"
              onClick={() => handleSendWhatsAppDriverTicket('osvaldo')}
              className="bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-black py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs hover:shadow-md transition-all cursor-pointer border border-emerald-400 shrink-0"
              title="Enviar ticket consolidado por WhatsApp a Osvaldo"
            >
              <MessageCircle className="w-4 h-4" />
              <span>WhatsApp</span>
            </button>
          </div>
        </div>

        {/* REPARTIDOR: SIMÓN */}
        <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 text-white rounded-3xl p-4 shadow-sm flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🚴</span>
              <div>
                <h3 className="font-black text-base leading-tight">Simón</h3>
                <p className="text-[11px] text-blue-100 font-medium">
                  {simonTotals.clientSummaries.length} clientes surtidos ({currentShiftLabel})
                </p>
              </div>
            </div>
            <span className="bg-white/20 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
              Ruta 2
            </span>
          </div>

          <div className="bg-black/15 rounded-2xl p-3 flex items-baseline justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-blue-100 block">Total a Liquidar</span>
              <span className="text-2xl font-black font-mono tracking-tight">${simonTotals.amount.toFixed(2)}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-blue-100 block">Piezas Cargadas</span>
              <span className="text-lg font-black font-mono">{simonTotals.pieces} pzs</span>
            </div>
          </div>

          {/* Desglose de piezas por pan para Simón */}
          {Object.keys(simonBreadBreakdown).length > 0 && (
            <div className="bg-black/20 rounded-2xl p-2.5 text-[11px] space-y-1">
              <span className="text-[10px] uppercase font-black text-blue-100 block tracking-wider">🥖 Desglose de piezas:</span>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(simonBreadBreakdown).map(([name, qty]) => (
                  <span key={name} className="bg-black/30 text-white font-bold px-2 py-0.5 rounded-lg text-xs flex items-center gap-1 border border-blue-300/30">
                    <span>{name}:</span>
                    <span className="font-mono font-black text-blue-200">{qty} pzs</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              id="btn-print-consolidated-simon"
              type="button"
              onClick={handlePrintConsolidatedSimon}
              className="flex-1 bg-white hover:bg-blue-50 text-slate-900 font-black py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs hover:shadow-md transition-all active:scale-98 cursor-pointer"
            >
              <Printer className="w-4 h-4 text-blue-600" />
              <span>Imprimir Ticket Simón 📋</span>
            </button>
            <button
              type="button"
              onClick={() => handleSendWhatsAppDriverTicket('simon')}
              className="bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-black py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs hover:shadow-md transition-all cursor-pointer border border-emerald-400 shrink-0"
              title="Enviar ticket consolidado por WhatsApp a Simón"
            >
              <MessageCircle className="w-4 h-4" />
              <span>WhatsApp</span>
            </button>
          </div>
        </div>

        {/* RESUMEN GLOBAL DEL TURNO + BOTÓN AGREGAR CLIENTE */}
        <div className="bg-slate-900 text-white rounded-3xl p-4 shadow-sm flex flex-col justify-between space-y-3 border border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                Total {currentShiftLabel}
              </span>
              <h3 className="text-2xl font-black font-mono text-emerald-400">
                ${grandTotalAmount.toFixed(2)}
              </h3>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                Piezas Totales
              </span>
              <span className="text-xl font-black font-mono text-white">
                {grandTotalPieces} pzs
              </span>
            </div>
          </div>

          <div className="text-[11px] text-slate-300 font-medium">
            {totalClientsServed} clientes surtidos en {currentShiftLabel} ({deliveryClients.length} disponibles en total).
          </div>

          <button
            id="btn-add-delivery-client"
            type="button"
            onClick={handleOpenAddClient}
            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition-all active:scale-98 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Agregar Nuevo Cliente de Reparto</span>
          </button>
        </div>
      </div>

      {/* 5. MODAL AGREGAR / EDITAR CLIENTE CON PRODUCTOS Y PRECIOS PERSONALIZADOS */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-2xl max-w-lg w-full border border-slate-200 animate-in zoom-in-95 my-auto max-h-[95vh] overflow-y-auto space-y-4">
            
            {/* Header del Modal */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg">
                  {editingClient ? '✏️' : '➕'}
                </div>
                <div>
                  <h3 className="font-black text-base text-slate-900">
                    {editingClient ? 'Editar Cliente de Reparto' : 'Agregar Nuevo Cliente de Reparto'}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-semibold">
                    Asigna el repartidor y los tipos de pan con su precio unitario
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Selector de Repartidor */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Repartidor Asignado:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFormDriverId('simon')}
                  className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 border-2 transition-all cursor-pointer ${
                    formDriverId === 'simon'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span>🚴 Simón</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormDriverId('osvaldo')}
                  className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 border-2 transition-all cursor-pointer ${
                    formDriverId === 'osvaldo'
                      ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span>🛵 Osvaldo</span>
                </button>
              </div>
            </div>

            {/* Nombre del Cliente */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Nombre del Cliente o Negocio:
              </label>
              <input
                type="text"
                placeholder="ej. Abarrotes San Juan, Cremería La Reina..."
                value={formClientName}
                onChange={(e) => setFormClientName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Teléfono y Dirección opcionales */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">
                  Teléfono (opcional):
                </label>
                <input
                  type="text"
                  placeholder="442..."
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">
                  Dirección (opcional):
                </label>
                <input
                  type="text"
                  placeholder="Calle o colonia..."
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Lista Dinámica de Tipos de Pan y Precios */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-slate-800">
                  Tipos de Pan & Precios Unitarios:
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setFormBreadItems(prev => [...prev, { breadName: '', unitPrice: 8.50 }]);
                  }}
                  className="text-xs font-black text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar Pan</span>
                </button>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {formBreadItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                    <input
                      type="text"
                      placeholder="Nombre del pan (ej: Bolillo, Dulce, Bagel...)"
                      value={item.breadName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormBreadItems(prev => {
                          const updated = [...prev];
                          updated[idx] = { ...updated[idx], breadName: val };
                          return updated;
                        });
                      }}
                      className="flex-1 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800"
                    />

                    <div className="flex items-center gap-1">
                      <span className="text-xs font-bold text-slate-400">$</span>
                      <input
                        type="number"
                        step="0.10"
                        min="0"
                        placeholder="0.00"
                        value={item.unitPrice || ''}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setFormBreadItems(prev => {
                            const updated = [...prev];
                            updated[idx] = { ...updated[idx], unitPrice: val };
                            return updated;
                          });
                        }}
                        className="w-20 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono font-bold text-slate-900 text-center"
                      />
                    </div>

                    {formBreadItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setFormBreadItems(prev => prev.filter((_, i) => i !== idx));
                        }}
                        className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Botones de Acción del Modal */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveClient}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl text-xs shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>{editingClient ? 'Guardar Cambios' : 'Crear Cliente'}</span>
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
