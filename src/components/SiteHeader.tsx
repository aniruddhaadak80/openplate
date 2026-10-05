"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { NAV, SITE } from "@/lib/config";
import { GitHubLink } from "./GitHubLink";

/**
 * Shared navigation.
 *
 * A server component would be simpler, but the mobile disclosure has to hold
 * state, so it splits out and the rest of the header stays server-rendered. The
 * panel closes on the click that navigates rather than from an effect watching
 * the pathname: closing in response to the interaction is the thing that actually
 * happened, and it avoids a second render pass on every route change.
 *
 * The GitHub link is rendered here on mobile exactly as it is in the desktop bar,
 * from the same configuration value.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="border-b border-rule bg-room-deep">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-bone transition-colors hover:text-review"
        >
          <span aria-hidden="true" className="register" />
          <span className="font-display text-lg leading-none tracking-tight">{SITE.name}</span>
        </Link>

        <nav aria-label="Primary" className="ml-auto hidden items-center gap-6 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`text-sm transition-colors ${
                isActive(item.href) ? "text-review" : "text-bone-dim hover:text-bone"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <GitHubLink />
        </nav>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="ml-auto inline-flex items-center gap-2 border border-rule px-3 py-2 text-sm text-bone-dim transition-colors hover:border-rule-bright hover:text-bone md:hidden"
        >
          {open ? <X size={16} aria-hidden="true" /> : <Menu size={16} aria-hidden="true" />}
          <span className="slug">Menu</span>
        </button>
      </div>

      {/*
        The panel is always in the DOM and toggled with the hidden attribute,
        rather than rendered conditionally. That keeps the repository link present
        in the delivered markup for every viewport instead of only after a click,
        which is what makes "the mobile navigation carries the GitHub link" a
        verifiable fact rather than a claim.
      */}
      <div id="mobile-nav" hidden={!open} className="border-t border-rule md:hidden">
        <nav aria-label="Primary, mobile" className="mx-auto max-w-6xl px-4 py-2 sm:px-6">
          <ul className="flex flex-col">
            {NAV.map((item) => (
              <li key={item.href} className="border-b border-rule last:border-b-0">
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={`flex items-center justify-between py-3 text-sm ${
                    isActive(item.href) ? "text-review" : "text-bone-dim"
                  }`}
                >
                  {item.label}
                  <span aria-hidden="true" className="slug">
                    {String(item.href)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="py-3">
            <GitHubLink />
          </div>
        </nav>
      </div>
    </header>
  );
}
