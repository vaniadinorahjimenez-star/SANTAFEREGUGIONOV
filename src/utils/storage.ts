import {
  BreadProduct,
  SaleTicket,
  Customer,
  BakeryOrder,
  Settings,
  Driver,
  DriverCustomer,
  ProductionSheetRow,
  CashOutflowItem,
  ShiftCutRecord,
  OperationalExpense,
  SupplierBill,
  RecurringExpenseTemplate,
  SupplierBankInfo,
  VipCustomer,
  VipOrder,
  BranchId,
  DeliveryRunMetadata
} from '../types';
import { REAL_BAKERY_CATALOG, CatalogBreadItem } from '../data/bakeryCatalog';

export const DEFAULT_SETTINGS: Settings = {
  bakeryName: 'Panaderia Santa Fé el refugio',
  slogan: 'Pan calientito y tradicional.',
  phone: '442 816 3291',
  address: '7:00 am a 10:00 pm',
  ticketFooter: '¡Gracias por su preferencia! Vuelva pronto.',
  loyaltyPointsPerPesos: 20, // $20 pesos = 1 punto
  loyaltyValuePerPoint: 1, // 1 punto = $1 peso
  quickPrices: [5, 6.5, 8, 12, 15, 18, 20, 25, 30, 35],
  pinAdmin: '135792',
  adminPin: '135792',
  taxRate: 0,
  ticketPaperWidth: '58mm',
  mpDeviceId: 'N950NCD500070018',
  mpTerminalName: 'Terminal Mercado Pago Point'
};

