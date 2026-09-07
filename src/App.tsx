import React from 'react';
import { useOnlineCloud } from './cloud/OnlineCloudProvider';
import { CompanionWorkspace } from './companion/CompanionWorkspace';

export default function App() {
  const cloud = useOnlineCloud();
  return <CompanionWorkspace cloud={cloud} />;
}
