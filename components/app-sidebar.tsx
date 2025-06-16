import Link from 'next/link';
import { useTitle } from "@/app/context/TitleContext";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, useSidebar } from "@/components/ui/sidebar"
import { CalendarIcon, UsersIcon, SquarePlayIcon, FileUserIcon, UserIcon, HelpCircleIcon } from "lucide-react"

export const sidebarData = [
  {
    label: "ホール予約",
    items: [
      { icon: <CalendarIcon />, href: "/reservation", text: "予約表" },
      { icon: <HelpCircleIcon />, href: "/support/reservation", text: "使い方" }
    ]
  },
  {
    label: "バンド",
    items: [
      { icon: <UsersIcon />, href: "/band", text: "バンド管理" }
    ]
  },
  {
    label: "資料",
    items: [
      { icon: <SquarePlayIcon />, href: "/archive", text: "ライブアーカイブ" },
      { icon: <FileUserIcon />, href: "/member", text: "部員名簿" }
    ]
  },
  {
    label: "アカウント",
    items: [
      { icon: <UserIcon />, href: "/profile", text: "プロフィール" }
    ]
  }
];

export function AppSidebar() {
  const { setTitle } = useTitle();
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar>
      <SidebarHeader>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src="/assets/logo.png" alt="MLM DX logo" style={{ height: '32px', width: 'auto', marginRight: '8px', display: 'block' }} />
          <span>MLM DX</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {sidebarData.map((group, index) => (
          <SidebarGroup key={index}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item, idx) => (
                  <Link key={idx} href={item.href}>
                    <SidebarMenuButton onClick={() => { setTitle(item.text); setOpenMobile(false); }}>
                      {item.icon}
                      <span>{item.text}</span>
                    </SidebarMenuButton>
                  </Link>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  )
}
