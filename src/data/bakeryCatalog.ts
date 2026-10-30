export interface ClientPriceMap {
  mostrador: number;
  starMedica?: number;
  comoLaFlor?: number;
  elPozoSanFco?: number;
  elPozoMiriam?: number;
  miscPaola?: number;
  calero?: number;
  tortasPradera?: number;
  carroRojo?: number;
  [key: string]: number | undefined;
}

export interface CatalogBreadItem {
  num: number;
  id: string;
  name: string;
  category: string;
  subCategory?: string;
  mainGroup: 'salado' | 'dulce_danes' | 'feite_batidos_especiales';
  defaultPrice: number;
  prices: ClientPriceMap;
  allowMini?: boolean;
  defaultUnit?: 'PZ' | 'CH' | 'KG';
  description?: string;
  channelAvailability?: {
    mostrador: boolean;
    reparto: boolean;
    recoger_tienda: boolean;
  };
}

export interface ClientProfile {
  id: string;
  name: string;
  shortName: string;
  channel: 'mostrador' | 'reparto' | 'recoger_tienda';
  driverId?: 'osvaldo' | 'simon' | 'tienda';
  priceKey: keyof ClientPriceMap | 'reparto_tradicional' | 'mostrador';
  badgeColor: string;
  description: string;
}

export const OFFICIAL_CLIENT_PROFILES: ClientProfile[] = [
  {
    id: 'mostrador_gral',
    name: 'Mostrador General (Venta en Tienda)',
    shortName: 'Mostrador',
    channel: 'mostrador',
    priceKey: 'mostrador',
    badgeColor: 'bg-slate-800 text-white',
    description: 'Tarifa oficial al público general en mostrador'
  },
  {
    id: 'star_medica',
    name: 'Star Médica',
    shortName: 'Star Médica',
    channel: 'reparto',
    driverId: 'osvaldo',
    priceKey: 'starMedica',
    badgeColor: 'bg-sky-600 text-white',
    description: 'Cliente Institucional (Incluye 8% IEPS oficial)'
  },
  {
    id: 'como_la_flor',
    name: 'Como la Flor',
    shortName: 'Como la Flor',
    channel: 'reparto',
    priceKey: 'comoLaFlor',
    badgeColor: 'bg-emerald-600 text-white',
    description: 'Cliente Institucional (Incluye 8% IEPS oficial)'
  },
  {
    id: 'el_pozo_san_fco',
    name: 'El Pozo San Fco',
    shortName: 'El Pozo San Fco',
    channel: 'reparto',
    driverId: 'simon',
    priceKey: 'elPozoSanFco',
    badgeColor: 'bg-indigo-600 text-white',
    description: 'Ruta de Reparto Simón (Bolillo $4, Pan Dulce $8.50-$10)'
  },
  {
    id: 'el_pozo_miriam',
    name: 'El Pozo Miriam',
    shortName: 'El Pozo Miriam',
    channel: 'reparto',
    driverId: 'simon',
    priceKey: 'elPozoMiriam',
    badgeColor: 'bg-violet-600 text-white',
    description: 'Ruta de Reparto Simón (Bolillo $4, Pan Dulce $8.50)'
  },
  {
    id: 'misc_paola',
    name: 'Misc. Paola',
    shortName: 'Misc. Paola',
    channel: 'reparto',
    driverId: 'osvaldo',
    priceKey: 'miscPaola',
    badgeColor: 'bg-blue-600 text-white',
    description: 'Ruta de Reparto Osvaldo (Bolillo $4, Pan Dulce $8.50)'
  },
  {
    id: 'calero',
    name: 'Calero',
    shortName: 'Calero',
    channel: 'reparto',
    priceKey: 'calero',
    badgeColor: 'bg-amber-600 text-white',
    description: 'Ruta de Reparto Tradicional (Bolillo $4, Pan Dulce $8.50)'
  },
  {
    id: 'tortas_pradera',
    name: 'Tortas Pradera',
    shortName: 'Tortas Pradera',
    channel: 'reparto',
    priceKey: 'tortasPradera',
    badgeColor: 'bg-orange-600 text-white',
    description: 'Ruta Especial Teleras & Strudell ($7.00)'
  },
  {
    id: 'carro_rojo',
    name: 'Carro Rojo',
    shortName: 'Carro Rojo',
    channel: 'reparto',
    priceKey: 'carroRojo',
    badgeColor: 'bg-rose-600 text-white',
    description: 'Ruta Especial Teleras & Bigotes ($7.50)'
  },
  // Pide y Recoge
  {
    id: 'trascos',
    name: 'Trascos',
    shortName: 'Trascos',
    channel: 'recoger_tienda',
    driverId: 'tienda',
    priceKey: 'mostrador',
    badgeColor: 'bg-purple-600 text-white',
    description: 'Taquería Trascos - Pide y Recoge en mostrador'
  },
  {
    id: 'magda',
    name: 'Magda',
    shortName: 'Magda',
    channel: 'recoger_tienda',
    driverId: 'tienda',
    priceKey: 'mostrador',
    badgeColor: 'bg-pink-600 text-white',
    description: 'Doña Magda - Pide y Recoge pan dulce'
  },
  {
    id: 'bollos_david',
    name: 'Bollos David',
    shortName: 'Bollos David',
    channel: 'recoger_tienda',
    driverId: 'tienda',
    priceKey: 'mostrador',
    badgeColor: 'bg-teal-600 text-white',
    description: 'Bollos Hamburguesa & Artesanal - Pide y Recoge'
  },
  {
    id: 'deliz',
    name: 'Deliz',
    shortName: 'Deliz',
    channel: 'recoger_tienda',
    driverId: 'tienda',
    priceKey: 'mostrador',
    badgeColor: 'bg-fuchsia-600 text-white',
    description: 'Café & Deliz - Pide y Recoge'
  }
];

