import Link from 'next/link';
import { useTitle } from "@/app/context/TitleContext";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton } from "@/components/ui/sidebar"
import { CalendarIcon, GuitarIcon, UsersIcon, SquarePlayIcon, FileUserIcon, UserIcon } from "lucide-react"

const sidebarData = [
  {
    label: "ホール",
    items: [
      { icon: <CalendarIcon />, href: "/reservation", text: "予約表" }
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
      { icon: <SquarePlayIcon />, href: "#", text: "ライブアーカイブ" },
      { icon: <FileUserIcon />, href: "/members", text: "部員名簿" }
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

  return (
    <Sidebar>
      <SidebarHeader>
        <span>MLM DX</span>
      </SidebarHeader>
      <SidebarContent>
        {sidebarData.map((group, index) => (
          <SidebarGroup key={index}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item, idx) => (
                  <SidebarMenuButton key={idx}>
                    {item.icon}
                    <Link href={item.href} onClick={() => setTitle(item.text)}>
                      <span>{item.text}</span>
                    </Link>
                  </SidebarMenuButton>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  )
}
