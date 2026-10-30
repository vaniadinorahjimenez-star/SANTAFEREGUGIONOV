import { ShiftCutRecord, Settings } from '../types';
import { EscPosEncoder } from './thermalPrinter';

/**
 * Genera el paquete binario ESC/POS completo del Ticket de Corte de Caja / Turno para impresora térmica (58mm / 80mm)
 */
export function buildShiftCutEscPosBytes(cut: ShiftCutRecord, settings: Settings, width = 32): Uint8Array {
  const encoder = new EscPosEncoder();

  encoder
    .init()
    .openCashDrawer() // Abrir cajón de dinero al realizar el corte
    .align('center')
    .bold(true)
    .size('large')
    .line(settings.bakeryName || 'Panaderia Santa Fé el refugio')
    .size('normal')
    .bold(true)
    .line(settings.slogan || 'Pan calientito y tradicional.')
    .line(settings.address || '7:00 am a 10:00 pm')
    .line(settings.phone || '442 816 3291')
    .separator(width, '=')
    .bold(true)
    .size('large')
    .line('CORTE DE CAJA / TURNO')
    .size('normal')
    .bold(true)
    .separator(width, '=')
    .align('left')
    .twoColumns(`FOLIO: ${cut.folio}`, cut.time, width)
    .twoColumns(`FECHA: ${cut.date}`, `CAJA: 1`, width)
    .line(`CAJERO(A): ${cut.cashierName}`)
    .line(`TURNO: ${cut.shiftName}`)
    .separator(width, '=')
    .bold(true)
    .line('CRUCE DE BOLSITA (TENIA VS REAL):')
    .separator(width, '-')
    .twoColumns('VENTAS SISTEMA:', `$${cut.totalGrossSales}.00`, width)
    .twoColumns('PAGO CON TARJETA:', `$${cut.totalCardSales}.00${cut.isCardManualOverride ? ' *' : ''}`, width);

  if (cut.shift1CardDeduction && cut.shift1CardDeduction > 0) {
    const rawTerm = cut.rawCardTerminalTotal || (cut.totalCardSales + cut.shift1CardDeduction);
    encoder.line(` (Term $${rawTerm} - T1 $${cut.shift1CardDeduction} = $${cut.totalCardSales})`);
  }

  encoder
    .twoColumns('VENTAS EFECTIVO:', `+$${cut.totalCashSales}.00`, width)
    .twoColumns('(-) SALIDAS PAGADAS:', `-$${cut.totalOutflows}.00`, width)
    .twoColumns('(SE DEJAN EN CAJA):', `$${cut.nextShiftCash !== undefined ? cut.nextShiftCash : 1000}.00`, width)
    .separator(width, '-');

  const expectedBag = cut.expectedInBag !== undefined 
    ? cut.expectedInBag 
    : (cut.totalCashSales - cut.totalOutflows);
  const actualBag = cut.actualInBag !== undefined 
    ? cut.actualInBag 
    : (cut.actualCashInDrawer ?? cut.cashToDeliver ?? expectedBag);
  const bagDiff = cut.bagDifference !== undefined 
    ? cut.bagDifference 
    : (cut.difference || (actualBag - expectedBag));

  encoder
    .twoColumns('1. TENIA QUE PONERSE:', `$${expectedBag}.00`, width)
    .twoColumns('2. REALMENTE QUEDO:', `$${actualBag}.00`, width);

  if (bagDiff === 0) {
    encoder.twoColumns('3. CRUCE / DIFERENCIA:', 'CUADRADA ($0.00)', width);
  } else if (bagDiff > 0) {
    encoder.twoColumns('3. CRUCE / DIFERENCIA:', `+$${bagDiff}.00 (SOBRANTE)`, width);
  } else {
    encoder.twoColumns('3. CRUCE / DIFERENCIA:', `-$${Math.abs(bagDiff)}.00 (FALTANTE)`, width);
  }

  encoder
    .separator(width, '=')
    .bold(true)
    .size('large')
    .twoColumns('A ENTREGAR EN BOLSITA:', `$${actualBag}.00`, width)
    .size('normal')
    .bold(true)
    .line(`(Quedan $${cut.nextShiftCash !== undefined ? cut.nextShiftCash : 1000}.00 en caja de cambio)`)
    .separator(width, '=')
    .line('DESGLOSE DE LO VENDIDO:')
    .separator(width, '-');

  if (cut.totalBreadSales !== undefined || cut.totalNonBreadSales !== undefined) {
    encoder
      .twoColumns('VENTA DE PAN:', `$${cut.totalBreadSales || 0}.00 (${cut.breadPieces || 0} pz)`, width)
      .twoColumns('OTROS (NO PAN):', `$${cut.totalNonBreadSales || 0}.00 (${cut.nonBreadPieces || 0} art)`, width);

    if (cut.nonBreadItems && cut.nonBreadItems.length > 0) {
      encoder.line('DETALLE NO PAN (REGISTRADOS):');
      cut.nonBreadItems.forEach(item => {
        encoder.twoColumns(` • ${item.name} (${item.quantity} pz)`, `$${item.total}.00`, width);
      });
    }

    encoder.separator(width, '.');
  }

  encoder
    .twoColumns('TOTAL PIEZAS:', `${cut.totalPieces} pzs`, width)
    .twoColumns('TICKETS COBRADOS:', `${cut.ticketsCount}`, width)
    .separator(width, '-')
    .bold(true)
    .line('DETALLE DE SALIDAS / PAGOS:')
    .separator(width, '-');

  // Detalle de salidas desglosadas
  if (!cut.outflows || cut.outflows.length === 0) {
    encoder.line('  (Sin salidas registradas)');
  } else {
    cut.outflows.forEach((outflow, idx) => {
      const leftText = `${idx + 1}. ${outflow.concept}`;
      const amountText = `-$${outflow.amount}.00`;
      encoder.bold(true).twoColumns(leftText, amountText, width);
      
      const extraDetails: string[] = [];
      if (outflow.time) extraDetails.push(`Hora: ${outflow.time}`);
      if (outflow.recipient) extraDetails.push(`Recibió: ${outflow.recipient}`);
      if (outflow.notes) extraDetails.push(`Nota: ${outflow.notes}`);

      if (extraDetails.length > 0) {
        encoder.line(`   ${extraDetails.join(' | ').slice(0, width - 4)}`);
      }
    });
  }

  encoder
    .separator(width, '-')
    .bold(true)
    .twoColumns('TOTAL SALIDAS:', `-$${cut.totalOutflows}.00`, width);

  if (cut.nextShiftBillsBreakdown && Object.values(cut.nextShiftBillsBreakdown).some(v => v > 0)) {
    encoder.separator(width, '-').line('BILLETES CAMBIO EN CAJA:');
    Object.entries(cut.nextShiftBillsBreakdown)
      .filter(([_, count]) => (count || 0) > 0)
      .forEach(([denom, count]) => {
        encoder.twoColumns(`  ${count} x $${denom}`, `$${Number(denom) * count}.00`, width);
      });
  }

  if (cut.notes) {
    encoder.separator(width, '-');
    encoder.line(`NOTAS: ${cut.notes}`);
  }

  encoder
    .separator(width, '=')
    .feed(2)
    .align('center')
    .line('___________________________')
    .line('Firma del Cajero(a)')
    .feed(2)
    .line('___________________________')
    .line('Firma de Recibido (Admin)')
    .feed(1)
    .line(settings.ticketFooter || '¡Gracias por su preferencia!')
    .feed(3)
    .cut();

  return encoder.encode();
}

