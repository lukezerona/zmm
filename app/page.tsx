"use client";

import { useState, useEffect } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showCardExpanded, setShowCardExpanded] = useState(false);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    const expandTimer = setTimeout(() => setShowCardExpanded(true), 1000);
    const contentTimer = setTimeout(() => setShowContent(true), 1200);

    return () => {
      clearTimeout(expandTimer);
      clearTimeout(contentTimer);
    };
  }, []);

  const isDisabled = username.length === 0 || password.length === 0;

  return (
    <main
      className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden"
      style={{
        backgroundImage: "url(/loginBackground.webp)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div
        className={`w-full max-w-sm rounded-xl border border-primary/30 bg-background/95 backdrop-blur px-4 pt-4 pb-6 shadow-lg overflow-hidden transition-all duration-1000 ease-out ${
          showCardExpanded ? "max-h-[600px]" : "max-h-40"
        }`}
      >
        <div className="flex justify-center mb-6">
          <img
            src="/ZMM_Logo.svg"
            alt="ZMM Logo"
            className="h-32 w-auto max-w-full"
          />
        </div>
        <div>
          <h1
            className={`text-4xl font-bold text-white tracking-tight text-center mb-6 transition-all duration-700 ease-out ${
              showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            }`}
            style={{ transitionDelay: showContent ? "0ms" : "0ms" }}
          >
            Welcome Back!
          </h1>
          <form className="flex flex-col gap-4" autoComplete="on">
            <div
              className={`transition-all duration-700 ease-out ${
                showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
              }`}
              style={{ transitionDelay: showContent ? "150ms" : "0ms" }}
            >
              <input
                id="username"
                type="text"
                name="username"
                autoComplete="username"
                placeholder="Username"
                className="w-full rounded-lg border border-primary/40 bg-background px-3 py-2 text-foreground placeholder:text-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div
              className={`transition-all duration-700 ease-out ${
                showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
              }`}
              style={{ transitionDelay: showContent ? "300ms" : "0ms" }}
            >
              <input
                id="password"
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder="Password"
                className="w-full rounded-lg border border-primary/40 bg-background px-3 py-2 text-foreground placeholder:text-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div
              className={`transition-all duration-700 ease-out ${
                showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
              }`}
              style={{ transitionDelay: showContent ? "450ms" : "0ms" }}
            >
              <button
                type="submit"
                disabled={isDisabled}
                className={`mt-2 w-full rounded-lg px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background transition-colors duration-500 ease-out ${
                  isDisabled
                    ? "bg-primary/40 text-primary-foreground/70 cursor-not-allowed"
                    : "bg-primary text-primary-foreground hover:opacity-90 focus:ring-primary cursor-pointer"
                }`}
              >
                Log in
              </button>
            </div>
            <button
              type="button"
              className={`mt-1 w-full text-center text-xs text-foreground/60 hover:text-foreground/80 underline-offset-2 hover:underline transition-all duration-700 ease-out cursor-pointer ${
                showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
              }`}
              style={{ transitionDelay: showContent ? "600ms" : "0ms" }}
            >
              Forgot your password?
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
