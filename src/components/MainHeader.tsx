
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { 
  LayoutDashboard, 
  Shield, 
  BarChart3, 
  Lock, 
  Settings, 
  LogOut, 
  Sparkles,
  Bell,
  Menu,
  X
} from '@/lib/icon-map';
import { useIsMobile } from '@/hooks/use-mobile';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from '@/lib/utils';

/**
 * NavIconButton — reusable icon-only nav item with tooltip
 * 
 * Design: 36x36 hit target, 18px icons, muted → foreground on hover,
 * primary accent for active state with bottom indicator dot.
 */
interface NavIconButtonProps {
  to?: string;
  onClick?: () => void;
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  className?: string;
}

const NavIconButton: React.FC<NavIconButtonProps> = ({ 
  to, onClick, icon, label, isActive, className 
}) => {
  const buttonClasses = cn(
    "relative flex items-center justify-center w-9 h-9 rounded-lg",
    "transition-all duration-150",
    "hover:bg-accent/70",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
    "active:scale-[0.96]",
    "group",
    isActive && "bg-accent",
    className
  );

  const iconClasses = cn(
    "w-[18px] h-[18px] transition-colors duration-150",
    "text-muted-foreground group-hover:text-foreground",
    isActive && "text-primary"
  );

  const content = (
    <>
      <span className={iconClasses}>{icon}</span>
      <span className="sr-only">{label}</span>
      {isActive && (
        <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-4 h-[2px] bg-primary rounded-full" />
      )}
    </>
  );

  const tooltipContent = (
    <TooltipContent 
      side="bottom" 
      sideOffset={8}
      className="bg-popover/95 backdrop-blur-sm border-border/50 text-popover-foreground text-xs px-2.5 py-1.5 rounded-lg shadow-lg animate-fade-in-scale"
    >
      {label}
    </TooltipContent>
  );

  if (to) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link to={to} className={buttonClasses} aria-label={label}>
            {content}
          </Link>
        </TooltipTrigger>
        {tooltipContent}
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button onClick={onClick} className={buttonClasses} aria-label={label}>
          {content}
        </button>
      </TooltipTrigger>
      {tooltipContent}
    </Tooltip>
  );
};

/**
 * MainHeader — Global navigation bar
 * 
 * Design decisions:
 * - 56px height (14 × 4px grid)
 * - Sticky with backdrop blur for layered scroll feel
 * - Icon groups separated by subtle vertical dividers
 * - Logo uses gradient brand mark + text label
 * - Mobile: hamburger → slide-down drawer
 */
