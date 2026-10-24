"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { apiDownload, apiRequest } from "../../lib/api";
import ModuleView from "../../components/ModuleView";

export default function ConsoleSectionPage() {
  const section = usePathname().split("/")[2] || "dashboard";
  const [user, setUser] = useState(null);

  useEffect(() => {
    let active = true;
    apiRequest("/auth/me").then((data) => { if (active) setUser(data.user); }).catch(() => {});
    return () => { active = false; };
  }, []);

  return <ModuleView section={section} user={user} apiRequest={apiRequest} apiDownload={apiDownload} />;
}