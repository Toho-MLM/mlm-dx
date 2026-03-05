const ANIMATION_SVG = `
<svg viewBox="0 0 440 890" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="ios-wallpaper" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6" />
      <stop offset="100%" stop-color="#8b5cf6" />
    </linearGradient>
    <clipPath id="app-clip">
      <rect width="400" height="850" rx="35" />
    </clipPath>
  </defs>

  <rect x="10" y="10" width="420" height="870" rx="45" fill="#000000" />

  <g transform="translate(20, 20)">
    <g clip-path="url(#app-clip)">
      <rect width="400" height="850" rx="35" fill="url(#ios-wallpaper)" />

      <g class="all-wrapper">
        <g class="in-app-group">
          <rect width="400" height="850" rx="35" fill="#f3f4f6" />

          <path d="M 0 35 A 35 35 0 0 1 35 0 L 365 0 A 35 35 0 0 1 400 35 L 400 95 L 0 95 Z" fill="#181818" />

          <g transform="translate(0, 45)">
            <g transform="translate(11, 16) scale(0.9)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m15 18-6-6 6-6" />
            </g>
            <rect x="50" y="10" width="290" height="36" rx="18" fill="#2d2d2d" />
            <circle cx="70" cy="28" r="5" fill="none" stroke="#ffffff" stroke-width="1.5" />
            <line x1="74" y1="32" x2="78" y2="36" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" />
            <text x="88" y="33" font-size="14" fill="#ffffff">dx.tohomlm.workers.dev</text>
            <g transform="translate(352, 16) scale(0.9)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </g>
          </g>

          <path d="M 0 780 L 400 780 L 400 815 A 35 35 0 0 1 365 850 L 35 850 A 35 35 0 0 1 0 815 Z" fill="#181818" />
          <g transform="translate(27, 803) scale(1)" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6" />
          </g>
          <g transform="translate(97, 803) scale(1)" fill="none" stroke="#4b5563" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m9 18 6-6-6-6" />
          </g>
          <g transform="translate(200, 815)" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">
            <g transform="translate(-12, -12)">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </g>
          </g>
          <g transform="translate(285, 815)" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">
            <g transform="translate(-12, -12)">
              <path d="M12 2v13" />
              <path d="m16 6-4-4-4 4" />
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            </g>
          </g>
          <g fill="#9ca3af">
            <g transform="translate(358, 803)" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="1" />
              <circle cx="12" cy="5" r="1" />
              <circle cx="12" cy="19" r="1" />
            </g>
          </g>

          <g class="dropdown-menu">
            <rect x="140" y="610" width="245" height="150" rx="14" fill="#4a4a4c" filter="drop-shadow(0 10px 15px rgba(0,0,0,0.3))" />

            <g transform="translate(140, 610)">
              <rect class="menu-target-bg" width="245" height="50" rx="14" />
              <text x="20" y="30" font-size="15" fill="#ffffff">ブラウザで開く</text>
              <g transform="translate(203, 13)" stroke="#9ca3af" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
                <path d="M2 12h20"/>
              </g>
            </g>

            <line x1="160" y1="660" x2="385" y2="660" stroke="#5c5c5e" stroke-width="1" />

            <g transform="translate(140, 660)">
              <rect width="245" height="50" fill="transparent" />
              <text x="20" y="30" font-size="15" fill="#ffffff">リンクをコピー</text>
              <g transform="translate(203, 13)" stroke="#9ca3af" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </g>
            </g>

            <line x1="160" y1="710" x2="385" y2="710" stroke="#5c5c5e" stroke-width="1" />

            <g transform="translate(140, 710)">
              <rect width="245" height="50" rx="14" fill="transparent" />
              <text x="20" y="30" font-size="15" fill="#ffffff">Keep メモに送信</text>
              <g transform="translate(203, 13)" stroke="#9ca3af" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z"/>
              </g>
            </g>
          </g>

          <circle class="ripple-1" cx="370" cy="815" r="15" fill="rgba(255, 255, 255, 0.4)" />
          <circle class="ripple-2" cx="262" cy="635" r="15" fill="rgba(255, 255, 255, 0.4)" />
        </g>

        <g class="safari-group">
          <rect width="400" height="850" rx="35" fill="#f4f5f7" />

          <g fill="#000000">
            <text x="50" y="32" font-size="14" font-weight="bold" text-anchor="middle">9:41</text>
            <path d="M 330 25 A 15 15 0 0 1 350 25 M 333 28 A 11 11 0 0 1 347 28 M 337 31 A 5 5 0 0 1 343 31" fill="none" stroke="#000000" stroke-width="2" stroke-linecap="round"/>
            <rect x="358" y="21" width="22" height="11" rx="3" fill="none" stroke="#000000" stroke-width="1.5" />
            <rect x="360" y="23" width="14" height="7" rx="1.5" fill="#000000" />
            <path d="M 381 24 V 29" stroke="#000000" stroke-width="1.5" stroke-linecap="round" />
          </g>

          <g transform="translate(200, 380)">
            <circle cx="0" cy="-40" r="45" fill="none" stroke="#2563eb" stroke-width="6" />
            <path d="M-15 -55 L25 -65 L15 -25 L-25 -15 Z" fill="#2563eb" />
            <circle cx="0" cy="-40" r="5" fill="#ffffff" stroke="#2563eb" stroke-width="2" />

            <text y="40" font-size="22" font-weight="bold" fill="#1f2937" text-anchor="middle">ブラウザアプリで開きました</text>
            <text y="70" font-size="14" fill="#6b7280" text-anchor="middle">これでGoogleログインが可能です</text>
          </g>

          <g transform="translate(15, 730)">
            <rect width="370" height="60" rx="16" fill="#ffffff" filter="drop-shadow(0 4px 12px rgba(0,0,0,0.08))" />
            <text x="25" y="36" font-family="serif" font-weight="bold" fill="#374151" letter-spacing="-3">
              <tspan font-size="18">A</tspan>
              <tspan font-size="12">A</tspan>
            </text>
            <path d="M96 32 V30 A4 4 0 0 1 104 30 V32 H106 V40 H94 V32 Z" fill="#9ca3af" />
            <text x="110" y="36" font-size="15" fill="#111827">dx.tohomlm.workers.dev</text>
            <g transform="translate(345, 30)" stroke="#374151" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">
              <g transform="translate(-12,-12)">
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
              </g>
            </g>
          </g>

          <g transform="translate(0, 805)" stroke="#374151" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <g transform="translate(20, 8)">
              <path d="m15 18-6-6 6-6" />
            </g>
            <g transform="translate(90, 8)" stroke="#d1d5db">
              <path d="m9 18 6-6-6-6" />
            </g>
            <g transform="translate(188, 8)">
              <path d="M12 2v13" />
              <path d="m16 6-4-4-4 4" />
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            </g>
            <g transform="translate(288, 8)">
              <path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z" />
            </g>
            <path d="M 364 15 h 12 v 12 h -12 z" />
            <path d="M 368 11 h 12 v 12 h -12 z" fill="#f4f5f7" />
          </g>
        </g>
      </g>

      <g class="pointer">
        <g class="pointer-core">
          <circle cx="0" cy="0" r="18" fill="rgba(255, 255, 255, 0.3)" stroke="#ffffff" stroke-width="2" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))" />
          <circle cx="0" cy="0" r="5" fill="#ffffff" />
        </g>
      </g>
    </g>
  </g>

  <g transform="translate(160, 28)">
    <rect width="120" height="34" rx="17" fill="#000000" />
    <circle cx="95" cy="17" r="7" fill="#111111" />
    <circle cx="95" cy="17" r="2" fill="#1a1a24" />
  </g>
</svg>
`