// Catálogo Oficial Maestro con los 116 Productos y Precios por Cliente (Lista Maestra 2026)
export const REAL_BAKERY_CATALOG: CatalogBreadItem[] = [
  // ==========================================
  // PÁGINA 1: SALADO (1 - 14)
  // ==========================================
  {
    num: 1,
    id: 'sal_bolillo',
    name: 'Pan Blanco / Bolillo / Bolillote',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 5.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 5.00,
      starMedica: 5.00,
      comoLaFlor: 5.00,
      elPozoSanFco: 4.00,
      elPozoMiriam: 4.00,
      miscPaola: 4.00,
      calero: 4.00
    }
  },
  {
    num: 2,
    id: 'sal_telera',
    name: 'Telera',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 6.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 6.00,
      starMedica: 5.50,
      comoLaFlor: 5.50,
      tortasPradera: 7.00,
      carroRojo: 7.50
    }
  },
  {
    num: 3,
    id: 'sal_telera_zajada',
    name: 'Telera Zajada / Telerota Normal',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 6.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 6.00,
      tortasPradera: 7.00,
      carroRojo: 7.50
    }
  },
  {
    num: 4,
    id: 'sal_pambazos',
    name: 'Pambazos',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 6.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 6.00,
      starMedica: 5.00,
      comoLaFlor: 5.00
    }
  },
  {
    num: 5,
    id: 'sal_birote_1',
    name: 'Birote Tapatío 1',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 6.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: { mostrador: 6.00 }
  },
  {
    num: 6,
    id: 'sal_birote_15',
    name: 'Birote Tapatío 1.5',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 6.00,
    allowMini: false,
    defaultUnit: 'PZ',
    prices: { mostrador: 6.00 }
  },
  {
    num: 7,
    id: 'sal_baguettin',
    name: 'Baguettin',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 6.50,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 6.50,
      starMedica: 10.00,
      comoLaFlor: 6.50
    }
  },
  {
    num: 8,
    id: 'sal_chapata',
    name: 'Chapata',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 12.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 12.00,
      starMedica: 13.00,
      comoLaFlor: 13.00
    }
  },
  {
    num: 9,
    id: 'sal_chapata_semilla',
    name: 'Chapata con Semilla',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 12.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 12.00,
      comoLaFlor: 15.00
    }
  },
  {
    num: 10,
    id: 'sal_paninis',
    name: 'Paninis',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 12.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: { mostrador: 12.00 }
  },
  {
    num: 11,
    id: 'sal_fendu',
    name: 'Fendú',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 20.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: { mostrador: 20.00 }
  },
  {
    num: 12,
    id: 'sal_baguette_25',
    name: 'Baguette 25 cm (Hierbas, Ajo, Parmesano, Ajo c/ Chile, Ajonjolí)',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 20.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 20.00,
      starMedica: 18.00,
      comoLaFlor: 18.00
    }
  },
  {
    num: 13,
    id: 'sal_fendu_esp',
    name: 'Fendú Especial',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 35.00,
    allowMini: false,
    defaultUnit: 'PZ',
    prices: { mostrador: 35.00 }
  },
  {
    num: 14,
    id: 'sal_baguette_50',
    name: 'Baguette 50 cm',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 35.00,
    allowMini: false,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 35.00,
      comoLaFlor: 40.00
    }
  },

  // ==========================================
  // PÁGINA 1: BIZCOCHO / DULCE (15 - 25)
  // ==========================================
  {
    num: 15,
    id: 'biz_dona_mini',
    name: 'Dona Mini',
    category: 'Pan Dulce Tradicional',
    mainGroup: 'dulce_danes',
    defaultPrice: 8.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 8.00,
      elPozoSanFco: 8.50,
      elPozoMiriam: 8.50,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 16,
    id: 'biz_concha_vainilla',
    name: 'Concha Vainilla',
    category: 'Pan Dulce Tradicional',
    mainGroup: 'dulce_danes',
    defaultPrice: 12.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 12.00,
      starMedica: 10.80,
      comoLaFlor: 10.80,
      elPozoSanFco: 10.00,
      elPozoMiriam: 8.50,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 17,
    id: 'biz_concha_choco',
    name: 'Concha Choco',
    category: 'Pan Dulce Tradicional',
    mainGroup: 'dulce_danes',
    defaultPrice: 12.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 12.00,
      starMedica: 10.80,
      comoLaFlor: 10.80,
      elPozoSanFco: 10.00,
      elPozoMiriam: 8.50,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 18,
    id: 'biz_concha_nuez',
    name: 'Concha Nuez',
    category: 'Pan Dulce Tradicional',
    mainGroup: 'dulce_danes',
    defaultPrice: 12.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 12.00,
      starMedica: 10.80,
      comoLaFlor: 10.80,
      elPozoSanFco: 10.00,
      elPozoMiriam: 8.50,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 19,
    id: 'biz_novia',
    name: 'Novia',
    category: 'Pan Dulce Tradicional',
    mainGroup: 'dulce_danes',
    defaultPrice: 12.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 12.00,
      starMedica: 10.80,
      comoLaFlor: 10.80,
      elPozoSanFco: 8.50,
      elPozoMiriam: 8.50,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 20,
    id: 'biz_manteconcha',
    name: 'Manteconcha',
    category: 'Pan Dulce Tradicional',
    mainGroup: 'dulce_danes',
    defaultPrice: 12.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 12.00,
      elPozoSanFco: 10.00,
      elPozoMiriam: 8.50,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 21,
    id: 'biz_dona',
    name: 'Dona (Azúcar / Chocolate / Fresa / Maple)',
    category: 'Pan Dulce Tradicional',
    mainGroup: 'dulce_danes',
    defaultPrice: 12.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 12.00,
      starMedica: 10.80,
      comoLaFlor: 10.80,
      elPozoSanFco: 8.50,
      elPozoMiriam: 8.50,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 22,
    id: 'biz_hojaldra',
    name: 'Hojaldra',
    category: 'Pan Dulce Tradicional',
    mainGroup: 'dulce_danes',
    defaultPrice: 12.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 12.00,
      starMedica: 10.80,
      comoLaFlor: 10.80,
      elPozoSanFco: 8.50,
      elPozoMiriam: 8.50,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 23,
    id: 'biz_rebanada',
    name: 'Rebanada',
    category: 'Pan Dulce Tradicional',
    mainGroup: 'dulce_danes',
    defaultPrice: 12.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 12.00,
      elPozoSanFco: 8.50,
      elPozoMiriam: 8.50,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 24,
    id: 'biz_concha_gourmet',
    name: 'Concha Gourmet',
    category: 'Repostería y Especiales',
    mainGroup: 'dulce_danes',
    defaultPrice: 20.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: { mostrador: 20.00 }
  },
  {
    num: 25,
    id: 'biz_pan_muerto',
    name: 'Pan de Muerto',
    category: 'Repostería y Especiales',
    mainGroup: 'dulce_danes',
    defaultPrice: 25.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: { mostrador: 25.00 }
  },

  // ==========================================
  // PÁGINA 2: DANÉS (26 - 44)
  // ==========================================
  {
    num: 26,
    id: 'dan_cuernito',
    name: 'Cuernito / Cuerno Manchego',
    category: 'Pan Dulce Tradicional',
    mainGroup: 'dulce_danes',
    defaultPrice: 12.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 12.00,
      starMedica: 10.80,
      comoLaFlor: 10.80,
      elPozoSanFco: 8.50,
      elPozoMiriam: 8.50,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 27,
    id: 'dan_mono',
    name: 'Moño',
    category: 'Pan Dulce Tradicional',
    mainGroup: 'dulce_danes',
    defaultPrice: 12.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 12.00,
      starMedica: 10.80,
      comoLaFlor: 10.80,
      elPozoSanFco: 8.50,
      elPozoMiriam: 8.50,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 28,
    id: 'dan_chocolatin',
    name: 'Chocolatín',
    category: 'Pan Dulce Relleno',
    mainGroup: 'dulce_danes',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 18.00,
      starMedica: 15.12,
      comoLaFlor: 16.20,
      elPozoSanFco: 13.00,
      elPozoMiriam: 13.00,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 29,
    id: 'dan_peineta_zarzamora',
    name: 'Peineta Zarzamora con Queso Crema',
    category: 'Pan Dulce Relleno',
    mainGroup: 'dulce_danes',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 18.00,
      starMedica: 15.12,
      comoLaFlor: 16.20,
      elPozoSanFco: 13.00,
      elPozoMiriam: 13.00,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 30,
    id: 'dan_pierna',
    name: 'Pierna',
    category: 'Pan Dulce Relleno',
    mainGroup: 'dulce_danes',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 18.00,
      elPozoSanFco: 13.00,
      elPozoMiriam: 13.00,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 31,
    id: 'dan_barquillo',
    name: 'Barquillo',
    category: 'Pan Dulce Relleno',
    mainGroup: 'dulce_danes',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 18.00,
      elPozoSanFco: 13.00,
      elPozoMiriam: 13.00,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 32,
    id: 'dan_rollo_queso',
    name: 'Rollo Q. Crema',
    category: 'Pan Dulce Relleno',
    mainGroup: 'dulce_danes',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 18.00,
      elPozoSanFco: 13.00,
      elPozoMiriam: 13.00,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 33,
    id: 'dan_rollo_higo',
    name: 'Rollo de Higo',
    category: 'Pan Dulce Relleno',
    mainGroup: 'dulce_danes',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 18.00,
      elPozoSanFco: 13.00,
      elPozoMiriam: 13.00,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 34,
    id: 'dan_nido_queso',
    name: 'Nido de Queso',
    category: 'Pan Dulce Relleno',
    mainGroup: 'dulce_danes',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 18.00,
      elPozoSanFco: 13.00,
      elPozoMiriam: 13.00,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 35,
    id: 'dan_rol_canela',
    name: 'Rol de Canela',
    category: 'Pan Dulce Relleno',
    mainGroup: 'dulce_danes',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 18.00,
      elPozoSanFco: 13.00,
      elPozoMiriam: 13.00,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 36,
    id: 'dan_trenza',
    name: 'Trenza',
    category: 'Pan Dulce Relleno',
    mainGroup: 'dulce_danes',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 18.00,
      elPozoSanFco: 13.00,
      elPozoMiriam: 13.00,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 37,
    id: 'dan_pan_feria',
    name: 'Pan de Feria',
    category: 'Pan Dulce Relleno',
    mainGroup: 'dulce_danes',
    defaultPrice: 18.00,
    allowMini: false,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 18.00,
      elPozoSanFco: 13.00,
      elPozoMiriam: 13.00,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 38,
    id: 'dan_bigote_cajeta',
    name: 'Bigote de Cajeta',
    category: 'Repostería y Especiales',
    mainGroup: 'dulce_danes',
    defaultPrice: 20.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: { mostrador: 20.00 }
  },
  {
    num: 39,
    id: 'dan_bigote_nuez',
    name: 'Bigote Nuez Cocoa',
    category: 'Repostería y Especiales',
    mainGroup: 'dulce_danes',
    defaultPrice: 20.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: { mostrador: 20.00 }
  },
  {
    num: 40,
    id: 'dan_bigote_pastelera',
    name: 'Bigote Pastelera',
    category: 'Repostería y Especiales',
    mainGroup: 'dulce_danes',
    defaultPrice: 20.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 20.00,
      tortasPradera: 7.00,
      carroRojo: 7.50
    }
  },
  {
    num: 41,
    id: 'dan_bigote_avellana',
    name: 'Bigote Avellana',
    category: 'Repostería y Especiales',
    mainGroup: 'dulce_danes',
    defaultPrice: 20.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: { mostrador: 20.00 }
  },
  {
    num: 42,
    id: 'dan_rol_higo_esp',
    name: 'Rol de Higo Especial',
    category: 'Especiales / Otros',
    mainGroup: 'dulce_danes',
    defaultPrice: 20.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: { mostrador: 20.00 }
  },
  {
    num: 43,
    id: 'dan_rol_avellana',
    name: 'Rol de Avellana',
    category: 'Especiales / Otros',
    mainGroup: 'dulce_danes',
    defaultPrice: 20.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: { mostrador: 20.00 }
  },
  {
    num: 44,
    id: 'dan_chocolatin_croissant',
    name: 'Chocolatín de Croissant',
    category: 'Pan Dulce Relleno',
    mainGroup: 'dulce_danes',
    defaultPrice: 35.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 35.00,
      elPozoSanFco: 13.00,
      elPozoMiriam: 13.00,
      miscPaola: 8.50,
      calero: 8.50
    }
  },

  // ==========================================
  // PÁGINA 2 & 3: FEITE (HOJALDRE) (45 - 59)
  // ==========================================
  {
    num: 45,
    id: 'fei_oreja',
    name: 'Oreja',
    category: 'Pan Dulce Tradicional',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 12.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 12.00,
      starMedica: 10.80,
      comoLaFlor: 10.80,
      elPozoSanFco: 8.50,
      elPozoMiriam: 8.50,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 46,
    id: 'fei_cuadro_coco',
    name: 'Cuadro Coco',
    category: 'Pan Dulce Tradicional',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 12.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 12.00,
      elPozoSanFco: 8.50,
      elPozoMiriam: 8.50,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 47,
    id: 'fei_broca',
    name: 'Broca',
    category: 'Pan Dulce Tradicional',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 12.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 12.00,
      elPozoSanFco: 8.50,
      elPozoMiriam: 8.50,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 48,
    id: 'fei_banderilla',
    name: 'Banderilla',
    category: 'Pan Dulce Tradicional',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 12.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 12.00,
      elPozoSanFco: 8.50,
      elPozoMiriam: 8.50,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 49,
    id: 'fei_ojo_concha',
    name: 'Ojo de Concha',
    category: 'Pan Dulce Relleno',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 18.00,
      elPozoSanFco: 13.00,
      elPozoMiriam: 13.00,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 50,
    id: 'fei_ojo_pancha',
    name: 'Ojo de Pancha',
    category: 'Pan Dulce Relleno',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 18.00,
      elPozoSanFco: 13.00,
      elPozoMiriam: 13.00,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 51,
    id: 'fei_campechana',
    name: 'Campechana',
    category: 'Pan Dulce Relleno',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 18.00,
      elPozoSanFco: 13.00,
      elPozoMiriam: 13.00,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 52,
    id: 'fei_abanico',
    name: 'Abanico / Abanico Normal',
    category: 'Pan Dulce Relleno',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 18.00,
      elPozoSanFco: 13.00,
      elPozoMiriam: 13.00,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 53,
    id: 'fei_pastes',
    name: 'Pastes',
    category: 'Pan Dulce Relleno',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 18.00,
      elPozoSanFco: 13.00,
      elPozoMiriam: 13.00,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 54,
    id: 'fei_strudell',
    name: 'Strudell (Fresa, Piña, Pastelera, Manzana)',
    category: 'Pan Dulce Relleno',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 18.00,
      elPozoSanFco: 13.00,
      elPozoMiriam: 13.00,
      miscPaola: 8.50,
      calero: 8.50,
      tortasPradera: 7.00,
      carroRojo: 7.50
    }
  },
  {
    num: 55,
    id: 'fei_empanadas',
    name: 'Empanadas (Piña, Cajeta, Higo, Avellana, Manzana)',
    category: 'Pan Dulce Relleno',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 18.00,
      starMedica: 16.20,
      comoLaFlor: 16.20,
      elPozoSanFco: 13.00,
      elPozoMiriam: 13.00,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 56,
    id: 'fei_cubilete_queso',
    name: 'Cubilete Queso',
    category: 'Repostería y Especiales',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 18.00,
      starMedica: 16.20,
      comoLaFlor: 16.20,
      elPozoSanFco: 16.00,
      elPozoMiriam: 16.00
    }
  },
  {
    num: 57,
    id: 'fei_cubilete_fresa',
    name: 'Cubilete Fresa / Piña',
    category: 'Repostería y Especiales',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 18.00,
      elPozoSanFco: 16.00,
      elPozoMiriam: 16.00
    }
  },
  {
    num: 58,
    id: 'fei_canasta_fresa',
    name: 'Canasta de Fresa / Piña',
    category: 'Repostería y Especiales',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: { mostrador: 18.00 }
  },
  {
    num: 59,
    id: 'fei_cubilete_nuez',
    name: 'Cubilete Q. c/ Nuez',
    category: 'Repostería y Especiales',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 20.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 20.00,
      elPozoSanFco: 18.00
    }
  },

  // ==========================================
  // PÁGINA 3: BATIDOS (60 - 69)
  // ==========================================
  {
    num: 60,
    id: 'bat_mantecada',
    name: 'Mantecada (Normal / Choco)',
    category: 'Pan Dulce Tradicional',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 12.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 12.00,
      elPozoSanFco: 8.50,
      elPozoMiriam: 8.50,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 61,
    id: 'bat_pan_elote',
    name: 'Pan de Elote',
    category: 'Repostería y Especiales',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: { mostrador: 18.00 }
  },
  {
    num: 62,
    id: 'bat_berrinches',
    name: 'Berrinches',
    category: 'Repostería y Especiales',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: { mostrador: 18.00 }
  },
  {
    num: 63,
    id: 'bat_chino',
    name: 'Chino (Nuez, Pasas, Chocolate, Chispas, Piña-Coco)',
    category: 'Repostería y Especiales',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: { mostrador: 18.00 }
  },
  {
    num: 64,
    id: 'bat_panquecito',
    name: 'Panquecito',
    category: 'Repostería y Especiales',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: { mostrador: 18.00 }
  },
  {
    num: 65,
    id: 'bat_pinguinos',
    name: 'Pingüinos',
    category: 'Repostería y Especiales',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: { mostrador: 18.00 }
  },
  {
    num: 66,
    id: 'bat_garibaldi',
    name: 'Garibaldi',
    category: 'Repostería y Especiales',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: { mostrador: 18.00 }
  },
  {
    num: 67,
    id: 'bat_panque_chico',
    name: 'Panqué Chico',
    category: 'Repostería y Especiales',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 80.00,
    allowMini: false,
    defaultUnit: 'PZ',
    prices: { mostrador: 80.00 }
  },
  {
    num: 68,
    id: 'bat_panque_grande',
    name: 'Panqué Grande',
    category: 'Repostería y Especiales',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 150.00,
    allowMini: false,
    defaultUnit: 'PZ',
    prices: { mostrador: 150.00 }
  },
  {
    num: 69,
    id: 'bat_rosca',
    name: 'Rosca / Rosca de Nuez',
    category: 'Repostería y Especiales',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 150.00,
    allowMini: false,
    defaultUnit: 'PZ',
    prices: { mostrador: 150.00 }
  },

  // ==========================================
  // PÁGINA 3: POLVORONES Y GALLETAS (70 - 78)
  // ==========================================
  {
    num: 70,
    id: 'pol_naranja',
    name: 'Polvorón Naranja',
    category: 'Dulce Tradicional (Polvorón)',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 12.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 12.00,
      elPozoSanFco: 8.50,
      elPozoMiriam: 8.50,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 71,
    id: 'pol_sevillano',
    name: 'Polvorón Sevillano',
    category: 'Dulce Tradicional (Polvorón)',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 12.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 12.00,
      elPozoSanFco: 8.50,
      elPozoMiriam: 8.50,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 72,
    id: 'pol_gragea',
    name: 'Gragea',
    category: 'Dulce Tradicional (Polvorón)',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 12.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 12.00,
      elPozoSanFco: 8.50,
      elPozoMiriam: 8.50,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 73,
    id: 'pol_espejo',
    name: 'Espejo',
    category: 'Dulce Tradicional (Polvorón)',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 12.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 12.00,
      elPozoSanFco: 8.50,
      elPozoMiriam: 8.50,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 74,
    id: 'pol_choco',
    name: 'Polvorón Chocolate',
    category: 'Dulce Tradicional (Polvorón)',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 18.00,
      elPozoSanFco: 8.50,
      elPozoMiriam: 8.50,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 75,
    id: 'pol_cacahuate',
    name: 'Polvorón Cacahuate',
    category: 'Dulce Tradicional (Polvorón)',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 18.00,
      elPozoSanFco: 8.50,
      elPozoMiriam: 8.50,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 76,
    id: 'pol_galleta_mantequilla',
    name: 'Galleta Grande Mantequilla',
    category: 'Galletas',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 20.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: { mostrador: 20.00 }
  },
  {
    num: 77,
    id: 'pol_ruso',
    name: 'Polvorón Ruso',
    category: 'Dulce Tradicional (Polvorón)',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 20.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 20.00,
      elPozoSanFco: 8.50,
      elPozoMiriam: 8.50,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 78,
    id: 'pol_galleta_mini',
    name: 'Galleta Mant. Mini (Bolsa de Galletas)',
    category: 'Galletas',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 35.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: { mostrador: 35.00 }
  },

  // ==========================================
  // PÁGINA 3 & 4: OTROS (ESPECIALES Y MÁS) (79 - 97)
  // ==========================================
  {
    num: 79,
    id: 'otr_bisquet_natural',
    name: 'Bisquet Normal / Natural',
    category: 'Pan Dulce Tradicional',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 12.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 12.00,
      starMedica: 12.00,
      comoLaFlor: 10.80,
      elPozoSanFco: 8.50,
      elPozoMiriam: 8.50,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 80,
    id: 'otr_pan_canela',
    name: 'Panadero de Canela / Pan de Canela',
    category: 'Pan Dulce Tradicional',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 12.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 12.00,
      elPozoSanFco: 8.50,
      elPozoMiriam: 8.50,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 81,
    id: 'otr_pan_manteca',
    name: 'Pan de Manteca',
    category: 'Pan Dulce Tradicional',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 12.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 12.00,
      elPozoSanFco: 8.50,
      elPozoMiriam: 8.50,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 82,
    id: 'otr_cocol',
    name: 'Cocol / Cocol de Anís',
    category: 'Pan Dulce Tradicional',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 12.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 12.00,
      elPozoSanFco: 8.50,
      elPozoMiriam: 8.50,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 83,
    id: 'otr_puerquito',
    name: 'Puerquito',
    category: 'Pan Dulce Tradicional',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 12.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 12.00,
      elPozoSanFco: 8.50,
      elPozoMiriam: 8.50,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 84,
    id: 'otr_gusano',
    name: 'Gusano',
    category: 'Pan Dulce Tradicional',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 12.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 12.00,
      elPozoSanFco: 8.50,
      elPozoMiriam: 8.50,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 85,
    id: 'otr_bisquet_integral',
    name: 'Bisquet Integral',
    category: 'Pan Dulce Relleno',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 18.00,
      elPozoSanFco: 13.00,
      elPozoMiriam: 13.00,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 86,
    id: 'otr_bisquet_arandano',
    name: 'Bisquet Arándano',
    category: 'Pan Dulce Relleno',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 18.00,
      elPozoSanFco: 13.00,
      elPozoMiriam: 13.00,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 87,
    id: 'otr_multi',
    name: 'Multi',
    category: 'Pan Dulce Relleno',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 18.00,
      elPozoSanFco: 13.00,
      elPozoMiriam: 13.00,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 88,
    id: 'otr_piedra',
    name: 'Piedra',
    category: 'Repostería y Especiales',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: { mostrador: 18.00 }
  },
  {
    num: 89,
    id: 'otr_berlinesa',
    name: 'Berlinesa',
    category: 'Pan Dulce Relleno',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 18.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 18.00,
      elPozoSanFco: 13.00,
      elPozoMiriam: 13.00,
      miscPaola: 8.50,
      calero: 8.50
    }
  },
  {
    num: 90,
    id: 'otr_yoyo_beso',
    name: 'Yoyo / Beso',
    category: 'Repostería y Especiales',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 20.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: { mostrador: 20.00 }
  },
  {
    num: 91,
    id: 'otr_croissant_natural',
    name: 'Croissant Natural',
    category: 'Repostería y Especiales',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 25.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 25.00,
      starMedica: 20.00,
      comoLaFlor: 19.44
    }
  },
  {
    num: 92,
    id: 'otr_brownie',
    name: 'Brownie',
    category: 'Repostería y Especiales',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 30.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 30.00,
      starMedica: 27.00,
      comoLaFlor: 27.00
    }
  },
  {
    num: 93,
    id: 'otr_croissant_avellana',
    name: 'Croissant Avellana',
    category: 'Repostería y Especiales',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 35.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: { mostrador: 35.00 }
  },
  {
    num: 94,
    id: 'otr_croissant_cajeta',
    name: 'Croissant Cajeta',
    category: 'Repostería y Especiales',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 35.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: { mostrador: 35.00 }
  },
  {
    num: 95,
    id: 'otr_pan_caja_blanco',
    name: 'Pan de Caja Blanco',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 70.00,
    allowMini: false,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 70.00,
      starMedica: 70.20,
      comoLaFlor: 64.80
    }
  },
  {
    num: 96,
    id: 'otr_pan_caja_integral',
    name: 'Pan de Caja Integral',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 70.00,
    allowMini: false,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 70.00,
      starMedica: 70.20,
      comoLaFlor: 64.80
    }
  },
  {
    num: 97,
    id: 'otr_pan_caja_centeno',
    name: 'Pan de Caja Centeno',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 70.00,
    allowMini: false,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 70.00,
      starMedica: 70.20,
      comoLaFlor: 64.80
    }
  },

  // ==========================================
  // PÁGINA 4: SALADO (Cont.) (98 - 100)
  // ==========================================
  {
    num: 98,
    id: 'sal_pan_hot_dog',
    name: 'Pan para Hot Dog',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 6.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: { mostrador: 6.00 }
  },
  {
    num: 99,
    id: 'sal_bollo_grande',
    name: 'Bollo Grande',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 9.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 9.00,
      starMedica: 9.00,
      comoLaFlor: 9.00
    }
  },
  {
    num: 100,
    id: 'sal_bollo_chico',
    name: 'Bollo Chico',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 6.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: { mostrador: 6.00 }
  },

  // ==========================================
  // PÁGINA 4: OTROS / ESPECIALES (101 - 102)
  // ==========================================
  {
    num: 101,
    id: 'otr_pan_mini',
    name: 'Pan Mini',
    category: 'Pan Dulce Tradicional',
    mainGroup: 'dulce_danes',
    defaultPrice: 8.64,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 8.64,
      starMedica: 8.64,
      comoLaFlor: 8.64
    }
  },
  {
    num: 102,
    id: 'pol_galletas_granola',
    name: 'Galletas Granola',
    category: 'Dulce Tradicional (Polvorón)',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 15.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: { mostrador: 15.00 }
  },

  // ==========================================
  // PÁGINA 4: EUROPEO & SNACK / SALADO (103 - 114)
  // ==========================================
  {
    num: 103,
    id: 'sal_bolillo_mini',
    name: 'Bolillo Mini',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 4.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 4.00,
      starMedica: 4.00,
      comoLaFlor: 3.50
    }
  },
  {
    num: 104,
    id: 'sal_bagel_natural',
    name: 'Bagel Natural',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 9.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 9.00,
      starMedica: 10.00,
      comoLaFlor: 10.00
    }
  },
  {
    num: 105,
    id: 'sal_bagel_queso',
    name: 'Bagel con Queso',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 12.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 12.00,
      starMedica: 12.00,
      comoLaFlor: 12.00
    }
  },
  {
    num: 106,
    id: 'sal_bagel_paq6',
    name: 'Bagel (Paquete 6 pzas)',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 60.00,
    allowMini: false,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 60.00,
      starMedica: 60.00
    }
  },
  {
    num: 107,
    id: 'sal_chapata_mini',
    name: 'Chapata Mini',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 6.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 6.00,
      starMedica: 6.00
    }
  },
  {
    num: 108,
    id: 'sal_baguette_18',
    name: 'Pan Baguette 18 cm',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 6.50,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 6.50,
      starMedica: 10.00,
      comoLaFlor: 6.50
    }
  },
  {
    num: 109,
    id: 'sal_baguette_madre_25',
    name: 'Baguette Masa Madre 25 cm',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 20.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 20.00,
      starMedica: 20.00
    }
  },
  {
    num: 110,
    id: 'sal_palitos_hierbas_20',
    name: 'Palitos Hierbas Finas 20 cm',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 4.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 4.00,
      starMedica: 4.00
    }
  },
  {
    num: 111,
    id: 'sal_filon_madre',
    name: 'Filón Masa Madre Natural',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 50.00,
    allowMini: false,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 50.00,
      starMedica: 50.00,
      comoLaFlor: 50.00
    }
  },
  {
    num: 112,
    id: 'sal_pan_caja_brioche',
    name: 'Pan de Caja Brioche',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 75.60,
    allowMini: false,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 75.60,
      starMedica: 75.60,
      comoLaFlor: 75.60
    }
  },
  {
    num: 113,
    id: 'sal_bollo_serv_mini',
    name: 'Bollo de Servicio Mini Natural',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 6.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 6.00,
      starMedica: 6.00,
      comoLaFlor: 6.00
    }
  },
  {
    num: 114,
    id: 'sal_bollo_serv_queso',
    name: 'Bollo de Servicio Mini con Queso Crema',
    category: 'Europeo & Snack / Salado',
    mainGroup: 'salado',
    defaultPrice: 8.64,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 8.64,
      starMedica: 8.64,
      comoLaFlor: 8.64
    }
  },

  // ==========================================
  // PÁGINA 4 & 5: OTROS & GALLETAS (115 - 116)
  // ==========================================
  {
    num: 115,
    id: 'otr_croissant_mini',
    name: 'Croissant Mini Natural',
    category: 'Repostería y Especiales',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 10.00,
    allowMini: true,
    defaultUnit: 'PZ',
    prices: {
      mostrador: 10.00,
      starMedica: 7.56
    }
  },
  {
    num: 116,
    id: 'pol_galleta_kg',
    name: 'Galleta Mantequilla (Kg)',
    category: 'Galletas',
    mainGroup: 'feite_batidos_especiales',
    defaultPrice: 350.00,
    allowMini: false,
    defaultUnit: 'KG',
    prices: {
      mostrador: 350.00,
      starMedica: 378.00
    }
  }
];