// Formato oficial de producción diaria / semanal (3 Hojas de Panadería Santa Fé)
export const DEFAULT_PRODUCTION_SHEET: ProductionSheetRow[] = [
  // ===================== CATEGORÍA 1: SALADO (HOJA 1) =====================
  { id: 'ps_1', category: 'Salado', breadName: 'PAN BLANCO', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_2', category: 'Salado', breadName: 'CHAPATA', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_3', category: 'Salado', breadName: 'BAG. HIERBAS', lun: '✓', mar: '', mier: '✓', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_4', category: 'Salado', breadName: 'BAG. AJO', lun: '✓', mar: '', mier: '✓', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_5', category: 'Salado', breadName: 'BAG. PARMESANO', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_6', category: 'Salado', breadName: 'BAG. AJO C/ CHILE', lun: '✓', mar: '', mier: '✓', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_7', category: 'Salado', breadName: 'BAG. AJONJOLÍ', lun: '✓', mar: '', mier: '✓', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_8', category: 'Salado', breadName: 'FENDÚ', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_9', category: 'Salado', breadName: 'TELERA ZAJADA', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_10', category: 'Salado', breadName: 'PANINIS', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_11', category: 'Salado', breadName: 'PAMBAZOS', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_12', category: 'Salado', breadName: 'BOLILLOTE', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_13', category: 'Salado', breadName: 'TELEROTA NORMAL', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_14', category: 'Salado', breadName: 'BIROTE TAPATÍO 1', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_15', category: 'Salado', breadName: 'BIROTE TAPATÍO 1.5', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_16', category: 'Salado', breadName: 'TELERA', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_17', category: 'Salado', breadName: 'BAGUETTIN', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_18', category: 'Salado', breadName: 'CHAPATA C SEMILLA', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },

  // ===================== CATEGORÍA 2: PAN DULCE / BIZCOCHO (HOJAS 1 Y 2) =====================
  { id: 'ps_19', category: 'Pan Dulce / Bizcocho', breadName: 'CONCHA VAINILLA', lun: 'NO', mar: '4 CH', mier: '4 CH', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_20', category: 'Pan Dulce / Bizcocho', breadName: 'CONCHA CHOCO', lun: 'NO', mar: 'NO', mier: '3 CH', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_21', category: 'Pan Dulce / Bizcocho', breadName: 'CONCHA GOUR', lun: '3 CH', mar: '3 CH', mier: '3 CH', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_22', category: 'Pan Dulce / Bizcocho', breadName: 'CONCHA NUEZ', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_23', category: 'Pan Dulce / Bizcocho', breadName: 'NOVIA', lun: 'NO', mar: 'Si', mier: 'NO', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_24', category: 'Pan Dulce / Bizcocho', breadName: 'MANTECONCHA', lun: 'NO', mar: '1/2', mier: 'Si', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_25', category: 'Pan Dulce / Bizcocho', breadName: 'DONA', lun: '3 CH', mar: '3 CH', mier: '3 CH', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_26', category: 'Pan Dulce / Bizcocho', breadName: 'HOJALDRA', lun: 'Si', mar: '', mier: 'Si', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_27', category: 'Pan Dulce / Bizcocho', breadName: 'REBANADA', lun: 'Si', mar: 'Si', mier: 'Si', juev: '', vier: '', sab: '', dom: '' },
  // Danés (incluido en Bizcochos)
  { id: 'ps_28', category: 'Pan Dulce / Bizcocho', subgroup: 'Danés', breadName: 'CUERNITO', lun: '3 CH', mar: '2 CH', mier: '4 CH', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_29', category: 'Pan Dulce / Bizcocho', subgroup: 'Danés', breadName: 'CHOCOLATIN', lun: '1 CH', mar: '2 CH', mier: '3 CH', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_30', category: 'Pan Dulce / Bizcocho', subgroup: 'Danés', breadName: 'PEINETA ZARZAMORA', lun: '8 PZ', mar: '10 PZ', mier: '10 PZ', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_31', category: 'Pan Dulce / Bizcocho', subgroup: 'Danés', breadName: 'PIERNA', lun: '1 y 1', mar: 'Blanca', mier: '1/2 y 1/2', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_32', category: 'Pan Dulce / Bizcocho', subgroup: 'Danés', breadName: 'BARQUILLO', lun: 'Si', mar: 'NO', mier: 'NO', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_33', category: 'Pan Dulce / Bizcocho', subgroup: 'Danés', breadName: 'ROLLO Q. CREMA', lun: 'NO', mar: '12 PZ', mier: '10 PZ', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_34', category: 'Pan Dulce / Bizcocho', subgroup: 'Danés', breadName: 'ROLLO DE HIGO', lun: '6 PZ', mar: '6 PZ', mier: '6 PZ', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_35', category: 'Pan Dulce / Bizcocho', subgroup: 'Danés', breadName: 'NIDO DE ARROZ', lun: 'NO', mar: 'NO', mier: 'Si', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_36', category: 'Pan Dulce / Bizcocho', subgroup: 'Danés', breadName: 'MOÑO', lun: 'NO', mar: 'Si', mier: 'Poco', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_37', category: 'Pan Dulce / Bizcocho', subgroup: 'Danés', breadName: 'BIGOTE DE CAJETA', lun: 'NO', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_38', category: 'Pan Dulce / Bizcocho', subgroup: 'Danés', breadName: 'BIGOTE NUEZ COCOA', lun: 'NO', mar: '6 PZ', mier: '6 PZ', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_39', category: 'Pan Dulce / Bizcocho', subgroup: 'Danés', breadName: 'ROL DE CANELA', lun: '10 PZ', mar: 'NO', mier: '8 PZ', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_40', category: 'Pan Dulce / Bizcocho', subgroup: 'Danés', breadName: 'ROL DE HIGO', lun: '10 PZ', mar: '10 PZ', mier: '8 PZ', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_41', category: 'Pan Dulce / Bizcocho', subgroup: 'Danés', breadName: 'ROL DE AVELLANA', lun: '10 PZ', mar: '15 PZ', mier: '12 PZ', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_42', category: 'Pan Dulce / Bizcocho', subgroup: 'Danés', breadName: 'BIGOTE AVELLANA', lun: '8 PZ', mar: '6 PZ', mier: '8 PZ', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_43', category: 'Pan Dulce / Bizcocho', subgroup: 'Danés', breadName: 'TRENZA', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_44', category: 'Pan Dulce / Bizcocho', subgroup: 'Danés', breadName: 'PAN DE FERIA', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_45', category: 'Pan Dulce / Bizcocho', subgroup: 'Danés', breadName: 'CUERNO MANCHEGO', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },

  // ===================== CATEGORÍA 3: FEITE Y BATIDOS (HOJAS 2 Y 3) =====================
  { id: 'ps_46', category: 'Feite y Batidos', breadName: 'OJO DE CONCHA', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_47', category: 'Feite y Batidos', breadName: 'OJO DE PANCHA', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_48', category: 'Feite y Batidos', breadName: 'CAMPECHANA', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_49', category: 'Feite y Batidos', breadName: 'OREJA', lun: 'Si', mar: 'Si', mier: '4 CH', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_50', category: 'Feite y Batidos', breadName: 'SACRISTÁN', lun: 'Si', mar: 'NO', mier: '2 CH', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_51', category: 'Feite y Batidos', breadName: 'ABANICO', lun: 'Si', mar: 'Si', mier: '3 CH', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_52', category: 'Feite y Batidos', breadName: 'CUADRO COCO', lun: 'Si', mar: 'Si', mier: 'NO', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_53', category: 'Feite y Batidos', breadName: 'BROCA', lun: 'NO', mar: 'NO', mier: 'NO', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_54', category: 'Feite y Batidos', breadName: 'BANDERILLA', lun: 'NO', mar: 'NO', mier: 'Si', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_55', category: 'Feite y Batidos', breadName: 'PASTEL / STRUDELL CHOCOLATE', lun: '15 PZ', mar: '15 PZ', mier: '15 PZ', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_56', category: 'Feite y Batidos', breadName: 'STRUDELL FRESA', lun: '15 PZ', mar: '15 PZ', mier: '15 PZ', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_57', category: 'Feite y Batidos', breadName: 'STRUDELL PIÑA', lun: '15 PZ', mar: '15 PZ', mier: '15 PZ', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_58', category: 'Feite y Batidos', breadName: 'STRUDELL PASTELERA', lun: '', mar: '', mier: '15 PZ', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_59', category: 'Feite y Batidos', breadName: 'STRUDELL MANZANA', lun: '10 PZ', mar: 'NO', mier: 'NO', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_60', category: 'Feite y Batidos', breadName: 'EMPANADA PIÑA', lun: '', mar: '', mier: '6 PZ', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_61', category: 'Feite y Batidos', breadName: 'EMPANADA ARROZ', lun: '', mar: '8 PZ', mier: '6 PZ', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_62', category: 'Feite y Batidos', breadName: 'EMPANADA HIGO', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_63', category: 'Feite y Batidos', breadName: 'EMPANADA AVELLANA', lun: '', mar: '6 PZ', mier: '6 PZ', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_64', category: 'Feite y Batidos', breadName: 'EMPANADA MANZANA', lun: '', mar: '6 PZ', mier: '6 PZ', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_65', category: 'Feite y Batidos', breadName: 'CUBILETE QUESO', lun: '1 placa', mar: '1 placa', mier: '1 placa', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_66', category: 'Feite y Batidos', breadName: 'CUBILETE FRESA', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_67', category: 'Feite y Batidos', breadName: 'CUBILETE PIÑA', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_68', category: 'Feite y Batidos', breadName: 'CUBILETE Q. C/ NUEZ', lun: '1/2', mar: '1/2', mier: '1/2', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_69', category: 'Feite y Batidos', breadName: 'PAN DE ELOTE', lun: '1/2', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_70', category: 'Feite y Batidos', breadName: 'BERRINCHES', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_71', category: 'Feite y Batidos', breadName: 'MANTECADA', lun: '1/2', mar: 'NO', mier: '1 Placa', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_72', category: 'Feite y Batidos', breadName: 'MANTECADA CHOCO', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_73', category: 'Feite y Batidos', breadName: 'CHINO', lun: 'N/P/CO/CH', mar: 'N/P/CO/CH', mier: 'N/P/CO/CH', juev: 'N/P/CO/CH', vier: 'N/P/CO/CH', sab: 'N/P/CO/CH', dom: 'N/P/CO/CH' },
  { id: 'ps_74', category: 'Feite y Batidos', breadName: 'PANQUECITO', lun: 'N/P/CO/CH', mar: 'N/P/CO/CH', mier: 'N/P/CO/CH', juev: 'N/P/CO/CH', vier: 'N/P/CO/CH', sab: 'N/P/CO/CH', dom: 'N/P/CO/CH' },
  { id: 'ps_75', category: 'Feite y Batidos', breadName: 'ROSCA', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_76', category: 'Feite y Batidos', breadName: 'PANQUÉ CHICO', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_77', category: 'Feite y Batidos', breadName: 'PANQUÉ GDE', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_78', category: 'Feite y Batidos', breadName: 'PINGÜINOS', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
  { id: 'ps_79', category: 'Feite y Batidos', breadName: 'GARIBALDI', lun: '', mar: '', mier: '', juev: '', vier: '', sab: '', dom: '' },
];

export const DEFAULT_PRODUCTS: BreadProduct[] = [
  { id: 'p4_pref', name: 'Pan Preferente $4', price: 4, category: 'Pan Dulce Tradicional' },
  { id: 'p5', name: 'Bolillo / Telera Chica $5', price: 5, category: 'Bolillo y Telera', isQuickPreset: true },
  { id: 'p5_5_pref', name: 'Pan Preferente $5.50', price: 5.5, category: 'Pan Dulce Tradicional' },
  { id: 'p6_pref', name: 'Pan Preferente $6', price: 6, category: 'Pan Dulce Tradicional' },
  { id: 'p6_5', name: 'Pan Especial / Telera $6.50', price: 6.5, category: 'Bolillo y Telera', isQuickPreset: true },
  { id: 'p7_pref', name: 'Pan Preferente $7', price: 7, category: 'Pan Dulce Tradicional' },
  { id: 'p7_5_pref', name: 'Pan Preferente $7.50', price: 7.5, category: 'Pan Dulce Tradicional' },
  { id: 'p8', name: 'Dona Mini $8', price: 8, category: 'Pan Dulce Tradicional', isQuickPreset: true },
  { id: 'p9_pref', name: 'Pan Preferente $9', price: 9, category: 'Pan Dulce Tradicional' },
  { id: 'p10_pref', name: 'Pan Preferente $10', price: 10, category: 'Pan Dulce Tradicional' },
  { id: 'p11_pref', name: 'Pan Preferente $11', price: 11, category: 'Pan Dulce Tradicional' },
  { id: 'p12', name: 'Dona / Pan Dulce $12', price: 12, category: 'Pan Dulce Tradicional', isQuickPreset: true },
  { id: 'p12_5_pref', name: 'Pan Fino Preferente $12.50', price: 12.5, category: 'Pan Dulce Tradicional' },
  { id: 'p13_pref', name: 'Pan Preferente $13', price: 13, category: 'Pan Dulce Tradicional' },
  { id: 'p15', name: 'Concha / Pan Fino $15', price: 15, category: 'Pan Dulce Tradicional', isQuickPreset: true },
  { id: 'p16_pref', name: 'Pan Preferente $16', price: 16, category: 'Pan Dulce Tradicional' },
  { id: 'p18', name: 'Cuerno de Mantequilla $18', price: 18, category: 'Pan Dulce Tradicional', isQuickPreset: true },
  { id: 'p20', name: 'Oreja / Empanada $20', price: 20, category: 'Pan Dulce Tradicional', isQuickPreset: true },
  { id: 'p25', name: 'Panqué Individual $25', price: 25, category: 'Panqués y Galletas', isQuickPreset: true },
  { id: 'p30', name: 'Pan Relleno / Especial $30', price: 30, category: 'Panqués y Galletas', isQuickPreset: true },
  { id: 'p35_bread', name: 'Panqué Grande / Especial $35', price: 35, category: 'Panqués y Galletas', isQuickPreset: true },
  // Companion & Dairy
  { id: 'p_leche_grande_35', name: 'Leche Grande $35', price: 35, category: 'Lácteos y Acompañamientos', isQuickPreset: true },
  { id: 'p_lechitas_18', name: 'Lechita $18', price: 18, category: 'Lácteos y Acompañamientos', isQuickPreset: true },
  { id: 'p_choco_abuelita_tab_30', name: 'Chocolate Abuelita Tabletilla $30', price: 30, category: 'Lácteos y Acompañamientos', isQuickPreset: true },
  { id: 'p_choco_abuelita_tab_60', name: 'Chocolate Abuelita Tableta $60', price: 60, category: 'Lácteos y Acompañamientos', isQuickPreset: true },
  { id: 'p_choco_abuelita_caja_180', name: 'Chocolate Abuelita Caja $180', price: 180, category: 'Lácteos y Acompañamientos', isQuickPreset: true },
  { id: 'p_gelatina_20', name: 'Gelatina', price: 20, category: 'Lácteos y Acompañamientos', isQuickPreset: true },
  { id: 'p_arroz_leche_25', name: 'Arroz con Leche', price: 25, category: 'Lácteos y Acompañamientos', isQuickPreset: true },
  { id: 'p_pastel_65', name: 'Pastel $65', price: 65, category: 'Lácteos y Acompañamientos', isQuickPreset: true },
  { id: 'p_pastel_35', name: 'Pastel $35', price: 35, category: 'Lácteos y Acompañamientos', isQuickPreset: true },
  { id: 'p_galletas_65', name: 'Galletas $65', price: 65, category: 'Lácteos y Acompañamientos', isQuickPreset: true },
  { id: 'p_domo_25', name: 'Charola / Domo $25', price: 25, category: 'Lácteos y Acompañamientos', isQuickPreset: true },
  { id: 'p_cafe_130', name: 'Café $130', price: 130, category: 'Lácteos y Acompañamientos', isQuickPreset: true },
  { id: 'p_miel_170', name: 'Miel $170', price: 170, category: 'Lácteos y Acompañamientos', isQuickPreset: true },
  { id: 'p_nata', name: 'Nata $90', price: 90, category: 'Lácteos y Acompañamientos', isQuickPreset: true },
  { id: 'p_cajeta_130', name: 'Cajeta $130', price: 130, category: 'Lácteos y Acompañamientos', isQuickPreset: true },
  { id: 'p_rosca_50', name: 'Rosca $50', price: 50, category: 'Pan Dulce Tradicional', isQuickPreset: true },
  { id: 'p_queso', name: 'Queso de Rancho', price: 150, category: 'Lácteos y Acompañamientos', isQuickPreset: false },
  { id: 'p_granola_160', name: 'Granola Artesanal $160', price: 160, category: 'Lácteos y Acompañamientos', isQuickPreset: true },
  { id: 'p_paleta_40', name: 'Paleta de Hielo $40', price: 40, category: 'Lácteos y Acompañamientos', isQuickPreset: true },
  { id: 'p_paleta_45', name: 'Paleta de Hielo $45', price: 45, category: 'Lácteos y Acompañamientos', isQuickPreset: true },
  { id: 'p_paleta_50', name: 'Paleta de Hielo $50', price: 50, category: 'Lácteos y Acompañamientos', isQuickPreset: true },
  { id: 'p100', name: 'Pastel Individual / Tarta Frutas', price: 100, category: 'Pasteles y Tartas', isQuickPreset: false },
  // Extra catalog items
  { id: 'p_concha_choco', name: 'Concha Especial Chocolate', price: 15, category: 'Pan Dulce Tradicional' },
  { id: 'p_ojo_buey', name: 'Ojo de Buey', price: 12, category: 'Pan Dulce Tradicional' },
  { id: 'p_beso', name: 'Beso de Mermelada', price: 14, category: 'Pan Dulce Tradicional' },
  { id: 'p_polvoron', name: 'Polvorón Tricolor', price: 12, category: 'Panqués y Galletas' },
  { id: 'p_trenza', name: 'Trenza de Canela y Nuez', price: 22, category: 'Pan Dulce Tradicional' },
  { id: 'p_teleras_paq', name: 'Paquete de 10 Teleras', price: 75, category: 'Bolillo y Telera' },
  { id: 'p_pastel_fresa', name: 'Pastel Tres Leches con Fresa', price: 280, category: 'Pasteles y Tartas' },
  { id: 'p_empanadas_docena', name: 'Docena de Empanadas Mixtas', price: 190, category: 'Bocadillos y Empanadas' },
];

export const DEFAULT_DRIVERS: Driver[] = [
  {
    id: 'osvaldo',
    name: 'Osvaldo Morales',
    phone: '442 816 3291',
    vehicle: 'Motocicleta Itálika 125 (Placa SF-442)',
    pin: '1111',
    avatarColor: 'bg-blue-500',
    assignedCustomers: ['Esperanza', 'Paola', 'Vicky', 'Star Medica']
  },
  {
    id: 'simon',
    name: 'Simón Gómez',
    phone: '442 765 4321',
    vehicle: 'Motocicleta Vento 150 (Placa SF-881)',
    pin: '2222',
    avatarColor: 'bg-emerald-500',
    assignedCustomers: [
      'Cremeria Angeles 1',
      'Cremeria Angeles 2',
      'Chopi',
      'Ana pozo',
      'Super Rivera',
      'Aby',
      'Liz',
      'San José',
      'Miriam pozo',
      'Super'
    ]
  }
];

export const DEFAULT_DRIVER_CUSTOMERS: DriverCustomer[] = [
  // ==================== SIMÓN (14 Clientes de Reparto) ====================
  {
    id: 'dc_sim_sanjose',
    name: 'Abarrotes "san jose"',
    driverId: 'simon',
    customerType: 'reparto',
    items: [
      { breadName: 'Bolillo', unitPrice: 4.00 },
      { breadName: 'Dulce', unitPrice: 8.50 }
    ]
  },
  {
    id: 'dc_sim_pollo',
    name: 'Abarrotes el pollo',
    driverId: 'simon',
    customerType: 'reparto',
    items: [
      { breadName: 'Bolillo', unitPrice: 4.00 },
      { breadName: 'Dulce', unitPrice: 8.50 }
    ]
  },
  {
    id: 'dc_sim_aby',
    name: 'Cremeria aby',
    driverId: 'simon',
    customerType: 'reparto',
    items: [
      { breadName: 'Bolillo', unitPrice: 4.00 },
      { breadName: 'Dulce', unitPrice: 8.50 }
    ]
  },
  {
    id: 'dc_sim_angeles1',
    name: 'Cremeria angeles "1"',
    driverId: 'simon',
    customerType: 'reparto',
    items: [
      { breadName: 'Bolillo', unitPrice: 4.00 },
      { breadName: 'Dulce', unitPrice: 8.50 }
    ]
  },
  {
    id: 'dc_sim_angeles2',
    name: 'Cremeria angeles "2"',
    driverId: 'simon',
    customerType: 'reparto',
    items: [
      { breadName: 'Bolillo', unitPrice: 4.00 },
      { breadName: 'Dulce', unitPrice: 8.50 }
    ]
  },
  {
    id: 'dc_sim_liz',
    name: 'Cremeria liz',
    driverId: 'simon',
    customerType: 'reparto',
    items: [
      { breadName: 'Bolillo', unitPrice: 4.00 },
      { breadName: 'Dulce', unitPrice: 8.50 }
    ]
  },
  {
    id: 'dc_sim_miriam',
    name: 'Miriam pozo',
    driverId: 'simon',
    customerType: 'reparto',
    items: [
      { breadName: 'Bolillo', unitPrice: 4.00 },
      { breadName: 'Dulce trad', unitPrice: 8.50 },
      { breadName: 'Dulce rell', unitPrice: 13.00 },
      { breadName: 'Cubilete', unitPrice: 16.00 }
    ]
  },
  {
    id: 'dc_sim_anapozo',
    name: 'Ana pozo san francisco',
    driverId: 'simon',
    customerType: 'reparto',
    items: [
      { breadName: 'Bolillo', unitPrice: 4.00 },
      { breadName: 'Dulce trad', unitPrice: 8.50 },
      { breadName: 'Dulce rell', unitPrice: 13.00 },
      { breadName: 'Concha', unitPrice: 10.00 },
      { breadName: 'Cubilete', unitPrice: 16.00 },
      { breadName: 'Cubilete c/nuez', unitPrice: 18.00 }
    ]
  },
  {
    id: 'dc_sim_hopewash',
    name: 'Hope wash',
    driverId: 'simon',
    customerType: 'reparto',
    items: [
      { breadName: 'Cuernito normal para rellenar', unitPrice: 10.80 },
      { breadName: 'Bagel natural', unitPrice: 10.00 },
      { breadName: 'Bagel con queso', unitPrice: 12.00 },
      { breadName: 'Chapata natural para sandwich de 18 cm.', unitPrice: 13.00 },
      { breadName: 'Chapata con queso para sandwich de 18 cm.', unitPrice: 15.00 },
      { breadName: 'Pan baguet de 18 cm.', unitPrice: 6.50 },
      { breadName: 'Pan baguet de 25 cm.', unitPrice: 18.00 },
      { breadName: 'Pan baguet de 50 cm.', unitPrice: 40.00 },
      { breadName: 'Pan dulce miniatura tradicional de 40g', unitPrice: 8.64 },
      { breadName: 'Pan dulce miniatura especial/relleno de 40g', unitPrice: 10.80 },
      { breadName: 'Pan de caja (natural, multigrano, centeno)', unitPrice: 64.80 },
      { breadName: 'Pan de caja brioche', unitPrice: 75.60 },
      { breadName: 'Filón masa madre natural', unitPrice: 50.00 },
      { breadName: 'Pan dulce tradicional de 80/90 gms', unitPrice: 10.80 },
      { breadName: 'Pan dulce relleno 100/120gms', unitPrice: 16.20 },
      { breadName: 'Mini bolillo', unitPrice: 3.50 },
      { breadName: 'Bolillo normal', unitPrice: 5.00 },
      { breadName: 'Telera', unitPrice: 5.50 },
      { breadName: 'Pan para pambazos', unitPrice: 5.00 },
      { breadName: 'Bollo para hamburguesa', unitPrice: 9.00 },
      { breadName: 'Croissant natural', unitPrice: 19.44 },
      { breadName: 'Bollo de servicio mini con queso crema', unitPrice: 8.64 },
      { breadName: 'Bollo de servicio mini natural', unitPrice: 6.00 }
    ]
  },
  {
    id: 'dc_sim_superrivera',
    name: 'Súper rivera',
    driverId: 'simon',
    customerType: 'reparto',
    items: [
      { breadName: 'Bolillo', unitPrice: 4.00 },
      { breadName: 'Dulce', unitPrice: 8.50 }
    ]
  },
  {
    id: 'dc_sim_tavio',
    name: 'Tortas tavio',
    driverId: 'simon',
    customerType: 'reparto',
    items: [
      { breadName: 'Telera', unitPrice: 7.50 }
    ]
  },
  {
    id: 'dc_sim_chopi',
    name: 'Chopi',
    driverId: 'simon',
    customerType: 'reparto',
    items: [
      { breadName: 'Bolillo', unitPrice: 4.00 },
      { breadName: 'Dulce', unitPrice: 8.50 }
    ]
  },
  {
    id: 'dc_sim_ladra',
    name: 'La Dra',
    driverId: 'simon',
    customerType: 'reparto',
    items: [
      { breadName: 'Bolillo', unitPrice: 4.00 },
      { breadName: 'Dulce', unitPrice: 8.50 }
    ]
  },
  {
    id: 'dc_sim_cabrera',
    name: 'Cabrera',
    driverId: 'simon',
    customerType: 'reparto',
    items: [
      { breadName: 'Bolillo', unitPrice: 4.00 },
      { breadName: 'Dulce', unitPrice: 8.50 }
    ]
  },

  // ==================== OSVALDO (8 Clientes de Reparto) ====================
  {
    id: 'dc_osv_zancudo',
    name: 'El Zancudo',
    driverId: 'osvaldo',
    customerType: 'reparto',
    items: [
      { breadName: 'Bolillo', unitPrice: 4.00 },
      { breadName: 'Dulce', unitPrice: 8.50 }
    ]
  },
  {
    id: 'dc_osv_calero',
    name: 'Esperanza "el calero"',
    driverId: 'osvaldo',
    customerType: 'reparto',
    items: [
      { breadName: 'Bolillo', unitPrice: 4.00 },
      { breadName: 'Dulce', unitPrice: 8.50 }
    ]
  },
  {
    id: 'dc_osv_lupita',
    name: 'Miscelanea "lupita"',
    driverId: 'osvaldo',
    customerType: 'reparto',
    items: [
      { breadName: 'Bolillo', unitPrice: 4.00 },
      { breadName: 'Dulce', unitPrice: 8.50 }
    ]
  },
  {
    id: 'dc_osv_paola',
    name: 'Paola miscelanea',
    driverId: 'osvaldo',
    customerType: 'reparto',
    items: [
      { breadName: 'Bolillo', unitPrice: 4.00 },
      { breadName: 'Dulce', unitPrice: 8.50 }
    ]
  },
  {
    id: 'dc_osv_carrorojo',
    name: 'Tortas el carro rojo',
    driverId: 'osvaldo',
    customerType: 'reparto',
    items: [
      { breadName: 'Telera', unitPrice: 7.50 }
    ]
  },
  {
    id: 'dc_osv_vicky',
    name: 'Vicky',
    driverId: 'osvaldo',
    customerType: 'reparto',
    items: [
      { breadName: 'Bolillo', unitPrice: 4.00 },
      { breadName: 'Dulce', unitPrice: 8.50 }
    ]
  },
  {
    id: 'dc_osv_starmedica',
    name: 'Star medica',
    driverId: 'osvaldo',
    customerType: 'reparto',
    items: [
      { breadName: 'Pan para Comedor / Hospital', unitPrice: 0.00 }
    ]
  },
  {
    id: 'dc_osv_campogolf',
    name: 'Campo de Golf',
    driverId: 'osvaldo',
    customerType: 'reparto',
    items: [
      { breadName: 'Pan para Restaurante', unitPrice: 0.00 }
    ]
  },

  // ==================== PIDE Y RECOGE EN TIENDA ====================
  { id: 'dc_pk_1', name: 'Trascos', driverId: 'tienda', customerType: 'recoger_tienda', items: [{ breadName: 'Pan tradicional', unitPrice: 10.00 }] },
  { id: 'dc_pk_2', name: 'Magda', driverId: 'tienda', customerType: 'recoger_tienda', items: [{ breadName: 'Pan dulce', unitPrice: 12.00 }] },
  { id: 'dc_pk_3', name: 'Bollos David', driverId: 'tienda', customerType: 'recoger_tienda', items: [{ breadName: 'Bollos hamburguesa', unitPrice: 9.00 }] },
  { id: 'dc_pk_4', name: 'Deliz', driverId: 'tienda', customerType: 'recoger_tienda', items: [{ breadName: 'Baguette y especial', unitPrice: 15.00 }] }
];

// Helper to get today's date formatted as YYYY-MM-DD
export function getTodayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to get tomorrow's date formatted as YYYY-MM-DD
export function getTomorrowString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getNowTimeString(includeSeconds = true): string {
  const now = new Date();
  if (includeSeconds) {
    return now.toTimeString().slice(0, 8); // "HH:MM:SS"
  }
  return now.toTimeString().slice(0, 5); // "HH:MM"
}

// Convertir hora tipo "02:30 PM" o "14:30" a minutos del día
export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const str = timeStr.trim().toUpperCase();
  const isPM = str.includes('PM') || str.includes('P.M.');
  const isAM = str.includes('AM') || str.includes('A.M.');
  
  const clean = str.replace(/[^0-9:]/g, '');
  const parts = clean.split(':');
  let h = parseInt(parts[0] || '0', 10);
  const m = parseInt(parts[1] || '0', 10);
  
  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;
  
  return h * 60 + m;
}

// Determina el turno por horario estándar:
// Turno 1: 06:50 AM (410 mins) a 15:00 HRS (900 mins)
// Turno 2: 15:01 HRS (901 mins) a 22:10 HRS (1330 mins)
export function getTicketShiftByTime(timeStr: string): 'turno1' | 'turno2' {
  const mins = parseTimeToMinutes(timeStr);
  if (mins >= 410 && mins <= 900) {
    return 'turno1';
  }
  if (mins > 900 && mins <= 1330) {
    return 'turno2';
  }
  if (mins < 410) {
    return 'turno1';
  }
  return 'turno2';
}

// Resuelve el turno de un ticket: respeta el shift manual registrado primero, con respaldo por hora
export function resolveTicketShift(ticket: { shift?: 'turno1' | 'turno2'; time?: string }): 'turno1' | 'turno2' {
  if (ticket.shift === 'turno1' || ticket.shift === 'turno2') {
    return ticket.shift;
  }
  return getTicketShiftByTime(ticket.time || '');
}

export const INITIAL_CUSTOMERS: Customer[] = [
  { id: 'c1', name: 'Doña Carmen Ramírez', phone: '5511223344', points: 35, totalSpent: 700, visitsCount: 14, lastVisit: getTodayString() },
  { id: 'c2', name: 'Sr. Roberto Vargas', phone: '5522334455', points: 60, totalSpent: 1200, visitsCount: 8, lastVisit: getTodayString() },
  { id: 'c3', name: 'Dra. María Elena Garza', phone: '5533445566', points: 15, totalSpent: 300, visitsCount: 3, lastVisit: getTodayString() },
  { id: 'c4', name: 'Ing. Gabriel Torres', phone: '5544556677', points: 45, totalSpent: 900, visitsCount: 11, lastVisit: getTodayString() },
  { id: 'c5', name: 'Lucía Mendoza (Cafetería)', phone: '5555667788', points: 120, totalSpent: 2400, visitsCount: 20, lastVisit: getTodayString() },
];

export const INITIAL_ORDERS: BakeryOrder[] = [];

export const INITIAL_TICKETS: SaleTicket[] = [
  {
    id: 't-1001',
    folio: 'T-001001',
    timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
    date: getTodayString(),
    time: '08:30',
    items: [
      { id: 'i1', name: 'Pan Dulce $10', price: 10, quantity: 5, total: 50 },
      { id: 'i2', name: 'Bolillo $8', price: 8, quantity: 10, total: 80 },
    ],
    subtotal: 130,
    discount: 0,
    total: 130,
    paymentMethod: 'efectivo',
    amountPaid: 150,
    change: 20,
    customerName: 'Doña Carmen Ramírez',
    customerPhone: '5511223344',
    pointsEarned: 6,
    pointsRedeemed: 0,
    cashier: 'Mostrador 1'
  },
  {
    id: 't-1002',
    folio: 'T-001002',
    timestamp: new Date(Date.now() - 3600000 * 3).toISOString(),
    date: getTodayString(),
    time: '09:45',
    items: [
      { id: 'i3', name: 'Pastel 3 Leches $150', price: 150, quantity: 1, total: 150 },
      { id: 'i4', name: 'Cuerno $18', price: 18, quantity: 4, total: 72 },
    ],
    subtotal: 222,
    discount: 10,
    total: 212,
    paymentMethod: 'tarjeta',
    amountPaid: 212,
    change: 0,
    customerName: 'Sr. Roberto Vargas',
    customerPhone: '5522334455',
    pointsEarned: 10,
    pointsRedeemed: 10,
    cashier: 'Mostrador 1'
  },
  {
    id: 't-1003',
    folio: 'T-001003',
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
    date: getTodayString(),
    time: '11:15',
    items: [
      { id: 'i5', name: 'Pan Dulce $12', price: 12, quantity: 6, total: 72 },
      { id: 'i6', name: 'Orejas $20', price: 20, quantity: 3, total: 60 },
    ],
    subtotal: 132,
    discount: 0,
    total: 132,
    paymentMethod: 'efectivo',
    amountPaid: 200,
    change: 68,
    pointsEarned: 6,
    pointsRedeemed: 0,
    cashier: 'Mostrador 1'
  },
  {
    id: 't-1004',
    folio: 'T-001004',
    timestamp: new Date(Date.now() - 3600000 * 1).toISOString(),
    date: getTodayString(),
    time: '12:40',
    items: [
      { id: 'i7', name: 'Rosca Mediana $90', price: 90, quantity: 1, total: 90 },
      { id: 'i8', name: 'Panqué Nuez $25', price: 25, quantity: 2, total: 50 },
    ],
    subtotal: 140,
    discount: 0,
    total: 140,
    paymentMethod: 'tarjeta',
    amountPaid: 140,
    change: 0,
    customerName: 'Dra. María Elena Garza',
    customerPhone: '5533445566',
    pointsEarned: 7,
    pointsRedeemed: 0,
    cashier: 'Mostrador 1'
  }
];

// Storage keys
export const STORAGE_KEYS = {
  SETTINGS: 'santafe_settings_v1',
  PRODUCTS: 'santafe_products_v1',
  TICKETS: 'santafe_tickets_v1',
  CUSTOMERS: 'santafe_customers_v1',
  ORDERS: 'santafe_orders_v1',
  DRIVERS: 'santafe_drivers_v1',
  DRIVER_CUSTOMERS: 'santafe_driver_customers_v1',
  PRODUCTION_SHEET: 'santafe_production_sheet_v1',
  NEXT_TICKET_NUM: 'santafe_next_ticket_num_v1',
  NEXT_ORDER_NUM: 'santafe_next_order_num_v1',
  OUTFLOWS: 'santafe_outflows_v1',
  SHIFT_CUTS: 'santafe_shift_cuts_v1',
  NEXT_CUT_NUM: 'santafe_next_cut_num_v1',
  MASTER_CATALOG: 'santafe_master_catalog_v2',
  OPERATIONAL_EXPENSES: 'santafe_operational_expenses_v1',
  SUPPLIER_BILLS: 'santafe_supplier_bills_v1',
  SUPPLIER_BANK_PROFILES: 'santafe_supplier_bank_profiles_v1',
  VIP_CUSTOMERS: 'santafe_vip_customers_v1',
  VIP_ORDERS: 'santafe_vip_orders_v1'
};

export function loadMasterCatalog(): CatalogBreadItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MASTER_CATALOG);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error loading master catalog', e);
  }
  return REAL_BAKERY_CATALOG;
}

