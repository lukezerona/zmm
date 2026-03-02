"use client";

import { useState, useEffect } from "react";

interface ForgotPasswordProps {
  onBack: () => void;
}

export default function ForgotPassword({ onBack }: ForgotPasswordProps) {
  const [email, setEmail] = useState("");
  const [showContent, setShowContent] = useState(false);
  const [isReversing, setIsReversing] = useState(false);

  useEffect(() => {
    const contentTimer = setTimeout(() => setShowContent(true), 200);
    return () => clearTimeout(contentTimer);
  }, []);

  const isDisabled = email.length === 0;

  const handleBack = () => {
    setIsReversing(true);
    setTimeout(() => setShowContent(false), 50);
    setTimeout(() => onBack(), 400);
  };

  return (
    <div>
      <div className="relative mb-6 flex items-center">
        <button
          type="button"
          className={`text-primary hover:text-primary/80 transition-all duration-700 ease-out cursor-pointer ${
            showContent && !isReversing ? "opacity-100 translate-y-0" : "opacity-0"
          }`}
          style={{ 
            transitionDelay: showContent && !isReversing ? "0ms" : "0ms",
            width: "28px",
            height: "28px" // Match title height
          }}
          onClick={handleBack}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <h2
          className={`text-xl font-semibold text-white tracking-tight text-center transition-all duration-700 ease-out flex-1 ${
            showContent && !isReversing ? "opacity-100 translate-y-0" : "opacity-0"
          }`}
          style={{ transitionDelay: showContent && !isReversing ? "0ms" : "0ms" }}
        >
          Forgot your password?
        </h2>
      </div>
      <div
        className={`transition-all duration-700 ease-out ${
          showContent && !isReversing ? "opacity-100 translate-y-0" : "opacity-0"
        }`}
        style={{ transitionDelay: showContent && !isReversing ? "150ms" : "0ms" }}
      >
        <input
          type="email"
          name="email"
          autoComplete="email"
          placeholder="Email"
          className="w-full rounded-lg border border-primary/40 bg-background px-3 py-2 text-foreground placeholder:text-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary mb-4"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div
        className={`transition-all duration-700 ease-out ${
          showContent && !isReversing ? "opacity-100 translate-y-0" : "opacity-0"
        }`}
        style={{ transitionDelay: showContent && !isReversing ? "300ms" : "0ms" }}
      >
        <button
          type="button"
          disabled={isDisabled}
          className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background transition-colors duration-500 ease-out ${
            isDisabled
              ? "bg-primary/40 text-primary-foreground/70 cursor-not-allowed"
              : "bg-primary text-primary-foreground hover:opacity-90 focus:ring-primary cursor-pointer"
          }`}
        >
          Send Email
        </button>
      </div>
    </div>
  );
}
