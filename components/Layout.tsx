
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  LayoutDashboard, 
  Package, 
  History, 
  FileUp,
  ChevronRight,
  ChevronDown,
  Palette,
  Layers,
  Box
} from 'lucide-react';
import { ViewMode } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeView: ViewMode;
  onNavigate: (view: ViewMode) => void;
  title: string;
  selectedCategory: string;
  selectedSubcategory: string;
  onFilterChange: (category: string, subcategory: string) => void;
  menuStructure: { category: string, subcategories: string[] }[];
}

const Layout: React.FC<LayoutProps> = ({ 
  children, 
  activeView, 
  onNavigate, 
  selectedCategory, 
  selectedSubcategory,
  onFilterChange,
  menuStructure
}) => {
  const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
  const [expandedCats, setExpandedCats] = useState<string[]>([]);

  const toggleCat = (cat: string) => {
    setExpandedCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

  const handleSubClick = (cat: string, sub: string) => {
    onFilterChange(cat, sub);
    onNavigate(ViewMode.INVENTORY);
  };

  const handleAllClick = () => {
    onFilterChange('Todas', 'Todas');
    onNavigate(ViewMode.INVENTORY);
  };

  return (
    <div className="flex h-screen bg-transparent text-slate-900 overflow-hidden">
      {/* Persistent Sidebar */}
      <aside className="w-72 bg-white/60 backdrop-blur-md border-r border-slate-200 flex flex-col hidden md:flex">
        <div className="p-8 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
            <Box size={24} />
          </div>
          <div>
            <h1 className="font-black text-sm tracking-tight text-slate-900">StockPro</h1>
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Conxo v2</p>
          </div>
        </div>

        <nav className="flex-grow overflow-y-auto p-6 space-y-8 custom-scrollbar">
          <div className="space-y-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-4 mb-4">Menú Principal</p>
            <SidebarNavItem 
              icon={<LayoutDashboard size={18} />} 
              label="Dashboard" 
              active={activeView === ViewMode.DASHBOARD} 
              onClick={() => {
                onFilterChange('Todas', 'Todas');
                onNavigate(ViewMode.DASHBOARD);
              }} 
            />
            <SidebarNavItem 
              icon={<Package size={18} />} 
              label="Inventario" 
              active={activeView === ViewMode.INVENTORY} 
              onClick={() => {
                onFilterChange('Todas', 'Todas');
                onNavigate(ViewMode.INVENTORY);
              }} 
            />
            <SidebarNavItem icon={<History size={18} />} label="Historial" active={activeView === ViewMode.HISTORY} onClick={() => onNavigate(ViewMode.HISTORY)} />
            <SidebarNavItem icon={<FileUp size={18} />} label="Importar" active={activeView === ViewMode.IMPORT} onClick={() => onNavigate(ViewMode.IMPORT)} />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between px-4 mb-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Categorías</p>
              <button onClick={handleAllClick} className="text-[9px] font-bold text-blue-600 hover:underline uppercase tracking-wider">Ver Todo</button>
            </div>
            
            {menuStructure.map((item) => (
              <div key={item.category} className="space-y-1">
                <button 
                  onClick={() => {
                    onFilterChange(item.category, 'Todas');
                    onNavigate(ViewMode.INVENTORY);
                    if (item.subcategories.length > 0) toggleCat(item.category);
                  }}
                  className={cn(
                    "flex items-center justify-between w-full p-3 px-4 rounded-xl text-[11px] font-bold transition-all group",
                    selectedCategory === item.category 
                      ? 'bg-blue-50 text-blue-700' 
                      : 'text-slate-600 hover:bg-slate-50'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full transition-all",
                      selectedCategory === item.category ? 'bg-blue-600' : 'bg-slate-300 group-hover:bg-slate-400'
                    )} />
                    <span>{item.category}</span>
                  </div>
                  {item.subcategories.length > 0 && (
                    <ChevronDown size={14} className={cn("transition-transform", expandedCats.includes(item.category) ? "rotate-180" : "")} />
                  )}
                </button>
                
                <AnimatePresence>
                  {expandedCats.includes(item.category) && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden ml-4 border-l border-slate-100"
                    >
                      {item.subcategories.map(sub => (
                        <button 
                          key={sub}
                          onClick={() => handleSubClick(item.category, sub)}
                          className={cn(
                            "flex items-center gap-3 w-full p-2.5 px-4 text-[10px] font-semibold transition-all text-left rounded-r-lg",
                            selectedCategory === item.category && selectedSubcategory === sub 
                              ? 'text-blue-600 bg-blue-50/50' 
                              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                          )}
                        >
                          {sub}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </nav>
        
        <div className="p-6 border-t border-slate-100">
          <button 
            onClick={() => onNavigate(ViewMode.BRANDING)}
            className={cn(
              "flex items-center gap-3 w-full p-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm border",
              activeView === ViewMode.BRANDING 
                ? 'bg-slate-900 text-white border-slate-900 shadow-slate-200' 
                : 'bg-white text-slate-600 border-slate-100 hover:border-slate-200'
            )}
          >
            <Palette size={16} /> Identidad Visual
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-grow flex flex-col min-w-0">
        <header className="h-20 bg-white/60 backdrop-blur-lg border-b border-slate-200 px-8 flex justify-between items-center sticky top-0 z-40">
          <div className="flex items-center gap-4 md:hidden">
             <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                <Box size={18} />
             </div>
             <h1 className="font-black text-xs tracking-tighter">StockPro</h1>
          </div>
          
          <div className="hidden md:block">
            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              {activeView === ViewMode.DASHBOARD ? 'Panel de Control' : 
               activeView === ViewMode.INVENTORY ? 'Gestión de Inventario' :
               activeView === ViewMode.HISTORY ? 'Registro de Actividad' : 'Configuración de Sistema'}
            </h2>
          </div>

          <div className="flex items-center gap-4">
            <div className="px-4 py-2 bg-blue-50 rounded-full border border-blue-100 hidden sm:flex items-center gap-2">
               <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
               <span className="text-[9px] font-black text-blue-700 uppercase tracking-widest">En Línea</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden">
               <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent('sampayo@gmail.com')}`} alt="Avatar" className="w-full h-full" />
            </div>
          </div>
        </header>

        <main className="flex-grow p-6 md:p-10 overflow-y-auto custom-scrollbar bg-transparent">
          <div className="max-w-5xl mx-auto">
            {children}
          </div>
        </main>

        {/* Mobile Navigation Bar */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-slate-200 flex justify-around items-center h-20 px-4 z-50 safe-pb shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
          <MobileNavItem icon={<LayoutDashboard size={20} />} active={activeView === ViewMode.DASHBOARD} onClick={() => onNavigate(ViewMode.DASHBOARD)} />
          <MobileNavItem icon={<Package size={20} />} active={activeView === ViewMode.INVENTORY} onClick={() => onNavigate(ViewMode.INVENTORY)} />
          <MobileNavItem icon={<History size={20} />} active={activeView === ViewMode.HISTORY} onClick={() => onNavigate(ViewMode.HISTORY)} />
          <MobileNavItem icon={<FileUp size={20} />} active={activeView === ViewMode.IMPORT} onClick={() => onNavigate(ViewMode.IMPORT)} />
        </nav>
      </div>
    </div>
  );
};

const SidebarNavItem: React.FC<{ icon: React.ReactNode; label: string; active: boolean; onClick: () => void }> = ({ icon, label, active, onClick }) => {
  return (
    <button 
      onClick={onClick} 
      className={twMerge(
        "flex items-center gap-3 w-full p-3.5 px-4 rounded-xl text-[11px] font-bold transition-all",
        active 
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' 
          : 'text-slate-600 hover:bg-slate-50'
      )}
    >
      {icon}
      <span>{label}</span>
      {active && <motion.div layoutId="sidebar-active" className="ml-auto w-1.5 h-1.5 bg-white rounded-full" />}
    </button>
  );
};

const MobileNavItem: React.FC<{ icon: React.ReactNode; active: boolean; onClick: () => void }> = ({ icon, active, onClick }) => {
  return (
    <button 
      onClick={onClick} 
      className={twMerge(
        "flex flex-col items-center justify-center w-14 h-14 rounded-2xl transition-all relative",
        active ? 'text-blue-600 bg-blue-50' : 'text-slate-400'
      )}
    >
      {icon}
      {active && (
        <motion.div 
          layoutId="mobile-nav-active"
          className="absolute -top-2 w-1 h-1 bg-blue-600 rounded-full"
        />
      )}
    </button>
  );
};

export default Layout;
