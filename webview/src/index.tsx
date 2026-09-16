import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// Imported here, ahead of the workbench stylesheet, so that our flatpickr
// overrides always come later in the bundle. Toolbars.tsx imports this too;
// esbuild hoists every CSS import of a module graph into one file, and the
// de-duplicated rule keeps the position of the *first* import, so the ordering
// has to be stated by the entry point.
import 'flatpickr/dist/flatpickr.css';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Git Log root element was not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
