export interface NavigationItem {
  href: string;
  title: string;
  iconName: string;
  adminOnly?: boolean;
}

export interface NavigationGroup {
  label: string;
  items: NavigationItem[];
  adminOnly?: boolean;
}

export interface BreadcrumbItem {
  title: string;
  href?: string;
}

export const navigationConfig: NavigationGroup[] = [
  {
    label: "ホーム",
    items: [
      { iconName: "LayoutDashboardIcon", href: "/", title: "ダッシュボード" }
    ]
  },
  {
    label: "ホール予約",
    items: [
      { iconName: "CalendarIcon", href: "/reservation", title: "予約表" },
      { iconName: "CalendarIcon", href: "/reservation/external", title: "外部予約" },
      { iconName: "CalendarIcon", href: "/reservation/external/lottery", title: "外部抽選" },
      { iconName: "HelpCircleIcon", href: "/support/lottery", title: "外部抽選の仕組み" },
      { iconName: "HelpCircleIcon", href: "/support/reservation", title: "予約の使い方" }
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
      { iconName: "UsersIcon", href: "/band", title: "バンド管理" },
      { iconName: "ListIcon", href: "/band/main", title: "本バンド表" }
    ]
  },
  {
    label: "資料",
    items: [
      { iconName: "SquarePlayIcon", href: "/archive", title: "ライブアーカイブ" },
      { iconName: "FileUserIcon", href: "/member", title: "部員名簿" },
      { iconName: "HelpCircleIcon", href: "/support/admin", title: "管理者マニュアル", adminOnly: true }
    ]
  },
  {
    label: "管理者",
    adminOnly: true,
    items: [
      { iconName: "Building2Icon", href: "/admin/external-studios", title: "外部スタジオ管理", adminOnly: true },
      { iconName: "CalendarIcon", href: "/admin/reservation-limits", title: "予約上限設定", adminOnly: true },
      { iconName: "BanIcon", href: "/admin/unavailable-periods", title: "予約不可期間設定", adminOnly: true }
    ]
  },
];

export const additionalPages: Record<string, string> = {
  '/': 'ダッシュボード',
  '/profile': 'プロフィール',
  '/login': 'ログイン',
  '/event': 'イベント管理',
  '/event/setlist': 'セットリスト管理',
  '/event/timeline': 'タイムライン',
  '/admin/reservation-limits': '予約上限設定',
  '/admin/unavailable-periods': '予約不可期間設定',
  '/admin/external-studios': '外部スタジオ管理',
  '/reservation/external': '外部予約',
  '/reservation/external/lottery': '外部抽選',
  '/support/lottery': '外部抽選の仕組み',
  '/band/main': '本バンド表',
};

const dynamicBreadcrumbs: Array<{
  match: (pathname: string) => boolean;
  items: BreadcrumbItem[];
}> = [
  {
    match: (pathname) => pathname.startsWith('/band/main/draft/'),
    items: [
      { title: 'バンド' },
      { title: '本バンド決め' },
    ],
  },
];

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

export const getBreadcrumbItems = (pathname: string): BreadcrumbItem[] => {
  const dynamicMatch = dynamicBreadcrumbs.find((entry) => entry.match(pathname));
  if (dynamicMatch) {
    return dynamicMatch.items;
  }

  for (const group of navigationConfig) {
    for (const item of group.items) {
      if (item.href === pathname) {
        return [
          { title: group.label },
          { title: item.title },
        ];
      }
    }
  }

  return [{ title: additionalPages[pathname] || 'MLM DX' }];
};
