import { SaleTicket, Settings, BakeryOrder } from '../types';

/**
 * Generador de Comandos ESC/POS estándar para impresoras térmicas de 58mm y 80mm
 */
export class EscPosEncoder {
  private buffer: number[] = [];

  // Inicializar impresora (ESC @)
  init(): this {
    this.buffer.push(0x1b, 0x40);
    return this;
  }

  // Alineación: 0 = Izquierda, 1 = Centro, 2 = Derecha (ESC a n)
  align(alignment: 'left' | 'center' | 'right'): this {
    const val = alignment === 'center' ? 1 : alignment === 'right' ? 2 : 0;
    this.buffer.push(0x1b, 0x61, val);
    return this;
  }

  // Negrita: true / false (ESC E n)
  bold(enable: boolean): this {
    this.buffer.push(0x1b, 0x45, enable ? 1 : 0);
    return this;
  }

  // Tamaño de texto: 0 = Normal, 1 = Doble Alto, 2 = Doble Ancho, 3 = Doble Ambos (GS ! n)
  size(mode: 'normal' | 'large' | 'title'): this {
    let val = 0x00;
    if (mode === 'large') val = 0x11; // 2x width, 2x height
    if (mode === 'title') val = 0x22; // 3x width, 3x height
    this.buffer.push(0x1d, 0x21, val);
    return this;
  }

  // Enviar texto UTF-8 o ASCII
  text(str: string): this {
    // Normalizar caracteres especiales comunes en español
    const normalized = str
      .replace(/á/g, 'a')
      .replace(/é/g, 'e')
      .replace(/í/g, 'i')
      .replace(/ó/g, 'o')
      .replace(/ú/g, 'u')
      .replace(/Á/g, 'A')
      .replace(/É/g, 'E')
      .replace(/Í/g, 'I')
      .replace(/Ó/g, 'O')
      .replace(/Ú/g, 'U')
      .replace(/ñ/g, 'n')
      .replace(/Ñ/g, 'N')
      .replace(/ü/g, 'u')
      .replace(/Ü/g, 'U');

    for (let i = 0; i < normalized.length; i++) {
      const code = normalized.charCodeAt(i);
      this.buffer.push(code < 128 ? code : 63); // Fallback a '?'
    }
    return this;
  }

  // Línea de texto con salto
  line(str: string = ''): this {
    this.text(str);
    this.buffer.push(0x0a); // LF
    return this;
  }

  // Dos columnas (izquierda y derecha) para 32 caracteres (58mm) o 42 caracteres (80mm)
  twoColumns(left: string, right: string, width: number = 32): this {
    const totalLen = left.length + right.length;
    if (totalLen >= width) {
      const available = width - right.length - 1;
      const truncatedLeft = left.slice(0, Math.max(1, available));
      const spaces = ' '.repeat(Math.max(1, width - truncatedLeft.length - right.length));
      this.line(truncatedLeft + spaces + right);
    } else {
      const spaces = ' '.repeat(width - totalLen);
      this.line(left + spaces + right);
    }
    return this;
  }

  // Línea divisoria
  separator(width: number = 32, char: string = '-'): this {
    this.line(char.repeat(width));
    return this;
  }

  // Alimentar papel n líneas (ESC d n)
  feed(lines: number = 3): this {
    this.buffer.push(0x1b, 0x64, lines);
    return this;
  }

  // Cortar papel (GS V 66 n)
  cut(): this {
    this.buffer.push(0x1d, 0x56, 0x42, 0x00);
    return this;
  }

  // Pulso para abrir cajón de dinero (ESC p m t1 t2)
  openCashDrawer(): this {
    this.buffer.push(0x1b, 0x70, 0x00, 0x19, 0xfa);
    return this;
  }