const MainHeader: React.FC = () => {
  const { user, profile, signOut } = useAuth();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Hide on mobile for app-shell routes (they have their own nav)
  const hiddenMobileRoutes = ['/dashboard', '/auth', '/developer-api', '/settings'];
  if (isMobile && hiddenMobileRoutes.some(route => location.pathname.startsWith(route))) {
    return null;
  }

  const isActiveRoute = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <TooltipProvider delayDuration={200}>
      <header 
        className={cn(
          "sticky top-0 z-50 w-full",
          "h-14",
          "bg-background/85 backdrop-blur-xl",
          "border-b border-border/30",
          "transition-all duration-200"
        )}
        role="banner"
      >
        <div className="h-full px-5 lg:px-6 flex items-center justify-between max-w-full">
          {/* ── Logo ── */}
          <Link 
            to="/" 
            className={cn(
              "flex items-center gap-2.5",
              "transition-opacity duration-150 hover:opacity-80 active:opacity-70",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded-lg"
            )}
            aria-label="SquidCloud Home"
          >
            <div className={cn(
              "w-8 h-8 rounded-[10px] flex items-center justify-center",
              "bg-gradient-to-br from-primary to-primary/80",
              "shadow-sm shadow-primary/20",
              "transition-transform duration-150 hover:scale-105"
            )}>
              <div className="w-3 h-3 bg-primary-foreground rounded-[3px]" />
            </div>
            <span className="font-semibold text-[15px] tracking-[-0.01em] text-foreground hidden sm:inline-block">
              SquidCloud
            </span>
          </Link>
          
          {/* ── Mobile hamburger ── */}
          {isMobile && user && (
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={cn(
                "w-10 h-10 flex items-center justify-center rounded-lg",
                "transition-all duration-150",
                "hover:bg-accent/60 active:scale-95"
              )}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5 text-foreground" />
              ) : (
                <Menu className="w-5 h-5 text-muted-foreground" />
              )}
            </button>
          )}

          {/* ── Desktop nav ── */}
          {!isMobile && (
            <nav className="flex items-center gap-1" role="navigation" aria-label="Main navigation">
              {user ? (
                <>
                  {/* Primary nav group */}
                  <div className="flex items-center gap-0.5 px-1">
                    <NavIconButton to="/dashboard" icon={<LayoutDashboard />} label="Dashboard" isActive={isActiveRoute('/dashboard')} />
                    <NavIconButton to="/analytics" icon={<BarChart3 />} label="Analytics" isActive={isActiveRoute('/analytics')} />
                    <NavIconButton to="/settings/account" icon={<Settings />} label="Settings" isActive={isActiveRoute('/settings')} />
                  </div>

                  <div className="w-px h-5 bg-border/50 mx-1.5" aria-hidden="true" />

                  {/* Security */}
                  <NavIconButton to="/security" icon={<Lock />} label="Security" isActive={isActiveRoute('/security')} />

                  <div className="w-px h-5 bg-border/50 mx-1.5" aria-hidden="true" />

                  {/* AI & Admin */}
                  <div className="flex items-center gap-0.5 px-1">
                    <NavIconButton
                      onClick={() => window.dispatchEvent(new Event('openSquidAI'))}
                      icon={<Sparkles className="text-primary" />}
                      label="Squid AI (⌘K)"
                    />
                    {profile?.is_admin && (
                      <NavIconButton
                        to="/ad/u1/get_ad/dash"
                        icon={<Shield className="text-amber-500" />}
                        label="Admin Panel"
                        isActive={isActiveRoute('/ad')}
                      />
                    )}
                  </div>

                  <div className="w-px h-5 bg-border/50 mx-1.5" aria-hidden="true" />

                  {/* Notifications + Avatar */}
                  <div className="flex items-center gap-0.5 pl-1">
                    <NavIconButton onClick={() => {}} icon={<Bell />} label="Notifications" />
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button 
                          className={cn(
                            "w-9 h-9 rounded-lg flex items-center justify-center ml-0.5",
                            "transition-all duration-150",
                            "hover:bg-accent/60 active:scale-95",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                          )}
                          aria-label="User menu"
                        >
                          <Avatar className="h-7 w-7 ring-1.5 ring-border/40">
                            <AvatarImage src={profile?.avatar_url} alt={user?.email || 'User'} />
                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                              {user?.email?.charAt(0).toUpperCase() || 'U'}
                            </AvatarFallback>
                          </Avatar>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent 
                        align="end" 
                        sideOffset={8}
                        className={cn(
                          "w-56",
                          "bg-popover/95 backdrop-blur-xl",
                          "border border-border/50",
                          "shadow-xl rounded-xl",
                          "animate-fade-in-scale"
                        )}
                      >
                        <div className="px-3 py-2.5 border-b border-border/30">
                          <p className="text-sm font-medium text-foreground truncate">
                            {profile?.display_name || user?.email}
                          </p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {user?.email}
                          </p>
                        </div>
                        <div className="p-1">
                          <DropdownMenuItem asChild>
                            <Link 
                              to="/settings/account" 
                              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors duration-150"
                            >
                              <Settings className="h-4 w-4" />
                              <span className="text-sm">User Settings</span>
                            </Link>
                          </DropdownMenuItem>
                        </div>
                        <DropdownMenuSeparator className="bg-border/30 mx-1" />
                        <div className="p-1">
                          <DropdownMenuItem 
                            onClick={signOut}
                            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer text-destructive hover:text-destructive hover:bg-destructive/10 transition-colors duration-150"
                          >
                            <LogOut className="h-4 w-4" />
                            <span className="text-sm">Sign Out</span>
                          </DropdownMenuItem>
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <Link 
                    to="/auth" 
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 font-medium"
                  >
                    Sign In
                  </Link>
                  <Button 
                    asChild
                    className="h-9 px-5 bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-sm rounded-lg transition-all duration-150 active:scale-[0.97] shadow-sm shadow-primary/15"
                  >
                    <Link to="/auth">Get Started</Link>
                  </Button>
                </div>
              )}
            </nav>
          )}
        </div>

        {/* ── Mobile drawer ── */}
        {isMobile && mobileMenuOpen && user && (
          <nav 
            className={cn(
              "absolute top-14 left-0 right-0",
              "bg-background/95 backdrop-blur-xl",
              "border-b border-border/30",
              "px-4 py-4",
              "animate-slide-down shadow-lg"
            )}
            role="navigation"
            aria-label="Mobile navigation"
          >
            <div className="grid grid-cols-4 gap-2">
              {[
                { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
                { to: '/analytics', icon: BarChart3, label: 'Analytics' },
                { to: '/security', icon: Lock, label: 'Security' },
                { to: '/settings/account', icon: Settings, label: 'Settings' },
              ].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-xl",
                    "transition-all duration-150 active:scale-95",
                    "hover:bg-accent/60",
                    isActiveRoute(item.to) && "bg-accent/50"
                  )}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <item.icon className={cn(
                    "w-5 h-5",
                    isActiveRoute(item.to) ? "text-primary" : "text-muted-foreground"
                  )} />
                  <span className="text-[11px] font-medium text-muted-foreground">{item.label}</span>
                </Link>
              ))}
            </div>
            
            <div className="mt-3 pt-3 border-t border-border/30">
              <button
                onClick={() => { signOut(); setMobileMenuOpen(false); }}
                className={cn(
                  "w-full flex items-center justify-center gap-2 p-3 rounded-xl",
                  "text-destructive hover:bg-destructive/10 active:scale-95",
                  "transition-all duration-150"
                )}
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm font-medium">Sign Out</span>
              </button>
            </div>
          </nav>
        )}
      </header>
    </TooltipProvider>
  );
};

export default MainHeader;
