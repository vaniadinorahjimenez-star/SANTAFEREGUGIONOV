import React, { useEffect, useState } from 'react';
import { Award, Flame, Snowflake, Sparkles, Target, Truck } from 'lucide-react';
import {
  BARRA_FRIA_COMMISSION_PER_UNIT,
  REPARTO_COMMISSION_RATE,
  ROSCA_COMMISSION_RATE,
  SocioDriverFilter,
  SocioPortalType,
  SocioTimeframe,
  formatCompactMoney,
  formatMoney
} from './sociosAnalytics';

interface SocioWelcomeAnimationProps {
  portal: SocioPortalType;
  visible: boolean;
  onFinish: () => void;
}

/**
 * Animación breve y motivacional que se muestra cada vez que un socio ingresa a su rubro.
 */
export const SocioWelcomeAnimation: React.FC<SocioWelcomeAnimationProps> = ({
  portal,
  visible,
  onFinish
}) => {
  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => {
      onFinish();
    }, 1750);
    return () => window.clearTimeout(timer);
  }, [visible, onFinish]);

  if (!visible) return null;

  const config =
    portal === 'roscas'
      ? {
          bg: 'bg-[#231914]',
          accentText: 'text-[#F5C16C]',
          ring: 'border-[#F5C16C]/35 bg-[#F5C16C]/15',
          title: '¡Con todo, equipo Roscas!',
          subtitle: 'Cada pieza cuenta para alcanzar tu siguiente meta.',
          Icon: Sparkles
        }
      : portal === 'barra_fria'
      ? {
          bg: 'bg-[#102A2C]',
          accentText: 'text-[#6EE7D8]',
          ring: 'border-[#6EE7D8]/35 bg-[#6EE7D8]/15',
          title: '¡A brillar en Barra Fría!',
          subtitle: 'Cada postre suma directo a tus ganancias.',
          Icon: Snowflake
        }
      : {
          bg: 'bg-[#172033]',
          accentText: 'text-[#93C5FD]',
          ring: 'border-[#93C5FD]/35 bg-[#93C5FD]/15',
          title: '¡Excelente ruta, equipo Reparto!',
          subtitle: 'Cada entrega te acerca a superar tu meta.',
          Icon: Truck
        };

  const IconComponent = config.Icon;

  return (
    <div
      onClick={onFinish}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') onFinish();
      }}
      className={`fixed inset-0 z-50 ${config.bg} text-white flex flex-col items-center justify-center px-6 text-center cursor-pointer`}
    >
      <div className="relative flex flex-col items-center max-w-xs">
        {/* Destellos animados sutiles */}
        <span
          className={`socio-spark-float absolute -top-6 -left-6 w-2.5 h-2.5 rounded-full ${config.accentText} bg-current opacity-80`}
          style={{ animationDelay: '0ms' }}
        />
        <span
          className={`socio-spark-float absolute -top-4 -right-8 w-2 h-2 rounded-full ${config.accentText} bg-current opacity-70`}
          style={{ animationDelay: '280ms' }}
        />
        <span
          className={`socio-spark-float absolute top-8 -right-10 w-2.5 h-2.5 rounded-full ${config.accentText} bg-current opacity-60`}
          style={{ animationDelay: '520ms' }}
        />

        <div
          className={`socio-badge-bounce w-20 h-20 rounded-3xl border ${config.ring} flex items-center justify-center ${config.accentText}`}
        >
          <IconComponent className="w-9 h-9" />
        </div>

        <p className={`socio-fade-up mt-6 text-xs font-semibold uppercase tracking-[0.18em] ${config.accentText}`}>
          Socios Santa Fe
        </p>
        <h2
          className="socio-fade-up mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight"
          style={{ animationDelay: '90ms' }}
        >
          {config.title}
        </h2>
        <p
          className="socio-fade-up mt-2.5 text-sm text-white/75 leading-relaxed"
          style={{ animationDelay: '180ms' }}
        >
          {config.subtitle}
        </p>
      </div>
    </div>
  );
};

interface SocioGoalCardProps {
  portal: SocioPortalType;
  timeframe: SocioTimeframe;
  currentPieces: number;
  currentRevenue: number;
  currentCommission: number;
  isBeforeStartDate?: boolean;
  portalStartDateLabel?: string;
  driverFilter?: SocioDriverFilter;
  animationKey: string;
  ready?: boolean;
}