  // Obtener Uint8Array final
  encode(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

/**
 * Genera el paquete binario ESC/POS completo del Ticket para la Panadería
 */
export function buildTicketEscPosBytes(
  ticket: SaleTicket,
  settings: Settings,
  customWidth?: number
): Uint8Array {
  const width = customWidth || (settings.ticketPaperWidth === '80mm' ? 42 : 32);
  const encoder = new EscPosEncoder();

  encoder
    .init()
    .openCashDrawer() // Abrir cajón si está conectado a la impresora
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
    .align('left')
    .bold(true)
    .twoColumns(`FOLIO: ${ticket.folio}`, ticket.time, width)
    .twoColumns(`FECHA: ${ticket.date}`, `CAJA: 1`, width);

  if (ticket.customerName) {
    encoder.line(`CLIENTE: ${ticket.customerName}`);
  }
  if (ticket.customerPhone) {
    encoder.line(`TEL: ${ticket.customerPhone}`);
  }

  encoder
    .separator(width, '-')
    .bold(true)
    .twoColumns('CANT x PRECIO', 'IMPORTE', width)
    .separator(width, '-');

  // Detalle de productos en negrita
  ticket.items.forEach((item) => {
    const qtyPrice = `${item.quantity}x $${item.price.toFixed(item.price % 1 !== 0 ? 2 : 0)}`;
    const totalStr = `$${item.total.toFixed(2)}`;
    encoder.bold(true).twoColumns(qtyPrice, totalStr, width);
    encoder.bold(true).line(`  ${item.name.slice(0, width - 4)}`);
  });

  encoder.separator(width, '-');

  // Totales
  encoder.bold(true).twoColumns('SUBTOTAL:', `$${ticket.subtotal.toFixed(2)}`, width);

  if (ticket.discount > 0) {
    const discLabel = ticket.pointsRedeemed && ticket.pointsRedeemed > 0 ? 'DESCUENTO PUNTOS:' : 'DESCUENTO (10% ESP):';
    encoder.bold(true).twoColumns(discLabel, `-$${ticket.discount.toFixed(2)}`, width);
  }

  encoder
    .bold(true)
    .size('large')
    .twoColumns('TOTAL:', `$${ticket.total.toFixed(2)}`, width)
    .size('normal')
    .bold(true);

  // Pago y cambio
  const isCard = ticket.paymentMethod === 'tarjeta';
  const termName = ticket.cardTerminal === 'mercadopago' ? 'MERCADO PAGO POINT' : (ticket.cardTerminal === 'clip' ? 'CLIP WI-FI' : (ticket.cardTerminal === 'zettle' ? 'PAYPAL ZETTLE' : (isCard ? 'TARJETA DEBITO/CRED' : 'EFECTIVO')));
  encoder.bold(true).twoColumns('FORMA DE PAGO:', termName, width);

  if (isCard) {
    if (ticket.cardTerminal === 'mercadopago') {
      encoder.bold(true).twoColumns('TERMINAL:', 'MERCADO PAGO POINT', width);
    } else if (ticket.cardTerminal === 'clip') {
      encoder.bold(true).twoColumns('TERMINAL:', 'CLIP WI-FI', width);
    } else if (ticket.cardTerminal === 'zettle') {
      encoder.bold(true).twoColumns('TERMINAL:', 'PAYPAL ZETTLE (BT)', width);
    }
    if (ticket.cardAuthCode) {
      encoder.bold(true).twoColumns('AUTORIZACION:', ticket.cardAuthCode, width);
    }
    if (ticket.cardLast4) {
      encoder.bold(true).twoColumns('TARJETA:', `**** **** **** ${ticket.cardLast4}`, width);
    }
    encoder.bold(true).twoColumns('IMPORTE CARGADO:', `$${ticket.total.toFixed(2)}`, width);
    encoder.bold(true).align('center').line('OPERACION APROBADA EN LINEA').align('left');
  } else if (ticket.paymentMethod === 'efectivo' && ticket.amountPaid > 0) {
    encoder.bold(true).twoColumns('PAGO CON:', `$${ticket.amountPaid.toFixed(2)}`, width);
    encoder.bold(true).twoColumns('CAMBIO:', `$${ticket.change.toFixed(2)}`, width);
  }

  // Puntos de lealtad
  encoder
    .separator(width, '-')
    .align('center')
    .bold(true)
    .line('PROGRAMA DE LEALTAD ⭐')
    .line(`Gano en esta compra: +${ticket.pointsEarned} Pts ($${ticket.pointsEarned} pesos)`)
    .line('($20 pesos de compra = $1 peso de descuento)')
    .align('left');

  // Pie de ticket
  encoder
    .separator(width, '=')
    .align('center')
    .bold(true)
    .line(settings.ticketFooter || '¡Gracias por su compra! Vuelva pronto.')
    .feed(3)
    .cut();

  return encoder.encode();
}

/**
 * 1. Conexión Real vía Web Bluetooth API (Impresoras Térmicas Bluetooth 58mm / 80mm)
 * Compatible con Chrome en Android, Windows, Mac, Linux y navegadores con soporte Web Bluetooth
 */
export async function printViaBluetooth(
  ticket: SaleTicket,
  settings: Settings,
  onStatus?: (status: string) => void
): Promise<{ success: boolean; message: string }> {
  try {
    const nav = navigator as any;
    if (!nav.bluetooth) {
      throw new Error(
        'Web Bluetooth no está disponible en este navegador. Utiliza Google Chrome en Android, Windows o Mac.'
      );
    }

    onStatus?.('Buscando impresora Bluetooth...');

    // Solicitar dispositivo Bluetooth con servicios comunes de impresión POS
    const device = await nav.bluetooth.requestDevice({
      filters: [
        { services: ['000018f0-0000-1000-8000-00805f9b34fb'] }, // Standard POS Thermal Printer
        { services: ['e7810a71-73ae-499d-8c15-faa9aef0c3f2'] }, // POS-58 / POS-80
        { services: ['49535343-fe7d-4ae5-8fa9-9fafd205e455'] }, // ISSC Serial
        { services: ['0000ff00-0000-1000-8000-00805f9b34fb'] }  // Generic Thermal
      ],
      optionalServices: [
        '000018f0-0000-1000-8000-00805f9b34fb',
        'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
        '49535343-fe7d-4ae5-8fa9-9fafd205e455',
        '0000ff00-0000-1000-8000-00805f9b34fb',
        '000018f1-0000-1000-8000-00805f9b34fb'
      ],
      acceptAllDevices: false
    }).catch(async () => {
      // Si los filtros fallan, permitir buscar todos los dispositivos Bluetooth cercanos
      return await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb',
          'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
          '49535343-fe7d-4ae5-8fa9-9fafd205e455',
          '0000ff00-0000-1000-8000-00805f9b34fb'
        ]
      });
    });

