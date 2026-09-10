import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/gasoek-one';
import '@fontsource-variable/noto-sans-kr';
import '../tokens.css';
import './styles.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
