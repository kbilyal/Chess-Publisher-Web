import React, { useMemo } from 'react';
import { useOnlineCloud } from './cloud/OnlineCloudProvider';
import { CompanionWorkspace } from './companion/CompanionWorkspace';
import { createCompanionCloudFacade } from './companion/companionCloudActions';
import { PwaInstallPrompt } from './pwa/PwaInstallPrompt';
import { OrganizerArbiterPanel } from './arbiter/OrganizerArbiterPanel';

export default function App() {
  const cloud = useOnlineCloud();
  const companionCloud = useMemo(() => createCompanionCloudFacade(cloud), [cloud]);
  return (
    <>
      <CompanionWorkspace cloud={companionCloud} />
      <OrganizerArbiterPanel cloud={cloud} />
      <PwaInstallPrompt />
    </>
  );
}