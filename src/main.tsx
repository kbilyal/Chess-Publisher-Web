import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {CloudWorkspaceBootstrap} from './cloud/CloudWorkspaceBootstrap';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CloudWorkspaceBootstrap>
      <App />
    </CloudWorkspaceBootstrap>
  </StrictMode>,
);