export const MAIN_CATALOG_GROUPS = [
  {
    id: 'salado',
    name: '1. Salado (Bolillos, Teleras, Baguettes, Chapatas)',
    shortName: '1- Salado',
    emoji: '🥖',
    badge: '14 Productos',
    color: 'from-amber-600 to-yellow-600',
    bgLight: 'bg-amber-50/70',
    borderColor: 'border-amber-300',
    hoverBorder: 'hover:border-amber-500',
    activeColor: 'bg-amber-700 text-white'
  },
  {
    id: 'dulce_danes',
    name: '2. Bizcocho / Dulce & Danés (Conchas, Donas, Cuernitos, Roles)',
    shortName: '2- Dulce & Danés',
    emoji: '🥐',
    badge: '30 Productos',
    color: 'from-orange-600 to-rose-600',
    bgLight: 'bg-orange-50/70',
    borderColor: 'border-orange-300',
    hoverBorder: 'hover:border-orange-500',
    activeColor: 'bg-orange-700 text-white'
  },
  {
    id: 'feite_batidos_especiales',
    name: '3. Feite, Batidos, Galletas & Especiales (Orejas, Mantecadas, Empanadas)',
    shortName: '3- Feite, Batidos & Especiales',
    emoji: '🧁',
    badge: '72 Productos',
    color: 'from-purple-600 to-indigo-600',
    bgLight: 'bg-purple-50/70',
    borderColor: 'border-purple-300',
    hoverBorder: 'hover:border-purple-500',
    activeColor: 'bg-purple-700 text-white'
  }
];

