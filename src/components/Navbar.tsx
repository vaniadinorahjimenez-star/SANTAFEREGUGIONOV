import React, { useState } from 'react';
import { 
  ShoppingBag, 
  ClipboardList, 
  Flame, 
  Truck, 
  BarChart3, 
  Settings, 
  Clock, 
  ZoomIn, 
  ZoomOut,
  Sparkles,
  Gift,
  ChevronDown,
  Menu,
  X,
  TrendingUp,
  Cloud,
  Database,
  RefreshCw,
  LogOut,
  Receipt,
  Crown
} from 'lucide-react';
import { Settings as SettingsType, SaleTicket, BakeryOrder, BranchId } from '../types';
import { getTodayString } from '../utils/storage';
import { isQuotaExceeded } from '../services/firebase';

export type ActiveTabType = 'pos' | 'orders' | 'vip' | 'bakers' | 'analytics' | 'expenses' | 'loyalty' | 'history' | 'admin';

interface NavbarProps {
  activeTab: ActiveTabType;
  activeBranch?: BranchId;
  onSelectTab: (tab: ActiveTabType) => void;
  onSelectBranchPos?: (branch: BranchId) => void;
  settings: SettingsType;
  pendingOrdersCount: number;
  pendingProductionCount: number;
  pendingDeliveriesCount: number;
  zoomLevel: number;
  onToggleZoom: (delta: number) => void;
  firebaseStatus?: { connected: boolean; userEmail?: string };
  onConnectFirebase?: () => void;
  onDisconnectFirebase?: () => void;
  onManualSync?: () => void;
  isSyncing?: boolean;
  tickets?: SaleTicket[];
  orders?: BakeryOrder[];
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  activeBranch = 'refugio',
  onSelectTab,
  onSelectBranchPos,
  settings,
  pendingOrdersCount,
  pendingProductionCount,
  pendingDeliveriesCount,
  zoomLevel,
  onToggleZoom,
  firebaseStatus,
  onConnectFirebase,
  onDisconnectFirebase,
  onManualSync,
  isSyncing = false,
  tickets = [],
  orders = []
}) => {
  const [showFirebaseModal, setShowFirebaseModal] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = React.useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);

  const todayStr = getTodayString();
  const todayTickets = React.useMemo(() => {
    return (tickets || []).filter(t => {
      const tDate = t.date?.trim() || (t.timestamp ? t.timestamp.split('T')[0] : '');
      return tDate === todayStr;
    });
  }, [tickets, todayStr]);

  const todaySalesTotal = React.useMemo(() => {
    return todayTickets.reduce((acc, t) => acc + (t.total || 0), 0);
  }, [todayTickets]);

  const todayTicketsCount = todayTickets.length;
  const [activeCashier, setActiveCashier] = useState<string>(() => {
    const saved = localStorage.getItem('santafe_last_cashier_name');
    if (saved && ['Mary', 'Paty', 'Jaz', 'Natty', 'Jonathan'].includes(saved)) return saved;
    return 'Mary';
  });

  React.useEffect(() => {
    const updateCashier = () => {
      const saved = localStorage.getItem('santafe_last_cashier_name');
      if (saved && ['Mary', 'Paty', 'Jaz', 'Natty', 'Jonathan'].includes(saved)) {
        setActiveCashier(saved);
      }
    };
    const interval = setInterval(updateCashier, 1500);
    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    {
      id: 'pos' as ActiveTabType,
      branch: 'refugio' as BranchId,
      label: 'Mostrador El Refugio',
      shortLabel: 'El Refugio',
      icon: ShoppingBag,
      emoji: '🥖',
      description: 'Caja y cobro rápido Sucursal El Refugio (clave: refugio)'
    },
    {
      id: 'pos-zakia' as any,
      branch: 'zakia' as BranchId,
      label: 'Mostrador Zakia',
      shortLabel: 'Zakia',
      icon: ShoppingBag,
      emoji: '🌿',
      description: 'Caja y cobro rápido Sucursal Zakia (clave: zakia)'
    },
    {
      id: 'orders' as ActiveTabType,
      label: 'Reparto',
      shortLabel: 'Reparto',
      icon: Truck,
      emoji: '🛵',
      badge: pendingOrdersCount > 0 ? pendingOrdersCount : undefined,
      description: 'Hoja de reparto y tickets de Simón y Osvaldo'
    },
    {
      id: 'vip' as ActiveTabType,
      label: 'Clientes VIP (Facturación y Transferencias)',
      shortLabel: 'Clientes VIP',
      icon: Crown,
      emoji: '👑',
      description: 'Pedidos VIP, transferencias, comprobantes y facturas'
    },
    {
      id: 'bakers' as ActiveTabType,
      label: 'Pedidos para Panaderos',
      shortLabel: 'Panaderos',
      icon: Flame,
      emoji: '👨‍🍳',
      badge: pendingProductionCount > 0 ? pendingProductionCount : undefined,
      description: 'Producción y horneado'
    },
    {
      id: 'analytics' as ActiveTabType,
      label: 'Estadísticas & Producción',
      shortLabel: 'Estadísticas',
      icon: TrendingUp,
      emoji: '📈',
      description: 'Charolas de bolillo y demanda'
    },
    {
      id: 'loyalty' as ActiveTabType,
      label: 'Club Santa Fé Puntos',
      shortLabel: 'Club Puntos',
      icon: Gift,
      emoji: '⭐',
      badge: undefined,
      description: 'Puntos y descuentos clientes'
    },
    {
      id: 'history' as ActiveTabType,
      label: 'Historial & Caja',
      shortLabel: 'Historial',
      icon: BarChart3,
      emoji: '📊',
      description: 'Ventas y arqueo diario (Acceso protegido)'
    },
    {
      id: 'expenses' as ActiveTabType,
      label: 'Gastos y Proveedores',
      shortLabel: 'Gastos',
      icon: Receipt,
      emoji: '🧾',
      description: 'Nómina, renta, cuentas de viernes y utilidad (Acceso protegido)'
    },
    {
      id: 'admin' as ActiveTabType,
      label: 'Ajustes y Precios',
      shortLabel: 'Ajustes',
      icon: Settings,
      emoji: '⚙️',
      description: 'Precios y usuarios'
    }
  ];

  const currentItem = activeTab === 'pos'
    ? (activeBranch === 'zakia'
        ? { emoji: '🌿', shortLabel: 'Zakia', label: 'Mostrador Zakia' }
        : { emoji: '🥖', shortLabel: 'El Refugio', label: 'Mostrador El Refugio' })
    : (navItems.find(i => i.id === activeTab) || navItems[0]);
  const totalPendingNotifications = (pendingOrdersCount || 0) + (pendingProductionCount || 0);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E5E1DA] shadow-xs no-print">
      {/* Compact single-row navbar to fit everything in a single screen */}
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-1.5 flex items-center justify-between">
        
        {/* Left: Compact Logo & Branding */}
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white p-0.5 shadow-xs border border-[#E5E1DA] shrink-0 overflow-hidden flex items-center justify-center">
            <img 
              src="/logo.jpg" 
              alt="Logo Panadería Santa Fé" 
              className="w-full h-full object-contain"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-serif italic font-bold text-lg sm:text-xl text-[#D95D39] leading-none">
                Panadería Santa Fé
              </span>
              <span className="hidden md:inline-block text-[9px] uppercase font-bold tracking-widest text-[#D95D39] bg-[#FFF5F0] px-1.5 py-0.5 rounded border border-[#E5E1DA]">
                Tradición Artesanal
              </span>
            </div>
            <span className="hidden sm:block text-[10px] font-medium text-slate-500 leading-tight">
              {settings.slogan}
            </span>
          </div>
        </div>

        {/* Right: Desplegable Menu Button, Firebase, Clock & Quick Controls */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          
          {/* Main Desplegable Menu Button (Menú Desplegable Oculto) */}
          <div className="relative">
            <button
              id="view-dropdown-toggle-btn"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center space-x-1.5 sm:space-x-2 bg-[#D95D39] hover:bg-[#c44e2c] text-white px-2.5 sm:px-4 py-1.5 rounded-xl font-black text-xs sm:text-sm shadow-sm transition-all active:scale-95 cursor-pointer ring-2 ring-[#D95D39]/20"
              title="Abrir menú de vistas y módulos"
            >
              <Menu className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              <span className="text-sm sm:text-base select-none">{currentItem.emoji}</span>
              <span className="font-bold tracking-tight hidden xs:inline sm:inline">
                {currentItem.shortLabel}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />

              {totalPendingNotifications > 0 && (
                <span className="bg-white text-[#D95D39] text-[10px] font-black px-1.5 py-0.2 rounded-full shadow-xs">
                  {totalPendingNotifications}
                </span>
              )}
            </button>

            {/* Desplegable Popover Menu Modal */}
            {isDropdownOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-2xs" 
                  onClick={() => setIsDropdownOpen(false)}
                />
                <div 
                  id="navbar-views-dropdown"
                  className="absolute right-0 mt-2 w-72 sm:w-84 bg-white rounded-2xl shadow-2xl border-2 border-[#E5E1DA] py-2 z-50 animate-in fade-in zoom-in-95 duration-150 overflow-hidden"
                >
                  <div className="px-3.5 py-2 border-b border-[#E5E1DA] flex items-center justify-between bg-[#FAF8F6]">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
                      Módulos de la Panadería
                    </span>
                    <button
                      onClick={() => setIsDropdownOpen(false)}
                      className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>



                  <div className="p-2 space-y-1 max-h-[65vh] overflow-y-auto">
                    {navItems.map((item) => {
                      const isSelected = item.id === 'pos-zakia'
                        ? activeTab === 'pos' && activeBranch === 'zakia'
                        : item.id === 'pos'
                          ? activeTab === 'pos' && activeBranch === 'refugio'
                          : activeTab === item.id;

                      const handleItemClick = () => {
                        setIsDropdownOpen(false);
                        if (item.id === 'pos-zakia') {
                          onSelectBranchPos ? onSelectBranchPos('zakia') : onSelectTab('pos');
                        } else if (item.id === 'pos') {
                          onSelectBranchPos ? onSelectBranchPos('refugio') : onSelectTab('pos');
                        } else {
                          onSelectTab(item.id as ActiveTabType);
                        }
                      };

                      return (
                        <button
                          key={item.id}
                          id={`dropdown-item-${item.id}`}
                          onClick={handleItemClick}
                          className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#D95D39] text-white shadow-sm font-bold'
                              : 'hover:bg-[#FFF5F0] text-slate-800'
                          }`}
                        >
                          <div className="flex items-center space-x-3 min-w-0">
                            <span className="text-2xl shrink-0 select-none">{item.emoji}</span>
                            <div className="truncate">
                              <div className={`font-bold text-sm leading-tight ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                                {item.label}
                              </div>
                              <div className={`text-[11px] truncate ${isSelected ? 'text-white/80' : 'text-slate-500'}`}>
                                {item.description}
                              </div>
                            </div>
                          </div>

                          {item.badge !== undefined && (
                            <span
                              className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                                isSelected
                                    ? 'bg-white text-[#D95D39]'
                                    : 'bg-[#D95D39] text-white animate-pulse'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Branch Switcher Selector in the Firebase Row (Refugio vs Zakia) */}
          <div className="flex items-center p-0.5 bg-slate-100 rounded-xl border border-slate-200 shadow-2xs">
            <button
              type="button"
              id="branch-switch-refugio-btn"
              onClick={() => onSelectBranchPos ? onSelectBranchPos('refugio') : onSelectTab('pos')}
              className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-black transition-all cursor-pointer ${
                activeTab === 'pos' && activeBranch === 'refugio'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-white/80'
              }`}
              title="Mostrador El Refugio (Requiere clave: refugio)"
            >
              <span>🥖</span>
              <span className="hidden sm:inline">El Refugio</span>
              <span className="sm:hidden">Refugio</span>
            </button>

            <button
              type="button"
              id="branch-switch-zakia-btn"
              onClick={() => onSelectBranchPos ? onSelectBranchPos('zakia') : onSelectTab('pos')}
              className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-black transition-all cursor-pointer ${
                activeTab === 'pos' && activeBranch === 'zakia'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-white/80'
              }`}
              title="Mostrador Zakia (Requiere clave: zakia)"
            >
              <span>🌿</span>
              <span>Zakia</span>
            </button>
          </div>

          {/* Firebase Connection Status & Cloud Sync (100% Automático) */}
          <div className="relative">
            {isQuotaExceeded() ? (
              <button
                type="button"
                onClick={() => setShowFirebaseModal(!showFirebaseModal)}
                className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[10px] sm:text-xs font-bold px-2 sm:px-2.5 py-1.5 rounded-xl border border-emerald-300 shadow-2xs transition-all cursor-pointer active:scale-95"
                title="Modo Local Seguro Activo: Tus ventas y datos se guardan al 100% en este dispositivo"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <Cloud className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden md:inline">Local Seguro (Cloud Pausa)</span>
                <span className="md:hidden">Local Seguro</span>
              </button>
            ) : firebaseStatus?.connected ? (
              <button
                type="button"
                onClick={() => setShowFirebaseModal(!showFirebaseModal)}
                className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[10px] sm:text-xs font-bold px-2 sm:px-2.5 py-1.5 rounded-xl border border-emerald-300 shadow-2xs transition-all cursor-pointer active:scale-95"
                title="Firebase Conectado Automáticamente: Sincronización en la nube activa"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <Cloud className={`w-3.5 h-3.5 text-emerald-600 ${isSyncing ? 'animate-spin' : ''}`} />
                <span className="hidden md:inline">Firebase Conectado</span>
                <span className="md:hidden">Firebase OK</span>
              </button>
            ) : (
              <div
                className="flex items-center gap-1.5 bg-amber-50 text-amber-900 text-[10px] sm:text-xs font-bold px-2 sm:px-2.5 py-1.5 rounded-xl border border-amber-300 shadow-2xs"
                title="Conectando automáticamente con Firebase..."
              >
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                <Cloud className="w-3.5 h-3.5 text-amber-700 animate-pulse" />
                <span className="hidden sm:inline">Conectando Firebase...</span>
                <span className="sm:hidden">Conectando...</span>
              </div>
            )}

            {/* Firebase Status & Cloud Sync Modal Popover */}
            {showFirebaseModal && (
              <>
                <div 
                  className="fixed inset-0 z-40 bg-slate-900/10"
                  onClick={() => setShowFirebaseModal(false)}
                />
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border-2 border-emerald-200 p-3.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between pb-2 border-b border-emerald-100">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                        <Database className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-extrabold text-slate-800">
                        {isQuotaExceeded() ? 'Modo Local Seguro' : 'Firebase Cloud Sync'}
                      </span>
                    </div>
                    <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black px-2 py-0.5 rounded-full uppercase">
                      {isQuotaExceeded() ? 'Protegido' : 'Activo'}
                    </span>
                  </div>

                  <div className="py-2.5 space-y-1.5 text-xs text-slate-600">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-slate-500">Estado:</span>
                      <span className="font-bold text-emerald-600 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        {isQuotaExceeded() ? 'Local Seguro (Sin pérdida de datos)' : 'Conectado en tiempo real'}
                      </span>
                    </div>
                    {isQuotaExceeded() && (
                      <p className="text-[11px] text-slate-500 bg-amber-50 p-2 rounded-lg border border-amber-200">
                        La cuota diaria gratuita de Firebase llegó a su límite por hoy. Todos tus tickets, cobros, repartos y gastos se guardan al 100% en la memoria de este dispositivo y se subirán a la nube automáticamente al renovarse la cuota.
                      </p>
                    )}
                    {firebaseStatus?.userEmail && (
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] text-slate-500">Usuario:</span>
                        <span className="font-medium text-slate-800 truncate max-w-[170px]" title={firebaseStatus.userEmail}>
                          {firebaseStatus.userEmail}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-slate-500">Base de Datos:</span>
                      <span className="font-mono text-[10px] text-slate-700">Firestore (Santa Fé)</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-slate-500">Ventas en mostrador:</span>
                      <span className="font-bold text-slate-800">Guardado directo e inmediato</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onManualSync?.();
                        setShowFirebaseModal(false);
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-[#D95D39] hover:bg-[#c44e2c] text-white text-[11px] font-bold py-1.5 px-2.5 rounded-xl transition-all cursor-pointer active:scale-95"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                      <span>Sincronizar Ahora</span>
                    </button>
                    {onDisconnectFirebase && (
                      <button
                        type="button"
                        onClick={() => {
                          onDisconnectFirebase();
                          setShowFirebaseModal(false);
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                        title="Cerrar sesión de Firebase"
                      >
                        <LogOut className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Live Clock */}
          <div className="hidden md:flex items-center space-x-1.5 bg-[#FAF8F6] px-2.5 py-1 rounded-xl border border-[#E5E1DA] text-slate-700 font-mono font-bold text-xs">
            <Clock className="w-3.5 h-3.5 text-[#D95D39]" />
            <span>{currentTime}</span>
          </div>

          {/* Cashier Badge */}
          <div className="hidden lg:flex bg-[#FFF5F0] text-[#D95D39] font-bold text-[10px] px-2.5 py-1 rounded-xl items-center gap-1.5 border border-[#E5E1DA]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Mostrador: <strong className="text-slate-900">{activeCashier}</strong></span>
          </div>

        </div>
      </div>
    </header>
  );
};
