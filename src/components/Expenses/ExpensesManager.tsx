import React, { useState, useMemo } from 'react';
import { 
  OperationalExpense, 
  SupplierBill, 
  RecurringExpenseTemplate, 
  SaleTicket, 
  BakeryOrder, 
  ExpenseCategory,
  ExpenseFrequency 
} from '../../types';
import { 
  DEFAULT_EXPENSE_TEMPLATES, 
  loadExpenseTemplates,
  saveExpenseTemplates,
  getUpcomingFridayString, 
  getTodayString 
} from '../../utils/storage';
import { 
  DollarSign, 
  Calendar, 
  Plus, 
  Check, 
  Trash2, 
  Edit3,
  TrendingUp, 
  TrendingDown, 
  Receipt, 
  CreditCard, 
  Banknote, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  FileText,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  X,
  Search,
  Sparkles,
  ArrowRight,
  Filter,
  FileSpreadsheet,
  Download
} from 'lucide-react';
import { playBeep, playCashSound } from '../../utils/audio';
import {
  exportFridayPaymentsExcel,
  exportMonthlyPaymentsExcel
} from '../../utils/fridayPaymentsExcel';

interface ExpensesManagerProps {
  tickets: SaleTicket[];
  orders: BakeryOrder[];
  operationalExpenses: OperationalExpense[];
  supplierBills: SupplierBill[];
  onSaveExpense: (expense: OperationalExpense) => void;
  onDeleteExpense: (expenseId: string) => void;
  onSaveSupplierBill: (bill: SupplierBill) => void;
  onDeleteSupplierBill: (billId: string) => void;
}

