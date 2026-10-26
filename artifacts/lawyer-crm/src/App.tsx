import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { ruRU } from "@clerk/localizations";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { BookOpen, BriefcaseBusiness, CircleUserRound, LogOut, UsersRound } from "lucide-react";
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation } from "wouter";
import { Toaster } from "sonner";
import { useCreateDemoSignInLink, useGetCurrentTeamMember, getGetCurrentTeamMemberQueryKey } from "@workspace/api-client-react";
import Dashboard from "@/pages/dashboard";
import ClientDetailPage from "@/pages/client-detail";
import DocumentationPage from "@/pages/documentation";
import TeamPage from "@/pages/team";
import { Button } from "@/components/ui/button";
import { AccessContext, type AccessValue, useAccess } from "@/lib/access-context";

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const appLocalization = {
  ...ruRU,
  signIn: {
    ...ruRU.signIn,
    start: {
      ...ruRU.signIn?.start,
      title: "С возвращением",
      subtitle: "Войдите в рабочий аккаунт",
    },
  },
  signUp: {
    ...ruRU.signUp,
    start: {
      ...ruRU.signUp?.start,
      title: "Создание аккаунта",
      subtitle: "Запросите доступ к CRM команды",
    },
  },
};

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#27465f",
    colorForeground: "#263746",
    colorMutedForeground: "#67727c",
    colorDanger: "#a5433e",
    colorBackground: "#fbfaf6",
    colorInput: "#f8f6f0",
    colorInputForeground: "#263746",
    colorNeutral: "#d8d1c3",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    borderRadius: "0.8rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#fbfaf6] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[#d8d1c3]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#263746] font-serif",
    headerSubtitle: "text-[#67727c]",
    socialButtonsBlockButtonText: "text-[#263746] font-medium",
    formFieldLabel: "text-[#263746] font-medium",
    footerActionLink: "text-[#27465f] font-semibold",
    footerActionText: "text-[#67727c]",
    dividerText: "text-[#67727c]",
    identityPreviewEditButton: "text-[#27465f]",
    formFieldSuccessText: "text-[#2c6957]",
    alertText: "text-[#7d342f]",
    logoBox: "rounded-xl overflow-hidden",
    logoImage: "rounded-xl",
    socialButtonsBlockButton: "border-[#d8d1c3] hover:bg-[#f2efe7]",
    formButtonPrimary: "bg-[#27465f] hover:bg-[#1d394f] text-white",
    formFieldInput: "bg-[#f8f6f0] text-[#263746] border-[#d8d1c3]",
    footerAction: "border-[#d8d1c3]",
    dividerLine: "bg-[#d8d1c3]",
    alert: "bg-[#fbefec] border-[#e5c9c4]",
    otpCodeFieldInput: "bg-[#f8f6f0] text-[#263746] border-[#d8d1c3]",
    formFieldRow: "text-[#263746]",
    main: "text-[#263746]",
  },
};

function ClerkCacheInvalidator() {
  const { addListener } = useClerk();
  const cache = useQueryClient();
  const previousId = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const id = user?.id ?? null;
    if (previousId.current !== undefined && previousId.current !== id) cache.clear();
    previousId.current = id;
  }), [addListener, cache]);
  return null;
}