export function saveMasterCatalog(catalog: CatalogBreadItem[]): void {
  localStorage.setItem(STORAGE_KEYS.MASTER_CATALOG, JSON.stringify(catalog));
}

export function loadProductionSheet(): ProductionSheetRow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PRODUCTION_SHEET);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.error('Error loading production sheet', e);
  }
  return DEFAULT_PRODUCTION_SHEET;
}

export function saveProductionSheet(rows: ProductionSheetRow[]): void {
  localStorage.setItem(STORAGE_KEYS.PRODUCTION_SHEET, JSON.stringify(rows));
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate old default address/name/slogan if still present
      if (!parsed.bakeryName || parsed.bakeryName === 'Panadería Santa Fé' || parsed.bakeryName.includes('"El Refugio"')) {
        parsed.bakeryName = DEFAULT_SETTINGS.bakeryName;
      }
      if (!parsed.slogan || parsed.slogan.includes('Abierto') || parsed.slogan.includes('Tradición Artesanal')) {
        parsed.slogan = DEFAULT_SETTINGS.slogan;
      }
      if (!parsed.address || parsed.address.includes('Campo Real') || parsed.address.includes('Hidalgo')) {
        parsed.address = DEFAULT_SETTINGS.address;
      }
      if (!parsed.phone || parsed.phone.includes('1234')) {
        parsed.phone = DEFAULT_SETTINGS.phone;
      }
      if (parsed.quickPrices && Array.isArray(parsed.quickPrices)) {
        const originalLen = parsed.quickPrices.length;
        parsed.quickPrices = parsed.quickPrices.filter((p: number) => {
          const num = Number(p);
          return !(num >= 90 && num <= 100);
        });
        if (!parsed.quickPrices.some((p: number) => Number(p) === 8)) {
          parsed.quickPrices.push(8);
          parsed.quickPrices.sort((a: number, b: number) => a - b);
        }
        if (parsed.quickPrices.length !== originalLen || !parsed.quickPrices.includes(8)) {
          try {
            localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(parsed));
          } catch {
            // ignore
          }
        }
      }
      const merged = { ...DEFAULT_SETTINGS, ...parsed };
      if (!merged.mpDeviceId || merged.mpDeviceId.trim() === '') {
        merged.mpDeviceId = 'N950NCD500070018';
      }
      return merged;
    }
  } catch (e) {
    console.error('Error loading settings', e);
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
}

export function loadProducts(): BreadProduct[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    if (raw) {
      let stored: BreadProduct[] = JSON.parse(raw);
      const existingIds = new Set(stored.map(p => p.id));
      let updated = false;
      DEFAULT_PRODUCTS.forEach(dp => {
        if (!existingIds.has(dp.id)) {
          stored.push(dp);
          updated = true;
        }
      });
      // Asegurar que el producto p8 sea Dona Mini $8
      const p8Product = stored.find(p => p.id === 'p8');
      if (p8Product && !p8Product.name.toLowerCase().includes('dona mini')) {
        p8Product.name = 'Dona Mini $8';
        p8Product.category = 'Pan Dulce Tradicional';
        p8Product.isQuickPreset = true;
        updated = true;
      }
      if (updated) {
        localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(stored));
      }
      return stored;
    }
  } catch (e) {
    console.error('Error loading products', e);
  }
  return DEFAULT_PRODUCTS;
}