interface ComputedGoal {
  stepTarget: number;
  milestonesCompleted: number;
  progressPct: number;
  remainingText: string;
  targetLabel: string;
  currentLabel: string;
  rewardText: string;
  motivationHeadline: string;
}

function computeShortGoal(props: SocioGoalCardProps): ComputedGoal {
  const { portal, timeframe, currentPieces, currentRevenue, driverFilter = 'todos' } = props;

  if (portal === 'roscas') {
    const step = timeframe === 'dia' ? 10 : timeframe === 'semana' ? 25 : 50;
    const milestonesCompleted = Math.floor(currentPieces / step);
    const stepTarget = (milestonesCompleted + 1) * step;
    const remaining = Math.max(0, stepTarget - currentPieces);
    const progressPct = Math.min(100, Math.round((currentPieces / stepTarget) * 100));
    const avgPrice = currentPieces > 0 ? currentRevenue / currentPieces : 50;
    const projectedCommission = Math.round(stepTarget * avgPrice * ROSCA_COMMISSION_RATE * 100) / 100;

    let motivationHeadline = '¡Arranca tu siguiente meta corta!';
    if (progressPct >= 80) motivationHeadline = '¡Ya casi la alcanzas, último empujón!';
    else if (milestonesCompleted >= 1) motivationHeadline = `¡${milestonesCompleted} ${milestonesCompleted === 1 ? 'meta superada' : 'metas superadas'}! Sigue así`;
    else if (currentPieces > 0) motivationHeadline = '¡Buen ritmo! Vas muy bien';

    return {
      stepTarget,
      milestonesCompleted,
      progressPct,
      remainingText:
        remaining === 1 ? 'Solo falta 1 pieza para lograrlo' : `Te faltan solo ${remaining} piezas para lograrlo`,
      targetLabel: `${stepTarget} piezas`,
      currentLabel: `${currentPieces} de ${stepTarget} pzas`,
      rewardText: `Al llegar a ${stepTarget} pzas tu comisión sube aprox. a ${formatMoney(projectedCommission, true)}`,
      motivationHeadline
    };
  }

  if (portal === 'barra_fria') {
    const step = timeframe === 'dia' ? 10 : timeframe === 'semana' ? 30 : 50;
    const milestonesCompleted = Math.floor(currentPieces / step);
    const stepTarget = (milestonesCompleted + 1) * step;
    const remaining = Math.max(0, stepTarget - currentPieces);
    const progressPct = Math.min(100, Math.round((currentPieces / stepTarget) * 100));
    const goalEarnings = stepTarget * BARRA_FRIA_COMMISSION_PER_UNIT;

    let motivationHeadline = '¡Tu primera meta corta te espera!';
    if (progressPct >= 80) motivationHeadline = '¡A nada de lograr esta meta!';
    else if (milestonesCompleted >= 1) motivationHeadline = `¡${milestonesCompleted} ${milestonesCompleted === 1 ? 'meta lograda' : 'metas logradas'}! Excelente`;
    else if (currentPieces > 0) motivationHeadline = '¡Gran avance! Sigue sumando';

    return {
      stepTarget,
      milestonesCompleted,
      progressPct,
      remainingText:
        remaining === 1 ? 'Solo falta 1 postre para lograrlo' : `Te faltan solo ${remaining} postres para lograrlo`,
      targetLabel: `${stepTarget} postres`,
      currentLabel: `${currentPieces} de ${stepTarget} postres`,
      rewardText: `Al lograrlo aseguras ${formatMoney(goalEarnings, true)} de ganancia`,
      motivationHeadline
    };
  }

  // Reparto (Simón / Osvaldo / Ambos) — metas cortas alcanzables basadas en SU comisión (sin mostrar ventas totales de panadería)
  const isSingleDriver = driverFilter === 'simon' || driverFilter === 'osvaldo';
  const step =
    timeframe === 'dia'
      ? isSingleDriver
        ? 100
        : 200
      : timeframe === 'semana'
      ? isSingleDriver
        ? 500
        : 900
      : isSingleDriver
      ? 1000
      : 1800;

  const currentComm = props.currentCommission;
  const milestonesCompleted = Math.floor(currentComm / step);
  const stepTarget = (milestonesCompleted + 1) * step;
  const remaining = Math.max(0, Math.round((stepTarget - currentComm) * 100) / 100);
  const progressPct = Math.min(100, Math.round((currentComm / stepTarget) * 100));

  let motivationHeadline = '¡Vamos por tu siguiente meta de comisión!';
  if (progressPct >= 80) motivationHeadline = '¡Estás muy cerca de cruzar la meta!';
  else if (milestonesCompleted >= 1) motivationHeadline = `¡${milestonesCompleted} ${milestonesCompleted === 1 ? 'meta superada' : 'metas superadas'}! Gran trabajo`;
  else if (currentComm > 0) motivationHeadline = '¡Excelente avance en tus entregas!';

  return {
    stepTarget,
    milestonesCompleted,
    progressPct,
    remainingText: `Te faltan ${formatCompactMoney(remaining)} de comisión`,
    targetLabel: `${formatCompactMoney(stepTarget)} comisión`,
    currentLabel: `${formatCompactMoney(currentComm)} de ${formatCompactMoney(stepTarget)}`,
    rewardText: `Sigue sumando entregas para superar los ${formatMoney(stepTarget, true)} en comisiones`,
    motivationHeadline
  };
}