function Home() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <LoadingScreen />;
  if (isSignedIn) return <Redirect to="/dashboard" />;
  return (
    <main className="min-h-[100dvh] bg-background px-5 py-12 text-foreground">
      <div className="mx-auto grid min-h-[75dvh] max-w-6xl overflow-hidden rounded-[2rem] border border-border bg-card shadow-[0_24px_80px_-42px_rgba(29,48,63,.35)] lg:grid-cols-[1.1fr_.9fr]">
        <section className="relative flex flex-col justify-between overflow-hidden bg-primary p-8 text-primary-foreground md:p-14">
          <div className="absolute -right-24 -top-28 h-80 w-80 rounded-full border border-white/10" />
          <div className="absolute -right-8 -top-12 h-52 w-52 rounded-full border border-white/10" />
          <img
            src={`${basePath}/lady-justice.png`}
            alt="Богиня правосудия с повязкой на глазах, весами и мечом"
            data-testid="img-lady-justice"
            className="pointer-events-none absolute right-3 top-3 z-0 h-24 w-24 object-contain opacity-35 sm:right-5 sm:top-5 sm:h-32 sm:w-32 lg:right-8 lg:top-8 lg:h-40 lg:w-40"
          />
          <div className="relative z-10 flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/20 bg-white/10"><BriefcaseBusiness className="h-6 w-6" /></span>
            <div><div className="font-serif text-lg">Практика</div><div className="text-[10px] uppercase tracking-[.24em] opacity-65">управление делами</div></div>
          </div>
          <div className="relative z-10 my-16 max-w-xl">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[.24em] text-[#c6d5cf]">Рабочее пространство юридической команды</p>
            <h1 className="font-serif text-5xl leading-[1.08] tracking-tight md:text-6xl">Каждое дело.<br /><em className="font-normal text-[#c8d5c7]">На своём месте.</em></h1>
            <p className="mt-7 max-w-md text-base leading-7 text-white/70">Клиентские обращения, история решений и сроки — в защищённой системе с понятной ответственностью.</p>
          </div>
          <div className="relative z-10 flex items-center gap-3 border-t border-white/15 pt-5 text-sm text-white/65"><span className="h-2 w-2 rounded-full bg-[#bdd4c5]" />Доступ только для команды</div>
        </section>
        <section className="flex flex-col justify-center p-8 md:p-14">
          <span className="mb-7 grid h-12 w-12 place-items-center rounded-2xl bg-accent text-accent-foreground"><CircleUserRound className="h-6 w-6" /></span>
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-muted-foreground">Вход в систему</p>
          <h2 className="mt-2 font-serif text-3xl text-primary">Добро пожаловать</h2>
          <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">Используйте рабочую учётную запись. Новые аккаунты активируются администратором.</p>
          <div className="mt-8 grid gap-3">
            <Button asChild className="h-12 rounded-xl text-sm" data-testid="link-sign-in"><Link href="/sign-in">Войти в аккаунт</Link></Button>
            <Button asChild variant="outline" className="h-12 rounded-xl text-sm" data-testid="link-sign-up"><Link href="/sign-up">Создать аккаунт</Link></Button>
          </div>
          <p className="mt-8 border-t border-border pt-5 text-xs leading-5 text-muted-foreground">Доступ к материалам дел предоставляется после подтверждения роли и статуса администратора.</p>
        </section>
      </div>
    </main>
  );
}

function LoadingScreen() {
  return <main className="grid min-h-[100dvh] place-items-center bg-background p-6"><div className="w-full max-w-2xl space-y-5 rounded-3xl border bg-card p-8"><div className="h-4 w-32 animate-pulse rounded bg-muted" /><div className="h-10 w-2/3 animate-pulse rounded bg-muted" /><div className="h-24 animate-pulse rounded-2xl bg-muted/70" /><div className="grid grid-cols-3 gap-3"><div className="h-24 animate-pulse rounded-xl bg-muted" /><div className="h-24 animate-pulse rounded-xl bg-muted" /><div className="h-24 animate-pulse rounded-xl bg-muted" /></div></div></main>;
}

function Restricted({ disabled = false }: { disabled?: boolean }) {
  const { signOut } = useClerk();
  return <main className="grid min-h-[100dvh] place-items-center bg-background p-6"><section className="w-full max-w-lg rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
    <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent text-accent-foreground"><UsersRound className="h-7 w-7" /></span>
    <h1 className="mt-6 font-serif text-3xl text-primary">{disabled ? "Доступ приостановлен" : "Ожидает подтверждения"}</h1>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">{disabled ? "Ваша учётная запись отключена администратором. Обратитесь к ответственному за доступ." : "Учётная запись создана. Администратор назначит роль и активирует доступ к делам."}</p>
    <Button variant="outline" className="mt-7" onClick={() => signOut({ redirectUrl: basePath || "/" })} data-testid="button-sign-out-restricted"><LogOut className="mr-2 h-4 w-4" />Выйти</Button>
  </section></main>;
}

