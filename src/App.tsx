
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { SquidsetThemeProvider } from "@/contexts/SquidsetThemeContext";
import { PINAuthProvider } from "@/contexts/PINAuthContext";
import { BYOKProvider } from "@/contexts/BYOKContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import MainHeader from "@/components/MainHeader";
import VersionChecker from "@/components/VersionChecker";
import MobileUploadNotification from "@/components/MobileUploadNotification";
import MobileDownloadNotification from "@/components/MobileDownloadNotification";
import MaintenanceBanner from "@/components/MaintenanceBanner";
import AdminDevPanel from "@/components/AdminDevPanel";
import ServiceWorkerManager from "@/utils/serviceWorkerManager";
import { useEffect, lazy, Suspense, type ReactNode } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { initMobileApp, isNativePlatform } from "@/utils/mobile";
import Index from "./pages/Index";
import { supabase } from "@/integrations/supabase/client";
import { resolveRouteFromDeepLink } from "@/lib/appLinks";
import { useSharedUpload } from "@/shared/useSharedUpload";
import { AnimatePresence, motion } from "framer-motion";
import { useAnimationConfig } from "@/hooks/use-animation-config";

const queryClient = new QueryClient();

const Auth = lazy(() => import("./pages/Auth"));
const OAuthCallback = lazy(() => import("./pages/OAuthCallback"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Profile = lazy(() => import("./pages/Profile"));
const Settings = lazy(() => import("./pages/Settings"));
const AccountSettings = lazy(() => import("./pages/AccountSettings"));
const DeveloperAPI = lazy(() => import("./pages/DeveloperAPI"));
const ProviderSettings = lazy(() => import("./pages/ProviderSettings"));
import { ErrorBoundary } from "./components/ErrorBoundary";
const CbCode = lazy(() => import("./pages/cbCode"));
const PDFViewerPage = lazy(() => import("./pages/PDFViewerPage"));
const AdminAuth = lazy(() => import("@/pages/AdminAuth"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const KZADashboard = lazy(() => import("@/pages/KZADashboard"));
const APIStatus = lazy(() => import("./pages/APIStatus"));
const RepoCreation = lazy(() => import("./pages/RepoCreation"));
const RepoCreationPassword = lazy(() => import("./pages/RepoCreationPassword"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const NotFound = lazy(() => import("./pages/NotFound"));
const SharePage = lazy(() => import("./pages/SharePage"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const AnalyticsDashboard = lazy(() => import("./components/AnalyticsDashboard"));
const SecurityCenter = lazy(() => import("./components/SecurityCenter"));
const StoragePage = lazy(() => import("./pages/StoragePage"));
const ExtensionLab = lazy(() => import("./pages/ExtensionLab"));
const Documentation = lazy(() => import("./pages/Documentation"));
const PatchNotes = lazy(() => import("./pages/PatchNotes"));
const WorkspaceInvite = lazy(() => import("./pages/WorkspaceInvite"));
const FileRequestPage = lazy(() => import("./pages/FileRequestPage"));
const SetupPage = lazy(() => import("./pages/Setup"));

const RouteSuspense = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<div className="flex min-h-[30vh] items-center justify-center text-sm text-muted-foreground">Loading...</div>}>
    {children}
  </Suspense>
);

// Animated wrapper for route transitions
const AnimatedRoute = ({ children }: { children: ReactNode }) => {
  const { page, pageTransition } = useAnimationConfig();

  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={page}
      transition={pageTransition}
    >
      {children}
    </motion.div>
  );
};

const NativeMobileBridge = () => {
  const { refreshSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  useSharedUpload();

  useEffect(() => {
    if (!isNativePlatform()) return;

    const listenerPromise = CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
      if (!url) return;

      console.log('[NativeMobileBridge] Deep link received:', url);

      const route = resolveRouteFromDeepLink(url);
      if (!route) {
        console.warn('[NativeMobileBridge] Could not resolve route from deep link');
        return;
      }

      try {
        const parsed = new URL(url);

        // Handle OAuth PKCE flow with authorization code
        const code = parsed.searchParams.get('code');
        if (code) {
          console.log('[NativeMobileBridge] OAuth code detected, exchanging for session');
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error('[NativeMobileBridge] Code exchange error:', error);
            throw error;
          }
          if (data.session) {
            console.log('[NativeMobileBridge] Session established successfully');
            // Removed redundant refreshSession() to prevent lock contention
            navigate('/dashboard', { replace: true });
            return;
          }
        }

        // Handle Supabase implicit flow (legacy - tokens in hash)
        if (parsed.hash && parsed.hash.includes('access_token')) {
          console.log('[NativeMobileBridge] Hash-based tokens detected');
          const hashParams = new URLSearchParams(parsed.hash.substring(1));
          const access_token = hashParams.get('access_token');
          const refresh_token = hashParams.get('refresh_token');

          if (access_token && refresh_token) {
            console.log('[NativeMobileBridge] Setting session from hash tokens');
            await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            // Removed redundant refreshSession() to prevent lock contention
            navigate('/dashboard', { replace: true });
            return;
          }
        }

        // Check for OAuth error in URL
        const oauthError = parsed.searchParams.get('error');
        if (oauthError) {
          console.error('[NativeMobileBridge] OAuth error:', oauthError, parsed.searchParams.get('error_description'));
          navigate('/auth?error=' + encodeURIComponent(oauthError), { replace: true });
          return;
        }

        // Only navigate if it's safe to do so
        if (route !== location.pathname + location.search + location.hash) {
          console.log('[NativeMobileBridge] Navigating to:', route);
          navigate(route, { replace: true });
        }
      } catch (error) {
        console.error('[NativeMobileBridge] Deep link auth handling failed:', error);
        navigate('/auth?error=auth_failed', { replace: true });
      }
    });

    return () => {
      listenerPromise
        .then((listener) => listener.remove())
        .catch(() => {
          // ignore
        });
    };
  }, [location.hash, location.pathname, location.search, navigate, refreshSession]);

  return (
    <>
      <MobileUploadNotification />
      <MobileDownloadNotification />
    </>
  );
};

const AppContent = () => {
  const location = useLocation();
  const showHeader = !['/', '/auth', '/setup', '/dashboard', '/cb/pdf/viewer'].some(path =>
    path === location.pathname || location.pathname.startsWith('/cb/pdf/viewer')
  );
  const showMaintenanceBanner = !location.pathname.startsWith('/ad/');

  return (
    <div className="min-h-screen bg-background font-sans antialiased">
      <AuthProvider>
        <PINAuthProvider>
          <BYOKProvider>
            <VersionChecker />
            {showMaintenanceBanner && <MaintenanceBanner />}
            {showHeader && <MainHeader />}
            <Toaster />
            <NativeMobileBridge />
            <AnimatePresence mode="wait" initial={false}>
          <Routes location={location} key={location.pathname}>
          <Route path="/" element={<AnimatedRoute><Index /></AnimatedRoute>} />
          <Route path="/auth" element={<AnimatedRoute><RouteSuspense><Auth /></RouteSuspense></AnimatedRoute>} />
          <Route path="/setup" element={<AnimatedRoute><RouteSuspense><SetupPage /></RouteSuspense></AnimatedRoute>} />
          <Route path="/auth/callback" element={<AnimatedRoute><RouteSuspense><OAuthCallback /></RouteSuspense></AnimatedRoute>} />
          <Route path="/oauth/callback" element={<AnimatedRoute><RouteSuspense><OAuthCallback /></RouteSuspense></AnimatedRoute>} />
          <Route path="/dashboard" element={
            <RouteSuspense>
              <ProtectedRoute>
                <ErrorBoundary>
                  <Dashboard />
                </ErrorBoundary>
              </ProtectedRoute>
            </RouteSuspense>
          } />
          <Route path="/profile" element={
            <AnimatedRoute>
            <RouteSuspense>
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            </RouteSuspense>
            </AnimatedRoute>
          } />
          <Route path="/settings" element={
            <AnimatedRoute>
            <RouteSuspense>
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            </RouteSuspense>
            </AnimatedRoute>
          } />
          <Route path="/settings/account" element={
            <AnimatedRoute>
            <RouteSuspense>
              <ProtectedRoute>
                <AccountSettings />
              </ProtectedRoute>
            </RouteSuspense>
            </AnimatedRoute>
          } />
          <Route path="/settings/providers" element={
            <AnimatedRoute>
            <RouteSuspense>
              <ProtectedRoute>
                <ProviderSettings />
              </ProtectedRoute>
            </RouteSuspense>
            </AnimatedRoute>
          } />
          <Route path="/analytics" element={
            <AnimatedRoute>
            <RouteSuspense>
              <ProtectedRoute>
                <AnalyticsDashboard />
              </ProtectedRoute>
            </RouteSuspense>
            </AnimatedRoute>
          } />
          <Route path="/security" element={
            <AnimatedRoute>
            <RouteSuspense>
              <ProtectedRoute>
                <SecurityCenter />
              </ProtectedRoute>
            </RouteSuspense>
            </AnimatedRoute>
          } />
          <Route path="/storage" element={
            <AnimatedRoute>
            <RouteSuspense>
              <ProtectedRoute>
                <StoragePage />
              </ProtectedRoute>
            </RouteSuspense>
            </AnimatedRoute>
          } />
          <Route path="/developer-api" element={
            <AnimatedRoute>
            <RouteSuspense>
              <ProtectedRoute>
                <DeveloperAPI />
              </ProtectedRoute>
            </RouteSuspense>
            </AnimatedRoute>
          } />
          <Route path="/extensions" element={
            <AnimatedRoute>
            <RouteSuspense>
              <ProtectedRoute>
                <ExtensionLab />
              </ProtectedRoute>
            </RouteSuspense>
            </AnimatedRoute>
          } />
          <Route path="/cc/api/status" element={<AnimatedRoute><RouteSuspense><APIStatus /></RouteSuspense></AnimatedRoute>} />
          <Route path="/cbcode/:folderId?" element={
            <AnimatedRoute>
            <RouteSuspense>
              <ProtectedRoute>
                <ErrorBoundary>
                  <CbCode />
                </ErrorBoundary>
              </ProtectedRoute>
            </RouteSuspense>
            </AnimatedRoute>
          } />

          {/* PDF Viewer Route */}
          <Route path="/cb/pdf/viewer/:id" element={
            <AnimatedRoute>
            <RouteSuspense>
              <ProtectedRoute>
                <PDFViewerPage />
              </ProtectedRoute>
            </RouteSuspense>
            </AnimatedRoute>
          } />

          {/* Public Share Routes - No authentication required */}
          <Route path="/s/:shareId" element={<AnimatedRoute><RouteSuspense><SharePage /></RouteSuspense></AnimatedRoute>} />
          <Route path="/share/:shareId" element={<AnimatedRoute><RouteSuspense><SharePage /></RouteSuspense></AnimatedRoute>} /> {/* Legacy redirect */}
          <Route path="/file/:id" element={<AnimatedRoute><RouteSuspense><SharePage /></RouteSuspense></AnimatedRoute>} /> {/* Legacy redirect */}
          <Route path="/r/:slug" element={<AnimatedRoute><RouteSuspense><FileRequestPage /></RouteSuspense></AnimatedRoute>} />
          <Route path="/workspace/invite/:token" element={<AnimatedRoute><RouteSuspense><WorkspaceInvite /></RouteSuspense></AnimatedRoute>} />
          <Route path="/workspace/invite" element={<AnimatedRoute><RouteSuspense><WorkspaceInvite /></RouteSuspense></AnimatedRoute>} />

          {/* Onboarding and Repo Creation Routes */}
          <Route path="/onboarding" element={
            <AnimatedRoute>
            <RouteSuspense>
              <ProtectedRoute>
                <Onboarding />
              </ProtectedRoute>
            </RouteSuspense>
            </AnimatedRoute>
          } />
          <Route path="/r/c/:count" element={
            <AnimatedRoute>
            <RouteSuspense>
              <ProtectedRoute>
                <RepoCreation />
              </ProtectedRoute>
            </RouteSuspense>
            </AnimatedRoute>
          } />
          <Route path="/repo/create" element={
            <AnimatedRoute>
            <RouteSuspense>
              <ProtectedRoute>
                <RepoCreationPassword />
              </ProtectedRoute>
            </RouteSuspense>
            </AnimatedRoute>
          } />

          {/* Admin Routes - Hidden and Secure */}
          <Route path="/ad/u1/get_ad/auth" element={<AnimatedRoute><RouteSuspense><AdminAuth /></RouteSuspense></AnimatedRoute>} />
          <Route path="/ad/u1/get_ad/dash" element={
            <AnimatedRoute>
            <RouteSuspense>
              <ProtectedRoute>
                <AdminDashboard />
              </ProtectedRoute>
            </RouteSuspense>
            </AnimatedRoute>
          } />
          <Route path="/ad/u1/get_ad/kza" element={
            <AnimatedRoute>
            <RouteSuspense>
              <ProtectedRoute>
                <KZADashboard />
              </ProtectedRoute>
            </RouteSuspense>
            </AnimatedRoute>
          } />

          {/* Legal Routes */}
          <Route path="/terms" element={<AnimatedRoute><RouteSuspense><TermsOfService /></RouteSuspense></AnimatedRoute>} />
          <Route path="/privacy" element={<AnimatedRoute><RouteSuspense><PrivacyPolicy /></RouteSuspense></AnimatedRoute>} />
          <Route path="/legal/tos" element={<AnimatedRoute><RouteSuspense><TermsOfService /></RouteSuspense></AnimatedRoute>} />
          <Route path="/legal/privacy" element={<AnimatedRoute><RouteSuspense><PrivacyPolicy /></RouteSuspense></AnimatedRoute>} />

          {/* Documentation & Help Routes */}
          <Route path="/help/docs" element={<AnimatedRoute><RouteSuspense><Documentation /></RouteSuspense></AnimatedRoute>} />
          <Route path="/help/docs/:slug" element={<AnimatedRoute><RouteSuspense><Documentation /></RouteSuspense></AnimatedRoute>} />

          {/* Patch Notes Routes */}
          <Route path="/help/docs/notes" element={<AnimatedRoute><RouteSuspense><PatchNotes /></RouteSuspense></AnimatedRoute>} />
          <Route path="/help/docs/notes/:id" element={<AnimatedRoute><RouteSuspense><PatchNotes /></RouteSuspense></AnimatedRoute>} />

          {/* Catch all route */}
          <Route path="*" element={<AnimatedRoute><RouteSuspense><NotFound /></RouteSuspense></AnimatedRoute>} />
        </Routes>
            </AnimatePresence>
            <AdminDevPanel />
          </BYOKProvider>
        </PINAuthProvider>
      </AuthProvider>
    </div>
  );
};

function App() {
  // Initialize mobile app features (splash screen, status bar, etc.)
  useEffect(() => {
    initMobileApp();
  }, []);

  return (
    <BrowserRouter 
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true
      }}
    >
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SquidsetThemeProvider>
            <TooltipProvider>
              <AppContent />
            </TooltipProvider>
          </SquidsetThemeProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}

export default App;
