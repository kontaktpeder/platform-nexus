import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, Blocks, Layers, Palette, Sparkles } from "lucide-react";
import { isPasswordRecoveryPending } from "@/lib/auth-recovery-early";
import { hasRecoveryLinkInUrl, redirectRecoveryLinkToUpdatePassword } from "@/lib/auth-recovery";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (hasRecoveryLinkInUrl()) {
      redirectRecoveryLinkToUpdatePassword();
      return;
    }
    if (isPasswordRecoveryPending()) {
      navigate({ to: "/auth/update-password", replace: true });
      return;
    }
    if (loading || !user) return;
    navigate({ to: "/mission", replace: true });
  }, [loading, user, navigate]);


  return (
    <main className="min-h-screen bg-background">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 opacity-70">
          <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full blur-3xl gradient-primary opacity-30" />
        </div>

        <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl gradient-primary text-primary-foreground shadow-glow">
              <Layers className="h-5 w-5" />
            </div>
            <span className="font-heading text-lg font-semibold tracking-tight">Platform Core</span>
          </div>
          <Link to="/auth"><Button variant="ghost">Logg inn</Button></Link>
        </header>

        <section className="mx-auto max-w-5xl px-6 py-16 text-center md:py-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> Ett operativsystem. Alle moduler.
          </span>
          <h1 className="mt-6 font-heading text-4xl font-bold tracking-tight md:text-6xl">
            Inngangen til hele<br />
            <span className="bg-clip-text text-transparent gradient-primary">Core-økosystemet</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground md:text-lg">
            Platform Core eier brukere, organisasjoner, arbeidsflater, moduler og design.
            Modulene eier logikken. Du velger organisasjon, går inn i en arbeidsflate — og alt henger sammen.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/auth">
              <Button size="lg" className="gap-2">
                Kom i gang <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>

        <section className="mx-auto grid max-w-5xl gap-4 px-6 pb-20 md:grid-cols-3">
          {[
            { icon: Layers, title: "Organisasjoner + arbeidsflater", body: "Én organisasjon kan ha flere arbeidsflater — drift, produksjon, nettside, catering." },
            { icon: Blocks, title: "Modulregister", body: "Finance, Work, Booking, Content — slå på det du trenger, la resten hvile." },
            { icon: Palette, title: "Theme engine", body: "Hver arbeidsflate har eget uttrykk. Modulene arver — uten å endre kode." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="surface-card p-6 text-left transition-shadow hover:shadow-lift">
              <div className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-primary-soft text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-heading text-lg font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
