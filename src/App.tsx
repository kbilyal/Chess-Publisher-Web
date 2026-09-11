import React, { useMemo } from 'react';
import { useOnlineCloud } from './cloud/OnlineCloudProvider';
import { CompanionWorkspace } from './companion/CompanionWorkspace';
import { createCompanionCloudFacade } from './companion/companionCloudActions';
import { installWebCloudLineageWriteGuard, protectCompanionCloudFacade } from './companion/webCloudLineageHandoff';
import { PwaInstallPrompt } from './pwa/PwaInstallPrompt';
import { OrganizerArbiterPanel } from './arbiter/OrganizerArbiterPanel';
import { OrganizerPairingsReadOnly } from './arbiter/OrganizerPairingsReadOnly';

installWebCloudLineageWriteGuard();

export default function App() {
  const cloud = useOnlineCloud();
  const companionCloud = useMemo(
    () => protectCompanionCloudFacade(createCompanionCloudFacade(cloud)),
    [cloud]
  );
  return (
    <>
      <CompanionWorkspace cloud={companionCloud} />
      <OrganizerPairingsReadOnly cloud={cloud} />
      <OrganizerArbiterPanel cloud={cloud} />
      <PwaInstallPrompt />
    </>
  );
}