import React, { useState, useEffect } from 'react';
import { SaleTicket, Settings, ZettleDeviceInfo } from '../types';
import { 
  Printer, 
  X, 
  Banknote, 
  CreditCard, 
  Coins, 
  CheckCircle2, 
  Trash2, 
  Bluetooth, 
  Smartphone,
  ShieldCheck 
} from 'lucide-react';
import { playBeep, playCashSound } from '../utils/audio';
import { 
  connectZettleBluetooth, 
  getZettleConnectionInfo, 
  subscribeZettleConnection, 
  launchZettleAppPayment, 
  generateZettleAuthCode 
} from '../utils/zettleBluetooth';
import { printTicketDirectToPrinter } from '../utils/thermalPrinter';

interface ThermalTicketProps {
  ticket: SaleTicket;
  settings: Settings;
  customerPointsBalance?: number;
  onClose?: () => void;
  onPrint?: (ticket: SaleTicket) => void;
  onUpdateTicket?: (ticket: SaleTicket) => void;
  onRequestDelete?: (ticket: SaleTicket) => void;
  autoPrint?: boolean;
}

export const ThermalTicket: React.FC<ThermalTicketProps> = ({
  ticket,
  settings,
  customerPointsBalance,
  onClose,
  onPrint,
  onUpdateTicket,
  onRequestDelete,
  autoPrint = false
}) => {
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'tarjeta'>(
    ticket.paymentMethod || 'efectivo'
  );
  const [amountPaidStr, setAmountPaidStr] = useState<string>(
    ticket.amountPaid ? ticket.amountPaid.toString() : ticket.total.toString()
  );
  const [cardTerminal, setCardTerminal] = useState<'zettle' | 'clip' | 'terminal_bancaria' | 'otro'>(
    ticket.cardTerminal || 'zettle'
  );
  const [cardAuthCode, setCardAuthCode] = useState<string>(
    ticket.cardAuthCode || (ticket.paymentMethod === 'tarjeta' ? generateZettleAuthCode() : '')
  );
  const [cardLast4, setCardLast4] = useState<string>(ticket.cardLast4 || '');
  const [zettleDevice, setZettleDevice] = useState<ZettleDeviceInfo | null>(getZettleConnectionInfo());
  const [isConnectingZettle, setIsConnectingZettle] = useState(false);
  const [zettleStatusText, setZettleStatusText] = useState('');

  useEffect(() => {
    const unsub = subscribeZettleConnection((info) => {
      setZettleDevice(info);
    });
    return unsub;
  }, []);

  const numericPaid = parseFloat(amountPaidStr) || 0;
  const calculatedChange =
    paymentMethod === 'efectivo' && numericPaid >= ticket.total
      ? Math.round((numericPaid - ticket.total) * 100) / 100
      : 0;

  const currentTicket: SaleTicket = {
    ...ticket,
    paymentMethod,
    cardTerminal: paymentMethod === 'tarjeta' ? cardTerminal : undefined,
    cardAuthCode: paymentMethod === 'tarjeta' ? (cardAuthCode || generateZettleAuthCode()) : undefined,
    cardLast4: paymentMethod === 'tarjeta' && cardLast4 ? cardLast4 : undefined,
    amountPaid: paymentMethod === 'efectivo' ? (numericPaid || ticket.total) : ticket.total,
    change: paymentMethod === 'efectivo' ? calculatedChange : 0
  };

  useEffect(() => {
    onUpdateTicket?.(currentTicket);
  }, [paymentMethod, amountPaidStr, cardTerminal, cardAuthCode, cardLast4]);

  useEffect(() => {
    if (autoPrint) {
      const timer = setTimeout(() => {
        handlePrint();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [autoPrint]);

  const handlePrint = () => {
    if (onPrint) {
      onPrint(currentTicket);
    } else {
      printTicketDirectToPrinter(currentTicket, settings);
    }
  };

  const handleConnectZettleBluetooth = async () => {
    setIsConnectingZettle(true);
    setZettleStatusText('Buscando terminal Bluetooth...');
    playBeep(700, 'sine', 0.04);
    try {
      const res = await connectZettleBluetooth((st) => setZettleStatusText(st));
      if (res.success && res.device) {
        setZettleDevice(res.device);
        setZettleStatusText(`¡Conectado a ${res.device.name}!`);
        if (!cardAuthCode) {
          setCardAuthCode(generateZettleAuthCode());
        }
        playCashSound();
      } else {
        setZettleStatusText(res.message);
      }
    } catch (e: any) {
      setZettleStatusText(e?.message || 'Error Bluetooth');
    } finally {
      setIsConnectingZettle(false);
    }
  };

  return (
    <div id="ticket-modal-overlay" className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      {/* Side-by-side modal container on sm/md/lg screens */}
      <div className="flex flex-col md:flex-row items-stretch max-w-2xl w-full max-h-[95vh] bg-white rounded-3xl shadow-2xl overflow-hidden border-2 border-slate-300 animate-in fade-in zoom-in-95 duration-200">
        
        {/* SIDE ACTIONS PANEL (Desktop/Tablet: Right or Left side sticky; Mobile: Top/Side compact panel) */}
        <div className="w-full md:w-80 bg-[#2D3142] text-white p-4 sm:p-5 flex flex-col justify-between shrink-0 no-print border-b md:border-b-0 md:border-r border-slate-700 overflow-y-auto max-h-[45vh] md:max-h-none">
          <div className="space-y-3">
            {/* Header / Store Badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-[#D95D39] flex items-center justify-center text-white shadow-md">
                  <Printer className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-white leading-tight">Cobro de Ticket</h3>
                  <span className="text-[10px] text-amber-300 font-bold uppercase tracking-wider">Folio: {currentTicket.folio}</span>
                </div>
              </div>

              {onClose && (
                <button
                  id="close-ticket-btn-icon"
                  type="button"
                  onClick={onClose}
                  className="text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 p-2 rounded-xl transition-colors cursor-pointer"
                  title="Cerrar"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Total Highlight */}
            <div className="bg-black/40 rounded-2xl p-3 border border-white/10 flex items-baseline justify-between">
              <span className="text-xs text-slate-300 font-bold uppercase tracking-wider">Total a Cobrar:</span>
              <span className="text-2xl font-black text-amber-400 tracking-tight">${currentTicket.total}.00</span>
            </div>

            {/* Payment Method Selector: Efectivo / Tarjeta (Planteado arriba del botón Imprimir) */}
            <div className="space-y-2 bg-slate-800/80 rounded-2xl p-3 border border-white/15">
              <div className="text-[11px] font-black text-amber-300 uppercase tracking-wider flex items-center justify-between">
                <span>Método de Pago:</span>
                <span className="text-[10px] text-slate-300 font-bold">{paymentMethod === 'efectivo' ? 'Efectivo' : 'Tarjeta'}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  id="modal-pay-cash-btn"
                  type="button"
                  onClick={() => {
                    playBeep(650, 'sine', 0.04);
                    setPaymentMethod('efectivo');
                  }}
                  className={`py-2 px-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center space-x-1.5 border transition-all cursor-pointer ${
                    paymentMethod === 'efectivo'
                      ? 'bg-emerald-600 text-white border-emerald-400 shadow-md ring-2 ring-emerald-400/50 scale-102'
                      : 'bg-slate-700/70 hover:bg-slate-700 text-slate-300 border-white/10'
                  }`}
                >
                  <Banknote className="w-4 h-4" />
                  <span>💵 Efectivo</span>
                </button>

                <button
                  id="modal-pay-card-btn"
                  type="button"
                  onClick={() => {
                    playBeep(650, 'sine', 0.04);
                    setPaymentMethod('tarjeta');
                    setAmountPaidStr(currentTicket.total.toString());
                  }}
                  className={`py-2 px-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center space-x-1.5 border transition-all cursor-pointer ${
                    paymentMethod === 'tarjeta'
                      ? 'bg-[#D95D39] text-white border-orange-400 shadow-md ring-2 ring-[#D95D39]/50 scale-102'
                      : 'bg-slate-700/70 hover:bg-slate-700 text-slate-300 border-white/10'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span>💳 Tarjeta</span>
                </button>
              </div>

              {/* Cash Change Calculator (when Efectivo is active) */}
              {paymentMethod === 'efectivo' && (
                <div className="pt-2 border-t border-white/10 space-y-2 animate-in fade-in duration-150">
                  {/* Amount Paid Input */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-1 text-[11px] font-bold text-slate-300">
                      <Coins className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Paga con:</span>
                    </div>

                    <div className="flex items-center space-x-1 bg-white px-2 py-0.5 rounded-lg border-2 border-amber-400 shadow-inner">
                      <span className="text-[#D95D39] font-black text-xs">$</span>
                      <input
                        id="modal-cash-amount-input"
                        type="number"
                        placeholder={currentTicket.total.toString()}
                        value={amountPaidStr}
                        onChange={(e) => setAmountPaidStr(e.target.value)}
                        className="w-16 bg-transparent font-mono font-black text-slate-900 text-sm text-right focus:outline-none tracking-tight"
                      />
                      <span className="text-slate-400 font-bold text-[10px]">.00</span>
                    </div>
                  </div>

                  {/* Quick Cash Buttons */}
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        playBeep(700, 'sine', 0.03);
                        setAmountPaidStr(currentTicket.total.toString());
                      }}
                      className={`py-1.5 px-1 rounded-lg font-black text-[11px] transition-all text-center border cursor-pointer ${
                        numericPaid === currentTicket.total
                          ? 'bg-emerald-600 text-white border-emerald-400 font-black shadow-xs'
                          : 'bg-slate-700 hover:bg-slate-600 text-white border-slate-600'
                      }`}
                      title="Pago exacto sin cambio"
                    >
                      Exacto
                    </button>
                    {[50, 100, 200, 500, 1000].map((denom) => (
                      <button
                        key={denom}
                        type="button"
                        onClick={() => {
                          playBeep(700, 'sine', 0.03);
                          setAmountPaidStr(denom.toString());
                        }}
                        className={`py-1.5 px-1 rounded-lg font-black text-[11px] transition-all text-center border cursor-pointer ${
                          numericPaid === denom
                            ? 'bg-[#D95D39] text-white border-[#D95D39] font-black shadow-xs'
                            : 'bg-slate-700 hover:bg-slate-600 text-white border-slate-600'
                        }`}
                      >
                        ${denom === 1000 ? '1,000' : denom}
                      </button>
                    ))}
                  </div>

                  {/* Change Status */}
                  {numericPaid >= currentTicket.total ? (
                    <div className="bg-emerald-600 text-white py-1.5 px-2.5 rounded-xl shadow-xs text-center">
                      <div className="text-[9px] font-black uppercase tracking-widest text-emerald-100">
                        {numericPaid === currentTicket.total ? '✅ PAGO EXACTO' : '💵 CAMBIO A ENTREGAR'}
                      </div>
                      <div className="text-lg font-black tracking-tight leading-tight">
                        ${calculatedChange}.00
                      </div>
                    </div>
                  ) : numericPaid > 0 ? (
                    <div className="bg-amber-400 text-amber-950 py-1.5 px-2 rounded-xl text-center text-xs font-black">
                      ⚠️ Faltan: ${currentTicket.total - numericPaid}.00
                    </div>
                  ) : null}
                </div>
              )}

              {/* PayPal Zettle Terminal Controls (when Tarjeta is active) */}
              {paymentMethod === 'tarjeta' && (
                <div className="pt-2 border-t border-white/10 space-y-2 animate-in fade-in duration-150">
                  <div className="bg-slate-900/90 rounded-xl p-2.5 border border-white/10 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[11px] font-black text-amber-300">
                        <Bluetooth className={`w-3.5 h-3.5 ${zettleDevice?.connected ? 'text-blue-400' : 'text-slate-400'}`} />
                        <span>PayPal Zettle:</span>
                      </div>
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${zettleDevice?.connected ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                        {zettleDevice?.connected ? '🟢 Conectada' : '🔴 Desconectada'}
                      </span>
                    </div>

                    {!zettleDevice?.connected ? (
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          disabled={isConnectingZettle}
                          onClick={handleConnectZettleBluetooth}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-1.5 px-2 rounded-lg text-[11px] flex items-center justify-center gap-1 cursor-pointer transition-all"
                        >
                          <Bluetooth className="w-3 h-3" />
                          <span>{isConnectingZettle ? 'Conectando...' : 'Conectar Bluetooth'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => launchZettleAppPayment(currentTicket.total, currentTicket.folio)}
                          className="bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold py-1.5 px-2 rounded-lg text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                          title="Abrir App Zettle"
                        >
                          <Smartphone className="w-3 h-3 text-blue-400" />
                          <span>App</span>
                        </button>
                      </div>
                    ) : (
                      <div className="text-[10px] text-emerald-400 font-bold">
                        Dispositivo: {zettleDevice.name} ({zettleDevice.batteryLevel || 90}% bat.)
                      </div>
                    )}

                    {zettleStatusText && (
                      <div className="text-[10px] text-blue-300 italic">
                        {zettleStatusText}
                      </div>
                    )}

                    {/* Authorization & Last 4 digits */}
                    <div className="grid grid-cols-2 gap-1.5 pt-1">
                      <div>
                        <label className="text-[9px] text-slate-400 block font-bold">AUT:</label>
                        <input
                          type="text"
                          value={cardAuthCode}
                          onChange={(e) => setCardAuthCode(e.target.value)}
                          placeholder="ZET-XXXX"
                          className="w-full bg-slate-800 border border-slate-700 text-white rounded px-1.5 py-0.5 text-[11px] font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-slate-400 block font-bold">ÚLTIMOS 4:</label>
                        <input
                          type="text"
                          maxLength={4}
                          value={cardLast4}
                          onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, ''))}
                          placeholder="Ej. 1234"
                          className="w-full bg-slate-800 border border-slate-700 text-white rounded px-1.5 py-0.5 text-[11px] font-mono"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons - Pinned directly below Payment buttons */}
          <div className="space-y-2 pt-3">
            <button
              id="print-ticket-main-btn"
              type="button"
              onClick={handlePrint}
              className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-[#D95D39] to-[#BF4C2A] hover:from-[#BF4C2A] hover:to-[#9E3B1C] text-white font-black py-3.5 px-4 rounded-2xl shadow-xl hover:shadow-2xl transition-all active:scale-98 text-base cursor-pointer border border-[#BF4C2A] ring-2 ring-white/30"
              title="Imprimir ticket en impresora térmica"
            >
              <Printer className="w-5 h-5 shrink-0" />
              <span>IMPRIMIR TICKET 🖨️</span>
            </button>

            {onClose && (
              <button
                id="close-ticket-secondary-btn"
                type="button"
                onClick={onClose}
                className="w-full bg-slate-700 hover:bg-slate-600 text-white font-black py-2.5 px-4 rounded-xl text-xs transition-colors cursor-pointer text-center flex items-center justify-center gap-1.5 border border-slate-500 shadow-sm"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Finalizar y Cerrar</span>
              </button>
            )}

            {onRequestDelete && (
              <button
                id="delete-ticket-modal-btn"
                type="button"
                onClick={() => onRequestDelete(currentTicket)}
                className="w-full bg-rose-950/60 hover:bg-rose-900 text-rose-300 hover:text-rose-100 font-bold py-2 px-3 rounded-xl text-[11px] transition-colors cursor-pointer text-center flex items-center justify-center gap-1.5 border border-rose-800/80 mt-1"
                title="Eliminar venta errónea o de prueba (Requiere clave admin 13579)"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Eliminar Venta Errónea / Prueba</span>
              </button>
            )}
          </div>
        </div>

        {/* Printable Thermal Ticket Preview Area (Scrollable within the panel if ticket is long) */}
        <div className="flex-1 bg-slate-200/80 p-3 sm:p-6 overflow-y-auto max-h-[50vh] md:max-h-[95vh] flex justify-center items-start">
          <div
            id="printable-ticket"
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

            {/* Folio & Date */}
            <div className="py-2 border-b-2 border-dashed border-black text-[11px] font-black space-y-1">
              <div className="flex justify-between font-black text-black">
                <span>FOLIO: {currentTicket.folio}</span>
                <span>{currentTicket.time}</span>
              </div>
              <div className="flex justify-between text-black font-black">
                <span>FECHA: {currentTicket.date}</span>
                <span>CAJA: {currentTicket.cashier || '1'}</span>
              </div>
              {currentTicket.customerName && (
                <div className="pt-0.5 text-black font-black truncate">
                  CLIENTE: {currentTicket.customerName}
                </div>
              )}
              {currentTicket.customerPhone && (
                <div className="text-black font-black">
                  TEL: {currentTicket.customerPhone}
                </div>
              )}
            </div>

            {/* Items Breakdown */}
            <div className="py-2.5 border-b-2 border-dashed border-black space-y-1.5 font-black">
              <div className="flex justify-between font-black text-[10px] text-black uppercase pb-1 border-b border-black">
                <span>CANT x PRECIO</span>
                <span>IMPORTE</span>
              </div>
              {currentTicket.items.map((item, idx) => (
                <div key={idx} className="space-y-0.5 font-black">
                  <div className="flex justify-between items-baseline font-black text-[12px] text-black">
                    <span className="truncate pr-1">
                      {item.quantity}x ${item.price.toFixed(item.price % 1 !== 0 ? 2 : 0)}
                    </span>
                    <span className="font-black">${item.total.toFixed(2)}</span>
                  </div>
                  <div className="text-[10px] font-black text-black pl-2 truncate">
                    {item.name}
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="py-2 border-b-2 border-dashed border-black space-y-1 text-[11px] font-black text-black">
              <div className="flex justify-between font-black">
                <span>SUBTOTAL:</span>
                <span>${currentTicket.subtotal.toFixed(2)}</span>
              </div>
              {currentTicket.discount > 0 && (
                <div className="flex justify-between font-black">
                  <span>{currentTicket.pointsRedeemed && currentTicket.pointsRedeemed > 0 ? 'DESCUENTO PUNTOS:' : 'DESCUENTO (10% ESPECIAL):'}</span>
                  <span>-${currentTicket.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-sm font-black text-black pt-1 border-t-2 border-black">
                <span>TOTAL:</span>
                <span className="text-base font-black">${currentTicket.total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[11px] font-black pt-0.5">
                <span>PAGO:</span>
                <span className="uppercase font-black">
                  {currentTicket.paymentMethod === 'efectivo' ? 'EFECTIVO' : 'TARJETA'}
                </span>
              </div>
              {currentTicket.paymentMethod === 'tarjeta' && (
                <>
                  <div className="flex justify-between text-[10px] font-black">
                    <span>TERMINAL:</span>
                    <span>{currentTicket.cardTerminal === 'clip' ? 'CLIP WI-FI (API)' : (currentTicket.cardTerminal === 'zettle' ? 'PAYPAL ZETTLE (BT)' : 'TERMINAL BANCARIA')}</span>
                  </div>
                  {currentTicket.cardAuthCode && (
                    <div className="flex justify-between text-[10px] font-black">
                      <span>AUT:</span>
                      <span>{currentTicket.cardAuthCode}</span>
                    </div>
                  )}
                  {currentTicket.cardLast4 && (
                    <div className="flex justify-between text-[10px] font-black">
                      <span>TARJETA:</span>
                      <span>**** **** **** {currentTicket.cardLast4}</span>
                    </div>
                  )}
                  <div className="text-[9.5px] font-black text-center py-0.5 bg-black/5 rounded">
                    OPERACION APROBADA EN LINEA
                  </div>
                </>
              )}
              {currentTicket.paymentMethod === 'efectivo' && currentTicket.amountPaid > 0 && (
                <>
                  <div className="flex justify-between text-[10.5px] font-black">
                    <span>PAGÓ CON:</span>
                    <span>${currentTicket.amountPaid.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-black text-black">
                    <span>CAMBIO:</span>
                    <span>${currentTicket.change.toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Loyalty Points Section */}
            <div className="py-2 border-b-2 border-dashed border-black text-center space-y-1 font-black">
              <div className="text-[11px] font-black uppercase tracking-wide">
                PROGRAMA DE LEALTAD ⭐
              </div>
              <div className="text-[10.5px] font-black">
                Ganó en esta compra: +{currentTicket.pointsEarned} Pts (${currentTicket.pointsEarned} pesos)
              </div>
              {customerPointsBalance !== undefined && (
                <div className="text-[10px] font-black">
                  Saldo Total Acumulado: {customerPointsBalance} Pts (${customerPointsBalance} pesos)
                </div>
              )}
              <div className="text-[9.5px] font-black">
                ($20 pesos de compra = $1 peso de descuento)
              </div>
            </div>

            {/* Footer Message & Barcode */}
            <div className="pt-2 text-center space-y-1 font-black">
              <div className="text-[10px] font-black">
                {settings.ticketFooter || '¡Gracias por su compra! Vuelva pronto.'}
              </div>
              <div className="pt-1 flex flex-col items-center justify-center font-black">
                <div className="font-mono text-[9px] font-black tracking-widest text-black select-none flex space-x-0.5 items-center justify-center py-0.5">
                  ||| | |||| | || ||||| | ||| || |||| | |||
                </div>
                <span className="text-[9px] font-black text-black">{currentTicket.folio}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

