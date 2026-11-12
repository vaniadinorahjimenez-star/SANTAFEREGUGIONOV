/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Settings, 
  BreadProduct, 
  SaleTicket, 
  Customer, 
  BakeryOrder, 
  Driver,
  DriverCustomer,
  OperationalExpense,
  SupplierBill,
  VipCustomer,
  VipOrder,
  BranchId
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
  loadOperationalExpenses,
  saveOperationalExpenses,
  loadSupplierBills,
  saveSupplierBills,
  loadVipCustomers,
  saveVipCustomers,
  mergeVipCustomers,
  loadVipOrders,
  saveVipOrders,
  mergeVipOrders,
  mergeTickets,
  mergeOrders,
  mergeCustomers,
  mergeOperationalExpenses,
  mergeSupplierBills,
  markOrderAsDeleted,
  markTicketAsDeleted,
  markOperationalExpenseAsDeleted,
  markSupplierBillAsDeleted,
  markVipCustomerAsDeleted,
  markVipOrderAsDeleted,
  getDeletedTicketIds,
  getDeletedOrderIds,
  getDeletedOperationalExpenseIds,
  getDeletedSupplierBillIds,
  getDeletedVipCustomerIds,
  getDeletedVipOrderIds,
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
import { VipCustomersManager } from './components/VipCustomers/VipCustomersManager';
import { BakersWorkshop } from './components/Bakers/BakersWorkshop';
import { ExpensesManager } from './components/Expenses/ExpensesManager';
import { LoyaltyManager } from './components/Loyalty/LoyaltyManager';
import { SalesHistory } from './components/SalesHistory/SalesHistory';
import { ProductionAnalytics } from './components/Analytics/ProductionAnalytics';
import { AdminSettings } from './components/AdminSettings/AdminSettings';
import { PasswordProtectionModal } from './components/Common/PasswordProtectionModal';
import { 
  syncWithCloud, 
  fetchAndMergeCloud, 
  onCloudSyncUpdated, 
  notifyCloudDeletion,
  initFirebaseAutoSync,
  signInWithGoogle,
  logoutFirebase
} from './services/cloudSyncService';
import type { PusherStatusInfo } from './services/pusherService';
import {
  saveSaleTicketToFirestore,
  deleteSaleTicketFromFirestore,
  saveOrderToFirestore,
  deleteOrderFromFirestore,
  saveCustomerToFirestore,
  subscribeToFirestoreDriverCustomers,
  syncAllDriverCustomersToFirestore,
  saveOperationalExpenseToFirestore,
  deleteOperationalExpenseFromFirestore,
  saveSupplierBillToFirestore,
  deleteSupplierBillFromFirestore,
  saveVipCustomerToFirestore,
  deleteVipCustomerFromFirestore,
  subscribeToVipCustomers,
  saveVipOrderToFirestore,
  deleteVipOrderFromFirestore,
  subscribeToVipOrders,
  isQuotaExceeded
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
  const [operationalExpenses, setOperationalExpenses] = useState<OperationalExpense[]>(loadOperationalExpenses);
  const [supplierBills, setSupplierBills] = useState<SupplierBill[]>(loadSupplierBills);
  const [vipCustomers, setVipCustomers] = useState<VipCustomer[]>(loadVipCustomers);
  const [vipOrders, setVipOrders] = useState<VipOrder[]>(loadVipOrders);

  // Firebase + Pusher connection and sync states
  const [firebaseStatus, setFirebaseStatus] = useState<{ connected: boolean; userEmail?: string; pusher?: PusherStatusInfo }>({
    connected: false
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [pusherToast, setPusherToast] = useState<{ id: number; message: string } | null>(null);

  // Active Navigation Tab
  const [activeTab, setActiveTab] = useState<ActiveTabType>('pos');

  // Active Branch ('refugio' | 'zakia')
  const [activeBranch, setActiveBranch] = useState<BranchId>(() => {
    const saved = localStorage.getItem('santafe_active_branch');
    return saved === 'zakia' ? 'zakia' : 'refugio';
  });

  // Session-based unlocked flags
  const [unlockedRefugio, setUnlockedRefugio] = useState<boolean>(() => {
    return sessionStorage.getItem('santafe_unlocked_refugio') === 'true';
  });
  const [unlockedZakia, setUnlockedZakia] = useState<boolean>(() => {
    return sessionStorage.getItem('santafe_unlocked_zakia') === 'true';
  });
  const [unlockedAdmin, setUnlockedAdmin] = useState<boolean>(() => {
    return sessionStorage.getItem('santafe_unlocked_admin') === 'true';
  });

  // Password Protection Modal State
  const [passwordModalConfig, setPasswordModalConfig] = useState<{
    isOpen: boolean;
    targetTitle: string;
    targetSubtitle?: string;
    expectedPassword: string;
    badgeText?: string;
    badgeColor?: 'orange' | 'emerald' | 'indigo';
    onSuccessAction: () => void;
  }>({
    isOpen: false,
    targetTitle: '',
    expectedPassword: '',
    onSuccessAction: () => {}
  });

  const handleSelectBranchPos = (branch: BranchId) => {
    if (branch === 'refugio') {
      if (unlockedRefugio) {
        setActiveBranch('refugio');
        setActiveTab('pos');
        localStorage.setItem('santafe_active_branch', 'refugio');
      } else {
        setPasswordModalConfig({
          isOpen: true,
          targetTitle: 'Mostrador El Refugio',
          targetSubtitle: 'Ingresa la clave de acceso para continuar',
          expectedPassword: 'refugio',
          badgeText: 'Sucursal Refugio',
          badgeColor: 'orange',
          onSuccessAction: () => {
            sessionStorage.setItem('santafe_unlocked_refugio', 'true');
            setUnlockedRefugio(true);
            setActiveBranch('refugio');
            setActiveTab('pos');
            localStorage.setItem('santafe_active_branch', 'refugio');
            setPasswordModalConfig(prev => ({ ...prev, isOpen: false }));
          }
        });
      }
    } else if (branch === 'zakia') {
      if (unlockedZakia) {
        setActiveBranch('zakia');
        setActiveTab('pos');
        localStorage.setItem('santafe_active_branch', 'zakia');
      } else {
        setPasswordModalConfig({
          isOpen: true,
          targetTitle: 'Mostrador Zakia',
          targetSubtitle: 'Ingresa la clave de acceso para continuar',
          expectedPassword: 'zakia',
          badgeText: 'Sucursal Zakia',
          badgeColor: 'emerald',
          onSuccessAction: () => {
            sessionStorage.setItem('santafe_unlocked_zakia', 'true');
            setUnlockedZakia(true);
            setActiveBranch('zakia');
            setActiveTab('pos');
            localStorage.setItem('santafe_active_branch', 'zakia');
            setPasswordModalConfig(prev => ({ ...prev, isOpen: false }));
          }
        });
      }
    }
  };

  const handleSelectTabWithSecurity = (tab: ActiveTabType) => {
    if (tab === 'history' || tab === 'expenses') {
      if (unlockedAdmin) {
        setActiveTab(tab);
      } else {
        const title = tab === 'history' ? 'Historial y Caja' : 'Gastos y Proveedores';
        setPasswordModalConfig({
          isOpen: true,
          targetTitle: title,
          targetSubtitle: 'Ingresa la clave de acceso para continuar',
          expectedPassword: '135792',
          badgeText: 'Acceso Protegido',
          badgeColor: 'indigo',
          onSuccessAction: () => {
            sessionStorage.setItem('santafe_unlocked_admin', 'true');
            setUnlockedAdmin(true);
            setActiveTab(tab);
            setPasswordModalConfig(prev => ({ ...prev, isOpen: false }));
          }
        });
      }
    } else if (tab === 'pos') {
      handleSelectBranchPos(activeBranch);
    } else {
      setActiveTab(tab);
    }
  };

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

  useEffect(() => {
    saveOperationalExpenses(operationalExpenses);
  }, [operationalExpenses]);

  useEffect(() => {
    saveSupplierBills(supplierBills);
  }, [supplierBills]);

  useEffect(() => {
    saveVipCustomers(vipCustomers);
  }, [vipCustomers]);

  useEffect(() => {
    saveVipOrders(vipOrders);
  }, [vipOrders]);

  // Cloud Synchronization: Combina en lugar de sobreescribir entre Computadora y Teléfono con Firebase
  useEffect(() => {
    // 1. Inicializar conexión automática con Firebase
    const unsubFirebase = initFirebaseAutoSync((status) => {
      setFirebaseStatus(status);
    });

    // 2. Descargar y combinar datos existentes en la nube al abrir la app de inmediato
    fetchAndMergeCloud().then(res => {
      if (res.success && res.mergedData) {
        if (res.mergedData.orders && res.mergedData.orders.length > 0) {
          setOrders(res.mergedData.orders);
        }
        if (res.mergedData.tickets && res.mergedData.tickets.length > 0) {
          setTickets(res.mergedData.tickets);
        }
        if (res.mergedData.customers && res.mergedData.customers.length > 0) {
          setCustomers(res.mergedData.customers);
        }
        if (res.mergedData.operationalExpenses) {
          setOperationalExpenses(res.mergedData.operationalExpenses);
        }
        if (res.mergedData.supplierBills) {
          setSupplierBills(res.mergedData.supplierBills);
        }
        if (res.mergedData.vipCustomers) {
          setVipCustomers(res.mergedData.vipCustomers);
        }
        if (res.mergedData.vipOrders) {
          setVipOrders(res.mergedData.vipOrders);
        }
      }
    }).catch(console.warn);

    // 3. Escuchar actualizaciones de la nube (Firebase + Pusher) y reflejarlas en el estado en tiempo real
    const unsubscribe = onCloudSyncUpdated((merged) => {
      if (merged.tickets) {
        const delT = getDeletedTicketIds();
        setTickets(prev => mergeTickets(prev.filter(t => !delT.has(t.id) && !(t.folio && delT.has(t.folio))), merged.tickets));
      }
      if (merged.orders) {
        const delO = getDeletedOrderIds();
        setOrders(prev => {
          const filteredPrev = prev.filter(o => !delO.has(o.id) && !(o.folio && delO.has(o.folio)));
          const combined = mergeOrders(filteredPrev, merged.orders);
          saveOrders(combined, true);
          return combined;
        });
      }
      if (merged.customers) {
        setCustomers(prev => mergeCustomers(prev, merged.customers));
      }
      if (merged.operationalExpenses) {
        const delE = getDeletedOperationalExpenseIds();
        setOperationalExpenses(prev => mergeOperationalExpenses(prev.filter(e => !delE.has(e.id)), merged.operationalExpenses));
      }
      if (merged.supplierBills) {
        const delB = getDeletedSupplierBillIds();
        setSupplierBills(prev => mergeSupplierBills(prev.filter(b => !delB.has(b.id)), merged.supplierBills));
      }
      if (merged.vipCustomers) {
        const delVC = getDeletedVipCustomerIds();
        setVipCustomers(prev => mergeVipCustomers(prev.filter(c => !delVC.has(c.id)), merged.vipCustomers));
      }
      if (merged.vipOrders) {
        const delVO = getDeletedVipOrderIds();
        setVipOrders(prev => mergeVipOrders(prev.filter(o => !delVO.has(o.id)), merged.vipOrders));
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

    // 4b. Escuchar clientes VIP en tiempo real desde Firestore
    const unsubVipCustomers = subscribeToVipCustomers((cloudCustomers) => {
      if (cloudCustomers && cloudCustomers.length > 0) {
        setVipCustomers(prev => {
          const merged = mergeVipCustomers(prev, cloudCustomers);
          saveVipCustomers(merged);
          return merged;
        });
      }
    });

    // 4c. Escuchar pedidos VIP en tiempo real desde Firestore
    const unsubVipOrders = subscribeToVipOrders((cloudOrders) => {
      if (cloudOrders && cloudOrders.length > 0) {
        setVipOrders(prev => {
          const merged = mergeVipOrders(prev, cloudOrders);
          saveVipOrders(merged);
          return merged;
        });
      }
    });

    // Sincronizar clientes iniciales a Firestore solo una vez si no se ha hecho
    const hasSyncedDrivers = localStorage.getItem('santafe_driver_customers_synced_v1');
    if (!hasSyncedDrivers && !isQuotaExceeded()) {
      const localDriversCust = loadDriverCustomers();
      if (localDriversCust.length > 0) {
        syncAllDriverCustomersToFirestore(localDriversCust).then(() => {
          try { localStorage.setItem('santafe_driver_customers_synced_v1', 'true'); } catch {}
        }).catch(() => {});
      }
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
      } else if (e.key === 'santafe_operational_expenses') {
        setOperationalExpenses(loadOperationalExpenses());
      } else if (e.key === 'santafe_supplier_bills') {
        setSupplierBills(loadSupplierBills());
      } else if (e.key === 'santafe_vip_customers') {
        setVipCustomers(loadVipCustomers());
      } else if (e.key === 'santafe_vip_orders') {
        setVipOrders(loadVipOrders());
      }
    };
    window.addEventListener('storage', handleStorageChange);

    const handleDailyDeliveryUpdated = () => {
      setTickets(loadTickets());
    };
    window.addEventListener('dailyDeliveryUpdated', handleDailyDeliveryUpdated);

    let toastTimer: ReturnType<typeof setTimeout> | null = null;
    const handlePusherCustomEvent = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      const data = detail?.data;
      let text = '';
      if (typeof data === 'string') {
        text = data;
      } else if (data && typeof data === 'object') {
        text = data.message || data.text || JSON.stringify(data);
      } else {
        text = 'Actualización recibida en tiempo real';
      }
      if (text.length > 160) {
        text = `${text.slice(0, 157)}...`;
      }
      setPusherToast({ id: Date.now(), message: text });
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        setPusherToast(null);
      }, 5000);
    };
    window.addEventListener('santafe:pusher-event', handlePusherCustomEvent);

    // 6. Chequeo periódico en segundo plano cada 60 segundos (solo lectura remota para nuevos tickets/pedidos)
    const syncInterval = setInterval(() => {
      if (!isQuotaExceeded()) {
        fetchAndMergeCloud();
      }
    }, 60000);

    return () => {
      unsubFirebase();
      unsubDriverCustomers();
      unsubVipCustomers();
      unsubVipOrders();
      unsubscribe();
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('dailyDeliveryUpdated', handleDailyDeliveryUpdated);
      window.removeEventListener('santafe:pusher-event', handlePusherCustomEvent);
      if (toastTimer) clearTimeout(toastTimer);
      clearInterval(syncInterval);
    };
  }, []);

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
      await syncWithCloud({
        tickets,
        orders,
        customers,
        operationalExpenses,
        supplierBills,
        vipCustomers,
        vipOrders
      });
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
    syncWithCloud({ tickets: [newTicket], customers: updatedCustomer ? [updatedCustomer] : [] });
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
    const target = loadTickets().find(t => t.id === ticketId);
    markTicketAsDeleted(ticketId, target?.folio);
    const updated = loadTickets().filter(t => t.id !== ticketId);
    saveTickets(updated, true);
    setTickets(updated);
    deleteSaleTicketFromFirestore(ticketId).catch(console.warn);
    notifyCloudDeletion('tickets', target?.folio ? [ticketId, target.folio] : [ticketId]).catch(() => {});
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
    let deletedKeys = [orderId];
    setOrders(prev => {
      const orderToDelete = prev.find(o => o.id === orderId);
      if (orderToDelete) {
        markOrderAsDeleted(orderToDelete.id, orderToDelete.folio);
        if (orderToDelete.folio) deletedKeys = [orderToDelete.id, orderToDelete.folio];
      } else {
        markOrderAsDeleted(orderId);
      }
      const updated = prev.filter(o => o.id !== orderId);
      saveOrders(updated, true);
      return updated;
    });
    deleteOrderFromFirestore(orderId).catch(console.warn);
    notifyCloudDeletion('orders', deletedKeys).catch(() => {});
  };

  const handleToggleItemDone = (orderId: string, itemIdx: number) => {
    let updatedOrderRef: BakeryOrder | null = null;
    setOrders(prev =>
      prev.map(o => {
        if (o.id === orderId) {
          const updatedItems = [...o.items];
          updatedItems[itemIdx] = {
            ...updatedItems[itemIdx],
            done: !updatedItems[itemIdx].done
          };
          updatedOrderRef = {
            ...o,
            items: updatedItems
          };
          return updatedOrderRef;
        }
        return o;
      })
    );
    if (updatedOrderRef) {
      saveOrderToFirestore(updatedOrderRef).catch(console.warn);
      syncWithCloud({ orders: [updatedOrderRef] });
    }
  };

  const handleUpdateOrderStatus = (
    orderId: string,
    status: 'entregado' | 'en_camino',
    collectedAmount: number
  ) => {
    let updatedOrderRef: BakeryOrder | null = null;
    setOrders(prev =>
      prev.map(o => {
        if (o.id === orderId) {
          updatedOrderRef = {
            ...o,
            deliveryStatus: status,
            collectedAmount: (o.collectedAmount || 0) + collectedAmount,
            pendingAmount: status === 'entregado' ? 0 : o.pendingAmount,
            deliveredAt: status === 'entregado' ? new Date().toISOString() : o.deliveredAt
          };
          return updatedOrderRef;
        }
        return o;
      })
    );
    if (updatedOrderRef) {
      saveOrderToFirestore(updatedOrderRef).catch(console.warn);
      syncWithCloud({ orders: [updatedOrderRef] });
    }
  };

  const handleSaveExpense = (newExpense: OperationalExpense) => {
    setOperationalExpenses(prev => {
      const idx = prev.findIndex(e => e.id === newExpense.id);
      let updated: OperationalExpense[];
      if (idx >= 0) {
        updated = [...prev];
        updated[idx] = newExpense;
      } else {
        updated = [newExpense, ...prev];
      }
      saveOperationalExpenses(updated);
      return updated;
    });
    saveOperationalExpenseToFirestore(newExpense).catch(console.warn);
    syncWithCloud({ operationalExpenses: [newExpense] });
  };

  const handleDeleteExpense = (expenseId: string) => {
    markOperationalExpenseAsDeleted(expenseId);
    setOperationalExpenses(prev => {
      const updated = prev.filter(e => e.id !== expenseId);
      saveOperationalExpenses(updated);
      return updated;
    });
    deleteOperationalExpenseFromFirestore(expenseId).catch(console.warn);
    notifyCloudDeletion('operationalExpenses', [expenseId]).catch(() => {});
  };

  const handleSaveSupplierBill = (bill: SupplierBill) => {
    setSupplierBills(prev => {
      const idx = prev.findIndex(b => b.id === bill.id);
      let updated: SupplierBill[];
      if (idx >= 0) {
        updated = [...prev];
        updated[idx] = bill;
      } else {
        updated = [bill, ...prev];
      }
      saveSupplierBills(updated);
      return updated;
    });
    saveSupplierBillToFirestore(bill).catch(console.warn);
    syncWithCloud({ supplierBills: [bill] });
  };

  const handleDeleteSupplierBill = (billId: string) => {
    markSupplierBillAsDeleted(billId);
    setSupplierBills(prev => {
      const updated = prev.filter(b => b.id !== billId);
      saveSupplierBills(updated);
      return updated;
    });
    deleteSupplierBillFromFirestore(billId).catch(console.warn);
    notifyCloudDeletion('supplierBills', [billId]).catch(() => {});
  };

  const handleSaveVipCustomer = (customer: VipCustomer) => {
    setVipCustomers(prev => {
      const idx = prev.findIndex(c => c.id === customer.id);
      let updated: VipCustomer[];
      if (idx >= 0) {
        updated = [...prev];
        updated[idx] = customer;
      } else {
        updated = [customer, ...prev];
      }
      saveVipCustomers(updated);
      return updated;
    });
    saveVipCustomerToFirestore(customer).catch(console.warn);
    syncWithCloud({ vipCustomers: [customer] });
  };

  const handleDeleteVipCustomer = (customerId: string) => {
    markVipCustomerAsDeleted(customerId);
    setVipCustomers(prev => {
      const updated = prev.filter(c => c.id !== customerId);
      saveVipCustomers(updated);
      return updated;
    });
    deleteVipCustomerFromFirestore(customerId).catch(console.warn);
    notifyCloudDeletion('vipCustomers', [customerId]).catch(() => {});
  };

  const handleSaveVipOrder = (order: VipOrder) => {
    setVipOrders(prev => {
      const idx = prev.findIndex(o => o.id === order.id);
      let updated: VipOrder[];
      if (idx >= 0) {
        updated = [...prev];
        updated[idx] = order;
      } else {
        updated = [order, ...prev];
      }
      saveVipOrders(updated);
      return updated;
    });
    saveVipOrderToFirestore(order).catch(console.warn);
    syncWithCloud({ vipOrders: [order] });
  };

  const handleDeleteVipOrder = (orderId: string) => {
    markVipOrderAsDeleted(orderId);
    setVipOrders(prev => {
      const updated = prev.filter(o => o.id !== orderId);
      saveVipOrders(updated);
      return updated;
    });
    deleteVipOrderFromFirestore(orderId).catch(console.warn);
    notifyCloudDeletion('vipOrders', [orderId]).catch(() => {});
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

  const branchTickets = useMemo(() => {
    return tickets.filter(t => (t.branch || 'refugio') === activeBranch);
  }, [tickets, activeBranch]);

  return (
    <div 
      className="min-h-screen bg-[#FAF8F6] text-slate-800 flex flex-col selection:bg-[#D95D39] selection:text-white"
      style={zoomStyle}
    >
      {/* Sticky Top Navigation */}
      <Navbar
        activeTab={activeTab}
        activeBranch={activeBranch}
        onSelectTab={handleSelectTabWithSecurity}
        onSelectBranchPos={handleSelectBranchPos}
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
            tickets={branchTickets}
            branch={activeBranch}
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

        {activeTab === 'vip' && (
          <VipCustomersManager
            vipCustomers={vipCustomers}
            vipOrders={vipOrders}
            onSaveCustomer={handleSaveVipCustomer}
            onDeleteCustomer={handleDeleteVipCustomer}
            onSaveOrder={handleSaveVipOrder}
            onDeleteOrder={handleDeleteVipOrder}
          />
        )}

        {activeTab === 'bakers' && (
          <BakersWorkshop
            orders={orders}
            onToggleItemDone={handleToggleItemDone}
          />
        )}

        {activeTab === 'expenses' && (
          <ExpensesManager
            operationalExpenses={operationalExpenses}
            supplierBills={supplierBills}
            tickets={tickets}
            orders={orders}
            onSaveExpense={handleSaveExpense}
            onDeleteExpense={handleDeleteExpense}
            onSaveSupplierBill={handleSaveSupplierBill}
            onDeleteSupplierBill={handleDeleteSupplierBill}
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
            branch={activeBranch}
          />
        )}

        {activeTab === 'history' && (
          <SalesHistory
            tickets={tickets}
            branch={activeBranch}
            orders={orders}
            vipOrders={vipOrders}
            drivers={drivers}
            driverCustomers={driverCustomers}
            operationalExpenses={operationalExpenses}
            supplierBills={supplierBills}
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

      {/* Password Protection Modal for Branches (refugio / zakia) and Admin Modules (13579) */}
      <PasswordProtectionModal
        isOpen={passwordModalConfig.isOpen}
        targetTitle={passwordModalConfig.targetTitle}
        targetSubtitle={passwordModalConfig.targetSubtitle}
        expectedPassword={passwordModalConfig.expectedPassword}
        badgeText={passwordModalConfig.badgeText}
        badgeColor={passwordModalConfig.badgeColor}
        onSuccess={passwordModalConfig.onSuccessAction}
        onCancel={() => setPasswordModalConfig(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Non-blocking Real-Time Pusher Event Toast */}
      {pusherToast && (
        <div
          key={pusherToast.id}
          className="fixed bottom-4 right-4 z-50 max-w-sm bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl border border-emerald-400/50 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-3 duration-200 no-print"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 mt-1 shrink-0 animate-pulse" />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-black uppercase tracking-wider text-emerald-300">
              Pusher en Tiempo Real
            </div>
            <div className="text-xs text-slate-100 break-words mt-0.5">
              {pusherToast.message}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPusherToast(null)}
            className="text-slate-400 hover:text-white text-xs font-bold px-1 cursor-pointer"
            aria-label="Cerrar notificación"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