/**
 * Normaliza nombres o identificadores de clientes para asociar con la lista de precios oficial
 */
export function normalizeCustomerKey(customerNameOrId: string = ''): {
  profileKey: keyof ClientPriceMap | 'reparto_tradicional' | 'mostrador';
  matchedProfileName: string;
  isCustomRate: boolean;
} {
  const norm = customerNameOrId.trim().toLowerCase();

  if (!norm || norm.includes('mostrador') || norm.includes('venta en tienda') || norm.includes('general') || norm.includes('publico')) {
    return { profileKey: 'mostrador', matchedProfileName: 'Mostrador General', isCustomRate: false };
  }

  if (norm.includes('star medica') || norm.includes('star médica') || norm.includes('hospital star')) {
    return { profileKey: 'starMedica', matchedProfileName: 'Star Médica (IEPS 8%)', isCustomRate: true };
  }

  if (norm.includes('como la flor') || norm.includes('comolaflor') || norm.includes('la flor')) {
    return { profileKey: 'comoLaFlor', matchedProfileName: 'Como la Flor (IEPS 8%)', isCustomRate: true };
  }

  if (norm.includes('san fco') || norm.includes('san francisco') || (norm.includes('el pozo') && !norm.includes('miriam')) || norm.includes('ana pozo')) {
    return { profileKey: 'elPozoSanFco', matchedProfileName: 'El Pozo San Fco', isCustomRate: true };
  }

  if (norm.includes('miriam pozo') || norm.includes('pozo miriam') || norm.includes('miriam')) {
    return { profileKey: 'elPozoMiriam', matchedProfileName: 'El Pozo Miriam', isCustomRate: true };
  }

  if (norm.includes('paola') || norm.includes('misc paola') || norm.includes('miscelanea paola')) {
    return { profileKey: 'miscPaola', matchedProfileName: 'Misc. Paola', isCustomRate: true };
  }

  if (norm.includes('calero')) {
    return { profileKey: 'calero', matchedProfileName: 'Calero', isCustomRate: true };
  }

  if (norm.includes('pradera') || norm.includes('tortas pradera')) {
    return { profileKey: 'tortasPradera', matchedProfileName: 'Tortas Pradera', isCustomRate: true };
  }

  if (norm.includes('carro rojo') || norm.includes('carrorojo')) {
    return { profileKey: 'carroRojo', matchedProfileName: 'Carro Rojo', isCustomRate: true };
  }

  // Clientes de reparto tradicional (tiendas, cremerías, etc.: Bolillo $4, Pan Dulce $8.50)
  if (
    norm.includes('cremeria') || 
    norm.includes('angeles') || 
    norm.includes('chopi') || 
    norm.includes('rivera') || 
    norm.includes('aby') || 
    norm.includes('liz') || 
    norm.includes('san josé') || 
    norm.includes('san jose') || 
    norm.includes('super') || 
    norm.includes('esperanza') || 
    norm.includes('vicky')
  ) {
    return { profileKey: 'reparto_tradicional', matchedProfileName: 'Reparto Tradicional (Bolillo $4 / Dulce $8.50)', isCustomRate: true };
  }

  // Pide y Recoge conocidos
  if (norm.includes('trascos')) {
    return { profileKey: 'mostrador', matchedProfileName: 'Trascos (Pide y Recoge)', isCustomRate: false };
  }
  if (norm.includes('magda')) {
    return { profileKey: 'mostrador', matchedProfileName: 'Magda (Pide y Recoge)', isCustomRate: false };
  }
  if (norm.includes('david') || norm.includes('bollos david')) {
    return { profileKey: 'mostrador', matchedProfileName: 'Bollos David (Pide y Recoge)', isCustomRate: false };
  }
  if (norm.includes('deliz')) {
    return { profileKey: 'mostrador', matchedProfileName: 'Deliz (Pide y Recoge)', isCustomRate: false };
  }

  return { profileKey: 'mostrador', matchedProfileName: customerNameOrId, isCustomRate: false };
}

