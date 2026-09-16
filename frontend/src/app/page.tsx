import { ImpliedVolatility } from "@/components/implied-volatility";
import { PricingDashboard } from "@/components/pricing-dashboard";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#main">Skip to workspace</a>
      <header className="site-header">
        <div className="header-inner">
          <a href="#main" className="brand" aria-label="OptionLab home">Option<span>Lab</span></a>
          <nav aria-label="Workspace navigation">
            <a href="#pricing" className="nav-active">Pricer</a>
            <a href="#analytics">Analytics</a>
            <a href="#model-notes">Models</a>
            <a href="#about">About</a>
          </nav>
          <div className="header-actions">
            <span className="header-label">EUROPEAN OPTIONS</span>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="main" className="page-shell">
        <div className="page-intro">
          <div>
            <p className="eyebrow">OPTION VALUATION & RISK</p>
            <h1>Options Analytics</h1>
            <p className="intro-description">Theoretical value. Risk sensitivities. Implied volatility.</p>
          </div>
          <dl className="workspace-metadata">
            <div><dt>Pricing model</dt><dd>Black–Scholes</dd></div>
            <div><dt>Exercise style</dt><dd>European</dd></div>
          </dl>
        </div>
        <PricingDashboard />
        <ImpliedVolatility />
        <section className="model-notes" id="model-notes" aria-labelledby="model-heading">
          <h2 id="model-heading">Model assumptions</h2>
          <p>European options on a non-dividend-paying stock. Inputs assume constant annualized volatility and a continuously compounded risk-free rate. All prices and sensitivities are per share.</p>
        </section>
      </main>
      <footer className="site-footer" id="about">
        <span className="footer-brand">OptionLab</span>
        <p>A focused workspace for European option analysis.</p>
        <span className="footer-label">VALUATION / SENSITIVITY / VOLATILITY</span>
      </footer>
    </>
  );
}
