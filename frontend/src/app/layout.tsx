import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OptionLab — Options Analytics",
  description: "A focused workspace for European option valuation, risk sensitivities, and implied volatility using Black–Scholes.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
