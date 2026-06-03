import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useMaintenanceMode } from "@/hooks/use-maintenance-mode";
import { toast } from "sonner";

type LoadedComponent = React.ComponentType<any> | null;

const ROUTE_PATHS = [
  "/",
  "/auth",
  "/auth/callback",
  "/oauth/callback",
  "/dashboard",
  "/profile",
  "/settings",
  "/settings/account",
  "/analytics",
  "/security",
  "/storage",
  "/developer-api",
  "/extensions",
  "/cc/api/status",
  "/cbcode/:folderId?",
  "/cb/pdf/viewer/:id",
  "/s/:shareId",
  "/share/:shareId",
  "/file/:id",
  "/onboarding",
  "/r/c/:count",
  "/repo/create",
  "/ad/u1/get_ad/auth",
  "/ad/u1/get_ad/dash",
  "/terms",
  "/privacy",
  "/legal/tos",
  "/legal/privacy",
  "/help/docs",
  "/help/docs/:slug",
  "/help/docs/notes",
  "/help/docs/notes/:id",
  "*",
];

const pageModules = import.meta.glob("../pages/*.tsx");
const componentModules = import.meta.glob("./**/*.tsx");

const normalizePathName = (path: string) =>
  path
    .split("/")
    .pop()
    ?.replace(".tsx", "")
    .replace(".disabled", "") || path;

const toNavigableRoute = (route: string) =>
  route
    .replace(/\*/g, "/")
    .replace(/:([A-Za-z0-9_]+)\?/g, "")
    .replace(/:([A-Za-z0-9_]+)/g, "dev")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "") || "/";

const getFirstRenderableExport = (mod: any): LoadedComponent => {
  if (typeof mod?.default === "function") return mod.default;
  const candidate = Object.values(mod || {}).find((v) => typeof v === "function");
  return (candidate as LoadedComponent) || null;
};

class PreviewBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(prevProps: { children: React.ReactNode }) {
    if (prevProps.children !== this.props.children && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return <div style={{ color: "#ff9999" }}>requires props.</div>;
    }
    return this.props.children;
  }
}

