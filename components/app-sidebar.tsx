"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  LayoutDashboard,
  ScrollText,
  AlertTriangle,
  FileCode2,
  Key,
  Settings,
  LogOut,
  ChevronLeft,
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Notifications", href: "/logs", icon: ScrollText },
  { name: "Dead Letter Queue", href: "/dlq", icon: AlertTriangle },
  { name: "Templates", href: "/templates", icon: FileCode2 },
  { name: "API Keys", href: "/api-keys", icon: Key },
  { name: "Settings", href: "/settings", icon: Settings },
];

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  // AuthUser has firstName + lastName, not name
  const fullName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ")
    : "Admin User";

  const initials = user
    ? [user.firstName?.[0], user.lastName?.[0]]
        .filter(Boolean)
        .join("")
        .toUpperCase() || "AD"
    : "AD";

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300",
          collapsed ? "w-[68px]" : "w-[240px]"
        )}
      >
        {/* Logo */}
        <div className="group relative flex h-16 items-center gap-3 px-4">
          <Link href="/dashboard" className="relative">
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-emerald-400/30 via-cyan-400/20 to-indigo-500/30 blur-md opacity-60 transition-all duration-500 group-hover:opacity-100 group-hover:blur-lg" />
              <div className="relative">
                <BrandLogo
                  variant="image"
                  size={34}
                  className="transition-transform duration-300 group-hover:scale-110"
                />
              </div>
            </div>
          </Link>

          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="text-lg font-semibold tracking-tight text-sidebar-foreground">
                Notifly
              </span>
              <span className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40">
                notification engine
              </span>
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className={cn(
              "ml-auto h-7 w-7 text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors",
              collapsed && "ml-0"
            )}
          >
            <ChevronLeft
              className={cn(
                "h-4 w-4 transition-transform duration-300",
                collapsed && "rotate-180"
              )}
            />
            <span className="sr-only">Toggle sidebar</span>
          </Button>
        </div>

        <Separator className="bg-sidebar-border" />

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const link = (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <item.icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isActive && "text-sidebar-primary"
                  )}
                />
                {!collapsed && <span>{item.name}</span>}
              </Link>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.name}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent
                    side="right"
                    className="bg-popover text-popover-foreground"
                  >
                    {item.name}
                  </TooltipContent>
                </Tooltip>
              );
            }
            return link;
          })}
        </nav>

        <Separator className="bg-sidebar-border" />

        {/* User section */}
        <div className="p-3">
          <div
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2",
              collapsed && "justify-center px-0"
            )}
          >
            <Avatar className="h-8 w-8 shrink-0">
              {user?.avatarUrl && (
                <AvatarImage src={user.avatarUrl} alt={fullName} />
              )}
              <AvatarFallback className="bg-sidebar-primary/20 text-xs text-sidebar-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-sm font-medium text-sidebar-foreground">
                  {fullName}
                </p>
                <p className="truncate text-xs text-sidebar-foreground/60">
                  {user?.email || "admin@notifly.io"}
                </p>
              </div>
            )}
            {!collapsed && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={logout}
                    className="h-7 w-7 shrink-0 text-sidebar-foreground/60 hover:text-destructive"
                  >
                    <LogOut className="h-4 w-4" />
                    <span className="sr-only">Logout</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  className="bg-popover text-popover-foreground"
                >
                  Logout
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}