/**
 * Tarjeta motivacional de Meta Corta Alcanzable con barra animada al entrar al rubro.
 */
export const SocioGoalCard: React.FC<SocioGoalCardProps> = props => {
  const { portal, isBeforeStartDate, portalStartDateLabel, animationKey, ready = true } = props;
  const goal = computeShortGoal(props);
  const [animatedWidth, setAnimatedWidth] = useState<number>(0);

  useEffect(() => {
    setAnimatedWidth(0);
    if (!ready) return;
    let timerId: number | undefined;
    const frame = window.requestAnimationFrame(() => {
      timerId = window.setTimeout(() => {
        setAnimatedWidth(Math.max(goal.progressPct > 0 ? 6 : 0, goal.progressPct));
      }, 110);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (timerId !== undefined) window.clearTimeout(timerId);
    };
  }, [goal.progressPct, animationKey, ready]);

  const theme =
    portal === 'roscas'
      ? {
          iconBg: 'bg-[#FDF3E3] text-[#B45309]',
          barFill: 'bg-[#B45309]',
          accentText: 'text-[#B45309]',
          trackBg: 'bg-[#F2E8D8]'
        }
      : portal === 'barra_fria'
      ? {
          iconBg: 'bg-[#E6F7F5] text-[#0F766E]',
          barFill: 'bg-[#0F766E]',
          accentText: 'text-[#0F766E]',
          trackBg: 'bg-[#DFEFEA]'
        }
      : {
          iconBg: 'bg-[#EBF2FF] text-[#1D4ED8]',
          barFill: 'bg-[#1D4ED8]',
          accentText: 'text-[#1D4ED8]',
          trackBg: 'bg-[#E2E9F6]'
        };

  return (
    <section
      key={animationKey}
      className="socio-fade-up bg-white rounded-2xl border border-[#E7DFD3] p-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`socio-badge-bounce w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${theme.iconBg}`}>
            {goal.milestonesCompleted >= 1 ? (
              <Award className="w-5 h-5" />
            ) : goal.progressPct >= 60 ? (
              <Flame className="w-5 h-5" />
            ) : (
              <Target className="w-5 h-5" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8A7B70]">
              Meta corta alcanzable · {goal.targetLabel}
            </p>
            <h2 className="text-sm font-bold text-[#1F1814] leading-snug">
              {isBeforeStartDate
                ? `Tu primera meta inicia el ${portalStartDateLabel}`
                : goal.motivationHeadline}
            </h2>
          </div>
        </div>

        <span className={`text-lg font-extrabold tabular-nums shrink-0 ${theme.accentText}`}>
          {goal.progressPct}%
        </span>
      </div>

      {/* Barra de progreso animada con destello suave */}
      <div className="space-y-1.5">
        <div className={`relative h-3 w-full rounded-full overflow-hidden ${theme.trackBg}`}>
          <div
            className={`relative h-full rounded-full overflow-hidden transition-[width] duration-1000 ease-out ${theme.barFill}`}
            style={{ width: `${animatedWidth}%` }}
          >
            <div className="socio-shimmer-sweep absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
          <span className="font-semibold text-[#4A3B31]">{goal.currentLabel}</span>
          <span className="text-[#7A6B61] text-right">
            {isBeforeStartDate ? '¡Listos para arrancar!' : goal.remainingText}
          </span>
        </div>
      </div>

      <p className="text-xs font-medium text-[#5C4E45] pt-2 border-t border-[#F1EAE0] tabular-nums">
        {goal.rewardText}
      </p>
    </section>
  );
};
