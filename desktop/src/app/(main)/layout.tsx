"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  LayoutDashboard, Mail, Megaphone, LayoutTemplate,
  Users, BarChart2, Settings, LogOut, MessageCircle,
} from "lucide-react";

import { AuthProvider, useAuth } from "@/context/AuthContext";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup,
  SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const navItems = [
  { label: "Dashboard",  href: "/dashboard",  icon: LayoutDashboard },
  { label: "Audiences",  href: "/audience",   icon: Users },
  { label: "Templates",  href: "/templates",  icon: LayoutTemplate },
  { label: "Broadcasts", href: "/broadcast",  icon: Megaphone },
  { label: "Emails",     href: "/emails",     icon: Mail },
  { label: "Metrics",    href: "/metrics",    icon: BarChart2 },
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
          <SidebarGroupLabel>WhatsApp</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === "/whatsapp"} tooltip="WhatsApp">
                <Link href="/whatsapp">
                  <MessageCircle className="h-4 w-4" />
                  <span>WhatsApp</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Email</SidebarGroupLabel>
          <SidebarMenu>
            {navItems.map(({ label, href, icon: Icon }) => (
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

  const breadcrumbMap: Record<string, { label: string; parent?: string }> = {
    "/dashboard":  { label: "Dashboard" },
    "/whatsapp":   { label: "WhatsApp" },
    "/broadcast":  { label: "Broadcasts" },
    "/audience":   { label: "Audiences" },
    "/templates":  { label: "Templates" },
    "/emails":     { label: "Emails" },
    "/metrics":    { label: "Metrics" },
    "/settings":   { label: "Settings" },
  };

  const pathSegments = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; href: string; isLast: boolean }[] = [];
  let cummulative = "";
  pathSegments.forEach((seg, i) => {
    cummulative += `/${seg}`;
    const matched = breadcrumbMap[cummulative];
    if (matched) {
      crumbs.push({
        label: matched.label,
        href: cummulative,
        isLast: i === pathSegments.length - 1,
      });
    }
  });

  // If no map match (e.g. dynamic routes), use the last segment as label
  if (crumbs.length === 0 && pathSegments.length > 0) {
    crumbs.push({
      label: pathSegments[pathSegments.length - 1].replace(/^./, (c) => c.toUpperCase()),
      href: pathname,
      isLast: true,
    });
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col min-h-svh">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-6" />
          <Breadcrumb>
            <BreadcrumbList>
              {crumbs.map((c, i) => (
                <BreadcrumbItem key={c.href}>
                  {c.isLast ? (
                    <BreadcrumbPage>{c.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link href={c.href}>{c.label}</Link>
                    </BreadcrumbLink>
                  )}
                  {i < crumbs.length - 1 && <BreadcrumbSeparator />}
                </BreadcrumbItem>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
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
