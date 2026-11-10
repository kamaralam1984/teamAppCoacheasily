import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarDays,
  CheckCheck,
  Code2,
  ExternalLink,
  FileBarChart,
  LayoutGrid,
  ScrollText,
  Settings,
  Users,
  CalendarOff,
  ChevronDown,
  Clock,
  FileText,
  Heart,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Flag,
  Lightbulb,
  ListChecks,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  Swords,
  Target,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";

import { Mark } from "@/components/Mark";
import { NotificationBell } from "@/components/NotificationBell";
import { SubmitIdea } from "@/components/ideas/SubmitIdea";
import { OfflineGate } from "@/components/OfflineGate";
import { ThemePicker } from "@/components/ThemePicker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMyProfile } from "@/hooks/useMyProfile";
import { useOrgSettings } from "@/hooks/useOrg";
import { BirthdayTakeover } from "@/components/birthday/BirthdayTakeover";
import {
  DiwaliHeaderDecor,
  DiwaliPageDecor,
  useDiwaliDecor,
} from "@/components/festive/DiwaliDecor";
import { ProbationAlert } from "@/components/probation/ProbationAlert";
import { useLatestUnseenRelease } from "@/hooks/useReleases";
import { PeopleSearch } from "@/components/PeopleSearch";
import { useDeveloperAccess } from "@/hooks/useDeveloper";

import { supabase } from "@/integrations/supabase/client";
import { isTestingActive, prettyTestingDate } from "@/lib/testing";
import { roleLabel } from "@/lib/warriors";
import { cn } from "@/lib/utils";

// Personal tabs. On desktop the everyday ones (TOP_TABS) sit in the top bar and the rest in the left sidebar.
const BASE_TABS: readonly { label: string; to: string; icon: LucideIcon }[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Calendar", to: "/calendar", icon: CalendarDays },
  { label: "Tasks", to: "/tasks", icon: ListChecks },
  { label: "Goals", to: "/goals", icon: Target },
  { label: "Strategic Meetings", to: "/strategic-meetings", icon: Flag },
  { label: "Culture", to: "/culture", icon: Heart },
  { label: "Leave", to: "/leave", icon: CalendarOff },
  { label: "Attendance", to: "/attendance", icon: Clock },
  { label: "My report", to: "/my-report", icon: FileText },
  { label: "Warriors", to: "/warriors", icon: Swords },
  { label: "Ideas", to: "/ideas", icon: Lightbulb },
];

// Everyday tabs that stay in the top bar on desktop instead of the left sidebar.
const TOP_TAB_PATHS = new Set(["/dashboard", "/calendar", "/tasks", "/goals"]);
const TOP_TABS = BASE_TABS.filter((t) => TOP_TAB_PATHS.has(t.to));

const SIDEBAR_COLLAPSED_KEY = "ce-sidebar-collapsed";

type Tab = { label: string; to: string; icon: LucideIcon };

const LEAD_TABS: readonly Tab[] = [
  { label: "Overview", to: "/overview", icon: LayoutGrid },
  { label: "Team", to: "/team", icon: Users },
  { label: "Report centre", to: "/report-center", icon: BarChart3 },
  { label: "Approvals", to: "/approvals", icon: CheckCheck },
];

const HR_TABS: readonly Tab[] = [
  { label: "Reports", to: "/reports", icon: FileBarChart },
  { label: "Audit", to: "/audit", icon: ScrollText },
  { label: "Settings", to: "/settings", icon: Settings },
];

const DEV_TAB: Tab = { label: "Developer", to: "/developer", icon: Code2 };

const MOBILE_TAB_GAP = 4; // px between tabs in the phone top strip (gap-1)
const MOBILE_STRIP_PAD = 16; // px of horizontal padding in the phone top strip (px-2)

const SIR_AVAILABILITY_URL =
  "https://n8n.srv1623478.hstgr.cloud/webhook/ph-availability?k=M84hry9rj5R9dHk6O2wT8X_A";
// People (by first name) who see the PH Sir Availability link besides HR and Admin.
const SIR_AVAILABILITY_PEOPLE = ["shubhangi", "supriya", "prachi", "saurabh", "pranjal", "sapana"];

