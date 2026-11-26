import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Druck, druckAuftrag } from './Druck';
import './styles.css';

const wurzel = document.getElementById('app');
if (!wurzel) throw new Error('Element #app fehlt');
const auftrag = druckAuftrag();
createRoot(wurzel).render(
  <StrictMode>{auftrag ? <Druck auftrag={auftrag} /> : <App />}</StrictMode>,
);
