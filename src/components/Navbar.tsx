
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Menu, Cloud as CloudIcon, LogOut, Lock } from '@/lib/icon-map';
import { supabase } from '@/integrations/supabase/client';
import MaintenanceBanner from '@/components/MaintenanceBanner';

const Navbar: React.FC = () => {
  const { user, signOut } = useAuth();
  const isMobile = useIsMobile();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user) return;
      
      try {
        // Get the current session
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        
        if (!accessToken) {
          console.error('No access token available');
          return;
        }
        
        const { data, error } = await supabase.functions.invoke('verify-admin', {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        });
        
        if (error) {
          console.error('Error checking admin status:', error);
          return;
        }
        
        setIsAdmin(!!data?.verified);
      } catch (error) {
        console.error('Error checking admin status:', error);
      }
    };
    
    checkAdminStatus();
  }, [user]);

  return (
    <>
      <MaintenanceBanner />
      <nav className="bg-background border-b sticky top-0 z-50">
        <div className="container flex items-center justify-between py-3">
        <Link to="/" className="flex items-center gap-2">
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg w-8 h-8 flex items-center justify-center"><div className="w-4 h-4 bg-white rounded-sm"></div></div>
          <span className="font-semibold md:inline-block">SquidCloud</span>
          <span className="text-xs text-muted-foreground hidden md:inline-block">by </span>
        </Link>
        
        {isMobile ? (
          user ? (
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="sm:w-80">
                <SheetHeader>
                  <SheetTitle>User Menu</SheetTitle>
                  <SheetDescription>
                    Manage your account settings and preferences.
                  </SheetDescription>
                </SheetHeader>
                <div className="grid gap-4 py-4">
                  <div className="px-4 py-2">
                    <p className="text-sm font-medium leading-none">
                      {user.email}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {user.id}
                    </p>
                  </div>
                  
                  {isAdmin && (
                    <div className="px-4 py-2 border-t">
                      <h3 className="text-sm font-medium mb-2">Admin</h3>
                      <div className="space-y-2">
                        <Link to="/admin/update/windows" className="flex items-center gap-2 text-sm hover:underline">
                          <Lock className="h-4 w-4" />
                          Windows Updates
                        </Link>
                        <Link to="/admin/update/macos" className="flex items-center gap-2 text-sm hover:underline">
                          <Lock className="h-4 w-4" />
                          macOS Updates
                        </Link>
                        <Link to="/admin/update/android" className="flex items-center gap-2 text-sm hover:underline">
                          <Lock className="h-4 w-4" />
                          Android Updates
                        </Link>
                      </div>
                    </div>
                  )}
                  
                  <Button variant="destructive" onClick={signOut} className="justify-start gap-2 mx-4">
                    <LogOut className="h-4 w-4" />
                    Logout
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          ) : (
            <Link to="/auth">
              <Button>Login</Button>
            </Link>
          )
        ) : (
          <div className="flex items-center gap-4">
            {user && (
              <div className="flex items-center">
                <Button variant="ghost" asChild>
                  <Link to="/developer-api" className="text-sm">Developer API</Link>
                </Button>
                
                {isAdmin && (
                  <>
                    <Button variant="ghost" asChild>
                      <Link to="/admin/update/windows" className="text-sm">Windows Updates</Link>
                    </Button>
                    <Button variant="ghost" asChild>
                      <Link to="/admin/update/macos" className="text-sm">macOS Updates</Link>
                    </Button>
                    <Button variant="ghost" asChild>
                      <Link to="/admin/update/android" className="text-sm">Android Updates</Link>
                    </Button>
                  </>
                )}
              </div>
            )}
            
            {user ? (
              <Button variant="destructive" onClick={signOut}>Logout</Button>
            ) : (
              <Link to="/auth">
                <Button>Login</Button>
              </Link>
            )}
          </div>
        )}
        </div>
      </nav>
    </>
  );
};

export default Navbar;
