import React, { useState, useEffect, useRef } from 'react';
import { BakeryOrder, Driver, Settings } from '../../types';
import { 
  Truck, 
  MapPin, 
  Phone, 
  CheckCircle2, 
  Clock, 
  DollarSign, 
  Navigation, 
  MessageCircle, 
  Lock, 
  LogOut, 
  Compass, 
  AlertCircle, 
  Sparkles,
  Award,
  ChevronRight
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { playCashSound, playCelebrationFanfare, playBeep } from '../../utils/audio';
import { getTodayString } from '../../utils/storage';
import L from 'leaflet';

interface DeliveryDashboardProps {
  orders: BakeryOrder[];
  drivers: Driver[];
  settings: Settings;
  onUpdateOrderStatus: (orderId: string, status: 'entregado' | 'en_camino', collectedAmount: number) => void;
}

export const DeliveryDashboard: React.FC<DeliveryDashboardProps> = ({
  orders,
  drivers,
  settings,
  onUpdateOrderStatus
}) => {
  // Current logged in driver (default null or saved)
  const [activeDriverId, setActiveDriverId] = useState<'osvaldo' | 'simon' | null>(null);
  const [driverPinInput, setDriverPinInput] = useState<string>('');
  const [selectedDriverForLogin, setSelectedDriverForLogin] = useState<Driver | null>(null);
  const [pinError, setPinError] = useState<boolean>(false);

  // Active view: 'list' | 'map'
  const [activeTab, setActiveTab] = useState<'list' | 'map'>('list');
  const [selectedOrderForRoute, setSelectedOrderForRoute] = useState<BakeryOrder | null>(null);

  // Map Container Ref
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const todayStr = getTodayString();
  const currentDriver = drivers.find(d => d.id === activeDriverId);

  // Filter orders for active driver today
  const driverOrders = orders.filter(
    order => order.deliveryType === 'domicilio' && order.assignedDriverId === activeDriverId
  );

  const pendingOrders = driverOrders.filter(o => o.deliveryStatus !== 'entregado');
  const completedOrders = driverOrders.filter(o => o.deliveryStatus === 'entregado');

  // Total cash to collect and total already collected
  const pendingCashToCollect = pendingOrders.reduce((acc, o) => acc + (o.pendingAmount || 0), 0);
  const alreadyCollectedCash = completedOrders.reduce((acc, o) => acc + (o.collectedAmount || (o.paymentStatus === 'pagado' ? 0 : o.pendingAmount) || 0), 0);

  // Login handler
  const handleDriverLogin = (driver: Driver, pin: string) => {
    if (driver.pin === pin || pin === '1234') {
      setActiveDriverId(driver.id);
      setSelectedDriverForLogin(null);
      setDriverPinInput('');
      setPinError(false);
      playCashSound();
    } else {
      setPinError(true);
      playBeep(300, 'sawtooth', 0.1);
    }
  };

  // Quick mark as delivered
  const handleMarkDelivered = (order: BakeryOrder) => {
    playCelebrationFanfare();
    confetti({
      particleCount: 90,
      spread: 75,
      origin: { y: 0.6 },
      colors: ['#22c55e', '#3b82f6', '#f97316', '#eab308']
    });

    onUpdateOrderStatus(order.id, 'entregado', order.pendingAmount);
  };

  // Initialize or update Leaflet Map
  useEffect(() => {
    if (activeTab !== 'map' || !mapContainerRef.current) return;

    // Center on bakery headquarters (e.g. Mexico City Santa Fe area)
    const bakeryLocation: [number, number] = [19.4326, -99.1332];

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current).setView(bakeryLocation, 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // Clear previous markers
    map.eachLayer(layer => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline) {
        map.removeLayer(layer);
      }
    });

    // Add Bakery Headquarters Marker
    const bakeryIcon = L.divIcon({
      className: 'custom-bakery-icon',
      html: `<div style="background-color:#ea580c;color:white;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;border:3px solid white;box-shadow:0 4px 6px rgba(0,0,0,0.3);">🥖</div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });

    L.marker(bakeryLocation, { icon: bakeryIcon })
      .addTo(map)
      .bindPopup(`<b>${settings.bakeryName}</b><br>Base de Reparto y Salida`);

    // Add Delivery Markers
    const routePoints: [number, number][] = [bakeryLocation];

    pendingOrders.forEach((order, idx) => {
      const lat = order.coordinates?.lat || (19.4326 + (idx + 1) * 0.015 * (idx % 2 === 0 ? 1 : -1));
      const lng = order.coordinates?.lng || (-99.1332 + (idx + 1) * 0.012 * (idx % 2 === 0 ? -1 : 1));

      const stopIcon = L.divIcon({
        className: 'custom-stop-icon',
        html: `<div style="background-color:#2563eb;color:white;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:14px;border:2px solid white;box-shadow:0 3px 5px rgba(0,0,0,0.3);">${idx + 1}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([lat, lng], { icon: stopIcon }).addTo(map);
      marker.bindPopup(`
        <div style="font-family:sans-serif;font-size:12px;padding:4px;">
          <b style="color:#ea580c;font-size:13px;">Parada #${idx + 1}: ${order.customerName}</b><br/>
          <b>Folio:</b> ${order.folio}<br/>
          <b>Dirección:</b> ${order.address || 'Domicilio'}<br/>
          <b>Por cobrar:</b> <b style="color:#16a34a;">$${order.pendingAmount}.00</b><br/>
          <b>Hora:</b> ${order.deliveryTime}
        </div>
      `);

      routePoints.push([lat, lng]);
    });

    // Draw route polyline
    if (routePoints.length > 1) {
      const polyline = L.polyline(routePoints, {
        color: '#ea580c',
        weight: 4,
        opacity: 0.8,
        dashArray: '8, 8'
      }).addTo(map);

      map.fitBounds(polyline.getBounds(), { padding: [40, 40] });
    }

    setTimeout(() => {
      map.invalidateSize();
    }, 200);

  }, [activeTab, pendingOrders, settings.bakeryName]);

  // If no driver is logged in, show Driver Login Screen
  if (!currentDriver) {
    return (
      <div className="w-full max-w-4xl mx-auto space-y-6 py-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-orange-600 to-amber-500 text-white flex items-center justify-center mx-auto text-3xl shadow-lg">
            🛵
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            Módulo de Repartidores
          </h1>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Selecciona tu perfil de chofer para consultar tus entregas, ruta y corte de cobros
          </p>
        </div>

        {/* Driver Selection Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-2xl mx-auto">
          {drivers.map((driver) => {
            const assignedCount = orders.filter(
              o => o.deliveryType === 'domicilio' && o.assignedDriverId === driver.id && o.deliveryStatus !== 'entregado'
            ).length;

            return (
              <button
                key={driver.id}
                id={`driver-login-${driver.id}`}
                onClick={() => {
                  setSelectedDriverForLogin(driver);
                  setDriverPinInput('');
                  setPinError(false);
                }}
                className="bg-white hover:bg-orange-50/50 p-6 rounded-3xl border-2 border-slate-200 hover:border-orange-500 shadow-md hover:shadow-xl transition-all text-left flex flex-col justify-between space-y-4 group active:scale-98"
              >
                <div className="flex items-center space-x-4">
                  <div className={`w-14 h-14 rounded-2xl ${driver.avatarColor} text-white flex items-center justify-center font-black text-2xl shadow-md`}>
                    {driver.name.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 group-hover:text-orange-600 transition-colors">
                      {driver.name}
                    </h2>
                    <span className="text-xs font-semibold text-slate-500 block mt-0.5">
                      {driver.vehicle}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100 w-full">
                  <span className="bg-amber-100 text-amber-900 font-extrabold text-xs px-3 py-1 rounded-full">
                    {assignedCount} entregas pendientes hoy
                  </span>
                  <span className="text-orange-600 font-bold text-xs flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    Iniciar Turno <ChevronRight className="w-4 h-4" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Driver PIN Modal */}
        {selectedDriverForLogin && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full border border-amber-200 animate-in fade-in zoom-in-95 text-center space-y-4">
              <div className={`w-14 h-14 rounded-2xl ${selectedDriverForLogin.avatarColor} text-white flex items-center justify-center font-black text-2xl mx-auto shadow-md`}>
                {selectedDriverForLogin.name.charAt(0)}
              </div>

              <div>
                <h3 className="font-extrabold text-lg text-slate-900">
                  Hola, {selectedDriverForLogin.name.split(' ')[0]}
                </h3>
                <p className="text-xs text-slate-500">Ingresa tu PIN de 4 dígitos para ingresar (o 1234)</p>
              </div>

              <div className="space-y-3">
                <input
                  id="driver-pin-input"
                  type="password"
                  maxLength={4}
                  autoFocus
                  placeholder="PIN (4 dígitos)"
                  value={driverPinInput}
                  onChange={(e) => setDriverPinInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleDriverLogin(selectedDriverForLogin, driverPinInput);
                    }
                  }}
                  className="w-full text-center text-3xl tracking-widest font-black py-3 bg-slate-100 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />

                {pinError && (
                  <p className="text-xs font-bold text-rose-600">
                    PIN incorrecto. Intenta con {selectedDriverForLogin.pin} o 1234
                  </p>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setSelectedDriverForLogin(null)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    id="confirm-driver-login-btn"
                    onClick={() => handleDriverLogin(selectedDriverForLogin, driverPinInput)}
                    className="flex-1 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md transition-colors"
                  >
                    Ingresar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // LOGGED IN DRIVER VIEW (Osvaldo / Simón)
  return (
    <div className="w-full max-w-7xl mx-auto space-y-4">
      {/* Top Driver Header & Cash Balance Card */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-amber-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className={`w-13 h-13 rounded-2xl ${currentDriver.avatarColor} text-white flex items-center justify-center font-black text-2xl shadow-md`}>
            {currentDriver.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold text-slate-900">
                {currentDriver.name}
              </h1>
              <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                En Turno 🛵
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              {currentDriver.vehicle} • Tel: {currentDriver.phone}
            </p>
          </div>
        </div>

        {/* Cash Summary Badges */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-amber-50 border border-amber-200 px-4 py-2 rounded-2xl text-center">
            <span className="text-[10px] font-bold text-amber-800 uppercase block">
              Por Cobrar (Efectivo)
            </span>
            <span className="text-lg font-black text-orange-600">
              ${pendingCashToCollect}.00
            </span>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-2xl text-center">
            <span className="text-[10px] font-bold text-emerald-800 uppercase block">
              Cobrado Hoy en Ruta
            </span>
            <span className="text-lg font-black text-emerald-700">
              ${alreadyCollectedCash}.00
            </span>
          </div>

          <button
            id="driver-logout-btn"
            onClick={() => setActiveDriverId(null)}
            className="p-2.5 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-2xl transition-colors border border-slate-200"
            title="Cambiar de Repartidor"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tabs: List View vs Interactive Map View */}
      <div className="bg-white rounded-2xl p-2 shadow-xs border border-amber-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            id="tab-driver-list"
            onClick={() => setActiveTab('list')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all ${
              activeTab === 'list'
                ? 'bg-orange-600 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>Lista de Entregas ({pendingOrders.length} pendientes)</span>
          </button>

          <button
            id="tab-driver-map"
            onClick={() => setActiveTab('map')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all ${
              activeTab === 'map'
                ? 'bg-orange-600 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Mapa de Ruta y Ubicaciones 🗺️</span>
          </button>
        </div>

        <span className="text-xs text-slate-500 font-medium hidden sm:inline pr-2">
          {completedOrders.length} entregadas hoy de {driverOrders.length} totales
        </span>
      </div>

      {/* VIEW 1: MAP VIEW */}
      {activeTab === 'map' && (
        <div className="bg-white rounded-3xl p-4 shadow-sm border border-amber-200 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-orange-500"></span>
              <span>Ruta Sugerida Optimizada: Salida desde Panadería Santa Fé</span>
            </div>
            <span className="text-[11px] text-slate-500">
              {pendingOrders.length} paradas pendientes
            </span>
          </div>

          <div
            id="delivery-leaflet-map"
            ref={mapContainerRef}
            className="w-full h-[450px] rounded-2xl border border-slate-200 z-10"
          />

          {/* Quick List of Stops under map */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-2">
            {pendingOrders.map((order, idx) => (
              <div
                key={order.id}
                className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs flex items-center justify-between"
              >
                <div className="flex items-center space-x-2 truncate">
                  <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[11px] shrink-0">
                    {idx + 1}
                  </span>
                  <div className="truncate">
                    <strong className="block text-slate-900 truncate">{order.customerName}</strong>
                    <span className="text-[11px] text-slate-500 truncate block">{order.address}</span>
                  </div>
                </div>
                <span className="font-extrabold text-emerald-700 shrink-0 ml-2">
                  ${order.pendingAmount}.00
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW 2: LIST VIEW */}
      {activeTab === 'list' && (
        <div className="space-y-4">
          {/* Pending Deliveries Section */}
          <div className="space-y-3">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <span>📍 Entregas Pendientes por Realizar</span>
              <span className="bg-orange-100 text-orange-800 text-xs px-2.5 py-0.5 rounded-full font-bold">
                {pendingOrders.length} por entregar
              </span>
            </h2>

            {pendingOrders.length === 0 ? (
              <div className="bg-white rounded-3xl p-8 text-center border border-slate-200 space-y-2">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-3xl">
                  🎉
                </div>
                <h3 className="font-black text-slate-800 text-lg">¡Excelente trabajo, {currentDriver.name.split(' ')[0]}!</h3>
                <p className="text-xs text-slate-500">
                  Has entregado todos los pedidos asignados a tu ruta.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingOrders.map((order, idx) => {
                  const mapUrl = order.address 
                    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address)}`
                    : '#';
                  const phoneClean = order.customerPhone.replace(/\D/g, '');
                  const waUrl = `https://wa.me/52${phoneClean}?text=${encodeURIComponent(`Hola ${order.customerName}, soy ${currentDriver.name} de Panadería Santa Fé, voy en camino con su pedido de pan calientito.`)}`;

                  return (
                    <div
                      key={order.id}
                      className="bg-white rounded-3xl p-5 shadow-md border-2 border-amber-200 hover:border-orange-500 transition-all flex flex-col justify-between space-y-4"
                    >
                      {/* Top Bar */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center space-x-2">
                          <span className="w-8 h-8 rounded-xl bg-orange-600 text-white font-black text-sm flex items-center justify-center shadow-xs">
                            #{idx + 1}
                          </span>
                          <div>
                            <span className="font-mono text-[11px] font-extrabold text-orange-700 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                              {order.folio}
                            </span>
                            <h3 className="font-extrabold text-slate-900 text-base mt-0.5">
                              {order.customerName}
                            </h3>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] text-slate-500 uppercase block font-bold">Cobro al Entregar:</span>
                          <span className="text-xl font-black text-emerald-700">
                            ${order.pendingAmount}.00
                          </span>
                        </div>
                      </div>

                      {/* Address with Direct Navigation Button */}
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start space-x-1.5 text-slate-800 font-semibold">
                            <MapPin className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
                            <span>{order.address}</span>
                          </div>
                          <a
                            href={mapUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-2.5 py-1 rounded-lg text-[11px] flex items-center gap-1 shrink-0 shadow-xs"
                          >
                            <Navigation className="w-3 h-3" />
                            <span>GPS / Mapa</span>
                          </a>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1 border-t border-slate-200">
                          <span className="flex items-center gap-1 font-bold">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            Hora programada: {order.deliveryTime}
                          </span>
                          {order.notes && (
                            <span className="text-amber-800 italic truncate max-w-[160px]">
                              {order.notes}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Items Summary */}
                      <div className="bg-amber-50/50 p-2.5 rounded-xl border border-amber-100 text-xs">
                        <div className="font-bold text-amber-950 text-[11px] uppercase mb-1">
                          Productos del Encargo:
                        </div>
                        <div className="text-slate-800 line-clamp-2 font-medium">
                          {order.items.map(it => `${it.quantity}x ${it.name}`).join(' • ')}
                        </div>
                      </div>

                      {/* Action Buttons: Call, WhatsApp, Mark Delivered */}
                      <div className="space-y-2 pt-1">
                        <div className="grid grid-cols-2 gap-2">
                          {order.customerPhone && (
                            <>
                              <a
                                href={`tel:${order.customerPhone}`}
                                className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                              >
                                <Phone className="w-3.5 h-3.5 text-slate-600" />
                                <span>Llamar al Cliente</span>
                              </a>
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="py-2 px-3 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                              >
                                <MessageCircle className="w-3.5 h-3.5 text-emerald-700" />
                                <span>Avisar x WhatsApp</span>
                              </a>
                            </>
                          )}
                        </div>

                        {/* Celebratory Mark Delivered Button */}
                        <button
                          id={`mark-delivered-${order.id}`}
                          onClick={() => handleMarkDelivered(order)}
                          className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold py-3 px-4 rounded-2xl shadow-md hover:shadow-lg transition-all active:scale-98 flex items-center justify-center space-x-2 text-sm"
                        >
                          <CheckCircle2 className="w-5 h-5" />
                          <span>Marcar Entregado y Cobrar ${order.pendingAmount}.00 ✓</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Completed Deliveries History for this driver */}
          {completedOrders.length > 0 && (
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-3">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Entregas Completadas Hoy por {currentDriver.name.split(' ')[0]} ({completedOrders.length})</span>
              </h3>

              <div className="space-y-2">
                {completedOrders.map((order) => (
                  <div
                    key={order.id}
                    className="p-3 bg-emerald-50/60 rounded-2xl border border-emerald-200 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-emerald-900">{order.folio}</span>
                      <strong className="text-slate-900 ml-2">{order.customerName}</strong>
                      <span className="text-slate-500 block text-[11px]">{order.address}</span>
                    </div>

                    <div className="text-right">
                      <span className="text-emerald-800 font-extrabold text-sm block">
                        Cobrado: ${order.collectedAmount || order.pendingAmount || 0}.00
                      </span>
                      <span className="text-[10px] text-emerald-600 font-semibold">
                        ✓ Entregado con éxito
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
