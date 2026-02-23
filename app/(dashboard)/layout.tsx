"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/lib/auth-context";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Once loading is done, if not authenticated, go to login
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  // Show nothing while checking auth to avoid flash of protected content
  if (isLoading || !isAuthenticated) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <main
        className={cn(
          "min-h-screen transition-all duration-300",
          collapsed ? "pl-[68px]" : "pl-[240px]"
        )}
      >
        <div className="p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}




// "use client";

// import { useState } from "react";
// import { cn } from "@/lib/utils";
// import { AppSidebar } from "@/components/app-sidebar";

// export default function DashboardLayout({ children }: { children: React.ReactNode }) {
//   const [collapsed, setCollapsed] = useState(false);

//   return (
//     <div className="min-h-screen bg-background">
//       <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
//       <main
//         className={cn(
//           "min-h-screen transition-all duration-300",
//           collapsed ? "pl-[68px]" : "pl-[240px]"
//         )}
//       >
//         <div className="p-6 lg:p-8">{children}</div>
//       </main>
//     </div>
//   );
// }