export function saveProducts(products: BreadProduct[]): void {
  localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
}

/**
 * Helper para combinar / fusionar listas de Tickets sin perder absolutamente ningún ticket ni venta.
 * Garantiza que ventas que ocurren en el mismo minuto o con segundos de diferencia nunca se sobrescriban.
 * Preserva cobros con tarjeta, folios y detalles de productos.
 */
export function mergeTickets(existing: SaleTicket[], incoming: SaleTicket[]): SaleTicket[] {
  const deleted = getDeletedTicketIds();
  const map = new Map<string, SaleTicket>();

  const getTicketKey = (t: SaleTicket): string => {
    // Si tiene un ID único válido, es la clave primaria inequívoca
    if (t.id && String(t.id).trim() !== '') {
      return `id:${String(t.id).trim()}`;
    }
    // Si tiene un folio único válido, usarlo como clave secundaria
    if (t.folio && String(t.folio).trim() !== '') {
      return `folio:${String(t.folio).trim()}`;
    }
    // Si no tiene ni ID ni folio (ticket antiguo o malformado), asignar ID único para JAMÁS fusionarlo ni perderlo
    const genId = `ticket-${t.timestamp ? new Date(t.timestamp).getTime() : Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    t.id = genId;
    return `id:${genId}`;
  };

  for (const t of existing || []) {
    if (!t) continue;
    if ((t.id && deleted.has(t.id)) || (t.folio && deleted.has(t.folio))) continue;
    const key = getTicketKey(t);
    map.set(key, t);
  }

  for (const t of incoming || []) {
    if (!t) continue;
    if ((t.id && deleted.has(t.id)) || (t.folio && deleted.has(t.folio))) continue;
    const key = getTicketKey(t);
    if (map.has(key)) {
      const prev = map.get(key)!;
      map.set(key, {
        ...prev,
        ...t,
        paymentMethod: t.paymentMethod || prev.paymentMethod,
        cardTerminal: t.cardTerminal || prev.cardTerminal,
        cardAuthCode: t.cardAuthCode || prev.cardAuthCode,
        cardLast4: t.cardLast4 || prev.cardLast4,
        cardReference: t.cardReference || prev.cardReference,
      });
    } else {
      map.set(key, t);
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const timeA = a.timestamp ? new Date(a.timestamp).getTime() : (a.date ? new Date(`${a.date}T${a.time || '00:00:00'}`).getTime() : 0);
    const timeB = b.timestamp ? new Date(b.timestamp).getTime() : (b.date ? new Date(`${b.date}T${b.time || '00:00:00'}`).getTime() : 0);
    const validA = isNaN(timeA) ? 0 : timeA;
    const validB = isNaN(timeB) ? 0 : timeB;
    if (validA !== validB) return validB - validA;
    return (b.folio || b.id || '').localeCompare(a.folio || a.id || '');
  });
}

export const DELETED_ORDERS_KEY = 'santafe_deleted_orders_ids_v1';
export const DELETED_TICKETS_KEY = 'santafe_deleted_tickets_ids_v1';
export const DELETED_EXPENSES_KEY = 'santafe_deleted_expenses_ids_v1';
export const DELETED_BILLS_KEY = 'santafe_deleted_bills_ids_v1';
export const DELETED_VIP_CUSTOMERS_KEY = 'santafe_deleted_vip_customers_ids_v1';
export const DELETED_VIP_ORDERS_KEY = 'santafe_deleted_vip_orders_ids_v1';

function getDeletedSet(storageKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch {
    // ignore
  }
  return new Set();
}

function addDeletedToSet(storageKey: string, ids: Array<string | undefined>): void {
  try {
    const set = getDeletedSet(storageKey);
    ids.forEach((id) => {
      if (id && String(id).trim() !== '') set.add(String(id).trim());
    });
    const arr = Array.from(set);
    // Limitar a últimos 1000 IDs para no saturar localStorage
    const trimmed = arr.length > 1000 ? arr.slice(arr.length - 1000) : arr;
    localStorage.setItem(storageKey, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
}

export function getDeletedOrderIds(): Set<string> {
  return getDeletedSet(DELETED_ORDERS_KEY);
}

export function markOrderAsDeleted(orderId: string, folio?: string): void {
  addDeletedToSet(DELETED_ORDERS_KEY, [orderId, folio]);
}

export function getDeletedTicketIds(): Set<string> {
  return getDeletedSet(DELETED_TICKETS_KEY);
}

export function markTicketAsDeleted(ticketId: string, folio?: string): void {
  addDeletedToSet(DELETED_TICKETS_KEY, [ticketId, folio]);
}

export function getDeletedOperationalExpenseIds(): Set<string> {
  return getDeletedSet(DELETED_EXPENSES_KEY);
}

export function markOperationalExpenseAsDeleted(expenseId: string): void {
  addDeletedToSet(DELETED_EXPENSES_KEY, [expenseId]);
}

export function getDeletedSupplierBillIds(): Set<string> {
  return getDeletedSet(DELETED_BILLS_KEY);
}

export function markSupplierBillAsDeleted(billId: string): void {
  addDeletedToSet(DELETED_BILLS_KEY, [billId]);
}

export function getDeletedVipCustomerIds(): Set<string> {
  return getDeletedSet(DELETED_VIP_CUSTOMERS_KEY);
}

export function markVipCustomerAsDeleted(customerId: string): void {
  addDeletedToSet(DELETED_VIP_CUSTOMERS_KEY, [customerId]);
}

export function getDeletedVipOrderIds(): Set<string> {
  return getDeletedSet(DELETED_VIP_ORDERS_KEY);
}

export function markVipOrderAsDeleted(orderId: string): void {
  addDeletedToSet(DELETED_VIP_ORDERS_KEY, [orderId]);
}

/**
 * Helper para combinar / fusionar Pedidos sin perder cobros ni adelantos.
 */
export function mergeOrders(existing: BakeryOrder[], incoming: BakeryOrder[]): BakeryOrder[] {
  const deleted = getDeletedOrderIds();
  const map = new Map<string, BakeryOrder>();
  for (const o of existing || []) {
    if (o && (o.id || o.folio)) {
      if (deleted.has(o.id) || (o.folio && deleted.has(o.folio))) continue;
      map.set(o.id || o.folio, o);
    }
  }
  for (const o of incoming || []) {
    if (!o) continue;
    const key = o.id || o.folio;
    if (!key) continue;
    if (deleted.has(o.id) || (o.folio && deleted.has(o.folio))) continue;
    if (map.has(key)) {
      const prev = map.get(key)!;
      const deliveryStatus = (o.deliveryStatus === 'entregado' || prev.deliveryStatus === 'entregado')
        ? 'entregado'
        : (o.deliveryStatus || prev.deliveryStatus);
      const paymentStatus = (o.paymentStatus === 'pagado' || prev.paymentStatus === 'pagado')
        ? 'pagado'
        : (o.paymentStatus || prev.paymentStatus);
      
      const collectedAmount = Math.max(o.collectedAmount || 0, prev.collectedAmount || 0);
      const deposit = Math.max(o.deposit || 0, prev.deposit || 0);
      const effectiveTotal = o.total !== undefined ? o.total : prev.total;
      const pendingAmount = paymentStatus === 'pagado' 
        ? 0 
        : (o.pendingAmount !== undefined ? o.pendingAmount : Math.max(0, effectiveTotal - deposit - collectedAmount));

      map.set(key, {
        ...prev,
        ...o,
        deliveryStatus,
        paymentStatus,
        collectedAmount,
        deposit,
        pendingAmount: Math.max(0, pendingAmount),
        deliveredAt: o.deliveredAt || prev.deliveredAt
      });
    } else {
      map.set(key, o);
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const dateA = a.deliveryDate || a.createdAt || '';
    const dateB = b.deliveryDate || b.createdAt || '';
    return dateB.localeCompare(dateA);
  });
}

/**
 * Helper para combinar Cortes de Turno
 */
export function mergeShiftCuts(existing: ShiftCutRecord[], incoming: ShiftCutRecord[]): ShiftCutRecord[] {
  const map = new Map<string, ShiftCutRecord>();
  for (const c of existing || []) {
    if (!c) continue;
    const key = c.id || c.folio || `${c.date}_${c.shiftName}`;
    map.set(key, c);
  }
  for (const c of incoming || []) {
    if (!c) continue;
    const key = c.id || c.folio || `${c.date}_${c.shiftName}`;
    map.set(key, { ...(map.get(key) || {}), ...c });
  }
  return Array.from(map.values()).sort((a, b) => {
    const timeA = new Date(a.createdAt || `${a.date}T${a.time || '00:00'}`).getTime();
    const timeB = new Date(b.createdAt || `${b.date}T${b.time || '00:00'}`).getTime();
    return timeB - timeA;
  });
}

/**
 * Helper para combinar Salidas de Dinero
 */
export function mergeOutflows(existing: CashOutflowItem[], incoming: CashOutflowItem[]): CashOutflowItem[] {
  const map = new Map<string, CashOutflowItem>();
  for (const o of existing || []) {
    if (o?.id) map.set(o.id, o);
  }
  for (const o of incoming || []) {
    if (o?.id) map.set(o.id, { ...(map.get(o.id) || {}), ...o });
  }
  return Array.from(map.values()).sort((a, b) => {
    return (b.time || '').localeCompare(a.time || '');
  });
}

/**
 * Helper para combinar Clientes
 */
export function mergeCustomers(existing: Customer[], incoming: Customer[]): Customer[] {
  const map = new Map<string, Customer>();
  for (const c of existing || []) {
    if (!c) continue;
    const key = c.phone || c.id;
    if (key) map.set(key, c);
  }
  for (const c of incoming || []) {
    if (!c) continue;
    const key = c.phone || c.id;
    if (!key) continue;
    if (map.has(key)) {
      const prev = map.get(key)!;
      map.set(key, {
        ...prev,
        ...c,
        points: Math.max(c.points || 0, prev.points || 0),
        totalSpent: Math.max(c.totalSpent || 0, prev.totalSpent || 0),
        visitsCount: Math.max(c.visitsCount || 0, prev.visitsCount || 0)
      });
    } else {
      map.set(key, c);
    }
  }
  return Array.from(map.values());
}

export function loadTickets(): SaleTicket[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TICKETS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Garantizar que cada ticket cargado tenga un ID único y no haya duplicados
        const map = new Map<string, SaleTicket>();
        parsed.forEach((t, idx) => {
          if (!t) return;
          const id = t.id && String(t.id).trim() !== '' 
            ? String(t.id).trim() 
            : `ticket-${t.date || 'd'}-${t.folio || idx}`;
          const folio = t.folio && String(t.folio).trim() !== ''
            ? String(t.folio).trim()
            : `T-${String(1000 + idx).padStart(6, '0')}`;
          const cleanTicket = {
            ...t,
            id,
            folio
          };
          if (!map.has(id)) {
            map.set(id, cleanTicket);
          }
        });
        return Array.from(map.values());
      }
    }
  } catch (e) {
    console.error('Error loading tickets', e);
  }
  return INITIAL_TICKETS;
}

/**
 * Guarda tickets COMBINANDO (merging) con los existentes en vez de sobrescribirlos
 */
export function saveTickets(tickets: SaleTicket[], forceOverwrite: boolean = false): void {
  try {
    if (forceOverwrite) {
      localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(tickets));
      return;
    }
    const current = loadTickets();
    const merged = mergeTickets(current, tickets);
    localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(merged));
  } catch (e) {
    console.error('Error guardando tickets combinados', e);
    localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(tickets));
  }
}

export function loadCustomers(): Customer[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CUSTOMERS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading customers', e);
  }
  return INITIAL_CUSTOMERS;
}

/**
 * Guarda clientes COMBINANDO con los existentes
 */
export function saveCustomers(customers: Customer[], forceOverwrite: boolean = false): void {
  try {
    if (forceOverwrite) {
      localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
      return;
    }
    const current = loadCustomers();
    const merged = mergeCustomers(current, customers);
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(merged));
  } catch (e) {
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
  }
}

export function loadOrders(): BakeryOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ORDERS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const deleted = getDeletedOrderIds();
        return parsed.filter((o: BakeryOrder) => 
          o && (o.id || o.folio) &&
          !deleted.has(o.id) &&
          !(o.folio && deleted.has(o.folio))
        );
      }
    }
  } catch (e) {
    console.error('Error loading orders', e);
  }
  return [];
}

export function clearAllOrders(): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify([]));
  } catch (e) {
    console.error('Error clearing orders', e);
  }
}

/**
 * Guarda pedidos. Por defecto sobreescribe (forceOverwrite = true) para asegurar
 * que las eliminaciones sean 100% reales y no revivan pedidos borrados.
 */
export function saveOrders(orders: BakeryOrder[], forceOverwrite: boolean = true): void {
  try {
    if (forceOverwrite) {
      localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
      return;
    }
    const current = loadOrders();
    const merged = mergeOrders(current, orders);
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(merged));
  } catch (e) {
    console.error('Error guardando pedidos', e);
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
  }
}

/**
 * Elimina permanentemente un pedido en almacenamiento local y registra su lápida (tombstone)
 * para evitar que sincronizaciones en segundo plano lo revivan.
 */
export function deleteOrderLocally(orderId: string, folio?: string): BakeryOrder[] {
  markOrderAsDeleted(orderId, folio);
  const current = loadOrders();
  const updated = current.filter(o => o.id !== orderId && (!folio || o.folio !== folio));
  saveOrders(updated, true);
  return updated;
}

export function loadDrivers(): Driver[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DRIVERS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading drivers', e);
  }
  return DEFAULT_DRIVERS;
}

export function saveDrivers(drivers: Driver[]): void {
  localStorage.setItem(STORAGE_KEYS.DRIVERS, JSON.stringify(drivers));
}

export const DAILY_DELIVERY_PREFIX = 'santafe_daily_delivery_';
export const DELETED_DELIVERIES_KEY = 'santafe_deleted_deliveries_v1';

export function getDeletedDeliveryKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_DELIVERIES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch {}
  return new Set();
}

export function markDeliveryAsDeleted(dateStr: string, shift: 'madrugada' | 'manana' | 'tarde', clientId: string): void {
  try {
    const set = getDeletedDeliveryKeys();
    set.add(`${dateStr}_${shift}_${clientId}`);
    localStorage.setItem(DELETED_DELIVERIES_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

export function unmarkDeliveryAsDeleted(dateStr: string, shift: 'madrugada' | 'manana' | 'tarde', clientId: string): void {
  try {
    const set = getDeletedDeliveryKeys();
    const key = `${dateStr}_${shift}_${clientId}`;
    if (set.has(key)) {
      set.delete(key);
      localStorage.setItem(DELETED_DELIVERIES_KEY, JSON.stringify(Array.from(set)));
    }
  } catch {}
}

export function isDeliveryMarkedDeleted(dateStr: string, shift: 'madrugada' | 'manana' | 'tarde', clientId: string): boolean {
  const set = getDeletedDeliveryKeys();
  return set.has(`${dateStr}_${shift}_${clientId}`);
}

export function getDailyDeliverySheet(
  dateStr: string,
  shift: 'madrugada' | 'manana' | 'tarde' = 'manana'
): Record<string, { [breadName: string]: number }> {
  try {
    const key = shift === 'tarde' 
      ? `${DAILY_DELIVERY_PREFIX}${dateStr}_tarde` 
      : shift === 'madrugada'
      ? `${DAILY_DELIVERY_PREFIX}${dateStr}_madrugada`
      : `${DAILY_DELIVERY_PREFIX}${dateStr}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, { [breadName: string]: number }>;
      const deletedSet = getDeletedDeliveryKeys();
      const filtered: Record<string, { [breadName: string]: number }> = {};
      for (const [clientId, breads] of Object.entries(parsed || {})) {
        const hasActiveBreads = Object.values(breads || {}).some(q => Number(q) > 0);
        if (deletedSet.has(`${dateStr}_${shift}_${clientId}`)) {
          if (!hasActiveBreads) {
            continue; // Ignorar clientes sin piezas marcados como eliminados
          }
          // Si tiene piezas cargadas en la base de datos, limpiar la lápida
          unmarkDeliveryAsDeleted(dateStr, shift, clientId);
        }
        filtered[clientId] = breads;
      }
      return filtered;
    }
  } catch (e) {
    console.error('Error loading daily delivery sheet', e);
  }
  return {};
}

