import React, { useState } from 'react';
import { 
  REAL_BAKERY_CATALOG, 
  MAIN_CATALOG_GROUPS, 
  OFFICIAL_CLIENT_PROFILES, 
  CatalogBreadItem, 
  ClientProfile,
  ClientPriceMap
} from '../../data/bakeryCatalog';
import { 
  Search, 
  RotateCcw, 
  Save, 
  Check, 
  Filter, 
  Store, 
  Truck, 
  ShoppingBag, 
  DollarSign, 
  Sparkles, 
  Edit3, 
  ArrowRight,
  Info,
  CheckCircle2
} from 'lucide-react';
import { playBeep, playCashSound } from '../../utils/audio';
import { loadMasterCatalog, saveMasterCatalog } from '../../utils/storage';

interface ClientPricingMatrixProps {
  onNotifySave?: () => void;
}

export const ClientPricingMatrix: React.FC<ClientPricingMatrixProps> = ({ onNotifySave }) => {
  const [catalog, setCatalog] = useState<CatalogBreadItem[]>(() => loadMasterCatalog());
  const [selectedChannel, setSelectedChannel] = useState<'todos' | 'mostrador' | 'reparto' | 'recoger_tienda'>('todos');
  const [selectedClientProfile, setSelectedClientProfile] = useState<string>('todos');
  const [selectedGroup, setSelectedGroup] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [editingItemNum, setEditingItemNum] = useState<number | null>(null);
  const [isSaved, setIsSaved] = useState<boolean>(false);

  // Filter products
  const filteredProducts = catalog.filter((item) => {
    // Channel filter
    if (selectedChannel === 'mostrador') {
      // Mostrador items
    } else if (selectedChannel === 'reparto') {
      // Reparto items
    } else if (selectedChannel === 'recoger_tienda') {
      // Pide y recoge items
    }

    // Group filter
    if (selectedGroup !== 'todos' && item.mainGroup !== selectedGroup) {
      return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchNum = item.num.toString() === q;
      const matchName = item.name.toLowerCase().includes(q);
      const matchCat = item.category.toLowerCase().includes(q);
      return matchNum || matchName || matchCat;
    }

    return true;
  });

  const handleUpdatePrice = (
    itemNum: number, 
    priceKey: keyof ClientPriceMap, 
    newPriceValue: number
  ) => {
    setCatalog(prev => prev.map(item => {
      if (item.num === itemNum) {
        const updatedPrices = {
          ...item.prices,
          [priceKey]: newPriceValue
        };
        return {
          ...item,
          prices: updatedPrices,
          defaultPrice: priceKey === 'mostrador' ? newPriceValue : item.defaultPrice
        };
      }
      return item;
    }));
  };

  const handleSaveCatalog = () => {
    playCashSound();
    saveMasterCatalog(catalog);
    setIsSaved(true);
    if (onNotifySave) onNotifySave();
    setTimeout(() => {
      setIsSaved(false);
    }, 3000);
  };

  const handleResetToDefault = () => {
    if (window.confirm('¿Deseas restaurar la lista oficial completa de 116 productos con sus precios originales pactados?')) {
      playBeep(450, 'sine', 0.08);
      setCatalog(REAL_BAKERY_CATALOG);
      saveMasterCatalog(REAL_BAKERY_CATALOG);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2500);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-amber-800 via-orange-900 to-slate-900 text-white rounded-3xl p-6 shadow-md border border-amber-500/20">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 bg-amber-400 text-slate-950 font-black text-xs rounded-full uppercase tracking-wider">
                Lista Oficial 2026
              </span>
              <span className="text-xs text-amber-200 font-bold">
                116 Panes Clasificados
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-black font-serif tracking-tight">
              Catálogo Maestro & Precios por Cliente
            </h2>
            <p className="text-xs text-amber-100/80 max-w-2xl leading-relaxed">
              Administra las tarifas oficiales clasificadas por canal: <strong>Mostrador</strong>, <strong>Rutas de Reparto</strong> (Simón y Osvaldo, Star Médica, Como la Flor, El Pozo, Misc. Paola, Calero, Tortas Pradera, Carro Rojo) y <strong>Pide y Recoge</strong> (Trascos, Magda, Bollos David, Deliz).
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={handleResetToDefault}
              className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-200 font-bold rounded-2xl text-xs border border-amber-400/30 flex items-center gap-1.5 transition-all active:scale-95"
              title="Restaurar lista original del catálogo"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restaurar Oficial</span>
            </button>

            <button
              onClick={handleSaveCatalog}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl text-xs shadow-lg flex items-center gap-2 transition-all active:scale-95"
            >
              {isSaved ? <Check className="w-4 h-4 text-white" /> : <Save className="w-4 h-4 text-white" />}
              <span>{isSaved ? '¡Precios Guardados!' : 'Guardar Todo el Catálogo'}</span>
            </button>
          </div>
        </div>

        {/* 3 Channel Switch Pills */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mt-5 pt-4 border-t border-white/10">
          <button
            onClick={() => { setSelectedChannel('todos'); setSelectedClientProfile('todos'); }}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
              selectedChannel === 'todos'
                ? 'bg-white text-slate-900 shadow-md scale-102'
                : 'bg-black/20 text-white/80 hover:bg-white/10'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Todos los Canales ({catalog.length})</span>
          </button>

          <button
            onClick={() => { setSelectedChannel('mostrador'); setSelectedClientProfile('mostrador'); }}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
              selectedChannel === 'mostrador'
                ? 'bg-amber-500 text-slate-950 shadow-md scale-102'
                : 'bg-black/20 text-white/80 hover:bg-white/10'
            }`}
          >
            <Store className="w-4 h-4 text-amber-200" />
            <span>1. Mostrador (Venta en Tienda)</span>
          </button>

          <button
            onClick={() => { setSelectedChannel('reparto'); setSelectedClientProfile('starMedica'); }}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
              selectedChannel === 'reparto'
                ? 'bg-sky-500 text-white shadow-md scale-102'
                : 'bg-black/20 text-white/80 hover:bg-white/10'
            }`}
          >
            <Truck className="w-4 h-4 text-sky-200" />
            <span>2. Reparto (Rutas y Clientes)</span>
          </button>

          <button
            onClick={() => { setSelectedChannel('recoger_tienda'); setSelectedClientProfile('mostrador'); }}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
              selectedChannel === 'recoger_tienda'
                ? 'bg-purple-500 text-white shadow-md scale-102'
                : 'bg-black/20 text-white/80 hover:bg-white/10'
            }`}
          >
            <ShoppingBag className="w-4 h-4 text-purple-200" />
            <span>3. Pide y Recoge (Mostrador)</span>
          </button>
        </div>
      </div>

      {/* Group & Client Filters bar */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-amber-200 space-y-4">
        {/* Row 1: Search & Specific Client Profile Selector */}
        <div className="flex flex-col md:flex-row gap-3">
          {/* Live Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por # o nombre de pan (ej. 1, 16, Bolillo, Concha, Strudell, Bisquet)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* Client Profile Highlight Selector */}
          <div className="w-full md:w-80">
            <select
              value={selectedClientProfile}
              onChange={(e) => setSelectedClientProfile(e.target.value)}
              className="w-full px-3 py-2.5 bg-amber-50/70 border-2 border-amber-300 rounded-2xl text-xs font-extrabold text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="todos">👁️ Mostrar Todas las Columnas de Precios</option>
              <optgroup label="Mostrador">
                <option value="mostrador">🏬 Mostrador General (Tarifa Pública)</option>
              </optgroup>
              <optgroup label="Reparto Institucional">
                <option value="starMedica">🏥 Star Médica (IEPS 8%)</option>
                <option value="comoLaFlor">🌸 Como la Flor (IEPS 8%)</option>
              </optgroup>
              <optgroup label="Reparto Simón">
                <option value="elPozoSanFco">📍 El Pozo San Fco (Bolillo $4 / Concha $10)</option>
                <option value="elPozoMiriam">📍 El Pozo Miriam (Bolillo $4 / Dulce $8.50)</option>
              </optgroup>
              <optgroup label="Reparto Osvaldo & Tradicional">
                <option value="miscPaola">🛒 Misc. Paola (Bolillo $4 / Dulce $8.50)</option>
                <option value="calero">🥖 Calero (Bolillo $4 / Dulce $8.50)</option>
                <option value="tortasPradera">🥪 Tortas Pradera (Teleras $7.00)</option>
                <option value="carroRojo">🚗 Carro Rojo (Teleras $7.50)</option>
              </optgroup>
              <optgroup label="Pide y Recoge en Tienda">
                <option value="trascos">🏬 Trascos (Pide y Recoge)</option>
                <option value="magda">🏬 Magda (Pide y Recoge)</option>
                <option value="bollosDavid">🏬 Bollos David (Pide y Recoge)</option>
                <option value="deliz">🏬 Deliz (Pide y Recoge)</option>
              </optgroup>
            </select>
          </div>
        </div>

        {/* 3 Main Categories Filter */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
          <button
            onClick={() => setSelectedGroup('todos')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
              selectedGroup === 'todos'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Todos ({catalog.length})
          </button>

          {MAIN_CATALOG_GROUPS.map((g) => {
            const count = catalog.filter(c => c.mainGroup === g.id).length;
            const isSel = selectedGroup === g.id;
            return (
              <button
                key={g.id}
                onClick={() => setSelectedGroup(g.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all ${
                  isSel
                    ? `${g.activeColor} shadow-xs scale-102`
                    : `${g.bgLight} text-slate-800 border ${g.borderColor} hover:bg-amber-100`
                }`}
              >
                <span>{g.emoji}</span>
                <span>{g.shortName}</span>
                <span className="text-[10px] opacity-75 font-semibold">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Catalog Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-amber-200 overflow-hidden">
        {/* Table Summary Bar */}
        <div className="p-4 bg-amber-50/80 border-b border-amber-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-800">
              Catálogo de Precios Pactados ({filteredProducts.length} panes listados)
            </span>
            {selectedGroup !== 'todos' && (
              <span className="bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full text-[10px] font-extrabold">
                {MAIN_CATALOG_GROUPS.find(g => g.id === selectedGroup)?.shortName}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Info className="w-3.5 h-3.5 text-amber-600" />
            <span>Haz clic en cualquier celda para editar el precio pactado</span>
          </div>
        </div>

        {/* Scrollable Matrix Table */}
        <div className="overflow-x-auto max-h-[600px] divide-y divide-slate-100">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-900 text-white font-extrabold sticky top-0 z-10 text-[11px] uppercase tracking-wider shadow-sm">
              <tr>
                <th className="py-3 px-3 w-12 text-center">#</th>
                <th className="py-3 px-3 min-w-[200px]">Nombre del Pan</th>
                <th className="py-3 px-3 min-w-[130px]">Categoría</th>
                
                {/* Mostrador */}
                <th className="py-3 px-3 text-center bg-amber-600 text-white min-w-[90px]">
                  Mostrador
                </th>

                {/* Star Médica */}
                {(selectedClientProfile === 'todos' || selectedClientProfile === 'starMedica') && (
                  <th className="py-3 px-3 text-center bg-sky-700 text-white min-w-[90px]">
                    Star Médica
                  </th>
                )}

                {/* Como la Flor */}
                {(selectedClientProfile === 'todos' || selectedClientProfile === 'comoLaFlor') && (
                  <th className="py-3 px-3 text-center bg-emerald-700 text-white min-w-[90px]">
                    Como la Flor
                  </th>
                )}

                {/* El Pozo San Fco */}
                {(selectedClientProfile === 'todos' || selectedClientProfile === 'elPozoSanFco') && (
                  <th className="py-3 px-3 text-center bg-indigo-700 text-white min-w-[90px]">
                    Pozo San Fco
                  </th>
                )}

                {/* El Pozo Miriam */}
                {(selectedClientProfile === 'todos' || selectedClientProfile === 'elPozoMiriam') && (
                  <th className="py-3 px-3 text-center bg-violet-700 text-white min-w-[90px]">
                    Pozo Miriam
                  </th>
                )}

                {/* Misc. Paola */}
                {(selectedClientProfile === 'todos' || selectedClientProfile === 'miscPaola') && (
                  <th className="py-3 px-3 text-center bg-blue-700 text-white min-w-[90px]">
                    Misc. Paola
                  </th>
                )}

                {/* Calero */}
                {(selectedClientProfile === 'todos' || selectedClientProfile === 'calero') && (
                  <th className="py-3 px-3 text-center bg-amber-700 text-white min-w-[90px]">
                    Calero
                  </th>
                )}

                {/* Tortas Pradera */}
                {(selectedClientProfile === 'todos' || selectedClientProfile === 'tortasPradera') && (
                  <th className="py-3 px-3 text-center bg-orange-700 text-white min-w-[90px]">
                    T. Pradera
                  </th>
                )}

                {/* Carro Rojo */}
                {(selectedClientProfile === 'todos' || selectedClientProfile === 'carroRojo') && (
                  <th className="py-3 px-3 text-center bg-rose-700 text-white min-w-[90px]">
                    Carro Rojo
                  </th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-400 font-semibold">
                    No se encontraron productos con el filtro seleccionado.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((prod) => {
                  const isEditing = editingItemNum === prod.num;

                  return (
                    <tr 
                      key={prod.num} 
                      className="hover:bg-amber-50/40 transition-colors group"
                    >
                      {/* Num */}
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-400 group-hover:text-amber-700">
                        {prod.num}
                      </td>

                      {/* Name */}
                      <td className="py-2.5 px-3 font-extrabold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span>{prod.name}</span>
                          {prod.allowMini && (
                            <span className="bg-amber-100 text-amber-800 text-[9px] px-1.5 py-0.2 rounded font-black">
                              Mini
                            </span>
                          )}
                          {prod.defaultUnit && prod.defaultUnit !== 'PZ' && (
                            <span className="bg-indigo-100 text-indigo-800 text-[9px] px-1.5 py-0.2 rounded font-black">
                              {prod.defaultUnit}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-2.5 px-3 text-[11px] font-semibold text-slate-500">
                        {prod.category}
                      </td>

                      {/* Mostrador Price Input */}
                      <td className="py-2 px-2 text-center bg-amber-50/50">
                        <div className="flex items-center justify-center gap-0.5">
                          <span className="text-[10px] text-slate-400">$</span>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={prod.prices.mostrador ?? prod.defaultPrice ?? 0}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              if (!isNaN(v)) handleUpdatePrice(prod.num, 'mostrador', v);
                            }}
                            className="w-16 text-center font-mono font-black text-xs py-1 px-1 bg-white border border-amber-300 rounded-lg text-slate-900 focus:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                      </td>

                      {/* Star Médica */}
                      {(selectedClientProfile === 'todos' || selectedClientProfile === 'starMedica') && (
                        <td className="py-2 px-2 text-center">
                          <div className="flex items-center justify-center gap-0.5">
                            <span className="text-[10px] text-slate-400">$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="-"
                              value={prod.prices.starMedica ?? ''}
                              onChange={(e) => {
                                const v = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                if (!isNaN(v)) handleUpdatePrice(prod.num, 'starMedica', v);
                              }}
                              className={`w-16 text-center font-mono text-xs py-1 px-1 rounded-lg border focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                                prod.prices.starMedica 
                                  ? 'bg-sky-50/80 font-black text-sky-950 border-sky-300' 
                                  : 'bg-slate-50/50 font-semibold text-slate-400 border-slate-200'
                              }`}
                            />
                          </div>
                        </td>
                      )}

                      {/* Como la Flor */}
                      {(selectedClientProfile === 'todos' || selectedClientProfile === 'comoLaFlor') && (
                        <td className="py-2 px-2 text-center">
                          <div className="flex items-center justify-center gap-0.5">
                            <span className="text-[10px] text-slate-400">$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="-"
                              value={prod.prices.comoLaFlor ?? ''}
                              onChange={(e) => {
                                const v = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                if (!isNaN(v)) handleUpdatePrice(prod.num, 'comoLaFlor', v);
                              }}
                              className={`w-16 text-center font-mono text-xs py-1 px-1 rounded-lg border focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                                prod.prices.comoLaFlor 
                                  ? 'bg-emerald-50/80 font-black text-emerald-950 border-emerald-300' 
                                  : 'bg-slate-50/50 font-semibold text-slate-400 border-slate-200'
                              }`}
                            />
                          </div>
                        </td>
                      )}

                      {/* El Pozo San Fco */}
                      {(selectedClientProfile === 'todos' || selectedClientProfile === 'elPozoSanFco') && (
                        <td className="py-2 px-2 text-center">
                          <div className="flex items-center justify-center gap-0.5">
                            <span className="text-[10px] text-slate-400">$</span>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              placeholder="-"
                              value={prod.prices.elPozoSanFco ?? ''}
                              onChange={(e) => {
                                const v = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                if (!isNaN(v)) handleUpdatePrice(prod.num, 'elPozoSanFco', v);
                              }}
                              className={`w-16 text-center font-mono text-xs py-1 px-1 rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                                prod.prices.elPozoSanFco 
                                  ? 'bg-indigo-50/80 font-black text-indigo-950 border-indigo-300' 
                                  : 'bg-slate-50/50 font-semibold text-slate-400 border-slate-200'
                              }`}
                            />
                          </div>
                        </td>
                      )}

                      {/* El Pozo Miriam */}
                      {(selectedClientProfile === 'todos' || selectedClientProfile === 'elPozoMiriam') && (
                        <td className="py-2 px-2 text-center">
                          <div className="flex items-center justify-center gap-0.5">
                            <span className="text-[10px] text-slate-400">$</span>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              placeholder="-"
                              value={prod.prices.elPozoMiriam ?? ''}
                              onChange={(e) => {
                                const v = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                if (!isNaN(v)) handleUpdatePrice(prod.num, 'elPozoMiriam', v);
                              }}
                              className={`w-16 text-center font-mono text-xs py-1 px-1 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500 ${
                                prod.prices.elPozoMiriam 
                                  ? 'bg-violet-50/80 font-black text-violet-950 border-violet-300' 
                                  : 'bg-slate-50/50 font-semibold text-slate-400 border-slate-200'
                              }`}
                            />
                          </div>
                        </td>
                      )}

                      {/* Misc. Paola */}
                      {(selectedClientProfile === 'todos' || selectedClientProfile === 'miscPaola') && (
                        <td className="py-2 px-2 text-center">
                          <div className="flex items-center justify-center gap-0.5">
                            <span className="text-[10px] text-slate-400">$</span>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              placeholder="-"
                              value={prod.prices.miscPaola ?? ''}
                              onChange={(e) => {
                                const v = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                if (!isNaN(v)) handleUpdatePrice(prod.num, 'miscPaola', v);
                              }}
                              className={`w-16 text-center font-mono text-xs py-1 px-1 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                prod.prices.miscPaola 
                                  ? 'bg-blue-50/80 font-black text-blue-950 border-blue-300' 
                                  : 'bg-slate-50/50 font-semibold text-slate-400 border-slate-200'
                              }`}
                            />
                          </div>
                        </td>
                      )}

                      {/* Calero */}
                      {(selectedClientProfile === 'todos' || selectedClientProfile === 'calero') && (
                        <td className="py-2 px-2 text-center">
                          <div className="flex items-center justify-center gap-0.5">
                            <span className="text-[10px] text-slate-400">$</span>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              placeholder="-"
                              value={prod.prices.calero ?? ''}
                              onChange={(e) => {
                                const v = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                if (!isNaN(v)) handleUpdatePrice(prod.num, 'calero', v);
                              }}
                              className={`w-16 text-center font-mono text-xs py-1 px-1 rounded-lg border focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                                prod.prices.calero 
                                  ? 'bg-amber-50/80 font-black text-amber-950 border-amber-300' 
                                  : 'bg-slate-50/50 font-semibold text-slate-400 border-slate-200'
                              }`}
                            />
                          </div>
                        </td>
                      )}

                      {/* Tortas Pradera */}
                      {(selectedClientProfile === 'todos' || selectedClientProfile === 'tortasPradera') && (
                        <td className="py-2 px-2 text-center">
                          <div className="flex items-center justify-center gap-0.5">
                            <span className="text-[10px] text-slate-400">$</span>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              placeholder="-"
                              value={prod.prices.tortasPradera ?? ''}
                              onChange={(e) => {
                                const v = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                if (!isNaN(v)) handleUpdatePrice(prod.num, 'tortasPradera', v);
                              }}
                              className={`w-16 text-center font-mono text-xs py-1 px-1 rounded-lg border focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                                prod.prices.tortasPradera 
                                  ? 'bg-orange-50/80 font-black text-orange-950 border-orange-300' 
                                  : 'bg-slate-50/50 font-semibold text-slate-400 border-slate-200'
                              }`}
                            />
                          </div>
                        </td>
                      )}

                      {/* Carro Rojo */}
                      {(selectedClientProfile === 'todos' || selectedClientProfile === 'carroRojo') && (
                        <td className="py-2 px-2 text-center">
                          <div className="flex items-center justify-center gap-0.5">
                            <span className="text-[10px] text-slate-400">$</span>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              placeholder="-"
                              value={prod.prices.carroRojo ?? ''}
                              onChange={(e) => {
                                const v = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                if (!isNaN(v)) handleUpdatePrice(prod.num, 'carroRojo', v);
                              }}
                              className={`w-16 text-center font-mono text-xs py-1 px-1 rounded-lg border focus:outline-none focus:ring-2 focus:ring-rose-500 ${
                                prod.prices.carroRojo 
                                  ? 'bg-rose-50/80 font-black text-rose-950 border-rose-300' 
                                  : 'bg-slate-50/50 font-semibold text-slate-400 border-slate-200'
                              }`}
                            />
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-4">
            <span className="font-extrabold text-slate-800">
              Mostrando {filteredProducts.length} de {catalog.length} productos
            </span>
            <span className="text-slate-400">|</span>
            <span className="text-emerald-700 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Cambios vinculados en tiempo real con Encargos y Mostrador
            </span>
          </div>

          <button
            onClick={handleSaveCatalog}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl shadow-xs transition-all active:scale-95 flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            <span>Guardar Precios</span>
          </button>
        </div>
      </div>
    </div>
  );
};
