"use client";

import { useEffect, useState } from "react";

type Status = { availableStock: number; purchasedCount: number; hold: { expiresAt: string } | null; queue: { position: number | null } };

export default function Home() {
  const [userId, setUserId] = useState("");
  const [sneakerId, setSneakerId] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState("Enter IDs from the seed output to join the drop.");
  const [remaining, setRemaining] = useState<number | null>(null);

  async function refresh() {
    if (!userId || !sneakerId) return;
    const response = await fetch(`/api/drop/status?userId=${userId}&sneakerId=${sneakerId}`, { cache: "no-store" });
    if (response.ok) setStatus(await response.json());
  }

  async function buy() {
    const response = await fetch("/api/drop/buy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, sneakerId }) });
    const body = await response.json();
    setMessage(response.ok ? body.kind === "HOLD" ? "Your pair is held for five minutes." : "You are in the waiting queue." : body.error);
    await refresh();
  }

  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 3000); return () => clearInterval(timer); }, [userId, sneakerId]);
  useEffect(() => { if (!status?.hold) { setRemaining(null); return; } const tick = () => setRemaining(Math.max(0, Math.ceil((new Date(status.hold!.expiresAt).getTime() - Date.now()) / 1000))); tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer); }, [status?.hold]);

  const formatted = remaining === null ? "--:--" : `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  return (
    <main className="drop-shell">
      <section className="drop-panel">
        <p className="eyebrow">SNEAK / 001</p>
        <h1>Afterglow<br /><span>01</span></h1>
        <p className="intro">A limited release. Twenty pairs. One clean window to claim yours.</p>
        <div className="id-grid"><label>User ID<input value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="24-character id" /></label><label>Sneaker ID<input value={sneakerId} onChange={(event) => setSneakerId(event.target.value)} placeholder="24-character id" /></label></div>
        <div className="stats"><div><span>Pairs remaining</span><strong>{status?.availableStock ?? "--"}</strong></div><div><span>Purchased</span><strong>{status ? `${status.purchasedCount} / 2` : "-- / 2"}</strong></div></div>
        <button className="buy-button" onClick={buy} disabled={!userId || !sneakerId}>BUY A PAIR <span>↗</span></button>
        <div className="claim-state"><span className="state-label">{status?.hold ? "Your hold" : status?.queue.position ? "Waiting queue" : "Drop status"}</span><strong>{status?.hold ? `${formatted} remaining` : status?.queue.position ? `Position #${status.queue.position}` : "Ready when you are"}</strong><p>{message}</p></div>
      </section>
    </main>
  );
}
