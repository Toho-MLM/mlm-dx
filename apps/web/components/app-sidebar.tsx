import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from "@/app/context/AuthContext";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarFooter, useSidebar } from "@/components/ui/sidebar"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { LogOutIcon, CalendarIcon, UsersIcon, SquarePlayIcon, FileUserIcon, HelpCircleIcon, ListMusicIcon, SpotlightIcon, ListIcon, BanIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { navigationConfig } from "@/lib/navigation";
import { isAdmin } from "@shared-schemas";

const iconMap = {
  CalendarIcon,
  UsersIcon,
  SquarePlayIcon,
  FileUserIcon,
  HelpCircleIcon,
  ListMusicIcon,
  SpotlightIcon,
  ListIcon,
  BanIcon,
} as const;

export function AppSidebar() {
  const { setOpenMobile } = useSidebar();
  const { user, signOut } = useAuth();
  const router = useRouter();

  const handleProfileClick = () => {
    setOpenMobile(false);
    router.push("/profile");
  };

  return (
    <Sidebar aria-label="メインナビゲーション">
      <SidebarHeader>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Image src="/assets/logo.png" alt="MLM DX logo" width={32} height={32} style={{ marginRight: '8px', display: 'block' }} />
          <h2 className="text-lg font-semibold">MLM DX</h2>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {navigationConfig.map((group, index) => (
          <SidebarGroup key={index}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item, idx) => {
                  if (item.adminOnly && (!user || !isAdmin(user.role))) {
                    return null;
                  }
                  const IconComponent = iconMap[item.iconName as keyof typeof iconMap];
                  return (
                    <Link key={idx} href={item.href}>
                      <SidebarMenuButton onClick={() => setOpenMobile(false)}>
                        <IconComponent />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </Link>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        {user && (
          <div className="flex items-center gap-3 p-3">
            <div 
              className="flex items-center gap-3 flex-1 cursor-pointer hover:bg-gray-100 rounded-md transition-colors p-2 -m-2" 
              onClick={handleProfileClick}
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={user.picture} alt={user.nickname || user.name || 'User'} />
                <AvatarFallback>
                  {(user.nickname || user.name)?.charAt(0)?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.nickname || user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                signOut();
              }}
              className="g_id_signout h-8 w-8 p-0 hover:bg-gray-200"
            >
              <LogOutIcon className="h-4 w-4" />
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  )
}
