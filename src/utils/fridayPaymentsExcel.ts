import * as XLSX from 'xlsx';
import { SupplierBill, ExpenseCategory } from '../types';

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  nomina: 'Mano de Obra y Cargas',
  materia_prima: 'Materia Prima e Insumos',
  renta: 'Instalaciones y Servicios',
  servicios: 'Instalaciones y Servicios',
  reparto_gasolina: 'Operación y Mantenimiento',
  mantenimiento: 'Operación y Mantenimiento',
  impuestos_fiscal: 'Administración y Fiscal',
  otros: 'Otros Gastos Operativos'
};

const PAY_METHOD_LABELS: Record<string, string> = {
  transferencia: 'Transferencia',
  efectivo: 'Efectivo',
  cheque: 'Cheque'
};

function formatBranchName(branch?: string): string {
  return branch === 'zakia' ? 'Zakia' : 'El Refugio (Matriz)';
}

function formatDateLong(dateStr: string): string {
  const parts = (dateStr || '').split('-');
  if (parts.length !== 3) return dateStr;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function formatMonthTitle(yearMonth: string): string {
  const parts = (yearMonth || '').split('-');
  if (parts.length !== 2) return yearMonth;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
  if (isNaN(d.getTime())) return yearMonth;
  const label = d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function sortBills(bills: SupplierBill[]): SupplierBill[] {
  return [...bills].sort((a, b) => {
    const dateCmp = (a.dueDate || '').localeCompare(b.dueDate || '');
    if (dateCmp !== 0) return dateCmp;
    const branchA = a.branch || 'refugio';
    const branchB = b.branch || 'refugio';
    if (branchA !== branchB) return branchA.localeCompare(branchB);
    const numA = a.orderNumber ?? 999;
    const numB = b.orderNumber ?? 999;
    if (numA !== numB) return numA - numB;
    return (a.supplierName || '').localeCompare(b.supplierName || '');
  });
}

function applyColumnWidths(ws: XLSX.WorkSheet, rows: any[][], extraCols?: number[]) {
  const colWidths: number[] = [];
  rows.forEach((row) => {
    row.forEach((cell, cIdx) => {
      const len = cell === null || cell === undefined ? 0 : String(cell).length;
      colWidths[cIdx] = Math.max(colWidths[cIdx] || 10, Math.min(len + 4, 48));
    });
  });
  if (extraCols) {
    extraCols.forEach((w, idx) => {
      if (w) colWidths[idx] = Math.max(colWidths[idx] || 10, w);
    });
  }
  ws['!cols'] = colWidths.map((wch) => ({ wch }));
}

function formatCurrencyCells(ws: XLSX.WorkSheet, rows: any[][], currencyColIndices: number[]) {
  rows.forEach((row, rIdx) => {
    currencyColIndices.forEach((cIdx) => {
      const val = row[cIdx];
      if (typeof val === 'number') {
        const ref = XLSX.utils.encode_cell({ r: rIdx, c: cIdx });
        if (ws[ref]) {
          ws[ref].z = '$#,##0.00';
        }
      }
    });
  });
}

function buildBillsSheetRows(
  title: string,
  subtitle: string,
  bills: SupplierBill[]
): { rows: any[][]; currencyCols: number[] } {
  const sorted = sortBills(bills);
  const totalAmount = sorted.reduce((s, b) => s + (b.amount || 0), 0);
  const paidAmount = sorted.filter((b) => b.status === 'pagado').reduce((s, b) => s + (b.amount || 0), 0);
  const pendingAmount = sorted.filter((b) => b.status !== 'pagado').reduce((s, b) => s + (b.amount || 0), 0);

  const rows: any[][] = [
    ['PANADERÍA SANTA FÉ — ' + title],
    [subtitle],
    [`Generado: ${new Date().toLocaleString('es-MX')}`],
    [],
    ['RESUMEN DEL REPORTE', 'Monto ($)', 'Cuentas'],
    ['Total Programado', totalAmount, sorted.length],
    ['Ya Pagado', paidAmount, sorted.filter((b) => b.status === 'pagado').length],
    ['Por Pagar (Pendiente)', pendingAmount, sorted.filter((b) => b.status !== 'pagado').length],
    [],
    [
      '#',
      'Fecha Viernes',
      'Sucursal',
      'No. Rubro',
      'Concepto / Proveedor',
      'Categoría',
      'Frecuencia',
      'Folio / Nota',
      'Fecha Registro',
      'Monto ($)',
      'Estado',
      'Método de Pago',
      'Fecha de Pago',
      'Observaciones'
    ]
  ];

  sorted.forEach((b, idx) => {
    rows.push([
      idx + 1,
      b.dueDate || '',
      formatBranchName(b.branch),
      b.orderNumber || '',
      b.supplierName || '',
      b.categoryLabel || CATEGORY_LABELS[b.category] || b.category,
      b.paymentFrequency === 'mensual' ? 'Mensual' : 'Semanal',
      b.billFolio || '',
      b.receivedDate || '',
      Number(b.amount || 0),
      b.status === 'pagado' ? 'PAGADO' : 'PENDIENTE',
      b.paidMethod ? (PAY_METHOD_LABELS[b.paidMethod] || b.paidMethod) : '—',
      b.paidDate || '—',
      b.notes || ''
    ]);
  });

  rows.push([]);
  rows.push([
    '',
    '',
    '',
    '',
    'TOTAL GENERAL',
    '',
    '',
    '',
    '',
    totalAmount,
    `Pagado: $${paidAmount.toLocaleString('es-MX')}`,
    `Pendiente: $${pendingAmount.toLocaleString('es-MX')}`,
    '',
    ''
  ]);

  return { rows, currencyCols: [1, 9] };
}

function buildCategoryBreakdownSheet(bills: SupplierBill[], title: string): XLSX.WorkSheet {
  const catMap = new Map<
    string,
    { count: number; total: number; paid: number; pending: number; refugio: number; zakia: number }
  >();

  let grandTotal = 0;
  for (const b of bills) {
    const label = b.categoryLabel || CATEGORY_LABELS[b.category] || b.category || 'Otros';
    const amt = Number(b.amount || 0);
    grandTotal += amt;
    const prev = catMap.get(label) || { count: 0, total: 0, paid: 0, pending: 0, refugio: 0, zakia: 0 };
    prev.count += 1;
    prev.total += amt;
    if (b.status === 'pagado') prev.paid += amt;
    else prev.pending += amt;
    if (b.branch === 'zakia') prev.zakia += amt;
    else prev.refugio += amt;
    catMap.set(label, prev);
  }

  const rows: any[][] = [
    [`PANADERÍA SANTA FÉ — ${title}`],
    [`Generado: ${new Date().toLocaleString('es-MX')}`],
    [],
    ['Categoría / Rubro', 'Cuentas', 'El Refugio ($)', 'Zakia ($)', 'Ya Pagado ($)', 'Pendiente ($)', 'Total ($)', '% del Total']
  ];

  const sortedCats = Array.from(catMap.entries()).sort((a, b) => b[1].total - a[1].total);
  sortedCats.forEach(([cat, stats]) => {
    const pct = grandTotal > 0 ? Number(((stats.total / grandTotal) * 100).toFixed(1)) : 0;
    rows.push([cat, stats.count, stats.refugio, stats.zakia, stats.paid, stats.pending, stats.total, `${pct}%`]);
  });

  const sumRef = sortedCats.reduce((s, [, v]) => s + v.refugio, 0);
  const sumZak = sortedCats.reduce((s, [, v]) => s + v.zakia, 0);
  const sumPaid = sortedCats.reduce((s, [, v]) => s + v.paid, 0);
  const sumPend = sortedCats.reduce((s, [, v]) => s + v.pending, 0);

  rows.push([]);
  rows.push(['TOTAL', bills.length, sumRef, sumZak, sumPaid, sumPend, grandTotal, '100.0%']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  applyColumnWidths(ws, rows, [28, 10, 16, 16, 16, 16, 16, 12]);
  formatCurrencyCells(ws, rows, [2, 3, 4, 5, 6]);
  return ws;
}

/**
 * Descarga un archivo Excel (.xlsx) con los pagos de un Viernes específico.
 * Incluye hoja de la sucursal activa, resumen por categoría y consolidado de ambas sucursales si hay registros.
 */
export function exportFridayPaymentsExcel(params: {
  fridayDate: string;
  supplierBills: SupplierBill[];
  activeBranch: 'refugio' | 'zakia';
}): { exported: boolean; count: number; fileName: string } {
  const { fridayDate, supplierBills, activeBranch } = params;

  const allFridayBills = supplierBills.filter((b) => b.dueDate === fridayDate);
  const branchFridayBills = allFridayBills.filter((b) => (b.branch || 'refugio') === activeBranch);

  if (allFridayBills.length === 0) {
    return { exported: false, count: 0, fileName: '' };
  }

  const wb = XLSX.utils.book_new();
  const branchLabel = activeBranch === 'zakia' ? 'Zakia' : 'El Refugio';

  // Hoja 1: Sucursal activa (o todas si la activa está vacía pero la otra sí tiene)
  const primaryBills = branchFridayBills.length > 0 ? branchFridayBills : allFridayBills;
  const primaryTitle =
    branchFridayBills.length > 0
      ? `PAGOS DEL VIERNES (${branchLabel.toUpperCase()})`
      : 'PAGOS DEL VIERNES (CONSOLIDADO)';

  const primarySheetData = buildBillsSheetRows(
    primaryTitle,
    `Fecha del Viernes: ${formatDateLong(fridayDate)} (${fridayDate})`,
    primaryBills
  );
  const wsPrimary = XLSX.utils.aoa_to_sheet(primarySheetData.rows);
  applyColumnWidths(wsPrimary, primarySheetData.rows);
  formatCurrencyCells(wsPrimary, primarySheetData.rows, [1, 9]);
  XLSX.utils.book_append_sheet(
    wb,
    wsPrimary,
    branchFridayBills.length > 0 ? `Viernes ${branchLabel}`.slice(0, 31) : 'Pagos Viernes'
  );

  // Hoja 2: Resumen por Categoría del Viernes
  const wsCat = buildCategoryBreakdownSheet(
    branchFridayBills.length > 0 ? branchFridayBills : allFridayBills,
    `RESUMEN POR CATEGORÍA — VIERNES ${fridayDate}`
  );
  XLSX.utils.book_append_sheet(wb, wsCat, 'Resumen por Rubro');

  // Hoja 3: Consolidado de Ambas Sucursales (cuando hay registros en más de una sucursal o para visión completa)
  if (allFridayBills.length > branchFridayBills.length) {
    const allSheetData = buildBillsSheetRows(
      'PAGOS DEL VIERNES — AMBAS SUCURSALES',
      `El Refugio + Zakia • Viernes ${formatDateLong(fridayDate)} (${fridayDate})`,
      allFridayBills
    );
    const wsAll = XLSX.utils.aoa_to_sheet(allSheetData.rows);
    applyColumnWidths(wsAll, allSheetData.rows);
    formatCurrencyCells(wsAll, allSheetData.rows, [1, 9]);
    XLSX.utils.book_append_sheet(wb, wsAll, 'Consolidado Ambas');
  }

  const fileName = `Pagos_Viernes_${fridayDate}_${activeBranch === 'zakia' ? 'Zakia' : 'ElRefugio'}.xlsx`;
  XLSX.writeFile(wb, fileName);

  return { exported: true, count: primaryBills.length, fileName };
}

/**
 * Descarga un archivo Excel (.xlsx) general de TODOS los pagos de un Mes específico (YYYY-MM),
 * desglosado por cada Viernes del mes, por Sucursal, por Categoría y con el detalle completo.
 */
export function exportMonthlyPaymentsExcel(params: {
  yearMonth: string; // 'YYYY-MM'
  supplierBills: SupplierBill[];
  branchFilter?: 'all' | 'refugio' | 'zakia';
}): { exported: boolean; count: number; fileName: string } {
  const { yearMonth, supplierBills, branchFilter = 'all' } = params;

  const monthBills = supplierBills.filter((b) => {
    const matchesMonth = (b.dueDate || '').startsWith(yearMonth);
    if (!matchesMonth) return false;
    if (branchFilter === 'all') return true;
    return (b.branch || 'refugio') === branchFilter;
  });

  if (monthBills.length === 0) {
    return { exported: false, count: 0, fileName: '' };
  }

  const wb = XLSX.utils.book_new();
  const monthTitle = formatMonthTitle(yearMonth);
  const scopeLabel =
    branchFilter === 'all'
      ? 'Consolidado General (El Refugio + Zakia)'
      : `Sucursal ${formatBranchName(branchFilter)}`;

  // ------------------------------------------------------------------
  // HOJA 1: RESUMEN GENERAL DEL MES (Por Viernes + Por Método + Totales)
  // ------------------------------------------------------------------
  const totalMonth = monthBills.reduce((s, b) => s + (b.amount || 0), 0);
  const totalPaid = monthBills.filter((b) => b.status === 'pagado').reduce((s, b) => s + (b.amount || 0), 0);
  const totalPending = monthBills.filter((b) => b.status !== 'pagado').reduce((s, b) => s + (b.amount || 0), 0);
  const totalRefugio = monthBills
    .filter((b) => (b.branch || 'refugio') === 'refugio')
    .reduce((s, b) => s + (b.amount || 0), 0);
  const totalZakia = monthBills.filter((b) => b.branch === 'zakia').reduce((s, b) => s + (b.amount || 0), 0);

  // Agrupar por fecha de Viernes
  const fridayMap = new Map<
    string,
    { count: number; refugio: number; zakia: number; paid: number; pending: number; total: number }
  >();
  monthBills.forEach((b) => {
    const key = b.dueDate || 'Sin fecha';
    const amt = Number(b.amount || 0);
    const prev = fridayMap.get(key) || { count: 0, refugio: 0, zakia: 0, paid: 0, pending: 0, total: 0 };
    prev.count += 1;
    prev.total += amt;
    if (b.branch === 'zakia') prev.zakia += amt;
    else prev.refugio += amt;
    if (b.status === 'pagado') prev.paid += amt;
    else prev.pending += amt;
    fridayMap.set(key, prev);
  });

  const sortedFridays = Array.from(fridayMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  // Agrupar por método de pago
  const methodMap = new Map<string, { count: number; total: number }>();
  monthBills.forEach((b) => {
    const label =
      b.status === 'pagado'
        ? PAY_METHOD_LABELS[b.paidMethod || ''] || 'Pagado (Otro)'
        : 'Pendiente de Pago';
    const prev = methodMap.get(label) || { count: 0, total: 0 };
    prev.count += 1;
    prev.total += Number(b.amount || 0);
    methodMap.set(label, prev);
  });

  const summaryRows: any[][] = [
    [`PANADERÍA SANTA FÉ — REPORTE GENERAL MENSUAL DE PAGOS (${monthTitle.toUpperCase()})`],
    [`Alcance: ${scopeLabel} • Generado: ${new Date().toLocaleString('es-MX')}`],
    [],
    ['INDICADORES GENERALES DEL MES', 'Monto ($)', 'Cantidad / %'],
    ['Total Programado del Mes', totalMonth, `${monthBills.length} cuentas`],
    ['Total Ya Pagado', totalPaid, `${monthBills.filter((b) => b.status === 'pagado').length} liquidadas`],
    ['Total Pendiente por Pagar', totalPending, `${monthBills.filter((b) => b.status !== 'pagado').length} pendientes`],
    ['Sucursal El Refugio (Matriz)', totalRefugio, totalMonth > 0 ? `${((totalRefugio / totalMonth) * 100).toFixed(1)}%` : '0%'],
    ['Sucursal Zakia', totalZakia, totalMonth > 0 ? `${((totalZakia / totalMonth) * 100).toFixed(1)}%` : '0%'],
    [],
    ['DESGLOSE POR CADA VIERNES DEL MES'],
    ['Fecha Viernes', 'Descripción', 'Cuentas', 'El Refugio ($)', 'Zakia ($)', 'Ya Pagado ($)', 'Pendiente ($)', 'Total Viernes ($)']
  ];

  sortedFridays.forEach(([dateStr, stats], idx) => {
    summaryRows.push([
      dateStr,
      `Viernes ${idx + 1} (${formatDateLong(dateStr)})`,
      stats.count,
      stats.refugio,
      stats.zakia,
      stats.paid,
      stats.pending,
      stats.total
    ]);
  });

  summaryRows.push([
    'TOTAL MES',
    `${sortedFridays.length} viernes registrados`,
    monthBills.length,
    totalRefugio,
    totalZakia,
    totalPaid,
    totalPending,
    totalMonth
  ]);

  summaryRows.push([]);
  summaryRows.push(['DESGLOSE POR MÉTODO DE PAGO', 'Cuentas', 'Monto ($)']);
  Array.from(methodMap.entries()).forEach(([method, stats]) => {
    summaryRows.push([method, stats.count, stats.total]);
  });

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  applyColumnWidths(wsSummary, summaryRows, [24, 34, 14, 16, 16, 16, 16, 18]);
  formatCurrencyCells(wsSummary, summaryRows, [1, 2, 3, 4, 5, 6, 7]);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen Mensual');

  // ------------------------------------------------------------------
  // HOJA 2: DETALLE COMPLETO DE TODOS LOS PAGOS DEL MES
  // ------------------------------------------------------------------
  const detailData = buildBillsSheetRows(
    `DETALLE GENERAL DE PAGOS — ${monthTitle.toUpperCase()}`,
    scopeLabel,
    monthBills
  );
  const wsDetail = XLSX.utils.aoa_to_sheet(detailData.rows);
  applyColumnWidths(wsDetail, detailData.rows);
  formatCurrencyCells(wsDetail, detailData.rows, [1, 9]);
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Detalle General');

  // ------------------------------------------------------------------
  // HOJA 3: RESUMEN POR CATEGORÍA DEL MES
  // ------------------------------------------------------------------
  const wsCat = buildCategoryBreakdownSheet(
    monthBills,
    `GASTOS POR CATEGORÍA — ${monthTitle.toUpperCase()}`
  );
  XLSX.utils.book_append_sheet(wb, wsCat, 'Resumen por Categoría');

  // ------------------------------------------------------------------
  // HOJAS 4 & 5: POR SUCURSAL (SI HAY CONSOLIDADO)
  // ------------------------------------------------------------------
  if (branchFilter === 'all') {
    const refugioBills = monthBills.filter((b) => (b.branch || 'refugio') === 'refugio');
    if (refugioBills.length > 0) {
      const refData = buildBillsSheetRows(
        `PAGOS EL REFUGIO — ${monthTitle.toUpperCase()}`,
        'Sucursal Planta Matriz El Refugio',
        refugioBills
      );
      const wsRef = XLSX.utils.aoa_to_sheet(refData.rows);
      applyColumnWidths(wsRef, refData.rows);
      formatCurrencyCells(wsRef, refData.rows, [1, 9]);
      XLSX.utils.book_append_sheet(wb, wsRef, 'El Refugio');
    }

    const zakiaBills = monthBills.filter((b) => b.branch === 'zakia');
    if (zakiaBills.length > 0) {
      const zakData = buildBillsSheetRows(
        `PAGOS ZAKIA — ${monthTitle.toUpperCase()}`,
        'Sucursal Punto de Venta Zakia',
        zakiaBills
      );
      const wsZak = XLSX.utils.aoa_to_sheet(zakData.rows);
      applyColumnWidths(wsZak, zakData.rows);
      formatCurrencyCells(wsZak, zakData.rows, [1, 9]);
      XLSX.utils.book_append_sheet(wb, wsZak, 'Zakia');
    }
  }

  const suffix =
    branchFilter === 'all' ? 'General' : branchFilter === 'zakia' ? 'Zakia' : 'ElRefugio';
  const fileName = `Pagos_Mes_${yearMonth}_${suffix}.xlsx`;
  XLSX.writeFile(wb, fileName);

  return { exported: true, count: monthBills.length, fileName };
}