export function mergeDailyDeliverySheets(
  local: Record<string, { [breadName: string]: number }>,
  remote: Record<string, { [breadName: string]: number }>,
  dateStr?: string,
  shift?: 'madrugada' | 'manana' | 'tarde'
): Record<string, { [breadName: string]: number }> {
  const deletedSet = getDeletedDeliveryKeys();
  const merged: Record<string, { [breadName: string]: number }> = {};

  for (const [clientId, breads] of Object.entries(local || {})) {
    const hasActiveBreads = Object.values(breads || {}).some(q => Number(q) > 0);
    if (dateStr && shift && deletedSet.has(`${dateStr}_${shift}_${clientId}`) && !hasActiveBreads) continue;
    merged[clientId] = { ...breads };
  }

  for (const [clientId, breads] of Object.entries(remote || {})) {
    const hasActiveBreads = Object.values(breads || {}).some(q => Number(q) > 0);
    if (dateStr && shift && deletedSet.has(`${dateStr}_${shift}_${clientId}`)) {
      if (!hasActiveBreads) continue;
      unmarkDeliveryAsDeleted(dateStr, shift, clientId);
    }
    if (!merged[clientId]) {
      merged[clientId] = { ...breads };
    } else {
      merged[clientId] = { ...merged[clientId], ...breads };
    }
  }
  return merged;
}

export function saveDailyDeliverySheet(
  dateStr: string,
  data: Record<string, { [breadName: string]: number }>,
  shift: 'madrugada' | 'manana' | 'tarde' = 'manana'
): void {
  try {
    const key = shift === 'tarde' 
      ? `${DAILY_DELIVERY_PREFIX}${dateStr}_tarde` 
      : shift === 'madrugada'
      ? `${DAILY_DELIVERY_PREFIX}${dateStr}_madrugada`
      : `${DAILY_DELIVERY_PREFIX}${dateStr}`;
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error('Error saving daily delivery sheet', e);
  }
}

export const DELIVERY_RUN_META_PREFIX = 'santafe_delivery_run_meta_';

export function loadDeliveryRunMeta(
  dateStr: string,
  shift: 'madrugada' | 'manana' | 'tarde' = 'manana'
): Record<string, DeliveryRunMetadata> {
  try {
    const key = `${DELIVERY_RUN_META_PREFIX}${dateStr}_${shift}`;
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading delivery run meta', e);
  }
  return {};
}

export function saveDeliveryRunMeta(
  dateStr: string,
  shift: 'madrugada' | 'manana' | 'tarde',
  meta: Record<string, DeliveryRunMetadata>
): void {
  try {
    const key = `${DELIVERY_RUN_META_PREFIX}${dateStr}_${shift}`;
    localStorage.setItem(key, JSON.stringify(meta));
  } catch (e) {
    console.error('Error saving delivery run meta', e);
  }
}

export function getDailyDeliveryPiecesCount(
  dateStr: string,
  shift: 'madrugada' | 'manana' | 'tarde'
): number {
  const data = getDailyDeliverySheet(dateStr, shift);
  let total = 0;
  Object.values(data).forEach(clientObj => {
    Object.values(clientObj || {}).forEach(q => {
      total += (q || 0);
    });
  });
  return total;
}

export function loadDriverCustomers(): DriverCustomer[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DRIVER_CUSTOMERS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Garantizar unicidad estricta por ID
        const customerMap = new Map<string, DriverCustomer>();
        parsed.forEach((c: DriverCustomer) => {
          if (!c || !c.id) return;
          const normalized = c.name === 'Tarascos' ? { ...c, name: 'Trascos' } : c;
          if (!customerMap.has(c.id)) {
            customerMap.set(c.id, normalized);
          } else {
            customerMap.set(c.id, { ...customerMap.get(c.id)!, ...normalized });
          }
        });

        const hasHopeWash = Array.from(customerMap.values()).some((c: DriverCustomer) => c.name.toLowerCase().includes('hope wash'));
        const hasItemsArray = Array.from(customerMap.values()).some((c: DriverCustomer) => Array.isArray(c.items) && c.items.length > 0);
        const hasLaDra = customerMap.has('dc_sim_ladra') || Array.from(customerMap.values()).some((c: DriverCustomer) => c.name.toLowerCase().includes('la dra'));
        
        if (!hasHopeWash || !hasItemsArray || !hasLaDra) {
          DEFAULT_DRIVER_CUSTOMERS.forEach((dc: DriverCustomer) => {
            if (!customerMap.has(dc.id)) {
              customerMap.set(dc.id, dc);
            }
          });
        }

        const result = Array.from(customerMap.values());
        saveDriverCustomers(result);
        return result;
      }
    }
  } catch (e) {
    console.error('Error loading driver customers', e);
  }
  saveDriverCustomers(DEFAULT_DRIVER_CUSTOMERS);
  return DEFAULT_DRIVER_CUSTOMERS;
}

export function saveDriverCustomers(customers: DriverCustomer[]): void {
  localStorage.setItem(STORAGE_KEYS.DRIVER_CUSTOMERS, JSON.stringify(customers));
}

export function getNextTicketFolio(existingTickets?: SaleTicket[], branch: BranchId = 'refugio'): string {
  const isZakia = branch === 'zakia';
  const prefix = isZakia ? 'Z-' : 'T-';
  const storageKey = isZakia ? 'santafe_next_ticket_num_zakia' : STORAGE_KEYS.NEXT_TICKET_NUM;
  let num = isZakia ? 101 : 1005;
  try {
    const current = localStorage.getItem(storageKey);
    if (current) {
      const parsed = parseInt(current, 10);
      if (!isNaN(parsed) && parsed > 0) {
        num = parsed;
      }
    }
  } catch {
    // fallback
  }

  // Verificar con los tickets existentes de la sucursal para nunca repetir un folio
  try {
    const checkList = existingTickets || loadTickets();
    if (Array.isArray(checkList) && checkList.length > 0) {
      for (const t of checkList) {
        if (!t || typeof t.folio !== 'string') continue;
        const tBranch = t.branch || 'refugio';
        if (tBranch !== (isZakia ? 'zakia' : 'refugio')) continue;

        if (t.folio.startsWith(prefix)) {
          const folioNum = parseInt(t.folio.replace(prefix, ''), 10);
          if (!isNaN(folioNum) && folioNum >= num) {
            num = folioNum + 1;
          }
        }
      }
    }
  } catch {
    // ignore
  }

  localStorage.setItem(storageKey, (num + 1).toString());
  return `${prefix}${String(num).padStart(6, '0')}`;
}

export function getNextOrderFolio(): string {
  let num = 106;
  try {
    const current = localStorage.getItem(STORAGE_KEYS.NEXT_ORDER_NUM);
    if (current) {
      num = parseInt(current, 10);
    }
  } catch {
    // fallback
  }
  localStorage.setItem(STORAGE_KEYS.NEXT_ORDER_NUM, (num + 1).toString());
  return `PED-${String(num).padStart(4, '0')}`;
}

export function getNextShiftCutFolio(branch: BranchId = 'refugio'): string {
  const isZakia = branch === 'zakia';
  const storageKey = isZakia ? 'santafe_next_cut_num_zakia' : 'santafe_next_cut_num_refugio';
  const prefix = isZakia ? 'CORTE-Z' : 'CORTE-R';
  let num = 101;
  try {
    const current = localStorage.getItem(storageKey) || (!isZakia ? localStorage.getItem(STORAGE_KEYS.NEXT_CUT_NUM) : null);
    if (current) {
      num = parseInt(current, 10);
    }
  } catch {
    // fallback
  }
  localStorage.setItem(storageKey, (num + 1).toString());
  return `${prefix}-${String(num).padStart(4, '0')}`;
}

export function loadOutflows(): CashOutflowItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.OUTFLOWS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading outflows', e);
  }
  return [];
}

/**
 * Guarda salidas COMBINANDO con las existentes
 */
export function saveOutflows(outflows: CashOutflowItem[], forceOverwrite: boolean = false): void {
  try {
    if (forceOverwrite) {
      localStorage.setItem(STORAGE_KEYS.OUTFLOWS, JSON.stringify(outflows));
      return;
    }
    const current = loadOutflows();
    const merged = mergeOutflows(current, outflows);
    localStorage.setItem(STORAGE_KEYS.OUTFLOWS, JSON.stringify(merged));
  } catch (e) {
    localStorage.setItem(STORAGE_KEYS.OUTFLOWS, JSON.stringify(outflows));
  }
}

export function loadShiftCuts(): ShiftCutRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SHIFT_CUTS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading shift cuts', e);
  }
  return [];
}

/**
 * Guarda cortes COMBINANDO con los existentes en vez de sobrescribirlos
 */
export function saveShiftCuts(cuts: ShiftCutRecord[], forceOverwrite: boolean = false): void {
  try {
    if (forceOverwrite) {
      localStorage.setItem(STORAGE_KEYS.SHIFT_CUTS, JSON.stringify(cuts));
      return;
    }
    const current = loadShiftCuts();
    const merged = mergeShiftCuts(current, cuts);
    localStorage.setItem(STORAGE_KEYS.SHIFT_CUTS, JSON.stringify(merged));
  } catch (e) {
    localStorage.setItem(STORAGE_KEYS.SHIFT_CUTS, JSON.stringify(cuts));
  }
  try {
    window.dispatchEvent(new CustomEvent('shiftCutsUpdated'));
  } catch (_) {}
}

