import { TicketItem, OrderItem } from '../types';

/**
 * Categorías y palabras clave que identifican productos que NO son pan
 * (Lácteos, bebidas, refrescos, gelatinas, charolas, domos, postres refrigerados, etc.)
 */
const NON_BREAD_CATEGORIES = [
  'Lácteos y Acompañamientos',
  'Lácteos',
  'Acompañamientos',
  'Bebidas',
  'Refrescos',
  'Otros',
  'No Pan',
  'No es Pan'
];

const NON_BREAD_KEYWORDS = [
  'leche',
  'lechita',
  'alpura',
  'santa clara',
  'lala',
  'gelatina',
  'arroz con leche',
  'arroz c/ leche',
  'domo',
  'charola',
  'nata',
  'queso',
  'paleta',
  'paletas',
  'coca',
  'coca cola',
  'refresco',
  'jugo',
  'agua',
  'café',
  'cafe',
  'lata',
  'botella',
  'lácteo',
  'lacteo',
  'crema',
  'yogurt',
  'yoghurt',
  'granola',
  'hielo',
  'chocolate',
  'abuelita',
  'tableta',
  'tabletilla'
];

/**
 * Determina si un artículo individual es "No Pan / Otros" o "Pan"
 */
export function isNonBreadProduct(item: { name?: string; category?: string; productId?: string; breadId?: string }): boolean {
  if (item.category && NON_BREAD_CATEGORIES.includes(item.category)) {
    return true;
  }
  
  const nameLower = (item.name || '').toLowerCase().trim();
  if (NON_BREAD_KEYWORDS.some(kw => nameLower.includes(kw))) {
    return true;
  }

  // Identificadores conocidos de productos que no son pan
  const idLower = (item.productId || item.breadId || '').toLowerCase();
  if (
    idLower.startsWith('p_leche') ||
    idLower.startsWith('p_lechitas') ||
    idLower.startsWith('p_gelatina') ||
    idLower.startsWith('p_arroz_leche') ||
    idLower.startsWith('p_domo') ||
    idLower.startsWith('p_nata') ||
    idLower.startsWith('p_queso') ||
    idLower.startsWith('p_granola') ||
    idLower.startsWith('p_paleta') ||
    idLower.startsWith('p_choco_abuelita') ||
    idLower.startsWith('p_chocolate')
  ) {
    return true;
  }

  return false;
}

export function isBreadProduct(item: { name?: string; category?: string; productId?: string; breadId?: string }): boolean {
  return !isNonBreadProduct(item);
}

export interface BreadSalesBreakdown {
  breadTotal: number;
  nonBreadTotal: number;
  breadPieces: number;
  nonBreadPieces: number;
  breadItemsList?: Array<{ name: string; quantity: number; total: number }>;
  nonBreadItemsList?: Array<{ name: string; quantity: number; total: number }>;
}

/**
 * Calcula el desglose exacto de Venta de Pan vs Venta de Otros (No Pan)
 * para una lista de TicketItem o OrderItem
 */
export function calculateItemsBreakdown(
  items: Array<{ name?: string; category?: string; productId?: string; breadId?: string; price?: number; unitPrice?: number; quantity: number; total?: number }>
): BreadSalesBreakdown {
  let breadTotal = 0;
  let nonBreadTotal = 0;
  let breadPieces = 0;
  let nonBreadPieces = 0;
  const breadItemsList: Array<{ name: string; quantity: number; total: number }> = [];
  const nonBreadItemsList: Array<{ name: string; quantity: number; total: number }> = [];

  for (const item of items) {
    const qty = Number(item.quantity) || 0;
    const itemTotal = Number(item.total ?? (qty * (item.price ?? item.unitPrice ?? 0))) || 0;
    const name = item.name || 'Artículo';

    if (isNonBreadProduct(item)) {
      nonBreadTotal += itemTotal;
      nonBreadPieces += qty;
      nonBreadItemsList.push({ name, quantity: qty, total: itemTotal });
    } else {
      breadTotal += itemTotal;
      breadPieces += qty;
      breadItemsList.push({ name, quantity: qty, total: itemTotal });
    }
  }

  return {
    breadTotal,
    nonBreadTotal,
    breadPieces,
    nonBreadPieces,
    breadItemsList,
    nonBreadItemsList
  };
}

/**
 * Calcula el desglose de Pan vs Otros sobre un conjunto de Tickets de Venta,
 * incluyendo la lista itemizada de todos los productos que no son pan vendidos (ej. lácteos, quesos, postres, granola, etc.)
 */
export function calculateTicketsBreakdown(tickets: Array<{ items: TicketItem[]; total: number }>): BreadSalesBreakdown {
  let breadTotal = 0;
  let nonBreadTotal = 0;
  let breadPieces = 0;
  let nonBreadPieces = 0;
  const nonBreadMap = new Map<string, { name: string; quantity: number; total: number }>();
  const breadMap = new Map<string, { name: string; quantity: number; total: number }>();

  for (const ticket of tickets) {
    for (const item of ticket.items || []) {
      const qty = Number(item.quantity) || 0;
      const itemTotal = Number(item.total ?? (qty * item.price)) || 0;
      const cleanName = (item.name || 'Artículo').trim();
      
      if (isNonBreadProduct(item)) {
        nonBreadTotal += itemTotal;
        nonBreadPieces += qty;
        const key = cleanName.toLowerCase();
        const existing = nonBreadMap.get(key);
        if (existing) {
          existing.quantity += qty;
          existing.total += itemTotal;
        } else {
          nonBreadMap.set(key, { name: cleanName, quantity: qty, total: itemTotal });
        }
      } else {
        breadTotal += itemTotal;
        breadPieces += qty;
        const key = cleanName.toLowerCase();
        const existing = breadMap.get(key);
        if (existing) {
          existing.quantity += qty;
          existing.total += itemTotal;
        } else {
          breadMap.set(key, { name: cleanName, quantity: qty, total: itemTotal });
        }
      }
    }
  }

  // Filtrar solo los productos que tuvieron venta real (> 0) y ordenar de mayor a menor venta
  const nonBreadItemsList = Array.from(nonBreadMap.values())
    .filter(it => it.quantity > 0)
    .sort((a, b) => b.total - a.total);

  const breadItemsList = Array.from(breadMap.values())
    .filter(it => it.quantity > 0)
    .sort((a, b) => b.total - a.total);

  return {
    breadTotal,
    nonBreadTotal,
    breadPieces,
    nonBreadPieces,
    breadItemsList,
    nonBreadItemsList
  };
}
