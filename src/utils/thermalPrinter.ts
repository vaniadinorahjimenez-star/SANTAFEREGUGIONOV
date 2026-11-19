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
  const isZakiaTicket = ticket.branch === 'zakia';
  const branchBakeryTitle = isZakiaTicket
    ? 'Panaderia Santa Fe Zakia'
    : (settings.bakeryName || 'Panaderia Santa Fe El Refugio');

  encoder.init();
  if (ticket.paymentMethod === 'efectivo') {
    encoder.openCashDrawer(); // Abrir cajón automáticamente en pagos en efectivo
  }

  encoder
    .align('center')
    .bold(true)
    .size('large')
    .line(branchBakeryTitle)
    .size('normal')
    .bold(true)
    .line(settings.slogan || 'Pan calientito y tradicional.')
    .line(settings.address || '7:00 am a 10:00 pm')
    .line(settings.phone || '442 816 3291')
    .separator(width, '=')
    .align('left')
    .bold(true)
    .twoColumns(`FOLIO: ${ticket.folio}`, ticket.time, width)
    .twoColumns(`FECHA: ${ticket.date}`, `CAJA: ${ticket.cashier || '1'}`, width);

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
  const termName = ticket.cardTerminal === 'mercadopago' ? 'MERCADO PAGO POINT' : (ticket.cardTerminal === 'zettle' ? 'PAYPAL ZETTLE' : (isCard ? 'TARJETA DEBITO/CRED' : 'EFECTIVO'));
  encoder.bold(true).twoColumns('FORMA DE PAGO:', termName, width);

  if (isCard) {
    if (ticket.cardTerminal === 'mercadopago') {
      encoder.bold(true).twoColumns('TERMINAL:', 'MERCADO PAGO POINT', width);
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

const SILENT_PRINTER_CONFIG_KEY = 'bakery_silent_printer_config_v1';

export type SilentPrinterMode = 'auto' | 'webusb' | 'serial' | 'bluetooth' | 'rawbt' | 'bridge' | 'kiosk';

export interface SilentPrinterConfig {
  mode: SilentPrinterMode;
  autoPrintEnabled: boolean;
  usbVendorId?: number;
  usbProductId?: number;
  usbProductName?: string;
  serialVendorId?: number;
  serialProductId?: number;
  serialBaudRate?: number;
  bluetoothName?: string;
  bridgeUrl?: string;
  kioskConfirmed?: boolean;
}

export interface SilentPrinterStatus {
  mode: SilentPrinterMode;
  connected: boolean;
  printerName: string;
  channel: 'webusb' | 'serial' | 'bluetooth' | 'rawbt' | 'bridge' | 'kiosk' | 'system';
  autoPrintEnabled: boolean;
  bridgeUrl?: string;
  serialBaudRate?: number;
  supportsWebUsb: boolean;
  supportsWebSerial: boolean;
  supportsBluetooth: boolean;
}

export interface SilentPrintResult {
  printed: boolean;
  channel: 'webusb' | 'serial' | 'bluetooth' | 'rawbt' | 'bridge' | 'kiosk' | 'system';
  printerName?: string;
  error?: string;
}

// Referencia en memoria de Bluetooth BLE para impresión silenciosa continua sin pedir dispositivo en cada venta
let cachedBluetoothDevice: any = null;
let cachedBluetoothWriteChar: any = null;

// Cola secuencial de impresión para evitar colisiones si salen 2 tickets seguidos
let silentPrintQueue: Promise<any> = Promise.resolve();

function enqueueSilentPrint<T>(task: () => Promise<T>): Promise<T> {
  const next = silentPrintQueue.then(task, task);
  silentPrintQueue = next.catch(() => {});
  return next;
}

export function getSilentPrinterConfig(): SilentPrinterConfig {
  try {
    const raw = localStorage.getItem(SILENT_PRINTER_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        mode: parsed.mode || 'auto',
        autoPrintEnabled: parsed.autoPrintEnabled !== false,
        usbVendorId: typeof parsed.usbVendorId === 'number' ? parsed.usbVendorId : undefined,
        usbProductId: typeof parsed.usbProductId === 'number' ? parsed.usbProductId : undefined,
        usbProductName: parsed.usbProductName || undefined,
        serialVendorId: typeof parsed.serialVendorId === 'number' ? parsed.serialVendorId : undefined,
        serialProductId: typeof parsed.serialProductId === 'number' ? parsed.serialProductId : undefined,
        serialBaudRate: typeof parsed.serialBaudRate === 'number' ? parsed.serialBaudRate : 9600,
        bluetoothName: parsed.bluetoothName || undefined,
        bridgeUrl: parsed.bridgeUrl || undefined,
        kioskConfirmed: parsed.kioskConfirmed === true,
      };
    }
  } catch {}
  return {
    mode: 'auto',
    autoPrintEnabled: true,
    serialBaudRate: 9600,
  };
}

export function saveSilentPrinterConfig(partial: Partial<SilentPrinterConfig>): SilentPrinterConfig {
  const current = getSilentPrinterConfig();
  const next: SilentPrinterConfig = { ...current, ...partial };
  try {
    localStorage.setItem(SILENT_PRINTER_CONFIG_KEY, JSON.stringify(next));
  } catch {}
  dispatchPrinterEvent({ type: 'config_changed', config: next });
  return next;
}

export function clearSilentPrinterPairing(): void {
  try {
    if (cachedBluetoothDevice?.gatt?.connected) {
      cachedBluetoothDevice.gatt.disconnect();
    }
  } catch {}
  cachedBluetoothDevice = null;
  cachedBluetoothWriteChar = null;
  saveSilentPrinterConfig({
    mode: 'auto',
    usbVendorId: undefined,
    usbProductId: undefined,
    usbProductName: undefined,
    serialVendorId: undefined,
    serialProductId: undefined,
    bluetoothName: undefined,
    kioskConfirmed: false,
  });
}

function dispatchPrinterEvent(detail: Record<string, any>): void {
  try {
    window.dispatchEvent(new CustomEvent('bakery-printer-event', { detail }));
  } catch {}
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/**
 * Envía bytes ESC/POS a un dispositivo WebUSB YA autorizado (sin mostrar popup de permisos)
 */
async function sendBytesToWebUsbDevice(device: any, bytes: Uint8Array): Promise<void> {
  if (!device.opened) {
    await device.open();
  }
  if (device.configuration === null) {
    await device.selectConfiguration(1);
  }

  let interfaceNumber = 0;
  let endpointOut = 1;
  let foundEndpoint = false;

  for (const config of device.configurations || []) {
    for (const iface of config.interfaces || []) {
      for (const alt of iface.alternates || []) {
        for (const ep of alt.endpoints || []) {
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

  try {
    await device.claimInterface(interfaceNumber);
    // Enviar en bloques seguros de 1024 bytes
    const chunkSize = 1024;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      await device.transferOut(endpointOut, chunk);
    }
  } finally {
    try {
      await device.releaseInterface(interfaceNumber);
    } catch {}
    try {
      await device.close();
    } catch {}
  }
}

async function trySilentWebUsbPrint(bytes: Uint8Array, cfg: SilentPrinterConfig): Promise<SilentPrintResult> {
  const nav = navigator as any;
  if (!nav.usb || typeof nav.usb.getDevices !== 'function') {
    return { printed: false, channel: 'webusb', error: 'WebUSB no disponible' };
  }
  try {
    const devices: any[] = await nav.usb.getDevices();
    if (!devices || devices.length === 0) {
      return { printed: false, channel: 'webusb', error: 'Sin impresora USB vinculada' };
    }
    const target =
      devices.find(
        (d) =>
          typeof cfg.usbVendorId === 'number' &&
          d.vendorId === cfg.usbVendorId &&
          (typeof cfg.usbProductId !== 'number' || d.productId === cfg.usbProductId)
      ) || devices[0];

    await sendBytesToWebUsbDevice(target, bytes);
    return {
      printed: true,
      channel: 'webusb',
      printerName: target.productName || cfg.usbProductName || 'Impresora USB Directa',
    };
  } catch (err: any) {
    return { printed: false, channel: 'webusb', error: err?.message || 'Error WebUSB' };
  }
}

/**
 * Envía bytes ESC/POS a un puerto Web Serial (USB-COM) YA autorizado (sin popup de permisos)
 */
async function sendBytesToSerialPort(port: any, bytes: Uint8Array, baudRate: number = 9600): Promise<void> {
  const ratesToTry = Array.from(new Set([baudRate, 9600, 115200, 19200, 38400]));
  let openedHere = false;

  if (!port.writable) {
    let lastOpenErr: any = null;
    for (const rate of ratesToTry) {
      try {
        await port.open({ baudRate: rate, dataBits: 8, stopBits: 1, parity: 'none' });
        openedHere = true;
        lastOpenErr = null;
        break;
      } catch (e: any) {
        lastOpenErr = e;
        if (port.writable) break;
      }
    }
    if (lastOpenErr && !port.writable) {
      throw lastOpenErr;
    }
  }

  const writer = port.writable.getWriter();
  try {
    await writer.write(bytes);
  } finally {
    try {
      writer.releaseLock();
    } catch {}
    if (openedHere) {
      try {
        await port.close();
      } catch {}
    }
  }
}

async function trySilentSerialPrint(bytes: Uint8Array, cfg: SilentPrinterConfig): Promise<SilentPrintResult> {
  const nav = navigator as any;
  if (!nav.serial || typeof nav.serial.getPorts !== 'function') {
    return { printed: false, channel: 'serial', error: 'Web Serial no disponible' };
  }
  try {
    const ports: any[] = await nav.serial.getPorts();
    if (!ports || ports.length === 0) {
      return { printed: false, channel: 'serial', error: 'Sin puerto USB/COM vinculado' };
    }
    const target =
      ports.find((p) => {
        const info = typeof p.getInfo === 'function' ? p.getInfo() : {};
        return (
          typeof cfg.serialVendorId === 'number' &&
          info.usbVendorId === cfg.serialVendorId &&
          (typeof cfg.serialProductId !== 'number' || info.usbProductId === cfg.serialProductId)
        );
      }) || ports[0];

    await sendBytesToSerialPort(target, bytes, cfg.serialBaudRate || 9600);
    return {
      printed: true,
      channel: 'serial',
      printerName: 'Impresora USB / COM Directa',
    };
  } catch (err: any) {
    return { printed: false, channel: 'serial', error: err?.message || 'Error Web Serial' };
  }
}

async function trySilentBluetoothPrint(bytes: Uint8Array): Promise<SilentPrintResult> {
  if (!cachedBluetoothDevice) {
    return { printed: false, channel: 'bluetooth', error: 'Sin impresora Bluetooth activa en sesión' };
  }
  try {
    let writeChar = cachedBluetoothWriteChar;
    if (!cachedBluetoothDevice.gatt?.connected || !writeChar) {
      const server = await cachedBluetoothDevice.gatt?.connect();
      if (!server) throw new Error('No se pudo reconectar GATT Bluetooth');
      const services = await server.getPrimaryServices();
      writeChar = null;
      for (const service of services) {
        const chars = await service.getCharacteristics();
        for (const ch of chars) {
          if (ch.properties.write || ch.properties.writeWithoutResponse) {
            writeChar = ch;
            break;
          }
        }
        if (writeChar) break;
      }
      cachedBluetoothWriteChar = writeChar;
    }
    if (!writeChar) {
      throw new Error('Característica de escritura Bluetooth no disponible');
    }
    const chunkSize = 100;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      if (writeChar.properties.writeWithoutResponse) {
        await writeChar.writeValueWithoutResponse(chunk);
      } else {
        await writeChar.writeValue(chunk);
      }
      await new Promise((r) => setTimeout(r, 15));
    }
    return {
      printed: true,
      channel: 'bluetooth',
      printerName: cachedBluetoothDevice.name || 'Impresora Bluetooth',
    };
  } catch (err: any) {
    return { printed: false, channel: 'bluetooth', error: err?.message || 'Error Bluetooth' };
  }
}

async function trySilentRawBtPrint(bytes: Uint8Array): Promise<SilentPrintResult> {
  const base64 = bytesToBase64(bytes);
  // 1. Intentar servicio HTTP local de RawBT en segundo plano (sin cambiar de pestaña en Android)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1600);
    try {
      const res = await fetch('http://127.0.0.1:40213/', {
        method: 'POST',
        mode: 'no-cors',
        body: base64,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res) {
        return { printed: true, channel: 'rawbt', printerName: 'RawBT Android (Automático)' };
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {}

  // 2. Fallback: Intent directo a RawBT Android
  try {
    window.location.href = `rawbt:data:base64,${base64}`;
    return { printed: true, channel: 'rawbt', printerName: 'RawBT Android' };
  } catch (err: any) {
    return { printed: false, channel: 'rawbt', error: err?.message || 'Error RawBT' };
  }
}

async function trySilentBridgePrint(bytes: Uint8Array, bridgeUrl: string): Promise<SilentPrintResult> {
  const cleanUrl = bridgeUrl.trim();
  if (!cleanUrl) return { printed: false, channel: 'bridge', error: 'Sin URL de puente local' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(cleanUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format: 'escpos_base64',
        data: bytesToBase64(bytes),
      }),
      signal: controller.signal,
    });
    if (res.ok) {
      return { printed: true, channel: 'bridge', printerName: 'Puente Local Silencioso' };
    }
    return { printed: false, channel: 'bridge', error: `HTTP ${res.status}` };
  } catch (err: any) {
    return { printed: false, channel: 'bridge', error: err?.message || 'Puente local no respondió' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Orquestador Silencioso: intenta imprimir directo en hardware ESC/POS ya vinculado
 * SIN abrir ninguna ventana de confirmación ni pedir permisos al cajero.
 */
export async function trySilentHardwarePrint(bytes: Uint8Array): Promise<SilentPrintResult> {
  return enqueueSilentPrint(async () => {
    const cfg = getSilentPrinterConfig();

    // Si el usuario eligió explícitamente modo RawBT (Android)
    if (cfg.mode === 'rawbt') {
      const r = await trySilentRawBtPrint(bytes);
      if (r.printed) return r;
    }

    // Si el usuario eligió un puente HTTP local
    if (cfg.mode === 'bridge' && cfg.bridgeUrl) {
      const r = await trySilentBridgePrint(bytes, cfg.bridgeUrl);
      if (r.printed) return r;
    }

    // Si el usuario eligió explícitamente modo kiosk (driver Windows/Mac sin ventana), ir directo al iframe
    if (cfg.mode === 'kiosk') {
      return { printed: false, channel: 'kiosk' };
    }

    // Priorizar el canal vinculado preferido y luego cualquier hardware ya autorizado sin diálogo
    const order: Array<'webusb' | 'serial' | 'bluetooth'> =
      cfg.mode === 'serial'
        ? ['serial', 'webusb', 'bluetooth']
        : cfg.mode === 'bluetooth'
        ? ['bluetooth', 'webusb', 'serial']
        : ['webusb', 'serial', 'bluetooth'];

    for (const ch of order) {
      if (ch === 'webusb') {
        const res = await trySilentWebUsbPrint(bytes, cfg);
        if (res.printed) return res;
      } else if (ch === 'serial') {
        const res = await trySilentSerialPrint(bytes, cfg);
        if (res.printed) return res;
      } else if (ch === 'bluetooth') {
        const res = await trySilentBluetoothPrint(bytes);
        if (res.printed) return res;
      }
    }

    return { printed: false, channel: 'system' };
  });
}

/**
 * Vinculación ÚNICA (1 sola vez) de impresora USB directa vía WebUSB.
 * Después de este clic, Chrome recuerda el permiso permanentemente y cada cobro sale sin ventana.
 */
export async function pairSilentUsbPrinter(
  testTicket?: SaleTicket,
  settings?: Settings,
  onStatus?: (status: string) => void
): Promise<{ success: boolean; printerName?: string; message: string }> {
  const nav = navigator as any;
  if (!nav.usb) {
    return {
      success: false,
      message: 'WebUSB no está disponible en este navegador. Usa Google Chrome o Microsoft Edge en PC/Mac.',
    };
  }
  try {
    onStatus?.('Selecciona tu impresora térmica USB (solo se pide 1 vez)...');
    const device = await nav.usb.requestDevice({ filters: [] });
    if (!device) {
      return { success: false, message: 'No se seleccionó ninguna impresora USB.' };
    }
    const printerName = device.productName || `Impresora USB (${device.vendorId}:${device.productId})`;
    saveSilentPrinterConfig({
      mode: 'webusb',
      autoPrintEnabled: true,
      usbVendorId: device.vendorId,
      usbProductId: device.productId,
      usbProductName: printerName,
    });

    if (testTicket && settings) {
      onStatus?.(`Probando impresión automática en ${printerName}...`);
      const bytes = buildTicketEscPosBytes(testTicket, settings);
      await sendBytesToWebUsbDevice(device, bytes);
    }

    return {
      success: true,
      printerName,
      message: `¡${printerName} vinculada! A partir de ahora todos los tickets saldrán en automático sin pedir permiso.`,
    };
  } catch (err: any) {
    const rawMsg = err?.message || '';
    const isDriverLock =
      rawMsg.toLowerCase().includes('access denied') ||
      rawMsg.toLowerCase().includes('claim') ||
      rawMsg.toLowerCase().includes('unable to claim') ||
      err?.name === 'SecurityError';
    return {
      success: false,
      message: isDriverLock
        ? 'Windows tiene bloqueado el USB con su driver nativo. Usa la opción "Puerto USB/COM" o descarga el Acceso Directo Sin Ventana (1 clic) abajo.'
        : rawMsg || 'No se pudo vincular la impresora USB.',
    };
  }
}

/**
 * Vinculación ÚNICA (1 sola vez) vía Web Serial (Puerto COM / USB-Serial).
 * Después de este clic, Chrome recuerda el puerto permanentemente y cada cobro imprime en automático.
 */
export async function pairSilentSerialPrinter(
  testTicket?: SaleTicket,
  settings?: Settings,
  baudRate: number = 9600,
  onStatus?: (status: string) => void
): Promise<{ success: boolean; printerName?: string; message: string }> {
  const nav = navigator as any;
  if (!nav.serial) {
    return {
      success: false,
      message: 'Web Serial no está disponible en este navegador. Usa Google Chrome o Microsoft Edge en PC/Mac.',
    };
  }
  try {
    onStatus?.('Selecciona el puerto USB / COM de tu impresora (solo se pide 1 vez)...');
    const port = await nav.serial.requestPort();
    if (!port) {
      return { success: false, message: 'No se seleccionó ningún puerto.' };
    }
    const info = typeof port.getInfo === 'function' ? port.getInfo() : {};
    saveSilentPrinterConfig({
      mode: 'serial',
      autoPrintEnabled: true,
      serialVendorId: info.usbVendorId,
      serialProductId: info.usbProductId,
      serialBaudRate: baudRate,
    });

    if (testTicket && settings) {
      onStatus?.('Enviando ticket de prueba al puerto USB/COM...');
      const bytes = buildTicketEscPosBytes(testTicket, settings);
      await sendBytesToSerialPort(port, bytes, baudRate);
    }

    return {
      success: true,
      printerName: 'Impresora USB / COM Directa',
      message: '¡Puerto USB/COM vinculado! Todos los tickets saldrán en automático sin pedir permiso.',
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'No se pudo vincular el puerto USB/COM.',
    };
  }
}

/**
 * Vinculación de impresora Bluetooth para impresión silenciosa continua durante todo el turno.
 */
export async function pairSilentBluetoothPrinter(
  testTicket?: SaleTicket,
  settings?: Settings,
  onStatus?: (status: string) => void
): Promise<{ success: boolean; printerName?: string; message: string }> {
  const nav = navigator as any;
  if (!nav.bluetooth) {
    return {
      success: false,
      message: 'Web Bluetooth no está disponible en este navegador. Usa Chrome en Windows, Mac o Android.',
    };
  }
  try {
    onStatus?.('Buscando impresora térmica Bluetooth...');
    const device = await nav.bluetooth
      .requestDevice({
        filters: [
          { services: ['000018f0-0000-1000-8000-00805f9b34fb'] },
          { services: ['e7810a71-73ae-499d-8c15-faa9aef0c3f2'] },
          { services: ['49535343-fe7d-4ae5-8fa9-9fafd205e455'] },
          { services: ['0000ff00-0000-1000-8000-00805f9b34fb'] },
        ],
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb',
          'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
          '49535343-fe7d-4ae5-8fa9-9fafd205e455',
          '0000ff00-0000-1000-8000-00805f9b34fb',
          '000018f1-0000-1000-8000-00805f9b34fb',
        ],
        acceptAllDevices: false,
      })
      .catch(async () =>
        nav.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [
            '000018f0-0000-1000-8000-00805f9b34fb',
            'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
            '49535343-fe7d-4ae5-8fa9-9fafd205e455',
            '0000ff00-0000-1000-8000-00805f9b34fb',
          ],
        })
      );

    if (!device) {
      return { success: false, message: 'No se seleccionó ninguna impresora Bluetooth.' };
    }

    onStatus?.(`Conectando a ${device.name || 'Impresora Bluetooth'}...`);
    const server = await device.gatt?.connect();
    if (!server) {
      throw new Error('No se pudo conectar al servidor Bluetooth de la impresora.');
    }
    const services = await server.getPrimaryServices();
    let writeChar: any = null;
    for (const service of services) {
      const chars = await service.getCharacteristics();
      for (const ch of chars) {
        if (ch.properties.write || ch.properties.writeWithoutResponse) {
          writeChar = ch;
          break;
        }
      }
      if (writeChar) break;
    }
    if (!writeChar) {
      throw new Error('No se encontró canal de escritura ESC/POS en esa impresora Bluetooth.');
    }

    cachedBluetoothDevice = device;
    cachedBluetoothWriteChar = writeChar;
    const printerName = device.name || 'Impresora Bluetooth';
    saveSilentPrinterConfig({
      mode: 'bluetooth',
      autoPrintEnabled: true,
      bluetoothName: printerName,
    });

    if (testTicket && settings) {
      onStatus?.('Imprimiendo ticket de prueba por Bluetooth...');
      const bytes = buildTicketEscPosBytes(testTicket, settings);
      await trySilentBluetoothPrint(bytes);
    }

    return {
      success: true,
      printerName,
      message: `¡${printerName} conectada! Cada cobro imprimirá en automático por Bluetooth.`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Error al vincular impresora Bluetooth.',
    };
  }
}

/**
 * Consulta en vivo qué impresora automática ya está autorizada y lista en este equipo
 */
export async function getSilentPrinterStatus(): Promise<SilentPrinterStatus> {
  const nav = navigator as any;
  const cfg = getSilentPrinterConfig();
  const supportsWebUsb = Boolean(nav.usb && typeof nav.usb.getDevices === 'function');
  const supportsWebSerial = Boolean(nav.serial && typeof nav.serial.getPorts === 'function');
  const supportsBluetooth = Boolean(nav.bluetooth);

  if (cfg.mode === 'rawbt') {
    return {
      mode: cfg.mode,
      connected: true,
      printerName: 'RawBT Android',
      channel: 'rawbt',
      autoPrintEnabled: cfg.autoPrintEnabled,
      supportsWebUsb,
      supportsWebSerial,
      supportsBluetooth,
    };
  }

  if (cfg.mode === 'bridge' && cfg.bridgeUrl) {
    return {
      mode: cfg.mode,
      connected: true,
      printerName: 'Puente Local Silencioso',
      channel: 'bridge',
      autoPrintEnabled: cfg.autoPrintEnabled,
      bridgeUrl: cfg.bridgeUrl,
      supportsWebUsb,
      supportsWebSerial,
      supportsBluetooth,
    };
  }

  if (cfg.mode === 'kiosk' || cfg.kioskConfirmed) {
    return {
      mode: 'kiosk',
      connected: true,
      printerName: 'Driver Windows/Mac (Sin Ventana)',
      channel: 'kiosk',
      autoPrintEnabled: cfg.autoPrintEnabled,
      supportsWebUsb,
      supportsWebSerial,
      supportsBluetooth,
    };
  }

  // Verificar dispositivos WebUSB ya autorizados permanentemente
  if (supportsWebUsb) {
    try {
      const devices: any[] = await nav.usb.getDevices();
      if (devices && devices.length > 0) {
        const match =
          devices.find(
            (d) =>
              typeof cfg.usbVendorId === 'number' &&
              d.vendorId === cfg.usbVendorId &&
              (typeof cfg.usbProductId !== 'number' || d.productId === cfg.usbProductId)
          ) || devices[0];
        return {
          mode: cfg.mode,
          connected: true,
          printerName: match.productName || cfg.usbProductName || 'Impresora USB Directa',
          channel: 'webusb',
          autoPrintEnabled: cfg.autoPrintEnabled,
          supportsWebUsb,
          supportsWebSerial,
          supportsBluetooth,
        };
      }
    } catch {}
  }

  // Verificar puertos Web Serial ya autorizados permanentemente
  if (supportsWebSerial) {
    try {
      const ports: any[] = await nav.serial.getPorts();
      if (ports && ports.length > 0) {
        return {
          mode: cfg.mode,
          connected: true,
          printerName: 'Impresora USB / COM',
          channel: 'serial',
          autoPrintEnabled: cfg.autoPrintEnabled,
          serialBaudRate: cfg.serialBaudRate || 9600,
          supportsWebUsb,
          supportsWebSerial,
          supportsBluetooth,
        };
      }
    } catch {}
  }

  // Verificar Bluetooth en sesión
  if (cachedBluetoothDevice) {
    return {
      mode: cfg.mode,
      connected: true,
      printerName: cachedBluetoothDevice.name || cfg.bluetoothName || 'Impresora Bluetooth',
      channel: 'bluetooth',
      autoPrintEnabled: cfg.autoPrintEnabled,
      supportsWebUsb,
      supportsWebSerial,
      supportsBluetooth,
    };
  }

  return {
    mode: cfg.mode,
    connected: false,
    printerName: 'Impresora del Sistema',
    channel: 'system',
    autoPrintEnabled: cfg.autoPrintEnabled,
    serialBaudRate: cfg.serialBaudRate || 9600,
    supportsWebUsb,
    supportsWebSerial,
    supportsBluetooth,
  };
}

/**
 * Descarga un acceso directo de Windows (.bat) que abre Chrome/Edge con --kiosk-printing
 * para que CUALQUIER impresora térmica instalada en Windows imprima SIN ventana de confirmación.
 */
export function downloadWindowsSilentPrintLauncher(appUrl?: string): void {
  const targetUrl = (appUrl || window.location.origin + window.location.pathname).trim();
  const batContent = [
    '@echo off',
    'title Panaderia Santa Fe - Impresion Automatica Sin Ventana',
    'echo Iniciando Panaderia Santa Fe en Modo Impresion Automatica (sin confirmar Imprimir)...',
    'set "URL=' + targetUrl + '"',
    'if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" (',
    '  start "" "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing --app="%URL%"',
    '  exit /b 0',
    ')',
    'if exist "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" (',
    '  start "" "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing --app="%URL%"',
    '  exit /b 0',
    ')',
    'if exist "%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe" (',
    '  start "" "%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing --app="%URL%"',
    '  exit /b 0',
    ')',
    'if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" (',
    '  start "" "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" --kiosk-printing --app="%URL%"',
    '  exit /b 0',
    ')',
    'if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" (',
    '  start "" "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" --kiosk-printing --app="%URL%"',
    '  exit /b 0',
    ')',
    'echo No se encontro Google Chrome ni Microsoft Edge instalado.',
    'pause',
  ].join('\r\n');

  const blob = new Blob([batContent], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Panaderia_SantaFe_AutoImpresion_Windows.bat';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1000);
  saveSilentPrinterConfig({ mode: 'kiosk', kioskConfirmed: true, autoPrintEnabled: true });
}

/**
 * Descarga un acceso directo de Mac (.command) que abre Chrome con --kiosk-printing
 */
export function downloadMacSilentPrintLauncher(appUrl?: string): void {
  const targetUrl = (appUrl || window.location.origin + window.location.pathname).trim();
  const shContent = [
    '#!/bin/bash',
    `open -na "Google Chrome" --args --kiosk-printing --app="${targetUrl}"`,
  ].join('\n');

  const blob = new Blob([shContent], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Panaderia_SantaFe_AutoImpresion_Mac.command';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1000);
  saveSilentPrinterConfig({ mode: 'kiosk', kioskConfirmed: true, autoPrintEnabled: true });
}

let lastDirectPrintTicketKey = '';
let lastDirectPrintTime = 0;

/**
 * 7. Impresión Directa y Automática para Impresoras Térmicas (58mm / 80mm)
 * Prioriza hardware directo ESC/POS (WebUSB / Web Serial / Bluetooth / RawBT / Puente) SIN ventana de permiso.
 * Si usa driver de Windows/Mac, imprime vía iframe térmico aislado (100% silencioso en modo --kiosk-printing).
 */
export function printTicketDirectToPrinter(ticket: SaleTicket, settings: Settings): boolean {
  try {
    const printKey = `${ticket.folio || ticket.id}-${ticket.total}-${ticket.paymentMethod}`;
    const now = Date.now();
    // Protección anti-duplicado: Evita imprimir 2 veces el mismo ticket en menos de 3s
    if (lastDirectPrintTicketKey === printKey && now - lastDirectPrintTime < 3000) {
      console.warn('printTicketDirectToPrinter omitido por llamada duplicada en menos de 3s:', printKey);
      return true;
    }
    lastDirectPrintTicketKey = printKey;
    lastDirectPrintTime = now;

    const triggerIframeFallback = () => {
      try {
        printTicketViaThermalIframe(ticket, settings);
      } catch (err) {
        console.error('Error en iframe thermal fallback:', err);
        window.print();
      }
    };

    // 1. Intentar impresión directa ESC/POS silenciosa (cero ventanas, cero permisos)
    const escPosBytes = buildTicketEscPosBytes(ticket, settings);
    void trySilentHardwarePrint(escPosBytes)
      .then((res) => {
        if (res.printed) {
          dispatchPrinterEvent({
            type: 'printed_silent',
            folio: ticket.folio,
            channel: res.channel,
            printerName: res.printerName,
          });
          return;
        }
        // 2. Sin hardware directo vinculado (o en modo kiosk Windows/Mac): usar iframe térmico aislado
        triggerIframeFallback();
        dispatchPrinterEvent({
          type: 'printed_system',
          folio: ticket.folio,
          channel: res.channel,
        });
      })
      .catch(() => {
        triggerIframeFallback();
      });

    return true;
  } catch (e) {
    console.error('Error in printTicketDirectToPrinter:', e);
    window.print();
    return false;
  }
}

function printTicketViaThermalIframe(ticket: SaleTicket, settings: Settings): boolean {
  try {
    const is80 = settings.ticketPaperWidth === '80mm';
    const bodyWidth = is80 ? '76mm' : '68mm';
    const baseFontSize = is80 ? '12.5px' : '11.5px';
    const titleFontSize = is80 ? '15px' : '14px';
    const subTitleFontSize = is80 ? '11px' : '10px';
    const totalFontSize = is80 ? '16px' : '14.5px';
    const isZakiaTicket = ticket.branch === 'zakia';
    const branchTitle = isZakiaTicket
      ? 'Panadería Santa Fé — Zakia'
      : (settings.bakeryName || 'Panadería Santa Fé El Refugio');

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
    const cardMethodLabel =
      ticket.cardTerminal === 'mercadopago'
        ? 'TARJETA / MERCADO PAGO'
        : ticket.cardTerminal === 'zettle'
        ? 'TARJETA / ZETTLE'
        : 'TARJETA';
    const cardTerminalLabel =
      ticket.cardTerminal === 'mercadopago'
        ? 'MERCADO PAGO POINT'
        : ticket.cardTerminal === 'zettle'
        ? 'PAYPAL ZETTLE'
        : 'TERMINAL BANCARIA';

    const paymentDetailsHtml = isCard
      ? `
      <div class="row">
        <span>FORMA DE PAGO:</span>
        <span class="val">${cardMethodLabel}</span>
      </div>
      ${
        ticket.cardTerminal
          ? `
        <div class="row" style="font-size: ${subTitleFontSize};">
          <span>TERMINAL:</span>
          <span class="val">${cardTerminalLabel}</span>
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
            font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif;
            font-variant-numeric: tabular-nums;
            font-size: ${baseFontSize};
            font-weight: 700;
            color: #000000;
            line-height: 1.2;
            letter-spacing: 0.01em;
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
          <div class="title">${branchTitle}</div>
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
          // Limpiar iframe para no dejar elementos huérfanos
          setTimeout(() => {
            try {
              iframe?.remove();
            } catch (err) {}
          }, 2500);
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
            font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif;
            font-variant-numeric: tabular-nums;
            font-size: ${baseFontSize};
            font-weight: 700;
            color: #000000;
            line-height: 1.2;
            letter-spacing: 0.01em;
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
            font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif;
            font-variant-numeric: tabular-nums;
            font-size: ${baseFontSize};
            font-weight: 700;
            color: #000000;
            line-height: 1.2;
            letter-spacing: 0.01em;
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

/**
 * Imprime Ticket Térmico Individual para Cliente de Reparto (Solo un ticket, sin copia)
 */
export function printDeliveryClientTicketDirectToPrinter(
  clientName: string,
  driverName: string,
  dateStr: string,
  items: Array<{ name: string; quantity: number; unitPrice: number; total: number }>,
  totalAmount: number,
  totalPieces: number,
  settings: Settings,
  shiftName?: string,
  extraDetails?: {
    deliveryNumber?: number;
    deliveryTime?: string;
    previousDeliveryNote?: string;
    dayAccumulatedPieces?: number;
    dayAccumulatedAmount?: number;
  }
): boolean {
  try {
    const is80 = settings.ticketPaperWidth === '80mm';
    const bodyWidth = is80 ? '76mm' : '68mm';
    const baseFontSize = is80 ? '12.5px' : '11.5px';
    const titleFontSize = is80 ? '15px' : '14px';
    const totalFontSize = is80 ? '16px' : '14.5px';

    const itemsHtml = items
      .map(
        (it) => `
      <div style="margin-bottom: 3px;">
        <div style="display: flex; justify-content: space-between; font-size: ${baseFontSize}; font-weight: 900; align-items: baseline;">
          <span>${it.quantity}x ${it.name}</span>
          <span style="flex-shrink: 0; white-space: nowrap;">$${it.total.toFixed(2)}</span>
        </div>
        <div style="font-size: 10px; font-weight: bold; color: #444; padding-left: 4px;">
          P.U: $${it.unitPrice.toFixed(2)} c/u
        </div>
      </div>
    `
      )
      .join('');

    const shiftHtml = shiftName ? `<div><strong>TURNO:</strong> ${shiftName.toUpperCase()}</div>` : '';

    const deliveryTimeHtml = extraDetails?.deliveryTime
      ? `<div><strong>HORA DE ENTREGA:</strong> ${extraDetails.deliveryTime}</div>`
      : '';

    const deliveryNumberBadge = extraDetails?.deliveryNumber && extraDetails.deliveryNumber > 1
      ? `<div style="margin: 3px 0; background: #000; color: #fff; padding: 2px 6px; font-weight: 900; font-size: 11px; text-align: center; border-radius: 3px;">
          ENTREGA #${extraDetails.deliveryNumber} (2da VUELTA / REPETICIÓN)
         </div>`
      : '';

    const previousDeliveryBanner = extraDetails?.previousDeliveryNote
      ? `
        <div style="border: 2px dashed #000; padding: 4px 6px; margin: 6px 0; background-color: #f7f7f7;">
          <div style="font-weight: 900; font-size: 11px; text-align: center;">⚠️ NOTA: HUBO ENTREGA PREVIA</div>
          <div style="font-size: 10px; font-weight: 800; text-align: center; margin-top: 2px;">${extraDetails.previousDeliveryNote}</div>
        </div>
      `
      : '';

    const accumulatedHtml = (extraDetails?.dayAccumulatedAmount !== undefined && extraDetails.dayAccumulatedAmount > totalAmount)
      ? `
        <div class="divider"></div>
        <div class="row" style="font-size: 11px; font-weight: 800;">
          <span>ACUMULADO TOTAL DÍA (${extraDetails.dayAccumulatedPieces || 0} pzs):</span>
          <span>$${extraDetails.dayAccumulatedAmount.toFixed(2)}</span>
        </div>
      `
      : '';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Ticket Reparto - ${clientName}</title>
        <style>
          @page { margin: 0; size: auto; }
          body {
            margin: 0;
            padding: 8px 6px;
            font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif;
            font-variant-numeric: tabular-nums;
            font-weight: 700;
            color: #000;
            width: ${bodyWidth};
            max-width: ${bodyWidth};
            line-height: 1.2;
            letter-spacing: 0.01em;
            -webkit-print-color-adjust: exact;
          }
          .divider { border-bottom: 2px dashed #000; margin: 6px 0; }
          .center { text-align: center; }
          .row { display: flex; justify-content: space-between; font-size: ${baseFontSize}; }
        </style>
      </head>
      <body>
        <div class="center">
          <div style="font-size: ${titleFontSize}; font-weight: 900;">${settings.bakeryName || 'Panadería Santa Fé el refugio'}</div>
          <div style="font-size: 11px; font-weight: 800;">${settings.slogan || 'Pan Tradicional y Reparto Diario'}</div>
          <div style="font-size: 10px;">${settings.address || '7:00 am a 10:00 pm'}</div>
          <div style="font-size: 10px;">Tel: ${settings.phone || '442 816 3291'}</div>
        </div>

        <div class="divider"></div>

        <div class="center" style="font-size: 13px; font-weight: 900; letter-spacing: 0.5px;">
          TICKET DE REPARTO
        </div>

        <div style="font-size: 11px; margin-top: 4px;">
          <div><strong>FECHA:</strong> ${dateStr}</div>
          ${deliveryTimeHtml}
          ${shiftHtml}
          <div><strong>REPARTIDOR:</strong> ${driverName.toUpperCase()}</div>
          <div style="font-size: 13px; font-weight: 900; margin-top: 2px;">
            CLIENTE: ${clientName}
          </div>
          ${deliveryNumberBadge}
        </div>

        ${previousDeliveryBanner}

        <div class="divider"></div>

        <div style="margin-bottom: 4px;">
          ${itemsHtml}
        </div>

        <div class="divider"></div>

        <div class="row">
          <span>TOTAL ESTA ENTREGA:</span>
          <span>${totalPieces} pzs</span>
        </div>

        <div class="row" style="font-size: ${totalFontSize}; font-weight: 900; margin-top: 3px;">
          <span>TOTAL A COBRAR:</span>
          <span>$${totalAmount.toFixed(2)}</span>
        </div>

        ${accumulatedHtml}

        <div class="divider"></div>

        <div class="center" style="font-size: 10px; margin-top: 4px;">
          ¡Gracias por su compra!<br>
          Panadería Santa Fé
        </div>
      </body>
      </html>
    `;

    const iframeId = 'delivery-client-ticket-frame';
    let iframe = document.getElementById(iframeId) as HTMLIFrameElement;
    if (iframe) iframe.remove();

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
          setTimeout(() => {
            try { iframe?.remove(); } catch (e) {}
          }, 2500);
        } catch (printErr) {
          window.print();
        }
      }, 150);
      return true;
    } else {
      window.print();
      return true;
    }
  } catch (e) {
    console.error('Error in printDeliveryClientTicketDirectToPrinter:', e);
    window.print();
    return false;
  }
}

/**
 * Imprime Ticket Consolidado de Reparto para el Repartidor (Osvaldo o Simón)
 * Incluye todos los clientes con piezas solicitadas y el monto total a liquidar
 */
export function printDriverConsolidatedTicketDirectToPrinter(
  driverName: string,
  dateStr: string,
  clientSummaries: Array<{
    clientName: string;
    itemsSummary: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
    clientTotal: number;
    clientPieces: number;
    deliveryNumber?: number;
    deliveryTime?: string;
    previousDeliveryNote?: string;
  }>,
  totalDriverAmount: number,
  totalDriverPieces: number,
  settings: Settings,
  shiftName?: string
): boolean {
  try {
    const is80 = settings.ticketPaperWidth === '80mm';
    const bodyWidth = is80 ? '76mm' : '68mm';
    const baseFontSize = is80 ? '12px' : '11px';
    const titleFontSize = is80 ? '15px' : '14px';
    const totalFontSize = is80 ? '16px' : '14.5px';

    // Ordenar: primero los primeros pedidos (entrega 1), luego las siguientes vueltas en orden cronológico
    const sortedSummaries = [...clientSummaries].sort((a, b) => {
      const numA = a.deliveryNumber || 1;
      const numB = b.deliveryNumber || 1;
      if (numA !== numB) return numA - numB;
      const timeA = a.deliveryTime || '';
      const timeB = b.deliveryTime || '';
      return timeA.localeCompare(timeB);
    });

    const clientsHtml = sortedSummaries
      .map(
        (c, idx) => {
          const isRepeated = (c.deliveryNumber || 1) > 1;
          const numberLabel = isRepeated ? `#${idx + 1} ${c.clientName} [2da VUELTA #${c.deliveryNumber}]` : `#${idx + 1} ${c.clientName}`;
          const timeBadge = c.deliveryTime ? `<span style="font-size: 10px; font-weight: bold; color: #444;">(${c.deliveryTime})</span>` : '';
          const prevNote = isRepeated && c.previousDeliveryNote
            ? `<div style="font-size: 9.5px; font-weight: bold; color: #b45309; margin-top: 1px;">⚠️ Entrega previa: ${c.previousDeliveryNote}</div>`
            : '';

          return `
            <div style="margin-bottom: 5px; padding-bottom: 4px; border-bottom: 1px dotted #888; ${isRepeated ? 'background-color: #fcfcfc; padding: 2px 3px;' : ''}">
              <div style="font-size: 11.5px; font-weight: 900; display: flex; justify-content: space-between; align-items: baseline;">
                <span>${numberLabel} ${timeBadge}</span>
                <span>$${c.clientTotal.toFixed(2)}</span>
              </div>
              ${prevNote}
              <div style="font-size: 10px; color: #333; margin-top: 1px;">
                ${c.itemsSummary.map(it => `${it.quantity}x ${it.name} ($${it.unitPrice.toFixed(2)})`).join(', ')}
              </div>
            </div>
          `;
        }
      )
      .join('');

    // Desglose consolidado por tipo de pan (bolillos, teleras, tradicionales, rellenos, etc.)
    const breadTotalsMap: Record<string, number> = {};
    clientSummaries.forEach(c => {
      (c.itemsSummary || []).forEach(it => {
        const name = (it.name || 'Pan').trim();
        breadTotalsMap[name] = (breadTotalsMap[name] || 0) + Number(it.quantity || 0);
      });
    });

    const breadBreakdownEntries = Object.entries(breadTotalsMap).filter(([_, qty]) => qty > 0);
    const breadBreakdownHtml = breadBreakdownEntries
      .map(([name, qty]) => `
        <div style="display: flex; justify-content: space-between; font-size: 11.5px; padding: 1.5px 0; border-bottom: 1px dotted #ccc;">
          <span style="font-weight: 800;">• ${name}:</span>
          <span style="font-weight: 900;">${qty} pzs</span>
        </div>
      `)
      .join('');

    const shiftHtml = shiftName ? `<div class="center" style="font-size: 11px; font-weight: bold; margin-top: 1px;">TURNO: ${shiftName.toUpperCase()}</div>` : '';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Consolidado Reparto - ${driverName}</title>
        <style>
          @page { margin: 0; size: auto; }
          body {
            margin: 0;
            padding: 8px 6px;
            font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif;
            font-variant-numeric: tabular-nums;
            font-weight: 700;
            color: #000;
            width: ${bodyWidth};
            max-width: ${bodyWidth};
            line-height: 1.2;
            letter-spacing: 0.01em;
            -webkit-print-color-adjust: exact;
          }
          .divider { border-bottom: 2px dashed #000; margin: 6px 0; }
          .center { text-align: center; }
          .row { display: flex; justify-content: space-between; font-size: ${baseFontSize}; }
        </style>
      </head>
      <body>
        <div class="center">
          <div style="font-size: ${titleFontSize}; font-weight: 900;">${settings.bakeryName || 'Panadería Santa Fé el refugio'}</div>
          <div style="font-size: 10px;">${settings.address || 'Santa Fé El Refugio'}</div>
        </div>

        <div class="divider"></div>

        <div class="center" style="font-size: 13.5px; font-weight: 900;">
          CONSOLIDADO DE REPARTO
        </div>
        <div class="center" style="font-size: 14px; font-weight: 900; margin-top: 2px;">
          REPARTIDOR: ${driverName.toUpperCase()}
        </div>
        ${shiftHtml}
        <div class="center" style="font-size: 11px; margin-top: 2px;">
          FECHA: ${dateStr}
        </div>

        <div class="divider"></div>

        <div style="font-size: 11px; font-weight: bold; margin-bottom: 4px;">
          CLIENTES SURTIDOS (${clientSummaries.length}):
        </div>

        ${clientsHtml}

        <div class="divider"></div>

        <div class="row">
          <span>TOTAL CLIENTES:</span>
          <span>${clientSummaries.length} clientes</span>
        </div>
        <div class="row" style="font-size: 12.5px; font-weight: 900;">
          <span>TOTAL PIEZAS PAN:</span>
          <span>${totalDriverPieces} piezas</span>
        </div>

        <!-- RESUMEN DETALLADO DE PIEZAS POR TIPO DE PAN -->
        <div style="margin: 6px 0; padding: 5px 6px; background: #f3f4f6; border: 1.5px solid #000; border-radius: 4px;">
          <div style="font-size: 11px; font-weight: 900; text-align: center; border-bottom: 1.5px dashed #000; padding-bottom: 3px; margin-bottom: 4px; text-transform: uppercase;">
            🥖 RESUMEN TOTAL DE PIEZAS A LLEVAR:
          </div>
          ${breadBreakdownHtml || '<div style="font-size: 10px; text-align: center;">Sin piezas cargadas</div>'}
        </div>

        <div class="divider"></div>

        <div class="row" style="font-size: ${totalFontSize}; font-weight: 900; padding: 2px 0;">
          <span>MONTO A ENTREGAR:</span>
          <span>$${totalDriverAmount.toFixed(2)}</span>
        </div>

        <div class="divider"></div>

        <div style="margin-top: 18px; font-size: 10px;">
          <div style="border-top: 1px solid #000; padding-top: 3px; text-align: center; margin-bottom: 14px;">
            Firma Repartidor (${driverName})
          </div>
          <div style="border-top: 1px solid #000; padding-top: 3px; text-align: center;">
            Firma Entrega en Caja
          </div>
        </div>
      </body>
      </html>
    `;

    const iframeId = 'delivery-consolidated-ticket-frame';
    let iframe = document.getElementById(iframeId) as HTMLIFrameElement;
    if (iframe) iframe.remove();

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
          setTimeout(() => {
            try { iframe?.remove(); } catch (e) {}
          }, 2500);
        } catch (printErr) {
          window.print();
        }
      }, 150);
      return true;
    } else {
      window.print();
      return true;
    }
  } catch (e) {
    console.error('Error in printDriverConsolidatedTicketDirectToPrinter:', e);
    window.print();
    return false;
  }
}