    if (!device) {
      throw new Error('No se seleccionó ninguna impresora.');
    }

    onStatus?.(`Conectando a ${device.name || 'Impresora'}...`);
    const server = await device.gatt?.connect();
    if (!server) {
      throw new Error('No se pudo conectar al servidor GATT de la impresora.');
    }

    // Obtener los servicios primarios
    const services = await server.getPrimaryServices();
    let writeCharacteristic: any = null;

    for (const service of services) {
      const characteristics = await service.getCharacteristics();
      for (const char of characteristics) {
        if (char.properties.write || char.properties.writeWithoutResponse) {
          writeCharacteristic = char;
          break;
        }
      }
      if (writeCharacteristic) break;
    }

    if (!writeCharacteristic) {
      throw new Error('No se encontró la característica de escritura en la impresora seleccionada.');
    }

    onStatus?.('Enviando datos de impresión ESC/POS...');
    const bytes = buildTicketEscPosBytes(ticket, settings, 32);

    // Enviar en fragmentos de 100 bytes (límite BLE MTU)
    const chunkSize = 100;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      if (writeCharacteristic.properties.writeWithoutResponse) {
        await writeCharacteristic.writeValueWithoutResponse(chunk);
      } else {
        await writeCharacteristic.writeValue(chunk);
      }
      await new Promise((r) => setTimeout(r, 20));
    }

    onStatus?.('¡Ticket impreso con éxito!');
    return { success: true, message: `Ticket #${ticket.folio} impreso en ${device.name || 'Impresora Bluetooth'}` };
  } catch (error: any) {
    console.error('Error al imprimir vía Bluetooth:', error);
    return { success: false, message: error?.message || 'Error desconocido al conectar con la impresora Bluetooth.' };
  }
}

/**
 * 2. Conexión Real Directa vía WebUSB API (Especial para Cable USB Tipo B / Impresoras POS)
 * Compatible con impresoras térmicas USB (Epson, Xprinter, EC Line, POS-58, POS-80, Star, ZJiang, etc.)
 */
export async function printViaWebUsb(
  ticket: SaleTicket,
  settings: Settings,
  onStatus?: (status: string) => void
): Promise<{ success: boolean; message: string }> {
  try {
    const nav = navigator as any;
    if (!nav.usb) {
      throw new Error(
        'WebUSB API no está disponible en este navegador. Utiliza Google Chrome o Microsoft Edge en PC o Mac.'
      );
    }

    onStatus?.('Buscando impresora con cable USB Tipo B...');

    // Solicitar permiso al usuario para conectarse al dispositivo USB
    const device = await nav.usb.requestDevice({
      filters: [] // Permitir seleccionar cualquier impresora conectada por cable USB
    });

    if (!device) {
      throw new Error('No se seleccionó ninguna impresora USB.');
    }

    onStatus?.(`Conectando con ${device.productName || 'Impresora USB POS'}...`);
    await device.open();

    // Seleccionar configuración 1 si no está activa
    if (device.configuration === null) {
      await device.selectConfiguration(1);
    }

    // Buscar la interfaz y endpoint OUT (salida de datos hacia la impresora)
    let interfaceNumber = 0;
    let endpointOut = 1;
    let foundEndpoint = false;

    for (const config of device.configurations) {
      for (const iface of config.interfaces) {
        for (const alt of iface.alternates) {
          // Clase 7 = Printer, o clase vendor-specific 255/0
          for (const ep of alt.endpoints) {
            if (ep.direction === 'out') {
              interfaceNumber = iface.interfaceNumber;
              endpointOut = ep.endpointNumber;
              foundEndpoint = true;
              break;
            }
          }
          if (foundEndpoint) break;
        }
        if (foundEndpoint) break;
      }
      if (foundEndpoint) break;
    }

    await device.claimInterface(interfaceNumber);

    onStatus?.('Enviando ticket a imprimir vía USB Tipo B...');
    const bytes = buildTicketEscPosBytes(ticket, settings, 32);

    // Transferir datos directamente al endpoint USB de la impresora
    await device.transferOut(endpointOut, bytes);

    onStatus?.('¡Ticket impreso exitosamente!');
    try {
      await device.releaseInterface(interfaceNumber);
      await device.close();
    } catch {
      // Ignorar cierre si la impresora ya desconectó la sesión
    }

    return {
      success: true,
      message: `Ticket #${ticket.folio} impreso en ${device.productName || 'Impresora USB Tipo B'}!`
    };
  } catch (error: any) {
    console.error('Error al imprimir vía WebUSB:', error);
    return {
      success: false,
      message: error?.message || 'Error al conectar la impresora por cable USB Tipo B.'
    };
  }
}

