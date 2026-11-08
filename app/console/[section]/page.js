"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { apiDownload, apiRequest } from "../../lib/api";
import ModuleView from "../../components/ModuleView";
import { supabase } from "../../lib/supabase";

export default function ConsoleSectionPage() {
  const section = usePathname().split("/")[2] || "dashboard";
  const [user, setUser] = useState(null);

  useEffect(() => {
    let active = true;
    if (!supabase) return () => { active = false; };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active || !session) return;
      queueMicrotask(async () => {
        try {
          const current = await apiRequest("/auth/me");
          if (active) setUser(current.user);
        } catch {}
      });
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  return <ModuleView section={section} user={user} apiRequest={apiRequest} apiDownload={apiDownload} />;
}
