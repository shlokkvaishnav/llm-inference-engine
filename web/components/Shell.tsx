"use client";

import { Github, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export const REPO = "https://github.com/shlokkvaishnav/llm-inference-engine";

const NAV = [
  { href: "/lab/", label: "Scheduler lab" },
  { href: "/playground/", label: "Playground" },
  { href: "/benchmarks/", label: "Benchmarks", optional: true },
  { href: "/docs/", label: "Docs" },
];

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the theme is known only after mount
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <button className="icon-btn" type="button" onClick={() => setTheme(dark ? "light" : "dark")} aria-label={dark ? "Use the light theme" : "Use the dark theme"}>
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

// A 3 x 3 block pool with some blocks in use: the paged KV-cache as a logo.
function BrandMark() {
  const on = [0, 1, 4, 5];
  const on2 = [2, 6];
  return (
    <span className="brand-mark" aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} className={on.includes(i) ? "on" : on2.includes(i) ? "on2" : ""} />
      ))}
    </span>
  );
}

export function SiteHeader() {
  const path = usePathname();
  return (
    <header className="site-header">
      <nav className="wrap" aria-label="Main">
        <Link href="/" className="brand">
          <BrandMark />
          mini-vLLM
        </Link>
        <div className="nav-links">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={n.optional ? "opt" : ""} aria-current={path === n.href ? "page" : undefined}>
              {n.label}
            </Link>
          ))}
        </div>
        <div className="nav-tools">
          <a className="icon-btn nav-github" href={REPO} aria-label="Source code on GitHub">
            <Github size={17} />
          </a>
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap row">
        <span>mini-vLLM by Shlok Vaishnav. MIT licence.</span>
        <span>
          <a href={REPO}>Source code</a> · <a href="https://shlokkvaishnav.github.io/">Portfolio</a>
        </span>
      </div>
    </footer>
  );
}