/**
 * 3. Conexión Real vía Web Serial API (Puertos USB-Serial / Virtual COM para impresoras con Cable Tipo B)
 */
export async function printViaUsbSerial(
  ticket: SaleTicket,
  settings: Settings,
  onStatus?: (status: string) => void
): Promise<{ success: boolean; message: string }> {
  try {
    const nav = navigator as any;
    if (!nav.serial) {
      throw new Error(
        'Web Serial API no está disponible en este navegador. Utiliza Google Chrome o Edge.'
      );
    }

    onStatus?.('Selecciona el puerto USB / COM de tu impresora...');
    const port = await nav.serial.requestPort();
    
    // Probar baudrate estándar POS (9600)
    try {
      await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' });
    } catch (e: any) {
      // Si ya estaba abierto o requiere otro baudrate
      if (!port.readable && !port.writable) {
        throw e;
      }
    }

    onStatus?.('Imprimiendo ticket térmico vía USB...');
    const writer = port.writable.getWriter();
    const bytes = buildTicketEscPosBytes(ticket, settings, 32);

    await writer.write(bytes);
    writer.releaseLock();
    await port.close();

    onStatus?.('¡Impresión finalizada!');
    return { success: true, message: `Ticket #${ticket.folio} enviado a la impresora USB exitosamente.` };
  } catch (error: any) {
    console.error('Error al imprimir vía USB/Serial:', error);
    return { success: false, message: error?.message || 'Error al conectar por USB/Serial.' };
  }
}

/**
 * 4. Método Inteligente Universal para Impresoras con Cable USB Tipo B
 * Intenta primero WebUSB directo, luego Web Serial, y si no hay permisos directos lanza el driver del sistema.
 */
export async function printViaUsbTypeB(
  ticket: SaleTicket,
  settings: Settings,
  onStatus?: (status: string) => void
): Promise<{ success: boolean; message: string }> {
  const nav = navigator as any;

  // 1. Intentar WebUSB si está disponible
  if (nav.usb) {
    try {
      const res = await printViaWebUsb(ticket, settings, onStatus);
      if (res.success) return res;
    } catch (e: any) {
      console.warn('WebUSB attempt failed, trying Web Serial...', e);
    }
  }

  // 2. Intentar Web Serial si WebUSB falló o no está disponible
  if (nav.serial) {
    try {
      const res = await printViaUsbSerial(ticket, settings, onStatus);
      if (res.success) return res;
    } catch (e: any) {
      console.warn('Web Serial attempt failed, falling back to driver...', e);
    }
  }

  // 3. Fallback al controlador de sistema
  onStatus?.('Abriendo cola de impresión del sistema...');
  window.print();
  return {
    success: true,
    message: 'Ventana de impresión abierta. Selecciona tu impresora térmica USB Tipo B instalada.'
  };
}

/**
 * 5. Impresión por Controlador de Sistema (Windows / Mac / Linux con driver USB instalado)
 */
export function printViaSystemDriver(): void {
  window.print();
}

/**
 * 6. Enlace directo a la app RawBT (Impresora de tickets en Android)
 */
export function printViaRawBtIntent(ticket: SaleTicket, settings: Settings): void {
  const bytes = buildTicketEscPosBytes(ticket, settings, 32);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = window.btoa(binary);
  const rawbtUrl = `rawbt:data:base64,${base64}`;
  window.location.href = rawbtUrl;
}

/**
 * 7. Impresión Directa y Aislada para Impresoras Térmicas (58mm / 80mm)
 * Crea un iframe invisible con el formato exacto del ticket para enviar directo a la impresora
 * sin alterar la pantalla del punto de venta ni requerir abrir ventanas secundarias.
 */
