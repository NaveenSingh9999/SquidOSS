import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { SquidsetThemeProvider } from "@/contexts/SquidsetThemeContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import MainHeader from "@/components/MainHeader";
import VersionChecker from "@/components/VersionChecker";
import { useEffect, lazy, Suspense, type ReactNode } from "react";
import { initMobileApp } from "@/utils/mobile";
import Index from "./pages/Index";
import { motion } from "framer-motion";
import { useAnimationConfig } from "@/hooks/use-animation-config";

const queryClient = new QueryClient();

const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AccountSettings = lazy(() => import("./pages/AccountSettings"));
const ProviderSettings = lazy(() => import("./pages/ProviderSettings"));
import { ErrorBoundary } from "./components/ErrorBoundary";
const AdminAuth = lazy(() => import("@/pages/AdminAuth"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const NotFound = lazy(() => import("./pages/NotFound"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const SetupPage = lazy(() => import("./pages/Setup"));

const RouteSuspense = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<div className="flex min-h-[30vh] items-center justify-center text-sm text-muted-foreground">Loading...</div>}>
    {children}
  </Suspense>
);

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

const AppContent = () => {
  const location = useLocation();
  const showHeader = !['/', '/auth', '/setup', '/dashboard', '/admin'].some(path =>
    path === location.pathname || location.pathname.startsWith(path === '/admin' ? '/admin' : location.pathname)
  );

  return (
    <div className="min-h-screen bg-background font-sans antialiased">
      <AuthProvider>
            <VersionChecker />
            {showHeader && <MainHeader />}
            <Toaster />
          <Routes location={location} key={location.pathname}>
          <Route path="/" element={<AnimatedRoute><Index /></AnimatedRoute>} />
          <Route path="/auth" element={<AnimatedRoute><RouteSuspense><Auth /></RouteSuspense></AnimatedRoute>} />
          <Route path="/setup" element={<AnimatedRoute><RouteSuspense><SetupPage /></RouteSuspense></AnimatedRoute>} />
          <Route path="/dashboard" element={
            <RouteSuspense>
              <ProtectedRoute>
                <ErrorBoundary>
                  <Dashboard />
                </ErrorBoundary>
              </ProtectedRoute>
            </RouteSuspense>
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

          {/* Admin Routes */}
          <Route path="/admin/auth" element={<AnimatedRoute><RouteSuspense><AdminAuth /></RouteSuspense></AnimatedRoute>} />
          <Route path="/admin/dashboard" element={
            <AnimatedRoute>
            <RouteSuspense>
              <ProtectedRoute>
                <AdminDashboard />
              </ProtectedRoute>
            </RouteSuspense>
            </AnimatedRoute>
          } />

          {/* Backward-compat old admin routes */}
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

          {/* Legal */}
          <Route path="/terms" element={<AnimatedRoute><RouteSuspense><TermsOfService /></RouteSuspense></AnimatedRoute>} />
          <Route path="/privacy" element={<AnimatedRoute><RouteSuspense><PrivacyPolicy /></RouteSuspense></AnimatedRoute>} />

          {/* 404 */}
          <Route path="*" element={<AnimatedRoute><RouteSuspense><NotFound /></RouteSuspense></AnimatedRoute>} />
        </Routes>
      </AuthProvider>
    </div>
  );
};

function App() {
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
