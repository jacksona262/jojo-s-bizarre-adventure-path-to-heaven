import React from "react";
import { Link } from "react-router-dom";
import "@/components/game/game.css";

// Account pages (log in, sign up, password recovery) in the game's own look: the storm-dark
// night, gold Cinzel lettering and a glass panel. Scrolls on small screens.
export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="pth-auth fixed inset-0 overflow-y-auto">
      <div className="pth-auth-bg" />
      <div className="relative min-h-full flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <Link to="/" className="pth-auth-brand">
            <span className="pth-auth-top">JOJO&apos;S BIZARRE ADVENTURE</span>
            <span className="pth-auth-main">PATH TO HEAVEN</span>
          </Link>
          <div className="text-center mb-7 mt-6">
            <div className="pth-auth-icon"><Icon className="w-6 h-6" aria-hidden="true" /></div>
            <h1 className="pth-auth-title">{title}</h1>
            {subtitle && <p className="pth-auth-sub">{subtitle}</p>}
          </div>
          <div className="pth-auth-card">{children}</div>
          {footer && <p className="text-center text-sm mt-6 pth-auth-foot">{footer}</p>}
          <p className="text-center mt-4"><Link to="/" className="pth-auth-back">‹ Back to the game</Link></p>
        </div>
      </div>
    </div>
  );
}
