import React, { useEffect, useMemo, useState } from 'react';
import {
  Lock,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ArrowLeft,
  TrendingUp,
  Store,
  Share2,
  Check,
  Sparkles,
  Snowflake,
  Clock,
  Truck,
  Users,
  BarChart3
} from 'lucide-react';
import { BakeryOrder, DriverCustomer, SaleTicket } from '../../types';
import { getTodayString } from '../../utils/storage';
import { syncDailyDeliveriesFromCloud } from '../../services/cloudSyncService';
import {
  BARRA_FRIA_COMMISSION_PER_UNIT,
  REPARTO_COMMISSION_RATE,
  ROSCA_COMMISSION_RATE,
  RepartoChartBucket,
  SocioBranchFilter,
  SocioChartBucket,
  SocioDriverFilter,
  SocioPortalType,
  SocioTimeframe,
  buildRepartoReport,
  buildSocioReport,
  formatCompactMoney,
  formatMoney,
  stepAnchorDate,
  verifyPartnerPassword
} from './sociosAnalytics';
import { SocioGoalCard, SocioWelcomeAnimation } from './SocioGoalCard';

interface SociosPortalProps {
  tickets: SaleTicket[];
  orders?: BakeryOrder[];
  driverCustomers?: DriverCustomer[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
  standalone?: boolean;
}

export const SociosPortal: React.FC<SociosPortalProps> = ({
  tickets,
  orders = [],
  driverCustomers = [],
  onRefresh,
  isRefreshing = false,
  standalone = false
}) => {
  const [activePortal, setActivePortal] = useState<SocioPortalType | null>(null);
  const [pendingPortal, setPendingPortal] = useState<SocioPortalType | null>(null);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [passwordError, setPasswordError] = useState<string>('');

  const [timeframe, setTimeframe] = useState<SocioTimeframe>('dia');
  const [anchorDate, setAnchorDate] = useState<string>(() => getTodayString());
  const [branchFilter, setBranchFilter] = useState<SocioBranchFilter>('todas');
  const [driverFilter, setDriverFilter] = useState<SocioDriverFilter>('todos');
  const [selectedBucketKey, setSelectedBucketKey] = useState<string | null>(null);
  const [showAllSales, setShowAllSales] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [deliverySyncVersion, setDeliverySyncVersion] = useState<number>(0);
  const [showWelcomeAnim, setShowWelcomeAnim] = useState<boolean>(false);
  const [entryCount, setEntryCount] = useState<number>(0);

  const todayStr = getTodayString();

  // Sincronización en vivo de hojas de reparto cuando se consulta el portal de Reparto
  useEffect(() => {
    if (activePortal !== 'reparto') return;
    let active = true;

    const bump = () => {
      if (active) setDeliverySyncVersion(v => v + 1);
    };

    window.addEventListener('dailyDeliveryUpdated', bump);
    window.addEventListener('storage', bump);

    syncDailyDeliveriesFromCloud()
      .then(() => bump())
      .catch(() => {});

    return () => {
      active = false;
      window.removeEventListener('dailyDeliveryUpdated', bump);
      window.removeEventListener('storage', bump);
    };
  }, [activePortal]);

  const handleRefreshAll = () => {
    if (onRefresh) onRefresh();
    if (activePortal === 'reparto') {
      syncDailyDeliveriesFromCloud()
        .then(() => setDeliverySyncVersion(v => v + 1))
        .catch(() => {});
    }
  };

  const handleOpenPasswordPrompt = (portal: SocioPortalType) => {
    setPendingPortal(portal);
    setPasswordInput('');
    setShowPassword(false);
    setPasswordError('');
  };

  const handleSubmitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingPortal) return;

