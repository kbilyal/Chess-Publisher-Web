import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './cloud/installOrganizerApiAuth';
import './pwa/registerPwa';
import App from './App.tsx';
import {OnlineCloudProvider} from './cloud/OnlineCloudProvider';
import './index.css';
import './companion.css';
import './companion-cloud.css';
import './companion-publish-v2.css';
import './companion-registration.css';
import './companion-setup.css';
import './companion-conflict.css';
import './mobile-native.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OnlineCloudProvider>
      <App />
    </OnlineCloudProvider>
  </StrictMode>,
);