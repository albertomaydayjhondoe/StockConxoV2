
export type TransactionType = 'IN' | 'OUT';

export interface Material {
  id?: number;
  name: string;
  category: string;
  subcategory: string;
  unit: string;
  currentStock: number;
  minStock: number;
  description: string;
  lastUpdated: number;
}

export interface Transaction {
  id?: number;
  materialId: number;
  materialName: string;
  type: TransactionType;
  quantity: number;
  timestamp: number;
  reason: string;
  user?: string;
}

export enum ViewMode {
  DASHBOARD = 'DASHBOARD',
  INVENTORY = 'INVENTORY',
  HISTORY = 'HISTORY',
  IMPORT = 'IMPORT',
  BRANDING = 'BRANDING'
}