    if (verifyPartnerPassword(pendingPortal, passwordInput)) {
      const target = pendingPortal;
      setActivePortal(target);
      setPendingPortal(null);
      setPasswordInput('');
      setPasswordError('');
      // Reparto inicia en "Por Mes" para mostrar de inmediato el acumulado del 5% de todo el mes
      setTimeframe(target === 'reparto' ? 'mes' : 'dia');
      setAnchorDate(getTodayString());
      setBranchFilter('todas');
      setDriverFilter('todos');
      setSelectedBucketKey(null);
      setShowAllSales(false);
      setEntryCount(c => c + 1);
      setShowWelcomeAnim(true);
    } else {
      setPasswordError('Contraseña incorrecta. Verifica con el administrador.');
    }
  };

  const handleLockAndExit = () => {
    setActivePortal(null);
    setPendingPortal(null);
    setPasswordInput('');
    setPasswordError('');
    setSelectedBucketKey(null);
    setShowAllSales(false);
    setShowWelcomeAnim(false);
  };

  const handleCopyShareLink = async () => {
    try {
      const url = `${window.location.origin}/?vista=socios`;
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2600);
    } catch {
      setCopiedLink(false);
    }
  };

  const handleChangeTimeframe = (next: SocioTimeframe) => {
    setTimeframe(next);
    setAnchorDate(getTodayString());
    setSelectedBucketKey(null);
    setShowAllSales(false);
  };

  const handleStepPeriod = (dir: -1 | 1) => {
    setAnchorDate(prev => stepAnchorDate(timeframe, prev, dir));
    setSelectedBucketKey(null);
    setShowAllSales(false);
  };

  const report = useMemo(() => {
    if (!activePortal || activePortal === 'reparto') return null;
    return buildSocioReport(tickets, activePortal, timeframe, anchorDate, branchFilter);
  }, [tickets, activePortal, timeframe, anchorDate, branchFilter]);

  const repartoReport = useMemo(() => {
    if (activePortal !== 'reparto') return null;
    // deliverySyncVersion fuerza recálculo al llegar hojas de reparto en tiempo real
    void deliverySyncVersion;
    return buildRepartoReport(tickets, orders, driverCustomers, timeframe, anchorDate, driverFilter);
  }, [activePortal, tickets, orders, driverCustomers, timeframe, anchorDate, driverFilter, deliverySyncVersion]);

  const isViewingCurrentPeriod = useMemo(() => {
    const activeRep = activePortal === 'reparto' ? repartoReport : report;
    if (!activeRep) return true;
    return todayStr >= activeRep.startDate && todayStr <= activeRep.endDate;
  }, [activePortal, report, repartoReport, todayStr]);

  const selectedBucket: SocioChartBucket | null = useMemo(() => {
    if (!report || !selectedBucketKey) return null;
    return report.chartBuckets.find(b => b.key === selectedBucketKey) || null;
  }, [report, selectedBucketKey]);

  const selectedRepartoBucket: RepartoChartBucket | null = useMemo(() => {
    if (!repartoReport || !selectedBucketKey) return null;
    return repartoReport.chartBuckets.find(b => b.key === selectedBucketKey) || null;
  }, [repartoReport, selectedBucketKey]);

  const getPortalDisplayName = (portal: SocioPortalType) => {
    if (portal === 'roscas') return 'Roscas y Esferas';
    if (portal === 'barra_fria') return 'Barra Fría';
    return 'Reparto';
  };

  // =========================================================================
  // PANTALLA 1: PORTADA "SOCIOS SANTA FE" (3 ÁREAS CON ACCESO PRIVADO)
  // =========================================================================
  if (!activePortal) {
    return (
      <div className={`${standalone ? 'min-h-screen' : 'min-h-[calc(100vh-5rem)]'} bg-[#FAF7F2] text-[#1F1814] flex flex-col`}>
        <header className="sticky top-0 z-20 bg-[#FAF7F2]/95 backdrop-blur-sm border-b border-[#E7DFD3]">
          <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8B6B4F]">
                Panadería Santa Fe
              </p>
              <h1 className="text-base font-bold tracking-tight text-[#1F1814] leading-tight truncate">
                Socios Santa Fe
              </h1>
            </div>

            <div className="flex items-center gap-2">
              {!standalone && (
                <button
                  type="button"
                  onClick={handleCopyShareLink}
                  className="min-h-[44px] px-3 rounded-xl border border-[#E2D6C5] bg-white text-xs font-semibold text-[#4A3B31] hover:bg-[#F5EFE6] active:scale-[0.98] transition flex items-center gap-1.5"
                  title="Copiar enlace directo para abrir en celular"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-4 h-4 text-[#0F766E]" />
                      <span>Copiado</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-4 h-4 text-[#8B6B4F]" />
                      <span>Enlace móvil</span>
                    </>
                  )}
                </button>
              )}
              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={isRefreshing}
                  aria-label="Actualizar datos"
                  className="min-h-[44px] min-w-[44px] rounded-xl border border-[#E2D6C5] bg-white text-[#4A3B31] hover:bg-[#F5EFE6] active:scale-[0.98] transition flex items-center justify-center disabled:opacity-60"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-lg w-full mx-auto px-4 py-7 sm:py-10 flex flex-col justify-between gap-8">
          <div className="space-y-6">
            <div className="space-y-1.5">
              <h2 className="text-2xl sm:text-[28px] font-bold tracking-tight text-[#1F1814] leading-tight">
                Bienvenido a tu espacio
              </h2>
              <p className="text-sm text-[#6B5E55] leading-relaxed">
                Elige tu área e ingresa tu clave privada para consultar tu avance.
              </p>
            </div>

            {/* Tres tarjetas limpias y minimalistas: sin porcentajes ni nombres de sucursales */}
            <div className="grid grid-cols-1 gap-3.5">
              {/* Botón 1: ROSCAS */}
              <button
                type="button"
                onClick={() => handleOpenPasswordPrompt('roscas')}
                className="group w-full text-left rounded-2xl bg-[#231914] text-white p-5 sm:p-6 border border-[#3B2A21] active:scale-[0.99] transition hover:bg-[#2C2019]"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0 text-[#F5C16C] group-hover:bg-white/15 transition">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-white truncate">
                        Roscas
                      </h3>
                      <p className="text-sm text-[#D6C7BA] mt-0.5 truncate">
                        Temporada y producción
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[#F5C16C] shrink-0">
                    <Lock className="w-4 h-4 opacity-80" />
                    <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </button>

              {/* Botón 2: BARRA FRÍA */}
              <button
                type="button"
                onClick={() => handleOpenPasswordPrompt('barra_fria')}
                className="group w-full text-left rounded-2xl bg-[#102A2C] text-white p-5 sm:p-6 border border-[#1E4447] active:scale-[0.99] transition hover:bg-[#153538]"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0 text-[#6EE7D8] group-hover:bg-white/15 transition">
                      <Snowflake className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-white truncate">
                        Barra Fría
                      </h3>
                      <p className="text-sm text-[#C4DBD9] mt-0.5 truncate">
                        Postres y vitrina fría
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[#6EE7D8] shrink-0">
                    <Lock className="w-4 h-4 opacity-80" />
                    <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </button>

              {/* Botón 3: REPARTO */}
              <button
                type="button"
                onClick={() => handleOpenPasswordPrompt('reparto')}
                className="group w-full text-left rounded-2xl bg-[#172033] text-white p-5 sm:p-6 border border-[#2A3A57] active:scale-[0.99] transition hover:bg-[#1D2940]"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0 text-[#93C5FD] group-hover:bg-white/15 transition">
                      <Truck className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-white truncate">
                        Reparto
                      </h3>
                      <p className="text-sm text-[#C9D6EA] mt-0.5 truncate">
                        Rutas y entregas
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[#93C5FD] shrink-0">
                    <Lock className="w-4 h-4 opacity-80" />
                    <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </button>
            </div>
          </div>

          <p className="text-center text-xs text-[#8C7E74]">
            Panadería Santa Fe · Acceso privado
          </p>
        </main>

        {/* Modal de contraseña privada por socio */}
        {pendingPortal && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-2xl border border-[#E7DFD3] p-6 pb-8 sm:pb-6 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8B6B4F]">
                    Acceso privado
                  </p>
                  <h3 className="text-xl font-bold text-[#1F1814] mt-0.5">
                    {getPortalDisplayName(pendingPortal)}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPendingPortal(null);
                    setPasswordInput('');
                    setPasswordError('');
                  }}
                  className="min-h-[44px] min-w-[44px] -mr-2 -mt-1 rounded-xl text-sm font-semibold text-[#6B5E55] hover:bg-[#F5EFE6] flex items-center justify-center"
                >
                  Cerrar
                </button>
              </div>

              <form onSubmit={handleSubmitPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="socio-password-input"
                    className="block text-sm font-semibold text-[#3C3028]"
                  >
                    Ingresa tu contraseña
                  </label>
                  <div className="relative">
                    <input
                      id="socio-password-input"
                      type={showPassword ? 'text' : 'password'}
                      value={passwordInput}
                      onChange={e => {
                        setPasswordInput(e.target.value);
                        if (passwordError) setPasswordError('');
                      }}
                      autoFocus
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="Escribe tu clave de acceso"
                      className="w-full min-h-[48px] pl-4 pr-12 rounded-xl border border-[#D8CBB8] bg-[#FAF7F2] text-base text-[#1F1814] placeholder:text-[#9A8C82] focus:outline-none focus:border-[#1F1814] focus:bg-white transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                      className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center text-[#6B5E55] hover:text-[#1F1814]"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {passwordError && (
                    <p className="text-xs font-semibold text-[#B91C1C] pt-1">
                      {passwordError}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  className={`w-full min-h-[48px] rounded-xl font-bold text-base text-white active:scale-[0.99] transition ${
                    pendingPortal === 'roscas'
                      ? 'bg-[#231914] hover:bg-[#33251E]'
                      : pendingPortal === 'barra_fria'
                      ? 'bg-[#102A2C] hover:bg-[#173B3E]'
                      : 'bg-[#172033] hover:bg-[#22304C]'
                  }`}
                >
                  Entrar a {pendingPortal === 'roscas' ? 'Roscas' : pendingPortal === 'barra_fria' ? 'Barra Fría' : 'Reparto'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // PANTALLA 2A: TABLERO DE REPARTO (SIMÓN Y OSVALDO — 5% DESDE 1 NOV)
  // =========================================================================
  if (activePortal === 'reparto' && repartoReport) {
    const maxChartRev = Math.max(1, ...repartoReport.chartBuckets.map(b => b.revenue));
    const simonPct =
      repartoReport.allDriversTotalRevenue > 0
        ? Math.round((repartoReport.drivers.simon.revenue / repartoReport.allDriversTotalRevenue) * 100)
        : 0;
    const osvaldoPct = repartoReport.allDriversTotalRevenue > 0 ? 100 - simonPct : 0;
    const visibleEntries = showAllSales ? repartoReport.recentEntries : repartoReport.recentEntries.slice(0, 12);

    return (
      <div className={`${standalone ? 'min-h-screen' : 'min-h-[calc(100vh-5rem)]'} bg-[#FAF7F2] text-[#1F1814] pb-12`}>
        <SocioWelcomeAnimation
          portal="reparto"
          visible={showWelcomeAnim}
          onFinish={() => setShowWelcomeAnim(false)}
        />
        <header className="sticky top-0 z-20 bg-[#FAF7F2]/95 backdrop-blur-sm border-b border-[#E7DFD3]">
          <div className="max-w-lg lg:max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleLockAndExit}
              className="min-h-[44px] -ml-2 px-2.5 rounded-xl text-sm font-semibold text-[#4A3B31] hover:bg-[#EFE7DC] active:scale-[0.98] transition flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Salir</span>
            </button>

            <div className="text-center min-w-0">
              <h1 className="text-base font-bold tracking-tight text-[#1F1814] truncate">
                Reparto Santa Fe
              </h1>
              <p className="text-[11px] font-medium text-[#7A6B61] truncate">
                Desde {repartoReport.portalStartDateLabel} · Comisión 5%
              </p>
            </div>

            <button
              type="button"
              onClick={handleRefreshAll}
              disabled={isRefreshing}
              aria-label="Actualizar ventas de reparto"
              className="min-h-[44px] min-w-[44px] -mr-1 rounded-xl text-[#4A3B31] hover:bg-[#EFE7DC] active:scale-[0.98] transition flex items-center justify-center disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </header>

        <main className="max-w-lg lg:max-w-5xl mx-auto px-4 pt-4 space-y-4">
          {/* Selector de Periodo: Día / Semana / Mes */}
          <section className="bg-white rounded-2xl border border-[#E7DFD3] p-3 space-y-3">
            <div className="grid grid-cols-3 gap-1.5 bg-[#F4EFE7] p-1 rounded-xl">
              {(
                [
                  { id: 'dia', label: 'Por Día' },
                  { id: 'semana', label: 'Por Semana' },
                  { id: 'mes', label: 'Por Mes' }
                ] as const
              ).map(tab => {
                const active = timeframe === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleChangeTimeframe(tab.id)}
                    className={`min-h-[44px] rounded-lg text-sm font-bold transition ${
                      active ? 'bg-[#172033] text-white' : 'text-[#6B5E55] hover:text-[#1F1814]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => handleStepPeriod(-1)}
                aria-label="Periodo anterior"
                className="min-h-[44px] min-w-[44px] rounded-xl border border-[#E7DFD3] bg-[#FAF7F2] text-[#3C3028] hover:bg-[#F2EAE0] active:scale-[0.97] transition flex items-center justify-center"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <div className="text-center min-w-0 flex-1">
                <p className="text-base font-bold text-[#1F1814] truncate tabular-nums">
                  {repartoReport.periodTitle}
                </p>
                <div className="flex items-center justify-center gap-2 text-xs text-[#7A6B61]">
                  <span className="truncate">{repartoReport.periodSubtitle}</span>
                  {!isViewingCurrentPeriod && (
                    <>
                      <span>·</span>
                      <button
                        type="button"
                        onClick={() => {
                          setAnchorDate(todayStr);
                          setSelectedBucketKey(null);
                        }}
                        className="font-bold underline underline-offset-2 text-[#1D4ED8]"
                      >
                        Volver a hoy
                      </button>
                    </>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleStepPeriod(1)}
                aria-label="Periodo siguiente"
                className="min-h-[44px] min-w-[44px] rounded-xl border border-[#E7DFD3] bg-[#FAF7F2] text-[#3C3028] hover:bg-[#F2EAE0] active:scale-[0.97] transition flex items-center justify-center"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* COLUMNA IZQUIERDA */}
            <div className="lg:col-span-7 space-y-4">
              {/* HERO DE COMISIÓN DE REPARTO (5%) */}
              <section className="rounded-2xl p-5 sm:p-6 text-white bg-[#172033]">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#93C5FD]">
                    {driverFilter === 'todos'
                      ? 'Comisión total de reparto (5%)'
                      : `Tu comisión · ${driverFilter === 'simon' ? 'Simón' : 'Osvaldo'} (5%)`}
                  </p>
                  <span className="text-xs font-medium text-white/75">
                    {driverFilter === 'todos'
                      ? 'Simón + Osvaldo'
                      : driverFilter === 'simon'
                      ? 'Solo Simón'
                      : 'Solo Osvaldo'}
                  </span>
                </div>

                <div className="mt-2">
                  <p className="text-4xl sm:text-5xl font-extrabold tracking-tight tabular-nums leading-none">
                    {formatMoney(repartoReport.totalCommission, true)}
                  </p>
                  <p className="mt-2.5 text-sm text-white/80">
                    Comisión del {(REPARTO_COMMISSION_RATE * 100).toFixed(0)}% sobre tus entregas realizadas
                  </p>
                </div>

                <div className="mt-5 pt-4 border-t border-white/15 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-white/65">Piezas repartidas</p>
                    <p className="text-2xl font-bold tabular-nums mt-0.5">
                      {repartoReport.totalPieces.toLocaleString('es-MX')}{' '}
                      <span className="text-sm font-medium text-white/70">pzas</span>
                    </p>
                    <p className="text-xs text-white/75 mt-1 tabular-nums">
                      {repartoReport.clients.length} {repartoReport.clients.length === 1 ? 'cliente' : 'clientes'}
                    </p>
                  </div>

                  <div className="border-l border-white/15 pl-4">
                    <p className="text-xs text-white/65">Entregas realizadas</p>
                    <p className="text-2xl font-bold tabular-nums mt-0.5">
                      {repartoReport.totalDeliveries}
                    </p>
                    <p className="text-xs text-white/75 mt-1 tabular-nums">
                      Prom. {repartoReport.totalDeliveries > 0 ? Math.round(repartoReport.totalPieces / repartoReport.totalDeliveries) : 0} pzas / entrega
                    </p>
                  </div>
                </div>

                {driverFilter === 'todos' && (repartoReport.drivers.simon.revenue > 0 || repartoReport.drivers.osvaldo.revenue > 0) && (
                  <div className="mt-4 pt-3.5 border-t border-white/10 grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl bg-white/8 px-3 py-2.5">
                      <p className="text-white/70">Simón ({repartoReport.drivers.simon.deliveriesCount} entregas)</p>
                      <p className="font-bold text-sm text-[#93C5FD] tabular-nums mt-0.5">
                        Com. {formatMoney(repartoReport.drivers.simon.commission, true)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white/8 px-3 py-2.5">
                      <p className="text-white/70">Osvaldo ({repartoReport.drivers.osvaldo.deliveriesCount} entregas)</p>
                      <p className="font-bold text-sm text-[#93C5FD] tabular-nums mt-0.5">
                        Com. {formatMoney(repartoReport.drivers.osvaldo.commission, true)}
                      </p>
                    </div>
                  </div>
                )}
              </section>

              {/* META CORTA ALCANZABLE MOTIVACIONAL */}
              <SocioGoalCard
                portal="reparto"
                timeframe={timeframe}
                currentPieces={repartoReport.totalPieces}
                currentRevenue={repartoReport.totalRevenue}
                currentCommission={repartoReport.totalCommission}
                isBeforeStartDate={repartoReport.isBeforeStartDate}
                portalStartDateLabel={repartoReport.portalStartDateLabel}
                driverFilter={driverFilter}
                animationKey={`reparto_${entryCount}_${timeframe}_${anchorDate}_${driverFilter}`}
                ready={!showWelcomeAnim}
              />

              {/* FILTRO Y COMPARATIVO POR REPARTIDOR: SIMÓN vs OSVALDO */}
              <section className="bg-white rounded-2xl border border-[#E7DFD3] p-4 space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#7A6B61]" />
                    <h2 className="text-sm font-bold text-[#1F1814]">Por repartidor</h2>
                  </div>
                  <span className="text-xs text-[#7A6B61] tabular-nums">
                    Total: {repartoReport.allDriversTotalDeliveries} entregas
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1.5 bg-[#F4EFE7] p-1 rounded-xl">
                  {(
                    [
                      { id: 'todos', label: 'Ambos' },
                      { id: 'simon', label: 'Simón' },
                      { id: 'osvaldo', label: 'Osvaldo' }
                    ] as const
                  ).map(opt => {
                    const active = driverFilter === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setDriverFilter(opt.id);
                          setSelectedBucketKey(null);
                        }}
                        className={`min-h-[44px] rounded-lg text-xs sm:text-sm font-bold transition ${
                          active
                            ? 'bg-white text-[#1F1814] shadow-xs border border-[#E2D6C5]'
                            : 'text-[#6B5E55] hover:text-[#1F1814]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[repartoReport.drivers.simon, repartoReport.drivers.osvaldo].map(drv => {
                    const isSelected = driverFilter === drv.driverId;
                    const pct = drv.driverId === 'simon' ? simonPct : osvaldoPct;
                    return (
                      <button
                        key={drv.driverId}
                        type="button"
                        onClick={() => {
                          setDriverFilter(prev => (prev === drv.driverId ? 'todos' : drv.driverId));
                          setSelectedBucketKey(null);
                        }}
                        className={`text-left rounded-xl p-3.5 border transition ${
                          isSelected
                            ? 'bg-[#EFF6FF] border-[#1D4ED8]'
                            : 'bg-[#FAF7F2] border-[#E7DFD3] hover:border-[#CFC1AE]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-[#4A3B31]">{drv.label}</span>
                          <span className="text-[11px] font-semibold text-[#8A7B70] tabular-nums">
                            {pct}%
                          </span>
                        </div>
                        <p className="text-lg sm:text-xl font-extrabold text-[#1D4ED8] tabular-nums mt-1">
                          {formatMoney(drv.commission, true)}
                        </p>
                        <p className="text-xs font-semibold text-[#1F1814] tabular-nums mt-0.5">
                          {drv.pieces.toLocaleString('es-MX')} pzas
                        </p>
                        <p className="text-[11px] text-[#8A7B70] tabular-nums mt-0.5">
                          {drv.deliveriesCount} {drv.deliveriesCount === 1 ? 'entrega' : 'entregas'}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {repartoReport.allDriversTotalRevenue > 0 && (
                  <div className="space-y-1.5">
                    <div className="h-2.5 w-full rounded-full bg-[#EFE7DC] overflow-hidden flex">
                      <div className="bg-[#1D4ED8] h-full transition-all" style={{ width: `${simonPct}%` }} />
                      <div className="bg-[#60A5FA] h-full transition-all" style={{ width: `${osvaldoPct}%` }} />
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-medium text-[#7A6B61] tabular-nums">
                      <span>Simón ({simonPct}%)</span>
                      <span>Osvaldo ({osvaldoPct}%)</span>
                    </div>
                  </div>
                )}
              </section>

              {/* GRÁFICO VISUAL: CÓMO SE ESTÁ VENDIENDO EN REPARTO */}
              <section className="bg-white rounded-2xl border border-[#E7DFD3] p-4 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-[#7A6B61]" />
                      <h2 className="text-sm font-bold text-[#1F1814]">Cómo se está vendiendo</h2>
                    </div>
                    <p className="text-xs text-[#7A6B61] mt-0.5">
                      {timeframe === 'dia'
                        ? 'Comisión por turno de reparto · toca una barra'
                        : timeframe === 'semana'
                        ? 'Comisión 5% por día · toca un día para ver detalle'
                        : 'Comisión 5% por semana del mes · toca una semana'}
                    </p>
                  </div>

                  {repartoReport.peakBucket && (
                    <div className="text-right shrink-0">
                      <p className="text-[11px] text-[#7A6B61]">Mejor periodo</p>
                      <p className="text-xs font-bold text-[#1F1814] tabular-nums">
                        {repartoReport.peakBucket.label} · {formatCompactMoney(repartoReport.peakBucket.commission)}
                      </p>
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <div
                    className="grid gap-1.5 sm:gap-2 items-end h-40"
                    style={{ gridTemplateColumns: `repeat(${repartoReport.chartBuckets.length}, minmax(0, 1fr))` }}
                  >
                    {repartoReport.chartBuckets.map(bucket => {
                      const heightPct = bucket.revenue > 0 ? Math.max(12, Math.round((bucket.revenue / maxChartRev) * 100)) : 4;
                      const isSelected = selectedBucketKey === bucket.key;
                      const isPeak = repartoReport.peakBucket?.key === bucket.key && bucket.revenue > 0;

                      return (
                        <button
                          key={bucket.key}
                          type="button"
                          onClick={() => setSelectedBucketKey(prev => (prev === bucket.key ? null : bucket.key))}
                          className="h-full flex flex-col items-center justify-end gap-1.5 group focus:outline-none"
                        >
                          <span
                            className={`text-[10px] sm:text-[11px] font-bold tabular-nums leading-none ${
                              bucket.commission > 0 ? 'text-[#1F1814]' : 'text-[#C2B6AA]'
                            }`}
                          >
                            {bucket.commission > 0 ? `$${Math.round(bucket.commission)}` : '$0'}
                          </span>

                          <div className="w-full flex-1 flex items-end justify-center px-0.5">
                            <div
                              className={`w-full max-w-[40px] rounded-t-lg transition-all ${
                                bucket.revenue === 0
                                  ? 'bg-[#EFE7DC]'
                                  : isSelected
                                  ? 'bg-[#172033]'
                                  : isPeak
                                  ? 'bg-[#1D4ED8]'
                                  : 'bg-[#60A5FA] group-hover:bg-[#1D4ED8]'
                              }`}
                              style={{ height: `${heightPct}%` }}
                            />
                          </div>

                          <span
                            className={`text-[10px] sm:text-[11px] font-semibold leading-none truncate max-w-full ${
                              bucket.isCurrent || isSelected ? 'text-[#1F1814] font-bold' : 'text-[#7A6B61]'
                            }`}
                          >
                            {bucket.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {selectedRepartoBucket && (
                  <div className="rounded-xl bg-[#FAF7F2] border border-[#E7DFD3] px-3.5 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-[#1F1814]">
                        {selectedRepartoBucket.label}
                        {selectedRepartoBucket.sublabel ? ` · ${selectedRepartoBucket.sublabel}` : ''}
                      </p>
                      <p className="text-xs text-[#6B5E55] mt-0.5 tabular-nums">
                        Simón: {formatCompactMoney(selectedRepartoBucket.simonCommission)} · Osvaldo: {formatCompactMoney(selectedRepartoBucket.osvaldoCommission)}
                      </p>
                    </div>
                    <div className="text-right tabular-nums">
                      <p className="text-sm font-extrabold text-[#1D4ED8]">
                        +{formatMoney(selectedRepartoBucket.commission, true)}
                      </p>
                      <p className="text-[11px] text-[#7A6B61]">
                        {selectedRepartoBucket.deliveriesCount} {selectedRepartoBucket.deliveriesCount === 1 ? 'entrega' : 'entregas'} · {selectedRepartoBucket.pieces} pzas
                      </p>
                    </div>
                  </div>
                )}
              </section>
            </div>

            {/* COLUMNA DERECHA */}
            <div className="lg:col-span-5 space-y-4">
              {/* GRÁFICA DE PRODUCTOS MÁS VENDIDOS EN REPARTO */}
              <section className="bg-white rounded-2xl border border-[#E7DFD3] p-4 space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-[#1D4ED8]" />
                    <h2 className="text-sm font-bold text-[#1F1814]">Productos más vendidos</h2>
                  </div>
                  <span className="text-xs text-[#7A6B61] tabular-nums">
                    Top {Math.min(8, repartoReport.topProducts.length)}
                  </span>
                </div>

                {repartoReport.topProducts.length === 0 ? (
                  <div className="rounded-xl bg-[#FAF7F2] border border-dashed border-[#DDD1C0] px-4 py-6 text-center">
                    <p className="text-sm font-semibold text-[#4A3B31]">
                      {repartoReport.isBeforeStartDate
                        ? `El conteo inicia el ${repartoReport.portalStartDateLabel}`
                        : 'Sin productos registrados en este periodo'}
                    </p>
                    <p className="text-xs text-[#7A6B61] mt-1">
                      Aquí verás el ranking visual de lo que más entregas en ruta.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(() => {
                      const topList = repartoReport.topProducts.slice(0, 8);
                      const maxPieces = Math.max(1, topList[0]?.pieces || 1);
                      return topList.map((prod, idx) => {
                        const barPct = Math.max(8, Math.round((prod.pieces / maxPieces) * 100));
                        const sharePct = repartoReport.totalPieces > 0
                          ? Math.round((prod.pieces / repartoReport.totalPieces) * 100)
                          : 0;
                        return (
                          <div key={prod.key} className="space-y-1.5">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="text-sm font-bold text-[#1F1814] truncate">
                                <span className="text-xs font-extrabold text-[#1D4ED8] mr-1.5 tabular-nums">
                                  #{idx + 1}
                                </span>
                                {prod.name}
                              </p>
                              <span className="text-xs font-extrabold text-[#1F1814] tabular-nums shrink-0">
                                {prod.pieces.toLocaleString('es-MX')} pzas
                              </span>
                            </div>

                            <div className="h-2.5 w-full rounded-full bg-[#EDF1F8] overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-700 ${
                                  idx === 0 ? 'bg-[#1D4ED8]' : idx === 1 ? 'bg-[#3B82F6]' : 'bg-[#7FB0FA]'
                                }`}
                                style={{ width: `${barPct}%` }}
                              />
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-[#7A6B61] tabular-nums">
                              <span>
                                {sharePct}% del total
                                {driverFilter === 'todos' && ` · Simón ${prod.simonPieces} · Osvaldo ${prod.osvaldoPieces}`}
                              </span>
                              <span className="font-bold text-[#1D4ED8]">
                                Com. {formatMoney(prod.commission, true)}
                              </span>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </section>

              {/* DESGLOSE POR CLIENTE DE REPARTO */}
              <section className="bg-white rounded-2xl border border-[#E7DFD3] p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-[#1F1814]">Detalle por cliente</h2>
                  <span className="text-xs text-[#7A6B61] tabular-nums">
                    {repartoReport.clients.length} {repartoReport.clients.length === 1 ? 'cliente' : 'clientes'}
                  </span>
                </div>

                {repartoReport.clients.length === 0 ? (
                  <div className="rounded-xl bg-[#FAF7F2] border border-dashed border-[#DDD1C0] px-4 py-6 text-center">
                    <p className="text-sm font-semibold text-[#4A3B31]">
                      {repartoReport.isBeforeStartDate
                        ? `El conteo inicia el ${repartoReport.portalStartDateLabel}`
                        : 'Sin entregas registradas en este periodo'}
                    </p>
                    <p className="text-xs text-[#7A6B61] mt-1">
                      {repartoReport.isBeforeStartDate
                        ? 'Las entregas anteriores al 1 de noviembre no entran en este cálculo.'
                        : 'Cuando se registren entregas en la hoja de reparto o tickets aparecerán aquí en automático.'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#EFE7DC]">
                    {repartoReport.clients.map(cl => (
                      <div key={cl.key} className="py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[#1F1814] truncate">
                            {cl.clientName}
                          </p>
                          <p className="text-xs text-[#7A6B61] mt-0.5 tabular-nums">
                            {cl.driverName} · {cl.deliveriesCount} {cl.deliveriesCount === 1 ? 'entrega' : 'entregas'} · {cl.pieces.toLocaleString('es-MX')} pzas
                          </p>
                        </div>

                        <div className="text-right shrink-0 tabular-nums">
                          <p className="text-[11px] font-medium text-[#7A6B61]">Tu comisión</p>
                          <p className="text-base font-extrabold text-[#1D4ED8]">
                            {formatMoney(cl.commission, true)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* ÚLTIMAS ENTREGAS */}
              <section className="bg-white rounded-2xl border border-[#E7DFD3] p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#7A6B61]" />
                    <h2 className="text-sm font-bold text-[#1F1814]">Últimas entregas</h2>
                  </div>
                  <span className="text-xs text-[#7A6B61] tabular-nums">
                    {repartoReport.recentEntries.length} {repartoReport.recentEntries.length === 1 ? 'registro' : 'registros'}
                  </span>
                </div>

                {repartoReport.recentEntries.length === 0 ? (
                  <p className="text-xs text-[#7A6B61] py-3 text-center">
                    Aún no hay entregas para mostrar aquí.
                  </p>
                ) : (
                  <>
                    <div className="divide-y divide-[#EFE7DC]">
                      {visibleEntries.map(entry => (
                        <div key={entry.id} className="py-2.5 first:pt-1 last:pb-1 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#1F1814] truncate">
                              {entry.clientName}
                            </p>
                            <p className="text-xs text-[#7A6B61] mt-0.5 tabular-nums">
                              {entry.driverName} · {entry.shiftLabel} · {entry.date.slice(5)} · {entry.pieces} pzas
                            </p>
                          </div>

                          <div className="text-right shrink-0 tabular-nums">
                            <p className="text-sm font-bold text-[#1D4ED8]">
                              +{formatMoney(entry.commission, true)}
                            </p>
                            <p className="text-[11px] text-[#8A7B70]">
                              Comisión 5%
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {repartoReport.recentEntries.length > 12 && (
                      <button
                        type="button"
                        onClick={() => setShowAllSales(v => !v)}
                        className="w-full min-h-[44px] rounded-xl border border-[#E7DFD3] bg-[#FAF7F2] text-xs font-bold text-[#4A3B31] hover:bg-[#F2EAE0] transition"
                      >
                        {showAllSales
                          ? 'Mostrar menos'
                          : `Ver todas las entregas (${repartoReport.recentEntries.length})`}
                      </button>
                    )}
                  </>
                )}
              </section>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // =========================================================================
  // PANTALLA 2B: TABLERO DE ROSCAS Y ESFERAS O BARRA FRÍA (MÓVIL PRIMERO)
  // =========================================================================
  if (!report) return null;

  const isRoscas = activePortal === 'roscas';
  const maxChartPieces = Math.max(1, ...report.chartBuckets.map(b => b.pieces));
  const refugioPct =
    report.allBranchesTotalPieces > 0
      ? Math.round((report.branches.refugio.pieces / report.allBranchesTotalPieces) * 100)
      : 0;
  const zakiaPct = report.allBranchesTotalPieces > 0 ? 100 - refugioPct : 0;

  const visibleRecentLines = showAllSales ? report.recentLines : report.recentLines.slice(0, 12);

  return (
    <div className={`${standalone ? 'min-h-screen' : 'min-h-[calc(100vh-5rem)]'} bg-[#FAF7F2] text-[#1F1814] pb-12`}>
      <SocioWelcomeAnimation
        portal={activePortal}
        visible={showWelcomeAnim}
        onFinish={() => setShowWelcomeAnim(false)}
      />
      {/* Barra superior compacta (56px) */}
      <header className="sticky top-0 z-20 bg-[#FAF7F2]/95 backdrop-blur-sm border-b border-[#E7DFD3]">
        <div className="max-w-lg lg:max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleLockAndExit}
            className="min-h-[44px] -ml-2 px-2.5 rounded-xl text-sm font-semibold text-[#4A3B31] hover:bg-[#EFE7DC] active:scale-[0.98] transition flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Salir</span>
          </button>

          <div className="text-center min-w-0">
            <h1 className="text-base font-bold tracking-tight text-[#1F1814] truncate">
              {isRoscas ? 'Roscas y Esferas' : 'Barra Fría'}
            </h1>
            <p className="text-[11px] font-medium text-[#7A6B61] truncate">
              Desde {report.portalStartDateLabel} · {isRoscas ? 'Comisión 5%' : `$${BARRA_FRIA_COMMISSION_PER_UNIT.toFixed(2)} / postre`}
            </p>
          </div>

          <button
            type="button"
            onClick={handleRefreshAll}
            disabled={!onRefresh || isRefreshing}
            aria-label="Actualizar ventas"
            className="min-h-[44px] min-w-[44px] -mr-1 rounded-xl text-[#4A3B31] hover:bg-[#EFE7DC] active:scale-[0.98] transition flex items-center justify-center disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="max-w-lg lg:max-w-5xl mx-auto px-4 pt-4 space-y-4">
        {/* Selector de Periodo: Día / Semana / Mes + Navegador de fecha */}
        <section className="bg-white rounded-2xl border border-[#E7DFD3] p-3 space-y-3">
          <div className="grid grid-cols-3 gap-1.5 bg-[#F4EFE7] p-1 rounded-xl">
            {(
              [
                { id: 'dia', label: 'Por Día' },
                { id: 'semana', label: 'Por Semana' },
                { id: 'mes', label: 'Por Mes' }
              ] as const
            ).map(tab => {
              const active = timeframe === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleChangeTimeframe(tab.id)}
                  className={`min-h-[44px] rounded-lg text-sm font-bold transition ${
                    active
                      ? isRoscas
                        ? 'bg-[#231914] text-white'
                        : 'bg-[#102A2C] text-white'
                      : 'text-[#6B5E55] hover:text-[#1F1814]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => handleStepPeriod(-1)}
              aria-label="Periodo anterior"
              className="min-h-[44px] min-w-[44px] rounded-xl border border-[#E7DFD3] bg-[#FAF7F2] text-[#3C3028] hover:bg-[#F2EAE0] active:scale-[0.97] transition flex items-center justify-center"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="text-center min-w-0 flex-1">
              <p className="text-base font-bold text-[#1F1814] truncate tabular-nums">
                {report.periodTitle}
              </p>
              <div className="flex items-center justify-center gap-2 text-xs text-[#7A6B61]">
                <span className="truncate">{report.periodSubtitle}</span>
                {!isViewingCurrentPeriod && (
                  <>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() => {
                        setAnchorDate(todayStr);
                        setSelectedBucketKey(null);
                      }}
                      className={`font-bold underline underline-offset-2 ${
                        isRoscas ? 'text-[#B45309]' : 'text-[#0F766E]'
                      }`}
                    >
                      Volver a hoy
                    </button>
                  </>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleStepPeriod(1)}
              aria-label="Periodo siguiente"
              className="min-h-[44px] min-w-[44px] rounded-xl border border-[#E7DFD3] bg-[#FAF7F2] text-[#3C3028] hover:bg-[#F2EAE0] active:scale-[0.97] transition flex items-center justify-center"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </section>

        {/* Grid principal responsivo */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* COLUMNA IZQUIERDA */}
          <div className="lg:col-span-7 space-y-4">
            {/* TARJETA HERO: TUS GANANCIAS / COMISIÓN */}
            <section
              className={`rounded-2xl p-5 sm:p-6 text-white ${
                isRoscas ? 'bg-[#231914]' : 'bg-[#102A2C]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p
                  className={`text-xs font-semibold uppercase tracking-[0.12em] ${
                    isRoscas ? 'text-[#F5C16C]' : 'text-[#6EE7D8]'
                  }`}
                >
                  {isRoscas ? 'Tu comisión acumulada (5%)' : 'Tus ganancias acumuladas'}
                </p>
                <span className="text-xs font-medium text-white/75">
                  {branchFilter === 'todas'
                    ? 'El Refugio + Zakia'
                    : branchFilter === 'refugio'
                    ? 'Solo El Refugio'
                    : 'Solo Zakia'}
                </span>
              </div>

              <div className="mt-2">
                <p className="text-4xl sm:text-5xl font-extrabold tracking-tight tabular-nums leading-none">
                  {formatMoney(report.totalCommission, true)}
                </p>
                <p className="mt-2.5 text-sm text-white/80 tabular-nums">
                  {isRoscas ? (
                    <>
                      Comisión del {(ROSCA_COMMISSION_RATE * 100).toFixed(0)}% por cada rosca y esfera vendida
                    </>
                  ) : (
                    <>
                      {report.totalPieces} {report.totalPieces === 1 ? 'postre vendido' : 'postres vendidos'} ×{' '}
                      {formatMoney(BARRA_FRIA_COMMISSION_PER_UNIT, true)} c/u
                    </>
                  )}
                </p>
              </div>

              <div className="mt-5 pt-4 border-t border-white/15 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-white/65">
                    {isRoscas ? 'Piezas vendidas' : 'Postres vendidos'}
                  </p>
                  <p className="text-2xl font-bold tabular-nums mt-0.5">
                    {report.totalPieces}{' '}
                    <span className="text-sm font-medium text-white/70">pzas</span>
                  </p>
                  {isRoscas && (
                    <p className="text-xs text-white/75 mt-1 tabular-nums">
                      Roscas: {report.roscaPieces} · Esferas: {report.esferaPieces}
                    </p>
                  )}
                </div>

                <div className="border-l border-white/15 pl-4">
                  <p className="text-xs text-white/65">Movimientos</p>
                  <p className="text-2xl font-bold tabular-nums mt-0.5">
                    {report.ticketsCount}{' '}
                    <span className="text-sm font-medium text-white/70">
                      {report.ticketsCount === 1 ? 'venta' : 'ventas'}
                    </span>
                  </p>
                  <p className="text-xs text-white/75 mt-1 tabular-nums">
                    Prom. {report.ticketsCount > 0 ? (report.totalPieces / report.ticketsCount).toFixed(1) : '0.0'} pzas / venta
                  </p>
                </div>
              </div>

              {isRoscas && (report.roscaPieces > 0 || report.esferaPieces > 0) && (
                <div className="mt-4 pt-3.5 border-t border-white/10 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl bg-white/8 px-3 py-2.5">
                    <p className="text-white/70">Roscas ({report.roscaPieces} pzas)</p>
                    <p className="font-bold text-sm text-[#F5C16C] tabular-nums mt-0.5">
                      Com. {formatMoney(report.roscaCommission, true)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/8 px-3 py-2.5">
                    <p className="text-white/70">Esferas ({report.esferaPieces} pzas)</p>
                    <p className="font-bold text-sm text-[#F5C16C] tabular-nums mt-0.5">
                      Com. {formatMoney(report.esferaCommission, true)}
                    </p>
                  </div>
                </div>
              )}
            </section>

            {/* META CORTA ALCANZABLE MOTIVACIONAL */}
            <SocioGoalCard
              portal={activePortal}
              timeframe={timeframe}
              currentPieces={report.totalPieces}
              currentRevenue={report.totalRevenue}
              currentCommission={report.totalCommission}
              isBeforeStartDate={report.isBeforeStartDate}
              portalStartDateLabel={report.portalStartDateLabel}
              animationKey={`${activePortal}_${entryCount}_${timeframe}_${anchorDate}_${branchFilter}`}
              ready={!showWelcomeAnim}
            />

            {/* COMPARATIVO Y FILTRO POR SUCURSAL */}
            <section className="bg-white rounded-2xl border border-[#E7DFD3] p-4 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-[#7A6B61]" />
                  <h2 className="text-sm font-bold text-[#1F1814]">Por sucursal</h2>
                </div>
                <span className="text-xs text-[#7A6B61] tabular-nums">
                  Total: {report.allBranchesTotalPieces} pzas
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5 bg-[#F4EFE7] p-1 rounded-xl">
                {(
                  [
                    { id: 'todas', label: 'Ambas' },
                    { id: 'refugio', label: 'El Refugio' },
                    { id: 'zakia', label: 'Zakia' }
                  ] as const
                ).map(opt => {
                  const active = branchFilter === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setBranchFilter(opt.id);
                        setSelectedBucketKey(null);
                      }}
                      className={`min-h-[44px] rounded-lg text-xs sm:text-sm font-bold transition ${
                        active
                          ? 'bg-white text-[#1F1814] shadow-xs border border-[#E2D6C5]'
                          : 'text-[#6B5E55] hover:text-[#1F1814]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[report.branches.refugio, report.branches.zakia].map(br => {
                  const isSelected = branchFilter === br.branch;
                  const pct = br.branch === 'refugio' ? refugioPct : zakiaPct;
                  return (
                    <button
                      key={br.branch}
                      type="button"
                      onClick={() => {
                        setBranchFilter(prev => (prev === br.branch ? 'todas' : br.branch));
                        setSelectedBucketKey(null);
                      }}
                      className={`text-left rounded-xl p-3.5 border transition ${
                        isSelected
                          ? isRoscas
                            ? 'bg-[#FDF6EB] border-[#B45309]'
                            : 'bg-[#EFFAF8] border-[#0F766E]'
                          : 'bg-[#FAF7F2] border-[#E7DFD3] hover:border-[#CFC1AE]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-[#4A3B31]">{br.label}</span>
                        <span className="text-[11px] font-semibold text-[#8A7B70] tabular-nums">
                          {pct}%
                        </span>
                      </div>
                      <p className="text-xl font-extrabold text-[#1F1814] tabular-nums mt-1">
                        {br.pieces}{' '}
                        <span className="text-xs font-semibold text-[#7A6B61]">pzas</span>
                      </p>
                      <p
                        className={`text-xs font-bold tabular-nums mt-1 ${
                          isRoscas ? 'text-[#B45309]' : 'text-[#0F766E]'
                        }`}
                      >
                        Ganas {formatMoney(br.commission, true)}
                      </p>
                      <p className="text-[11px] text-[#8A7B70] tabular-nums mt-0.5">
                        {br.ticketsCount} {br.ticketsCount === 1 ? 'venta' : 'ventas'}
                      </p>
                    </button>
                  );
                })}
              </div>

              {report.allBranchesTotalPieces > 0 && (
                <div className="space-y-1.5">
                  <div className="h-2.5 w-full rounded-full bg-[#EFE7DC] overflow-hidden flex">
                    <div
                      className={isRoscas ? 'bg-[#B45309] h-full transition-all' : 'bg-[#0F766E] h-full transition-all'}
                      style={{ width: `${refugioPct}%` }}
                    />
                    <div
                      className={isRoscas ? 'bg-[#E59A4B] h-full transition-all' : 'bg-[#5CBDB3] h-full transition-all'}
                      style={{ width: `${zakiaPct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-medium text-[#7A6B61] tabular-nums">
                    <span>El Refugio ({refugioPct}%)</span>
                    <span>Zakia ({zakiaPct}%)</span>
                  </div>
                </div>
              )}
            </section>

            {/* GRÁFICO VISUAL: CÓMO SE ESTÁ VENDIENDO */}
            <section className="bg-white rounded-2xl border border-[#E7DFD3] p-4 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-[#7A6B61]" />
                    <h2 className="text-sm font-bold text-[#1F1814]">Cómo se está vendiendo</h2>
                  </div>
                  <p className="text-xs text-[#7A6B61] mt-0.5">
                    {timeframe === 'dia'
                      ? 'Ritmo por horario · toca una barra para ver detalle'
                      : timeframe === 'semana'
                      ? 'Piezas por día de la semana · toca un día'
                      : 'Piezas por semana del mes · toca una semana'}
                  </p>
                </div>

                {report.peakBucket && (
                  <div className="text-right shrink-0">
                    <p className="text-[11px] text-[#7A6B61]">Mejor momento</p>
                    <p className="text-xs font-bold text-[#1F1814] tabular-nums">
                      {report.peakBucket.label} · {report.peakBucket.pieces} pzas
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-2">
                <div
                  className="grid gap-1.5 sm:gap-2 items-end h-40"
                  style={{ gridTemplateColumns: `repeat(${report.chartBuckets.length}, minmax(0, 1fr))` }}
                >
                  {report.chartBuckets.map(bucket => {
                    const heightPct = bucket.pieces > 0 ? Math.max(12, Math.round((bucket.pieces / maxChartPieces) * 100)) : 4;
                    const isSelected = selectedBucketKey === bucket.key;
                    const isPeak = report.peakBucket?.key === bucket.key && bucket.pieces > 0;

                    return (
                      <button
                        key={bucket.key}
                        type="button"
                        onClick={() => setSelectedBucketKey(prev => (prev === bucket.key ? null : bucket.key))}
                        className="h-full flex flex-col items-center justify-end gap-1.5 group focus:outline-none"
                      >
                        <span
                          className={`text-[11px] font-bold tabular-nums leading-none ${
                            bucket.pieces > 0 ? 'text-[#1F1814]' : 'text-[#C2B6AA]'
                          }`}
                        >
                          {bucket.pieces}
                        </span>

                        <div className="w-full flex-1 flex items-end justify-center px-0.5">
                          <div
                            className={`w-full max-w-[36px] rounded-t-lg transition-all ${
                              bucket.pieces === 0
                                ? 'bg-[#EFE7DC]'
                                : isSelected
                                ? isRoscas
                                  ? 'bg-[#231914]'
                                  : 'bg-[#102A2C]'
                                : isPeak
                                ? isRoscas
                                  ? 'bg-[#B45309]'
                                  : 'bg-[#0F766E]'
                                : isRoscas
                                ? 'bg-[#D99B58] group-hover:bg-[#B45309]'
                                : 'bg-[#64BDB4] group-hover:bg-[#0F766E]'
                            }`}
                            style={{ height: `${heightPct}%` }}
                          />
                        </div>

                        <span
                          className={`text-[10px] sm:text-[11px] font-semibold leading-none truncate max-w-full ${
                            bucket.isCurrent || isSelected ? 'text-[#1F1814] font-bold' : 'text-[#7A6B61]'
                          }`}
                        >
                          {bucket.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedBucket && (
                <div className="rounded-xl bg-[#FAF7F2] border border-[#E7DFD3] px-3.5 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-[#1F1814]">
                      {selectedBucket.label}
                      {selectedBucket.sublabel ? ` · ${selectedBucket.sublabel}` : ''}
                    </p>
                    <p className="text-xs text-[#6B5E55] mt-0.5 tabular-nums">
                      El Refugio: {selectedBucket.refugioPieces} · Zakia: {selectedBucket.zakiaPieces}
                    </p>
                  </div>
                  <div className="text-right tabular-nums">
                    <p className="text-sm font-extrabold text-[#1F1814]">
                      {selectedBucket.pieces} pzas
                    </p>
                    <p
                      className={`text-xs font-bold ${
                        isRoscas ? 'text-[#B45309]' : 'text-[#0F766E]'
                      }`}
                    >
                      +{formatMoney(selectedBucket.commission, true)}
                    </p>
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* COLUMNA DERECHA */}
          <div className="lg:col-span-5 space-y-4">
            {/* GRÁFICA RANKING: PRODUCTOS MÁS VENDIDOS */}
            <section className="bg-white rounded-2xl border border-[#E7DFD3] p-4 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <BarChart3 className={`w-4 h-4 ${isRoscas ? 'text-[#B45309]' : 'text-[#0F766E]'}`} />
                  <h2 className="text-sm font-bold text-[#1F1814]">
                    {isRoscas ? 'Productos más vendidos' : 'Postres más vendidos'}
                  </h2>
                </div>
                <span className="text-xs text-[#7A6B61] tabular-nums">
                  {report.products.length} {report.products.length === 1 ? 'producto' : 'productos'}
                </span>
              </div>

              {report.products.length === 0 ? (
                <div className="rounded-xl bg-[#FAF7F2] border border-dashed border-[#DDD1C0] px-4 py-6 text-center">
                  <p className="text-sm font-semibold text-[#4A3B31]">
                    {report.isBeforeStartDate
                      ? `El conteo inicia el ${report.portalStartDateLabel}`
                      : 'Sin ventas registradas en este periodo'}
                  </p>
                  <p className="text-xs text-[#7A6B61] mt-1">
                    {report.isBeforeStartDate
                      ? 'Las ventas anteriores a esa fecha no entran en el conteo de comisiones.'
                      : `Conteo activo a partir del ${report.portalStartDateLabel}. Cuando se cobre en El Refugio o Zakia aparecerá aquí automáticamente.`}
                  </p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {(() => {
                    const maxProdPieces = Math.max(1, report.products[0]?.pieces || 1);
                    return report.products.map((prod, idx) => {
                      const barPct = Math.max(10, Math.round((prod.pieces / maxProdPieces) * 100));
                      const sharePct = report.totalPieces > 0
                        ? Math.round((prod.pieces / report.totalPieces) * 100)
                        : 0;

                      return (
                        <div key={prod.productKey} className="space-y-1.5">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-sm font-bold text-[#1F1814] truncate">
                              <span
                                className={`text-xs font-extrabold mr-1.5 tabular-nums ${
                                  isRoscas ? 'text-[#B45309]' : 'text-[#0F766E]'
                                }`}
                              >
                                #{idx + 1}
                              </span>
                              {prod.name}
                            </p>
                            <span className="text-xs font-extrabold text-[#1F1814] tabular-nums shrink-0">
                              {prod.pieces} {prod.pieces === 1 ? 'pza' : 'pzas'} ({sharePct}%)
                            </span>
                          </div>

                          <div
                            className={`h-2.5 w-full rounded-full overflow-hidden ${
                              isRoscas ? 'bg-[#F4E9D8]' : 'bg-[#E1F1EE]'
                            }`}
                          >
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${
                                isRoscas
                                  ? idx === 0
                                    ? 'bg-[#B45309]'
                                    : 'bg-[#D99B58]'
                                  : idx === 0
                                  ? 'bg-[#0F766E]'
                                  : 'bg-[#4EB5AA]'
                              }`}
                              style={{ width: `${barPct}%` }}
                            />
                          </div>

                          <div className="flex items-center justify-between gap-2 text-[11px] text-[#7A6B61] tabular-nums">
                            <span className="truncate">
                              {branchFilter === 'todas'
                                ? `El Refugio: ${prod.refugioPieces} · Zakia: ${prod.zakiaPieces}`
                                : branchFilter === 'refugio'
                                ? 'Sucursal El Refugio'
                                : 'Sucursal Zakia'}
                            </span>
                            <span
                              className={`font-bold shrink-0 ${
                                isRoscas ? 'text-[#B45309]' : 'text-[#0F766E]'
                              }`}
                            >
                              Ganas {formatMoney(prod.commission, true)}
                            </span>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </section>

            <section className="bg-white rounded-2xl border border-[#E7DFD3] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#7A6B61]" />
                  <h2 className="text-sm font-bold text-[#1F1814]">Últimas ventas</h2>
                </div>
                <span className="text-xs text-[#7A6B61] tabular-nums">
                  {report.recentLines.length} {report.recentLines.length === 1 ? 'registro' : 'registros'}
                </span>
              </div>

              {report.recentLines.length === 0 ? (
                <p className="text-xs text-[#7A6B61] py-3 text-center">
                  Aún no hay movimientos para mostrar aquí.
                </p>
              ) : (
                <>
                  <div className="divide-y divide-[#EFE7DC]">
                    {visibleRecentLines.map((line, idx) => (
                      <div
                        key={`${line.ticketId}_${line.productKey}_${idx}`}
                        className="py-2.5 first:pt-1 last:pb-1 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#1F1814] truncate">
                            <span className="font-extrabold tabular-nums">{line.quantity}×</span> {line.productName}
                          </p>
                          <p className="text-xs text-[#7A6B61] mt-0.5 tabular-nums">
                            {line.branch === 'zakia' ? 'Zakia' : 'El Refugio'} · {timeframe === 'dia' ? line.time : `${line.date.slice(5)} ${line.time}`}
                          </p>
                        </div>

                        <div className="text-right shrink-0 tabular-nums">
                          <p
                            className={`text-sm font-bold ${
                              isRoscas ? 'text-[#B45309]' : 'text-[#0F766E]'
                            }`}
                          >
                            +{formatMoney(line.commission, true)}
                          </p>
                          <p className="text-[11px] text-[#8A7B70]">
                            {isRoscas ? 'Tu comisión' : 'Tu ganancia'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {report.recentLines.length > 12 && (
                    <button
                      type="button"
                      onClick={() => setShowAllSales(v => !v)}
                      className="w-full min-h-[44px] rounded-xl border border-[#E7DFD3] bg-[#FAF7F2] text-xs font-bold text-[#4A3B31] hover:bg-[#F2EAE0] transition"
                    >
                      {showAllSales
                        ? 'Mostrar menos'
                        : `Ver todas las ventas (${report.recentLines.length})`}
                    </button>
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
};
