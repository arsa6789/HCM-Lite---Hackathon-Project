"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { apiDownload, apiRequest } from "../../lib/api";
import ModuleView from "../../components/ModuleView";
import { onAuthStateChanged } from "firebase/auth";
import { firebaseAuth } from "../../lib/firebase";

export default function ConsoleSectionPage() {
  const section = usePathname().split("/")[2] || "dashboard";
  const [user, setUser] = useState(null);

  useEffect(() => {
    let active = true;
    if (!firebaseAuth) return () => { active = false; };
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (authUser) => {
      if (!active || !authUser) return;
      try {
        const session = await apiRequest("/auth/me");
        if (active) setUser(session.user);
      } catch {}
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  return <ModuleView section={section} user={user} apiRequest={apiRequest} apiDownload={apiDownload} />;
}