function Protected({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  const { isLoaded, isSignedIn } = useAuth();
  const memberQuery = useGetCurrentTeamMember({ query: { queryKey: getGetCurrentTeamMemberQueryKey(), enabled: isLoaded && !!isSignedIn } });
  if (!isLoaded || (isSignedIn && memberQuery.isLoading)) return <LoadingScreen />;
  if (!isSignedIn) return <Redirect to="/" />;
  if (memberQuery.isError) return <main className="grid min-h-[100dvh] place-items-center bg-background p-6"><div className="max-w-md rounded-2xl border bg-card p-7 text-center"><h1 className="font-serif text-2xl text-primary">Не удалось проверить доступ</h1><p className="mt-2 text-sm text-muted-foreground">Проверьте соединение и повторите запрос.</p><Button className="mt-5" onClick={() => memberQuery.refetch()}>Повторить</Button></div></main>;
  const member = memberQuery.data;
  if (!member || member.status === "pending") return <Restricted />;
  if (member.status === "disabled") return <Restricted disabled />;
  if (adminOnly && member.role !== "admin") return <main className="grid min-h-[100dvh] place-items-center bg-background p-6"><div className="rounded-2xl border bg-card p-8 text-center"><h1 className="font-serif text-2xl text-primary">Раздел только для администратора</h1><p className="mt-2 text-sm text-muted-foreground">У вашей роли нет доступа к управлению командой.</p><Button asChild className="mt-5"><Link href="/dashboard">К списку дел</Link></Button></div></main>;
  const access: AccessValue = { member, isAdmin: member.role === "admin", canManageStatus: member.role !== "assistant", canDeleteStages: member.role !== "assistant" };
  return <AccessContext.Provider value={access}><AppShell>{children}</AppShell></AccessContext.Provider>;
}

function AppShell({ children }: { children: ReactNode }) {
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const { member, isAdmin } = useAccess();
  const name = member.displayName || member.email || "Сотрудник";
  return <div className="min-h-[100dvh] bg-background">
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3 md:px-8">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-3 text-primary"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground"><BriefcaseBusiness className="h-5 w-5" /></span><span className="hidden sm:block"><span className="block font-serif text-base leading-5">Практика</span><span className="text-[9px] uppercase tracking-[.2em] text-muted-foreground">юридическая CRM</span></span></Link>
        <nav className="flex items-center gap-1" aria-label="Основная навигация">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/dashboard")}><BriefcaseBusiness className="mr-2 h-4 w-4" /><span className="hidden sm:inline">Дела</span></Button>
          <Button variant="ghost" size="sm" onClick={() => setLocation("/documentation")}><BookOpen className="mr-2 h-4 w-4" /><span className="hidden sm:inline">Справочник</span></Button>
          <Button variant="ghost" size="sm" onClick={() => setLocation("/team")}><UsersRound className="mr-2 h-4 w-4" /><span className="hidden sm:inline">{isAdmin ? "Команда" : "Профиль"}</span></Button>
        </nav>
        <div className="flex items-center gap-2">
          <div className="hidden text-right sm:block"><p className="max-w-40 truncate text-xs font-semibold text-primary">{name}</p><p className="text-[10px] text-muted-foreground">{member.role === "admin" ? "Администратор" : member.role === "lawyer" ? "Юрист" : "Ассистент"}</p></div>
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" title="Выйти из системы" aria-label="Выйти из системы" onClick={() => signOut({ redirectUrl: basePath || "/" })} data-testid="button-sign-out"><LogOut className="h-4 w-4" /></Button>
        </div>
      </div>
    </header>
    {children}
  </div>;
}

function SignInPage() {
  const demoLink = useCreateDemoSignInLink();
  const requestDemoLink = () => demoLink.mutate(undefined, {
    onSuccess: (result) => {
      window.location.assign(result.url);
    },
  });
  return <main className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10"><div className="w-full max-w-5xl overflow-hidden rounded-[2rem] border bg-card shadow-xl md:grid md:grid-cols-[.8fr_1.2fr]"><section className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground md:flex"><BriefcaseBusiness className="h-8 w-8" /><div><p className="text-xs uppercase tracking-[.2em] text-white/65">Практика · защищённый доступ</p><h1 className="mt-4 font-serif text-4xl leading-tight">Дела команды<br /><em>под контролем.</em></h1></div><p className="text-sm text-white/60">Клиентские данные доступны только активным участникам.</p></section><div className="flex flex-col items-center gap-5 p-5 sm:p-10"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />{import.meta.env.DEV && <aside className="w-full max-w-[440px] rounded-xl border border-border bg-muted/40 p-4" data-testid="panel-demo-sign-in"><p className="text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">Для разработки</p><p className="mt-2 text-sm text-foreground">Демо-вход: <span className="font-medium">demo.lawyer@example.com</span></p><Button type="button" variant="outline" className="mt-3 w-full" onClick={requestDemoLink} disabled={demoLink.isPending} data-testid="button-demo-sign-in">{demoLink.isPending ? "Готовим ссылку…" : "Войти по одноразовой ссылке"}</Button>{demoLink.isError && <p className="mt-2 text-sm text-destructive" role="alert">Не удалось создать ссылку. Попробуйте ещё раз.</p>}</aside>}</div></div></main>;
}

function SignUpPage() {
  return <main className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10"><div className="w-full max-w-5xl overflow-hidden rounded-[2rem] border bg-card shadow-xl md:grid md:grid-cols-[.8fr_1.2fr]"><section className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground md:flex"><BriefcaseBusiness className="h-8 w-8" /><div><p className="text-xs uppercase tracking-[.2em] text-white/65">Практика · доступ команде</p><h1 className="mt-4 font-serif text-4xl leading-tight">Сначала заявка.<br /><em>Затем доступ.</em></h1></div><p className="text-sm text-white/60">Первый аккаунт становится администратором. Остальные подтверждаются руководителем.</p></section><div className="flex justify-center p-5 sm:p-10"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div></div></main>;
}

function Router() {
  return <Switch>
    <Route path="/" component={Home} />
    <Route path="/sign-in/*?" component={SignInPage} />
    <Route path="/sign-up/*?" component={SignUpPage} />
    <Route path="/dashboard">{() => <Protected><Dashboard /></Protected>}</Route>
    <Route path="/clients/:id">{() => <Protected><ClientDetailPage /></Protected>}</Route>
    <Route path="/documentation">{() => <Protected><DocumentationPage /></Protected>}</Route>
    <Route path="/team">{() => <Protected><TeamPage /></Protected>}</Route>
    <Route component={() => <main className="grid min-h-[100dvh] place-items-center bg-background p-6"><div className="text-center"><p className="font-serif text-6xl text-primary">404</p><h1 className="mt-3 font-serif text-2xl text-primary">Страница не найдена</h1><p className="mt-2 text-sm text-muted-foreground">Проверьте адрес или вернитесь к делам.</p><Button className="mt-6" asChild><Link href="/">На главную</Link></Button></div></main>} />
  </Switch>;
}

function ClerkRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={appLocalization} routerPush={(to) => setLocation(stripBase(to))} routerReplace={(to) => setLocation(stripBase(to), { replace: true })}>
    <QueryClientProvider client={queryClient}><ClerkCacheInvalidator /><Router /><Toaster position="top-right" richColors /></QueryClientProvider>
  </ClerkProvider>;
}

function App() {
  if (!clerkPubKey) throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
  return <WouterRouter base={basePath}><ClerkRoutes /></WouterRouter>;
}

export default App;
