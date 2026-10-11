# PageHeader の右側操作

`rightActions` は従来の JSX に加え、`PageHeaderAction[]` を受け取る。通常のボタンと、項目別のメニューを任意の順序で並べられる。既存画面の指定はそのまま利用できる。

```tsx
import { PageHeader, type PageHeaderAction } from '@/components/page-header';

const actions: PageHeaderAction[] = [
  { type: 'action', id: 'add', content: <Button onClick={openAdd}>追加</Button> },
  {
    type: 'menu',
    id: 'annual',
    label: '年度更新',
    hidden: !isEditorMode,
    items: [
      { id: 'transition', label: '幹部交代', onSelect: openTransition },
      {
        id: 'promote', label: '学年繰上', onSelect: openPromotion,
        disabled: isSubmitting, destructive: true, separatorBefore: true,
      },
    ],
  },
];

return <PageHeader rightActions={actions} />;
```

- `type: 'action'` の `content` に既存の Button、リンク、状態表示などを渡す。
- `type: 'menu'` ごとに独立した文字のみのメニューボタンを表示する。`variant` の既定値は `outline`。
- `hidden` は操作・メニュー・項目を非表示にする。表示項目がないメニューも非表示になる。非表示項目による先頭の区切り線は出ない。
- `disabled` はメニュー全体または項目の操作を無効化する。表示可否・権限・送信中状態・API呼び出し・通知は利用側で管理する。
- 項目を選択するとメニューを閉じ、トリガーへのフォーカス復帰後に `onSelect` を1回実行する。Escや外側クリックで閉じた場合は実行しない。

## ダイアログを開く場合

メニュー内に DialogTrigger を埋め込まず、`onSelect` で外側の controlled Dialog を開く。ダイアログを閉じた後のフォーカス復帰には、メニューの `triggerRef` を渡す。

```tsx
const menuRef = useRef<HTMLButtonElement>(null);
const [open, setOpen] = useState(false);

return (
  <>
    <PageHeader rightActions={[{
      type: 'menu', id: 'registration', label: '登録', triggerRef: menuRef,
      items: [{ id: 'import', label: 'CSVインポート', onSelect: () => setOpen(true) }],
    }]} />
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent onCloseAutoFocus={event => {
        event.preventDefault();
        menuRef.current?.focus();
      }}>
        {/* DialogHeader、入力、DialogFooter を配置 */}
      </DialogContent>
    </Dialog>
  </>
);
```

既存画面のメニュー移行時は、主要操作を残し、関連する補助操作を同じメニューにまとめる。選択・検索条件や接続状態はメニュー項目にしない。
