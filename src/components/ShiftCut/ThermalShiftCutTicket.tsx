import React, { useState } from 'react';
import { ShiftCutRecord, Settings } from '../../types';
import { 
  Printer, 
  X, 
  MessageCircle, 
  DollarSign, 
  Clock, 
  User, 
  Calendar, 
  Receipt, 
  TrendingDown, 
  CheckCircle2, 
  Building2, 
  Eye, 
  Download,
  AlertTriangle,
  FileSpreadsheet
} from 'lucide-react';
import { buildShiftCutEscPosBytes, printShiftCutDirectToPrinter } from '../../utils/thermalShiftCutPrinter';
import { generateShiftCutWhatsAppMessage } from '../../utils/storage';
import { playBeep, playCashSound } from '../../utils/audio';

interface ThermalShiftCutTicketProps {
  cut: ShiftCutRecord;
  settings: Settings;
  onClose: () => void;
  onPrintDirect?: (cut: ShiftCutRecord) => void;
}

export const ThermalShiftCutTicket: React.FC<ThermalShiftCutTicketProps> = ({
  cut,
  settings,
  onClose,
  onPrintDirect
}) => {
  const [printSuccessMessage, setPrintSuccessMessage] = useState<string | null>(null);

  // Trigger Direct Thermal Shift Cut Print
  const handleBrowserPrint = () => {
    playCashSound();
    if (onPrintDirect) {
      onPrintDirect(cut);
    } else {
      printShiftCutDirectToPrinter(cut, settings);
    }
    setPrintSuccessMessage('¡Ticket de corte enviado a tu impresora térmica!');
    setTimeout(() => setPrintSuccessMessage(null), 3000);
  };

  // WhatsApp Share
  const handleWhatsAppShare = () => {
    playBeep(600, 'sine', 0.04);
    const encoded = generateShiftCutWhatsAppMessage(cut, settings);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  };

  return (
    <div
      id="shift-cut-ticket-modal-overlay"
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
    >
      <div className="flex flex-col md:flex-row items-stretch max-w-2xl w-full max-h-[95vh] bg-white rounded-3xl shadow-2xl overflow-hidden border-2 border-amber-300 animate-in fade-in zoom-in-95 duration-200">
        
        {/* LEFT / TOP CONTROL PANEL */}
        <div className="w-full md:w-80 bg-[#2D3142] text-white p-4 sm:p-5 flex flex-col justify-between shrink-0 no-print border-b md:border-b-0 md:border-r border-slate-700 overflow-y-auto max-h-[45vh] md:max-h-none">
          <div className="space-y-4">
            {/* Header / Store Badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-bold shadow-md">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-white leading-tight">Ticket de Corte</h3>
                  <span className="text-[10px] text-amber-300 font-bold uppercase tracking-wider">
                    {cut.folio}
                  </span>
                </div>
              </div>

              <button
                id="close-shift-cut-preview-btn"
                type="button"
                onClick={onClose}
                className="text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 p-2 rounded-xl transition-colors cursor-pointer"
                title="Cerrar Previo"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Summary Cards */}
            <div className="space-y-2">
              <div className="bg-black/40 rounded-2xl p-3 border border-white/10 space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-slate-300 font-bold">1. Tenía que Haber en Bolsita:</span>
                  <span className="text-base font-black text-amber-400 font-mono">
                    ${cut.expectedInBag !== undefined ? cut.expectedInBag : (cut.totalCashSales - cut.totalOutflows)}.00
                  </span>
                </div>
                
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-emerald-300 font-bold">2. Realmente Quedó Contado:</span>
                  <span className="text-lg font-black text-emerald-400 font-mono">
                    ${cut.actualInBag !== undefined ? cut.actualInBag : (cut.actualCashInDrawer ?? cut.cashToDeliver ?? (cut.totalCashSales - cut.totalOutflows))}.00
                  </span>
                </div>

                <div className="flex items-baseline justify-between text-xs text-indigo-300">
                  <span>En Caja Quedan (Cambio):</span>
                  <span className="font-mono font-bold">${cut.nextShiftCash !== undefined ? cut.nextShiftCash : 1000}.00</span>
                </div>

                {(() => {
                  const bagDiff = cut.bagDifference !== undefined ? cut.bagDifference : (cut.difference || 0);
                  return (
                    <div className={`flex items-baseline justify-between text-xs font-black pt-1 border-t border-white/10 ${
                      bagDiff === 0 ? 'text-emerald-300' : bagDiff > 0 ? 'text-teal-300' : 'text-rose-300'
                    }`}>
                      <span>Diferencia en Bolsita:</span>
                      <span className="font-mono">
                        {bagDiff === 0 
                          ? '✅ $0.00 (Cuadrada)' 
                          : bagDiff > 0 
                            ? `🟢 +$${bagDiff}.00 (Sobrante)` 
                            : `🔴 -$${Math.abs(bagDiff)}.00 (Faltante)`}
                      </span>
                    </div>
                  );
                })()}

                <div className="flex items-baseline justify-between pt-1 border-t border-white/10">
                  <span className="text-xs text-emerald-300 font-black uppercase tracking-wider">A Entregar en Bolsita:</span>
                  <span className="text-2xl font-black text-emerald-400 font-mono">
                    ${cut.actualInBag !== undefined ? cut.actualInBag : (cut.cashToDeliver !== undefined ? cut.cashToDeliver : Math.max(0, cut.expectedCashInDrawer - (cut.nextShiftCash || 0)))}.00
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-800/80 p-2.5 rounded-xl border border-white/10">
                  <span className="text-[10px] text-slate-400 block font-bold">Ventas Efectivo:</span>
                  <span className="text-sm font-black text-emerald-400 font-mono">+${cut.totalCashSales}.00</span>
                </div>
                <div className="bg-slate-800/80 p-2.5 rounded-xl border border-white/10">
                  <span className="text-[10px] text-slate-400 block font-bold">Salidas / Gastos:</span>
                  <span className="text-sm font-black text-rose-400 font-mono">-${cut.totalOutflows}.00</span>
                </div>
              </div>
            </div>

            {/* Outflows Mini-List info */}
            <div className="bg-slate-800/60 rounded-2xl p-3 border border-white/10 space-y-1 text-xs">
              <div className="text-[10.5px] font-black text-amber-300 uppercase tracking-wider flex items-center justify-between">
                <span>Salidas Registradas:</span>
                <span>{cut.outflows?.length || 0}</span>
              </div>
              {(!cut.outflows || cut.outflows.length === 0) ? (
                <div className="text-slate-400 text-[11px] italic py-1">Sin salidas en este turno</div>
              ) : (
                <div className="max-h-28 overflow-y-auto space-y-1 text-[11px] pt-1">
                  {cut.outflows.map((o) => (
                    <div key={o.id} className="flex justify-between items-center text-slate-300 border-b border-white/5 pb-0.5">
                      <span className="truncate pr-1">• {o.concept}</span>
                      <span className="text-rose-400 font-bold shrink-0">-${o.amount}.00</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Non-Bread Registered Products Mini-Card */}
            {cut.nonBreadItems && cut.nonBreadItems.length > 0 && (
              <div className="bg-slate-800/60 rounded-2xl p-3 border border-sky-500/30 space-y-1 text-xs">
                <div className="text-[10.5px] font-black text-sky-300 uppercase tracking-wider flex items-center justify-between">
                  <span>Productos No Pan (Vendidos):</span>
                  <span>${cut.totalNonBreadSales || 0}.00</span>
                </div>
                <div className="max-h-28 overflow-y-auto space-y-1 text-[11px] pt-1">
                  {cut.nonBreadItems.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center text-slate-300 border-b border-white/5 pb-0.5">
                      <span className="truncate pr-1">• {item.name} ({item.quantity} pz)</span>
                      <span className="text-sky-400 font-bold shrink-0 font-mono">${item.total}.00</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {printSuccessMessage && (
              <div className="bg-emerald-600 text-white text-xs font-bold p-2.5 rounded-xl flex items-center gap-1.5 shadow-sm animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{printSuccessMessage}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-4">
            <button
              id="print-shift-cut-modal-btn"
              type="button"
              onClick={handleBrowserPrint}
              className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-[#D95D39] to-[#BF4C2A] hover:from-[#BF4C2A] hover:to-[#9E3B1C] text-white font-black py-3.5 px-4 rounded-2xl shadow-xl hover:shadow-2xl transition-all active:scale-98 text-base cursor-pointer border border-[#BF4C2A] ring-2 ring-white/30"
              title="Imprimir ticket térmico en tu impresora"
            >
              <Printer className="w-5 h-5 shrink-0" />
              <span>IMPRIMIR TICKET CORTE 🖨️</span>
            </button>

            <button
              id="whatsapp-shift-cut-modal-btn"
              type="button"
              onClick={handleWhatsAppShare}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 px-4 rounded-xl text-xs transition-colors cursor-pointer text-center flex items-center justify-center gap-1.5 border border-emerald-500 shadow-sm"
              title="Enviar resumen por WhatsApp"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Compartir por WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white font-black py-2 px-4 rounded-xl text-xs transition-colors cursor-pointer text-center flex items-center justify-center gap-1.5 border border-slate-500"
            >
              Cerrar Previo
            </button>
          </div>
        </div>

        {/* RIGHT / MAIN PREVIEW PANEL (Visual Thermal Receipt) */}
        <div className="flex-1 bg-slate-200/80 p-3 sm:p-6 overflow-y-auto max-h-[50vh] md:max-h-[95vh] flex justify-center items-start">
          <div
            id="printable-shift-cut-ticket"
            className="w-full max-w-[340px] bg-white p-4 shadow-md border-2 border-black font-mono text-[12px] font-black text-black leading-tight select-none my-auto"
            style={{ fontWeight: 900, color: '#000000' }}
          >
            {/* Store Header */}
            <div className="text-center space-y-0.5 pb-2.5 border-b-2 border-dashed border-black">
              <div className="text-sm sm:text-base font-black tracking-wider text-black leading-tight">
                {settings.bakeryName || 'Panaderia Santa Fé el refugio'}
              </div>
              <div className="text-[11px] font-black text-black leading-tight">
                {settings.slogan || 'Pan calientito y tradicional.'}
              </div>
              <div className="text-[10.5px] font-black text-black leading-tight mt-0.5">
                {settings.address || '7:00 am a 10:00 pm'}
              </div>
              <div className="text-[11px] font-black text-black leading-tight">
                {settings.phone || '442 816 3291'}
              </div>
            </div>

            {/* Title & Folio */}
            <div className="py-2 text-center border-b-2 border-dashed border-black space-y-0.5">
              <div className="text-[13px] font-black tracking-wider uppercase">
                CORTE DE CAJA / TURNO
              </div>
              <div className="text-[11px] font-black">
                FOLIO: {cut.folio}
              </div>
            </div>

            {/* Metadata (Date, Time, Cashier, Shift) */}
            <div className="py-2 border-b-2 border-dashed border-black text-[11px] font-black space-y-0.5">
              <div className="flex justify-between">
                <span>FECHA: {cut.date}</span>
                <span>HORA: {cut.time}</span>
              </div>
              <div className="flex justify-between">
                <span>CAJERO(A):</span>
                <span className="truncate max-w-[150px]">{cut.cashierName}</span>
              </div>
              <div className="flex justify-between">
                <span>TURNO:</span>
                <span className="truncate max-w-[160px]">{cut.shiftName}</span>
              </div>
            </div>

            {/* 1. CÁLCULO DE LA BOLSITA CONFORME A LAS VENTAS (ARRIBA) */}
            <div className="py-2 border-b-2 border-dashed border-black text-[11px] font-black space-y-1">
              <div className="text-[11px] uppercase tracking-wide border-b-2 border-black pb-0.5 text-center font-black">
                CRUCE DE BOLSITA: TENIA QUE PONERSE VS REALMENTE QUEDO
              </div>
              
              <div className="flex justify-between pt-0.5">
                <span>TOTAL VENTAS SISTEMA:</span>
                <span>${cut.totalGrossSales}.00</span>
              </div>
              <div className="flex justify-between">
                <span>PAGO CON TARJETA:</span>
                <span>${cut.totalCardSales}.00{cut.isCardManualOverride ? ' *' : ''}</span>
              </div>
              {cut.shift1CardDeduction !== undefined && cut.shift1CardDeduction > 0 && (
                <div className="text-[9.5px] text-black/80 flex justify-between pl-2 italic">
                  <span>↳ Terminal ${cut.rawCardTerminalTotal || (cut.totalCardSales + cut.shift1CardDeduction)} − T1 ${cut.shift1CardDeduction}:</span>
                  <span className="font-bold">Neto T2: ${cut.totalCardSales}.00</span>
                </div>
              )}
              <div className="flex justify-between text-black">
                <span>VENTAS EN EFECTIVO:</span>
                <span>+${cut.totalCashSales}.00</span>
              </div>
              <div className="flex justify-between">
                <span>(-) SALIDAS PAGADAS:</span>
                <span>-${cut.totalOutflows}.00</span>
              </div>
              <div className="flex justify-between text-black/80 text-[10.5px]">
                <span>(SE DEJAN EN CAJA CAMBIO):</span>
                <span>${cut.nextShiftCash !== undefined ? cut.nextShiftCash : 1000}.00</span>
              </div>

              {/* SECCIÓN DESTACADA: CUADRE DE LA BOLSITA */}
              <div className="mt-1.5 pt-1.5 border-t-2 border-black space-y-1 bg-black/5 p-1.5 rounded">
                <div className="flex justify-between text-[11px]">
                  <span>1. TENIA QUE PONERSE EN BOLSITA:</span>
                  <span className="text-[12px] font-black">
                    ${cut.expectedInBag !== undefined ? cut.expectedInBag : (cut.totalCashSales - cut.totalOutflows)}.00
                  </span>
                </div>

                <div className="flex justify-between text-[11.5px]">
                  <span>2. REALMENTE QUEDO (CONTADO):</span>
                  <span className="text-[13px] font-black underline">
                    ${cut.actualInBag !== undefined ? cut.actualInBag : (cut.actualCashInDrawer ?? cut.cashToDeliver ?? (cut.totalCashSales - cut.totalOutflows))}.00
                  </span>
                </div>

                {(() => {
                  const bagDiff = cut.bagDifference !== undefined ? cut.bagDifference : (cut.difference || 0);
                  return (
                    <div className="flex justify-between items-center text-[12px] pt-1 border-t border-black font-black">
                      <span>3. CRUCE / DIFERENCIA:</span>
                      <span className="text-[12.5px]">
                        {bagDiff === 0 
                          ? 'CUADRADA ($0.00)' 
                          : bagDiff > 0 
                            ? `+$${bagDiff}.00 (SOBRANTE)` 
                            : `-$${Math.abs(bagDiff)}.00 (FALTANTE)`}
                      </span>
                    </div>
                  );
                })()}
              </div>

              <div className="text-[9.5px] italic text-center pt-0.5 text-black/80">
                (En el cajón se quedan ${cut.nextShiftCash !== undefined ? cut.nextShiftCash : 1000}.00 para cambio)
              </div>
            </div>

            {/* 2. HASTA ABAJO: DESGLOSE DE LO VENDIDO */}
            <div className="py-2 border-b-2 border-dashed border-black text-[11px] font-black space-y-1">
              <div className="text-[11px] uppercase tracking-wide border-b border-black pb-0.5">
                DESGLOSE DE LO VENDIDO:
              </div>

              <div className="flex justify-between">
                <span>🍞 VENTA DE PAN ({cut.breadPieces || 0} pzs):</span>
                <span>${cut.totalBreadSales !== undefined ? cut.totalBreadSales : cut.totalGrossSales}.00</span>
              </div>
              <div className="flex justify-between">
                <span>🥛 NO PAN / ABARROTES ({cut.nonBreadPieces || 0} arts):</span>
                <span>${cut.totalNonBreadSales || 0}.00</span>
              </div>

              {cut.nonBreadItems && cut.nonBreadItems.length > 0 && (
                <div className="mt-1 pt-1 border-t border-dashed border-black/60 space-y-0.5 bg-black/5 p-1 rounded">
                  <div className="text-[9.5px] uppercase font-black tracking-wider text-black">
                    DETALLE ARTÍCULOS NO PAN:
                  </div>
                  {cut.nonBreadItems.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-baseline text-[10px] pl-1 font-bold">
                      <span className="truncate pr-1">• {item.name} ({item.quantity} pz):</span>
                      <span className="font-mono font-black">${item.total}.00</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between pt-1 border-t border-dotted border-black">
                <span>TOTAL PIEZAS VENDIDAS:</span>
                <span>{cut.totalPieces} pzs</span>
              </div>
              <div className="flex justify-between">
                <span>TOTAL TICKETS COBRADOS:</span>
                <span>{cut.ticketsCount} tickets</span>
              </div>
            </div>

            {/* 3. HASTA ABAJO: DETALLE DE SALIDAS */}
            <div className="py-2 border-b-2 border-dashed border-black text-[11px] font-black space-y-1">
              <div className="text-[11px] uppercase tracking-wide border-b border-black pb-0.5 flex justify-between">
                <span>DETALLE DE SALIDAS / PAGOS:</span>
                <span>{cut.outflows?.length || 0}</span>
              </div>

              {(!cut.outflows || cut.outflows.length === 0) ? (
                <div className="text-[10px] italic py-0.5 text-center">
                  (Sin salidas de dinero registradas en este turno)
                </div>
              ) : (
                cut.outflows.map((outflow, idx) => (
                  <div key={outflow.id || idx} className="space-y-0.5 py-0.5 border-b border-dashed border-black/40 last:border-none">
                    <div className="flex justify-between items-baseline text-[11px]">
                      <span className="truncate pr-1">
                        {idx + 1}. {outflow.concept}
                      </span>
                      <span className="font-black">-${outflow.amount}.00</span>
                    </div>
                    <div className="text-[9.5px] pl-2 text-black/80 flex flex-wrap gap-x-2">
                      {outflow.time && <span>🕒 {outflow.time}</span>}
                      {outflow.recipient && <span>👤 {outflow.recipient}</span>}
                      {outflow.notes && <span>📝 {outflow.notes}</span>}
                    </div>
                  </div>
                ))
              )}

              <div className="flex justify-between text-[11.5px] pt-1 border-t border-black font-black">
                <span>TOTAL SALIDAS REGISTRADAS:</span>
                <span>-${cut.totalOutflows}.00</span>
              </div>

              {cut.nextShiftBillsBreakdown && Object.values(cut.nextShiftBillsBreakdown).some(v => Number(v) > 0) && (
                <div className="pt-1 mt-1 border-t border-dotted border-black/40 text-[9.5px]">
                  <span className="block font-black uppercase text-[9px]">BILLETES CAMBIO EN CAJA:</span>
                  <div className="grid grid-cols-2 gap-x-2">
                    {Object.entries(cut.nextShiftBillsBreakdown)
                      .filter(([_, count]) => Number(count) > 0)
                      .map(([denom, count]) => (
                        <div key={denom} className="flex justify-between">
                          <span>• {count} x ${denom}:</span>
                          <span>${Number(denom) * Number(count)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Notes if any */}
            {cut.notes && (
              <div className="py-1.5 border-b-2 border-dashed border-black text-[10.5px] font-black">
                <span className="block underline">NOTAS / OBSERVACIONES:</span>
                <p className="mt-0.5">{cut.notes}</p>
              </div>
            )}

            {/* Signatures */}
            <div className="pt-4 pb-2 text-center text-[10px] font-black space-y-5">
              <div>
                <div className="border-t border-black w-44 mx-auto pt-1">
                  Firma del Cajero(a)
                </div>
              </div>
              <div>
                <div className="border-t border-black w-44 mx-auto pt-1">
                  Firma de Recibido (Admin)
                </div>
              </div>
            </div>

            {/* Footer Message & Barcode */}
            <div className="pt-2 text-center space-y-1 font-black">
              <div className="text-[10px] font-black">
                {settings.ticketFooter || '¡Gracias por su preferencia! Vuelva pronto.'}
              </div>
              <div className="pt-1 flex flex-col items-center justify-center font-black">
                <div className="font-mono text-[9px] font-black tracking-widest text-black select-none flex space-x-0.5 items-center justify-center py-0.5">
                  ||| | |||| | || ||||| | ||| || |||| | |||
                </div>
                <span className="text-[9px] font-black text-black">{cut.folio}</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};
