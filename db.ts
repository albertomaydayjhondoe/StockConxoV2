
import { Dexie, type Table } from 'dexie';
import { Material, Transaction } from './types';

// Extiende Dexie para manejar la base de datos local de forma segura
export class StockDatabase extends Dexie {
  materials!: Table<Material, number>;
  transactions!: Table<Transaction, number>;
  private openingPromise: Promise<void> | null = null;
  private isRecovering = false;

  constructor() {
    super('StockProV4_DB');
    
    // Esquema versión 3: Se añade índice [name+category+subcategory] para sincronización inteligente
    (this as any).version(3).stores({
      materials: '++id, name, category, subcategory, [category+subcategory], [name+category+subcategory]',
      transactions: '++id, materialId, timestamp, type'
    });

    (this as any).on('versionchange', () => {
      (this as any).close();
      window.location.reload();
    });
  }

  // Abre la base de datos de forma segura con reintentos
  async safeOpen() {
    if ((this as any).isOpen) return;
    if (this.openingPromise) return this.openingPromise;

    const MAX_ATTEMPTS = 3;
    let attempt = 0;

    const performOpen = async (): Promise<void> => {
      try {
        if (!window.indexedDB) throw new Error("IndexedDB no disponible.");
        await (this as any).open();
      } catch (err: any) {
        attempt++;
        const errName = err.name || 'Error';
        const isCritical = errName === 'UnknownError' || errName === 'InternalError' || err.message?.includes('internal error');

        if (isCritical && attempt < MAX_ATTEMPTS) {
          await new Promise(r => setTimeout(r, attempt * 600));
          return performOpen();
        }
        if (isCritical && attempt >= MAX_ATTEMPTS && !this.isRecovering) {
          this.isRecovering = true;
          await this.forceRecreate();
          return performOpen();
        }
        throw err;
      }
    };

    this.openingPromise = performOpen().finally(() => {
      this.openingPromise = null;
      this.isRecovering = false;
    });

    return this.openingPromise;
  }

  private async forceRecreate() {
    try {
      (this as any).close();
      await Dexie.delete('StockProV4_DB');
    } catch (e) {
      console.error("Error en recreación forzada:", e);
    }
  }

  async emergencyReset() {
    try {
      if ((this as any).isOpen) (this as any).close();
      await Dexie.delete('StockProV4_DB');
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      window.location.reload();
    } catch (e) {
      window.location.reload();
    }
  }
}

export const db = new StockDatabase();
