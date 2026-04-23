"use client";

import { useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { useWinNotifications, WinToast } from "@/lib/useWinNotifications";

export default function WinToastBanner() {
  const { user } = useAuth();
  const [toasts, setToasts] = useState<WinToast[]>([]);

  const handleWin = (toast: WinToast) => {
    setToasts(prev => [...prev, toast]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== toast.id));
    }, 5000);
  };

  useWinNotifications(user ? `dora:${user.id}` : null, handleWin);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="px-5 py-3 rounded-xl text-sm font-semibold text-white shadow-lg animate-fade-in"
          style={{
            background: "linear-gradient(135deg, #16a34a, #15803d)",
            border: "1px solid #22c55e55",
            boxShadow: "0 0 24px #22c55e44",
            maxWidth: "90vw",
          }}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