// Generate formatted WhatsApp message for Shift Cut
export function generateShiftCutWhatsAppMessage(cut: ShiftCutRecord, settings: Settings, isBlindAudit: boolean = false): string {
  const outflowsText = cut.outflows && cut.outflows.length > 0
    ? cut.outflows.map(o => `  • ${o.concept}: -$${o.amount}.00 (${o.time || ''})`).join('\n')
    : '  (Sin salidas registradas)';

  const expectedBag = cut.expectedInBag !== undefined 
    ? cut.expectedInBag 
    : (cut.totalCashSales - cut.totalOutflows);
  const actualBag = cut.actualInBag !== undefined 
    ? cut.actualInBag 
    : (cut.actualCashInDrawer ?? cut.cashToDeliver ?? expectedBag);
  const bagDiff = cut.bagDifference !== undefined 
    ? cut.bagDifference 
    : (cut.difference || (actualBag - expectedBag));

  let text = `🥖 *${settings.bakeryName}* 🥖\n`;
  if (isBlindAudit) {
    text += `📋 *ENTREGA DE TURNO (CONTEO CIEGO):* ${cut.folio}\n`;
  } else {
    text += `📊 *CORTE DE CAJA / TURNO:* ${cut.folio}\n`;
  }
  text += `👤 *Cajero(a):* ${cut.cashierName}\n`;
  text += `🕒 *Turno:* ${cut.shiftName}\n`;
  text += `📅 *Fecha:* ${cut.date} | *Hora:* ${cut.time}\n`;
  text += `================================\n`;
  if (isBlindAudit) {
    text += `💰 *DECLARACIÓN DE EFECTIVO Y SALIDAS (CONTEO CIEGO):*\n`;
    text += `• Pago con Tarjeta en Terminal: $${cut.totalCardSales}.00\n`;
    if (cut.totalOutflows > 0) {
      text += `• (-) Salidas Pagadas: -$${cut.totalOutflows}.00\n`;
    }
    text += `--------------------------------\n`;
    text += `💵 *EFECTIVO CONTADO EN CAJA:* *$${actualBag}.00*\n`;
    text += `🔒 _(El cuadre contra ventas, faltantes o sobrantes se analiza exclusivamente en Historial)_\n`;
  } else {
    text += `💰 *CRUCE DE BOLSITA (TENÍA QUE PONERSE VS REALMENTE QUEDÓ):*\n`;
    text += `• Total Ventas Sistema: *$${cut.totalGrossSales}.00*\n`;
    text += `• Pago con Tarjeta: $${cut.totalCardSales}.00${cut.isCardManualOverride ? ' (Manual)' : ''}\n`;
    if (cut.shift1CardDeduction && cut.shift1CardDeduction > 0) {
      const rawTerm = cut.rawCardTerminalTotal || (cut.totalCardSales + cut.shift1CardDeduction);
      text += `   _(Terminal: $${rawTerm}.00 - T1: $${cut.shift1CardDeduction}.00 = Neto T2: $${cut.totalCardSales}.00)_\n`;
    }
    text += `• Ventas en Efectivo: +$${cut.totalCashSales}.00\n`;
    text += `• (-) Salidas Pagadas: -$${cut.totalOutflows}.00\n`;
    text += `• Fondo Cambio en Caja: $${cut.nextShiftCash !== undefined ? cut.nextShiftCash : 1000}.00\n`;
    text += `--------------------------------\n`;
    text += `📦 *1. Tenía que ponerse en bolsita:* $${expectedBag}.00\n`;
    text += `💵 *2. Realmente quedó (contado):* $${actualBag}.00\n`;
    if (bagDiff === 0) {
      text += `⚖️ *3. Cruce / Diferencia bolsita:* ✅ CUADRADA ($0.00)\n`;
    } else if (bagDiff > 0) {
      text += `⚖️ *3. Cruce / Diferencia bolsita:* 🟢 SOBRANTE: +$${bagDiff}.00\n`;
    } else {
      text += `⚖️ *3. Cruce / Diferencia bolsita:* 🔴 FALTANTE: -$${Math.abs(bagDiff)}.00\n`;
    }
    text += `👉 *TOTAL A ENTREGAR EN BOLSITA: $${actualBag}.00*\n`;
    text += `ℹ️ _(Quedan $${cut.nextShiftCash !== undefined ? cut.nextShiftCash : 1000}.00 en el cajón para cambio)_\n`;
  }
  text += `================================\n`;
  text += `🍞 *DESGLOSE DE LO VENDIDO:*\n`;
  text += `• Venta de Pan: $${cut.totalBreadSales !== undefined ? cut.totalBreadSales : cut.totalGrossSales}.00 (${cut.breadPieces || 0} pzs)\n`;
  text += `• No Pan / Otros: $${cut.totalNonBreadSales || 0}.00 (${cut.nonBreadPieces || 0} arts)\n`;
  if (cut.nonBreadItems && cut.nonBreadItems.length > 0) {
    cut.nonBreadItems.forEach(item => {
      text += `    • ${item.name} (${item.quantity} pz): $${item.total}.00\n`;
    });
  }
  text += `• Total Piezas: ${cut.totalPieces} pzs | Tickets: ${cut.ticketsCount}\n`;
  text += `--------------------------------\n`;
  text += `📤 *DETALLE DE SALIDAS / PAGOS:*\n`;
  text += `${outflowsText}\n`;
  text += `• Total Salidas: *-$${cut.totalOutflows}.00*\n`;

  if (cut.nextShiftBillsBreakdown && Object.values(cut.nextShiftBillsBreakdown).some(v => Number(v) > 0)) {
    text += `--------------------------------\n`;
    text += `💵 *Billetes Cambio en Caja:*\n`;
    Object.entries(cut.nextShiftBillsBreakdown)
      .filter(([_, count]) => Number(count) > 0)
      .forEach(([denom, count]) => {
        text += `  • ${count} x $${denom} = $${Number(denom) * Number(count)}.00\n`;
      });
  }

  if (cut.notes) {
    text += `--------------------------------\n`;
    text += `📝 Observaciones: ${cut.notes}\n`;
  }
  text += `\n_${settings.ticketFooter}_`;

  return encodeURIComponent(text);
}

// Generate formatted WhatsApp message for Ticket
export function generateTicketWhatsAppMessage(ticket: SaleTicket, settings: Settings, customerPointsBalance?: number): string {
  const itemsText = ticket.items
    .map(it => `• ${it.quantity}x $${it.price} = $${it.total} pesos (${it.name})`)
    .join('\n');

  let text = `🥖 *${settings.bakeryName}* 🥖\n`;
  text += `_${settings.slogan}_\n`;
  text += `📍 ${settings.address}\n`;
  text += `📞 Tel: ${settings.phone}\n`;
  text += `--------------------------------\n`;
  text += `🧾 *TICKET:* ${ticket.folio}\n`;
  text += `📅 Fecha: ${ticket.date}  🕒 Hora: ${ticket.time}\n`;
  if (ticket.customerName) {
    text += `👤 Cliente: ${ticket.customerName}\n`;
  }
  text += `--------------------------------\n`;
  text += `*DETALLE DE COMPRA:*\n`;
  text += `${itemsText}\n`;
  text += `--------------------------------\n`;
  text += `Subtotal: $${ticket.subtotal.toFixed(2)}\n`;
  if (ticket.discount > 0) {
    const descLabel = ticket.pointsRedeemed && ticket.pointsRedeemed > 0 
      ? 'Descuento (Puntos)' 
      : 'Descuento Especial (10%)';
    text += `${descLabel}: -$${ticket.discount.toFixed(2)}\n`;
  }
  text += `*TOTAL PAGADO: $${ticket.total.toFixed(2)}*\n`;
  text += `Método: ${ticket.paymentMethod === 'efectivo' ? '💵 Efectivo' : '💳 Tarjeta'}\n`;
  if (ticket.paymentMethod === 'efectivo' && ticket.amountPaid > 0) {
    text += `Pagó con: $${ticket.amountPaid}.00 | Cambio: $${ticket.change}.00\n`;
  }
  text += `--------------------------------\n`;
  text += `⭐ *PUNTOS DE LEALTAD:*\n`;
  text += `+ Puntos ganados hoy: +${ticket.pointsEarned} pts ($${ticket.pointsEarned} pesos)\n`;
  if (customerPointsBalance !== undefined) {
    text += `🪙 Saldo actual disponible: *${customerPointsBalance} puntos ($${customerPointsBalance} pesos)*\n`;
  }
  text += `\n_${settings.ticketFooter}_\n`;

  return encodeURIComponent(text);
}

// Generate formatted WhatsApp message for Bakery Order
export function generateOrderWhatsAppMessage(order: BakeryOrder, settings: Settings): string {
  const itemsText = order.items
    .map(it => `• ${it.quantity}x ${it.name} ($${it.unitPrice} c/u) = $${it.total}`)
    .join('\n');

  let text = `🥖 *${settings.bakeryName} - CONFIRMACIÓN DE PEDIDO* 🥖\n`;
  text += `--------------------------------\n`;
  text += `📋 *FOLIO:* ${order.folio}\n`;
  text += `👤 Cliente: ${order.customerName}\n`;
  text += `📅 *Fecha de Entrega:* ${order.deliveryDate}\n`;
  text += `⏰ *Hora Estimada:* ${order.deliveryTime}\n`;
  text += `📍 *Modalidad:* ${order.deliveryType === 'domicilio' ? `🛵 Entrega a Domicilio: ${order.address}` : '🏬 Pide y Recoge en Tienda'}\n`;
  text += `--------------------------------\n`;
  text += `*PRODUCTOS SOLICITADOS:*\n`;
  text += `${itemsText}\n`;
  text += `--------------------------------\n`;
  text += `*TOTAL DEL PEDIDO: $${order.total}.00*\n`;
  text += `Anticipo recibido: $${order.deposit}.00\n`;
  text += `*SALDO PENDIENTE A LIQUIDAR: $${order.pendingAmount}.00*\n`;
  if (order.notes) {
    text += `📝 *Nota:* ${order.notes}\n`;
  }
  text += `\n_${settings.ticketFooter}_`;

  return encodeURIComponent(text);
}

// ==========================================
// MÓDULO DE GASTOS OPERATIVOS Y PROVEEDORES (EL REFUGIO Y ZAKIA)
// ==========================================

