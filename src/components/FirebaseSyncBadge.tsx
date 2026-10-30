import React, { useState, useEffect } from 'react';
import { 
  onFirebaseStateChange, 
  loginWithGoogle, 
  registerWithEmail,
  loginWithEmail,
  logoutGoogle, 
  syncAllLocalDataToFirestore,
  type FirebaseSyncState 
} from '../services/firebaseSyncService';
import { 
  Cloud, 
  RefreshCw, 
  LogIn, 
  LogOut, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Smartphone, 
  Mail, 
  Lock, 
  UserPlus, 
  ExternalLink, 
  Copy, 
  Check 
} from 'lucide-react';

export const FirebaseSyncBadge: React.FC = () => {
  const [syncState, setSyncState] = useState<FirebaseSyncState>({
    user: null,
    isOnline: true,
    isFirebaseConnected: false,
    lastSyncTime: Date.now(),
    syncStatus: 'unauthenticated'
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Form states
  const [activeTab, setActiveTab] = useState<'google' | 'email'>('google');
  const [emailMode, setEmailMode] = useState<'login' | 'register'>('register');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [copiedHost, setCopiedHost] = useState(false);

  const currentHostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isNetlifyOrCustom = currentHostname && currentHostname !== 'localhost' && !currentHostname.endsWith('.firebaseapp.com');

  useEffect(() => {
    const unsub = onFirebaseStateChange((state) => {
      setSyncState(state);
      if (state.errorMessage) {
        setActionNotice({ type: 'error', text: state.errorMessage });
      }
    });
    return unsub;
  }, []);

  const handleGoogleLogin = async () => {
    setIsActionLoading(true);
    setActionNotice(null);
    try {
      await loginWithGoogle();
      setActionNotice({ type: 'success', text: '¡Conectado exitosamente con Google! Sincronizando en tiempo real.' });
    } catch (err: any) {
      setActionNotice({ type: 'error', text: err?.message || 'Error al conectar con Google.' });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleEmailAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput || !passwordInput) {
      setActionNotice({ type: 'error', text: 'Por favor ingresa tu correo y una contraseña.' });
      return;
    }
    if (passwordInput.length < 6) {
      setActionNotice({ type: 'error', text: 'La contraseña debe tener al menos 6 caracteres.' });
      return;
    }

    setIsActionLoading(true);
    setActionNotice(null);
    try {
      if (emailMode === 'register') {
        await registerWithEmail(emailInput, passwordInput);
        setActionNotice({ type: 'success', text: '¡Cuenta registrada y conectada con éxito a Firebase!' });
      } else {
        await loginWithEmail(emailInput, passwordInput);
        setActionNotice({ type: 'success', text: '¡Sesión iniciada con éxito! Sincronizando datos.' });
      }
      setEmailInput('');
      setPasswordInput('');
    } catch (err: any) {
      setActionNotice({ type: 'error', text: err?.message || 'Error al autenticar en Firebase.' });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleLogout = async () => {
    setIsActionLoading(true);
    try {
      await logoutGoogle();
      setActionNotice({ type: 'info', text: 'Sesión cerrada.' });
    } catch (err: any) {
      setActionNotice({ type: 'error', text: 'Error al cerrar sesión.' });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleForceSync = async () => {
    setIsActionLoading(true);
    setActionNotice(null);
    try {
      const res = await syncAllLocalDataToFirestore();
      if (res.success) {
        setActionNotice({ type: 'success', text: `¡Sincronización completa! ${res.count} registros sincronizados con la nube.` });
      } else {
        setActionNotice({ type: 'error', text: 'Hubo un detalle al sincronizar. Verifique su conexión a internet.' });
      }
    } catch (err: any) {
      setActionNotice({ type: 'error', text: 'Error al sincronizar con Firebase.' });
    } finally {
      setIsActionLoading(false);
    }
  };

  const copyHostnameToClipboard = () => {
    if (currentHostname && navigator.clipboard) {
      navigator.clipboard.writeText(currentHostname);
      setCopiedHost(true);
      setTimeout(() => setCopiedHost(false), 2500);
    }
  };

  return (
    <>
      {/* Badge Button en la barra superior */}
      {syncState.user ? (
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center space-x-1.5 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
          title={`Conectado a Firebase en tiempo real como ${syncState.user.email}`}
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="hidden sm:inline">Firebase En Vivo</span>
          <span className="sm:hidden">En Vivo</span>
        </button>
      ) : (
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center space-x-1.5 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs animate-pulse"
          title="Conectar o registrar en Firebase para sincronizar en tiempo real"
        >
          <Smartphone className="w-3.5 h-3.5 text-amber-700" />
          <span className="hidden sm:inline">Conectar Nube</span>
          <span className="sm:hidden">Nube</span>
        </button>
      )}

      {/* Modal de Control de Sincronización y Registro Firebase */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header del Modal */}
            <div className="px-5 py-4 bg-gradient-to-r from-orange-600 via-amber-600 to-amber-700 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                  <Cloud className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base leading-tight">Firebase Cloud & Sincronización</h3>
                  <p className="text-[11px] text-amber-100">Punto Zákia - Panadería Santa Fé</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Contenido scrolleable */}
            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Resumen del estado actual */}
              <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-600">Estado de Firebase:</span>
                  {syncState.user ? (
                    <span className="inline-flex items-center font-black text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                      Conectado en Vivo
                    </span>
                  ) : (
                    <span className="inline-flex items-center font-black text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full">
                      <AlertCircle className="w-3.5 h-3.5 mr-1 text-amber-600" />
                      Pendiente de Conectar
                    </span>
                  )}
                </div>

                {syncState.user && (
                  <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-200">
                    <span className="font-medium text-slate-500">Usuario Activo:</span>
                    <span className="font-black text-slate-900 truncate max-w-[220px]">
                      {syncState.user.email}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-200">
                  <span className="font-medium text-slate-500">Conexión a Internet:</span>
                  <span className={`font-bold ${syncState.isOnline ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {syncState.isOnline ? '🟢 En Línea' : '🔴 Modo Local (Sin Internet)'}
                  </span>
                </div>
              </div>

              {/* Notificación de error o éxito */}
              {actionNotice && (
                <div
                  className={`p-3 rounded-2xl text-xs font-semibold flex items-start space-x-2 animate-in fade-in ${
                    actionNotice.type === 'error'
                      ? 'bg-rose-50 border border-rose-200 text-rose-900'
                      : actionNotice.type === 'success'
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                      : 'bg-blue-50 border border-blue-200 text-blue-900'
                  }`}
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="leading-snug">{actionNotice.text}</span>
                </div>
              )}

              {/* Si NO está conectado: Opciones de Registro / Inicio */}
              {!syncState.user ? (
                <div className="space-y-4">
                  {/* Selector de Pestañas: Google vs Correo */}
                  <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => { setActiveTab('google'); setActionNotice(null); }}
                      className={`flex-1 py-2 text-xs font-black rounded-lg transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${
                        activeTab === 'google'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span>Google (1 Clic)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setActiveTab('email'); setActionNotice(null); }}
                      className={`flex-1 py-2 text-xs font-black rounded-lg transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${
                        activeTab === 'email'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Correo y Contraseña</span>
                    </button>
                  </div>

                  {activeTab === 'google' ? (
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={handleGoogleLogin}
                        disabled={isActionLoading}
                        className="w-full flex items-center justify-center space-x-2.5 py-3 px-4 bg-orange-600 hover:bg-orange-700 active:scale-[0.98] text-white rounded-2xl font-black text-sm shadow-md transition-all disabled:opacity-50 cursor-pointer"
                      >
                        {isActionLoading ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <LogIn className="w-4 h-4" />
                        )}
                        <span>Iniciar Sesión con Google</span>
                      </button>

                      {/* Guía de dominio autorizado para Netlify o dominios externos */}
                      {isNetlifyOrCustom && (
                        <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-3.5 space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-amber-900 flex items-center space-x-1">
                              <span>🌐</span>
                              <span>Configuración de Dominio para Google</span>
                            </span>
                          </div>
                          <p className="text-amber-800 leading-relaxed text-[11px]">
                            Si Google te marca <em>error de dominio no autorizado (auth/unauthorized-domain)</em>, agrega el dominio de tu panadería en Firebase Console:
                          </p>
                          <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-amber-200 font-mono text-[11px] text-slate-800 overflow-x-auto">
                            <span className="truncate flex-1 font-bold">{currentHostname}</span>
                            <button
                              type="button"
                              onClick={copyHostnameToClipboard}
                              className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg font-sans font-bold text-[10px] flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                            >
                              {copiedHost ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedHost ? '¡Copiado!' : 'Copiar'}</span>
                            </button>
                          </div>
                          <div className="pt-1 flex justify-between items-center text-[11px]">
                            <span className="text-slate-500">O usa la pestaña <strong>Correo</strong> (funciona en cualquier dominio)</span>
                            <a
                              href="https://console.firebase.google.com/project/gen-lang-client-0249819239/authentication/settings"
                              target="_blank"
                              rel="noreferrer"
                              className="text-orange-700 font-bold hover:underline flex items-center gap-1 shrink-0"
                            >
                              <span>Firebase Console</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Pestaña: Correo y Contraseña (Registro / Login) */
                    <form onSubmit={handleEmailAuthSubmit} className="space-y-3.5">
                      <div className="flex items-center justify-between text-xs px-1">
                        <span className="font-bold text-slate-700">
                          {emailMode === 'register' ? 'Crear Nueva Cuenta' : 'Ingresar con tu Cuenta'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEmailMode(emailMode === 'register' ? 'login' : 'register');
                            setActionNotice(null);
                          }}
                          className="text-orange-600 hover:text-orange-800 font-black cursor-pointer"
                        >
                          {emailMode === 'register' ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
                        </button>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Correo Electrónico
                        </label>
                        <div className="relative">
                          <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="email"
                            required
                            placeholder="ejemplo@panaderiasantafe.com"
                            value={emailInput}
                            onChange={(e) => setEmailInput(e.target.value)}
                            className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-orange-500 text-slate-900"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Contraseña (mínimo 6 caracteres)
                        </label>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="password"
                            required
                            minLength={6}
                            placeholder="••••••••"
                            value={passwordInput}
                            onChange={(e) => setPasswordInput(e.target.value)}
                            className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-orange-500 text-slate-900"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={isActionLoading}
                        className="w-full flex items-center justify-center space-x-2 py-3 px-4 bg-orange-600 hover:bg-orange-700 active:scale-[0.98] text-white rounded-2xl font-black text-sm shadow-md transition-all disabled:opacity-50 cursor-pointer"
                      >
                        {isActionLoading ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : emailMode === 'register' ? (
                          <UserPlus className="w-4 h-4" />
                        ) : (
                          <LogIn className="w-4 h-4" />
                        )}
                        <span>
                          {emailMode === 'register'
                            ? 'Registrar Cuenta en Firebase'
                            : 'Iniciar Sesión en Firebase'}
                        </span>
                      </button>

                      <p className="text-[11px] text-slate-500 text-center">
                        Cualquier cajero o administrador puede registrarse para sincronizar tickets y ver ventas en tiempo real en celular.
                      </p>
                    </form>
                  )}
                </div>
              ) : (
                /* Si YA está conectado: Sincronización y Cierre de Sesión */
                <div className="space-y-3 pt-1">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center space-x-3 text-xs text-emerald-900">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <strong className="block font-bold">Base de Datos Conectada</strong>
                      <span>Todos los tickets, clientes y pedidos que registres se guardan en tu celular y en la nube al instante.</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleForceSync}
                    disabled={isActionLoading}
                    className="w-full flex items-center justify-center space-x-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-2xl font-black text-sm shadow-md transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isActionLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    <span>Sincronizar Todo Ahora con Firebase</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isActionLoading}
                    className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] text-slate-700 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5 text-slate-500" />
                    <span>Cerrar Sesión</span>
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-500 font-mono">
                BD: ai-studio-puntorefugio
              </span>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-1.5 text-xs font-extrabold text-slate-700 hover:text-slate-900 rounded-xl hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