/**
 * Imprime directamente el ticket de corte en formato térmico (58mm/80mm) usando iframe aislado
 */
export function printShiftCutDirectToPrinter(cut: ShiftCutRecord, settings: Settings): boolean {
  try {
    const is80 = settings.ticketPaperWidth === '80mm';
    const bodyWidth = is80 ? '76mm' : '68mm';
    const baseFontSize = is80 ? '12px' : '11.5px';
    const titleFontSize = is80 ? '15px' : '14px';
    const subTitleFontSize = is80 ? '11px' : '10px';
    const totalFontSize = is80 ? '15px' : '14px';

    const outflowsHtml = (!cut.outflows || cut.outflows.length === 0)
      ? '<div style="font-size: 11px; padding: 2px 0;">(Sin salidas registradas)</div>'
      : cut.outflows.map((o, idx) => `
        <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 800; margin-bottom: 2px;">
          <span>${idx + 1}. ${o.concept}</span>
          <span style="font-weight: 900;">-$${o.amount}.00</span>
        </div>
        ${o.time || o.recipient ? `
          <div style="font-size: 9.5px; color: #333; padding-left: 8px;">
            ${[o.time ? `Hora: ${o.time}` : '', o.recipient ? `Recibió: ${o.recipient}` : ''].filter(Boolean).join(' | ')}
          </div>
        ` : ''}
      `).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Corte de Caja - ${cut.folio}</title>
        <style>
          @page {
            size: auto;
            margin: 0mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            margin: 0;
            padding: 1.5mm 1.5mm 4mm 1.5mm;
            width: ${bodyWidth};
            max-width: ${bodyWidth};
            font-family: 'Courier New', Courier, monospace, system-ui;
            font-size: ${baseFontSize};
            font-weight: 900;
            color: #000000;
            line-height: 1.25;
            background: #ffffff;
            overflow-x: hidden;
            word-break: break-word;
          }
          .center { text-align: center; }
          .bold { font-weight: 900; }
          .divider { border-top: 1.5px dashed #000; margin: 5px 0; }
          .double-divider { border-top: 2px solid #000; margin: 6px 0; }
          .row { display: flex; justify-content: space-between; margin-bottom: 2px; }
          .title { font-size: ${titleFontSize}; font-weight: 900; line-height: 1.2; }
          .subtitle { font-size: ${subTitleFontSize}; font-weight: 800; }
          .total-row { font-size: ${totalFontSize}; font-weight: 900; padding: 4px 0; }
        </style>
      </head>
      <body>
        <div class="center">
          <div class="title">${settings.bakeryName || 'Panaderia Santa Fé el refugio'}</div>
          <div class="subtitle">${settings.slogan || 'Pan calientito y tradicional.'}</div>
          <div class="subtitle">${settings.address || '7:00 am a 10:00 pm'}</div>
          <div class="subtitle">TEL: ${settings.phone || '442 816 3291'}</div>
        </div>

        <div class="double-divider"></div>

        <div class="center">
          <div style="font-size: 14px; font-weight: 900;">CORTE DE CAJA / TURNO</div>
        </div>

        <div class="divider"></div>

        <div class="row"><span>FOLIO: ${cut.folio}</span><span>${cut.time}</span></div>
        <div class="row"><span>FECHA: ${cut.date}</span><span>CAJA: 1</span></div>
        <div class="row"><span>CAJERO(A):</span><span>${cut.cashierName}</span></div>
        <div class="row"><span>TURNO:</span><span>${cut.shiftName}</span></div>

        <div class="double-divider"></div>
        <div style="font-size: 11px; font-weight: 900; text-transform: uppercase; text-align: center;">CALCULO DE BOLSITA / ENTREGA:</div>
        <div class="divider"></div>

        <div class="row"><span>VENTAS SISTEMA:</span><span>$${cut.totalGrossSales}.00</span></div>
        <div class="row"><span>PAGO CON TARJETA:</span><span>$${cut.totalCardSales}.00${cut.isCardManualOverride ? ' *' : ''}</span></div>
        <div class="row"><span>VENTAS EFECTIVO:</span><span>+$${cut.totalCashSales}.00</span></div>
        <div class="row"><span>(-) SALIDAS PAGADAS:</span><span>-$${cut.totalOutflows}.00</span></div>
        <div class="row" style="font-size: 10px;"><span>(SE DEJAN EN CAJA):</span><span>$${cut.nextShiftCash !== undefined ? cut.nextShiftCash : 1000}.00</span></div>

        <div class="divider"></div>
        <div class="row" style="font-weight: 900;">
          <span>TENIA QUE PONERSE EN BOLSITA:</span>
          <span>$${cut.expectedInBag !== undefined ? cut.expectedInBag : (cut.totalCashSales - cut.totalOutflows)}.00</span>
        </div>
        <div class="row" style="font-weight: 900; font-size: 12px;">
          <span>REALMENTE QUEDO (CONTADO):</span>
          <span>$${cut.actualInBag !== undefined ? cut.actualInBag : (cut.actualCashInDrawer ?? cut.cashToDeliver ?? (cut.totalCashSales - cut.totalOutflows))}.00</span>
        </div>

        ${(() => {
          const bagDiff = cut.bagDifference !== undefined ? cut.bagDifference : (cut.difference || 0);
          return `
            <div class="row" style="font-weight: 900; border-top: 1px dashed #000; padding-top: 3px; margin-top: 2px;">
              <span>DIFERENCIA EN BOLSITA:</span>
              <span>${bagDiff === 0 ? 'CUADRADA ($0.00)' : (bagDiff > 0 ? `+$${bagDiff}.00 (SOBRANTE)` : `-$${Math.abs(bagDiff)}.00 (FALTANTE)`)}</span>
            </div>
          `;
        })()}

        <div class="double-divider"></div>
        <div class="row total-row">
          <span>A ENTREGAR EN BOLSITA:</span>
          <span>$${cut.actualInBag !== undefined ? cut.actualInBag : (cut.cashToDeliver !== undefined ? cut.cashToDeliver : Math.max(0, cut.expectedCashInDrawer - (cut.nextShiftCash || 0)))}.00</span>
        </div>
        <div style="font-size: 9.5px; text-align: center; margin-top: 2px;">
          (Se quedan $${cut.nextShiftCash !== undefined ? cut.nextShiftCash : 1000}.00 en caja para cambio sig. turno)
        </div>

        <div class="double-divider"></div>
        <div style="font-size: 11px; font-weight: 900; text-transform: uppercase;">DESGLOSE DE LO VENDIDO:</div>
        <div class="divider"></div>

        <div class="row"><span>🍞 Venta de Pan (${cut.breadPieces || 0} pz):</span><span>$${cut.totalBreadSales !== undefined ? cut.totalBreadSales : cut.totalGrossSales}.00</span></div>
        <div class="row"><span>🥛 Otros / No Pan (${cut.nonBreadPieces || 0} art):</span><span>$${cut.totalNonBreadSales || 0}.00</span></div>

        ${cut.nonBreadItems && cut.nonBreadItems.length > 0 ? `
          <div style="border-top: 1px dotted #000; padding-top: 2px; margin: 3px 0; font-size: 9.5px;">
            <div style="font-weight: 900;">DETALLE NO PAN (REGISTRADOS):</div>
            ${cut.nonBreadItems.map(item => `
              <div class="row" style="font-size: 9.5px; padding-left: 4px;">
                <span>• ${item.name} (${item.quantity} pz):</span>
                <span>$${item.total}.00</span>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div class="row" style="border-top: 1px dotted #000; padding-top: 2px;"><span>TOTAL PIEZAS:</span><span>${cut.totalPieces} pzs</span></div>
        <div class="row"><span>TICKETS COBRADOS:</span><span>${cut.ticketsCount}</span></div>

        <div class="double-divider"></div>
        <div style="font-size: 11px; font-weight: 900; text-transform: uppercase;">DETALLE DE SALIDAS / PAGOS:</div>
        <div class="divider"></div>

        ${outflowsHtml}

        <div class="divider"></div>
        <div class="row" style="font-weight: 900;"><span>TOTAL SALIDAS:</span><span>-$${cut.totalOutflows}.00</span></div>

        ${cut.nextShiftBillsBreakdown && Object.values(cut.nextShiftBillsBreakdown).some(v => Number(v) > 0) ? `
          <div class="divider"></div>
          <div style="font-size: 10px; font-weight: 900;">BILLETES CAMBIO EN CAJA:</div>
          ${Object.entries(cut.nextShiftBillsBreakdown)
            .filter(([_, count]) => Number(count) > 0)
            .map(([denom, count]) => `
              <div class="row" style="font-size: 9.5px;">
                <span>• ${count} x $${denom}:</span>
                <span>$${Number(denom) * Number(count)}.00</span>
              </div>
            `).join('')}
        ` : ''}

        ${cut.notes ? `<div style="font-size: 10px; margin: 4px 0;">NOTA: ${cut.notes}</div>` : ''}

        <div style="margin-top: 25px; text-align: center;">
          <div>___________________________</div>
          <div style="font-size: 10px;">Firma del Cajero(a)</div>
        </div>

        <div style="margin-top: 20px; text-align: center;">
          <div>___________________________</div>
          <div style="font-size: 10px;">Firma de Recibido (Admin)</div>
        </div>

        <div class="divider"></div>
        <div class="center" style="font-size: 10px;">
          ${settings.ticketFooter || '¡Gracias por su preferencia!'}
        </div>
      </body>
      </html>
    `;

    const iframeId = 'shift-cut-print-direct-frame';
    let iframe = document.getElementById(iframeId) as HTMLIFrameElement;
    if (iframe) {
      iframe.remove();
    }

    iframe = document.createElement('iframe');
    iframe.id = iframeId;
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    iframe.style.zIndex = '-9999';

    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(htmlContent);
      doc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (printErr) {
          console.warn('Iframe print failed, falling back to window.print():', printErr);
          window.print();
        }
      }, 150);
      return true;
    } else {
      window.print();
      return true;
    }
  } catch (e) {
    console.error('Error in printShiftCutDirectToPrinter:', e);
    window.print();
    return false;
  }
}
