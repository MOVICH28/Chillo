"use client";

interface AvatarProps {
  username: string;
  avatarUrl?: string | null;
  size?: number; // px
  className?: string;
}

export default function Avatar({ username, avatarUrl, size = 32, className = "" }: AvatarProps) {
  const style = { width: size, height: size, minWidth: size };
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={username}
        style={style}
        className={`rounded-full object-cover border border-white/10 ${className}`}
      />
    );
  }
  const fontSize = Math.max(10, Math.floor(size * 0.38));
  return (
    <div
      style={{ ...style, fontSize }}
      className={`rounded-full bg-brand/20 border border-brand/30 flex items-center justify-center text-brand font-bold select-none ${className}`}
    >
      {username.slice(0, 1).toUpperCase()}
    </div>
  );
}
