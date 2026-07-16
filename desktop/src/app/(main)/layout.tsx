"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronRight, FolderOpen, Info, LayoutDashboard, Mail, Megaphone, LayoutTemplate,
  Users, Settings, LogOut, MessageCircle, RefreshCw,
} from "lucide-react";

import { AuthProvider, useAuth } from "@/context/AuthContext";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup,
  SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

// ── Route-based page header config ──
const PAGE_HEADERS: Record<string, { title: string; info?: string }> = {
  "/dashboard":  { title: "Dashboard", info: "Overview of your email and messaging activity." },
  "/audience":   { title: "Audiences", info: "Manage contact lists for your campaigns." },
  "/templates":  { title: "Templates", info: "Create and manage email templates with drag-and-drop editor." },
  "/broadcast":  { title: "Broadcasts", info: "Create and send email or WhatsApp campaigns to your audiences." },
  "/whatsapp":   { title: "WhatsApp", info: "Connect your WhatsApp account to send broadcast messages." },
  "/emails":     { title: "Email Queue", info: "Email delivery log and queue status." },
  "/files":      { title: "Files", info: "Upload and manage files for email attachments." },
  "/settings":   { title: "Settings", info: "Configure your sending credentials and preferences." },
};

function getPageHeader(pathname: string) {
  // Exact match first
  if (PAGE_HEADERS[pathname]) return PAGE_HEADERS[pathname];
  // Match parent route for dynamic pages (e.g. /broadcast/[id])
  const parent = "/" + pathname.split("/").filter(Boolean)[0];
  return PAGE_HEADERS[parent] ?? null;
}

const PAGE_ACTIONS_ID = "page-header-actions";
const BREADCRUMB_LABEL_ID = "breadcrumb-label";

/** Hook for pages to portal their action button into global header */
export function usePageActions() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(document.getElementById(PAGE_ACTIONS_ID));
  }, []);
  return target;
}

/** Render children into global header action slot */
export function PageActions({ children }: { children: React.ReactNode }) {
  const target = usePageActions();
  if (!target) return null;
  return createPortal(children, target);
}

/** Hook for pages to portal their breadcrumb label into global header */
export function useBreadcrumbLabel() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(document.getElementById(BREADCRUMB_LABEL_ID));
  }, []);
  return target;
}

/** Render children into the breadcrumb label slot (replaces "Detail") */
export function BreadcrumbLabel({ children }: { children: React.ReactNode }) {
  const target = useBreadcrumbLabel();
  if (!target) return null;
  return createPortal(
    <>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-sm font-semibold">{children}</span>
    </>,
    target
  );
}

/** Global refresh event name */
export const REFRESH_EVENT = "app-refresh";

/** Hook for pages to register their refresh handler */
export function useGlobalRefresh(handler: () => void) {
  useEffect(() => {
    window.addEventListener(REFRESH_EVENT, handler);
    return () => window.removeEventListener(REFRESH_EVENT, handler);
  }, [handler]);
}

const campaignItems = [
  { label: "Audiences",  href: "/audience",   icon: Users },
  { label: "Templates",  href: "/templates",  icon: LayoutTemplate },
  { label: "Broadcasts", href: "/broadcast",  icon: Megaphone },
  { label: "Files",      href: "/files",      icon: FolderOpen },
];

const channelItems = [
  { label: "WhatsApp",   href: "/whatsapp",   icon: MessageCircle },
  { label: "Email Queue", href: "/emails",    icon: Mail },
];


function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <img src="/logo.png" alt="Whamail" className="h-8 w-8 rounded-lg shrink-0" />
                <span className="font-semibold text-base">Whamail</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === "/dashboard"} tooltip="Dashboard">
                <Link href="/dashboard">
                  <LayoutDashboard className="h-4 w-4" />
                  <span>Dashboard</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Campaigns</SidebarGroupLabel>
          <SidebarMenu>
            {campaignItems.map(({ label, href, icon: Icon }) => (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton asChild isActive={pathname.startsWith(href)} tooltip={label}>
                  <Link href={href}>
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Channels</SidebarGroupLabel>
          <SidebarMenu>
            {channelItems.map(({ label, href, icon: Icon }) => (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton asChild isActive={pathname.startsWith(href)} tooltip={label}>
                  <Link href={href}>
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === "/settings"} tooltip="Settings">
              <Link href="/settings">
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} tooltip="Log out">
              <LogOut className="h-4 w-4" />
              <span>Log out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {user && (
          <>
            <Separator />
            <div className="flex items-center gap-2 px-2 py-2 text-sm">
              <Avatar className="h-7 w-7">
                <AvatarImage src={user.avatarUrl ?? undefined} />
                <AvatarFallback>{user.fullName?.[0] ?? user.email[0]}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col min-w-0 group-data-[collapsible=icon]:hidden">
                <span className="truncate font-medium leading-tight">{user.fullName || user.email}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </div>
            </div>
          </>
        )}
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

function MainLayout({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    window.dispatchEvent(new Event(REFRESH_EVENT));
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  useEffect(() => {
    if (!loading && !session) {
      router.replace("/login");
    }
  }, [session, loading, router]);

  if (loading || !session) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
      </div>
    );
  }

  const segments = pathname.split("/").filter(Boolean);
  const parentPath = "/" + segments[0];
  const parentHeader = PAGE_HEADERS[parentPath];
  const isSubPage = segments.length > 1;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col min-h-svh">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-6" />
          {parentHeader && (
            <div className="flex items-center gap-1.5">
              {isSubPage ? (
                <>
                  <Link href={parentPath} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                    {parentHeader.title}
                  </Link>
                  <span id={BREADCRUMB_LABEL_ID} className="contents" />
                </>
              ) : (
                <>
                  <h1 className="text-sm font-semibold">{parentHeader.title}</h1>
                  {parentHeader.info && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>{parentHeader.info}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  <span id={BREADCRUMB_LABEL_ID} className="contents" />
                </>
              )}
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <div id={PAGE_ACTIONS_ID} className="flex items-center gap-2" />
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </header>
        <main className="flex-1 p-6 flex flex-col min-h-0 overflow-hidden">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <MainLayout>{children}</MainLayout>
    </AuthProvider>
  );
}
