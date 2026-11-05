/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  BreadProduct, 
  SaleTicket, 
  Customer, 
  BakeryOrder, 
  Driver,
  DriverCustomer 
} from './types';
import { 
  loadSettings, 
  saveSettings, 
  loadProducts, 
  saveProducts, 
  loadTickets, 
  saveTickets, 
  loadCustomers, 
  saveCustomers, 
  loadOrders, 
  saveOrders, 
  clearAllOrders,
  loadDrivers, 
  saveDrivers,
  loadDriverCustomers,
  saveDriverCustomers,
  mergeTickets,
  mergeOrders,
  mergeCustomers,
  markOrderAsDeleted,
  STORAGE_KEYS,
  DEFAULT_SETTINGS,
  DEFAULT_PRODUCTS,
  DEFAULT_DRIVERS,
  INITIAL_CUSTOMERS,
  INITIAL_ORDERS,
  INITIAL_TICKETS,
  getTodayString
} from './utils/storage';
import { Navbar, ActiveTabType } from './components/Navbar';
import { PosCounter } from './components/PosCounter/PosCounter';
import { OrdersManager } from './components/Orders/OrdersManager';
import { BakersWorkshop } from './components/Bakers/BakersWorkshop';
import { DeliveryDashboard } from './components/Delivery/DeliveryDashboard';
import { LoyaltyManager } from './components/Loyalty/LoyaltyManager';
import { SalesHistory } from './components/SalesHistory/SalesHistory';
import { ProductionAnalytics } from './components/Analytics/ProductionAnalytics';
import { AdminSettings } from './components/AdminSettings/AdminSettings';
import { 
  syncWithCloud, 
  fetchAndMergeCloud, 
  onCloudSyncUpdated, 
  getCloudSyncStatus,
  initFirebaseAutoSync,
  signInWithGoogle,
  logoutFirebase
} from './services/cloudSyncService';
import {
  saveSaleTicketToFirestore,
  deleteSaleTicketFromFirestore,
  saveOrderToFirestore,
  deleteOrderFromFirestore,
  saveCustomerToFirestore,
  subscribeToFirestoreDriverCustomers,
  syncAllDriverCustomersToFirestore
} from './services/firebase';