export function printTicketDirectToPrinter(ticket: SaleTicket, settings: Settings): boolean {
  try {
    const is80 = settings.ticketPaperWidth === '80mm';
    const bodyWidth = is80 ? '76mm' : '68mm';
    const baseFontSize = is80 ? '12.5px' : '11.5px';
    const titleFontSize = is80 ? '15px' : '14px';
    const subTitleFontSize = is80 ? '11px' : '10px';
    const totalFontSize = is80 ? '16px' : '14.5px';

    const itemsHtml = ticket.items
      .map(
        (it) => `
      <div style="margin-bottom: 2px;">
        <div style="display: flex; justify-content: space-between; font-size: ${baseFontSize}; font-weight: 900; align-items: baseline;">
          <span style="overflow: hidden; text-overflow: ellipsis; padding-right: 2px;">${it.quantity}x $${it.price.toFixed(it.price % 1 !== 0 ? 2 : 0)}</span>
          <span style="flex-shrink: 0; white-space: nowrap; text-align: right;">$${it.total.toFixed(2)}</span>
        </div>
        <div style="font-size: ${subTitleFontSize}; font-weight: 800; padding-left: 4px; color: #111; line-height: 1.15;">
          ${it.name}
        </div>
      </div>
    `
      )
      .join('');

    const isCard = ticket.paymentMethod === 'tarjeta';
    const paymentDetailsHtml = isCard
      ? `
      <div class="row">
        <span>FORMA DE PAGO:</span>
        <span class="val">TARJETA / ZETTLE</span>
      </div>
      ${
        ticket.cardTerminal
          ? `
        <div class="row" style="font-size: ${subTitleFontSize};">
          <span>TERMINAL:</span>
          <span class="val">PAYPAL ZETTLE</span>
        </div>
      `
          : ''
      }
      ${
        ticket.cardAuthCode
          ? `
        <div class="row" style="font-size: ${subTitleFontSize};">
          <span>AUT:</span>
          <span class="val">${ticket.cardAuthCode}</span>
        </div>
      `
          : ''
      }
      ${
        ticket.cardLast4
          ? `
        <div class="row" style="font-size: ${subTitleFontSize};">
          <span>TARJETA:</span>
          <span class="val">****${ticket.cardLast4}</span>
        </div>
      `
          : ''
      }
      <div style="text-align: center; font-size: ${subTitleFontSize}; font-weight: 900; background: #eee; padding: 2px; margin: 2px 0; border-radius: 2px;">
        OPERACION APROBADA
      </div>
    `
      : `
      <div class="row">
        <span>FORMA DE PAGO:</span>
        <span class="val">EFECTIVO</span>
      </div>
      ${
        ticket.amountPaid && ticket.amountPaid > 0
          ? `
        <div class="row">
          <span>PAGO CON:</span>
          <span class="val">$${ticket.amountPaid.toFixed(2)}</span>
        </div>
        <div class="row">
          <span>CAMBIO:</span>
          <span class="val">$${ticket.change.toFixed(2)}</span>
        </div>
      `
          : ''
      }
    `;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Ticket #${ticket.folio}</title>
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
            padding: 1mm 1mm 4mm 1mm;
            width: ${bodyWidth};
            max-width: ${bodyWidth};
            font-family: 'Courier New', Courier, monospace, system-ui;
            font-size: ${baseFontSize};
            font-weight: 900;
            color: #000000;
            line-height: 1.2;
            background: #ffffff;
            overflow-x: hidden;
            word-break: break-word;
          }
          .center { text-align: center; }
          .bold { font-weight: 900; }
          .divider { border-top: 1.5px dashed #000; margin: 4px 0; }
          .double-divider { border-top: 2px solid #000; margin: 5px 0; }
          .row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 1.5px; width: 100%; }
          .row > span:first-child { overflow: hidden; text-overflow: ellipsis; padding-right: 2px; }
          .row > span.val, .row > span:last-child { flex-shrink: 0; text-align: right; white-space: nowrap; font-weight: 900; }
          .title { font-size: ${titleFontSize}; font-weight: 900; line-height: 1.15; }
          .subtitle { font-size: ${subTitleFontSize}; font-weight: 800; }
          .total-row { font-size: ${totalFontSize}; font-weight: 900; padding: 2px 0; }
          .barcode { letter-spacing: 1px; font-family: monospace; font-size: 9px; margin-top: 3px; }
        </style>
      </head>
      <body>
        <div class="center">
          <div class="title">${settings.bakeryName || 'Panaderia Santa Fé el refugio'}</div>
          <div class="subtitle">${settings.slogan || 'Pan calientito y tradicional.'}</div>
          <div class="subtitle">${settings.address || '7:00 am a 10:00 pm'}</div>
          <div class="subtitle">TEL: ${settings.phone || '442 816 3291'}</div>
        </div>

        <div class="divider"></div>

        <div class="row">
          <span>FOLIO: ${ticket.folio}</span>
          <span class="val">${ticket.time}</span>
        </div>
        <div class="row">
          <span>FECHA: ${ticket.date}</span>
          <span class="val">CAJA: ${ticket.cashier || '1'}</span>
        </div>
        ${ticket.customerName ? `<div class="row"><span>CLIENTE: ${ticket.customerName}</span></div>` : ''}
        ${ticket.customerPhone ? `<div class="row"><span>TEL: ${ticket.customerPhone}</span></div>` : ''}

        <div class="divider"></div>

        <div class="row" style="font-size: ${subTitleFontSize}; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 2px;">
          <span>CANT x PRECIO</span>
          <span class="val">IMPORTE</span>
        </div>

        <div style="margin-top: 3px;">
          ${itemsHtml}
        </div>

        <div class="divider"></div>

        <div class="row">
          <span>SUBTOTAL:</span>
          <span class="val">$${ticket.subtotal.toFixed(2)}</span>
        </div>
        ${
          ticket.discount > 0
            ? `
          <div class="row">
            <span>${ticket.pointsRedeemed && ticket.pointsRedeemed > 0 ? 'DESC. PUNTOS:' : 'DESC. ESPECIAL 10%:'}</span>
            <span class="val">-$${ticket.discount.toFixed(2)}</span>
          </div>
        `
            : ''
        }

        <div class="double-divider"></div>

        <div class="row total-row">
          <span>TOTAL:</span>
          <span class="val">$${ticket.total.toFixed(2)}</span>
        </div>

        <div class="double-divider"></div>

        ${paymentDetailsHtml}

        <div class="divider"></div>

        <div class="center" style="font-size: ${subTitleFontSize};">
          <div style="font-weight: 900; text-transform: uppercase;">PROGRAMA DE LEALTAD ⭐</div>
          <div>Gano: +${ticket.pointsEarned} Pts ($${ticket.pointsEarned} pesos)</div>
          <div style="font-size: 8px;">($20 compra = $1 desc.)</div>
        </div>

        <div class="divider"></div>

        <div class="center" style="margin-top: 4px;">
          <div style="font-size: ${subTitleFontSize}; font-weight: 900;">
            ${settings.ticketFooter || '¡Gracias por su compra! Vuelva pronto.'}
          </div>
          <div class="barcode">||| | |||| | || ||||| | |||</div>
          <div style="font-size: 8.5px;">${ticket.folio}</div>
        </div>
      </body>
      </html>
    `;

    const iframeId = 'thermal-print-direct-frame';
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
    console.error('Error in printTicketDirectToPrinter:', e);
    window.print();
    return false;
  }
}

/**
 * Imprime directamente comanda / remisión de pedido o crédito a fin de mes en ticket térmico
 */
export function printOrderTicketDirectToPrinter(
  order: BakeryOrder, 
  settings: Settings, 
  isDoubleTicket: boolean = false
): boolean {
  try {
    const is80 = settings.ticketPaperWidth === '80mm';
    const bodyWidth = is80 ? '76mm' : '68mm';
    const baseFontSize = is80 ? '12px' : '11px';
    const titleFontSize = is80 ? '14.5px' : '13.5px';
    const subTitleFontSize = is80 ? '10.5px' : '9.5px';
    const totalFontSize = is80 ? '15px' : '13.5px';
    const pointsEarned = Math.floor(order.total / (settings.loyaltyPointsPerPesos || 20));

    const itemsHtml = order.items
      .map(
        (item) => `
        <div class="row" style="margin-bottom: 2px;">
          <span>${item.quantity}x ${item.name}</span>
          <span class="val">$${item.total.toFixed(2)}</span>
        </div>
        <div style="font-size: ${subTitleFontSize}; color: #333; padding-left: 4px; margin-bottom: 1.5px;">
          $${item.unitPrice.toFixed(2)} c/u
        </div>
      `
      )
      .join('');

    const renderTicketBody = (copyType: 'repartidor' | 'mostrador' | 'general') => {
      const isRepartidor = copyType === 'repartidor';
      const isMostrador = copyType === 'mostrador';

      return `
        <div class="ticket-block">
          <div class="center">
            <div class="title">${settings.bakeryName || 'Panadería Santa Fé'}</div>
            <div class="subtitle">${settings.slogan || 'Pan calientito y tradicional.'}</div>
            <div class="subtitle">TEL: ${settings.phone || '442 816 3291'}</div>
          </div>

          <div class="double-divider"></div>

          <div class="center">
            <div class="badge" style="${isRepartidor ? 'background:#000; color:#fff;' : isMostrador ? 'border: 2px solid #000;' : ''}">
              ${
                isRepartidor
                  ? '🛵 COPIA 1: REPARTIDOR (ENTREGA Y COBRO)'
                  : isMostrador
                  ? '🏪 COPIA 2: MOSTRADOR / CAJA (POR COBRAR)'
                  : order.isMonthlyCredit
                  ? 'REMISIÓN / CRÉDITO MES'
                  : 'NOTA DE PEDIDO'
              }
            </div>
          </div>

          <div class="divider"></div>

          <div class="row" style="font-size: ${titleFontSize}; font-weight: 900;">
            <span>FOLIO: ${order.folio}</span>
            <span class="val">${order.deliveryTime || ''}</span>
          </div>
          <div class="row">
            <span>FECHA: ${order.deliveryDate}</span>
            <span class="val">CANAL: ${order.orderChannel === 'reparto' ? 'REPARTO' : order.deliveryType === 'domicilio' ? 'DOMICILIO' : 'TIENDA'}</span>
          </div>
          <div class="row">
            <span>CLIENTE:</span>
            <span class="val bold">${order.customerName}</span>
          </div>
          ${order.customerPhone ? `<div class="row"><span>TELÉFONO:</span><span class="val">${order.customerPhone}</span></div>` : ''}
          ${order.address ? `<div style="font-size: ${subTitleFontSize}; margin: 2px 0;">DIR: ${order.address}</div>` : ''}
          ${order.requiresInvoice ? `
            <div class="row" style="font-size: ${subTitleFontSize}; border-top: 1px dotted #000; padding-top: 2px;">
              <span>FACTURA: ${order.invoiceFolio ? order.invoiceFolio : 'SOLICITADA'}</span>
              <span class="val">${order.rfc || ''}</span>
            </div>
          ` : ''}

          <div class="divider"></div>
          <div class="row" style="font-size: ${subTitleFontSize}; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 2px;">
            <span>CANT / DESCRIPCIÓN</span>
            <span class="val">IMPORTE</span>
          </div>

          <div style="margin-top: 3px;">
            ${itemsHtml}
          </div>

          <div class="divider"></div>

          <div class="row total-row">
            <span>TOTAL:</span>
            <span class="val">$${order.total.toFixed(2)}</span>
          </div>

          ${order.deposit > 0 ? `
            <div class="row">
              <span>ANTICIPO:</span>
              <span class="val">$${order.deposit.toFixed(2)}</span>
            </div>
          ` : ''}

          <div class="double-divider"></div>

          <div class="row total-row" style="font-size: ${titleFontSize}; background: #eee; padding: 2px;">
            <span>${order.pendingAmount > 0 ? 'COBRAR EN EFECTIVO:' : 'SALDO:'}</span>
            <span class="val">$${order.pendingAmount.toFixed(2)}</span>
          </div>

          ${pointsEarned > 0 ? `
            <div class="row" style="margin-top: 3px; font-size: ${subTitleFontSize}; border-top: 1px dotted #000; padding-top: 2px;">
              <span>PUNTOS ACUMULADOS:</span>
              <span class="val bold">+${pointsEarned} pts ⭐</span>
            </div>
          ` : ''}

          ${order.notes ? `<div style="font-size: ${subTitleFontSize}; margin-top: 3px;">NOTA: ${order.notes}</div>` : ''}

          ${isRepartidor ? `
            <div style="margin-top: 14px; text-align: center;">
              <div>___________________________</div>
              <div style="font-size: ${subTitleFontSize};">Firma de Recibido del Cliente</div>
            </div>
          ` : isMostrador ? `
            <div style="margin-top: 8px; padding: 4px; border: 1.5px dashed #000; font-size: ${subTitleFontSize}; text-align: center; line-height: 1.15;">
              <strong>⚠️ INDICACIÓN DE CAJA:</strong><br>
              Conservar este ticket en mostrador hasta que el repartidor entregue el dinero.
              Buscar el folio <strong>${order.folio}</strong> en Pedidos y presionar <strong>"COBRADO"</strong>.
            </div>
          ` : `
            <div style="margin-top: 14px; text-align: center;">
              <div>___________________________</div>
              <div style="font-size: ${subTitleFontSize};">Firma de Recibido</div>
            </div>
          `}

          <div class="divider" style="margin-top: 8px;"></div>
          <div class="center" style="font-size: ${subTitleFontSize};">
            ${settings.ticketFooter || '¡Gracias por su preferencia!'}
          </div>
        </div>
      `;
    };

    const ticketsBodyHtml = isDoubleTicket
      ? `
        ${renderTicketBody('repartidor')}
        <div style="margin: 18px 0; border-top: 2.5px dashed #000; border-bottom: 2.5px dashed #000; padding: 4px 0; text-align: center; font-size: 10px; font-weight: 900; letter-spacing: 1px;">
          ✂️ CORTE AQUÍ (DOBLE TICKET) ✂️
        </div>
        ${renderTicketBody('mostrador')}
      `
      : renderTicketBody('general');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Remisión Pedido - ${order.folio}</title>
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
            padding: 1mm 1mm 4mm 1mm;
            width: ${bodyWidth};
            max-width: ${bodyWidth};
            font-family: 'Courier New', Courier, monospace, system-ui;
            font-size: ${baseFontSize};
            font-weight: 800;
            color: #000000;
            line-height: 1.2;
            background: #ffffff;
            overflow-x: hidden;
            word-break: break-word;
          }
          .ticket-block { width: 100%; }
          .center { text-align: center; }
          .bold { font-weight: 900; }
          .divider { border-top: 1.5px dashed #000; margin: 4px 0; }
          .double-divider { border-top: 2px solid #000; margin: 5px 0; }
          .row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 1.5px; width: 100%; }
          .row > span:first-child { overflow: hidden; text-overflow: ellipsis; padding-right: 2px; }
          .row > span.val, .row > span:last-child { flex-shrink: 0; text-align: right; white-space: nowrap; font-weight: 900; }
          .title { font-size: ${titleFontSize}; font-weight: 900; line-height: 1.15; }
          .subtitle { font-size: ${subTitleFontSize}; font-weight: 700; }
          .total-row { font-size: ${totalFontSize}; font-weight: 900; padding: 2px 0; }
          .badge { display: inline-block; border: 1.5px solid #000; padding: 2px 4px; font-size: ${subTitleFontSize}; font-weight: 900; }
        </style>
      </head>
      <body>
        ${ticketsBodyHtml}
      </body>
      </html>
    `;

    const iframeId = 'order-thermal-direct-frame';
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
    console.error('Error in printOrderTicketDirectToPrinter:', e);
    window.print();
    return false;
  }
}

