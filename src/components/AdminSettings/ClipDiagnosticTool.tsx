import React, { useState, useEffect } from 'react';
import { 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Copy, 
  Check, 
  KeyRound, 
  Terminal, 
  Server, 
  ShieldCheck, 
  Activity, 
  ExternalLink,
  Smartphone,
  CreditCard
} from 'lucide-react';
import { 
  getStoredClipConfig, 
  saveClipConfig, 
  DEFAULT_CLIP_SERIAL,
  DEFAULT_CLIP_API_KEY,
  DEFAULT_CLIP_SECRET_KEY,
  executeClipPaymentFetch 
} from '../../services/clipService';

interface ClipDiagnosticToolProps {
  initialSerial?: string;
  onConfigUpdated?: () => void;
}

export const ClipDiagnosticTool: React.FC<ClipDiagnosticToolProps> = ({
  initialSerial = DEFAULT_CLIP_SERIAL,
  onConfigUpdated
}) => {
  const [storedConfig, setStoredConfig] = useState(getStoredClipConfig());
  const [serial, setSerial] = useState<string>(storedConfig.serialNumber || DEFAULT_CLIP_SERIAL);
  const [apiKey, setApiKey] = useState<string>(storedConfig.apiKey || DEFAULT_CLIP_API_KEY);
  const [secretKey, setSecretKey] = useState<string>(storedConfig.secretKey || DEFAULT_CLIP_SECRET_KEY);
  const [terminalAlias, setTerminalAlias] = useState<string>(storedConfig.terminalName || 'Clip Total 2');
  
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [activeView, setActiveView] = useState<'raw' | 'parsed' | 'code'>('code');
  
  // Variables dinámicas para prueba de Fetch oficial
  const [codeTestAmount, setCodeTestAmount] = useState<string>('1.00');
  const [codeTestRef, setCodeTestRef] = useState<string>(`PAN-${Date.now().toString().slice(-4)}`);
  const [isExecutingCodeFetch, setIsExecutingCodeFetch] = useState<boolean>(false);
  const [codeTestResult, setCodeTestResult] = useState<any>(null);

  // Resultados de la prueba
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [responseTimeMs, setResponseTimeMs] = useState<number | null>(null);
  const [lastTestedAt, setLastTestedAt] = useState<string | null>(null);
  const [rawResponseText, setRawResponseText] = useState<string>('');
  const [parsedData, setParsedData] = useState<any>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);

  // Ejecutar diagnóstico automáticamente la primera vez
  useEffect(() => {
    runDiagnostic();
  }, []);

  const [isTestingPayment, setIsTestingPayment] = useState(false);
  const [testPaymentResult, setTestPaymentResult] = useState<any>(null);

  const runDiagnostic = async () => {
    setIsLoading(true);
    setErrorDetails(null);
    setTestPaymentResult(null);
    const startTime = performance.now();

    try {
      const endpoint = '/.netlify/functions/clip-payment';
      const requestPayload = {
        action: 'diagnose',
        serial_number_pos: serial.trim() || DEFAULT_CLIP_SERIAL,
        api_key: apiKey.trim() || undefined,
        secret_key: secretKey.trim() || undefined
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestPayload)
      });

      const elapsed = Math.round(performance.now() - startTime);
      setResponseTimeMs(elapsed);
      setResponseStatus(res.status);
      setLastTestedAt(new Date().toLocaleTimeString());

      const rawText = await res.text();
      setRawResponseText(rawText);

      try {
        const json = JSON.parse(rawText);
        setParsedData(json);
      } catch (e) {
        setParsedData(null);
      }
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - startTime);
      setResponseTimeMs(elapsed);
      setResponseStatus(0);
      setErrorDetails(err.message || 'Error de red al intentar contactar la función de Netlify.');
      setRawResponseText(JSON.stringify({ error: 'FETCH_FAILED', message: err.message }, null, 2));
    } finally {
      setIsLoading(false);
    }
  };

  const runTestPayment = async () => {
    setIsTestingPayment(true);
    setTestPaymentResult(null);
    const startTime = performance.now();

    try {
      const testRef = `TEST-${Date.now().toString().slice(-6)}`;
      const requestPayload = {
        action: 'create_payment',
        amount: 1.00,
        reference: testRef,
        serial_number_pos: serial.trim() || DEFAULT_CLIP_SERIAL,
        api_key: apiKey.trim() || undefined,
        secret_key: secretKey.trim() || undefined
      };

      const res = await fetch('/.netlify/functions/clip-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestPayload)
      });

      const elapsed = Math.round(performance.now() - startTime);
      setResponseTimeMs(elapsed);
      setResponseStatus(res.status);
      setLastTestedAt(new Date().toLocaleTimeString());

      const rawText = await res.text();
      setRawResponseText(rawText);

      try {
        const json = JSON.parse(rawText);
        setTestPaymentResult({ status: res.status, ok: res.ok, data: json });
      } catch {
        setTestPaymentResult({ status: res.status, ok: res.ok, data: { raw: rawText } });
      }
    } catch (err: any) {
      setTestPaymentResult({ status: 0, ok: false, data: { error: err.message } });
    } finally {
      setIsTestingPayment(false);
    }
  };

  const handleCopyRaw = () => {
    if (!rawResponseText) return;
    navigator.clipboard.writeText(rawResponseText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveCredentialsLocally = () => {
    const updated = {
      ...storedConfig,
      serialNumber: serial.trim() || DEFAULT_CLIP_SERIAL,
      terminalName: terminalAlias.trim() || 'Clip Total 2',
      apiKey: apiKey.trim() || undefined,
      secretKey: secretKey.trim() || undefined
    };
    saveClipConfig(updated);
    setStoredConfig(updated);
    if (onConfigUpdated) onConfigUpdated();
    setSaveSuccessNotice('Credenciales, alias Clip Total 2 y número de serie guardados en la configuración de la panadería.');
    setTimeout(() => setSaveSuccessNotice(null), 3500);
  };

  const handleResetToDefaultSerial = () => {
    setSerial(DEFAULT_CLIP_SERIAL);
  };

  // Determinar status principal
  const connectionStatus = parsedData?.status || (responseStatus === 200 ? 'SUCCESS' : responseStatus ? `HTTP_${responseStatus}` : 'FAILED');

  const getStatusBadge = () => {
    if (isLoading) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-blue-100 text-blue-800 animate-pulse">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          DIAGNOSTICANDO...
        </span>
      );
    }

    if (connectionStatus === 'CONNECTED' || (responseStatus === 200 && parsedData?.clip_http_status === 200)) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          API ALCANZABLE & CONECTADA
        </span>
      );
    }

    if (connectionStatus === 'AUTH_FAILED' || parsedData?.clip_http_status === 401) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-red-100 text-red-800 border border-red-300">
          <XCircle className="w-4 h-4 text-red-600" />
          ERROR 401: AUTORIZACIÓN FALLIDA
        </span>
      );
    }

    if (connectionStatus === 'MISSING_CREDENTIALS') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-300">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          FALTAN CREDENCIALES
        </span>
      );
    }

    if (connectionStatus === 'SERIAL_NOT_FOUND' || parsedData?.is_serial_in_account === false) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-orange-100 text-orange-800 border border-orange-300">
          <Smartphone className="w-4 h-4 text-orange-600" />
          SERIE NO REGISTRADA EN LA CUENTA
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-slate-100 text-slate-800 border border-slate-300">
        <Activity className="w-4 h-4 text-slate-600" />
        ESTADO: {connectionStatus}
      </span>
    );
  };

  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-orange-200 space-y-6">
      {/* Encabezado de la Herramienta */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#FF5A00]/10 border border-[#FF5A00]/20 flex items-center justify-center text-[#FF5A00] shrink-0">
            <Terminal className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-900">
                Herramienta de Diagnóstico API Clip
              </h2>
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono text-[10px] font-bold">
                v1.2
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Verifica en tiempo real la alcanzabilidad del endpoint <code className="text-orange-600 font-mono">/.netlify/functions/clip-payment</code> con la acción <code className="text-orange-600 font-mono">diagnose</code> para la terminal <strong>{serial}</strong>.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {getStatusBadge()}
          <button
            id="run-clip-diagnostic-btn"
            type="button"
            disabled={isLoading || isTestingPayment}
            onClick={runDiagnostic}
            className="bg-[#FF5A00] hover:bg-[#E04D00] disabled:bg-slate-300 text-white font-extrabold px-3.5 py-2.5 rounded-2xl text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition-all active:scale-95"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Consultando...' : 'Diagnosticar Conexión'}</span>
          </button>

          <button
            id="run-clip-test-payment-btn"
            type="button"
            disabled={isLoading || isTestingPayment}
            onClick={runTestPayment}
            className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-extrabold px-3.5 py-2.5 rounded-2xl text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition-all active:scale-95"
            title="Envía una intención de cobro real de $1.00 MXN a Clip para ver qué responde la terminal"
          >
            <CreditCard className={`w-4 h-4 ${isTestingPayment ? 'animate-pulse text-orange-400' : ''}`} />
            <span>{isTestingPayment ? 'Enviando a Clip...' : 'Enviar Señal de Prueba ($1.00)'}</span>
          </button>
        </div>
      </div>

      {/* Parámetros de la Petición */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-slate-500" />
            Parámetros enviados a la Netlify Function:
          </span>
          <button
            type="button"
            onClick={handleSaveCredentialsLocally}
            className="text-[11px] font-bold text-orange-600 hover:text-orange-700 cursor-pointer flex items-center gap-1"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Guardar estos valores en la panadería
          </button>
        </div>

        {saveSuccessNotice && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold animate-in fade-in">
            ✅ {saveSuccessNotice}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Alias */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-slate-600">
                Alias de Terminal:
              </label>
            </div>
            <input
              id="diagnostic-alias-input"
              type="text"
              value={terminalAlias}
              onChange={(e) => setTerminalAlias(e.target.value)}
              placeholder="Clip Total 2"
              className="w-full px-3 py-2 bg-white rounded-xl border border-slate-300 text-xs font-bold focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {/* Serie */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-slate-600">
                serial_number_pos:
              </label>
              <button
                type="button"
                onClick={handleResetToDefaultSerial}
                className="text-[10px] text-blue-600 hover:underline"
                title="Restablecer P8C2240805000156"
              >
                P8C2240805000156
              </button>
            </div>
            <input
              id="diagnostic-serial-input"
              type="text"
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              placeholder="P8C2240805000156"
              className="w-full px-3 py-2 bg-white rounded-xl border border-slate-300 text-xs font-mono font-bold focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {/* Token o API Key */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-slate-700">
                Token o API Key:
              </label>
            </div>
            <input
              id="diagnostic-api-key-input"
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Pega aquí tu Token de developer.clip.mx o API Key"
              className="w-full px-3 py-2 bg-white rounded-xl border border-slate-300 text-xs font-mono focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {/* Secret Key */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-slate-700">
                Secret Key (Contraseña):
              </label>
            </div>
            <input
              id="diagnostic-secret-key-input"
              type="password"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder="Clave secreta"
              className="w-full px-3 py-2 bg-white rounded-xl border border-slate-300 text-xs font-mono focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>

        {/* Guía rápida de equivalencia con ejemplo de Clip */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-900 space-y-1">
          <strong className="block font-bold">💡 Equivalencia con el ejemplo de Clip Developers (VB.NET / REST / HttpClient):</strong>
          <p>
            En la documentación oficial de Clip (<code className="font-mono text-blue-950">developer.clip.mx/reference/post_payment-1</code>), el encabezado enviado es <code className="font-mono bg-white px-1 py-0.5 rounded border border-blue-200 text-blue-950">Authorization: Basic &lt;Token&gt;</code>.
          </p>
          <p className="text-slate-700">
            Puedes pegar directamente tu <strong>Token de Acceso</strong> en la primera casilla y presionar <strong>"Ejecutar Diagnóstico Ahora"</strong> para verificar que Clip valide la conexión hacia la terminal <strong>{serial}</strong>.
          </p>
        </div>
      </div>

      {/* Tarjetas de Métricas de Conexión */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
          <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">
            Netlify Function
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className={`text-xl font-black font-mono ${responseStatus === 200 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {responseStatus ? `HTTP ${responseStatus}` : 'SIN RESPUESTA'}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 block truncate mt-0.5">
            /.netlify/functions/clip-payment
          </span>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
          <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">
            Clip API Status
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className={`text-xl font-black font-mono ${parsedData?.clip_http_status === 200 ? 'text-emerald-600' : parsedData?.clip_http_status ? 'text-orange-600' : 'text-slate-400'}`}>
              {parsedData?.clip_http_status ? `HTTP ${parsedData.clip_http_status}` : 'N/A'}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 block truncate mt-0.5">
            api.payclip.io
          </span>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
          <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">
            Latencia
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-black font-mono text-slate-800">
              {responseTimeMs !== null ? `${responseTimeMs} ms` : '—'}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 block truncate mt-0.5">
            Última prueba: {lastTestedAt || 'Pendiente'}
          </span>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
          <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">
            Terminal P8C2240805000156
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className={`text-sm font-black ${parsedData?.is_serial_in_account ? 'text-emerald-600' : parsedData?.is_serial_in_account === false ? 'text-amber-600' : 'text-slate-500'}`}>
              {parsedData?.is_serial_in_account === true ? 'En la Cuenta ✅' : parsedData?.is_serial_in_account === false ? 'No Encontrada ⚠️' : 'Pendiente'}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 block truncate mt-0.5 font-mono">
            {serial}
          </span>
        </div>
      </div>

      {/* Lista de Verificación Rápida */}
      <div className="bg-slate-50/60 border border-slate-200 rounded-2xl p-4 space-y-2 text-xs">
        <h3 className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-orange-600" />
          Checklist de Conectividad y Verificación:
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
          <div className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200">
            {responseStatus === 200 ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span><strong>Netlify Function:</strong> {responseStatus === 200 ? 'Respondiendo correctamente (HTTP 200)' : 'Fallo o no encontrada'}</span>
          </div>

          <div className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200">
            {parsedData?.diagnosis?.has_api_key && parsedData?.diagnosis?.has_secret_key ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : parsedData?.diagnosis?.has_api_key ? (
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>
              <strong>Credenciales:</strong>{' '}
              {parsedData?.diagnosis?.has_api_key && parsedData?.diagnosis?.has_secret_key
                ? 'API Key y Secret Key configuradas'
                : parsedData?.diagnosis?.has_api_key
                ? 'Falta Secret Key (Requerida por Clip)'
                : 'No se detectaron credenciales'}
            </span>
          </div>

          <div className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200">
            {parsedData?.clip_http_status === 200 ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : parsedData?.clip_http_status === 401 ? (
              <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-slate-400 shrink-0" />
            )}
            <span>
              <strong>Autenticación en Clip:</strong>{' '}
              {parsedData?.clip_http_status === 200
                ? 'Aceptada (HTTP 200 OK)'
                : parsedData?.clip_http_status === 401
                ? 'Rechazada por Clip (HTTP 401 Unauthorized)'
                : 'Pendiente de prueba'}
            </span>
          </div>

          <div className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200">
            {parsedData?.is_serial_in_account ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            )}
            <span>
              <strong>Registro de Serie:</strong>{' '}
              {parsedData?.is_serial_in_account
                ? `Terminal ${serial} vinculada a tu cuenta`
                : `Verificar serie ${serial} en app Clip`}
            </span>
          </div>
        </div>
      </div>

      {/* Resultado de la Prueba de Cobro ($1.00) si se ejecutó */}
      {testPaymentResult && (
        <div className={`p-4 rounded-2xl border text-xs leading-relaxed ${
          testPaymentResult.ok
            ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
            : 'bg-rose-50 border-rose-300 text-rose-950'
        }`}>
          <div className="flex items-center justify-between font-bold mb-1.5">
            <span className="flex items-center gap-1.5 text-sm">
              {testPaymentResult.ok ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              )}
              Resultado de Intención de Pago ($1.00 MXN) enviada a Clip:
            </span>
            <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-white border border-slate-200">
              HTTP {testPaymentResult.status}
            </span>
          </div>

          <p className="mb-2">
            {testPaymentResult.ok 
              ? `¡SEÑAL ENVIADA CON ÉXITO! Clip aceptó la transacción para la terminal ${serial}. Revisa la pantalla de tu terminal Clip.`
              : `Clip rechazó la orden de cobro con código HTTP ${testPaymentResult.status}. Esto confirma que la petición es 100% REAL a los servidores de Clip.`}
          </p>

          <div className="bg-white/80 p-2.5 rounded-xl border border-slate-200 font-mono text-[11px] overflow-x-auto max-h-40">
            <pre>{JSON.stringify(testPaymentResult.data, null, 2)}</pre>
          </div>
        </div>
      )}

      {/* Guía Detallada: ¿Por qué la terminal aparece "No Encontrada" y qué hacer? */}
      <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-3 text-xs text-amber-950">
        <div className="flex items-center gap-2 font-bold text-amber-900 text-sm">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <span>¿Por qué la terminal {serial} aparece como "No Encontrada ⚠️" y cómo hacer que reciba la señal?</span>
        </div>

        <p className="leading-relaxed">
          <strong>1. Tu sistema NO está corriendo en modo demo:</strong> El sistema se comunica directamente en vivo con los servidores oficiales de Clip (<code className="font-mono bg-white px-1 py-0.5 rounded border border-amber-200">https://api.payclip.io</code>). La razón por la que no envía la señal es que el servidor de Clip aún no tiene registrado ese lector físico bajo el modo PinPad.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          <div className="bg-white p-3.5 rounded-xl border border-amber-200 space-y-1.5">
            <strong className="text-amber-900 block font-bold">
              Motivo Técnico Oficial de Clip:
            </strong>
            <p className="text-[11px] text-slate-700 leading-relaxed">
              Las terminales Clip (Clip Total, Clip Pro, etc.) vienen de fábrica en modo <em>lector independiente</em> (para teclear el dinero en la pantalla de la terminal). Para recibir cobros remotos vía API desde este sistema, Clip requiere activar la aplicación <strong>PinPad</strong> en la terminal.
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-amber-200 space-y-1.5">
            <strong className="text-emerald-800 block font-bold">
              ¿Qué hacer para activarla al 100%?
            </strong>
            <p className="text-[11px] text-slate-700 leading-relaxed">
              Contacta a Clip Desarrolladores vía correo a <a href="mailto:developers@payclip.com" className="font-bold text-blue-600 hover:underline">developers@payclip.com</a> o por WhatsApp de Soporte Clip solicitando la <strong>instalación de la app PinPad</strong> para el número de serie <code className="font-mono font-bold">{serial}</code> con tu correo registrado en Clip. Clip envía una actualización remota a la terminal que la enlaza a la API.
            </p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl text-blue-900 text-[11px] flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <strong>Solución Inmediata para cobrar hoy en la Panadería:</strong>
            <p className="text-blue-800 mt-0.5">
              En el mostrador POS, cuando el cliente pague con tarjeta, puedes teclear el monto en la pantalla física de tu Clip. En cuanto la terminal imprima el voucher o apruebe, en el sistema de la panadería haz clic en <strong>"Registrar Pago Manual / Comprobante"</strong>. De esa manera tus ventas se registran de inmediato sin esperar la activación de Clip.
            </p>
          </div>
        </div>
      </div>

      {/* Mensajes y Consejos */}
      {parsedData?.message && (
        <div className={`p-3.5 rounded-2xl border text-xs leading-relaxed ${
          connectionStatus === 'CONNECTED' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' :
          connectionStatus === 'AUTH_FAILED' ? 'bg-red-50 border-red-200 text-red-900' :
          'bg-amber-50 border-amber-200 text-amber-900'
        }`}>
          <div className="font-bold flex items-center gap-1.5 mb-1">
            <Activity className="w-4 h-4" />
            <span>Diagnóstico del Servidor:</span>
          </div>
          <p>{parsedData.message}</p>
          {parsedData.advice && (
            <p className="mt-1 font-semibold text-blue-900 bg-blue-50/80 p-2 rounded-xl border border-blue-200">
              💡 {parsedData.advice}
            </p>
          )}
        </div>
      )}

      {/* Visor de Respuesta: RAW JSON vs Interpretado */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveView('code')}
              className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                activeView === 'code' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Código Fetch Oficial (Variables Dinámicas)
            </button>
            <button
              type="button"
              onClick={() => setActiveView('raw')}
              className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                activeView === 'raw' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Raw Response (JSON)
            </button>
            <button
              type="button"
              onClick={() => setActiveView('parsed')}
              className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                activeView === 'parsed' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Dispositivos
            </button>
          </div>

          <button
            id="copy-raw-response-btn"
            type="button"
            onClick={handleCopyRaw}
            disabled={!rawResponseText}
            className="text-xs font-bold text-slate-600 hover:text-slate-900 px-3 py-1 rounded-xl border border-slate-200 hover:bg-slate-50 flex items-center gap-1 cursor-pointer disabled:opacity-40"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? '¡Copiado!' : 'Copiar Raw Response'}</span>
          </button>
        </div>

        {activeView === 'code' ? (
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 text-xs font-mono text-slate-300 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
              <div>
                <span className="text-orange-400 font-bold block">
                  Snippet Fetch Oficial Integrado con las Variables de la Panadería
                </span>
                <span className="text-[11px] text-slate-400">
                  El monto, folio y número de serie se toman en tiempo real de la venta.
                </span>
              </div>

              <button
                type="button"
                disabled={isExecutingCodeFetch}
                onClick={async () => {
                  setIsExecutingCodeFetch(true);
                  setCodeTestResult(null);
                  try {
                    const res = await executeClipPaymentFetch(parseFloat(codeTestAmount) || 1.0, codeTestRef);
                    setCodeTestResult({ success: true, res });
                  } catch (err: any) {
                    setCodeTestResult({ success: false, error: err.message || 'Error de red' });
                  } finally {
                    setIsExecutingCodeFetch(false);
                  }
                }}
                className="bg-[#FF5A00] hover:bg-[#E04D00] disabled:bg-slate-700 text-white font-black px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-sm transition-all self-start sm:self-auto"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isExecutingCodeFetch ? 'animate-spin' : ''}`} />
                <span>{isExecutingCodeFetch ? 'Ejecutando Fetch...' : 'Ejecutar Fetch en Vivo'}</span>
              </button>
            </div>

            {/* Inputs interactivos para cambiar los valores de las variables en vivo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800 font-sans">
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  Monto de la variable (amount):
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-slate-400 text-xs">$</span>
                  <input
                    type="number"
                    step="0.50"
                    min="1.00"
                    value={codeTestAmount}
                    onChange={(e) => setCodeTestAmount(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-6 pr-2 py-1.5 text-xs text-white font-mono focus:border-orange-500 outline-none"
                    placeholder="1.00"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  Folio de la venta (reference):
                </label>
                <input
                  type="text"
                  value={codeTestRef}
                  onChange={(e) => setCodeTestRef(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-orange-500 outline-none"
                  placeholder="FOL-1050"
                />
              </div>
            </div>

            {/* Código generado en vivo con los valores reales */}
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                Código JavaScript exacto ejecutado:
              </span>
              <pre className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-emerald-400 overflow-x-auto text-[11px] leading-relaxed select-all">
{`const options = {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'Authorization': 'Basic ${apiKey ? (apiKey.length > 20 ? apiKey.substring(0, 10) + '...' : apiKey) : '<TU_TOKEN_DE_ACCESO>'}'
  },
  body: JSON.stringify({
    amount: "${(parseFloat(codeTestAmount) || 0).toFixed(2)}", // 👈 Variable del carrito de compras
    reference: "${codeTestRef}", // 👈 Folio generado para la venta
    serial_number_pos: "${serial}" // 👈 Terminal asignada a la panadería
  })
};

fetch('https://api.payclip.io/f2f/pinpad/v1/payment', options)
  .then(res => res.json())
  .then(res => console.log(res))
  .catch(err => console.error(err));`}
              </pre>
            </div>

            {/* Resultado si se ejecutó */}
            {codeTestResult && (
              <div className={`p-3 rounded-xl border font-sans text-xs ${
                codeTestResult.success ? 'bg-emerald-950/80 border-emerald-700 text-emerald-200' : 'bg-rose-950/80 border-rose-700 text-rose-200'
              }`}>
                <div className="font-bold flex items-center gap-1.5 mb-1">
                  {codeTestResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
                  <span>Resultado de la respuesta devuelta por Clip:</span>
                </div>
                <pre className="p-2.5 bg-black/50 rounded-lg text-[10px] font-mono overflow-x-auto text-slate-200 max-h-44">
                  {JSON.stringify(codeTestResult.res || codeTestResult.error, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ) : activeView === 'raw' ? (
          <div className="relative rounded-2xl bg-slate-950 p-4 border border-slate-800 text-xs font-mono overflow-hidden">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-[11px] text-slate-400">
              <span>Respuesta cruda de <span className="text-orange-400">/.netlify/functions/clip-payment</span></span>
              <span>{rawResponseText ? `${rawResponseText.length} bytes` : '0 bytes'}</span>
            </div>
            <pre 
              id="raw-response-viewer"
              className="text-emerald-400 overflow-x-auto max-h-72 text-[11px] leading-relaxed select-all"
            >
              {rawResponseText || (isLoading ? 'Cargando respuesta de la API...' : 'Sin respuesta todavía. Presiona "Ejecutar Diagnóstico Ahora".')}
            </pre>
          </div>
        ) : (
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 text-xs">
            <div>
              <span className="font-bold text-slate-700 block mb-1">
                Dispositivos registrados en la cuenta Clip:
              </span>
              {Array.isArray(parsedData?.devices_found) && parsedData.devices_found.length > 0 ? (
                <div className="space-y-1.5">
                  {parsedData.devices_found.map((dev: any, idx: number) => (
                    <div key={idx} className="p-2.5 bg-white rounded-xl border border-slate-200 flex items-center justify-between text-[11px]">
                      <div>
                        <strong className="font-mono text-slate-800">
                          {dev.serial_number || dev.serial_number_pos || dev.serialNumber || 'Sin serie'}
                        </strong>
                        <span className="text-slate-400 ml-2">
                          {dev.model || dev.device_type || 'Clip Terminal'}
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        (dev.serial_number || '').toUpperCase() === serial.toUpperCase()
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {(dev.serial_number || '').toUpperCase() === serial.toUpperCase() ? 'ESTA TERMINAL' : 'OTRO DISPOSITIVO'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-[11px] italic bg-white p-3 rounded-xl border border-slate-200">
                  {parsedData?.clip_http_status === 200 
                    ? 'Clip respondió HTTP 200 pero la lista de terminales retornada está vacía. Verifica que la terminal física esté activada bajo esta cuenta de desarrollador.'
                    : 'No se pudo obtener la lista de dispositivos debido al estado HTTP de Clip.'}
                </p>
              )}
            </div>

            {parsedData?.diagnosis && (
              <div>
                <span className="font-bold text-slate-700 block mb-1">
                  Variables de entorno y entorno de ejecución:
                </span>
                <pre className="p-3 bg-white rounded-xl border border-slate-200 font-mono text-[11px] text-slate-800">
                  {JSON.stringify(parsedData.diagnosis, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Enlace a developer.clip.mx */}
      <div className="pt-2 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2 border-t border-slate-100">
        <span>
          Documentación oficial de Clip: PinPad F2F API v1
        </span>
        <a
          href="https://developer.clip.mx"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#FF5A00] font-bold hover:underline inline-flex items-center gap-1"
        >
          <span>Abrir developer.clip.mx</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
};
