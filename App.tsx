
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Layout from './components/Layout';
import { ViewMode, Material, Transaction, TransactionType } from './types';
import { db } from './db';
import { useCSV } from './useCSV';
import { 
  Search, 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  Minus, 
  FileUp,
  X,
  CheckCircle2,
  AlertCircle,
  Camera,
  Image as ImageIcon,
  Zap,
  ChevronRight,
  FileSpreadsheet,
  AlertTriangle,
  Info,
  DownloadCloud,
  FileCode,
  Layers,
  Box
} from 'lucide-react';
import { generateAppIconAI } from './services/geminiService';

const App: React.FC = () => {
  const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
  
  const [view, setView] = useState<ViewMode>(ViewMode.DASHBOARD);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dbError, setDbError] = useState<boolean>(false);
  const [dbErrorMessage, setDbErrorMessage] = useState<string>("");
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedSubcategory, setSelectedSubcategory] = useState('Todas');
  
  const [showModal, setShowModal] = useState<'NONE' | 'MOVE' | 'SCAN'>('NONE');
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [moveType, setMoveType] = useState<TransactionType>('IN');
  const [moveQty, setMoveQty] = useState<number>(1);
  
  const [appIcon, setAppIcon] = useState<string | null>(null);
  const [isGeneratingIcon, setIsGeneratingIcon] = useState(false);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  
  // CSV Logic from hook
  const { generateCSV, generateTemplate, downloadFile } = useCSV();
  const [isParsingCsv, setIsParsingCsv] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Dynamic menu structure derived solely from materials (CSV-driven)
  const menuStructure = React.useMemo(() => {
    const structure: Record<string, Set<string>> = {};
    
    materials.forEach(m => {
      if (!structure[m.category]) structure[m.category] = new Set();
      if (m.subcategory && m.subcategory.toLowerCase() !== 'general' && m.subcategory.trim() !== '') {
        structure[m.category].add(m.subcategory);
      }
    });

    return Object.entries(structure)
      .map(([category, subcategories]) => ({
        category,
        subcategories: Array.from(subcategories).sort()
      }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [materials]);

  // Category stats for the new dashboard
  const categoryStats = React.useMemo(() => {
    const stats: Record<string, { total: number, low: number }> = {};
    
    materials.forEach(m => {
      if (!stats[m.category]) stats[m.category] = { total: 0, low: 0 };
      stats[m.category].total++;
      if (m.currentStock <= m.minStock) stats[m.category].low++;
    });

    return Object.entries(stats).map(([category, data]) => ({
      category,
      totalItems: data.total,
      lowStockItems: data.low
    })).sort((a, b) => b.totalItems - a.totalItems);
  }, [materials]);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      await db.safeOpen();
      
      // Try to fetch from backend first
      try {
        const [materialsRes, transactionsRes] = await Promise.all([
          fetch('/api/materials'),
          fetch('/api/transactions')
        ]);
        
        if (materialsRes.ok && transactionsRes.ok) {
          const backendMaterials = await materialsRes.json();
          const backendTransactions = await transactionsRes.json();
          
          if (backendMaterials.length > 0 || backendMaterials.length > 0) {
            // Sync backend to local DB
            await db.materials.clear();
            await db.materials.bulkAdd(backendMaterials);
            await db.transactions.clear();
            await db.transactions.bulkAdd(backendTransactions);
            
            setMaterials(backendMaterials);
            setTransactions(backendTransactions);
            setIsLoading(false);
            return;
          }
        }
      } catch (backendErr) {
        console.warn("Backend sync failed, using local DB:", backendErr);
      }

      const allMaterials = await db.materials.toArray();
      const allTransactions = await db.transactions.orderBy('timestamp').reverse().toArray();
      setMaterials(allMaterials);
      setTransactions(allTransactions);
      setDbError(false);
    } catch (err: any) {
      setDbError(true);
      setDbErrorMessage(err.message || "Error Crítico Almacenamiento.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const syncToBackend = useCallback(async (newMaterials: Material[], newTransactions: Transaction[]) => {
    try {
      showToast("Sincronizando con la nube...", "success");
      await Promise.all([
        fetch('/api/materials/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newMaterials)
        }),
        fetch('/api/transactions/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newTransactions)
        })
      ]);
      showToast("Sincronización completada", "success");
    } catch (err) {
      console.error("Failed to sync to backend:", err);
      showToast("Error de sincronización con la nube", "error");
    }
  }, [showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFilterChange = (cat: string, sub: string) => {
    setSelectedCategory(cat);
    setSelectedSubcategory(sub);
  };

  const startScanner = async () => {
    setShowModal('SCAN');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      showToast("Sensor de cámara no detectado", "error");
      setShowModal('NONE');
    }
  };

  const stopScanner = () => {
    if (videoRef.current?.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    setShowModal('NONE');
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith('.csv')) {
      processFile(file);
    } else {
      showToast("Por favor, sube un archivo CSV válido", "error");
    }
  };

  const processFile = async (file: File) => {
    setIsParsingCsv(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('clear', replaceMode.toString());

    try {
      showToast("Procesando en servidor...", "success");
      const response = await fetch('/api/import-csv', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error("Error en el servidor");

      const data = await response.json();
      
      // Sync backend response to local DB
      await db.materials.clear();
      await db.materials.bulkAdd(data.materials);
      await db.transactions.clear();
      await db.transactions.bulkAdd(data.transactions);
      
      setMaterials(data.materials);
      setTransactions(data.transactions);
      
      showToast(data.message || "Importación exitosa", "success");
      setView(ViewMode.INVENTORY);
    } catch (err: any) {
      showToast(err.message || "Error al procesar archivo", "error");
    } finally {
      setIsParsingCsv(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
    e.target.value = '';
  };

  const saveImportedData = async () => {
    // This function is now handled by the backend /api/import-csv
    // But we keep the UI logic if needed for local-only preview (optional)
    showToast("Función delegada al servidor", "success");
  };

  const handleExport = () => {
    if (materials.length === 0) {
      showToast("Sin existencias para exportar", "error");
      return;
    }
    const content = generateCSV(materials);
    downloadFile(content, `inventario_actual_${new Date().toISOString().slice(0,10)}.csv`);
    showToast("Catálogo descargado");
  };

  const handleDownloadTemplate = () => {
    const content = generateTemplate(menuStructure);
    downloadFile(content, `plantilla_sincronizada_stock.csv`);
    showToast("Plantilla layout lista");
  };

  if (dbError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-white p-12 text-center animate-in fade-in">
        <AlertCircle size={40} className="text-black mb-6" />
        <h1 className="text-sm font-black uppercase tracking-widest mb-2 italic">Error Terminal</h1>
        <code className="text-[9px] text-black/40 block p-6 bg-black/5 rounded-none mb-8 break-all leading-relaxed font-mono border border-black/10">{dbErrorMessage}</code>
        <button onClick={() => db.emergencyReset()} className="w-full py-6 bg-black text-white font-black rounded-none uppercase text-[10px] tracking-[0.2em] shadow-xl">Limpiar & Reiniciar</button>
      </div>
    );
  }

  return (
    <Layout 
      activeView={view} 
      onNavigate={setView} 
      title="StockPro Conxo"
      selectedCategory={selectedCategory}
      selectedSubcategory={selectedSubcategory}
      onFilterChange={handleFilterChange}
      menuStructure={menuStructure}
    >
      <div key="view-container" className="space-y-12">
        {isLoading ? (
          <div key="loading" className="flex flex-col justify-center items-center h-[50vh]">
            <div className="w-10 h-10 border-[3px] border-black border-t-transparent rounded-none rotate-45 animate-spin mb-8"></div>
            <p className="text-[9px] font-black text-black/20 uppercase tracking-[0.5em]">Procesando</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {view === ViewMode.DASHBOARD && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-10"
              >
                <div className="bg-white/70 backdrop-blur-sm p-10 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full -mr-32 -mt-32 blur-3xl opacity-50 group-hover:opacity-100 transition-opacity"></div>
                  
                  <div className="relative z-10">
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 mb-6">Resumen Global</p>
                    <h2 className="text-4xl font-black tracking-tighter text-slate-900 leading-none mb-12">Panel de Control</h2>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                      <div className="p-8 bg-slate-50/70 rounded-2xl border border-slate-100">
                        <div className="text-5xl font-black text-slate-900 tracking-tighter mb-2">{materials.length}</div>
                        <div className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Artículos</div>
                      </div>
                      <div className="p-8 bg-blue-600 rounded-2xl border border-blue-700 shadow-lg shadow-blue-100">
                        <div className="text-5xl font-black text-white tracking-tighter mb-2">{materials.filter(m => m.currentStock <= m.minStock).length}</div>
                        <div className="text-[10px] uppercase font-black text-blue-100 tracking-widest">Alertas de Stock</div>
                      </div>
                      <div className="p-8 bg-white/70 backdrop-blur-sm rounded-2xl border border-slate-200 flex flex-col items-center justify-center gap-4 hover:border-blue-300 transition-all cursor-pointer" onClick={startScanner}>
                        <Camera size={32} className="text-blue-600" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">Escanear QR</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center justify-between px-2">
                    <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">Categorías de Inventario</p>
                    <button onClick={() => setView(ViewMode.IMPORT)} className="text-[10px] font-bold text-blue-600 hover:underline uppercase tracking-widest flex items-center gap-2">
                      <FileUp size={14} /> Gestionar CSV
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {categoryStats.map((stat) => (
                      <button 
                        key={stat.category}
                        onClick={() => {
                          setSelectedCategory(stat.category);
                          setSelectedSubcategory('Todas');
                          setView(ViewMode.INVENTORY);
                        }}
                        className="bg-white/70 backdrop-blur-sm p-8 rounded-3xl border border-slate-200 shadow-sm hover:border-blue-400 hover:shadow-md transition-all text-left group relative overflow-hidden"
                      >
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                          <Layers size={48} className="text-slate-900" />
                        </div>
                        <h3 className="text-lg font-black text-slate-900 tracking-tight mb-4 group-hover:text-blue-600 transition-colors">{stat.category}</h3>
                        <div className="flex items-center gap-6">
                          <div>
                            <div className="text-2xl font-black text-slate-900 tracking-tighter">{stat.totalItems}</div>
                            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total</div>
                          </div>
                          {stat.lowStockItems > 0 && (
                            <div>
                              <div className="text-2xl font-black text-red-600 tracking-tighter">{stat.lowStockItems}</div>
                              <div className="text-[9px] font-black text-red-400 uppercase tracking-widest">Críticos</div>
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                    
                    {categoryStats.length === 0 && (
                      <div className="col-span-full p-20 bg-slate-50 rounded-[40px] border border-dashed border-slate-200 text-center">
                        <Box size={48} className="text-slate-200 mx-auto mb-6" />
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">No hay datos cargados</p>
                        <button onClick={() => setView(ViewMode.IMPORT)} className="mt-6 px-8 py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-100">Importar Catálogo CSV</button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {view === ViewMode.INVENTORY && (
              <motion.div 
                key="inventory"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="space-y-8"
              >
                <div className="bg-white/70 backdrop-blur-sm p-3 rounded-2xl border border-slate-200 shadow-sm focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-50 transition-all">
                  <div className="relative">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input type="text" placeholder="Buscar por nombre o referencia..." className="w-full pl-16 pr-6 py-5 rounded-xl bg-transparent font-bold text-slate-900 text-sm outline-none placeholder:text-slate-300" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  </div>
                </div>

                <div className="flex items-center justify-between px-2">
                   <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                      <span className="text-[11px] font-black text-slate-900 uppercase tracking-widest">{selectedCategory}</span>
                      {selectedSubcategory !== 'Todas' && <ChevronRight size={14} className="text-slate-300" />}
                      {selectedSubcategory !== 'Todas' && <span className="text-[11px] font-bold text-blue-600 uppercase tracking-widest">{selectedSubcategory}</span>}
                   </div>
                   <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                     {materials.filter(m => {
                        const matchCat = selectedCategory === 'Todas' || m.category === selectedCategory;
                        const matchSub = selectedSubcategory === 'Todas' || m.subcategory === selectedSubcategory;
                        const matchSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase());
                        return matchCat && matchSub && matchSearch;
                     }).length} Resultados
                   </div>
                </div>
                
                <div className="bg-white/70 backdrop-blur-sm rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/50">
                          <th className="p-6 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Artículo</th>
                          <th className="p-6 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Stock</th>
                          <th className="p-6 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {materials.filter(m => {
                          const matchCat = selectedCategory === 'Todas' || m.category === selectedCategory;
                          const matchSub = selectedSubcategory === 'Todas' || 
                                           (selectedSubcategory === '' && m.subcategory === '') ||
                                           m.subcategory === selectedSubcategory;
                          const matchSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase());
                          return matchCat && matchSub && matchSearch;
                        }).map(m => (
                          <tr key={m.id || `${m.name}-${m.category}-${m.subcategory}`} className="group hover:bg-slate-50/50 transition-colors">
                            <td className="p-6 px-8">
                              <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest">
                                  {m.subcategory && m.subcategory.toLowerCase() !== 'general' ? m.subcategory : m.category}
                                </span>
                                <span className="font-bold text-sm text-slate-900 tracking-tight">{m.name}</span>
                                <span className="text-[10px] font-medium text-slate-400">Unidad: {m.unit}</span>
                              </div>
                            </td>
                            <td className="p-6 px-8 text-center">
                              <div className={cn(
                                "text-xl font-black tracking-tighter px-4 py-1.5 rounded-full inline-block",
                                m.currentStock <= m.minStock ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-slate-100 text-slate-900'
                              )}>
                                {m.currentStock}
                              </div>
                            </td>
                            <td className="p-6 px-8 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button 
                                  onClick={() => { setSelectedMaterial(m); setMoveType('IN'); setShowModal('MOVE'); }} 
                                  className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center active:scale-90 transition-all shadow-md shadow-blue-100 hover:bg-blue-700"
                                >
                                  <Plus size={18}/>
                                </button>
                                <button 
                                  onClick={() => { setSelectedMaterial(m); setMoveType('OUT'); setShowModal('MOVE'); }} 
                                  className="w-10 h-10 bg-white text-slate-900 rounded-xl flex items-center justify-center active:scale-90 transition-all border border-slate-200 hover:border-slate-300 shadow-sm"
                                >
                                  <Minus size={18}/>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {view === ViewMode.HISTORY && (
              <motion.div 
                key="history"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {transactions.map(t => (
                  <div key={t.id || t.timestamp} className="bg-white/70 backdrop-blur-sm p-6 rounded-2xl flex items-center gap-6 border border-slate-100 shadow-sm group hover:border-blue-200 transition-all">
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border transition-all",
                      t.type === 'IN' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-slate-50 text-slate-400 border-slate-100'
                    )}>
                      {t.type === 'IN' ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                    </div>
                    <div className="flex-grow min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-sm text-slate-900 truncate">{t.materialName}</span>
                        <span className={cn(
                          "text-lg font-black tracking-tighter",
                          t.type === 'IN' ? 'text-blue-600' : 'text-slate-400'
                        )}>
                           {t.type === 'IN' ? '+' : '-'}{t.quantity}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                        {format(t.timestamp, 'HH:mm', { locale: es })} • {t.reason}
                      </p>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}

            {view === ViewMode.IMPORT && (
              <motion.div 
                key="import"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-10"
              >
                <div 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={cn(
                    "bg-white/70 backdrop-blur-sm p-16 rounded-[40px] text-slate-900 shadow-sm relative overflow-hidden group text-center transition-all duration-300 border-2 border-dashed border-slate-200",
                    isDragging ? "bg-blue-50 border-blue-400 ring-8 ring-blue-50" : "hover:border-slate-300"
                  )}
                >
                  <div className="w-24 h-24 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto mb-10 group-hover:scale-110 transition-transform">
                    <FileSpreadsheet size={40} className="text-blue-600" />
                  </div>
                  <h2 className="text-2xl font-black mb-4 tracking-tight text-slate-900">Sincronización de Datos</h2>
                  <p className="text-xs text-slate-400 mb-12 leading-relaxed font-medium max-w-xs mx-auto">
                    {isDragging ? "Suelta el archivo para comenzar" : "Arrastra tu archivo CSV o selecciona una opción de carga"}
                  </p>
                  
                  <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" className="hidden" />
                  
                  <div className="max-w-md mx-auto space-y-6">
                    <div className="flex items-center justify-center p-1.5 bg-slate-100 rounded-2xl">
                      <button 
                        onClick={() => setReplaceMode(false)}
                        className={cn(
                          "flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                          !replaceMode ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                        )}
                      >
                        Fusionar
                      </button>
                      <button 
                        onClick={() => setReplaceMode(true)}
                        className={cn(
                          "flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                          replaceMode ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                        )}
                      >
                        Reemplazar
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="py-6 font-black rounded-2xl bg-blue-600 text-white uppercase tracking-widest text-[11px] active:scale-95 transition-all flex items-center justify-center gap-3 shadow-lg shadow-blue-100 hover:bg-blue-700"
                      >
                        <FileUp size={18} /> Cargar
                      </button>
                      <button 
                        onClick={handleExport}
                        className="py-6 font-black rounded-2xl bg-white text-slate-900 border border-slate-200 uppercase tracking-widest text-[11px] active:scale-95 transition-all flex items-center justify-center gap-3 hover:border-slate-300 shadow-sm"
                      >
                        <DownloadCloud size={18} /> Exportar
                      </button>
                    </div>
                    
                    <button 
                      onClick={handleDownloadTemplate}
                      className="w-full py-5 font-black rounded-2xl bg-slate-50 text-slate-400 uppercase tracking-widest text-[10px] active:scale-95 transition-all flex items-center justify-center gap-3 hover:bg-slate-100 hover:text-slate-600"
                    >
                      <FileCode size={16} /> Descargar Plantilla
                    </button>
                  </div>
                </div>

                {isParsingCsv && (
                  <div className="flex flex-col items-center justify-center p-16 bg-white rounded-3xl border border-slate-100 shadow-sm animate-pulse">
                    <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-6"></div>
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Procesando Archivo...</p>
                  </div>
                )}

                {!isParsingCsv && (
                  <div className="bg-blue-50/50 p-8 rounded-3xl border border-blue-100 flex items-start gap-5">
                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                      <AlertTriangle className="text-blue-600" size={20} />
                    </div>
                    <div className="space-y-2">
                       <p className="text-[11px] font-black text-blue-900 uppercase tracking-widest">Sincronización Inteligente</p>
                       <p className="text-[10px] text-blue-700/60 leading-relaxed font-bold uppercase tracking-widest">El servidor validará el formato y actualizará la base de datos central de forma segura.</p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {view === ViewMode.BRANDING && (
              <motion.div 
                key="branding"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="space-y-10"
              >
                <div className="bg-white p-12 rounded-[40px] shadow-sm border border-slate-100 text-center">
                  <h2 className="text-[10px] font-black text-slate-400 mb-12 uppercase tracking-[0.5em]">Identidad Visual IA</h2>
                  
                  <div className="relative aspect-square w-full max-w-[320px] mx-auto mb-16">
                    <div className="relative w-full h-full bg-slate-50 rounded-[60px] border-8 border-white shadow-2xl flex items-center justify-center overflow-hidden group">
                      {isGeneratingIcon ? (
                        <div className="flex flex-col items-center gap-6">
                          <Zap size={48} className="text-blue-600 animate-pulse" />
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Generando...</span>
                        </div>
                      ) : appIcon ? (
                        <img src={appIcon} alt="Icono" className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-center space-y-4">
                          <ImageIcon size={64} className="text-slate-200 mx-auto" />
                          <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Sin Arte Generado</p>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-blue-600/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                    </div>
                  </div>

                  <button 
                    disabled={isGeneratingIcon}
                    onClick={async () => {
                       setIsGeneratingIcon(true);
                       try { setAppIcon(await generateAppIconAI()); showToast("Identidad actualizada"); } 
                       catch (e) { showToast("Error Generación", "error"); } 
                       finally { setIsGeneratingIcon(false); }
                    }}
                    className={cn(
                      "w-full py-6 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all border shadow-lg",
                      isGeneratingIcon 
                        ? 'bg-slate-100 text-slate-300 border-slate-200' 
                        : 'bg-slate-900 text-white border-slate-900 shadow-slate-200 hover:bg-slate-800'
                    )}
                  >
                    Generar Nueva Identidad
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div 
            key="toast"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={cn(
              "fixed bottom-24 left-8 right-8 md:left-auto md:right-8 md:w-80 z-[200] p-6 rounded-2xl shadow-2xl flex items-center gap-4 border",
              toast.type === 'success' ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-red-100 text-red-600',
            )}
          >
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
              toast.type === 'success' ? 'bg-white/10' : 'bg-red-50'
            )}>
               {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            </div>
            <span className="font-bold text-[11px] uppercase tracking-widest leading-tight">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showModal !== 'NONE' && (
          <motion.div 
            key="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6" 
            onClick={stopScanner}
          >
            <motion.div 
              key="modal-content"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl max-h-[90vh] overflow-y-auto border border-white" 
              onClick={e => e.stopPropagation()}
            >
            <div className="p-10 relative">
              <div className="flex justify-between items-center mb-12">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                  <h2 className="text-[11px] font-black text-slate-900 tracking-widest uppercase">
                    {showModal === 'MOVE' ? 'Ajuste de Stock' : 'Escaneo de Código'}
                  </h2>
                </div>
                <button onClick={stopScanner} className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center hover:bg-slate-100 hover:text-slate-900 transition-colors"><X size={20}/></button>
              </div>

              {showModal === 'SCAN' && (
                <div key="modal-scan" className="space-y-10 text-center">
                  <div className="relative aspect-square w-full max-w-xs mx-auto bg-slate-900 rounded-[40px] overflow-hidden shadow-2xl border-8 border-white">
                    <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-48 h-48 border-2 border-white/20 rounded-3xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-blue-400 shadow-[0_0_20px_#60a5fa] animate-[scanLine_2s_infinite]"></div>
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Apunta al código para detectar automáticamente</p>
                </div>
              )}

              {showModal === 'MOVE' && selectedMaterial && (
                <div key="modal-move" className="space-y-12 text-center pb-6">
                  <div className="space-y-3">
                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-4 py-1.5 rounded-full">{selectedMaterial.subcategory || selectedMaterial.category}</span>
                    <h3 className="text-3xl font-black text-slate-900 tracking-tight block pt-2 truncate">{selectedMaterial.name}</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Stock Actual: {selectedMaterial.currentStock} {selectedMaterial.unit}</p>
                  </div>
                  
                  <div className="relative max-w-[200px] mx-auto">
                    <input type="number" className="w-full p-8 text-7xl font-black text-center bg-slate-50 rounded-3xl text-slate-900 border-b-4 border-blue-600 outline-none" value={moveQty} onChange={(e) => setMoveQty(Math.max(1, Number(e.target.value)))} min="1" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-300 mt-6">Cantidad a {moveType === 'IN' ? 'Ingresar' : 'Retirar'}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 pt-6">
                    <button onClick={() => setShowModal('NONE')} className="py-6 font-black text-[11px] text-slate-400 uppercase tracking-widest rounded-2xl bg-slate-50 hover:bg-slate-100 transition-all">Cancelar</button>
                    <button onClick={async () => {
                      const qty = Number(moveQty);
                      const newStock = moveType === 'IN' ? selectedMaterial.currentStock + qty : selectedMaterial.currentStock - qty;
                      if (newStock < 0) { showToast("Stock Insuficiente", "error"); return; }
                      
                      try {
                        await (db as any).transaction('rw', [db.materials, db.transactions], async () => {
                          await db.materials.update(selectedMaterial.id!, { currentStock: newStock, lastUpdated: Date.now() });
                          await db.transactions.add({ materialId: selectedMaterial.id!, materialName: selectedMaterial.name, type: moveType, quantity: qty, timestamp: Date.now(), reason: 'Ajuste Manual' });
                        });
                        
                        const updatedMaterials = await db.materials.toArray();
                        const updatedTransactions = await db.transactions.orderBy('timestamp').reverse().toArray();
                        setMaterials(updatedMaterials);
                        setTransactions(updatedTransactions);
                        await syncToBackend(updatedMaterials, updatedTransactions);
                        
                        showToast(`${moveType === 'IN' ? 'Ingreso' : 'Egreso'} de ${qty} unidades`); 
                        setShowModal('NONE'); 
                      } catch (e) { showToast("Error de Transacción", "error"); }
                    }} className={cn(
                      "py-6 font-black text-[11px] text-white rounded-2xl shadow-xl uppercase tracking-widest active:scale-95 transition-all",
                      moveType === 'IN' ? 'bg-blue-600 shadow-blue-100 hover:bg-blue-700' : 'bg-slate-900 shadow-slate-200 hover:bg-slate-800'
                    )}>
                       {moveType === 'IN' ? 'Confirmar Ingreso' : 'Confirmar Egreso'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
        )}
      </AnimatePresence>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}</style>
    </Layout>
  );
};

export default App;
