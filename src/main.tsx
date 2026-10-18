import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { BackendReadinessProvider } from './context/BackendReadinessContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <BackendReadinessProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BackendReadinessProvider>
    </BrowserRouter>
  </React.StrictMode>
);

