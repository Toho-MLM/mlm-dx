export interface NavigationItem {
  href: string;
  title: string;
  iconName: string;
  adminOnly?: boolean;
}

export interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

export const navigationConfig: NavigationGroup[] = [
  {
    label: "ホール予約",
    items: [
      { iconName: "CalendarIcon", href: "/reservation", title: "予約表" },
      { iconName: "HelpCircleIcon", href: "/support/reservation", title: "予約の使い方" },
      { iconName: "BanIcon", href: "/admin/unavailable-periods", title: "予約不可期間設定", adminOnly: true }
    ]
  },
  {
    label: "イベント",
    items: [
      { iconName: "SpotlightIcon", href: "/event", title: "イベント管理" },
      { iconName: "ListMusicIcon", href: "/event/setlist", title: "セットリスト管理" },
      { iconName: "ListIcon", href: "/event/timeline", title: "タイムライン" }
    ]
  },
  {
    label: "バンド",
    items: [
      { iconName: "UsersIcon", href: "/band", title: "バンド管理" }
    ]
  },
  {
    label: "資料",
    items: [
      { iconName: "SquarePlayIcon", href: "/archive", title: "ライブアーカイブ" },
      { iconName: "FileUserIcon", href: "/member", title: "部員名簿" },
      { iconName: "HelpCircleIcon", href: "/support/admin", title: "管理者マニュアル" }
    ]
  },
];

export const additionalPages: Record<string, string> = {
  '/': 'ホーム',
  '/profile': 'プロフィール',
  '/login': 'ログイン',
  '/event': 'イベント管理',
  '/event/setlist': 'セットリスト管理',
  '/event/timeline': 'タイムライン',
  '/admin/unavailable-periods': '予約不可期間設定',
};

export const getPageTitle = (pathname: string): string => {
  for (const group of navigationConfig) {
    for (const item of group.items) {
      if (item.href === pathname) {
        return item.title;
      }
    }
  }
  
  return additionalPages[pathname] || 'MLM DX';
};