export function InAppBrowserGuide() {
  return (
    <div className="in-app-browser-guide w-full max-w-md rounded-xl border border-orange-200 bg-white p-4 shadow-lg">
      <div className="mb-3 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-800">
        アプリ内ブラウザではログインできません。ブラウザアプリからアクセスしてください。
      </div>

      <div className="svg-container" dangerouslySetInnerHTML={{ __html: ANIMATION_SVG }} />

      <style jsx global>{`
        .in-app-browser-guide .svg-container {
          width: 100%;
          max-width: 440px;
          height: auto;
          aspect-ratio: 440 / 890;
          filter: drop-shadow(0 30px 60px rgba(0, 0, 0, 0.15));
        }

        .in-app-browser-guide .all-wrapper {
          opacity: 1;
        }

        .in-app-browser-guide .pointer {
          animation: pointerMove 10s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          transform-origin: 0 0;
          z-index: 100;
          will-change: transform, opacity;
        }
        .in-app-browser-guide .pointer-core {
          animation: pointerPress 10s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          transform-origin: 0 0;
          transform-box: fill-box;
          will-change: transform;
        }
        @keyframes pointerMove {
          0% {
            transform: translate(250px, 950px);
            opacity: 0;
          }
          10% {
            transform: translate(250px, 950px);
            opacity: 0;
          }
          15% {
            transform: translate(370px, 815px);
            opacity: 1;
          }
          22% {
            transform: translate(370px, 815px);
            opacity: 1;
          }
          23% {
            transform: translate(370px, 815px);
            opacity: 1;
          }
          24% {
            transform: translate(370px, 815px);
            opacity: 1;
          }
          32% {
            transform: translate(370px, 815px);
            opacity: 1;
          }
          39% {
            transform: translate(262px, 635px);
            opacity: 1;
          }
          40% {
            transform: translate(262px, 635px);
            opacity: 1;
          }
          41% {
            transform: translate(262px, 635px);
            opacity: 1;
          }
          43% {
            transform: translate(262px, 635px);
            opacity: 1;
          }
          46% {
            transform: translate(262px, 650px);
            opacity: 0;
          }
          100% {
            transform: translate(262px, 650px);
            opacity: 0;
          }
        }
        @keyframes pointerPress {
          0%,
          22% {
            transform: scale(1);
          }
          23% {
            transform: scale(0.85);
          }
          24%,
          39% {
            transform: scale(1);
          }
          40% {
            transform: scale(0.85);
          }
          41%,
          100% {
            transform: scale(1);
          }
        }

        .in-app-browser-guide .dropdown-menu {
          transform-origin: 370px 815px;
          animation: menuPopup 10s cubic-bezier(0.175, 0.885, 0.32, 1) infinite;
        }
        @keyframes menuPopup {
          0%,
          24% {
            opacity: 0;
            transform: translateY(30px) scale(0.95);
            pointer-events: none;
          }
          26%,
          42% {
            opacity: 1;
            transform: translateY(0) scale(1);
            pointer-events: auto;
          }
          44%,
          100% {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
            pointer-events: none;
          }
        }

        .in-app-browser-guide .menu-target-bg {
          animation: menuHighlight 10s infinite;
        }
        @keyframes menuHighlight {
          0%,
          39% {
            fill: transparent;
          }
          40%,
          43% {
            fill: rgba(255, 255, 255, 0.15);
          }
          44%,
          100% {
            fill: transparent;
          }
        }

        .in-app-browser-guide .ripple-1 {
          animation: ripple1 10s infinite;
          transform-origin: 370px 815px;
        }
        @keyframes ripple1 {
          0%,
          22% {
            opacity: 0;
            transform: scale(0.3);
          }
          23% {
            opacity: 0.4;
            transform: scale(0.5);
          }
          28% {
            opacity: 0;
            transform: scale(2.5);
          }
          100% {
            opacity: 0;
            transform: scale(2.5);
          }
        }

        .in-app-browser-guide .ripple-2 {
          animation: ripple2 10s infinite;
          transform-origin: 262px 635px;
        }
        @keyframes ripple2 {
          0%,
          39% {
            opacity: 0;
            transform: scale(0.3);
          }
          40% {
            opacity: 0.4;
            transform: scale(0.5);
          }
          45% {
            opacity: 0;
            transform: scale(2.5);
          }
          100% {
            opacity: 0;
            transform: scale(2.5);
          }
        }

        .in-app-browser-guide .in-app-group {
          animation: slideOut 10s cubic-bezier(0.3, 0.1, 0.1, 1) infinite;
          transform-origin: center center;
        }
        @keyframes slideOut {
          0%,
          50% {
            transform: scale(1) translateX(0);
            opacity: 1;
          }
          54% {
            transform: scale(0.85) translateX(0);
            opacity: 1;
          }
          60% {
            transform: scale(0.85) translateX(-100%);
            opacity: 1;
          }
          61%,
          100% {
            transform: scale(0.85) translateX(-100%);
            opacity: 0;
          }
        }

        .in-app-browser-guide .safari-group {
          animation: slideIn 10s cubic-bezier(0.3, 0.1, 0.1, 1) infinite;
          transform-origin: center center;
        }
        @keyframes slideIn {
          0%,
          50% {
            transform: scale(0.85) translateX(100%);
            opacity: 0;
          }
          54% {
            transform: scale(0.85) translateX(100%);
            opacity: 1;
          }
          60% {
            transform: scale(0.85) translateX(0);
            opacity: 1;
          }
          64%,
          100% {
            transform: scale(1) translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}