export function AppShell({ children }: { children: ReactNode }) {
  const { data, isLoading } = useMyProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navRef = useRef<HTMLDivElement | null>(null);
  const { data: orgSettings } = useOrgSettings(Boolean(data?.profile));
  const { data: unseenRelease } = useLatestUnseenRelease(Boolean(data?.profile));
  const { data: dev } = useDeveloperAccess(Boolean(data?.user));

  const profile = data?.profile ?? null;
  const role = profile?.role ?? "member";

  const [mobileOpen, setMobileOpen] = useState(false);
  // How many tabs fit whole in the phone top strip; the rest go to the left drawer.
  const [fitCount, setFitCount] = useState(3);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);
  const [headerH, setHeaderH] = useState(0);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    } catch {
      // storage unavailable; keep the sidebar expanded
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => setHeaderH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  // Desktop: personal tabs in the left sidebar; team, HR and developer tabs in the top bar.
  // Phone: as many tabs as fit whole sit in the top strip, and the rest move to the left drawer.
  const leadTabs = role === "manager" || role === "hr" || role === "admin" ? LEAD_TABS : [];
  const hrTabs = role === "hr" || role === "admin" ? HR_TABS : [];
  const devTabs = dev?.isDeveloper ? [DEV_TAB] : [];
  const roleTabs = [...leadTabs, ...hrTabs, ...devTabs];
  // Desktop top bar: the everyday tabs first, then team, HR and developer tabs.
  const tabs = [...TOP_TABS, ...roleTabs];
  const mobileTabs: readonly Tab[] = [...BASE_TABS, ...roleTabs];
  const inStrip = new Set(mobileTabs.slice(0, fitCount).map((t) => t.to));
  const drawerSections: { title: string; items: readonly Tab[] }[] = [
    { title: "Team", items: leadTabs.filter((t) => !inStrip.has(t.to)) },
    { title: "HR", items: hrTabs.filter((t) => !inStrip.has(t.to)) },
    { title: "Developer", items: devTabs.filter((t) => !inStrip.has(t.to)) },
  ].filter((sec) => sec.items.length > 0);
  const mobileTabKey = mobileTabs.map((t) => t.to).join("|");
  const firstName = (profile?.full_name ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const showAvailability =
    role === "hr" || role === "admin" || SIR_AVAILABILITY_PEOPLE.includes(firstName);
  const hasReports = tabs.some((t) => t.label === "Reports");

  useEffect(() => {
    const strip = stripRef.current;
    const measure = measureRef.current;
    if (!strip || !measure) return;
    const fit = () => {
      const avail = strip.clientWidth - MOBILE_STRIP_PAD;
      const widths = Array.from(measure.children).map((c) => (c as HTMLElement).offsetWidth);
      let used = 0;
      let n = 0;
      for (const w of widths) {
        const next = used + (n > 0 ? MOBILE_TAB_GAP : 0) + w;
        if (next > avail) break;
        used = next;
        n += 1;
      }
      setFitCount(n);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(strip);
    return () => ro.disconnect();
  }, [mobileTabKey]);

  useEffect(() => {
    const active = navRef.current?.querySelector<HTMLElement>("[data-active='true']");
    active?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [pathname, tabs.length]);

  async function handleSignOut() {
    setSigningOut(true);
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const label = roleLabel(profile?.role);
  const testingActive = isTestingActive(orgSettings?.testing_until);
  const diwali = useDiwaliDecor();
  const testingLabel = prettyTestingDate(orgSettings?.testing_until);

  return (
    <div className="relative z-10 min-h-screen overflow-x-clip">
      <OfflineGate />
      {diwali ? <DiwaliPageDecor /> : null}
      <BirthdayTakeover me={profile} showTeam={orgSettings?.team_birthdays !== false} />
      {profile && (role === "hr" || role === "admin") ? (
        <ProbationAlert viewerId={profile.id} />
      ) : null}
      <header ref={headerRef} className="sticky top-0 z-40 bg-night">
        {diwali ? <DiwaliHeaderDecor /> : null}
        <div
          className={cn(
            "relative z-10 mx-auto flex max-w-6xl items-center gap-1.5 px-2 py-2.5 sm:gap-3 sm:px-4 sm:py-3",
            diwali && "pt-7",
          )}
        >
          <button
            type="button"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((o) => !o)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-mist transition-colors hover:bg-night2 hover:text-goldL lg:hidden"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <Link to="/dashboard" className="flex shrink-0 items-center gap-2.5">
            <span className="ce-logo-ring ce-float">
              <span className="flex h-10 w-10 items-center justify-center">
                <Mark size={30} color="var(--ce-goldL)" />
              </span>
            </span>
            <span className="hidden leading-none min-[420px]:block">
              <span className="font-display text-xl text-white">Coach</span>
              <span className="font-display text-xl text-goldL">Easily</span>
              <span className="mt-0.5 block text-[10px] font-bold tracking-[0.22em] text-mist">
                TEAM APP
              </span>
            </span>
          </Link>

          <div className="ml-auto flex min-w-0 items-center gap-0.5 sm:gap-2">
            {role === "hr" || role === "admin" ? <ThemePicker canSetDefault /> : null}

            <span data-tour="idea" className="inline-flex">
              <SubmitIdea enabled={Boolean(profile)} />
            </span>

            <PeopleSearch enabled={Boolean(profile)} />

            <NotificationBell enabled={Boolean(profile)} />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Account menu"
                  data-tour="account"
                  className="relative flex h-11 min-w-11 items-center gap-2 rounded-lg px-2 text-left transition-colors hover:bg-night2"
                >
                  {unseenRelease ? (
                    <span
                      aria-hidden
                      className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-goldL"
                    />
                  ) : null}

                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-night2 text-[11px] font-bold tracking-wide text-goldL sm:hidden">
                    {(profile?.full_name ?? data?.user?.email ?? "?")
                      .split(" ")
                      .slice(0, 2)
                      .map((w) => w[0])
                      .join("")
                      .toUpperCase()}
                  </span>
                  <span className="hidden max-w-[11rem] flex-col items-end leading-tight sm:flex">
                    <span className="max-w-[11rem] truncate text-sm font-semibold text-white">
                      {isLoading ? "…" : (profile?.full_name ?? data?.user?.email ?? "")}
                    </span>
                    {label ? (
                      <span className="text-[10px] font-bold tracking-[0.18em] text-goldL uppercase">
                        {label}
                      </span>
                    ) : null}
                  </span>
                  <ChevronDown size={16} className="text-mist" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem asChild>
                  <Link to="/profile" className="flex items-center gap-2">
                    <UserRound size={16} /> My profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/whats-new" className="flex items-center gap-2">
                    <Sparkles size={16} /> What's new
                    {unseenRelease ? (
                      <span aria-hidden className="ml-auto h-2 w-2 rounded-full bg-goldD" />
                    ) : null}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/help" className="flex items-center gap-2">
                    <LifeBuoy size={16} /> Help
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <Link to="/change-password" className="flex items-center gap-2">
                    <KeyRound size={16} /> Change password
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onSelect={() => {
                    void handleSignOut();
                  }}
                  disabled={signingOut}
                  className="flex items-center gap-2"
                >
                  <LogOut size={16} /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <nav
          aria-label="Main"
          ref={stripRef}
          className="relative overflow-hidden border-t border-night2 bg-night2 lg:hidden"
        >
          <div className="flex items-center gap-1 px-2 py-2">
            {mobileTabs.slice(0, fitCount).map((tab) => {
              const active = pathname === tab.to;
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-10 shrink-0 items-center rounded-full px-3 text-[13px] whitespace-nowrap transition-colors",
                    active
                      ? "bg-night font-bold text-goldL"
                      : "font-semibold text-mist hover:text-goldL",
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
          {/* Off-screen copy of every tab, measured to decide how many fit whole. */}
          <div
            ref={measureRef}
            aria-hidden
            className="pointer-events-none invisible absolute top-0 left-0 flex"
          >
            {mobileTabs.map((tab) => (
              <span
                key={tab.to}
                className="flex min-h-10 shrink-0 items-center px-3 text-[13px] font-bold whitespace-nowrap"
              >
                {tab.label}
              </span>
            ))}
          </div>
        </nav>

        {tabs.length > 0 || showAvailability ? (
          <nav className="no-scrollbar hidden overflow-x-auto border-t border-night2 bg-night2 lg:block">
            <div ref={navRef} className="mx-auto flex max-w-6xl items-center gap-1 px-2 py-2">
              {tabs.length === 0 && showAvailability ? (
                <a
                  href={SIR_AVAILABILITY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap text-mist transition-colors hover:text-goldL"
                >
                  PH Sir Availability
                </a>
              ) : null}
              {tabs.map((tab, i) => {
                const active = pathname === tab.to;
                return (
                  <Fragment key={tab.label}>
                    <Link
                      to={tab.to}
                      data-active={active}
                      data-tour={tab.to === "/leave" ? "tab-leave" : undefined}
                      className={
                        active
                          ? "flex min-h-11 shrink-0 items-center rounded-full bg-night px-4 text-sm font-bold whitespace-nowrap text-goldL"
                          : "flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap text-mist transition-colors hover:text-goldL"
                      }
                    >
                      {tab.label}
                    </Link>
                    {showAvailability &&
                    (tab.label === "Reports" || (!hasReports && i === tabs.length - 1)) ? (
                      <a
                        href={SIR_AVAILABILITY_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap text-mist transition-colors hover:text-goldL"
                      >
                        PH Sir Availability
                      </a>
                    ) : null}
                  </Fragment>
                );
              })}
            </div>
          </nav>
        ) : null}
        <div aria-hidden className="ce-nav-line" />
        {/* room under the line for the Diwali diyas, so they never sit on the page */}
        {diwali ? <div aria-hidden className="h-[26px] bg-night" /> : null}

        {testingActive ? (
          <div className="border-t border-gold/40 bg-gold/15">
            <p className="mx-auto max-w-6xl px-4 py-1.5 text-[12px] leading-snug font-semibold text-goldL sm:text-[13px]">
              Testing week — until {testingLabel} we are checking every number. If something looks
              wrong, especially your leave balance, please{" "}
              <Link to="/ideas" className="underline underline-offset-2">
                tell us
              </Link>
              .
            </p>
          </div>
        ) : null}
      </header>

      {mobileOpen ? (
        <div
          aria-hidden
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      ) : null}

      <div className="lg:flex">
        <aside
          aria-label="Personal"
          style={{ top: headerH, height: `calc(100dvh - ${headerH}px)` }}
          className={cn(
            "fixed left-0 z-50 flex w-64 flex-col border-r border-night2 bg-night transition-[transform,width] duration-200 ease-out",
            "lg:sticky lg:z-30 lg:shrink-0 lg:self-start lg:translate-x-0",
            mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full",
            collapsed ? "lg:w-16" : "lg:w-56",
          )}
        >
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "hidden min-h-11 items-center gap-3 border-b border-night2 px-5 text-sm font-semibold text-mist transition-colors hover:text-goldL lg:flex",
              collapsed && "justify-center px-0",
            )}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            {collapsed ? null : <span>Collapse</span>}
          </button>
          <nav className="no-scrollbar flex-1 overflow-y-auto px-2 py-3">
            <ul className="flex flex-col gap-1">
              {BASE_TABS.map((tab) => {
                const active = pathname === tab.to;
                const Icon = tab.icon;
                return (
                  <li
                    key={tab.to}
                    className={cn(
                      inStrip.has(tab.to) && "max-lg:hidden",
                      TOP_TAB_PATHS.has(tab.to) && "lg:hidden",
                    )}
                  >
                    <Link
                      to={tab.to}
                      title={collapsed ? tab.label : undefined}
                      data-tour={tab.to === "/leave" ? "tab-leave" : undefined}
                      className={cn(
                        "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm whitespace-nowrap transition-colors",
                        collapsed && "lg:justify-center lg:px-0",
                        active
                          ? "bg-night2 font-bold text-goldL"
                          : "font-semibold text-mist hover:bg-night2/60 hover:text-goldL",
                      )}
                    >
                      <Icon size={18} className="shrink-0" />
                      <span className={cn(collapsed && "lg:hidden")}>{tab.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {drawerSections.map((sec) => (
              <div key={sec.title} className="mt-3 pt-1 lg:hidden">
                <p className="px-3 pb-1.5 text-[10px] font-bold tracking-[0.2em] text-mist/70 uppercase">
                  {sec.title}
                </p>
                <ul className="flex flex-col gap-1">
                  {sec.items.map((tab) => {
                    const active = pathname === tab.to;
                    const Icon = tab.icon;
                    return (
                      <li key={tab.to}>
                        <Link
                          to={tab.to}
                          className={cn(
                            "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm whitespace-nowrap transition-colors",
                            active
                              ? "bg-night2 font-bold text-goldL"
                              : "font-semibold text-mist hover:bg-night2/60 hover:text-goldL",
                          )}
                        >
                          <Icon size={18} className="shrink-0" />
                          <span>{tab.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {showAvailability ? (
              <div className="mt-3 border-t border-night2 pt-3 lg:hidden">
                <a
                  href={SIR_AVAILABILITY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold whitespace-nowrap text-mist transition-colors hover:bg-night2/60 hover:text-goldL"
                >
                  <ExternalLink size={18} className="shrink-0" />
                  <span>PH Sir Availability</span>
                </a>
              </div>
            ) : null}
          </nav>
        </aside>

        <main className="mx-auto w-full min-w-0 max-w-6xl px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))]">
          {isLoading && !data ? (
            <div className="ce-card p-6 text-sm text-soft">Loading your workspace…</div>
          ) : profile ? (
            children
          ) : (
            <div className="ce-card mx-auto max-w-md p-6 text-center">
              <h2 className="font-display text-2xl text-ink">Almost there</h2>
              <p className="mt-2 text-sm text-soft">
                Your account isn't set up yet — ask HR to invite you.
              </p>
              <button className="btn3d btn3d-ghost mt-5" onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default AppShell;