export default function App() {
  // Application Data States
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [products, setProducts] = useState<BreadProduct[]>(loadProducts);
  const [tickets, setTickets] = useState<SaleTicket[]>(loadTickets);
  const [customers, setCustomers] = useState<Customer[]>(loadCustomers);
  const [orders, setOrders] = useState<BakeryOrder[]>(loadOrders);
  const [drivers, setDrivers] = useState<Driver[]>(loadDrivers);
  const [driverCustomers, setDriverCustomers] = useState<DriverCustomer[]>(loadDriverCustomers);

  // Firebase connection and sync states
  const [firebaseStatus, setFirebaseStatus] = useState<{ connected: boolean; userEmail?: string }>({
    connected: false
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Active Navigation Tab
  const [activeTab, setActiveTab] = useState<ActiveTabType>('pos');

  // Accessibility Zoom Level (-1, 0, 1, 2)
  const [zoomLevel, setZoomLevel] = useState<number>(0);

  // Persistence effects
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    saveProducts(products);
  }, [products]);

  useEffect(() => {
    saveTickets(tickets);
  }, [tickets]);

  useEffect(() => {
    saveCustomers(customers);
  }, [customers]);

  useEffect(() => {
    saveOrders(orders);
  }, [orders]);

  useEffect(() => {
    saveDrivers(drivers);
  }, [drivers]);

  useEffect(() => {
    saveDriverCustomers(driverCustomers);
  }, [driverCustomers]);

  // Cloud Synchronization: Combina en lugar de sobreescribir entre Computadora y Teléfono con Firebase
  useEffect(() => {
    // 1. Inicializar conexión automática con Firebase
    const unsubFirebase = initFirebaseAutoSync((status) => {
      setFirebaseStatus(status);
    });

    // 2. Descargar y combinar datos existentes en la nube al abrir la app
    fetchAndMergeCloud();

    // 3. Escuchar actualizaciones de la nube y reflejarlas en el estado sin sobrescribir ventas recientes
    const unsubscribe = onCloudSyncUpdated((merged) => {
      if (merged.tickets && merged.tickets.length > 0) {
        setTickets(prev => {
          const combined = mergeTickets(prev, merged.tickets);
          if (combined.length === prev.length && combined.every((t, i) => t.id === prev[i]?.id)) {
            return prev;
          }
          return combined;
        });
      }
      if (merged.orders && merged.orders.length > 0) {
        setOrders(prev => {
          const combined = mergeOrders(prev, merged.orders);
          const isIdentical = combined.length === prev.length && combined.every((o, i) => {
            const p = prev[i];
            return (
              p &&
              o.id === p.id &&
              o.folio === p.folio &&
              o.paymentStatus === p.paymentStatus &&
              o.deliveryStatus === p.deliveryStatus &&
              o.pendingAmount === p.pendingAmount &&
              o.deposit === p.deposit &&
              o.total === p.total &&
              o.collectedAmount === p.collectedAmount
            );
          });
          if (isIdentical) {
            return prev;
          }
          saveOrders(combined);
          return combined;
        });
      }
      if (merged.customers && merged.customers.length > 0) {
        setCustomers(prev => {
          const combined = mergeCustomers(prev, merged.customers);
          if (combined.length === prev.length && combined.every((c, i) => c.id === prev[i]?.id)) {
            return prev;
          }
          return combined;
        });
      }
    });

    // 4. Escuchar clientes de reparto en tiempo real desde Firestore
    const unsubDriverCustomers = subscribeToFirestoreDriverCustomers((cloudCustomers) => {
      if (cloudCustomers && cloudCustomers.length > 0) {
        setDriverCustomers(prev => {
          const map = new Map<string, DriverCustomer>();
          prev.forEach(c => map.set(c.id, c));
          cloudCustomers.forEach(c => map.set(c.id, c));
          const merged = Array.from(map.values());
          saveDriverCustomers(merged);
          return merged;
        });
      }
    });

    // Sincronizar clientes iniciales a Firestore si aún no están subidos
    const localDriversCust = loadDriverCustomers();
    if (localDriversCust.length > 0) {
      syncAllDriverCustomersToFirestore(localDriversCust).catch(() => {});
    }

    // 5. Sincronizar entre pestañas abiertas en el mismo dispositivo
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'santafe_tickets') {
        setTickets(prev => mergeTickets(prev, loadTickets()));
      } else if (e.key === 'santafe_orders') {
        setOrders(prev => mergeOrders(prev, loadOrders()));
      } else if (e.key === 'santafe_customers') {
        setCustomers(prev => mergeCustomers(prev, loadCustomers()));
      } else if (e.key === 'santafe_driver_customers') {
        setDriverCustomers(loadDriverCustomers());
      }
    };
    window.addEventListener('storage', handleStorageChange);

    // 6. Chequeo periódico en segundo plano cada 30 segundos
    const syncInterval = setInterval(() => {
      fetchAndMergeCloud();
    }, 30000);

    return () => {
      unsubFirebase();
      unsubDriverCustomers();
      unsubscribe();
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(syncInterval);
    };
  }, []);

  // Sincronizar automáticamente hacia la nube tras registrar cambios
  useEffect(() => {
    const timeout = setTimeout(() => {
      syncWithCloud({ tickets, orders, customers });
    }, 1200);
    return () => clearTimeout(timeout);
  }, [tickets, orders, customers]);

  const handleConnectFirebase = async () => {
    setIsSyncing(true);
    try {
      await signInWithGoogle();
      await fetchAndMergeCloud();
    } catch (err) {
      console.warn('Conexión con Firebase cancelada o error:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDisconnectFirebase = async () => {
    try {
      await logoutFirebase();
      setFirebaseStatus({ connected: false });
    } catch (err) {
      console.error(err);
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await syncWithCloud({ tickets, orders, customers });
      await fetchAndMergeCloud();
    } finally {
      setIsSyncing(false);
    }
  };

  // Handlers
  const handleSaveTicket = (newTicket: SaleTicket, updatedCustomer?: Customer) => {
    // 1. Guardar de forma SÍNCRONA e inmediata en localStorage antes de cualquier otra cosa (cero latencia en caja)
    const currentTickets = loadTickets();
    const merged = mergeTickets([newTicket], currentTickets);
    localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(merged));

    // 2. Actualizar estado de React functionalmente asegurando que newTicket esté presente
    setTickets(prev => mergeTickets([newTicket], prev));

    if (updatedCustomer) {
      setCustomers(prev => {
        const idx = prev.findIndex(c => c.id === updatedCustomer.id || c.phone === updatedCustomer.phone);
        let updatedList: Customer[];
        if (idx >= 0) {
          updatedList = [...prev];
          updatedList[idx] = updatedCustomer;
        } else {
          updatedList = [updatedCustomer, ...prev];
        }
        localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(updatedList));
        return updatedList;
      });
    }

    // 3. Guardar en Firebase Firestore de inmediato y de forma segura
    saveSaleTicketToFirestore(newTicket).catch(err => {
      console.warn('Venta respaldada localmente, sincronización pendiente:', err);
    });

    if (updatedCustomer) {
      saveCustomerToFirestore(updatedCustomer).catch(console.warn);
    }

    // 4. Disparar sincronización con la nube con los datos actualizados
    syncWithCloud({ tickets: merged, customers: updatedCustomer ? [updatedCustomer] : [] });
  };

  const handleUpdateTicket = (updatedTicket: SaleTicket) => {
    setTickets(prev => {
      const updated = prev.map(t => (t.id === updatedTicket.id ? updatedTicket : t));
      saveTickets(updated, true);
      return updated;
    });
    saveSaleTicketToFirestore(updatedTicket).catch(console.warn);
    syncWithCloud({ tickets: [updatedTicket] });
  };

  const handleDeleteTicket = (ticketId: string) => {
    const updated = loadTickets().filter(t => t.id !== ticketId);
    saveTickets(updated, true);
    setTickets(updated);
    deleteSaleTicketFromFirestore(ticketId).catch(console.warn);
  };

  const handleRegisterCustomer = (newCustomer: Customer) => {
    setCustomers(prev => [newCustomer, ...prev]);
    saveCustomerToFirestore(newCustomer).catch(console.warn);
    syncWithCloud({ customers: [newCustomer] });
  };

  const handleUpdateCustomer = (updatedCustomer: Customer) => {
    setCustomers(prev =>
      prev.map(c => (c.id === updatedCustomer.id ? updatedCustomer : c))
    );
    saveCustomerToFirestore(updatedCustomer).catch(console.warn);
    syncWithCloud({ customers: [updatedCustomer] });
  };

  const handleSaveOrder = (newOrder: BakeryOrder) => {
    setOrders(prev => {
      const updated = [newOrder, ...prev.filter(o => o.id !== newOrder.id)];
      saveOrders(updated);
      return updated;
    });
    saveOrderToFirestore(newOrder).catch(console.warn);
    syncWithCloud({ orders: [newOrder] });
  };

  const handleUpdateOrder = (updatedOrder: BakeryOrder) => {
    setOrders(prev => {
      const updated = prev.map(o => (o.id === updatedOrder.id ? updatedOrder : o));
      saveOrders(updated);
      return updated;
    });
    saveOrderToFirestore(updatedOrder).catch(console.warn);
    syncWithCloud({ orders: [updatedOrder] });
  };

  const handleDeleteOrder = (orderId: string) => {
    setOrders(prev => {
      const orderToDelete = prev.find(o => o.id === orderId);
      if (orderToDelete) {
        markOrderAsDeleted(orderToDelete.id, orderToDelete.folio);
      } else {
        markOrderAsDeleted(orderId);
      }
      const updated = prev.filter(o => o.id !== orderId);
      saveOrders(updated, true);
      return updated;
    });
    deleteOrderFromFirestore(orderId).catch(console.warn);
  };

  const handleToggleItemDone = (orderId: string, itemIdx: number) => {
    setOrders(prev =>
      prev.map(o => {
        if (o.id === orderId) {
          const updatedItems = [...o.items];
          updatedItems[itemIdx] = {
            ...updatedItems[itemIdx],
            done: !updatedItems[itemIdx].done
          };
          return {
            ...o,
            items: updatedItems
          };
        }
        return o;
      })
    );
  };

  const handleUpdateOrderStatus = (
    orderId: string,
    status: 'entregado' | 'en_camino',
    collectedAmount: number
  ) => {
    setOrders(prev =>
      prev.map(o => {
        if (o.id === orderId) {
          return {
            ...o,
            deliveryStatus: status,
            collectedAmount: (o.collectedAmount || 0) + collectedAmount,
            pendingAmount: status === 'entregado' ? 0 : o.pendingAmount,
            deliveredAt: status === 'entregado' ? new Date().toISOString() : o.deliveredAt
          };
        }
        return o;
      })
    );
  };

  const handleResetData = () => {
    setSettings(DEFAULT_SETTINGS);
    setProducts(DEFAULT_PRODUCTS);
    setDrivers(DEFAULT_DRIVERS);
    setCustomers(INITIAL_CUSTOMERS);
    setOrders(INITIAL_ORDERS);
    setTickets(INITIAL_TICKETS);
    localStorage.clear();
  };

  const handleClearOrders = () => {
    clearAllOrders();
    setOrders([]);
    syncWithCloud({ orders: [] }).catch(console.error);
  };

  const handleToggleZoom = (delta: number) => {
    setZoomLevel(prev => Math.min(2, Math.max(-1, prev + delta)));
  };

  // Badge counts
  const todayStr = getTodayString();
  const pendingOrdersCount = orders.filter(
    o => o.deliveryDate === todayStr && o.deliveryStatus !== 'entregado'
  ).length;

  const pendingProductionCount = orders
    .filter(o => o.deliveryDate === todayStr)
    .reduce((acc, o) => acc + o.items.filter(i => !i.done).length, 0);

  const pendingDeliveriesCount = orders.filter(
    o => o.deliveryType === 'domicilio' && o.deliveryDate === todayStr && o.deliveryStatus !== 'entregado'
  ).length;

  const zoomStyle = zoomLevel === 1 
    ? { fontSize: '108%' } 
    : zoomLevel === 2 
    ? { fontSize: '116%' } 
    : zoomLevel === -1 
    ? { fontSize: '94%' } 
    : {};

  return (
    <div 
      className="min-h-screen bg-[#FAF8F6] text-slate-800 flex flex-col selection:bg-[#D95D39] selection:text-white"
      style={zoomStyle}
    >
      {/* Sticky Top Navigation */}
      <Navbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        settings={settings}
        pendingOrdersCount={pendingOrdersCount}
        pendingProductionCount={pendingProductionCount}
        pendingDeliveriesCount={pendingDeliveriesCount}
        zoomLevel={zoomLevel}
        onToggleZoom={handleToggleZoom}
        firebaseStatus={firebaseStatus}
        onConnectFirebase={handleConnectFirebase}
        onDisconnectFirebase={handleDisconnectFirebase}
        onManualSync={handleManualSync}
        isSyncing={isSyncing}
        tickets={tickets}
        orders={orders}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-2 sm:p-3">
        {activeTab === 'pos' && (
          <PosCounter
            products={products}
            settings={settings}
            customers={customers}
            driverCustomers={driverCustomers}
            tickets={tickets}
            onSaveTicket={handleSaveTicket}
            onUpdateTicket={handleUpdateTicket}
            onRegisterCustomer={handleRegisterCustomer}
            onSaveOrder={handleSaveOrder}
          />
        )}

        {activeTab === 'orders' && (
          <OrdersManager
            orders={orders}
            products={products}
            settings={settings}
            drivers={drivers}
            customers={customers}
            driverCustomers={driverCustomers}
            onSaveOrder={handleSaveOrder}
            onUpdateOrder={handleUpdateOrder}
            onSaveTicket={handleSaveTicket}
            onDeleteTicket={handleDeleteTicket}
            onUpdateCustomer={handleUpdateCustomer}
            onUpdateDriverCustomers={setDriverCustomers}
            onDeleteOrder={handleDeleteOrder}
          />
        )}

        {activeTab === 'bakers' && (
          <BakersWorkshop
            orders={orders}
            onToggleItemDone={handleToggleItemDone}
          />
        )}

        {activeTab === 'delivery' && (
          <DeliveryDashboard
            orders={orders}
            drivers={drivers}
            settings={settings}
            onUpdateOrderStatus={handleUpdateOrderStatus}
          />
        )}

        {activeTab === 'loyalty' && (
          <LoyaltyManager
            customers={customers}
            settings={settings}
            onRegisterCustomer={handleRegisterCustomer}
            onUpdateCustomer={handleUpdateCustomer}
          />
        )}

        {activeTab === 'analytics' && (
          <ProductionAnalytics
            tickets={tickets}
          />
        )}

        {activeTab === 'history' && (
          <SalesHistory
            tickets={tickets}
            orders={orders}
            drivers={drivers}
            driverCustomers={driverCustomers}
            settings={settings}
            onDeleteTicket={handleDeleteTicket}
            onUpdateOrder={handleUpdateOrder}
            onClearOrders={handleClearOrders}
          />
        )}

        {activeTab === 'admin' && (
          <AdminSettings
            settings={settings}
            products={products}
            drivers={drivers}
            driverCustomers={driverCustomers}
            onSaveSettings={setSettings}
            onSaveProducts={setProducts}
            onSaveDrivers={setDrivers}
            onSaveDriverCustomers={setDriverCustomers}
            onResetData={handleResetData}
          />
        )}
      </main>

      {/* Footer in Natural Tones theme */}
      <footer className="py-3 px-4 sm:px-8 text-xs bg-[#FFF5F0] border-t border-[#E5E1DA] text-slate-600 no-print">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <span className="font-serif italic font-bold text-[#D95D39] text-sm">Santa Fé</span>
            <span className="text-slate-400">•</span>
            <span className="text-slate-600 font-medium">
              {settings.address} • Tel: {settings.phone}
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <div className="w-2 h-2 bg-emerald-500 rounded-full mr-1.5 animate-pulse"></div>
              <span className="text-[11px] font-bold text-slate-600 tracking-wide">TICKETS TÉRMICOS OK</span>
            </div>
            <div className="flex items-center">
              <div className="w-2 h-2 bg-emerald-500 rounded-full mr-1.5"></div>
              <span className="text-[11px] font-bold text-slate-600 tracking-wide">WHATSAPP / CAJA OK</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
