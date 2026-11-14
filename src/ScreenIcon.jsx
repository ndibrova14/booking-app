export default function ScreenIcon({ name }) {
  const shapes = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    location: <><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    guests: <><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v2" /></>,
    menu: <><path d="M4 3h12a4 4 0 0 1 4 4v14H8a4 4 0 0 1-4-4ZM4 17a4 4 0 0 1 4-4h12M8 7h7" /></>,
    route: <path d="m21 3-7 18-3-8-8-3Z" />,
    check: <path d="m5 12 4 4L19 6" />,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
    back: <path d="m14 5-7 7 7 7" />,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2" /></>,
    venue: <><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5M9 9h1M14 9h1M9 12h1M14 12h1" /></>,
  }
  return <svg className="screen-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>
}
