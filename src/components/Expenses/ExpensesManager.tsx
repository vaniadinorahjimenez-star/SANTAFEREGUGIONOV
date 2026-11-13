import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  OperationalExpense, 
  SupplierBill, 
  SupplierBankInfo,
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
  loadSupplierBankProfiles,
  saveSupplierBankProfiles,
  mergeSupplierBankProfiles,
  getUpcomingFridayString, 
  getTodayString 
} from '../../utils/storage';
import { saveSupplierBankProfileToFirestore } from '../../services/firebase';
import { syncWithCloud } from '../../services/cloudSyncService';
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
  Download,
  Landmark,
  Camera,
  FileUp,
  Copy,
  Eye,
  Upload,
  Image as ImageIcon
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

  // Perfiles bancarios de proveedores (persistentes y sincronizados)
  const [bankProfiles, setBankProfiles] = useState<SupplierBankInfo[]>(() => loadSupplierBankProfiles());

  useEffect(() => {
    const refreshBankProfiles = () => {
      setBankProfiles(loadSupplierBankProfiles());
    };
    window.addEventListener('supplierBankProfilesUpdated', refreshBankProfiles);
    window.addEventListener('storage', refreshBankProfiles);
    return () => {
      window.removeEventListener('supplierBankProfilesUpdated', refreshBankProfiles);
      window.removeEventListener('storage', refreshBankProfiles);
    };
  }, []);

  // Modales de Datos Bancarios, Comprobante (Foto), Factura y Confirmación de Borrado
  const [bankModalTarget, setBankModalTarget] = useState<{
    branch: 'refugio' | 'zakia';
    templateId?: string;
    supplierName: string;
    bill?: SupplierBill;
  } | null>(null);
  const [bankBeneficiaryInput, setBankBeneficiaryInput] = useState<string>('');
  const [bankNameInput, setBankNameInput] = useState<string>('');
  const [bankAccountInput, setBankAccountInput] = useState<string>('');
  const [bankClabeInput, setBankClabeInput] = useState<string>('');

  const [receiptModalTarget, setReceiptModalTarget] = useState<{
    bill?: SupplierBill;
    template?: RecurringExpenseTemplate;
  } | null>(null);
  const [isProcessingMedia, setIsProcessingMedia] = useState<boolean>(false);
  const receiptFileInputRef = useRef<HTMLInputElement>(null);

  const [invoiceModalTarget, setInvoiceModalTarget] = useState<{
    bill?: SupplierBill;
    template?: RecurringExpenseTemplate;
  } | null>(null);
  const [invoiceFolioInput, setInvoiceFolioInput] = useState<string>('');
  const [invoiceFileError, setInvoiceFileError] = useState<string>('');
  const invoiceFileInputRef = useRef<HTMLInputElement>(null);

  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    type: 'bill' | 'template';
    title: string;
    message: string;
    bill?: SupplierBill;
    templateId?: string;
  } | null>(null);

  // Notificación rápida
  const [notification, setNotification] = useState<string>('');
  const showNotice = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 3500);
  };

  // Helpers para perfiles bancarios y archivos
  const normalizeSupplierKey = (name: string): string =>
    (name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

  const buildBankProfileId = (branch: 'refugio' | 'zakia', templateId?: string, supplierName?: string): string => {
    const suffix = templateId || normalizeSupplierKey(supplierName || 'proveedor');
    return `${branch}_${suffix}`;
  };

  const getSavedBankInfo = (
    branch: 'refugio' | 'zakia',
    templateId?: string,
    supplierName?: string,
    billBankInfo?: SupplierBill['bankInfo']
  ): SupplierBill['bankInfo'] | undefined => {
    const normName = normalizeSupplierKey(supplierName || '');
    const matchedProfile = bankProfiles.find(p => {
      const pBranch = p.branch || 'refugio';
      if (pBranch !== branch) return false;
      if (templateId && p.templateId === templateId) return true;
      if (normName && normalizeSupplierKey(p.supplierName) === normName) return true;
      return false;
    });

    const source = matchedProfile
      ? {
          beneficiaryName: matchedProfile.beneficiaryName,
          bankName: matchedProfile.bankName,
          accountNumber: matchedProfile.accountNumber,
          clabe: matchedProfile.clabe,
          updatedAt: matchedProfile.updatedAt
        }
      : billBankInfo;

    if (!source) return undefined;
    const hasAny = Boolean(
      (source.beneficiaryName && source.beneficiaryName.trim()) ||
      (source.bankName && source.bankName.trim()) ||
      (source.accountNumber && source.accountNumber.trim()) ||
      (source.clabe && source.clabe.trim())
    );
    return hasAny ? source : undefined;
  };

  const compressReceiptImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 1000;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.72));
          } else {
            resolve(e.target?.result as string);
          }
        };
        img.onerror = () => resolve(e.target?.result as string);
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleCopyBankField = (val: string, label: string) => {
    if (!val) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(val).then(() => {
        playBeep(720, 'sine', 0.04);
        showNotice(`📋 ${label} copiado: ${val}`);
      }).catch(() => {
        showNotice(`📋 ${label}: ${val}`);
      });
    } else {
      showNotice(`📋 ${label}: ${val}`);
    }
  };

  const createBillFromTemplate = (
    tmpl: RecurringExpenseTemplate,
    overrides?: Partial<SupplierBill>
  ): SupplierBill => {
    const freq = tmpl.frequency || 'semanal';
    const baseAmount = freq === 'mensual' ? (tmpl.monthlyAmount || tmpl.weeklyAmount) : tmpl.weeklyAmount;
    const freqLabel = freq === 'mensual' ? 'Pago Mensual Completo' : 'Pago Semanal';
    const savedBank = getSavedBankInfo(activeBranch, tmpl.id, tmpl.concept);
    const nowIso = new Date().toISOString();

    return {
      id: `bill_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      supplierName: tmpl.concept,
      category: tmpl.category,
      categoryLabel: tmpl.categoryLabel,
      templateId: tmpl.id,
      orderNumber: tmpl.orderNumber,
      receivedDate: getTodayString(),
      dueDate: selectedFriday,
      amount: baseAmount,
      status: 'pendiente',
      paymentFrequency: freq,
      branch: activeBranch,
      notes: freqLabel,
      bankInfo: savedBank,
      createdAt: nowIso,
      updatedAt: nowIso,
      ...overrides
    };
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
      showNotice('⚠️ Por favor ingresa un monto válido mayor a $0.');
      return;
    }

    const freqLabel = quickFrequency === 'mensual' ? 'Pago Mensual Completo' : 'Pago Semanal';
    const savedBank = getSavedBankInfo(activeBranch, found.id, found.concept);
    const nowIso = new Date().toISOString();

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
      bankInfo: savedBank,
      createdAt: nowIso,
      updatedAt: nowIso
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
      showNotice('⚠️ Ingresa una cantidad válida mayor a $0.');
      return;
    }

    const freqLabel = modalFrequency === 'mensual' ? 'Pago Mensual Completo' : 'Pago Semanal';
    const savedBank = getSavedBankInfo(activeBranch, templateToPass.id, templateToPass.concept);
    const nowIso = new Date().toISOString();

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
      bankInfo: savedBank,
      createdAt: nowIso,
      updatedAt: nowIso
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
      showNotice('⚠️ Ingresa un monto semanal válido.');
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
      showNotice('⚠️ Por favor ingresa el nombre o concepto del gasto.');
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
      const savedBank = getSavedBankInfo(activeBranch, newTemplate.id, newTemplate.concept);
      const nowIso = new Date().toISOString();
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
        bankInfo: savedBank,
        createdAt: nowIso,
        updatedAt: nowIso
      };
      onSaveSupplierBill(newBill);
    }

    playCashSound();
    showNotice(`✅ Gasto adicional «${newTemplate.concept}» agregado a ${activeBranch === 'zakia' ? 'Zakia' : 'El Refugio'}.`);
    setShowAddCustomModal(false);
  };

  // Solicitar confirmación para eliminar un gasto adicional personalizado
  const handleDeleteCustomTemplate = (tmplId: string) => {
    const found = templates.find(t => t.id === tmplId);
    if (!found) return;
    setDeleteConfirmation({
      type: 'template',
      title: `Eliminar «${found.concept}»`,
      message: `¿Eliminar el concepto adicional «${found.concept}» de tu lista de gastos en ${activeBranch === 'zakia' ? 'Zakia' : 'El Refugio'}?`,
      templateId: tmplId
    });
  };

  const confirmDeleteAction = () => {
    if (!deleteConfirmation) return;
    if (deleteConfirmation.type === 'template' && deleteConfirmation.templateId) {
      const found = templates.find(t => t.id === deleteConfirmation.templateId);
      const updated = templates.filter(t => t.id !== deleteConfirmation.templateId);
      const totalW = updated.reduce((s, x) => s + x.weeklyAmount, 0);
      const withPct = updated.map((t, idx) => ({
        ...t,
        orderNumber: idx + 1,
        percent: totalW > 0 ? Number(((t.weeklyAmount / totalW) * 100).toFixed(1)) : 0
      }));
      setTemplates(withPct);
      saveExpenseTemplates(withPct, activeBranch);
      showNotice(`🗑️ Concepto «${found?.concept || ''}» eliminado.`);
    } else if (deleteConfirmation.type === 'bill' && deleteConfirmation.bill) {
      onDeleteSupplierBill(deleteConfirmation.bill.id);
      showNotice(`🗑️ Cuenta «${deleteConfirmation.bill.supplierName}» eliminada del viernes.`);
    }
    playBeep(450, 'sawtooth', 0.08);
    setDeleteConfirmation(null);
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

  // Eliminar cuenta del viernes (confirmación inline sin window.confirm)
  const handleDeleteBill = (bill: SupplierBill) => {
    setDeleteConfirmation({
      type: 'bill',
      title: `Quitar cuenta del viernes`,
      message: `¿Eliminar «${bill.supplierName}» ($${bill.amount.toLocaleString('es-MX')}.00) del viernes ${selectedFriday}?`,
      bill
    });
  };

  // =========================================================================
  // HANDLERS: DATOS BANCARIOS DE PROVEEDORES
  // =========================================================================
  const handleOpenBankModal = (params: {
    templateId?: string;
    supplierName: string;
    bill?: SupplierBill;
  }) => {
    const existing = getSavedBankInfo(
      activeBranch,
      params.templateId || params.bill?.templateId,
      params.supplierName,
      params.bill?.bankInfo
    );
    setBankModalTarget({
      branch: activeBranch,
      templateId: params.templateId || params.bill?.templateId,
      supplierName: params.supplierName,
      bill: params.bill
    });
    setBankBeneficiaryInput(existing?.beneficiaryName || '');
    setBankNameInput(existing?.bankName || '');
    setBankAccountInput(existing?.accountNumber || '');
    setBankClabeInput(existing?.clabe || '');
    playBeep(580, 'sine', 0.04);
  };

  const handleSaveBankInfo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankModalTarget) return;

    const nowIso = new Date().toISOString();
    const cleanedBankInfo: SupplierBill['bankInfo'] = {
      beneficiaryName: bankBeneficiaryInput.trim(),
      bankName: bankNameInput.trim(),
      accountNumber: bankAccountInput.trim(),
      clabe: bankClabeInput.trim(),
      updatedAt: nowIso
    };

    const profileId = buildBankProfileId(
      bankModalTarget.branch,
      bankModalTarget.templateId,
      bankModalTarget.supplierName
    );

    const newProfile: SupplierBankInfo = {
      id: profileId,
      branch: bankModalTarget.branch,
      templateId: bankModalTarget.templateId,
      supplierName: bankModalTarget.supplierName,
      beneficiaryName: cleanedBankInfo.beneficiaryName || '',
      bankName: cleanedBankInfo.bankName || '',
      accountNumber: cleanedBankInfo.accountNumber || '',
      clabe: cleanedBankInfo.clabe || '',
      updatedAt: nowIso
    };

    const mergedProfiles = mergeSupplierBankProfiles(bankProfiles, [newProfile]);
    setBankProfiles(mergedProfiles);
    saveSupplierBankProfiles(mergedProfiles, true);
    saveSupplierBankProfileToFirestore(newProfile).catch(() => {});
    syncWithCloud({ supplierBankProfiles: mergedProfiles }).catch(() => {});

    // Sincronizar también con las cuentas del viernes de este proveedor
    const normTarget = normalizeSupplierKey(bankModalTarget.supplierName);
    const matchingBills = supplierBills.filter(b => {
      if ((b.branch || 'refugio') !== bankModalTarget.branch) return false;
      if (bankModalTarget.bill && b.id === bankModalTarget.bill.id) return true;
      if (bankModalTarget.templateId && b.templateId === bankModalTarget.templateId) return true;
      return normalizeSupplierKey(b.supplierName) === normTarget;
    });

    matchingBills.forEach(b => {
      onSaveSupplierBill({
        ...b,
        bankInfo: cleanedBankInfo,
        updatedAt: nowIso
      });
    });

    playCashSound();
    showNotice(`🏦 Datos bancarios de «${bankModalTarget.supplierName}» guardados y sincronizados.`);
    setBankModalTarget(null);
  };

  // =========================================================================
  // HANDLERS: FOTO DE COMPROBANTE DE PAGO
  // =========================================================================
  const handleOpenReceiptModal = (target: { bill?: SupplierBill; template?: RecurringExpenseTemplate }) => {
    setReceiptModalTarget(target);
    playBeep(580, 'sine', 0.04);
  };

  const handleReceiptFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !receiptModalTarget) return;

    setIsProcessingMedia(true);
    try {
      const base64 = file.type.startsWith('image/')
        ? await compressReceiptImage(file)
        : await readFileAsDataUrl(file);

      if (base64.length > 850000) {
        showNotice('⚠️ El archivo es demasiado pesado. Sube una foto más ligera.');
        setIsProcessingMedia(false);
        return;
      }

      const nowIso = new Date().toISOString();
      let updatedBill: SupplierBill;

      if (receiptModalTarget.bill) {
        updatedBill = {
          ...receiptModalTarget.bill,
          receiptImageUrl: base64,
          receiptFileName: file.name,
          receiptUploadedAt: nowIso,
          updatedAt: nowIso
        };
      } else if (receiptModalTarget.template) {
        const existingInFriday = fridayBillsByTemplate.get(receiptModalTarget.template.id);
        if (existingInFriday) {
          updatedBill = {
            ...existingInFriday,
            receiptImageUrl: base64,
            receiptFileName: file.name,
            receiptUploadedAt: nowIso,
            updatedAt: nowIso
          };
        } else {
          updatedBill = createBillFromTemplate(receiptModalTarget.template, {
            receiptImageUrl: base64,
            receiptFileName: file.name,
            receiptUploadedAt: nowIso
          });
        }
      } else {
        setIsProcessingMedia(false);
        return;
      }

      onSaveSupplierBill(updatedBill);
      setReceiptModalTarget({ bill: updatedBill, template: receiptModalTarget.template });
      playCashSound();
      showNotice(`📷 Comprobante guardado para «${updatedBill.supplierName}».`);
    } catch {
      showNotice('⚠️ No se pudo procesar la foto del comprobante.');
    } finally {
      setIsProcessingMedia(false);
      if (receiptFileInputRef.current) receiptFileInputRef.current.value = '';
    }
  };

  const handleRemoveReceipt = () => {
    if (!receiptModalTarget?.bill) return;
    const nowIso = new Date().toISOString();
    const updatedBill: SupplierBill = {
      ...receiptModalTarget.bill,
      receiptImageUrl: '',
      receiptFileName: '',
      receiptUploadedAt: '',
      updatedAt: nowIso
    };
    onSaveSupplierBill(updatedBill);
    setReceiptModalTarget({ bill: updatedBill, template: receiptModalTarget.template });
    playBeep(450, 'sawtooth', 0.08);
    showNotice(`🗑️ Foto de comprobante eliminada de «${updatedBill.supplierName}».`);
  };

  // =========================================================================
  // HANDLERS: FACTURAS (PDF / XML / FOTO + FOLIO)
  // =========================================================================
  const handleOpenInvoiceModal = (target: { bill?: SupplierBill; template?: RecurringExpenseTemplate }) => {
    const bill = target.bill || (target.template ? fridayBillsByTemplate.get(target.template.id) : undefined);
    setInvoiceModalTarget({ bill, template: target.template });
    setInvoiceFolioInput(bill?.invoiceFolio || bill?.billFolio || '');
    setInvoiceFileError('');
    playBeep(580, 'sine', 0.04);
  };

  const handleSaveInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceModalTarget) return;

    const existingBill = invoiceModalTarget.bill || (invoiceModalTarget.template ? fridayBillsByTemplate.get(invoiceModalTarget.template.id) : undefined);
    const file = invoiceFileInputRef.current?.files?.[0];

    setIsProcessingMedia(true);
    setInvoiceFileError('');

    try {
      let invoiceBase64 = existingBill?.invoiceFileUrl || '';
      let invoiceFileName = existingBill?.invoiceFileName || '';
      let invoiceUploadedAt = existingBill?.invoiceUploadedAt || '';

      if (file) {
        if (file.type.startsWith('image/')) {
          invoiceBase64 = await compressReceiptImage(file);
        } else {
          if (file.size > 650 * 1024) {
            setInvoiceFileError('El archivo PDF/XML supera 650 KB. Comprímelo o usa un archivo más ligero.');
            setIsProcessingMedia(false);
            return;
          }
          invoiceBase64 = await readFileAsDataUrl(file);
        }
        invoiceFileName = file.name;
        invoiceUploadedAt = new Date().toISOString();
      }

      const folioClean = invoiceFolioInput.trim();
      if (!folioClean && !invoiceBase64) {
        setInvoiceFileError('Ingresa un folio de factura o selecciona un archivo (PDF, XML o imagen).');
        setIsProcessingMedia(false);
        return;
      }

      const nowIso = new Date().toISOString();
      let updatedBill: SupplierBill;

      if (existingBill) {
        updatedBill = {
          ...existingBill,
          invoiceFolio: folioClean,
          invoiceFileUrl: invoiceBase64,
          invoiceFileName,
          invoiceUploadedAt,
          updatedAt: nowIso
        };
      } else if (invoiceModalTarget.template) {
        updatedBill = createBillFromTemplate(invoiceModalTarget.template, {
          invoiceFolio: folioClean,
          invoiceFileUrl: invoiceBase64,
          invoiceFileName,
          invoiceUploadedAt
        });
      } else {
        setIsProcessingMedia(false);
        return;
      }

      onSaveSupplierBill(updatedBill);
      playCashSound();
      showNotice(`📄 Factura guardada para «${updatedBill.supplierName}».`);
      setInvoiceModalTarget(null);
    } catch {
      setInvoiceFileError('No se pudo leer el archivo de la factura.');
    } finally {
      setIsProcessingMedia(false);
      if (invoiceFileInputRef.current) invoiceFileInputRef.current.value = '';
    }
  };

  const handleRemoveInvoice = () => {
    const existingBill = invoiceModalTarget?.bill;
    if (!existingBill) return;
    const nowIso = new Date().toISOString();
    const updatedBill: SupplierBill = {
      ...existingBill,
      invoiceFolio: '',
      invoiceFileUrl: '',
      invoiceFileName: '',
      invoiceUploadedAt: '',
      updatedAt: nowIso
    };
    onSaveSupplierBill(updatedBill);
    setInvoiceModalTarget({ bill: updatedBill, template: invoiceModalTarget?.template });
    setInvoiceFolioInput('');
    playBeep(450, 'sawtooth', 0.08);
    showNotice(`🗑️ Factura eliminada de «${updatedBill.supplierName}».`);
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

        {/* Listado de Cuentas Pasadas a este Viernes (Columnas Compactas en la Misma Vista) */}
        {fridayBills.length === 0 ? (
          <div className="bg-slate-50/70 border border-dashed border-slate-200 rounded-2xl p-6 text-center">
            <p className="text-xs font-bold text-slate-600">
              No has pasado cuentas para este viernes aún ({selectedFriday}).
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Usa la barra de arriba o haz clic en <strong>«➕ Viernes»</strong> en cualquier fila de la lista de abajo para enviarlas aquí.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-slate-100 text-slate-700 font-black uppercase text-[9.5px] tracking-tight border-b border-slate-200">
                <tr>
                  <th className="py-2 px-1.5 w-8 text-center">#</th>
                  <th className="py-2 px-2">Proveedor / Rubro</th>
                  <th className="py-2 px-2 text-right">Monto</th>
                  <th className="py-2 px-1.5 text-center">Datos Bancarios</th>
                  <th className="py-2 px-1.5 text-center">Comprobante</th>
                  <th className="py-2 px-1.5 text-center">Factura</th>
                  <th className="py-2 px-2 text-center">Pago</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {fridayBills.map((bill, idx) => {
                  const isPaid = bill.status === 'pagado';
                  const bankInfo = getSavedBankInfo(activeBranch, bill.templateId, bill.supplierName, bill.bankInfo);
                  const hasBank = Boolean(bankInfo);
                  const hasReceipt = Boolean(bill.receiptImageUrl);
                  const hasInvoice = Boolean(bill.invoiceFileUrl || bill.invoiceFolio);
                  const last4 = (bankInfo?.clabe || bankInfo?.accountNumber || '').slice(-4);

                  return (
                    <tr 
                      key={bill.id} 
                      className={`hover:bg-slate-50 transition-colors ${isPaid ? 'bg-emerald-50/30' : ''}`}
                    >
                      <td className="py-2 px-1.5 text-center font-mono font-bold text-slate-500 whitespace-nowrap">
                        {bill.orderNumber ? `#${bill.orderNumber}` : idx + 1}
                      </td>
                      <td className="py-2 px-2 max-w-[180px]">
                        <strong className="text-slate-900 block font-black text-[11px] truncate" title={bill.supplierName}>
                          {bill.supplierName}
                        </strong>
                        <div className="flex items-center gap-1 flex-wrap mt-0.5">
                          <span className="bg-slate-100 text-slate-600 font-bold px-1.5 py-0.2 rounded text-[9px] truncate max-w-[115px]">
                            {bill.categoryLabel || bill.category}
                          </span>
                          {bill.billFolio && (
                            <span className="text-[9px] text-slate-500 font-mono truncate">
                              #{bill.billFolio}
                            </span>
                          )}
                        </div>
                        {bill.notes && (
                          <span className="text-[9.5px] text-slate-400 block italic truncate" title={bill.notes}>
                            {bill.notes}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right font-black text-xs text-slate-900 whitespace-nowrap">
                        ${bill.amount.toLocaleString('es-MX')}
                      </td>

                      {/* Columna: Datos Bancarios */}
                      <td className="py-2 px-1.5 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleOpenBankModal({
                            templateId: bill.templateId,
                            supplierName: bill.supplierName,
                            bill
                          })}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer border ${
                            hasBank
                              ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border-indigo-300'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-dashed border-slate-300'
                          }`}
                          title={hasBank
                            ? `${bankInfo?.beneficiaryName || ''} • ${bankInfo?.bankName || ''} • CLABE: ${bankInfo?.clabe || bankInfo?.accountNumber || ''}`
                            : 'Capturar nombre, banco, cuenta y CLABE'}
                        >
                          <Landmark className="w-3 h-3 shrink-0" />
                          <span className="truncate max-w-[85px]">
                            {hasBank ? `${bankInfo?.bankName || 'Banco'}${last4 ? ` ·${last4}` : ''}` : 'Bancarios'}
                          </span>
                        </button>
                      </td>

                      {/* Columna: Foto de Comprobante */}
                      <td className="py-2 px-1.5 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleOpenReceiptModal({ bill })}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer border ${
                            hasReceipt
                              ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-dashed border-slate-300'
                          }`}
                          title={hasReceipt ? 'Ver o cambiar foto de comprobante' : 'Subir foto del comprobante de pago'}
                        >
                          {hasReceipt ? (
                            <>
                              <img
                                src={bill.receiptImageUrl}
                                alt="Comp."
                                className="w-3.5 h-3.5 rounded object-cover border border-emerald-400"
                              />
                              <span>Ver Foto</span>
                            </>
                          ) : (
                            <>
                              <Camera className="w-3 h-3 shrink-0" />
                              <span>Foto</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* Columna: Factura */}
                      <td className="py-2 px-1.5 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleOpenInvoiceModal({ bill })}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer border ${
                            hasInvoice
                              ? 'bg-purple-50 hover:bg-purple-100 text-purple-900 border-purple-300'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-dashed border-slate-300'
                          }`}
                          title={hasInvoice ? `Factura: ${bill.invoiceFolio || bill.invoiceFileName || 'Cargada'}` : 'Subir o almacenar factura (PDF/XML/Imagen)'}
                        >
                          <FileText className="w-3 h-3 shrink-0" />
                          <span className="truncate max-w-[72px]">
                            {bill.invoiceFolio ? bill.invoiceFolio : bill.invoiceFileUrl ? 'Ver Fact.' : 'Factura'}
                          </span>
                        </button>
                      </td>

                      {/* Columna: Estado, Acción de Pago y Quitar */}
                      <td className="py-2 px-2 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {isPaid ? (
                            <>
                              <span className="inline-flex items-center gap-0.5 bg-emerald-100 text-emerald-900 font-black px-1.5 py-0.5 rounded-md text-[9.5px] border border-emerald-300">
                                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-700" />
                                <span>Pagado</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRevertToPending(bill)}
                                className="text-[9.5px] font-bold text-slate-400 hover:text-slate-700 underline cursor-pointer px-1"
                                title="Regresar a estado pendiente"
                              >
                                Revertir
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenPayModal(bill)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-2 py-1 rounded-lg text-[10px] inline-flex items-center gap-1 shadow-xs active:scale-95 transition-all cursor-pointer"
                              title="Registrar pago de esta cuenta"
                            >
                              <Check className="w-3 h-3" />
                              <span>Pagar</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteBill(bill)}
                            className="text-slate-300 hover:text-rose-600 p-1 rounded-lg transition-colors cursor-pointer"
                            title="Quitar este gasto del viernes"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
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

        {/* Tabla Compacta para Visualizar Todas las Columnas en la Misma Vista */}
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-slate-100 text-slate-700 font-black uppercase text-[9.5px] tracking-tight border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-1.5 w-7 text-center">#</th>
                <th className="py-2.5 px-2">Proveedor / Rubro</th>
                <th className="py-2.5 px-1.5 text-right whitespace-nowrap">Semanal</th>
                <th className="py-2.5 px-1.5 text-right whitespace-nowrap">Mes / %</th>
                <th className="py-2.5 px-1.5 text-center whitespace-nowrap">Bancarios</th>
                <th className="py-2.5 px-1.5 text-center whitespace-nowrap">Comprobante</th>
                <th className="py-2.5 px-1.5 text-center whitespace-nowrap">Factura</th>
                <th className="py-2.5 px-1.5 text-center whitespace-nowrap">Viernes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {filteredTemplates.map((item) => {
                const billForFriday = fridayBillsByTemplate.get(item.id);
                const isInFriday = !!billForFriday;
                const isPaid = billForFriday?.status === 'pagado';
                const bankInfo = getSavedBankInfo(activeBranch, item.id, item.concept, billForFriday?.bankInfo);
                const hasBank = Boolean(bankInfo);
                const hasReceipt = Boolean(billForFriday?.receiptImageUrl);
                const hasInvoice = Boolean(billForFriday?.invoiceFileUrl || billForFriday?.invoiceFolio);
                const last4 = (bankInfo?.clabe || bankInfo?.accountNumber || '').slice(-4);

                return (
                  <tr key={item.id} className="hover:bg-amber-50/40 transition-colors">
                    {/* Columna 1: # */}
                    <td className="py-2 px-1.5 text-center font-mono font-bold text-slate-400">
                      {item.orderNumber}
                    </td>

                    {/* Columna 2: Proveedor / Rubro compacto */}
                    <td className="py-2 px-2 max-w-[195px]">
                      <div className="flex items-center gap-1 flex-wrap">
                        <strong className="text-slate-900 font-black text-[11px] truncate max-w-[130px]" title={item.concept}>
                          {item.concept}
                        </strong>
                        
                        {/* Toggle de frecuencia de pago semanal / mensual */}
                        <button
                          type="button"
                          onClick={() => handleToggleTemplateFrequency(item.id)}
                          className={`inline-flex items-center text-[9px] font-black px-1.5 py-0.2 rounded border transition-all cursor-pointer ${
                            item.frequency === 'mensual'
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                              : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                          }`}
                          title={`Frecuencia base: ${item.frequency === 'mensual' ? 'Mensual' : 'Semanal'}. Clic para alternar.`}
                        >
                          {item.frequency === 'mensual' ? 'Mes' : 'Sem'}
                        </button>

                        {item.isCustom && (
                          <span className="text-[8.5px] bg-purple-100 text-purple-900 font-black px-1 py-0.2 rounded border border-purple-200">
                            ★
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9.5px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded truncate max-w-[110px]">
                          {item.categoryLabel}
                        </span>
                        <span className="text-[9.5px] text-slate-400 truncate max-w-[95px]" title={item.description}>
                          {item.description}
                        </span>
                      </div>
                    </td>

                    {/* Columna 3: Gasto Semanal con edición rápida */}
                    <td className="py-2 px-1.5 text-right font-black text-slate-900 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
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

                    {/* Columna 4: Mes / % apilado */}
                    <td className="py-2 px-1.5 text-right whitespace-nowrap">
                      <div className="font-bold text-slate-700 leading-tight">
                        ${item.monthlyAmount.toLocaleString('es-MX')}
                      </div>
                      <div className="text-[9.5px] font-black text-slate-400">
                        {item.percent}%
                      </div>
                    </td>

                    {/* Columna 5: Datos Bancarios */}
                    <td className="py-2 px-1.5 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleOpenBankModal({
                          templateId: item.id,
                          supplierName: item.concept,
                          bill: billForFriday
                        })}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer border ${
                          hasBank
                            ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border-indigo-300'
                            : 'bg-white hover:bg-slate-50 text-slate-600 border-dashed border-slate-300'
                        }`}
                        title={hasBank
                          ? `${bankInfo?.beneficiaryName || ''} • ${bankInfo?.bankName || ''} • CLABE: ${bankInfo?.clabe || bankInfo?.accountNumber || ''}`
                          : 'Agregar nombre, banco, cuenta y CLABE'}
                      >
                        <Landmark className="w-3 h-3 shrink-0" />
                        <span className="truncate max-w-[78px]">
                          {hasBank ? `${bankInfo?.bankName || 'Banco'}${last4 ? `·${last4}` : ''}` : 'Bancarios'}
                        </span>
                      </button>
                    </td>

                    {/* Columna 6: Comprobante (Foto) */}
                    <td className="py-2 px-1.5 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleOpenReceiptModal({ bill: billForFriday, template: item })}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer border ${
                          hasReceipt
                            ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                            : 'bg-white hover:bg-slate-50 text-slate-600 border-dashed border-slate-300'
                        }`}
                        title={hasReceipt ? 'Ver o cambiar foto de comprobante' : 'Cargar foto del comprobante'}
                      >
                        {hasReceipt ? (
                          <>
                            <img
                              src={billForFriday?.receiptImageUrl}
                              alt="Comp."
                              className="w-3.5 h-3.5 rounded object-cover border border-emerald-400"
                            />
                            <span>Ver Foto</span>
                          </>
                        ) : (
                          <>
                            <Camera className="w-3 h-3 shrink-0" />
                            <span>Foto</span>
                          </>
                        )}
                      </button>
                    </td>

                    {/* Columna 7: Factura */}
                    <td className="py-2 px-1.5 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleOpenInvoiceModal({ bill: billForFriday, template: item })}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer border ${
                          hasInvoice
                            ? 'bg-purple-50 hover:bg-purple-100 text-purple-900 border-purple-300'
                            : 'bg-white hover:bg-slate-50 text-slate-600 border-dashed border-slate-300'
                        }`}
                        title={hasInvoice ? `Factura: ${billForFriday?.invoiceFolio || billForFriday?.invoiceFileName || 'Cargada'}` : 'Cargar y almacenar factura'}
                      >
                        <FileText className="w-3 h-3 shrink-0" />
                        <span className="truncate max-w-[66px]">
                          {billForFriday?.invoiceFolio ? billForFriday.invoiceFolio : billForFriday?.invoiceFileUrl ? 'Ver Fact.' : 'Factura'}
                        </span>
                      </button>
                    </td>

                    {/* Columna 8: Viernes */}
                    <td className="py-2 px-1.5 text-center whitespace-nowrap">
                      {isInFriday ? (
                        <div className="inline-flex items-center">
                          {isPaid ? (
                            <span className="bg-emerald-100 text-emerald-900 font-black px-2 py-1 rounded-lg text-[10px] border border-emerald-300 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                              <span>${billForFriday.amount.toLocaleString('es-MX')}</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenPayModal(billForFriday)}
                              className="bg-amber-100 hover:bg-emerald-600 hover:text-white text-amber-950 font-black px-2 py-1 rounded-lg text-[10px] border border-amber-300 flex items-center gap-1 transition-colors cursor-pointer"
                              title="Cuenta lista para pagar este viernes. Haz clic para liquidar."
                            >
                              <Clock className="w-3 h-3" />
                              <span>${billForFriday.amount.toLocaleString('es-MX')} · Pagar</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenPassModal(item)}
                          className="bg-[#D95D39] hover:bg-[#b84524] text-white font-black px-2.5 py-1 rounded-lg text-[10px] shadow-2xs active:scale-95 transition-all inline-flex items-center gap-1 cursor-pointer"
                          title={`Pasar ${item.concept} a pagos de este viernes (${selectedFriday})`}
                        >
                          <Plus className="w-3 h-3" />
                          <span>Viernes</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900 text-white font-black text-[11px]">
                <td className="py-3 px-1.5 text-center font-mono">{filteredTemplates.length}</td>
                <td className="py-3 px-2">
                  TOTAL {activeBranch === 'zakia' ? 'ZAKIA' : 'EL REFUGIO'}
                </td>
                <td className="py-3 px-1.5 text-right text-amber-300 font-black whitespace-nowrap">
                  ${templatesTotals.totalWeekly.toLocaleString('es-MX')}
                </td>
                <td className="py-3 px-1.5 text-right text-emerald-300 font-black whitespace-nowrap">
                  <div>${templatesTotals.totalMonthly.toLocaleString('es-MX')}</div>
                  <div className="text-[9.5px] text-white/80">100.0%</div>
                </td>
                <td className="py-3 px-1.5 text-center text-slate-300 text-[10px]" colSpan={3}>
                  {bankProfiles.filter(p => (p.branch || 'refugio') === activeBranch).length} bancos · {fridayBills.filter(b => Boolean(b.receiptImageUrl)).length} fotos · {fridayBills.filter(b => Boolean(b.invoiceFileUrl || b.invoiceFolio)).length} facturas
                </td>
                <td className="py-3 px-1.5 text-center text-slate-300 text-[10px] whitespace-nowrap">
                  {selectedFriday}
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

      {/* =========================================================================
          MODAL: DATOS BANCARIOS DE PROVEEDOR (NOMBRE, BANCO, CUENTA, CLABE)
          ========================================================================= */}
      {bankModalTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-indigo-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <Landmark className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm">Datos Bancarios del Proveedor</h3>
                  <p className="text-[11px] font-bold text-indigo-700 truncate max-w-[260px]">
                    {bankModalTarget.supplierName} ({bankModalTarget.branch === 'zakia' ? 'Zakia' : 'El Refugio'})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBankModalTarget(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBankInfo} className="py-4 space-y-3">
              <div>
                <label className="text-[11px] font-black uppercase text-slate-600 block mb-1">
                  Nombre del Titular / Beneficiario:
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={bankBeneficiaryInput}
                    onChange={(e) => setBankBeneficiaryInput(e.target.value)}
                    placeholder="ej. Distribuidora Alimenticia Dialpa S.A."
                    className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    autoFocus
                  />
                  {bankBeneficiaryInput && (
                    <button
                      type="button"
                      onClick={() => handleCopyBankField(bankBeneficiaryInput, 'Nombre')}
                      className="px-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 cursor-pointer"
                      title="Copiar nombre"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-black uppercase text-slate-600 block mb-1">
                  Banco:
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={bankNameInput}
                    onChange={(e) => setBankNameInput(e.target.value)}
                    placeholder="ej. BBVA, Santander, Banorte, HSBC..."
                    className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {bankNameInput && (
                    <button
                      type="button"
                      onClick={() => handleCopyBankField(bankNameInput, 'Banco')}
                      className="px-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 cursor-pointer"
                      title="Copiar banco"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-black uppercase text-slate-600 block mb-1">
                  Número de Cuenta:
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={bankAccountInput}
                    onChange={(e) => setBankAccountInput(e.target.value)}
                    placeholder="ej. 0123456789"
                    className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {bankAccountInput && (
                    <button
                      type="button"
                      onClick={() => handleCopyBankField(bankAccountInput, 'Cuenta')}
                      className="px-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 cursor-pointer"
                      title="Copiar cuenta"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-black uppercase text-slate-600 block mb-1">
                  CLABE Interbancaria (18 dígitos):
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    maxLength={18}
                    value={bankClabeInput}
                    onChange={(e) => setBankClabeInput(e.target.value.replace(/\s+/g, ''))}
                    placeholder="ej. 012680001234567890"
                    className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-black text-slate-900 tracking-wider focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {bankClabeInput && (
                    <button
                      type="button"
                      onClick={() => handleCopyBankField(bankClabeInput, 'CLABE')}
                      className="px-2.5 bg-indigo-100 hover:bg-indigo-200 rounded-xl text-indigo-800 cursor-pointer"
                      title="Copiar CLABE"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setBankModalTarget(null)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-md active:scale-95 transition-all cursor-pointer"
                >
                  Guardar Datos Bancarios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: FOTO DE COMPROBANTE DE PAGO
          ========================================================================= */}
      {receiptModalTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 shadow-2xl border border-emerald-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm">Comprobante de Pago (Foto)</h3>
                  <p className="text-[11px] font-bold text-emerald-700 truncate max-w-[280px]">
                    {receiptModalTarget.bill?.supplierName || receiptModalTarget.template?.concept} • Viernes {selectedFriday}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReceiptModalTarget(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-3">
              <input
                ref={receiptFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleReceiptFileSelected}
                className="hidden"
              />

              {receiptModalTarget.bill?.receiptImageUrl ? (
                <div className="space-y-3">
                  <div className="bg-slate-900 rounded-2xl p-2 flex items-center justify-center max-h-[55vh] overflow-auto">
                    <img
                      src={receiptModalTarget.bill.receiptImageUrl}
                      alt="Comprobante de pago"
                      className="max-h-[50vh] w-auto object-contain rounded-xl"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-200">
                    <span className="font-bold truncate max-w-[220px]">
                      📎 {receiptModalTarget.bill.receiptFileName || 'comprobante.jpg'}
                    </span>
                    <div className="flex items-center gap-2">
                      <a
                        href={receiptModalTarget.bill.receiptImageUrl}
                        download={receiptModalTarget.bill.receiptFileName || `comprobante_${selectedFriday}.jpg`}
                        className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black px-2.5 py-1 rounded-lg text-[10px]"
                      >
                        <Download className="w-3 h-3" />
                        <span>Descargar</span>
                      </a>
                      <button
                        type="button"
                        onClick={handleRemoveReceipt}
                        className="inline-flex items-center gap-1 bg-rose-100 hover:bg-rose-200 text-rose-800 font-black px-2.5 py-1 rounded-lg text-[10px] cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Eliminar</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 border-2 border-dashed border-emerald-300 rounded-2xl p-6 text-center space-y-2">
                  <ImageIcon className="w-10 h-10 text-emerald-500 mx-auto" />
                  <p className="text-xs font-black text-slate-700">
                    Aún no se ha cargado foto del comprobante
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Sube la captura de transferencia o ticket físico para almacenarlo en esta cuenta del viernes.
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReceiptModalTarget(null)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  disabled={isProcessingMedia}
                  onClick={() => receiptFileInputRef.current?.click()}
                  className="flex-1 py-2.5 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 shadow-md active:scale-95 transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>
                    {isProcessingMedia
                      ? 'Procesando...'
                      : receiptModalTarget.bill?.receiptImageUrl
                      ? 'Cambiar Foto'
                      : 'Cargar Foto de Comprobante'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: FACTURAS (FOLIO + ARCHIVO PDF / XML / IMAGEN)
          ========================================================================= */}
      {invoiceModalTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-purple-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm">Factura del Proveedor</h3>
                  <p className="text-[11px] font-bold text-purple-700 truncate max-w-[280px]">
                    {invoiceModalTarget.bill?.supplierName || invoiceModalTarget.template?.concept} • Viernes {selectedFriday}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInvoiceModalTarget(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveInvoiceSubmit} className="py-4 space-y-3.5">
              <div>
                <label className="text-[11px] font-black uppercase text-slate-600 block mb-1">
                  Número o Folio de Factura (Opcional):
                </label>
                <input
                  type="text"
                  value={invoiceFolioInput}
                  onChange={(e) => setInvoiceFolioInput(e.target.value)}
                  placeholder="ej. FAC-9021, Folio Fiscal A1B2..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-black uppercase text-slate-600 block mb-1">
                  Archivo de Factura (PDF, XML o Foto):
                </label>
                <input
                  ref={invoiceFileInputRef}
                  type="file"
                  accept=".pdf,.xml,image/*"
                  onChange={() => setInvoiceFileError('')}
                  className="w-full text-xs text-slate-700 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-purple-100 file:text-purple-900 hover:file:bg-purple-200 cursor-pointer border border-slate-200 rounded-xl p-1.5 bg-slate-50"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  PDF o XML hasta 650 KB, o foto de factura (se comprime automáticamente).
                </span>
              </div>

              {invoiceFileError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{invoiceFileError}</span>
                </div>
              )}

              {invoiceModalTarget.bill?.invoiceFileUrl && (
                <div className="bg-purple-50/70 border border-purple-200 rounded-2xl p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-black text-purple-950 truncate max-w-[220px]">
                      📄 {invoiceModalTarget.bill.invoiceFileName || 'Factura guardada'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <a
                        href={invoiceModalTarget.bill.invoiceFileUrl}
                        download={invoiceModalTarget.bill.invoiceFileName || `factura_${selectedFriday}`}
                        className="inline-flex items-center gap-1 bg-purple-600 hover:bg-purple-700 text-white font-black px-2.5 py-1 rounded-lg text-[10px]"
                      >
                        <Download className="w-3 h-3" />
                        <span>Descargar</span>
                      </a>
                      <button
                        type="button"
                        onClick={handleRemoveInvoice}
                        className="inline-flex items-center gap-1 bg-rose-100 hover:bg-rose-200 text-rose-800 font-black px-2.5 py-1 rounded-lg text-[10px] cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Quitar</span>
                      </button>
                    </div>
                  </div>

                  {invoiceModalTarget.bill.invoiceFileUrl.startsWith('data:image/') ? (
                    <div className="bg-slate-900 rounded-xl p-1.5 flex justify-center max-h-48 overflow-auto">
                      <img
                        src={invoiceModalTarget.bill.invoiceFileUrl}
                        alt="Vista previa de factura"
                        className="max-h-44 object-contain rounded-lg"
                      />
                    </div>
                  ) : invoiceModalTarget.bill.invoiceFileUrl.startsWith('data:application/pdf') ? (
                    <iframe
                      src={invoiceModalTarget.bill.invoiceFileUrl}
                      title="Vista previa PDF de factura"
                      className="w-full h-48 rounded-xl border border-purple-200 bg-white"
                    />
                  ) : (
                    <div className="text-[11px] font-bold text-purple-800 bg-white px-3 py-2 rounded-xl border border-purple-100">
                      Archivo XML / digital almacenado listo para descargar.
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setInvoiceModalTarget(null)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isProcessingMedia}
                  className="flex-1 py-2.5 rounded-xl text-xs font-black text-white bg-purple-600 hover:bg-purple-700 shadow-md active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isProcessingMedia ? 'Guardando...' : 'Guardar Factura'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: CONFIRMACIÓN DE ELIMINACIÓN (SIN window.confirm)
          ========================================================================= */}
      {deleteConfirmation && (
        <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-rose-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
              <div className="w-9 h-9 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="font-black text-slate-900 text-sm">{deleteConfirmation.title}</h3>
            </div>
            <p className="text-xs text-slate-600 font-medium py-4 leading-relaxed">
              {deleteConfirmation.message}
            </p>
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmation(null)}
                className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteAction}
                className="flex-1 py-2 rounded-xl text-xs font-black text-white bg-rose-600 hover:bg-rose-700 shadow-md active:scale-95 transition-all cursor-pointer"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
