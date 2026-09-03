import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './cloud/installStudioApiAuth';
import App from './App.tsx';
import {OnlineCloudProvider} from './cloud/OnlineCloudProvider';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OnlineCloudProvider>
      <App />
    </OnlineCloudProvider>
  </StrictMode>,
);
