import React, { useState, useEffect, useMemo } from 'react';
import { DriverCustomer, Settings, DeliveryClientBreadItem } from '../../types';
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
  FileSpreadsheet
} from 'lucide-react';
import { playBeep, playCashSound } from '../../utils/audio';
import { 
  getTodayString, 
  getDailyDeliverySheet, 
  saveDailyDeliverySheet, 
  getDailyDeliveryPiecesCount,
  saveDriverCustomers 
} from '../../utils/storage';
import { 
  printDeliveryClientTicketDirectToPrinter, 
  printDriverConsolidatedTicketDirectToPrinter 
} from '../../utils/thermalPrinter';

interface DailyDeliverySheetProps {
  driverCustomers: DriverCustomer[];
  settings: Settings;
  onUpdateDriverCustomers: (updated: DriverCustomer[]) => void;
}

export const DailyDeliverySheet: React.FC<DailyDeliverySheetProps> = ({
  driverCustomers,
  settings,
  onUpdateDriverCustomers
}) => {
  // Fecha seleccionada (por defecto hoy)
  const [selectedDate, setSelectedDate] = useState<string>(getTodayString());
  // Turno de reparto: 'manana' | 'tarde'
  const [deliveryShift, setDeliveryShift] = useState<'manana' | 'tarde'>('manana');
  // Cantidades del día: { [clientId]: { [breadName]: quantity } }
  const [dailyQuantities, setDailyQuantities] = useState<Record<string, Record<string, number>>>({});
  // Filtro de repartidor: 'todos' | 'osvaldo' | 'simon'
  const [driverFilter, setDriverFilter] = useState<'todos' | 'osvaldo' | 'simon'>('todos');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
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

  // Cargar cantidades guardadas al cambiar fecha o turno
  useEffect(() => {
    const loaded = getDailyDeliverySheet(selectedDate, deliveryShift);
    setDailyQuantities(loaded);
  }, [selectedDate, deliveryShift]);

  // Guardar cantidades en localStorage asociadas a fecha y turno
  const updateQuantity = (clientId: string, breadName: string, qty: number) => {
    const safeQty = Math.max(0, isNaN(qty) ? 0 : qty);
    setDailyQuantities(prev => {
      const clientObj = { ...(prev[clientId] || {}) };
      if (safeQty === 0) {
        delete clientObj[breadName];
      } else {
        clientObj[breadName] = safeQty;
      }
      const updated = {
        ...prev,
        [clientId]: clientObj
      };
      saveDailyDeliverySheet(selectedDate, updated, deliveryShift);
      return updated;
    });
  };

  // Clientes de reparto activos (excluyendo solo mostrador "tienda" a menos que se desee)
  const deliveryClients = useMemo(() => {
    return driverCustomers.filter(c => c.driverId === 'osvaldo' || c.driverId === 'simon');
  }, [driverCustomers]);

  // Filtrado por repartidor y búsqueda
  const filteredClients = useMemo(() => {
    return deliveryClients.filter(c => {
      if (driverFilter !== 'todos' && c.driverId !== driverFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = c.name.toLowerCase().includes(q);
        const matchItems = (c.items || []).some(it => it.breadName.toLowerCase().includes(q));
        if (!matchName && !matchItems) return false;
      }
      return true;
    });
  }, [deliveryClients, driverFilter, searchQuery]);

  // Helper para obtener items de un cliente con valores por defecto si no tiene
  const getClientItems = (c: DriverCustomer): DeliveryClientBreadItem[] => {
    if (c.items && c.items.length > 0) return c.items;
    return [
      { breadName: 'Bolillo', unitPrice: 4.00 },
      { breadName: 'Dulce', unitPrice: 8.50 }
    ];
  };

  // Cálculo de totales por cliente
  const getClientTotals = (c: DriverCustomer) => {
    const items = getClientItems(c);
    const clientQty = dailyQuantities[c.id] || {};
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

  // Totales de Osvaldo
  const osvaldoTotals = useMemo(() => {
    let pieces = 0;
    let amount = 0;
    const clientSummaries: Array<{
      clientName: string;
      itemsSummary: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
      clientTotal: number;
      clientPieces: number;
    }> = [];

    deliveryClients.filter(c => c.driverId === 'osvaldo').forEach(c => {
      const { totalPieces, totalAmount, itemsSummary } = getClientTotals(c);
      if (totalPieces > 0) {
        pieces += totalPieces;
        amount += totalAmount;
        clientSummaries.push({
          clientName: c.name,
          itemsSummary,
          clientTotal: totalAmount,
          clientPieces: totalPieces
        });
      }
    });

    return { pieces, amount, clientSummaries };
  }, [deliveryClients, dailyQuantities]);

  // Totales de Simón
  const simonTotals = useMemo(() => {
    let pieces = 0;
    let amount = 0;
    const clientSummaries: Array<{
      clientName: string;
      itemsSummary: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
      clientTotal: number;
      clientPieces: number;
    }> = [];

    deliveryClients.filter(c => c.driverId === 'simon').forEach(c => {
      const { totalPieces, totalAmount, itemsSummary } = getClientTotals(c);
      if (totalPieces > 0) {
        pieces += totalPieces;
        amount += totalAmount;
        clientSummaries.push({
          clientName: c.name,
          itemsSummary,
          clientTotal: totalAmount,
          clientPieces: totalPieces
        });
      }
    });

    return { pieces, amount, clientSummaries };
  }, [deliveryClients, dailyQuantities]);

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

  // Imprimir Ticket Individual por Cliente (SOLO UNO SIN COPIA)
  const handlePrintClientTicket = (client: DriverCustomer) => {
    playCashSound();
    const { totalPieces, totalAmount, itemsSummary } = getClientTotals(client);
    if (totalPieces === 0) {
      showToast(`⚠️ Ingresa al menos una pieza para imprimir el ticket de ${client.name}`);
      return;
    }

    const driverName = client.driverId === 'osvaldo' ? 'Osvaldo' : 'Simón';
    printDeliveryClientTicketDirectToPrinter(
      client.name,
      driverName,
      selectedDate,
      itemsSummary,
      totalAmount,
      totalPieces,
      settings,
      currentShiftLabel
    );
    showToast(`🖨️ Imprimiendo ticket para ${client.name} ($${totalAmount.toFixed(2)}) • ${currentShiftLabel}`);
  };

  // Imprimir Ticket Consolidado Osvaldo
  const handlePrintConsolidatedOsvaldo = () => {
    playCashSound();
    if (osvaldoTotals.clientSummaries.length === 0) {
      showToast(`⚠️ No hay pedidos con piezas cargadas para Osvaldo en ${currentShiftLabel}.`);
      return;
    }

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

  // Imprimir Ticket Consolidado Simón
  const handlePrintConsolidatedSimon = () => {
    playCashSound();
    if (simonTotals.clientSummaries.length === 0) {
      showToast(`⚠️ No hay pedidos con piezas cargadas para Simón en ${currentShiftLabel}.`);
      return;
    }

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
      const updated = driverCustomers.map(c => {
        if (c.id === editingClient.id) {
          return {
            ...c,
            name: formClientName.trim(),
            driverId: formDriverId,
            phone: formPhone.trim() || undefined,
            address: formAddress.trim() || undefined,
            items: validItems
          };
        }
        return c;
      });
      onUpdateDriverCustomers(updated);
      saveDriverCustomers(updated);
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
    showToast(`🗑️ Cliente "${c.name}" eliminado`);
  };

  // Formateo de fecha amigable en español
  const friendlyDateText = useMemo(() => {
    try {
      const parts = selectedDate.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        return d.toLocaleDateString('es-MX', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      }
    } catch (e) {}
    return selectedDate;
  }, [selectedDate]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12">
      {/* Toast Notification */}
      {toastNotice && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl border-2 border-amber-400 font-black text-xs animate-in slide-in-from-top-3 flex items-center gap-2">
          <span>{toastNotice}</span>
        </div>
      )}

      {/* 1. CABECERA PRINCIPAL: TÍTULO, SELECTOR DE DÍA Y SWITCH DE TURNO */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 shadow-xs border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          
          {/* Título & Badge */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-lg shadow-xs">
              🛵
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-slate-900 leading-tight">
                  Repartos
                </h1>
                <span className="bg-slate-100 text-slate-700 text-[11px] font-black px-2 py-0.5 rounded-md border border-slate-200">
                  Mostrador
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                {friendlyDateText} • {currentShiftLabel}
              </p>
            </div>
          </div>

          {/* BOTÓN SWITCH DE TURNO (MAÑANA / TARDE) */}
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-2xs">
            <button
              type="button"
              id="btn-shift-manana"
              onClick={() => {
                setDeliveryShift('manana');
                playBeep(650, 'sine', 0.03);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                deliveryShift === 'manana'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🌅 Mañana</span>
              {mananaPiecesCount > 0 && (
                <span className="bg-black/15 text-slate-950 text-[10px] px-1.5 py-0.2 rounded-full font-black">
                  {mananaPiecesCount} pzs
                </span>
              )}
            </button>
            <button
              type="button"
              id="btn-shift-tarde"
              onClick={() => {
                setDeliveryShift('tarde');
                playBeep(650, 'sine', 0.03);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                deliveryShift === 'tarde'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🌇 Tarde</span>
              {tardePiecesCount > 0 && (
                <span className="bg-white/20 text-white text-[10px] px-1.5 py-0.2 rounded-full font-black">
                  {tardePiecesCount} pzs
                </span>
              )}
            </button>
          </div>

          {/* Selector de Fecha Fácil (Navegación Día a Día) */}
          <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => changeDateByDays(-1)}
              className="p-1.5 hover:bg-white rounded-lg text-slate-700 hover:text-slate-900 font-black transition-colors cursor-pointer border border-transparent hover:border-slate-300"
              title="Día Anterior"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <div className="flex items-center gap-1.5 px-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-2 py-0.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              />
            </div>

            <button
              type="button"
              onClick={() => setSelectedDate(getTodayString())}
              className={`px-2.5 py-0.5 text-xs font-black rounded-lg transition-all cursor-pointer ${
                selectedDate === getTodayString()
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              Hoy
            </button>

            <button
              type="button"
              onClick={() => changeDateByDays(1)}
              className="p-1.5 hover:bg-white rounded-lg text-slate-700 hover:text-slate-900 font-black transition-colors cursor-pointer border border-transparent hover:border-slate-300"
              title="Día Siguiente"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. BARRA DE FILTROS & BUSCADOR + BOTÓN NUEVO CLIENTE */}
      <div className="bg-white rounded-2xl p-2.5 shadow-xs border border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
        {/* Pestañas de Repartidores */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setDriverFilter('todos')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
              driverFilter === 'todos'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Todos ({deliveryClients.length})
          </button>

          <button
            type="button"
            onClick={() => setDriverFilter('simon')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
              driverFilter === 'simon'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200'
            }`}
          >
            <span>🚴 Simón</span>
            <span className="text-[10px] opacity-80">
              ({deliveryClients.filter(c => c.driverId === 'simon').length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setDriverFilter('osvaldo')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
              driverFilter === 'osvaldo'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            <span>🛵 Osvaldo</span>
            <span className="text-[10px] opacity-80">
              ({deliveryClients.filter(c => c.driverId === 'osvaldo').length})
            </span>
          </button>
        </div>

        {/* Buscador de Cliente o Pan & Botón Agregar */}
        <div className="flex items-center gap-2 flex-1 justify-end max-w-md">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar cliente o pan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            id="btn-add-delivery-client-top"
            type="button"
            onClick={handleOpenAddClient}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-black py-1.5 px-3 rounded-xl text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Cliente</span>
          </button>
        </div>
      </div>

      {/* 4. TABLA TIPO EXCEL LIMPIA (Hoja de Trabajo de Mostrador) */}
      <div className="bg-white rounded-3xl shadow-xs border border-slate-200 overflow-hidden">
        
        {/* Cabecera de la Tabla */}
        <div className="bg-slate-900 text-white px-4 py-3 grid grid-cols-12 gap-2 text-xs font-black uppercase tracking-wider items-center">
          <div className="col-span-2">Repartidor</div>
          <div className="col-span-3">Cliente</div>
          <div className="col-span-3">Tipo de Pan</div>
          <div className="col-span-1 text-center">P. Unitario</div>
          <div className="col-span-1 text-center">Piezas</div>
          <div className="col-span-2 text-right">Subtotal / Cuenta</div>
        </div>

        {/* Filas de Clientes y Productos */}
        <div className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
          {filteredClients.length === 0 ? (
            <div className="p-8 text-center text-slate-400 font-bold text-xs space-y-2">
              <FileSpreadsheet className="w-8 h-8 mx-auto text-slate-300" />
              <p>No se encontraron clientes para el filtro seleccionado.</p>
            </div>
          ) : (
            filteredClients.map((client) => {
              const items = getClientItems(client);
              const clientQtyObj = dailyQuantities[client.id] || {};
              const { totalPieces, totalAmount } = getClientTotals(client);
              const isSimon = client.driverId === 'simon';

              return (
                <div 
                  key={client.id}
                  className={`p-3 transition-colors ${
                    totalPieces > 0 ? 'bg-amber-50/40' : 'hover:bg-slate-50/60'
                  }`}
                >
                  <div className="grid grid-cols-12 gap-2 items-center">
                    
                    {/* Columna 1: Badge de Repartidor */}
                    <div className="col-span-2">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full ${
                        isSimon 
                          ? 'bg-blue-100 text-blue-900 border border-blue-200' 
                          : 'bg-amber-100 text-amber-900 border border-amber-300'
                      }`}>
                        <span>{isSimon ? '🚴 Simón' : '🛵 Osvaldo'}</span>
                      </span>
                    </div>

                    {/* Columna 2: Nombre del Cliente + Botones Editar/Borrar */}
                    <div className="col-span-3">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900 text-xs sm:text-sm">
                          {client.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenEditClient(client)}
                          className="text-slate-400 hover:text-blue-600 p-1 cursor-pointer transition-colors"
                          title="Editar productos o precios"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteClient(client)}
                          className="text-slate-300 hover:text-rose-600 p-1 cursor-pointer transition-colors"
                          title="Eliminar cliente"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {client.phone && (
                        <div className="text-[10px] text-slate-400 font-medium">
                          Tel: {client.phone}
                        </div>
                      )}
                    </div>

                    {/* Columna 3 a 6: Desglose de Tipos de Pan y Celdas de Piezas */}
                    <div className="col-span-5 space-y-1.5">
                      {items.map((it) => {
                        const currentQty = clientQtyObj[it.breadName] || 0;
                        const itemSubtotal = currentQty * it.unitPrice;

                        return (
                          <div 
                            key={it.breadName}
                            className="grid grid-cols-5 gap-1.5 items-center text-xs bg-white p-1 rounded-xl border border-slate-200/80 shadow-2xs"
                          >
                            {/* Tipo de pan (3 cols) */}
                            <div className="col-span-3 font-bold text-slate-800 truncate pl-1" title={it.breadName}>
                              {it.breadName}
                            </div>

                            {/* Precio unitario (1 col) */}
                            <div className="col-span-1 text-center font-mono font-bold text-slate-500 text-[11px]">
                              ${it.unitPrice.toFixed(2)}
                            </div>

                            {/* Input de piezas (1 col) */}
                            <div className="col-span-1 flex items-center justify-center">
                              <input
                                type="number"
                                min="0"
                                placeholder="0"
                                value={currentQty || ''}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  updateQuantity(client.id, it.breadName, isNaN(val) ? 0 : val);
                                }}
                                className="w-16 h-8 text-center font-mono font-black text-sm bg-slate-50 border-2 border-slate-300 hover:border-blue-400 focus:border-blue-600 focus:bg-white focus:outline-none rounded-lg text-slate-900 transition-all shadow-inner"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Columna 7: Total Cliente & Botón Imprimir Ticket (A la derecha) */}
                    <div className="col-span-2 text-right pl-2 border-l border-slate-200 space-y-1.5">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-black block">
                          Total Cliente
                        </span>
                        <div className="text-base font-black font-mono text-slate-900 leading-tight">
                          ${totalAmount.toFixed(2)}
                        </div>
                        <div className="text-[10px] font-bold text-slate-500">
                          {totalPieces} piezas
                        </div>
                      </div>

                      {/* Botón Imprimir Ticket del Cliente (1 COPIA) */}
                      <button
                        type="button"
                        onClick={() => handlePrintClientTicket(client)}
                        disabled={totalPieces === 0}
                        className={`w-full py-1.5 px-2 rounded-xl text-xs font-black flex items-center justify-center gap-1 shadow-xs transition-all active:scale-95 cursor-pointer ${
                          totalPieces > 0
                            ? 'bg-slate-900 hover:bg-black text-white hover:shadow-sm'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                        }`}
                        title="Imprimir ticket térmico para este cliente (1 copia)"
                      >
                        <Printer className="w-3.5 h-3.5 text-amber-400" />
                        <span>Ticket 🖨️</span>
                      </button>
                    </div>

                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pie de Tabla con Resumen Consolidado */}
        <div className="bg-slate-950 text-white p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-4 border-t-2 border-slate-800">
          <div className="flex items-center gap-4 text-xs font-bold">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Ruta Simón ({currentShiftLabel}):</span>
              <span className="text-blue-400 font-mono font-black text-sm">
                ${simonTotals.amount.toFixed(2)} ({simonTotals.pieces} pzs)
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Ruta Osvaldo ({currentShiftLabel}):</span>
              <span className="text-amber-400 font-mono font-black text-sm">
                ${osvaldoTotals.amount.toFixed(2)} ({osvaldoTotals.pieces} pzs)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs uppercase font-black text-slate-400">Total {currentShiftLabel}:</span>
            <span className="text-2xl font-black font-mono text-emerald-400">
              ${grandTotalAmount.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          PASA ESTO HASTA ABAJO: BOTONES Y TARJETAS DE CONSOLIDADO Y LIQUIDACIÓN
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

          <button
            id="btn-print-consolidated-osvaldo"
            type="button"
            onClick={handlePrintConsolidatedOsvaldo}
            className="w-full bg-white hover:bg-amber-50 text-slate-900 font-black py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs hover:shadow-md transition-all active:scale-98 cursor-pointer"
          >
            <Printer className="w-4 h-4 text-amber-600" />
            <span>Imprimir Ticket Osvaldo 📋</span>
          </button>
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

          <button
            id="btn-print-consolidated-simon"
            type="button"
            onClick={handlePrintConsolidatedSimon}
            className="w-full bg-white hover:bg-blue-50 text-slate-900 font-black py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs hover:shadow-md transition-all active:scale-98 cursor-pointer"
          >
            <Printer className="w-4 h-4 text-blue-600" />
            <span>Imprimir Ticket Simón 📋</span>
          </button>
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
            {totalClientsServed} clientes surtidos en {currentShiftLabel} ({filteredClients.length} disponibles en total).
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