export const ExpensesManager: React.FC<ExpensesManagerProps> = ({
  tickets,
  orders,
  operationalExpenses,
  supplierBills,
  onSaveExpense,
  onDeleteExpense,
  onSaveSupplierBill,
  onDeleteSupplierBill
}) => {
  // Sucursal activa para control de gastos: 'refugio' (Matriz) o 'zakia'
  const [activeBranch, setActiveBranch] = useState<'refugio' | 'zakia'>(() => {
    const saved = localStorage.getItem('santafe_active_expenses_branch');
    return saved === 'zakia' ? 'zakia' : 'refugio';
  });

  // Lista de rubros auditados con montos editables por sucursal
  const [templates, setTemplates] = useState<RecurringExpenseTemplate[]>(() => {
    const saved = localStorage.getItem('santafe_active_expenses_branch');
    const branch = saved === 'zakia' ? 'zakia' : 'refugio';
    return loadExpenseTemplates(branch);
  });

  // Fecha del Viernes seleccionado para pagos (por defecto el próximo viernes)
  const [selectedFriday, setSelectedFriday] = useState<string>(() => getUpcomingFridayString());
  const [exportMonth, setExportMonth] = useState<string>(() => getUpcomingFridayString().slice(0, 7));

  // Filtro por Rubro/Categoría como en el PDF
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<string>('todos');

  // Buscador rápido estilo sistema de reparto
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Estados de carga rápida superior (Buscar servicio -> tipo frecuencia -> poner cantidad -> pasar al viernes)
  const [quickServiceId, setQuickServiceId] = useState<string>('exp_2'); // Default Dialpa
  const [quickFrequency, setQuickFrequency] = useState<'semanal' | 'mensual'>('semanal');
  const [quickAmount, setQuickAmount] = useState<string>('38000');
  const [quickNote, setQuickNote] = useState<string>('');

  // Modal para pasar concepto al viernes con ajuste de monto y frecuencia (semanal / mensual)
  const [templateToPass, setTemplateToPass] = useState<RecurringExpenseTemplate | null>(null);
  const [modalFrequency, setModalFrequency] = useState<'semanal' | 'mensual'>('semanal');
  const [modalAmount, setModalAmount] = useState<string>('');
  const [modalFolio, setModalFolio] = useState<string>('');
  const [modalNotes, setModalNotes] = useState<string>('');

  // Modal para editar monto base del PDF
  const [templateToEdit, setTemplateToEdit] = useState<RecurringExpenseTemplate | null>(null);
  const [editWeeklyAmount, setEditWeeklyAmount] = useState<string>('');
  const [editMonthlyAmount, setEditMonthlyAmount] = useState<string>('');
  const [editFrequency, setEditFrequency] = useState<'semanal' | 'mensual'>('semanal');

  // Modal para registrar pago de una cuenta del viernes
  const [billToPay, setBillToPay] = useState<SupplierBill | null>(null);
  const [payMethod, setPayMethod] = useState<'efectivo' | 'transferencia' | 'cheque'>('transferencia');
  const [payNotes, setPayNotes] = useState<string>('');

  // Modal para agregar un gasto adicional fuera de los 23 rubros
  const [showAddCustomModal, setShowAddCustomModal] = useState<boolean>(false);
  const [customConcept, setCustomConcept] = useState<string>('');
  const [customCategory, setCustomCategory] = useState<ExpenseCategory>('materia_prima');
  const [customWeeklyAmount, setCustomWeeklyAmount] = useState<string>('');
  const [customFrequency, setCustomFrequency] = useState<'semanal' | 'mensual'>('semanal');
  const [customRecipient, setCustomRecipient] = useState<string>('');
  const [customDescription, setCustomDescription] = useState<string>('');
  const [customPassToFriday, setCustomPassToFriday] = useState<boolean>(true);

  // Notificación rápida
  const [notification, setNotification] = useState<string>('');
  const showNotice = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 3500);
  };

  // Cambiar de sucursal (El Refugio vs Zakia)
  const handleSwitchBranch = (branch: 'refugio' | 'zakia') => {
    setActiveBranch(branch);
    localStorage.setItem('santafe_active_expenses_branch', branch);
    const loaded = loadExpenseTemplates(branch);
    setTemplates(loaded);
    if (loaded.length > 0) {
      setQuickServiceId(loaded[0].id);
      const freq = loaded[0].frequency || 'semanal';
      setQuickFrequency(freq);
      setQuickAmount(String(freq === 'mensual' ? (loaded[0].monthlyAmount || loaded[0].weeklyAmount) : loaded[0].weeklyAmount));
    }
    showNotice(branch === 'zakia' ? '🥐 Hoja activa: Gastos Sucursal Zakia' : '🏢 Hoja activa: Gastos Sucursal El Refugio (Matriz)');
  };

  // Navegar entre viernes (anterior / siguiente)
  const handleShiftFriday = (offsetWeeks: number) => {
    const parts = selectedFriday.split('-');
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    d.setDate(d.getDate() + (offsetWeeks * 7));
    const nextFriday = d.toISOString().split('T')[0];
    setSelectedFriday(nextFriday);
    setExportMonth(nextFriday.slice(0, 7));
  };

  // Descargar Excel de los pagos de este Viernes
  const handleDownloadFridayExcel = () => {
    playBeep(660, 'sine', 0.05);
    const result = exportFridayPaymentsExcel({
      fridayDate: selectedFriday,
      supplierBills,
      activeBranch
    });
    if (!result.exported) {
      showNotice(`⚠️ No hay cuentas registradas para el viernes ${selectedFriday}.`);
      return;
    }
    playCashSound();
    showNotice(`📊 Excel del viernes descargado: ${result.fileName}`);
  };

  // Descargar Excel General del Mes (todos los viernes del mes, ambas sucursales)
  const handleDownloadMonthlyExcel = () => {
    playBeep(660, 'sine', 0.05);
    const result = exportMonthlyPaymentsExcel({
      yearMonth: exportMonth,
      supplierBills,
      branchFilter: 'all'
    });
    if (!result.exported) {
      showNotice(`⚠️ No hay pagos de viernes registrados en el mes ${exportMonth}.`);
      return;
    }
    playCashSound();
    showNotice(`📊 Excel general del mes descargado: ${result.fileName}`);
  };

  // Cuentas asignadas al viernes seleccionado para la sucursal activa
  const fridayBills = useMemo(() => {
    return supplierBills.filter(b => b.dueDate === selectedFriday && ((b.branch || 'refugio') === activeBranch));
  }, [supplierBills, selectedFriday, activeBranch]);

  // Contadores de cuentas pendientes por sucursal para este viernes
  const pendingBillsRefugioCount = useMemo(() => {
    return supplierBills.filter(b => b.dueDate === selectedFriday && ((b.branch || 'refugio') === 'refugio') && b.status === 'pendiente').length;
  }, [supplierBills, selectedFriday]);

  const pendingBillsZakiaCount = useMemo(() => {
    return supplierBills.filter(b => b.dueDate === selectedFriday && b.branch === 'zakia' && b.status === 'pendiente').length;
  }, [supplierBills, selectedFriday]);

  // Totales del viernes seleccionado
  const fridayTotals = useMemo(() => {
    const total = fridayBills.reduce((acc, b) => acc + (b.amount || 0), 0);
    const paid = fridayBills.filter(b => b.status === 'pagado').reduce((acc, b) => acc + (b.amount || 0), 0);
    const pending = fridayBills.filter(b => b.status === 'pendiente').reduce((acc, b) => acc + (b.amount || 0), 0);
    const paidCount = fridayBills.filter(b => b.status === 'pagado').length;
    const pendingCount = fridayBills.filter(b => b.status === 'pendiente').length;
    return { total, paid, pending, paidCount, pendingCount };
  }, [fridayBills]);

  // Mapeo rápido de cuentas del viernes por templateId para saber en la lista si ya se pasó y su estado
  const fridayBillsByTemplate = useMemo(() => {
    const map = new Map<string, SupplierBill>();
    fridayBills.forEach(b => {
      if (b.templateId) {
        map.set(b.templateId, b);
      } else {
        // match by supplierName
        const found = templates.find(t => t.concept.toLowerCase() === b.supplierName.toLowerCase());
        if (found) map.set(found.id, b);
      }
    });
    return map;
  }, [fridayBills, templates]);

  // Totales de la lista auditada de rubros para la sucursal activa
  const templatesTotals = useMemo(() => {
    const totalWeekly = templates.reduce((acc, t) => acc + (t.weeklyAmount || 0), 0);
    const totalMonthly = templates.reduce((acc, t) => acc + (t.monthlyAmount || 0), 0);
    return { totalWeekly, totalMonthly };
  }, [templates]);

  // Lista de rubros filtrada por pestaña y por buscador
  const filteredTemplates = useMemo(() => {
    return templates.filter(t => {
      // Filtro de categoría
      if (selectedCategoryTab === 'adicionales') {
        if (!t.isCustom) return false;
      } else if (selectedCategoryTab !== 'todos' && t.categoryLabel !== selectedCategoryTab) {
        return false;
      }
      // Filtro de búsqueda
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchConcept = t.concept.toLowerCase().includes(q);
        const matchCat = t.categoryLabel.toLowerCase().includes(q);
        const matchDesc = t.description.toLowerCase().includes(q);
        const matchNum = String(t.orderNumber) === q;
        if (!matchConcept && !matchCat && !matchDesc && !matchNum) return false;
      }
      return true;
    });
  }, [templates, selectedCategoryTab, searchQuery]);

  // Sincronizar monto en el selector superior al cambiar el servicio seleccionado
  const handleSelectQuickService = (templateId: string) => {
    setQuickServiceId(templateId);
    const found = templates.find(t => t.id === templateId);
    if (found) {
      const defaultFreq = found.frequency || 'semanal';
      setQuickFrequency(defaultFreq);
      setQuickAmount(String(defaultFreq === 'mensual' ? (found.monthlyAmount || found.weeklyAmount) : found.weeklyAmount));
    }
  };

  // Alternar frecuencia en la barra rápida superior (semanal vs mensual)
  const handleToggleQuickFrequency = (freq: 'semanal' | 'mensual') => {
    setQuickFrequency(freq);
    const found = templates.find(t => t.id === quickServiceId);
    if (found) {
      setQuickAmount(String(freq === 'mensual' ? (found.monthlyAmount || found.weeklyAmount) : found.weeklyAmount));
    }
  };

  // Acción rápida superior: Pasar al viernes el servicio seleccionado
  const handleQuickAdd = () => {
    const found = templates.find(t => t.id === quickServiceId);
    if (!found) return;
    const amountNum = parseFloat(quickAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert('Por favor ingresa un monto válido mayor a $0.');
      return;
    }

    const freqLabel = quickFrequency === 'mensual' ? 'Pago Mensual Completo' : 'Pago Semanal';

    const newBill: SupplierBill = {
      id: `bill_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      supplierName: found.concept,
      category: found.category,
      categoryLabel: found.categoryLabel,
      templateId: found.id,
      orderNumber: found.orderNumber,
      receivedDate: getTodayString(),
      dueDate: selectedFriday,
      amount: amountNum,
      status: 'pendiente',
      paymentFrequency: quickFrequency,
      branch: activeBranch,
      notes: quickNote.trim() ? `${quickNote.trim()} (${freqLabel})` : freqLabel,
      createdAt: new Date().toISOString()
    };

    onSaveSupplierBill(newBill);
    playCashSound();
    showNotice(`✅ ${found.concept} ($${amountNum.toLocaleString('es-MX')} • ${freqLabel}) en ${activeBranch === 'zakia' ? 'Zakia' : 'El Refugio'}.`);
    setQuickNote('');
  };

  // Abrir modal para pasar concepto específico al viernes
  const handleOpenPassModal = (tmpl: RecurringExpenseTemplate) => {
    setTemplateToPass(tmpl);
    const freq = tmpl.frequency || 'semanal';
    setModalFrequency(freq);
    setModalAmount(String(freq === 'mensual' ? (tmpl.monthlyAmount || tmpl.weeklyAmount) : tmpl.weeklyAmount));
    setModalFolio('');
    setModalNotes('');
    playBeep(520, 'sine', 0.04);
  };

  // Confirmar pasar concepto al viernes desde el modal
  const handleConfirmPassToFriday = () => {
    if (!templateToPass) return;
    const amountNum = parseFloat(modalAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert('Ingresa una cantidad válida mayor a $0');
      return;
    }

    const freqLabel = modalFrequency === 'mensual' ? 'Pago Mensual Completo' : 'Pago Semanal';

    const newBill: SupplierBill = {
      id: `bill_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      supplierName: templateToPass.concept,
      category: templateToPass.category,
      categoryLabel: templateToPass.categoryLabel,
      templateId: templateToPass.id,
      orderNumber: templateToPass.orderNumber,
      billFolio: modalFolio.trim() || undefined,
      receivedDate: getTodayString(),
      dueDate: selectedFriday,
      amount: amountNum,
      status: 'pendiente',
      paymentFrequency: modalFrequency,
      branch: activeBranch,
      notes: modalNotes.trim() ? `${modalNotes.trim()} (${freqLabel})` : freqLabel,
      createdAt: new Date().toISOString()
    };

    onSaveSupplierBill(newBill);
    playCashSound();
    showNotice(`✅ ${templateToPass.concept} ($${amountNum.toLocaleString('es-MX')} • ${freqLabel}) enviado a pagos del viernes.`);
    setTemplateToPass(null);
  };

  // Alternar frecuencia por defecto de una plantilla (semanal / mensual) directamente
  const handleToggleTemplateFrequency = (templateId: string) => {
    const updated = templates.map(t => {
      if (t.id === templateId) {
        const nextFreq: 'semanal' | 'mensual' = t.frequency === 'mensual' ? 'semanal' : 'mensual';
        return { ...t, frequency: nextFreq };
      }
      return t;
    });
    setTemplates(updated);
    saveExpenseTemplates(updated, activeBranch);
    const target = updated.find(t => t.id === templateId);
    showNotice(`🔄 ${target?.concept}: Modo por defecto cambiado a ${target?.frequency === 'mensual' ? 'MENSUAL' : 'SEMANAL'}`);
  };

  // Abrir modal para editar el monto base de un concepto
  const handleOpenEditBase = (tmpl: RecurringExpenseTemplate) => {
    setTemplateToEdit(tmpl);
    setEditWeeklyAmount(String(tmpl.weeklyAmount || 0));
    setEditMonthlyAmount(String(tmpl.monthlyAmount || Math.round((tmpl.weeklyAmount || 0) * 4.34286)));
    setEditFrequency(tmpl.frequency || 'semanal');
  };

  // Guardar edición del monto base del PDF
  const handleSaveEditBase = () => {
    if (!templateToEdit) return;
    const newWeekly = parseFloat(editWeeklyAmount);
    if (isNaN(newWeekly) || newWeekly < 0) {
      alert('Ingresa un monto semanal válido');
      return;
    }

    const manualMonthly = parseFloat(editMonthlyAmount);
    const newMonthly = (!isNaN(manualMonthly) && manualMonthly > 0)
      ? manualMonthly
      : Math.round(newWeekly * 4.34286);

    const updated = templates.map(t => {
      if (t.id === templateToEdit.id) {
        return {
          ...t,
          weeklyAmount: newWeekly,
          monthlyAmount: newMonthly,
          frequency: editFrequency
        };
      }
      return t;
    });

    // Recalcular porcentajes
    const totalW = updated.reduce((s, x) => s + x.weeklyAmount, 0);
    const withPct = updated.map(t => ({
      ...t,
      percent: totalW > 0 ? Number(((t.weeklyAmount / totalW) * 100).toFixed(1)) : 0
    }));

    setTemplates(withPct);
    saveExpenseTemplates(withPct, activeBranch);
    showNotice(`✏️ Monto base de ${templateToEdit.concept} actualizado ($${newWeekly.toLocaleString('es-MX')}/sem, $${newMonthly.toLocaleString('es-MX')}/mes).`);
    setTemplateToEdit(null);
  };

  // Abrir modal para crear un gasto adicional
  const handleOpenAddCustomModal = () => {
    setCustomConcept('');
    setCustomCategory('materia_prima');
    setCustomWeeklyAmount('');
    setCustomFrequency('semanal');
    setCustomRecipient('');
    setCustomDescription('');
    setCustomPassToFriday(true);
    setShowAddCustomModal(true);
    playBeep(520, 'sine', 0.04);
  };

  // Guardar un nuevo gasto adicional
  const handleSaveCustomExpense = () => {
    if (!customConcept.trim()) {
      alert('Por favor ingresa el nombre o concepto del gasto');
      return;
    }
    const weeklyNum = parseFloat(customWeeklyAmount) || 0;
    const monthlyNum = customFrequency === 'mensual' 
      ? weeklyNum 
      : Math.round(weeklyNum * 4.34286);
    const categoryLabels: Record<ExpenseCategory, string> = {
      'nomina': 'Mano de Obra y Cargas',
      'materia_prima': 'Materia Prima e Insumos',
      'renta': 'Instalaciones y Servicios',
      'servicios': 'Instalaciones y Servicios',
      'reparto_gasolina': 'Operación y Mantenimiento',
      'mantenimiento': 'Operación y Mantenimiento',
      'impuestos_fiscal': 'Administración y Fiscal',
      'otros': 'Operación y Mantenimiento'
    };

    const newTemplate: RecurringExpenseTemplate = {
      id: `custom_exp_${Date.now()}`,
      orderNumber: templates.length + 1,
      concept: customConcept.trim(),
      category: customCategory,
      categoryLabel: categoryLabels[customCategory] || 'Operación y Mantenimiento',
      weeklyAmount: customFrequency === 'mensual' ? Math.round(weeklyNum / 4.34286) : weeklyNum,
      monthlyAmount: monthlyNum,
      percent: 0,
      recipient: customRecipient.trim() || customConcept.trim(),
      description: customDescription.trim() || 'Gasto adicional registrado por administración',
      isCustom: true,
      frequency: customFrequency,
      branch: activeBranch
    };

    const updated = [...templates, newTemplate];
    const totalW = updated.reduce((s, x) => s + x.weeklyAmount, 0);
    const withPct = updated.map(t => ({
      ...t,
      percent: totalW > 0 ? Number(((t.weeklyAmount / totalW) * 100).toFixed(1)) : 0
    }));

    setTemplates(withPct);
    saveExpenseTemplates(withPct, activeBranch);

    // Si seleccionó pasar directo al viernes a pago
    if (customPassToFriday && weeklyNum > 0) {
      const freqLabel = customFrequency === 'mensual' ? 'Pago Mensual Completo' : 'Pago Semanal';
      const newBill: SupplierBill = {
        id: `bill_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        supplierName: newTemplate.concept,
        category: newTemplate.category,
        categoryLabel: newTemplate.categoryLabel,
        templateId: newTemplate.id,
        orderNumber: newTemplate.orderNumber,
        receivedDate: getTodayString(),
        dueDate: selectedFriday,
        amount: weeklyNum,
        status: 'pendiente',
        paymentFrequency: customFrequency,
        branch: activeBranch,
        notes: customDescription.trim() ? `${customDescription.trim()} (${freqLabel})` : freqLabel,
        createdAt: new Date().toISOString()
      };
      onSaveSupplierBill(newBill);
    }

    playCashSound();
    showNotice(`✅ Gasto adicional «${newTemplate.concept}» agregado a ${activeBranch === 'zakia' ? 'Zakia' : 'El Refugio'}.`);
    setShowAddCustomModal(false);
  };

  // Eliminar un gasto adicional personalizado
  const handleDeleteCustomTemplate = (tmplId: string) => {
    const found = templates.find(t => t.id === tmplId);
    if (!found) return;
    if (!confirm(`¿Eliminar el concepto adicional «${found.concept}» de tu lista de gastos en ${activeBranch === 'zakia' ? 'Zakia' : 'El Refugio'}?`)) return;

    const updated = templates.filter(t => t.id !== tmplId);
    const totalW = updated.reduce((s, x) => s + x.weeklyAmount, 0);
    const withPct = updated.map((t, idx) => ({
      ...t,
      orderNumber: idx + 1,
      percent: totalW > 0 ? Number(((t.weeklyAmount / totalW) * 100).toFixed(1)) : 0
    }));

    setTemplates(withPct);
    saveExpenseTemplates(withPct, activeBranch);
    showNotice(`🗑️ Concepto «${found.concept}» eliminado.`);
  };

  // Abrir modal para marcar como pagada una cuenta del viernes
  const handleOpenPayModal = (bill: SupplierBill) => {
    setBillToPay(bill);
    setPayMethod('transferencia');
    setPayNotes('');
    playBeep(600, 'sine', 0.04);
  };

  // Confirmar pago de la cuenta
  const handleConfirmPayment = () => {
    if (!billToPay) return;
    const today = getTodayString();

    const updatedBill: SupplierBill = {
      ...billToPay,
      status: 'pagado',
      paidDate: today,
      paidMethod: payMethod,
      notes: payNotes.trim() ? `${billToPay.notes ? billToPay.notes + ' • ' : ''}${payNotes.trim()}` : billToPay.notes,
      updatedAt: new Date().toISOString()
    };
    onSaveSupplierBill(updatedBill);

    // Registrar también como gasto operativo en el historial
    const newExpense: OperationalExpense = {
      id: `exp_op_${Date.now()}`,
      concept: `${updatedBill.supplierName}${updatedBill.billFolio ? ` (Folio: ${updatedBill.billFolio})` : ''}`,
      category: updatedBill.category,
      amount: updatedBill.amount,
      date: today,
      frequency: updatedBill.paymentFrequency || 'semanal',
      branch: updatedBill.branch || activeBranch,
      paymentMethod: payMethod,
      recipient: updatedBill.supplierName,
      supplierBillId: updatedBill.id,
      notes: updatedBill.notes,
      createdAt: new Date().toISOString()
    };
    onSaveExpense(newExpense);

    playCashSound();
    showNotice(`🎉 ${billToPay.supplierName} marcado como PAGADO ($${billToPay.amount.toLocaleString('es-MX')}).`);
    setBillToPay(null);
  };

  // Desmarcar pago (regresar a pendiente)
  const handleRevertToPending = (bill: SupplierBill) => {
    const updatedBill: SupplierBill = {
      ...bill,
      status: 'pendiente',
      paidDate: undefined,
      paidMethod: undefined,
      updatedAt: new Date().toISOString()
    };
    onSaveSupplierBill(updatedBill);
    showNotice(`🔄 ${bill.supplierName} regresó al estado PENDIENTE.`);
  };

  // Eliminar cuenta del viernes
  const handleDeleteBill = (bill: SupplierBill) => {
    if (confirm(`¿Eliminar ${bill.supplierName} ($${bill.amount}) del viernes?`)) {
      onDeleteSupplierBill(bill.id);
      showNotice(`🗑️ Cuenta eliminada del viernes.`);
    }
  };

  // Formatear fecha amigable del viernes
  const formatFridayLabel = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <div className="space-y-4 pb-12 animate-in fade-in duration-150">
      
      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white font-black px-4 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-2 text-xs animate-in slide-in-from-bottom duration-200">
          <span>{notification}</span>
        </div>
      )}

      {/* =========================================================================
          SELECTOR DE HOJA POR SUCURSAL: EL REFUGIO vs ZAKIA
          "por favor duplicame esa hoja y coloca gastos zakia porque tengo 2 sucursales"
          ========================================================================= */}
      <div className="bg-slate-900 text-white rounded-3xl p-3.5 sm:p-4 shadow-md border border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/30 border border-amber-500/40 flex items-center justify-center text-xl shadow-xs">
            {activeBranch === 'refugio' ? '🏢' : '🥐'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                Control de Gastos por Sucursal
              </span>
              <span className="text-[9px] bg-slate-800 text-slate-300 font-mono px-2 py-0.5 rounded-full border border-slate-700">
                2 Sucursales Activas
              </span>
            </div>
            <div className="text-base sm:text-lg font-black text-white">
              {activeBranch === 'refugio' ? 'Sucursal El Refugio (Planta Matriz)' : 'Sucursal Zakia (Punto de Venta)'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-800/90 p-1.5 rounded-2xl border border-slate-700 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => handleSwitchBranch('refugio')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
              activeBranch === 'refugio'
                ? 'bg-[#D95D39] text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <span>🏢 El Refugio (Matriz)</span>
            {pendingBillsRefugioCount > 0 && (
              <span className="bg-white/20 text-white text-[10px] font-mono px-1.5 py-0.2 rounded-full">
                {pendingBillsRefugioCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSwitchBranch('zakia')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
              activeBranch === 'zakia'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <span>🥐 Gastos Zakia</span>
            {pendingBillsZakiaCount > 0 && (
              <span className="bg-white/20 text-white text-[10px] font-mono px-1.5 py-0.2 rounded-full">
                {pendingBillsZakiaCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* =========================================================================
          ENCABEZADO DE GASTOS Y RESUMEN FINANCIERO
          ========================================================================= */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-[#D95D39] flex items-center gap-1.5">
              <span>🥖 PANADERÍA SANTA FÉ</span>
              <span>•</span>
              <span>{activeBranch === 'refugio' ? 'SUCURSAL MATRIZ EL REFUGIO' : 'SUCURSAL ZAKIA'}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1 flex items-center gap-2">
              <span>Resumen Operativo & Gastos {activeBranch === 'refugio' ? 'El Refugio' : 'Zakia'}</span>
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {activeBranch === 'refugio' 
                ? 'Planta Matriz de Producción & Rutas de Reparto Mayorista, Querétaro • TIPO DE UNIDAD: Planta Matriz + Reparto'
                : 'Sucursal y Punto de Venta Zakia, Querétaro • TIPO DE UNIDAD: Punto de Venta Mostrador'}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-2.5 px-3.5 text-right">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Mensual Presupuestado</span>
              <span className="text-lg font-black text-slate-900">
                ${templatesTotals.totalMonthly.toLocaleString('es-MX')}
              </span>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-2.5 px-3.5 text-right">
              <span className="text-[10px] uppercase font-bold text-amber-800 block">Gasto Semanal Base</span>
              <span className="text-lg font-black text-[#D95D39]">
                ${templatesTotals.totalWeekly.toLocaleString('es-MX')}
              </span>
            </div>
          </div>
        </div>

        {/* =========================================================================
            BARRA DE CARGA RÁPIDA ESTILO SISTEMA DE REPARTO CON TOGGLE SEMANAL/MENSUAL
            ========================================================================= */}
        <div className="mt-4 pt-1">
          <div className="bg-gradient-to-r from-amber-50/80 via-orange-50/60 to-amber-50/80 rounded-2xl p-3.5 border-2 border-amber-300 shadow-xs">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#D95D39]" />
                <span className="text-xs font-black uppercase tracking-wider text-slate-900">
                  Carga Rápida al Viernes ({activeBranch === 'zakia' ? 'Zakia' : 'El Refugio'})
                </span>
                <span className="text-[11px] text-slate-600 font-medium hidden sm:inline">
                  — Elige servicio, decide si pagas semanal o el mes completo y pásalo al viernes
                </span>
              </div>
              <span className="text-[11px] font-bold text-slate-600 bg-white/80 px-2 py-0.5 rounded-lg border border-amber-200">
                Frecuencia: <strong className={quickFrequency === 'mensual' ? 'text-indigo-700' : 'text-amber-800'}>{quickFrequency === 'mensual' ? 'Mensual' : 'Semanal'}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              {/* Selector / Buscador de Servicio */}
              <div className="sm:col-span-4">
                <label className="text-[10px] font-black uppercase text-slate-600 block mb-0.5">
                  1. Buscar Servicio / Concepto:
                </label>
                <select
                  value={quickServiceId}
                  onChange={(e) => handleSelectQuickService(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 shadow-2xs focus:ring-2 focus:ring-[#D95D39] focus:outline-none"
                >
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>
                      #{t.orderNumber} {t.concept} — {t.frequency === 'mensual' ? `Mensual: $${(t.monthlyAmount || 0).toLocaleString('es-MX')}` : `Semanal: $${(t.weeklyAmount || 0).toLocaleString('es-MX')}`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Selector de Frecuencia de Pago: Semanal o Mensual */}
              <div className="sm:col-span-3">
                <label className="text-[10px] font-black uppercase text-slate-600 block mb-0.5">
                  2. ¿Pago Semanal o Mensual?:
                </label>
                <div className="grid grid-cols-2 gap-1 bg-white border border-slate-300 p-1 rounded-xl shadow-2xs">
                  <button
                    type="button"
                    onClick={() => handleToggleQuickFrequency('semanal')}
                    className={`py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                      quickFrequency === 'semanal'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    📆 Semanal
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleQuickFrequency('mensual')}
                    className={`py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                      quickFrequency === 'mensual'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    📅 Mensual
                  </button>
                </div>
              </div>

              {/* Input de Cantidad */}
              <div className="sm:col-span-2">
                <label className="text-[10px] font-black uppercase text-slate-600 block mb-0.5">
                  3. Monto a Pagar ($):
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-slate-400 font-bold text-xs">$</span>
                  <input
                    type="number"
                    value={quickAmount}
                    onChange={(e) => setQuickAmount(e.target.value)}
                    placeholder="Monto a pagar..."
                    className="w-full bg-white border border-slate-300 rounded-xl pl-6 pr-2 py-2 text-xs font-black text-slate-900 shadow-2xs focus:ring-2 focus:ring-[#D95D39] focus:outline-none"
                  />
                </div>
              </div>

              {/* Nota opcional */}
              <div className="sm:col-span-2">
                <label className="text-[10px] font-black uppercase text-slate-600 block mb-0.5">
                  Nota / Folio:
                </label>
                <input
                  type="text"
                  value={quickNote}
                  onChange={(e) => setQuickNote(e.target.value)}
                  placeholder="Nota (opcional)..."
                  className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-900 shadow-2xs focus:ring-2 focus:ring-[#D95D39] focus:outline-none"
                />
              </div>

              {/* Botón de Envío Directo al Viernes */}
              <div className="sm:col-span-1 flex items-end">
                <button
                  type="button"
                  onClick={handleQuickAdd}
                  className="w-full bg-[#D95D39] hover:bg-[#c44e2c] text-white font-black py-2 px-1 rounded-xl text-xs flex items-center justify-center gap-1 shadow-md active:scale-95 transition-all cursor-pointer"
                  title="Pasar esta cuenta al calendario de pagos del viernes"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">Pasar</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          PANEL SUPERIOR: CALENDARIO Y CONTROL DE PAGOS DEL VIERNES
          "con eso lo que yo voy recibiendo en la semana, voy viendo si ya se pagó o se debe pagar"
          ========================================================================= */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center font-black text-lg">
              📅
            </div>
            <div>
              <div className="text-[10px] uppercase font-black tracking-wider text-slate-500">
                Control de Cuentas del Viernes
              </div>
              <h2 className="text-base font-black text-slate-900 capitalize flex items-center gap-2">
                <span>{formatFridayLabel(selectedFriday)}</span>
                <span className="text-[10px] bg-indigo-100 text-indigo-900 font-bold px-2 py-0.5 rounded-full lowercase">
                  {selectedFriday}
                </span>
              </h2>
            </div>
          </div>

          {/* Navegador entre Viernes */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => handleShiftFriday(-1)}
                className="p-1.5 hover:bg-white rounded-lg text-slate-700 transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer"
                title="Viernes anterior"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Viernes Anterior</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const nextF = getUpcomingFridayString();
                  setSelectedFriday(nextF);
                  setExportMonth(nextF.slice(0, 7));
                }}
                className="px-2.5 py-1 bg-white rounded-lg text-xs font-black text-[#D95D39] shadow-xs cursor-pointer"
              >
                Viernes Próximo
              </button>
              <button
                type="button"
                onClick={() => handleShiftFriday(1)}
                className="p-1.5 hover:bg-white rounded-lg text-slate-700 transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer"
                title="Viernes siguiente"
              >
                <span className="hidden sm:inline">Viernes Siguiente</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Barra de Descarga de Excel: Por Viernes y General por Mes */}
        <div className="mt-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl p-2.5 sm:px-3.5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 text-xs text-emerald-950 font-bold">
            <FileSpreadsheet className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>Reportes Excel de Pagos:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              id="export-friday-excel-btn"
              onClick={handleDownloadFridayExcel}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black px-3 py-1.5 rounded-xl text-xs shadow-xs active:scale-95 transition-all cursor-pointer"
              title={`Descargar Excel de los pagos del viernes ${selectedFriday}`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Excel de este Viernes ({selectedFriday})</span>
            </button>

            <div className="flex items-center gap-1.5 bg-white border border-emerald-300 rounded-xl p-1 pl-2">
              <input
                type="month"
                value={exportMonth}
                onChange={(e) => setExportMonth(e.target.value)}
                className="text-xs font-black text-slate-800 bg-transparent focus:outline-none cursor-pointer"
                title="Selecciona el mes para el Excel general"
              />
              <button
                type="button"
                id="export-monthly-excel-btn"
                onClick={handleDownloadMonthlyExcel}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black px-3 py-1 rounded-lg text-xs shadow-xs active:scale-95 transition-all cursor-pointer"
                title="Descargar Excel general con todos los viernes del mes y ambas sucursales"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Excel General del Mes</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tarjetas Resumen del Viernes: Total, Pagado, Por Pagar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-3">
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <span className="text-[10px] uppercase font-black text-slate-500 block">Total Programado al Viernes</span>
            <div className="text-xl font-black text-slate-900 mt-0.5">
              ${fridayTotals.total.toLocaleString('es-MX')}.00
            </div>
            <span className="text-[11px] text-slate-500 font-medium">{fridayBills.length} cuentas registradas</span>
          </div>

          <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-200">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-black text-emerald-800 block">Ya Pagado</span>
              <span className="bg-emerald-200 text-emerald-900 text-[10px] font-black px-1.5 py-0.2 rounded-full">
                {fridayTotals.paidCount} liquidadas
              </span>
            </div>
            <div className="text-xl font-black text-emerald-800 mt-0.5">
              ${fridayTotals.paid.toLocaleString('es-MX')}.00
            </div>
            <span className="text-[11px] text-emerald-700 font-medium">Cubierto con ventas de la semana</span>
          </div>

          <div className="bg-rose-50 p-3.5 rounded-2xl border border-rose-200">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-black text-rose-800 block">Por Pagar el Viernes</span>
              <span className="bg-rose-200 text-rose-900 text-[10px] font-black px-1.5 py-0.2 rounded-full">
                {fridayTotals.pendingCount} pendientes
              </span>
            </div>
            <div className="text-xl font-black text-rose-700 mt-0.5">
              ${fridayTotals.pending.toLocaleString('es-MX')}.00
            </div>
            <span className="text-[11px] text-rose-800 font-medium">Falta por liquidar este viernes</span>
          </div>
        </div>

        {/* Listado de Cuentas Pasadas a este Viernes */}
        {fridayBills.length === 0 ? (
          <div className="bg-slate-50/70 border border-dashed border-slate-200 rounded-2xl p-6 text-center">
            <p className="text-xs font-bold text-slate-600">
              No has pasado cuentas para este viernes aún ({selectedFriday}).
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Usa la barra de arriba o haz clic en <strong>«➕ Pasar al Viernes a Pago»</strong> en cualquier fila de la lista de abajo para enviarlas aquí.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-black uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">Concepto / Proveedor</th>
                  <th className="py-2.5 px-3">Rubro</th>
                  <th className="py-2.5 px-3 text-right">Monto a Pagar</th>
                  <th className="py-2.5 px-3 text-center">Estado</th>
                  <th className="py-2.5 px-3 text-center">Acción de Pago</th>
                  <th className="py-2.5 px-3 text-center">Quitar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {fridayBills.map((bill, idx) => {
                  const isPaid = bill.status === 'pagado';
                  return (
                    <tr 
                      key={bill.id} 
                      className={`hover:bg-slate-50 transition-colors ${isPaid ? 'bg-emerald-50/30' : ''}`}
                    >
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-500">
                        {bill.orderNumber ? `#${bill.orderNumber}` : idx + 1}
                      </td>
                      <td className="py-2.5 px-3">
                        <strong className="text-slate-900 block font-bold text-xs">{bill.supplierName}</strong>
                        {bill.billFolio && (
                          <span className="text-[10px] text-slate-500 font-mono">Nota/Folio: {bill.billFolio}</span>
                        )}
                        {bill.notes && (
                          <span className="text-[10px] text-slate-500 block italic">{bill.notes}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded text-[10px]">
                          {bill.categoryLabel || bill.category}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-sm text-slate-900">
                        ${bill.amount.toLocaleString('es-MX')}.00
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {isPaid ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-900 font-black px-2.5 py-0.5 rounded-full text-[10px] border border-emerald-300">
                            <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                            <span>PAGADO ({bill.paidMethod || 'OK'})</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-900 font-black px-2.5 py-0.5 rounded-full text-[10px] border border-rose-300 animate-pulse">
                            <Clock className="w-3 h-3 text-rose-700" />
                            <span>POR PAGAR</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {isPaid ? (
                          <button
                            type="button"
                            onClick={() => handleRevertToPending(bill)}
                            className="text-[10px] font-bold text-slate-500 hover:text-slate-800 underline cursor-pointer"
                            title="Regresar a estado pendiente si hubo error"
                          >
                            Revertir a Pendiente
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenPayModal(bill)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-3 py-1.5 rounded-xl text-xs inline-flex items-center gap-1 shadow-xs active:scale-95 transition-all cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Registrar Pago</span>
                          </button>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteBill(bill)}
                          className="text-slate-300 hover:text-rose-600 p-1 rounded-lg transition-colors cursor-pointer"
                          title="Quitar este gasto del viernes"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* =========================================================================
          TABLA IDÉNTICA AL PDF: DESGLOSE POR IMPORTANCIA DE COSTOS (23 RUBROS)
          ========================================================================= */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200">
        
        {/* Encabezado de la Sección de Lista */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-slate-900 text-white flex items-center justify-center font-black text-xs">
                1
              </span>
              <h2 className="text-base font-black text-slate-900 uppercase tracking-wider">
                Desglose por Importancia de Costos ({templates.length} Rubros)
              </h2>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Valores nominales proyectados mensualmente en El Refugio ordenados por mayor impacto presupuestal.
            </p>
          </div>

          {/* Acciones y Buscador de Tabla */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleOpenAddCustomModal}
              className="flex items-center gap-1.5 bg-[#D95D39] hover:bg-[#c44e2c] text-white px-3 py-1.5 rounded-xl text-xs font-black shadow-xs transition-all cursor-pointer active:scale-95 shrink-0"
              title="Agregar cualquier pago o gasto adicional fuera de los 23 rubros base"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Agregar Gasto Adicional</span>
            </button>

            <div className="relative w-full sm:w-60">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar servicio o rubro..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D95D39]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Filtros por Rubro / Categoría como en el PDF */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-3 border-b border-slate-100 no-scrollbar text-xs">
          <span className="text-[11px] font-black uppercase text-slate-400 mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3" /> Rubro:
          </span>
          {[
            { id: 'todos', label: `Todos (${templates.length} Rubros)` },
            { id: 'adicionales', label: `⭐ Adicionales (${templates.filter(t => t.isCustom).length})` },
            { id: 'Mano de Obra y Cargas', label: '👥 Mano de Obra y Cargas' },
            { id: 'Materia Prima e Insumos', label: '🌾 Materia Prima e Insumos' },
            { id: 'Instalaciones y Servicios', label: '🏢 Instalaciones y Servicios' },
            { id: 'Operación y Mantenimiento', label: '🔧 Operación y Mantenimiento' },
            { id: 'Administración y Fiscal', label: '📑 Administración y Fiscal' }
          ].map(cat => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategoryTab(cat.id)}
              className={`px-3 py-1.5 rounded-xl font-black whitespace-nowrap transition-all cursor-pointer ${
                selectedCategoryTab === cat.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Tabla en Forma de Lista Idéntica al PDF */}
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-black uppercase text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-3 w-10 text-center">#</th>
                <th className="py-3 px-3">Concepto / Rubro Operativo</th>
                <th className="py-3 px-3">Categoría</th>
                <th className="py-3 px-3 text-right">Gasto Semanal ($)</th>
                <th className="py-3 px-3 text-right">Proyección Mensual ($)</th>
                <th className="py-3 px-3 text-right">% Gasto</th>
                <th className="py-3 px-3 text-center">Acción para el Viernes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {filteredTemplates.map((item) => {
                const billForFriday = fridayBillsByTemplate.get(item.id);
                const isInFriday = !!billForFriday;
                const isPaid = billForFriday?.status === 'pagado';

                return (
                  <tr key={item.id} className="hover:bg-amber-50/40 transition-colors">
                    {/* Columna 1: # */}
                    <td className="py-3 px-3 text-center font-mono font-bold text-slate-400">
                      {item.orderNumber}
                    </td>

                    {/* Columna 2: Concepto / Rubro con descripción y toggle frecuencia */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <strong className="text-slate-900 font-black text-xs">{item.concept}</strong>
                        
                        {/* Toggle de frecuencia de pago semanal / mensual */}
                        <button
                          type="button"
                          onClick={() => handleToggleTemplateFrequency(item.id)}
                          className={`inline-flex items-center gap-1 text-[9.5px] font-black px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                            item.frequency === 'mensual'
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                              : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                          }`}
                          title={`Frecuencia base: ${item.frequency === 'mensual' ? 'Mensual' : 'Semanal'}. Clic para alternar.`}
                        >
                          {item.frequency === 'mensual' ? '📅 Mensual' : '📆 Semanal'}
                        </button>

                        {item.isCustom && (
                          <span className="text-[9px] bg-purple-100 text-purple-900 font-black px-1.5 py-0.2 rounded-md border border-purple-200">
                            ⭐ Adicional
                          </span>
                        )}
                        {item.trend === 'incremento' && (
                          <span className="text-[10px] text-rose-600 font-bold flex items-center" title={item.trendNote || 'Incrementó'}>
                            ↑ {item.trendNote}
                          </span>
                        )}
                        {item.trend === 'bajo' && (
                          <span className="text-[10px] text-emerald-600 font-bold flex items-center" title={item.trendNote || 'Bajó'}>
                            ↓ {item.trendNote}
                          </span>
                        )}
                      </div>
                      <p className="text-[10.5px] text-slate-500 font-normal leading-tight mt-0.5">
                        {item.description}
                      </p>
                    </td>

                    {/* Columna 3: Categoría */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="text-[11px] font-bold text-slate-600">
                        {item.categoryLabel}
                      </span>
                    </td>

                    {/* Columna 4: Gasto Semanal con edición rápida */}
                    <td className="py-3 px-3 text-right font-black text-slate-900 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <span>${item.weeklyAmount.toLocaleString('es-MX')}</span>
                        <button
                          type="button"
                          onClick={() => handleOpenEditBase(item)}
                          className="text-slate-300 hover:text-slate-700 p-0.5 rounded cursor-pointer"
                          title="Editar montos base"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        {item.isCustom && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomTemplate(item.id)}
                            className="text-slate-300 hover:text-rose-600 p-0.5 rounded cursor-pointer"
                            title="Eliminar este gasto adicional"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Columna 5: Proyección Mensual */}
                    <td className="py-3 px-3 text-right font-bold text-slate-700 whitespace-nowrap">
                      ${item.monthlyAmount.toLocaleString('es-MX')}
                    </td>

                    {/* Columna 6: % Gasto */}
                    <td className="py-3 px-3 text-right font-black text-slate-600 whitespace-nowrap">
                      {item.percent}%
                    </td>

                    {/* Columna 7: BOTÓN PASARLO AL VIERNES A PAGO */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      {isInFriday ? (
                        <div className="inline-flex items-center gap-1.5">
                          {isPaid ? (
                            <span className="bg-emerald-100 text-emerald-900 font-black px-2.5 py-1 rounded-xl text-[10px] border border-emerald-300 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                              <span>Pagado (${billForFriday.amount.toLocaleString('es-MX')})</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenPayModal(billForFriday)}
                              className="bg-amber-100 hover:bg-emerald-600 hover:text-white text-amber-950 font-black px-2.5 py-1 rounded-xl text-[10px] border border-amber-300 flex items-center gap-1 transition-colors cursor-pointer"
                              title="Cuenta lista para pagar este viernes. Haz clic para liquidar."
                            >
                              <Clock className="w-3 h-3 text-amber-800" />
                              <span>En Viernes: ${billForFriday.amount.toLocaleString('es-MX')} • Pagar</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenPassModal(item)}
                          className="bg-[#D95D39] hover:bg-[#b84524] text-white font-black px-3 py-1.5 rounded-xl text-[11px] shadow-2xs hover:shadow-xs active:scale-95 transition-all inline-flex items-center gap-1 cursor-pointer"
                          title={`Pasar ${item.concept} a pagos de este viernes (${selectedFriday})`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Pasarlo al Viernes</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900 text-white font-black text-xs">
                <td className="py-3 px-3 text-center font-mono">{filteredTemplates.length}</td>
                <td className="py-3 px-3" colSpan={2}>
                  TOTAL GASTOS {activeBranch === 'zakia' ? 'SUCURSAL ZAKIA' : 'EL REFUGIO (MATRIZ)'} ({filteredTemplates.length} RUBROS)
                </td>
                <td className="py-3 px-3 text-right text-amber-300 font-black text-sm">
                  ${templatesTotals.totalWeekly.toLocaleString('es-MX')}
                </td>
                <td className="py-3 px-3 text-right text-emerald-300 font-black text-sm">
                  ${templatesTotals.totalMonthly.toLocaleString('es-MX')}
                </td>
                <td className="py-3 px-3 text-right text-white font-black">
                  100.0%
                </td>
                <td className="py-3 px-3 text-center text-slate-300 text-[10px]">
                  Viernes: {selectedFriday}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* =========================================================================
          MODAL: PASAR AL VIERNES A PAGO (CON ELECCIÓN SEMANAL O MENSUAL)
          ========================================================================= */}
      {templateToPass && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-xl bg-orange-100 text-[#D95D39] flex items-center justify-center font-black text-xs">
                  #{templateToPass.orderNumber}
                </span>
                <div>
                  <h3 className="font-black text-slate-900 text-sm">
                    Pasar a Pago del Viernes
                  </h3>
                  <span className="text-[10px] text-slate-500 font-bold">
                    Sucursal: {activeBranch === 'zakia' ? 'Zakia' : 'El Refugio (Matriz)'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTemplateToPass(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-3.5">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs">
                <div className="font-black text-slate-900 text-sm">{templateToPass.concept}</div>
                <div className="text-slate-500 mt-0.5">{templateToPass.categoryLabel}</div>
                <div className="text-[11px] text-slate-600 mt-1">
                  Fecha de pago: <strong className="text-indigo-900">{formatFridayLabel(selectedFriday)}</strong>
                </div>
              </div>

              {/* SELECCIÓN SEMANAL O MENSUAL */}
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 block mb-1.5">
                  ¿Cómo vas a pagar este gasto este viernes?:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      setModalFrequency('mensual');
                      setModalAmount(String(templateToPass.monthlyAmount || 0));
                    }}
                    className={`p-3 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                      modalFrequency === 'mensual'
                        ? 'border-indigo-600 bg-indigo-50/70 shadow-sm'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-indigo-950 flex items-center gap-1">
                        📅 Pago Mensual
                      </span>
                      {modalFrequency === 'mensual' && (
                        <span className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black">✓</span>
                      )}
                    </div>
                    <div className="text-base font-black text-indigo-900 mt-1">
                      ${(templateToPass.monthlyAmount || 0).toLocaleString('es-MX')}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 font-medium">
                      (Total del mes en 1 exhibición)
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setModalFrequency('semanal');
                      setModalAmount(String(templateToPass.weeklyAmount || 0));
                    }}
                    className={`p-3 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                      modalFrequency === 'semanal'
                        ? 'border-amber-600 bg-amber-50/70 shadow-sm'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-amber-950 flex items-center gap-1">
                        📆 Cuota Semanal
                      </span>
                      {modalFrequency === 'semanal' && (
                        <span className="w-4 h-4 rounded-full bg-amber-600 text-white flex items-center justify-center text-[10px] font-black">✓</span>
                      )}
                    </div>
                    <div className="text-base font-black text-amber-900 mt-1">
                      ${(templateToPass.weeklyAmount || 0).toLocaleString('es-MX')}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 font-medium">
                      (División semanal proporcional)
                    </div>
                  </button>
                </div>

                <label className="text-xs font-black uppercase tracking-wider text-slate-700 block mb-1">
                  Monto final a registrar para este viernes ($):
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-slate-400 font-black text-sm">$</span>
                  <input
                    type="number"
                    value={modalAmount}
                    onChange={(e) => setModalAmount(e.target.value)}
                    className="w-full bg-white border-2 border-amber-300 rounded-xl pl-8 pr-3 py-2 text-base font-black text-slate-900 shadow-2xs focus:ring-2 focus:ring-[#D95D39] focus:outline-none"
                    placeholder="Monto de la cuenta..."
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Número de Nota / Folio de Remisión (Opcional):
                </label>
                <input
                  type="text"
                  value={modalFolio}
                  onChange={(e) => setModalFolio(e.target.value)}
                  placeholder="ej. Remisión 4421, Factura 880..."
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#D95D39]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nota / Observaciones (Opcional):
                </label>
                <input
                  type="text"
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  placeholder="ej. Cuenta enviada por WhatsApp el martes..."
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#D95D39]"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setTemplateToPass(null)}
                className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmPassToFriday}
                className="flex-1 py-2 rounded-xl text-xs font-black text-white bg-[#D95D39] hover:bg-[#c44e2c] shadow-md transition-all active:scale-95 cursor-pointer"
              >
                Confirmar y Pasar al Viernes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: EDITAR MONTO BASE DEL PDF
          ========================================================================= */}
      {templateToEdit && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h3 className="font-black text-slate-900 text-sm">
                  Editar Montos Base y Frecuencia
                </h3>
                <span className="text-[10px] text-slate-500 font-bold">
                  {activeBranch === 'zakia' ? '🥐 Sucursal Zakia' : '🏢 Sucursal El Refugio'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setTemplateToEdit(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-3 space-y-3">
              <div className="text-xs font-bold text-slate-800">
                {templateToEdit.concept}
              </div>

              {/* Frecuencia por defecto */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">
                  Frecuencia de Pago Habitual:
                </label>
                <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setEditFrequency('semanal')}
                    className={`py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                      editFrequency === 'semanal'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    📆 Semanal
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditFrequency('mensual')}
                    className={`py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                      editFrequency === 'mensual'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    📅 Mensual
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">
                  Monto Semanal Base ($):
                </label>
                <input
                  type="number"
                  value={editWeeklyAmount}
                  onChange={(e) => {
                    const w = e.target.value;
                    setEditWeeklyAmount(w);
                    const n = parseFloat(w);
                    if (!isNaN(n) && n >= 0) {
                      setEditMonthlyAmount(String(Math.round(n * 4.34286)));
                    }
                  }}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#D95D39]"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">
                  Monto Mensual Completo ($):
                </label>
                <input
                  type="number"
                  value={editMonthlyAmount}
                  onChange={(e) => setEditMonthlyAmount(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#D95D39]"
                />
                <span className="text-[9.5px] text-slate-500 mt-0.5 block">
                  ej. Para renta completa ($38,217), nómina o servicios mensuales.
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setTemplateToEdit(null)}
                className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEditBase}
                className="flex-1 py-2 rounded-xl text-xs font-black text-white bg-slate-900 hover:bg-slate-800 shadow-sm"
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: REGISTRAR PAGO DE CUENTA DEL VIERNES
          ========================================================================= */}
      {billToPay && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-xs">
                  ✓
                </span>
                <h3 className="font-black text-slate-900 text-sm">
                  Registrar Liquidación de Cuenta
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setBillToPay(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-3.5">
              <div className="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-200">
                <span className="text-[10px] uppercase font-bold text-emerald-800 block">Concepto a Pagar</span>
                <div className="text-base font-black text-emerald-950 mt-0.5">{billToPay.supplierName}</div>
                <div className="text-2xl font-black text-emerald-800 mt-1">
                  ${billToPay.amount.toLocaleString('es-MX')}.00
                </div>
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 block mb-1">
                  Método con el que liquidaste:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPayMethod('transferencia')}
                    className={`p-2.5 rounded-xl border text-xs font-black transition-all cursor-pointer text-center ${
                      payMethod === 'transferencia'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    💳 Transferencia
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayMethod('efectivo')}
                    className={`p-2.5 rounded-xl border text-xs font-black transition-all cursor-pointer text-center ${
                      payMethod === 'efectivo'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    💵 Efectivo
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayMethod('cheque')}
                    className={`p-2.5 rounded-xl border text-xs font-black transition-all cursor-pointer text-center ${
                      payMethod === 'cheque'
                        ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    📑 Cheque
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Referencia / Comprobante (Opcional):
                </label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="ej. Rastreo SPEI 441029, Comprobante BBVA..."
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setBillToPay(null)}
                className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmPayment}
                className="flex-1 py-2 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 shadow-md active:scale-95 transition-all cursor-pointer"
              >
                Confirmar Pago Exitoso
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: AGREGAR GASTO / CONCEPTO ADICIONAL
          ========================================================================= */}
      {showAddCustomModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-[#FFF5F0] text-[#D95D39] border border-[#E5E1DA] flex items-center justify-center font-black text-sm">
                  ➕
                </span>
                <div>
                  <h3 className="font-black text-slate-900 text-sm">
                    Agregar Gasto o Proveedor Adicional
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Registrando en: <strong className="text-slate-800">{activeBranch === 'zakia' ? 'Sucursal Zakia' : 'Sucursal El Refugio (Matriz)'}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddCustomModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-3.5">
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 block mb-1">
                  Concepto o Nombre del Gasto / Proveedor: *
                </label>
                <input
                  type="text"
                  value={customConcept}
                  onChange={(e) => setCustomConcept(e.target.value)}
                  placeholder="ej. Compra de bolsas Kraft, Flete harina, Mantenimiento aire..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#D95D39]"
                  autoFocus
                />
              </div>

              {/* Frecuencia de pago */}
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 block mb-1">
                  ¿Frecuencia de Pago?:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomFrequency('semanal')}
                    className={`py-2 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                      customFrequency === 'semanal'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    📆 Pago Semanal
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomFrequency('mensual')}
                    className={`py-2 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                      customFrequency === 'mensual'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    📅 Pago Mensual
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700 block mb-1">
                    Rubro / Categoría:
                  </label>
                  <select
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value as ExpenseCategory)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#D95D39]"
                  >
                    <option value="materia_prima">🌾 Materia Prima e Insumos</option>
                    <option value="nomina">👥 Mano de Obra y Cargas</option>
                    <option value="renta">🏢 Instalaciones y Renta</option>
                    <option value="servicios">⚡ Servicios (Luz, Agua, Gas)</option>
                    <option value="reparto_gasolina">🛵 Reparto y Combustible</option>
                    <option value="mantenimiento">🔧 Mantenimiento General</option>
                    <option value="impuestos_fiscal">📑 Administración y Fiscal</option>
                    <option value="otros">📦 Otros Gastos Operativos</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700 block mb-1">
                    Monto {customFrequency === 'mensual' ? 'Mensual' : 'Semanal'} ($): *
                  </label>
                  <input
                    type="number"
                    value={customWeeklyAmount}
                    onChange={(e) => setCustomWeeklyAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#D95D39]"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 block mb-1">
                  Beneficiario o Proveedor (Opcional):
                </label>
                <input
                  type="text"
                  value={customRecipient}
                  onChange={(e) => setCustomRecipient(e.target.value)}
                  placeholder="ej. Distribuidora San Juan, Técnico Martínez..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D95D39]"
                />
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 block mb-1">
                  Descripción o Notas (Opcional):
                </label>
                <input
                  type="text"
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                  placeholder="ej. Compra imprevista para producción especial de fin de semana"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#D95D39]"
                />
              </div>

              <div className="bg-amber-50 p-3 rounded-2xl border border-amber-200 flex items-center gap-2.5">
                <input
                  type="checkbox"
                  id="chk-pass-to-friday"
                  checked={customPassToFriday}
                  onChange={(e) => setCustomPassToFriday(e.target.checked)}
                  className="w-4 h-4 rounded text-[#D95D39] focus:ring-[#D95D39] cursor-pointer"
                />
                <label htmlFor="chk-pass-to-friday" className="text-xs font-bold text-amber-950 cursor-pointer">
                  Pasar directamente a cuentas por pagar del viernes ({selectedFriday})
                </label>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAddCustomModal(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveCustomExpense}
                className="flex-1 py-2.5 rounded-xl text-xs font-black text-white bg-[#D95D39] hover:bg-[#c44e2c] shadow-md active:scale-95 transition-all cursor-pointer"
              >
                Guardar Gasto
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
