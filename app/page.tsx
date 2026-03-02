"use client";

import { useState, useEffect } from "react";
import ForgotPassword from "./ForgotPassword";
import { registerUser, loginUser } from "../lib/auth";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showCardExpanded, setShowCardExpanded] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [forgotClicked, setForgotClicked] = useState(false);
  const [isReversing, setIsReversing] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const expandTimer = setTimeout(() => setShowCardExpanded(true), 1000);
    const contentTimer = setTimeout(() => setShowContent(true), 1200);

    return () => {
      clearTimeout(expandTimer);
      clearTimeout(contentTimer);
    };
  }, []);

  const handleForgotClick = () => {
    setForgotClicked(true);
    setIsReversing(true);
    // Reverse the animations (2x quicker)
    setTimeout(() => setShowContent(false), 50);
    setTimeout(() => setShowCardExpanded(false), 400);
    // Show ForgotPassword component after reverse animation
    setTimeout(() => {
      setShowForgotPassword(true);
      setShowCardExpanded(true); // Re-expand for forgot password
    }, 500);
  };

  const handleBackToLogin = () => {
    setShowForgotPassword(false);
    setForgotClicked(false);
    setIsReversing(false);
    setTimeout(() => {
      setShowContent(true);
    }, 100);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setSuccess("");

    try {
      // First try to login
      const loginResult = await loginUser(username, password);
      
      if (loginResult.success) {
        setSuccess(`Welcome back, ${loginResult.user?.username}!`);
        // TODO: Handle successful login (e.g., redirect to dashboard)
        return;
      }

      // If login fails, try to register
      const registerResult = await registerUser(username, password);
      
      if (registerResult.success) {
        setSuccess(`Account created successfully for ${username}!`);
        // TODO: Handle successful registration (e.g., redirect to dashboard)
      } else {
        setError(registerResult.error || 'Authentication failed');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const isDisabled = username.length === 0 || password.length === 0 || isLoading;

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
        className={`relative w-full max-w-sm rounded-xl border border-primary/30 bg-background/95 backdrop-blur px-4 pt-4 pb-4 shadow-lg overflow-hidden transition-all duration-1000 ease-out ${
          showCardExpanded ? "max-h-[600px]" : "max-h-40"
        }`}
      >
        <div
          className="flex justify-center transition-all duration-1000 ease-out mb-6"
        >
          <img
            src="/ZMM_Logo.svg"
            alt="ZMM Logo"
            className="h-32 w-auto max-w-full"
          />
        </div>

        {/* Login view: Welcome Back + form */}
        {!showForgotPassword && (
          <div className={`transition-all duration-1000 ease-out ${
            isReversing ? "opacity-0" : "opacity-100"
          }`}>
            <h1
              className={`text-4xl font-bold text-white tracking-tight text-center mb-6 transition-all duration-700 ease-out ${
                showContent && !isReversing ? "opacity-100 translate-y-0" : "opacity-0"
              }`}
              style={{ transitionDelay: showContent && !isReversing ? "0ms" : "0ms" }}
            >
              Welcome Back!
            </h1>
            <form className="flex flex-col gap-4" autoComplete="on" onSubmit={handleSubmit}>
              <div
                className={`transition-all duration-700 ease-out ${
                  showContent && !isReversing ? "opacity-100 translate-y-0" : "opacity-0"
                }`}
                style={{ transitionDelay: showContent && !isReversing ? "150ms" : "0ms" }}
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
                  showContent && !isReversing ? "opacity-100 translate-y-0" : "opacity-0"
                }`}
                style={{ transitionDelay: showContent && !isReversing ? "300ms" : "0ms" }}
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
                  showContent && !isReversing ? "opacity-100 translate-y-0" : "opacity-0"
                }`}
                style={{ transitionDelay: showContent && !isReversing ? "450ms" : "0ms" }}
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
                  {isLoading ? 'Processing...' : 'Log in'}
                </button>
              </div>
            </form>
          
          {/* Error and Success Messages */}
          {error && (
            <div className={`mt-4 p-3 rounded-lg text-sm text-center transition-all duration-700 ease-out ${
              showContent && !isReversing ? "opacity-100 translate-y-0" : "opacity-0"
            }`} style={{ transitionDelay: showContent && !isReversing ? "600ms" : "0ms" }}>
              <p className="text-red-400">{error}</p>
            </div>
          )}
          
          {success && (
            <div className={`mt-4 p-3 rounded-lg text-sm text-center transition-all duration-700 ease-out ${
              showContent && !isReversing ? "opacity-100 translate-y-0" : "opacity-0"
            }`} style={{ transitionDelay: showContent && !isReversing ? "600ms" : "0ms" }}>
              <p className="text-green-400">{success}</p>
            </div>
          )}
        </div>
        )}

        {/* Forgot your password button - only show when not showing forgot password view */}
        {!showForgotPassword && (
          <div className="flex justify-center mt-4">
            <button
              type="button"
              className={`text-center text-xs text-foreground/60 hover:text-white underline-offset-2 hover:underline cursor-pointer transition-all duration-700 ease-out hover:duration-50 ${
                showContent && !isReversing ? "opacity-100 translate-y-0" : "opacity-0"
              } ${forgotClicked ? "pointer-events-none cursor-default" : ""}`}
              style={{ transitionDelay: showContent && !isReversing ? "600ms" : "0ms" }}
              onClick={handleForgotClick}
            >
              Forgot your password?
            </button>
          </div>
        )}

        {/* Forgot Password component */}
        {showForgotPassword && (
          <div className="transition-all duration-1000 ease-out opacity-100">
            <ForgotPassword onBack={handleBackToLogin} />
          </div>
        )}
      </div>
    </main>
  );
}
