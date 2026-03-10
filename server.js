import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Servir archivos estáticos desde dist
app.use(express.static(join(__dirname, 'dist')));

// Rutas explícitas para archivos críticos de PWA para asegurar tipos MIME correctos
app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.sendFile(join(__dirname, 'dist', 'manifest.json'));
});

app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(join(__dirname, 'dist', 'sw.js'));
});

// SPA Fallback: Cualquier otra ruta sirve index.html
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
🚀 Servidor de Producción iniciado:
----------------------------------
URL: http://localhost:${PORT}
Modo: PWA Ready (PWABuilder Optimized)
----------------------------------
  `);
});