export const DEFAULT_EXPENSE_TEMPLATES_REFUGIO: RecurringExpenseTemplate[] = [
  { orderNumber: 1, id: 'exp_1', concept: 'Nómina Operativa Semanal', category: 'nomina', categoryLabel: 'Mano de Obra y Cargas', weeklyAmount: 50000, monthlyAmount: 217143, percent: 35.1, frequency: 'semanal', branch: 'refugio', recipient: 'Personal Operativo', description: 'Nómina completa de producción intensiva, maestros panaderos, reparto y cajas.' },
  { orderNumber: 2, id: 'exp_2', concept: 'Dialpa', category: 'materia_prima', categoryLabel: 'Materia Prima e Insumos', weeklyAmount: 38000, monthlyAmount: 165029, percent: 26.7, frequency: 'semanal', branch: 'refugio', recipient: 'Dialpa Harinas', description: 'Harinas de alta graduación, polvos y mezclas base de la matriz.' },
  { orderNumber: 3, id: 'exp_3', concept: 'Renta de Local Comercial', category: 'renta', categoryLabel: 'Instalaciones y Servicios', weeklyAmount: 8800, monthlyAmount: 38217, percent: 6.2, frequency: 'mensual', branch: 'refugio', recipient: 'Arrendamiento Plaza El Refugio', description: 'Arrendamiento de local matriz con alta afluencia peatonal en El Refugio. Pago único mensual.' },
  { orderNumber: 4, id: 'exp_4', concept: 'Cremeria americana', category: 'materia_prima', categoryLabel: 'Materia Prima e Insumos', weeklyAmount: 6000, monthlyAmount: 26057, percent: 4.2, frequency: 'semanal', branch: 'refugio', recipient: 'Cremería Americana', description: 'Cremas para batir, bases pasteleras y rellenos lácteos.' },
  { orderNumber: 5, id: 'exp_5', concept: 'Gas LP para Hornos de Panadería', category: 'servicios', categoryLabel: 'Instalaciones y Servicios', weeklyAmount: 5000, monthlyAmount: 21714, percent: 3.5, frequency: 'semanal', branch: 'refugio', recipient: 'Gas LP Hornos', description: 'Gas LP industrial para hornos de alta capacidad que alimentan producción propia y reparto.' },
  { orderNumber: 6, id: 'exp_6', concept: 'Mantequilla', category: 'materia_prima', categoryLabel: 'Materia Prima e Insumos', weeklyAmount: 4200, monthlyAmount: 18240, percent: 3.0, frequency: 'semanal', branch: 'refugio', recipient: 'Distribuidor Mantequilla', description: 'Mantequilla pura de exportación para hojaldre y línea europea.' },
  { orderNumber: 7, id: 'exp_7', concept: 'Huevo', category: 'materia_prima', categoryLabel: 'Materia Prima e Insumos', weeklyAmount: 4000, monthlyAmount: 17371, percent: 2.8, frequency: 'semanal', branch: 'refugio', recipient: 'Granja Huevo', description: 'Consumo diario de huevo fresco para volumen de pan dulce y salado.' },
  { orderNumber: 8, id: 'exp_8', concept: 'Materia Prima el Trigal', category: 'materia_prima', categoryLabel: 'Materia Prima e Insumos', weeklyAmount: 3500, monthlyAmount: 15200, percent: 2.5, frequency: 'semanal', branch: 'refugio', recipient: 'El Trigal Repostería', description: 'Frutas en almíbar, azúcares especiales y coberturas de repostería.' },
  { orderNumber: 9, id: 'exp_9', concept: 'Quesos', category: 'materia_prima', categoryLabel: 'Materia Prima e Insumos', weeklyAmount: 3500, monthlyAmount: 15200, percent: 2.5, frequency: 'semanal', branch: 'refugio', recipient: 'Quesos Querétaro', description: 'Quesos finos para línea gourmet y baguettes.' },
  { orderNumber: 10, id: 'exp_10', concept: 'Gasolinas para Rutas de Reparto', category: 'reparto_gasolina', categoryLabel: 'Operación y Mantenimiento', weeklyAmount: 3187, monthlyAmount: 13841, percent: 2.2, frequency: 'semanal', branch: 'refugio', recipient: 'Gasolina Simón y Osvaldo', description: 'Combustible optimizado para rutas de entrega a clientes y cafeterías.' },
  { orderNumber: 11, id: 'exp_11', concept: 'Coca cola y Alpura', category: 'materia_prima', categoryLabel: 'Materia Prima e Insumos', weeklyAmount: 3000, monthlyAmount: 13029, percent: 2.1, frequency: 'semanal', branch: 'refugio', recipient: 'Coca Cola / Alpura', description: 'Bebidas comerciales complementarias de mostrador.' },
  { orderNumber: 12, id: 'exp_12', concept: 'IMSS e INFONAVIT Patronal', category: 'impuestos_fiscal', categoryLabel: 'Mano de Obra y Cargas', weeklyAmount: 2538, monthlyAmount: 11022, percent: 1.8, frequency: 'mensual', branch: 'refugio', recipient: 'IMSS Patronal', description: 'Cargas sociales y aportaciones patronales de ley.' },
  { orderNumber: 13, id: 'exp_13', concept: 'Mantenimiento General y Maquinaria', category: 'mantenimiento', categoryLabel: 'Operación y Mantenimiento', weeklyAmount: 2300, monthlyAmount: 9989, percent: 1.6, trend: 'incremento', trendNote: 'antes $2,000', frequency: 'semanal', branch: 'refugio', recipient: 'Técnico Maquinaria', description: 'Servicio preventivo a vehículos utilitarios, hornos y equipos industriales.' },
  { orderNumber: 14, id: 'exp_14', concept: 'Impuestos y Cargas Fiscales Estimadas', category: 'impuestos_fiscal', categoryLabel: 'Administración y Fiscal', weeklyAmount: 2000, monthlyAmount: 8686, percent: 1.4, frequency: 'mensual', branch: 'refugio', recipient: 'SAT Fiscal', description: 'Obligaciones tributarias mensuales estimadas.' },
  { orderNumber: 15, id: 'exp_15', concept: 'Nata', category: 'materia_prima', categoryLabel: 'Materia Prima e Insumos', weeklyAmount: 2000, monthlyAmount: 8686, percent: 1.4, frequency: 'semanal', branch: 'refugio', recipient: 'Productor Nata Artesanal', description: 'Nata pura pasteurizada para panes de feria y conchas tradicionales.' },
  { orderNumber: 16, id: 'exp_16', concept: 'Contabilidad', category: 'impuestos_fiscal', categoryLabel: 'Administración y Fiscal', weeklyAmount: 1900, monthlyAmount: 8251, percent: 1.3, frequency: 'mensual', branch: 'refugio', recipient: 'Despacho Contable', description: 'Servicios de auditoría, timbrado fiscal y asesoría financiera.' },
  { orderNumber: 17, id: 'exp_17', concept: 'Luz', category: 'servicios', categoryLabel: 'Instalaciones y Servicios', weeklyAmount: 1700, monthlyAmount: 7383, percent: 1.2, frequency: 'mensual', branch: 'refugio', recipient: 'CFE Eléctrica', description: 'Suministro trifásico para cámaras de refrigeración y maquinaria pesada.' },
  { orderNumber: 18, id: 'exp_18', concept: 'Otros (materiales limpieza, compras externas)', category: 'otros', categoryLabel: 'Operación y Mantenimiento', weeklyAmount: 500, monthlyAmount: 2171, percent: 0.4, trend: 'bajo', trendNote: 'antes $4,000', frequency: 'semanal', branch: 'refugio', recipient: 'Insumos Limpieza', description: 'Insumos de limpieza profunda, cofias, uniformes e insumos auxiliares.' },
  { orderNumber: 19, id: 'exp_19', concept: 'Fumigación y Control de Plagas', category: 'otros', categoryLabel: 'Operación y Mantenimiento', weeklyAmount: 175, monthlyAmount: 760, percent: 0.1, frequency: 'mensual', branch: 'refugio', recipient: 'Control Sanitario COFEPRIS', description: 'Control sanitario estricto con certificación COFEPRIS.' },
  { orderNumber: 20, id: 'exp_20', concept: 'Agua', category: 'servicios', categoryLabel: 'Instalaciones y Servicios', weeklyAmount: 0, monthlyAmount: 0, percent: 0.0, frequency: 'mensual', branch: 'refugio', recipient: 'Condominio Plaza', description: 'Servicio incluido en el condominio/plaza comercial.' },
  { orderNumber: 21, id: 'exp_21', concept: 'Mantenimiento plaza', category: 'servicios', categoryLabel: 'Instalaciones y Servicios', weeklyAmount: 0, monthlyAmount: 0, percent: 0.0, frequency: 'mensual', branch: 'refugio', recipient: 'Administración Plaza', description: 'Mantenimiento de plaza comercial bonificado / exento.' },
  { orderNumber: 22, id: 'exp_22', concept: 'Papelería, Empaques y Telefonía/Internet', category: 'otros', categoryLabel: 'Operación y Mantenimiento', weeklyAmount: 0, monthlyAmount: 0, percent: 0.0, frequency: 'mensual', branch: 'refugio', recipient: 'Empaque y Telefonía', description: 'Empaque para producto final, charolas desechables y enlace digital.' },
  { orderNumber: 23, id: 'exp_23', concept: 'Queso crema', category: 'materia_prima', categoryLabel: 'Materia Prima e Insumos', weeklyAmount: 0, monthlyAmount: 0, percent: 0.0, trend: 'bajo', trendNote: 'antes $545', frequency: 'semanal', branch: 'refugio', recipient: 'Distribuidor Queso Crema', description: 'Rellenos para panqués, pays y panes artesanales.' }
];

export const DEFAULT_EXPENSE_TEMPLATES_ZAKIA: RecurringExpenseTemplate[] = [
  { orderNumber: 1, id: 'exp_zk_1', concept: 'Nómina Operativa Semanal Zakia', category: 'nomina', categoryLabel: 'Mano de Obra y Cargas', weeklyAmount: 50000, monthlyAmount: 217143, percent: 35.1, frequency: 'semanal', branch: 'zakia', recipient: 'Personal Operativo Zakia', description: 'Nómina completa de panaderos, mostrador y producción sucursal Zakia.' },
  { orderNumber: 2, id: 'exp_zk_2', concept: 'Dialpa Zakia', category: 'materia_prima', categoryLabel: 'Materia Prima e Insumos', weeklyAmount: 38000, monthlyAmount: 165029, percent: 26.7, frequency: 'semanal', branch: 'zakia', recipient: 'Dialpa Harinas', description: 'Harinas de alta graduación y mezclas para sucursal Zakia.' },
  { orderNumber: 3, id: 'exp_zk_3', concept: 'Renta de Local Comercial Zakia', category: 'renta', categoryLabel: 'Instalaciones y Servicios', weeklyAmount: 8800, monthlyAmount: 38217, percent: 6.2, frequency: 'mensual', branch: 'zakia', recipient: 'Arrendamiento Plaza Zakia', description: 'Arrendamiento de local comercial sucursal Zakia. Pago único mensual.' },
  { orderNumber: 4, id: 'exp_zk_4', concept: 'Cremeria americana Zakia', category: 'materia_prima', categoryLabel: 'Materia Prima e Insumos', weeklyAmount: 6000, monthlyAmount: 26057, percent: 4.2, frequency: 'semanal', branch: 'zakia', recipient: 'Cremería Americana', description: 'Cremas para batir y bases lácteas sucursal Zakia.' },
  { orderNumber: 5, id: 'exp_zk_5', concept: 'Gas LP Hornos Zakia', category: 'servicios', categoryLabel: 'Instalaciones y Servicios', weeklyAmount: 5000, monthlyAmount: 21714, percent: 3.5, frequency: 'semanal', branch: 'zakia', recipient: 'Gas LP Hornos Zakia', description: 'Gas LP industrial para hornos de sucursal Zakia.' },
  { orderNumber: 6, id: 'exp_zk_6', concept: 'Mantequilla Zakia', category: 'materia_prima', categoryLabel: 'Materia Prima e Insumos', weeklyAmount: 4200, monthlyAmount: 18240, percent: 3.0, frequency: 'semanal', branch: 'zakia', recipient: 'Distribuidor Mantequilla', description: 'Mantequilla para línea fina y hojaldre en Zakia.' },
  { orderNumber: 7, id: 'exp_zk_7', concept: 'Huevo Zakia', category: 'materia_prima', categoryLabel: 'Materia Prima e Insumos', weeklyAmount: 4000, monthlyAmount: 17371, percent: 2.8, frequency: 'semanal', branch: 'zakia', recipient: 'Granja Huevo', description: 'Consumo diario de huevo fresco para volumen en Zakia.' },
  { orderNumber: 8, id: 'exp_zk_8', concept: 'Materia Prima el Trigal Zakia', category: 'materia_prima', categoryLabel: 'Materia Prima e Insumos', weeklyAmount: 3500, monthlyAmount: 15200, percent: 2.5, frequency: 'semanal', branch: 'zakia', recipient: 'El Trigal Repostería', description: 'Insumos de repostería y coberturas para Zakia.' },
  { orderNumber: 9, id: 'exp_zk_9', concept: 'Quesos Zakia', category: 'materia_prima', categoryLabel: 'Materia Prima e Insumos', weeklyAmount: 3500, monthlyAmount: 15200, percent: 2.5, frequency: 'semanal', branch: 'zakia', recipient: 'Quesos Querétaro', description: 'Quesos para panadería salada en Zakia.' },
  { orderNumber: 10, id: 'exp_zk_10', concept: 'Gasolinas y Logística Zakia', category: 'reparto_gasolina', categoryLabel: 'Operación y Mantenimiento', weeklyAmount: 3187, monthlyAmount: 13841, percent: 2.2, frequency: 'semanal', branch: 'zakia', recipient: 'Gasolina Operación Zakia', description: 'Combustible y movilidad para sucursal Zakia.' },
  { orderNumber: 11, id: 'exp_zk_11', concept: 'Coca cola y Alpura Zakia', category: 'materia_prima', categoryLabel: 'Materia Prima e Insumos', weeklyAmount: 3000, monthlyAmount: 13029, percent: 2.1, frequency: 'semanal', branch: 'zakia', recipient: 'Coca Cola / Alpura', description: 'Bebidas comerciales en mostrador Zakia.' },
  { orderNumber: 12, id: 'exp_zk_12', concept: 'IMSS e INFONAVIT Patronal Zakia', category: 'impuestos_fiscal', categoryLabel: 'Mano de Obra y Cargas', weeklyAmount: 2538, monthlyAmount: 11022, percent: 1.8, frequency: 'mensual', branch: 'zakia', recipient: 'IMSS Patronal', description: 'Cargas patronales de personal en Zakia.' },
  { orderNumber: 13, id: 'exp_zk_13', concept: 'Mantenimiento General Zakia', category: 'mantenimiento', categoryLabel: 'Operación y Mantenimiento', weeklyAmount: 2300, monthlyAmount: 9989, percent: 1.6, frequency: 'semanal', branch: 'zakia', recipient: 'Técnico Maquinaria', description: 'Mantenimiento a maquinaria e instalaciones en Zakia.' },
  { orderNumber: 14, id: 'exp_zk_14', concept: 'Impuestos Fiscales Zakia', category: 'impuestos_fiscal', categoryLabel: 'Administración y Fiscal', weeklyAmount: 2000, monthlyAmount: 8686, percent: 1.4, frequency: 'mensual', branch: 'zakia', recipient: 'SAT Fiscal', description: 'Cargas fiscales estimadas sucursal Zakia.' },
  { orderNumber: 15, id: 'exp_zk_15', concept: 'Nata Zakia', category: 'materia_prima', categoryLabel: 'Materia Prima e Insumos', weeklyAmount: 2000, monthlyAmount: 8686, percent: 1.4, frequency: 'semanal', branch: 'zakia', recipient: 'Productor Nata Artesanal', description: 'Nata pura para panes tradicionales en Zakia.' },
  { orderNumber: 16, id: 'exp_zk_16', concept: 'Contabilidad Zakia', category: 'impuestos_fiscal', categoryLabel: 'Administración y Fiscal', weeklyAmount: 1900, monthlyAmount: 8251, percent: 1.3, frequency: 'mensual', branch: 'zakia', recipient: 'Despacho Contable', description: 'Honorarios contables y timbrado sucursal Zakia.' },
  { orderNumber: 17, id: 'exp_zk_17', concept: 'Luz CFE Zakia', category: 'servicios', categoryLabel: 'Instalaciones y Servicios', weeklyAmount: 1700, monthlyAmount: 7383, percent: 1.2, frequency: 'mensual', branch: 'zakia', recipient: 'CFE Eléctrica', description: 'Suministro eléctrico en local comercial Zakia.' },
  { orderNumber: 18, id: 'exp_zk_18', concept: 'Insumos Limpieza Zakia', category: 'otros', categoryLabel: 'Operación y Mantenimiento', weeklyAmount: 500, monthlyAmount: 2171, percent: 0.4, frequency: 'semanal', branch: 'zakia', recipient: 'Insumos Limpieza', description: 'Limpieza profunda y consumibles en Zakia.' },
  { orderNumber: 19, id: 'exp_zk_19', concept: 'Fumigación y Control Plagas Zakia', category: 'otros', categoryLabel: 'Operación y Mantenimiento', weeklyAmount: 175, monthlyAmount: 760, percent: 0.1, frequency: 'mensual', branch: 'zakia', recipient: 'Control Sanitario COFEPRIS', description: 'Certificación sanitaria y fumigación en Zakia.' },
  { orderNumber: 20, id: 'exp_zk_20', concept: 'Agua Zakia', category: 'servicios', categoryLabel: 'Instalaciones y Servicios', weeklyAmount: 0, monthlyAmount: 0, percent: 0.0, frequency: 'mensual', branch: 'zakia', recipient: 'Condominio Plaza Zakia', description: 'Servicio de agua incluido en plaza comercial Zakia.' },
  { orderNumber: 21, id: 'exp_zk_21', concept: 'Mantenimiento Plaza Zakia', category: 'servicios', categoryLabel: 'Instalaciones y Servicios', weeklyAmount: 0, monthlyAmount: 0, percent: 0.0, frequency: 'mensual', branch: 'zakia', recipient: 'Administración Plaza Zakia', description: 'Cuota de mantenimiento plaza comercial Zakia.' },
  { orderNumber: 22, id: 'exp_zk_22', concept: 'Papelería y Empaques Zakia', category: 'otros', categoryLabel: 'Operación y Mantenimiento', weeklyAmount: 0, monthlyAmount: 0, percent: 0.0, frequency: 'mensual', branch: 'zakia', recipient: 'Empaque y Telefonía', description: 'Bolsas y empaques para producto en Zakia.' },
  { orderNumber: 23, id: 'exp_zk_23', concept: 'Queso Crema Zakia', category: 'materia_prima', categoryLabel: 'Materia Prima e Insumos', weeklyAmount: 0, monthlyAmount: 0, percent: 0.0, frequency: 'semanal', branch: 'zakia', recipient: 'Distribuidor Queso Crema', description: 'Queso crema para repostería en Zakia.' }
];

