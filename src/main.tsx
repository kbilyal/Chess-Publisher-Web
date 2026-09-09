import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './cloud/installOrganizerApiAuth';
import './pwa/registerPwa';
import App from './App.tsx';
import {OnlineCloudProvider} from './cloud/OnlineCloudProvider';
import {ArbiterPortal} from './arbiter/ArbiterPortal';
import './index.css';
import './companion.css';
import './companion-cloud.css';
import './companion-publish-v2.css';
import './companion-registration.css';
import './companion-setup.css';
import './companion-conflict.css';
import './mobile-native.css';
import './companion-desktop.css';
import './arbiter/arbiter.css';
import './arbiter/organizer-pairings.css';
import './arbiter/organizer-pairings-print.css';
import './arbiter/arbiter-ui-fixes.css';

const isArbiterAccess = new URLSearchParams(window.location.search).has('arbiter');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isArbiterAccess ? (
      <ArbiterPortal />
    ) : (
      <OnlineCloudProvider>
        <App />
      </OnlineCloudProvider>
    )}
  </StrictMode>,
);