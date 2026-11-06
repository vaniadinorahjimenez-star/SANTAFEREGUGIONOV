import React from 'react';
import { Home, ClipboardList, Truck, Users } from 'lucide-react';
import { ActiveTabType } from '../Navbar';

interface MobileBottomBarProps {
  activeTab: ActiveTabType;
  onSelectTab: (tab: ActiveTabType) => void;
  pendingOrdersCount?: number;
  pendingDeliveriesCount?: number;
}

export const MobileBottomBar: React.FC<MobileBottomBarProps> = ({
  activeTab,
  onSelectTab,
  pendingOrdersCount = 0,
  pendingDeliveriesCount = 0
}) => {
  const tabs = [
    {
      id: 'mobile_home' as ActiveTabType,
      label: 'Inicio',
      icon: Home
    },
    {
      id: 'orders' as ActiveTabType,
      label: 'Pedidos',
      icon: ClipboardList,
      badge: pendingOrdersCount > 0 ? pendingOrdersCount : undefined
    },
    {
      id: 'orders' as ActiveTabType,
      label: 'Repartos',
      icon: Truck,
      badge: pendingDeliveriesCount > 0 ? pendingDeliveriesCount : undefined
    },
    {
      id: 'loyalty' as ActiveTabType,
      label: 'Clientes',
      icon: Users
    }
  ];

  return (
    <nav 
      aria-label="Navegación móvil"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-4px_25px_rgba(0,0,0,0.06)] px-3 py-2 flex items-center justify-around rounded-t-2xl md:hidden select-none"
    >
      {tabs.map((tab) => {
        const isCurrent = activeTab === tab.id;
        const IconComponent = tab.icon;

        return (
          <button
            key={tab.label}
            type="button"
            onClick={() => onSelectTab(tab.id)}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition-all active:scale-95 cursor-pointer relative ${
              isCurrent 
                ? 'text-[#1F1F1F]' 
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <div className="relative">
              <IconComponent 
                className={`w-6 h-6 transition-transform ${isCurrent ? 'stroke-[2.2] scale-105 text-[#1F1F1F]' : 'stroke-[1.8]'}`} 
              />
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="absolute -top-1 -right-2 bg-[#D95D39] text-white text-[9px] font-black px-1.5 py-0.2 rounded-full min-w-4 text-center shadow-xs">
                  {tab.badge}
                </span>
              )}
            </div>
            <span className={`text-[11px] mt-1 tracking-tight ${isCurrent ? 'font-bold text-slate-900' : 'font-medium text-slate-500'}`}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