const AdminDevPanel = () => {
  const { user, profile, refreshSession, signOut } = useAuth();
  const navigate = useNavigate();
  const { maintenanceMode, updateMaintenanceMode } = useMaintenanceMode();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "routes" | "pages" | "components" | "flags" | "auth" | "supabase" | "tools"
  >("routes");
  const [previewLabel, setPreviewLabel] = useState("none");
  const [PreviewComponent, setPreviewComponent] = useState<LoadedComponent>(null);

  const isAdmin = Boolean(user && profile?.is_admin);
  const clipId = "devcmds-squircle-clip";

  const pageEntries = useMemo(
    () =>
      Object.entries(pageModules).map(([path, loader]) => ({
        path,
        name: normalizePathName(path),
        loader,
      })),
    []
  );

  const componentEntries = useMemo(
    () =>
      Object.entries(componentModules)
        .filter(([path]) => !path.includes("AdminDevPanel.tsx"))
        .map(([path, loader]) => ({
          path,
          name: path.replace("./", ""),
          shortName: normalizePathName(path),
          loader,
        })),
    []
  );

  const envEntries = useMemo(
    () =>
      Object.entries(import.meta.env).filter(([key]) => key.startsWith("VITE_")),
    []
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!isAdmin) {
      setOpen(false);
    }
  }, [isAdmin]);

  if (!isAdmin) return null;

  const loadPreview = async (loader: () => Promise<any>, label: string) => {
    const mod = await loader();
    const component = getFirstRenderableExport(mod);
    setPreviewLabel(label);
    setPreviewComponent(() => component);
  };

  const roleSwitch = async (role: "admin" | "user" | "guest") => {
    if (!user) return;
    if (role === "guest") {
      await signOut();
      navigate("/");
      return;
    }
    await supabase
      .from("profiles")
      .update({ is_admin: role === "admin" })
      .eq("id", user.id);
    if (role === "admin") {
      localStorage.setItem("admin_session_verified", Date.now().toString());
    } else {
      localStorage.removeItem("admin_session_verified");
    }
    await refreshSession();
    window.location.reload();
  };

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const projectRef = (() => {
    try {
      if (!supabaseUrl) return "";
      return new URL(supabaseUrl).hostname.split(".")[0];
    } catch {
      return "";
    }
  })();

  const openSupabaseDashboard = () => {
    if (!projectRef) {
      toast.error('Supabase project reference is missing. Set VITE_SUPABASE_URL to your Supabase project URL.');
      return;
    }
    window.open(
      `https://supabase.com/dashboard/project/${projectRef}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const manualSessionRefresh = async () => {
    await supabase.auth.refreshSession();
    await refreshSession();
  };

  const clearAll = async () => {
    try {
      await supabase.auth.signOut({ scope: "local" as any });
    } catch {
      // intentionally ignored
    }
    localStorage.clear();
    sessionStorage.clear();
    if ("caches" in window) {
      try {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((key) => caches.delete(key)));
      } catch {
        // intentionally ignored
      }
    }
    window.location.reload();
  };

  return (
    <>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <clipPath id={clipId} clipPathUnits="objectBoundingBox">
            <path d="M0.5,0.03 C0.73,0.03 0.84,0.03 0.91,0.10 C0.97,0.16 0.97,0.27 0.97,0.5 C0.97,0.73 0.97,0.84 0.91,0.90 C0.84,0.97 0.73,0.97 0.5,0.97 C0.27,0.97 0.16,0.97 0.09,0.90 C0.03,0.84 0.03,0.73 0.03,0.5 C0.03,0.27 0.03,0.16 0.09,0.10 C0.16,0.03 0.27,0.03 0.5,0.03 Z" />
          </clipPath>
        </defs>
      </svg>

      <div
        style={{
          position: "fixed",
          right: "18px",
          bottom: "18px",
          zIndex: 2147482000,
          pointerEvents: "none",
        }}
      >
        <button
          type="button"
          title="devCMDS"
          aria-label="devCMDS"
          onClick={() => setOpen((v) => !v)}
          style={{
            width: "54px",
            height: "54px",
            border: "1px solid #2e3640",
            background: "#0f141a",
            color: "#d8e1ea",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            boxShadow: "0 4px 10px rgba(0,0,0,0.25)",
            clipPath: `url(#${clipId})`,
            pointerEvents: "auto",
          }}
        >
          <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden="true">
            <rect x="0" y="0" width="64" height="64" fill="#0f141a" />
            <ellipse cx="31" cy="48" rx="19" ry="6" fill="#d6b071" />
            <path d="M31 21 C33 28, 34 34, 33 48 L29 48 C30 36, 29 28, 27 21 Z" fill="#8b5a2b" />
            <path d="M31 22 C38 15, 46 14, 52 18 C44 20, 37 22, 31 22 Z" fill="#3aa56d" />
            <path d="M31 22 C38 20, 48 23, 54 29 C45 28, 37 26, 31 22 Z" fill="#2f8f5f" />
            <path d="M31 22 C26 15, 18 13, 11 16 C18 18, 25 21, 31 22 Z" fill="#49b57a" />
            <path d="M31 22 C26 20, 16 22, 9 28 C18 27, 25 25, 31 22 Z" fill="#3aa56d" />
            <circle cx="16" cy="16" r="4" fill="#f1df9d" />
          </svg>
        </button>
      </div>

      {open && (
        <div
          style={{
            position: "fixed",
            right: "18px",
            bottom: "84px",
            width: "min(900px, calc(100vw - 28px))",
            maxHeight: "80vh",
            overflow: "auto",
            zIndex: 2147482001,
            background: "#111",
            color: "#ddd",
            border: "1px solid #4a4a4a",
            padding: "10px",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "12px",
          }}
        >
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
            {["routes", "pages", "components", "flags", "auth", "supabase", "tools"].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab as any)}
                style={{
                  border: "1px solid #505050",
                  background: activeTab === tab ? "#222" : "#171717",
                  color: "#ddd",
                  padding: "4px 7px",
                  cursor: "pointer",
                }}
              >
                {tab}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                marginLeft: "auto",
                border: "1px solid #505050",
                background: "#171717",
                color: "#ddd",
                padding: "4px 7px",
                cursor: "pointer",
              }}
            >
              close
            </button>
          </div>

          {activeTab === "routes" && (
            <div style={{ display: "grid", gap: "4px" }}>
              {ROUTE_PATHS.map((route) => (
                <button
                  key={route}
                  type="button"
                  onClick={() => navigate(toNavigableRoute(route))}
                  style={{
                    textAlign: "left",
                    border: "1px solid #3d3d3d",
                    background: "#151515",
                    color: "#ddd",
                    padding: "5px",
                    cursor: "pointer",
                  }}
                >
                  {route}
                </button>
              ))}
            </div>
          )}

          {activeTab === "pages" && (
            <div style={{ display: "grid", gap: "4px" }}>
              {pageEntries.map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() => loadPreview(entry.loader as () => Promise<any>, `page:${entry.name}`)}
                  style={{
                    textAlign: "left",
                    border: "1px solid #3d3d3d",
                    background: "#151515",
                    color: "#ddd",
                    padding: "5px",
                    cursor: "pointer",
                  }}
                >
                  {entry.name}
                </button>
              ))}
            </div>
          )}

          {activeTab === "components" && (
            <div style={{ display: "grid", gap: "4px" }}>
              {componentEntries.map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() =>
                    loadPreview(entry.loader as () => Promise<any>, `component:${entry.shortName}`)
                  }
                  style={{
                    textAlign: "left",
                    border: "1px solid #3d3d3d",
                    background: "#151515",
                    color: "#ddd",
                    padding: "5px",
                    cursor: "pointer",
                  }}
                >
                  {entry.name}
                </button>
              ))}
            </div>
          )}

          {activeTab === "flags" && (
            <div style={{ display: "grid", gap: "8px" }}>
              <div style={{ border: "1px solid #3d3d3d", padding: "6px" }}>
                <div>maintenance_mode: {maintenanceMode.enabled ? "on" : "off"}</div>
                <button
                  type="button"
                  onClick={() => updateMaintenanceMode(!maintenanceMode.enabled, maintenanceMode.message)}
                  style={{
                    marginTop: "6px",
                    border: "1px solid #505050",
                    background: "#151515",
                    color: "#ddd",
                    padding: "4px 7px",
                    cursor: "pointer",
                  }}
                >
                  toggle maintenance_mode
                </button>
              </div>

              <div style={{ border: "1px solid #3d3d3d", padding: "6px" }}>
                <div style={{ marginBottom: "4px" }}>env toggles:</div>
                {envEntries.map(([key, value]) => (
                  <div key={key}>
                    {key}: {String(value || "(empty)")}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "auth" && (
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => roleSwitch("admin")}
                style={{
                  border: "1px solid #505050",
                  background: "#151515",
                  color: "#ddd",
                  padding: "5px 8px",
                  cursor: "pointer",
                }}
              >
                switch role: admin
              </button>
              <button
                type="button"
                onClick={() => roleSwitch("user")}
                style={{
                  border: "1px solid #505050",
                  background: "#151515",
                  color: "#ddd",
                  padding: "5px 8px",
                  cursor: "pointer",
                }}
              >
                switch role: user
              </button>
              <button
                type="button"
                onClick={() => roleSwitch("guest")}
                style={{
                  border: "1px solid #505050",
                  background: "#151515",
                  color: "#ddd",
                  padding: "5px 8px",
                  cursor: "pointer",
                }}
              >
                switch role: guest
              </button>
            </div>
          )}

          {activeTab === "supabase" && (
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={openSupabaseDashboard}
                style={{
                  border: "1px solid #505050",
                  background: "#151515",
                  color: "#ddd",
                  padding: "5px 8px",
                  cursor: "pointer",
                }}
              >
                open supabase dashboard
              </button>
              <button
                type="button"
                onClick={manualSessionRefresh}
                style={{
                  border: "1px solid #505050",
                  background: "#151515",
                  color: "#ddd",
                  padding: "5px 8px",
                  cursor: "pointer",
                }}
              >
                manual session refresh
              </button>
            </div>
          )}

          {activeTab === "tools" && (
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={clearAll}
                style={{
                  border: "1px solid #505050",
                  background: "#2a1414",
                  color: "#ffcccc",
                  padding: "5px 8px",
                  cursor: "pointer",
                }}
              >
                CLEAR ALL
              </button>
            </div>
          )}

          <div style={{ marginTop: "10px", borderTop: "1px solid #3d3d3d", paddingTop: "8px" }}>
            <div style={{ marginBottom: "5px" }}>preview: {previewLabel}</div>
            <div
              style={{
                border: "1px solid #3d3d3d",
                background: "#0c0c0c",
                minHeight: "120px",
                maxHeight: "40vh",
                overflow: "auto",
                padding: "8px",
              }}
            >
              {!PreviewComponent && <div>select a page/component to preview</div>}
              {PreviewComponent && (
                <PreviewBoundary>
                  <PreviewComponent
                    onClick={() => {}}
                    onClose={() => {}}
                    onOpenChange={() => {}}
                    open={true}
                    value=""
                    defaultValue=""
                    children={"devCMDS preview"}
                    data={[]}
                    items={[]}
                    user={user}
                    profile={profile}
                  />
                </PreviewBoundary>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AdminDevPanel;
