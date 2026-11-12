import { useEffect, useState } from "react";
import { QueuePage } from "./features/queue/QueuePage.js";
import { InvoicesPage } from "./features/invoices/InvoicesPage.js";
import { ActivityPage } from "./features/activity/ActivityPage.js";
import { StatusPanel } from "./features/settings/StatusPanel.js";
import { CasePage } from "./features/case/CasePage.js";
import { api } from "./api.js";
import { Icon } from "./components/Icon.js";
export function App() {
  const [route, setRoute] = useState(location.hash.slice(1) || "queue"),
    [dirty, setDirty] = useState(false),
    [menuOpen, setMenuOpen] = useState(false),
    [mode, setMode] = useState("Loading environment…");
  useEffect(() => {
    const handler = () => {
      if (
        dirty &&
        !window.confirm(
          "Leave this case? Your unsaved reply changes will be lost.",
        )
      ) {
        history.replaceState(null, "", `#${route}`);
        return;
      }
      setDirty(false);
      setRoute(location.hash.slice(1) || "queue");
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, [dirty, route]);
  useEffect(() => {
    api
      .getStatus()
      .then((s) =>
        setMode(s.mode === "fixture" ? "Demo data" : "PayPal sandbox"),
      )
      .catch(() => setMode("Environment unavailable"));
  }, []);
  const activeRoute = route.startsWith("case/") ? "queue" : route;
  const pageTitle = route.startsWith("case/")
    ? "Invoice case"
    : ({
        queue: "Needs attention",
        invoices: "Invoices",
        activity: "Activity",
        status: "Desk status",
      }[route] ?? "Needs attention");
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to desk
      </a>
      <aside className="sidebar" data-menu-open={menuOpen}>
        <a className="brand" href="#queue" aria-label="Resolution Desk">
          <span className="brand-symbol">R</span>
          <span className="brand-name">
            Resolution
            <br />
            <strong>Desk</strong>
          </span>
        </a>
        <button
          className="mobile-menu"
          aria-expanded={menuOpen}
          aria-controls="main-navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          Menu
        </button>
        <p className="sidebar-label">Workspace</p>
        <nav id="main-navigation" aria-label="Main navigation">
          {[
            ["queue", "Needs attention", "inbox"],
            ["invoices", "Invoices", "receipt"],
            ["activity", "Activity", "activity"],
            ["status", "Desk status", "settings"],
          ].map(([path, label, icon]) => (
            <a
              onClick={() => setMenuOpen(false)}
              key={path}
              href={`#${path}`}
              className={activeRoute === path ? "active" : ""}
              aria-current={activeRoute === path ? "page" : undefined}
              aria-label={label}
              title={label}
            >
              <Icon name={icon} />
              <span className="nav-label">{label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-note">
          <div className="local-workspace">
            <Icon name="lock" />
            <span>Private workspace</span>
          </div>
          <p>
            Saved on this device.
            <br />
            Decisions stay with you.
          </p>
        </div>
      </aside>
      <main id="main-content" tabIndex={-1}>
        <header className="environment-bar">
          <div className="workspace-context">
            <span>Merchant workspace</span>
            <span aria-hidden="true">/</span>
            <strong>{pageTitle}</strong>
          </div>
          <div className="environment-meta">
            <span className="environment-badge">
              <span className="status-dot" />
              {mode}
            </span>
            <span className="read-only-note">
              <Icon name="shield" />
              Read-only invoice records
            </span>
          </div>
        </header>
        {route.startsWith("case/") ? (
          <CasePage
            key={route}
            caseId={route.slice(5)}
            onDirtyChange={setDirty}
          />
        ) : route === "invoices" ? (
          <InvoicesPage />
        ) : route === "activity" ? (
          <ActivityPage />
        ) : route === "status" ? (
          <StatusPanel />
        ) : (
          <QueuePage />
        )}
      </main>
    </div>
  );
}
