import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import Monitoring from "../../pages/Monitoring";

/** Keeps capture and recording alive after the monitoring route is first visited. */
export default function MonitoringWorkspace() {
  const { pathname } = useLocation();
  const isVisible = pathname === "/monitoring" || pathname === "/monitoring/";
  const [hasVisited, setHasVisited] = useState(isVisible);

  useEffect(() => {
    if (isVisible) setHasVisited(true);
  }, [isVisible]);

  if (!hasVisited && !isVisible) return null;

  return (
    <div hidden={!isVisible}>
      <Monitoring />
    </div>
  );
}
