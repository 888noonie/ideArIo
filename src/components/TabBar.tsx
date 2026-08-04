import type { ReactNode } from 'react';

export type TabId = 'capture' | 'ideas' | 'chat' | 'agents' | 'bridge' | 'settings';

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

interface TabDef {
  id: TabId;
  label: string;
  icon: () => ReactNode;
}

const strokeProps = {
  fill: 'none',
  viewBox: '0 0 24 24',
  stroke: 'currentColor',
  strokeWidth: 1.8,
} as const;

const TABS: TabDef[] = [
  {
    id: 'capture',
    label: 'Capture',
    icon: () => (
      <svg className="w-7 h-7" {...strokeProps}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
        />
      </svg>
    ),
  },
  {
    id: 'ideas',
    label: 'Ideas',
    icon: () => (
      <svg className="w-7 h-7" {...strokeProps}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
        />
      </svg>
    ),
  },
  {
    id: 'chat',
    label: 'Chat',
    icon: () => (
      <svg className="w-7 h-7" {...strokeProps}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
        />
      </svg>
    ),
  },
  {
    id: 'agents',
    label: 'Agents',
    icon: () => (
      <svg className="w-7 h-7" {...strokeProps}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
        />
      </svg>
    ),
  },
  {
    id: 'bridge',
    label: 'Bridge',
    icon: () => (
      <svg className="w-7 h-7" {...strokeProps}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 18.75h.008v.008H12v-.008z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.25 15.75a5.25 5.25 0 017.5 0M5.25 12.75a9.75 9.75 0 0113.5 0M2.25 9.75a14.25 14.25 0 0119.5 0"
        />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: () => (
      <svg className="w-7 h-7" {...strokeProps}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

/**
 * Fixed bottom tab bar — car/AA friendly: >= 64px tall bar, >= 56px touch
 * targets, icon + label, accent underline + tint on the active tab, and
 * safe-area padding for notched phones.
 */
export function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <nav
      className="flex-none bg-ario-grey/95 border-t border-white/10 backdrop-blur-sm"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Main navigation"
    >
      <div className="grid grid-cols-6 min-h-16">
        {TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              aria-current={active ? 'page' : undefined}
              className={`relative min-h-16 min-w-14 flex flex-col items-center justify-center gap-1
                         px-2 transition-colors focus:outline-none focus:ring-2 focus:ring-inset
                         focus:ring-ario-turquoise/50
                         ${active ? 'text-ario-turquoise bg-ario-turquoise/10' : 'text-ario-muted hover:text-ario-text'}`}
            >
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-10 rounded-full bg-ario-turquoise" />
              )}
              {tab.icon()}
              <span className="text-xs font-medium leading-none">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
