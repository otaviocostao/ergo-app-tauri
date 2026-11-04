import { useEffect, useState } from "react";
import { useMatch } from "react-router-dom";
import Monitoring from "../../pages/Monitoring";

/** Keeps capture and recording alive after the monitoring route is first visited. */
export default function MonitoringWorkspace() {
  const isVisible = useMatch("/monitoring") !== null;
  const [hasVisited, setHasVisited] = useState(isVisible);

  useEffect(() => {
    if (isVisible) setHasVisited(true);
  }, [isVisible]);

  if (!hasVisited && !isVisible) return null;

  return (
    <div hidden={!isVisible}>
      <Monitoring isVisible={isVisible} />
    </div>
  );
}
