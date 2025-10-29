export interface NavigationItem {
  href: string;
  title: string;
  iconName: string;
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
      { iconName: "HelpCircleIcon", href: "/support/reservation", title: "予約の使い方" }
    ]
  },
  {
    label: "イベント",
    items: [
      { iconName: "CalendarIcon", href: "/event", title: "イベント管理" }
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
      { iconName: "FileUserIcon", href: "/member", title: "部員名簿" }
    ]
  },
];

export const additionalPages: Record<string, string> = {
  '/': 'ホーム',
  '/profile': 'プロフィール',
  '/login': 'ログイン',
  '/event': 'イベント管理',
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