/**
 * Imprime Estado de Cuenta acumulado mensual para la contadora y clientes a crédito
 */
export function printAccountStatementDirectToPrinter(
  customerName: string,
  customerPhone: string,
  orders: BakeryOrder[],
  settings: Settings
): boolean {
  try {
    const is80 = settings.ticketPaperWidth === '80mm';
    const bodyWidth = is80 ? '76mm' : '68mm';
    const baseFontSize = is80 ? '12px' : '11px';
    const titleFontSize = is80 ? '14.5px' : '13.5px';
    const subTitleFontSize = is80 ? '10.5px' : '9.5px';
    const totalFontSize = is80 ? '15px' : '13.5px';

    const totalAccumulated = orders.reduce((sum, o) => sum + o.total, 0);
    const totalPending = orders.reduce((sum, o) => sum + o.pendingAmount, 0);
    const totalPaid = totalAccumulated - totalPending;

    const rowsHtml = orders
      .map(
        (o, idx) => `
        <div style="font-size: ${baseFontSize}; border-bottom: 1px dashed #ccc; padding: 2px 0;">
          <div class="row">
            <span><strong>#${idx + 1} ${o.folio}</strong> (${o.deliveryDate})</span>
            <strong class="val">$${o.total.toFixed(2)}</strong>
          </div>
          <div class="row" style="font-size: ${subTitleFontSize}; color: #333;">
            <span>${o.items.map(i => `${i.quantity} ${i.name}`).join(', ').slice(0, 24)}...</span>
            <span class="val">${o.pendingAmount === 0 ? '✓ Pagado' : `Resta: $${o.pendingAmount}`}</span>
          </div>
          ${o.invoiceFolio ? `<div style="font-size: 8px; color: #111;">Fac: ${o.invoiceFolio}</div>` : ''}
        </div>
      `
      )
      .join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Estado de Cuenta - ${customerName}</title>
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
            padding: 1mm 1mm 4mm 1mm;
            width: ${bodyWidth};
            max-width: ${bodyWidth};
            font-family: 'Courier New', Courier, monospace, system-ui;
            font-size: ${baseFontSize};
            font-weight: 800;
            color: #000000;
            line-height: 1.2;
            background: #ffffff;
            overflow-x: hidden;
            word-break: break-word;
          }
          .center { text-align: center; }
          .bold { font-weight: 900; }
          .divider { border-top: 1.5px dashed #000; margin: 4px 0; }
          .double-divider { border-top: 2px solid #000; margin: 5px 0; }
          .row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 1.5px; width: 100%; }
          .row > span:first-child { overflow: hidden; text-overflow: ellipsis; padding-right: 2px; }
          .row > span.val, .row > span:last-child { flex-shrink: 0; text-align: right; white-space: nowrap; font-weight: 900; }
          .title { font-size: ${titleFontSize}; font-weight: 900; line-height: 1.15; }
          .subtitle { font-size: ${subTitleFontSize}; font-weight: 700; }
          .total-row { font-size: ${totalFontSize}; font-weight: 900; padding: 2px 0; }
        </style>
      </head>
      <body>
        <div class="center">
          <div class="title">${settings.bakeryName || 'Panaderia Santa Fe el refugio'}</div>
          <div class="subtitle">EDO. CUENTA / CORTE MENSUAL</div>
          <div class="subtitle">TEL: ${settings.phone || '442 816 3291'}</div>
        </div>

        <div class="double-divider"></div>

        <div class="row"><span>CLIENTE:</span><span class="val">${customerName}</span></div>
        ${customerPhone ? `<div class="row"><span>TEL:</span><span class="val">${customerPhone}</span></div>` : ''}
        <div class="row"><span>FECHA CORTE:</span><span class="val">${new Date().toLocaleDateString('es-MX')}</span></div>
        <div class="row"><span>TOTAL REMISIONES:</span><span class="val">${orders.length}</span></div>

        <div class="divider"></div>
        <div style="font-size: ${subTitleFontSize}; font-weight: 900; text-transform: uppercase;">CONSUMOS DEL MES:</div>
        <div class="divider"></div>

        ${rowsHtml}

        <div class="double-divider"></div>

        <div class="row">
          <span>TOTAL CONSUMIDO:</span>
          <span class="val">$${totalAccumulated.toFixed(2)}</span>
        </div>
        <div class="row">
          <span>ABONADO / PAGADO:</span>
          <span class="val">$${totalPaid.toFixed(2)}</span>
        </div>

        <div class="double-divider"></div>

        <div class="row total-row">
          <span>TOTAL A COBRAR:</span>
          <span class="val">$${totalPending.toFixed(2)}</span>
        </div>

        <div class="double-divider"></div>

        <div style="margin-top: 14px; text-align: center;">
          <div>___________________________</div>
          <div style="font-size: ${subTitleFontSize};">Firma de Conformidad</div>
        </div>

        <div class="divider" style="margin-top: 10px;"></div>
        <div class="center" style="font-size: ${subTitleFontSize};">
          ${settings.ticketFooter || '¡Agradecemos su puntual preferencia!'}
        </div>
      </body>
      </html>
    `;

    const iframeId = 'account-statement-frame';
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
    console.error('Error in printAccountStatementDirectToPrinter:', e);
    window.print();
    return false;
  }
}
