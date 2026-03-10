
import { Material } from './types';

/**
 * Hook para la gestión de formatos CSV en el "backend" local (IndexedDB).
 * Centraliza la lógica de formatos sincronizados para carga, descarga y plantillas inteligentes.
 */
export const useCSV = () => {
  
  // Cabecera estándar estricta para sincronización
  const CSV_HEADERS = ['Nombre', 'Categoria', 'Subcategoria', 'Unidad', 'StockActual', 'StockMinimo'];

  /**
   * Procesa un string CSV y lo convierte en objetos de tipo Material.
   */
  const parseCSV = (content: string): Material[] => {
    // Handle different line endings (\r\n or \n)
    const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 1) throw new Error("Archivo CSV vacío.");
    
    // Check if the first line is a header and skip it if it matches our headers
    let dataLines = lines;
    const firstLine = lines[0].toLowerCase();
    if (firstLine.includes('nombre') || firstLine.includes('categoria')) {
      dataLines = lines.slice(1);
    }

    const parsed: Material[] = [];

    dataLines.forEach(line => {
      // Handle CSV with commas, ensuring we don't break on empty columns
      const columns = line.split(',').map(c => c.trim());
      if (columns.length >= 6) {
        const name = columns[0];
        const category = columns[1];
        const subcategory = columns[2];
        const unit = columns[3];
        const currentStock = Number(columns[4]);
        const minStock = Number(columns[5]);

        if (name && category && subcategory) {
          parsed.push({
            name,
            category,
            subcategory,
            unit: unit || 'u',
            currentStock: isNaN(currentStock) ? 0 : currentStock,
            minStock: isNaN(minStock) ? 0 : minStock,
            description: '',
            lastUpdated: Date.now()
          });
        }
      }
    });

    if (parsed.length === 0) throw new Error("No se encontraron datos válidos en el CSV.");
    return parsed;
  };

  /**
   * Genera un string CSV a partir de la lista de materiales actual.
   */
  const generateCSV = (data: Material[]): string => {
    const rows = data.map(m => [
      m.name,
      m.category,
      m.subcategory,
      m.unit,
      m.currentStock,
      m.minStock
    ].join(','));

    return [CSV_HEADERS.join(','), ...rows].join('\n');
  };

  /**
   * Genera una plantilla inteligente con ejemplos basados en la estructura del layout.
   */
  const generateTemplate = (menuStructure: { category: string, subcategories: string[] }[]): string => {
    const exampleRows = menuStructure.map(({ category, subcategories }) => {
      return subcategories.map(sub => [
        `Ejemplo ${sub}`,
        category,
        sub,
        'unidades',
        '10',
        '2'
      ].join(',')).join('\n');
    }).join('\n');

    return [CSV_HEADERS.join(','), exampleRows].join('\n');
  };

  /**
   * Dispara la descarga de archivos generados.
   */
  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return {
    parseCSV,
    generateCSV,
    generateTemplate,
    downloadFile
  };
};
