import express, { Request, Response } from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { createServer as createViteServer } from "vite";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { parse } from "csv-parse/sync";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "stock.db");

const upload = multer({ storage: multer.memoryStorage() });

interface Material {
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

interface Transaction {
  id?: number;
  materialId: number;
  materialName: string;
  type: 'IN' | 'OUT';
  quantity: number;
  timestamp: number;
  reason: string;
}

// Initialize SQLite Database
let db: Database.Database;

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  db = new Database(DB_FILE);
  
  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      subcategory TEXT,
      unit TEXT DEFAULT 'u',
      currentStock REAL DEFAULT 0,
      minStock REAL DEFAULT 0,
      description TEXT,
      lastUpdated INTEGER
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      materialId INTEGER,
      materialName TEXT,
      type TEXT CHECK(type IN ('IN', 'OUT')),
      quantity REAL,
      timestamp INTEGER,
      reason TEXT,
      FOREIGN KEY(materialId) REFERENCES materials(id)
    );
  `);
}

async function startServer() {
  await ensureDataDir();
  
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(bodyParser.json({ limit: '50mb' }));

  // API Routes
  app.get("/api/materials", (_req: Request, res: Response) => {
    const materials = db.prepare("SELECT * FROM materials").all();
    res.json(materials);
  });

  app.post("/api/materials/sync", (req: Request, res: Response) => {
    try {
      const materials = req.body as Material[];
      const deleteStmt = db.prepare("DELETE FROM materials");
      const insert = db.prepare(`
        INSERT INTO materials (id, name, category, subcategory, unit, currentStock, minStock, description, lastUpdated)
        VALUES (@id, @name, @category, @subcategory, @unit, @currentStock, @minStock, @description, @lastUpdated)
      `);
      
      const transaction = db.transaction((items) => {
        deleteStmt.run();
        for (const item of items) insert.run(item);
      });
      
      transaction(materials);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to sync materials" });
    }
  });

  app.get("/api/transactions", (_req: Request, res: Response) => {
    const transactions = db.prepare("SELECT * FROM transactions ORDER BY timestamp DESC").all();
    res.json(transactions);
  });

  app.post("/api/transactions/sync", (req: Request, res: Response) => {
    try {
      const transactions = req.body as Transaction[];
      const deleteStmt = db.prepare("DELETE FROM transactions");
      const insert = db.prepare(`
        INSERT INTO transactions (id, materialId, materialName, type, quantity, timestamp, reason)
        VALUES (@id, @materialId, @materialName, @type, @quantity, @timestamp, @reason)
      `);
      
      const transaction = db.transaction((items) => {
        deleteStmt.run();
        for (const item of items) insert.run(item);
      });
      
      transaction(transactions);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to sync transactions" });
    }
  });

  // Advanced CSV Import Route
  app.post("/api/import-csv", upload.single('file'), (req: Request, res: Response) => {
    const file = req.file;
    const clear = req.body.clear === 'true';

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      let csvContent = file.buffer.toString('utf-8');
      
      // Remove BOM if present
      if (csvContent.charCodeAt(0) === 0xFEFF) {
        csvContent = csvContent.slice(1);
      }

      // Detect delimiter: Excel in many regions uses semicolon
      const firstLine = csvContent.split('\n')[0];
      const semicolonCount = (firstLine.match(/;/g) || []).length;
      const commaCount = (firstLine.match(/,/g) || []).length;
      const delimiter = semicolonCount > commaCount ? ';' : ',';

      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        relax_quotes: true,
        escape: '"',
        delimiter: delimiter,
        skip_records_with_error: true
      }) as any[];

      const now = Date.now();

      // Helper to find key regardless of case, accents or spaces
      const getVal = (obj: any, possibleKeys: string[]) => {
        const keys = Object.keys(obj);
        const normalize = (s: string) => s.toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]/g, "");

        for (const pk of possibleKeys) {
          const normalizedPk = normalize(pk);
          const foundKey = keys.find(k => normalize(k) === normalizedPk);
          if (foundKey) return obj[foundKey];
        }
        return null;
      };

      // Helper to parse numbers robustly (handle comma as decimal)
      const parseNum = (val: any) => {
        if (val === null || val === undefined || val === '') return 0;
        const str = String(val).replace(',', '.').replace(/[^0-9.-]/g, '');
        const num = parseFloat(str);
        return isNaN(num) ? 0 : num;
      };

      let processedCount = 0;

      const importTransaction = db.transaction(() => {
        if (clear) {
          db.prepare("DELETE FROM transactions").run();
          db.prepare("DELETE FROM materials").run();
          db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('materials', 'transactions')").run();
        }

        for (const record of records) {
          const name = getVal(record, ['Nombre', 'Name', 'Articulo']);
          const category = getVal(record, ['Categoria', 'Category', 'Tipo']);
          const subcategory = getVal(record, ['Subcategoria', 'Subcategory', 'Subtipo']) || '';
          const unit = getVal(record, ['Unidad', 'Unit']) || 'u';
          const newStock = parseNum(getVal(record, ['StockActual', 'Stock', 'Cantidad']));
          const minStock = parseNum(getVal(record, ['StockMinimo', 'Minimo', 'MinStock']));

          if (!name || !category) continue;

          // Check if exists
          const existing = db.prepare(`
            SELECT * FROM materials 
            WHERE LOWER(name) = LOWER(?) AND LOWER(category) = LOWER(?) AND LOWER(subcategory) = LOWER(?)
          `).get(name, category, subcategory) as Material | undefined;

          if (existing) {
            const oldStock = existing.currentStock;
            db.prepare(`
              UPDATE materials 
              SET currentStock = ?, minStock = ?, lastUpdated = ? 
              WHERE id = ?
            `).run(newStock, minStock, now, existing.id);
            
            if (newStock !== oldStock) {
              db.prepare(`
                INSERT INTO transactions (materialId, materialName, type, quantity, timestamp, reason)
                VALUES (?, ?, ?, ?, ?, ?)
              `).run(
                existing.id,
                name,
                newStock > oldStock ? 'IN' : 'OUT',
                Math.abs(newStock - oldStock),
                now,
                'Sincronización CSV (SQLite)'
              );
            }
          } else {
            const result = db.prepare(`
              INSERT INTO materials (name, category, subcategory, unit, currentStock, minStock, description, lastUpdated)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(name, category, subcategory, unit, newStock, minStock, '', now);
            
            const newId = result.lastInsertRowid;
            
            db.prepare(`
              INSERT INTO transactions (materialId, materialName, type, quantity, timestamp, reason)
              VALUES (?, ?, ?, ?, ?, ?)
            `).run(
              newId,
              name,
              'IN',
              newStock,
              now,
              'Alta CSV (SQLite)'
            );
          }
          processedCount++;
        }
      });

      importTransaction();

      const materials = db.prepare("SELECT * FROM materials").all();
      const transactions = db.prepare("SELECT * FROM transactions ORDER BY timestamp DESC").all();

      res.json({ 
        success: true, 
        materials, 
        transactions,
        message: `Procesados ${processedCount} registros correctamente en SQLite`
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to process CSV" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