export const DEFAULT_EXPENSE_TEMPLATES: RecurringExpenseTemplate[] = DEFAULT_EXPENSE_TEMPLATES_REFUGIO;

export function loadExpenseTemplates(branch: 'refugio' | 'zakia' = 'refugio'): RecurringExpenseTemplate[] {
  try {
    const key = branch === 'zakia' ? 'santafe_expense_templates_zakia_v1' : 'santafe_expense_templates_v2';
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length >= 23) {
        return parsed.map((t: RecurringExpenseTemplate) => ({
          ...t,
          branch: t.branch || branch,
          // Por defecto la renta y conceptos mensuales son de pago mensual completo
          frequency: t.frequency || (t.category === 'renta' ? 'mensual' : 'semanal')
        }));
      }
    }
  } catch (e) {
    console.warn('Error loading expense templates', e);
  }
  return branch === 'zakia' ? DEFAULT_EXPENSE_TEMPLATES_ZAKIA : DEFAULT_EXPENSE_TEMPLATES_REFUGIO;
}

export function saveExpenseTemplates(templates: RecurringExpenseTemplate[], branch: 'refugio' | 'zakia' = 'refugio'): void {
  try {
    const key = branch === 'zakia' ? 'santafe_expense_templates_zakia_v1' : 'santafe_expense_templates_v2';
    localStorage.setItem(key, JSON.stringify(templates));
    if (branch === 'refugio') {
      localStorage.setItem('santafe_expense_templates_refugio_v1', JSON.stringify(templates));
    }
  } catch (e) {
    console.error('Error saving expense templates', e);
  }
}

export function getUpcomingFridayString(refDate?: Date | string): string {
  const d = refDate ? new Date(refDate) : new Date();
  if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];
  const day = d.getDay(); // 0 Sunday, 5 Friday
  const diff = (5 - day + 7) % 7;
  d.setDate(d.getDate() + (diff === 0 ? 0 : diff));
  return d.toISOString().split('T')[0];
}

export function loadOperationalExpenses(): OperationalExpense[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.OPERATIONAL_EXPENSES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Error loading operational expenses', e);
  }
  return [];
}

export function saveOperationalExpenses(expenses: OperationalExpense[], forceOverwrite: boolean = true): void {
  try {
    if (forceOverwrite) {
      localStorage.setItem(STORAGE_KEYS.OPERATIONAL_EXPENSES, JSON.stringify(expenses));
      return;
    }
    const current = loadOperationalExpenses();
    const merged = mergeOperationalExpenses(current, expenses);
    localStorage.setItem(STORAGE_KEYS.OPERATIONAL_EXPENSES, JSON.stringify(merged));
  } catch (e) {
    console.error('Error saving operational expenses', e);
    localStorage.setItem(STORAGE_KEYS.OPERATIONAL_EXPENSES, JSON.stringify(expenses));
  }
}

export function mergeOperationalExpenses(existing: OperationalExpense[], incoming: OperationalExpense[]): OperationalExpense[] {
  const deleted = getDeletedOperationalExpenseIds();
  const map = new Map<string, OperationalExpense>();
  for (const e of existing || []) {
    if (e && e.id && !deleted.has(e.id)) map.set(e.id, e);
  }
  for (const e of incoming || []) {
    if (e && e.id && !deleted.has(e.id)) {
      map.set(e.id, { ...(map.get(e.id) || {}), ...e });
    }
  }
  return Array.from(map.values()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export function loadSupplierBills(): SupplierBill[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SUPPLIER_BILLS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Error loading supplier bills', e);
  }
  return [];
}

export function saveSupplierBills(bills: SupplierBill[], forceOverwrite: boolean = true): void {
  try {
    if (forceOverwrite) {
      localStorage.setItem(STORAGE_KEYS.SUPPLIER_BILLS, JSON.stringify(bills));
      return;
    }
    const current = loadSupplierBills();
    const merged = mergeSupplierBills(current, bills);
    localStorage.setItem(STORAGE_KEYS.SUPPLIER_BILLS, JSON.stringify(merged));
  } catch (e) {
    console.error('Error saving supplier bills', e);
    localStorage.setItem(STORAGE_KEYS.SUPPLIER_BILLS, JSON.stringify(bills));
  }
}

export function mergeSupplierBills(existing: SupplierBill[], incoming: SupplierBill[]): SupplierBill[] {
  const deleted = getDeletedSupplierBillIds();
  const map = new Map<string, SupplierBill>();
  for (const b of existing || []) {
    if (b && b.id && !deleted.has(b.id)) map.set(b.id, b);
  }
  for (const b of incoming || []) {
    if (b && b.id && !deleted.has(b.id)) {
      const prev = map.get(b.id);
      if (!prev) {
        map.set(b.id, b);
      } else {
        const prevTime = prev.updatedAt ? new Date(prev.updatedAt).getTime() : 0;
        const incTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        const base = incTime >= prevTime ? { ...prev, ...b } : { ...b, ...prev };
        map.set(b.id, {
          ...base,
          bankInfo: b.bankInfo || prev.bankInfo,
          receiptImageUrl: incTime >= prevTime ? (b.receiptImageUrl !== undefined ? b.receiptImageUrl : prev.receiptImageUrl) : (prev.receiptImageUrl !== undefined ? prev.receiptImageUrl : b.receiptImageUrl),
          receiptFileName: incTime >= prevTime ? (b.receiptFileName !== undefined ? b.receiptFileName : prev.receiptFileName) : (prev.receiptFileName !== undefined ? prev.receiptFileName : b.receiptFileName),
          receiptUploadedAt: incTime >= prevTime ? (b.receiptUploadedAt !== undefined ? b.receiptUploadedAt : prev.receiptUploadedAt) : (prev.receiptUploadedAt !== undefined ? prev.receiptUploadedAt : b.receiptUploadedAt),
          invoiceFolio: incTime >= prevTime ? (b.invoiceFolio !== undefined ? b.invoiceFolio : prev.invoiceFolio) : (prev.invoiceFolio !== undefined ? prev.invoiceFolio : b.invoiceFolio),
          invoiceFileUrl: incTime >= prevTime ? (b.invoiceFileUrl !== undefined ? b.invoiceFileUrl : prev.invoiceFileUrl) : (prev.invoiceFileUrl !== undefined ? prev.invoiceFileUrl : b.invoiceFileUrl),
          invoiceFileName: incTime >= prevTime ? (b.invoiceFileName !== undefined ? b.invoiceFileName : prev.invoiceFileName) : (prev.invoiceFileName !== undefined ? prev.invoiceFileName : b.invoiceFileName),
          invoiceUploadedAt: incTime >= prevTime ? (b.invoiceUploadedAt !== undefined ? b.invoiceUploadedAt : prev.invoiceUploadedAt) : (prev.invoiceUploadedAt !== undefined ? prev.invoiceUploadedAt : b.invoiceUploadedAt),
        });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    // Pendientes primero, ordenados por fecha de viernes
    if (a.status !== b.status) return a.status === 'pendiente' ? -1 : 1;
    return (a.dueDate || '').localeCompare(b.dueDate || '');
  });
}

export function loadSupplierBankProfiles(): SupplierBankInfo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SUPPLIER_BANK_PROFILES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Error loading supplier bank profiles', e);
  }
  return [];
}

export function saveSupplierBankProfiles(profiles: SupplierBankInfo[], forceOverwrite: boolean = true): void {
  try {
    if (forceOverwrite) {
      localStorage.setItem(STORAGE_KEYS.SUPPLIER_BANK_PROFILES, JSON.stringify(profiles));
      return;
    }
    const current = loadSupplierBankProfiles();
    const merged = mergeSupplierBankProfiles(current, profiles);
    localStorage.setItem(STORAGE_KEYS.SUPPLIER_BANK_PROFILES, JSON.stringify(merged));
  } catch (e) {
    console.error('Error saving supplier bank profiles', e);
    localStorage.setItem(STORAGE_KEYS.SUPPLIER_BANK_PROFILES, JSON.stringify(profiles));
  }
}

export function mergeSupplierBankProfiles(existing: SupplierBankInfo[], incoming: SupplierBankInfo[]): SupplierBankInfo[] {
  const map = new Map<string, SupplierBankInfo>();
  for (const p of existing || []) {
    if (p && p.id) map.set(p.id, p);
  }
  for (const p of incoming || []) {
    if (p && p.id) {
      const prev = map.get(p.id);
      if (!prev) {
        map.set(p.id, p);
      } else {
        const prevTime = prev.updatedAt ? new Date(prev.updatedAt).getTime() : 0;
        const incTime = p.updatedAt ? new Date(p.updatedAt).getTime() : 0;
        map.set(p.id, incTime >= prevTime ? { ...prev, ...p } : { ...p, ...prev });
      }
    }
  }
  return Array.from(map.values());
}

export const DEFAULT_VIP_CUSTOMERS: VipCustomer[] = [
  {
    id: 'vip_trascos',
    name: 'Taquería Trascos',
    phone: '442 123 4567',
    defaultBreadType: 'Telera y Bolillo Especial',
    defaultAmount: 350,
    requiresInvoice: true,
    rfc: 'TTR180420AA1',
    businessName: 'Taquería Trascos S.A. de C.V.',
    createdAt: new Date().toISOString()
  },
  {
    id: 'vip_magda',
    name: 'Doña Magda',
    phone: '442 234 5678',
    defaultBreadType: 'Pan Dulce Surtido',
    defaultAmount: 200,
    requiresInvoice: false,
    createdAt: new Date().toISOString()
  },
  {
    id: 'vip_bollos_david',
    name: 'Bollos David',
    phone: '442 345 6789',
    defaultBreadType: 'Bollos Artesanales Hamburguesa',
    defaultAmount: 420,
    requiresInvoice: true,
    rfc: 'BDA190715BB2',
    businessName: 'Alimentos David S. de R.L.',
    createdAt: new Date().toISOString()
  },
  {
    id: 'vip_deliz',
    name: 'Café & Deliz',
    phone: '442 456 7890',
    defaultBreadType: 'Baguette Gourmet y Panini',
    defaultAmount: 280,
    requiresInvoice: false,
    createdAt: new Date().toISOString()
  }
];

export function loadVipCustomers(): VipCustomer[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.VIP_CUSTOMERS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.error('Error loading VIP customers', e);
  }
  return DEFAULT_VIP_CUSTOMERS;
}

export function saveVipCustomers(customers: VipCustomer[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.VIP_CUSTOMERS, JSON.stringify(customers));
  } catch (e) {
    console.error('Error saving VIP customers', e);
  }
}

export function mergeVipCustomers(existing: VipCustomer[], incoming: VipCustomer[]): VipCustomer[] {
  const deleted = getDeletedVipCustomerIds();
  const map = new Map<string, VipCustomer>();
  for (const c of existing || []) {
    if (c?.id && !deleted.has(c.id)) map.set(c.id, c);
  }
  for (const c of incoming || []) {
    if (c?.id && !deleted.has(c.id)) {
      map.set(c.id, { ...(map.get(c.id) || {}), ...c });
    }
  }
  return Array.from(map.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export function loadVipOrders(): VipOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.VIP_ORDERS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Error loading VIP orders', e);
  }
  return [];
}

export function saveVipOrders(orders: VipOrder[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.VIP_ORDERS, JSON.stringify(orders));
  } catch (e) {
    console.error('Error saving VIP orders', e);
  }
}

export function mergeVipOrders(existing: VipOrder[], incoming: VipOrder[]): VipOrder[] {
  const deleted = getDeletedVipOrderIds();
  const map = new Map<string, VipOrder>();
  for (const o of existing || []) {
    if (o?.id && !deleted.has(o.id)) map.set(o.id, o);
  }
  for (const o of incoming || []) {
    if (o?.id && !deleted.has(o.id)) {
      const prev = map.get(o.id);
      map.set(o.id, {
        ...(prev || {}),
        ...o,
        // Conservar comprobantes o facturas si ya estaban cargadas
        transferReceiptUrl: o.transferReceiptUrl || prev?.transferReceiptUrl,
        transferReceiptFileName: o.transferReceiptFileName || prev?.transferReceiptFileName,
        transferReceiptUploadedAt: o.transferReceiptUploadedAt || prev?.transferReceiptUploadedAt,
        invoiceFolio: o.invoiceFolio || prev?.invoiceFolio,
        invoiceFileUrl: o.invoiceFileUrl || prev?.invoiceFileUrl,
        invoiceFileName: o.invoiceFileName || prev?.invoiceFileName,
        invoiceUploadedAt: o.invoiceUploadedAt || prev?.invoiceUploadedAt,
        isAudited: o.isAudited ?? prev?.isAudited ?? false,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    return (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '');
  });
}