/**
 * Calcula y devuelve el precio unitario pactado para un cliente específico
 */
export function getProductPriceForCustomer(
  product: CatalogBreadItem,
  customerNameOrId: string = '',
  channel?: 'mostrador' | 'reparto' | 'recoger_tienda' | 'venta_tienda' | string
): number {
  const { profileKey } = normalizeCustomerKey(customerNameOrId);

  // Si tiene un precio explícito asignado a esa columna
  if (profileKey in product.prices) {
    const specificPrice = product.prices[profileKey as keyof ClientPriceMap];
    if (typeof specificPrice === 'number' && specificPrice > 0) {
      return specificPrice;
    }
  }

  // Si es un cliente de reparto tradicional que no tiene columna específica
  if (profileKey === 'reparto_tradicional' || channel === 'reparto') {
    // Política oficial del catálogo: Bolillo/Pan Blanco $4.00, Pan Dulce base $8.50, Rellenos $13.00
    if (product.id.includes('bolillo') || product.name.toLowerCase().includes('bolillo') || product.name.toLowerCase().includes('pan blanco')) {
      return 4.00;
    }
    if (product.category === 'Pan Dulce Tradicional' || product.category === 'Dulce Tradicional (Polvorón)') {
      return 8.50;
    }
    if (product.category === 'Pan Dulce Relleno') {
      return 13.00;
    }
    if (product.prices.elPozoMiriam) {
      return product.prices.elPozoMiriam;
    }
    if (product.prices.miscPaola) {
      return product.prices.miscPaola;
    }
  }

  // Por defecto retorna el precio de Mostrador
  return product.prices.mostrador || product.defaultPrice || 0;
}
