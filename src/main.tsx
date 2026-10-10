import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts';
import './styles/tokens.css';
import './styles/base.css';
import { App } from './App';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Mahtem: #root element missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
