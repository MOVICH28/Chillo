"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/useAuth";

interface FollowButtonProps {
  targetUserId: string;
  targetUsername: string;
}

export default function FollowButton({ targetUserId, targetUsername }: FollowButtonProps) {
  const { user, getToken } = useAuth();
  const [isFollowing, setIsFollowing] = useState(false);
  const [isMutual, setIsMutual] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const token = getToken();
    fetch(`/api/user/follow?targetUserId=${targetUserId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(d => {
        setIsFollowing(d.isFollowing);
        setIsMutual(d.isMutual);
        setFollowersCount(d.followersCount);
        setFollowingCount(d.followingCount);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [targetUserId, getToken]);

  async function toggle() {
    if (!user) return;
    setBusy(true);
    const token = getToken();
    const method = isFollowing ? "DELETE" : "POST";
    try {
      await fetch("/api/user/follow", {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ targetUserId }),
      });
      setIsFollowing(!isFollowing);
      setFollowersCount(c => isFollowing ? c - 1 : c + 1);
      if (isFollowing) setIsMutual(false);
    } catch { /* ignore */ } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  return (
    <div className="flex flex-col items-end gap-2">
      {/* Follower/following counts */}
      <div className="flex items-center gap-4 text-xs">
        <span className="text-muted">
          <span className="text-white font-semibold">{followersCount}</span> followers
        </span>
        <span className="text-muted">
          <span className="text-white font-semibold">{followingCount}</span> following
        </span>
      </div>

      {/* Follow/Unfollow button — only show if viewer is not the profile owner */}
      {user && user.username !== targetUsername && (
        <div className="flex items-center gap-2">
          {isMutual && (
            <span className="text-[10px] text-[#22c55e] font-medium">Follows you back</span>
          )}
          <button
            onClick={toggle}
            disabled={busy}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
              isFollowing
                ? "bg-white/10 text-white/60 hover:bg-red-500/20 hover:text-red-400 border border-white/10"
                : "bg-[#22c55e] text-black hover:bg-[#16a34a]"
            }`}
          >
            {busy ? "…" : isFollowing ? "Following" : "Follow"}
          </button>
        </div>
      )}
    </div>
  );
}
