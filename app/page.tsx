"use client";

import { useEffect, useRef, useState } from "react";

type Sneaker = {
  id: string;
  name: string;
  available: boolean;
  soldOut: boolean;
  activeHolds: number;
  waitingCount: number;
  userHold: { expiresAt: string } | null;
  userQueue: { position: number } | null;
};

type Status = { availableStock: number; purchasedCount: number; hold: { id: string; expiresAt: string } | null; queue: { position: number | null } };

export default function Home() {
  const [userId, setUserId] = useState("");
  const [sneakers, setSneakers] = useState<Sneaker[]>([]);
  const [sneakerId, setSneakerId] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState("Choose a pair to see its live status.");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [loadingPairs, setLoadingPairs] = useState(true);
  const [buying, setBuying] = useState(false);
  // True between the "INITIATED" response and the async webhook confirming the purchase.
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  // Ref mirrors paymentProcessing so refreshStatus closures always see the latest value.
  const paymentProcessingRef = useRef(false);
  // Snapshot of purchasedCount at the moment PAY NOW is clicked, so we can distinguish
  // a successful payment from a hold that simply expired while we were waiting.
  const prevPurchasedRef = useRef<number | null>(null);
  // Tracks the last known queue position so we can detect when the server removes
  // the user from the queue after their purchase limit is reached.
  // undefined = position not yet observed for the current (userId, sneakerId) context.
  const prevQueuePositionRef = useRef<number | null | undefined>(undefined);

  function setPaymentProcessingState(value: boolean) {
    paymentProcessingRef.current = value;
    setPaymentProcessing(value);
  }

  const selectedSneaker = sneakers.find((sneaker) => sneaker.id === sneakerId) ?? null;
  const availableCount = sneakers.filter((sneaker) => sneaker.available).length;

  async function refreshPairs() {
    setLoadingPairs(true);
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    const response = await fetch(`/api/drop/sneakers${query}`, { cache: "no-store" });
    if (response.ok) {
      const pairs = await response.json() as Sneaker[];
      setSneakers(pairs);
      setSneakerId((current) => pairs.some((pair) => pair.id === current) ? current : pairs.find((pair) => pair.available)?.id ?? pairs[0]?.id ?? "");
    }
    setLoadingPairs(false);
  }

  async function refreshStatus() {
    if (!userId || !sneakerId) return;
    const response = await fetch(`/api/drop/status?userId=${encodeURIComponent(userId)}&sneakerId=${encodeURIComponent(sneakerId)}`, { cache: "no-store" });
    if (!response.ok) return;
    const newStatus = await response.json() as Status;
    setStatus(newStatus);
    // Detect when the server has removed the user from the queue because their purchase
    // limit was reached (via payment on another pair or a different hold).
    if (
      prevQueuePositionRef.current !== undefined &&
      prevQueuePositionRef.current !== null &&
      newStatus.queue.position === null &&
      !newStatus.hold &&
      !paymentProcessingRef.current &&
      newStatus.purchasedCount >= 2
    ) {
      setMessage("Purchase limit reached. You have been removed from the waiting queue.");
    }
    prevQueuePositionRef.current = newStatus.queue.position;
    // Detect when the async webhook has landed: the active hold disappears.
    // Runs in an async function (not an effect body) so setState calls are fine here.
    if (paymentProcessingRef.current && !newStatus.hold) {
      const confirmed = prevPurchasedRef.current !== null && newStatus.purchasedCount > prevPurchasedRef.current;
      prevPurchasedRef.current = null;
      setPaymentProcessingState(false);
      setMessage(confirmed ? "Payment confirmed. The pair is sold to you." : "Hold expired before payment webhook arrived.");
    }
  }

  async function buy() {
    if (!userId || !sneakerId || buying) return;
    setBuying(true);
    const response = await fetch("/api/drop/buy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, sneakerId }) });
    const body = await response.json();
    setMessage(response.ok ? body.kind === "HOLD" ? "Pair held for five minutes." : "That pair is held. You are now in its waiting queue." : body.error);
    await Promise.all([refreshPairs(), refreshStatus()]);
    setBuying(false);
  }

  async function pay() {
    if (!userId || !status?.hold || buying || paymentProcessing) return;
    setBuying(true);
    // Snapshot the count so we can confirm the purchase completed vs hold expired.
    prevPurchasedRef.current = status.purchasedCount;
    const response = await fetch("/api/payments/fake", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, holdId: status.hold.id }) });
    const body = await response.json();
    if (response.ok) {
      // The fake provider accepted the payment initiation and will deliver a webhook
      // asynchronously — possibly late, duplicated, or out of order. Show which scenario
      // was chosen so the behaviour is visible in the UI.
      const scenarioLabel: Record<string, string> = {
        "normal": "normal delayed webhook",
        "out-of-order": "out-of-order (SUCCESS then late PENDING)",
        "duplicate": "duplicate SUCCESS delivered twice",
      };
      const label = scenarioLabel[body.scenario as string] ?? body.scenario;
      setPaymentProcessingState(true);
      setMessage(`Payment initiated — scenario: ${label}. Polling for webhook confirmation…`);
    } else {
      prevPurchasedRef.current = null;
      setMessage(body.error === "PURCHASE_LIMIT" ? "Purchase limit reached." : body.error ?? "Payment failed");
    }
    await Promise.all([refreshPairs(), refreshStatus()]);
    setBuying(false);
  }

  useEffect(() => { void refreshPairs(); }, [userId]);
  useEffect(() => { void refreshStatus(); const timer = setInterval(() => { void refreshStatus(); void refreshPairs(); }, 3000); return () => clearInterval(timer); }, [userId, sneakerId]);
  useEffect(() => { if (!status?.hold) { setRemaining(null); return; } const tick = () => setRemaining(Math.max(0, Math.ceil((new Date(status.hold!.expiresAt).getTime() - Date.now()) / 1000))); tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer); }, [status?.hold]);

  const formatted = remaining === null ? "--:--" : `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  const queuePosition = status?.queue.position ?? selectedSneaker?.userQueue?.position ?? null;
  const hasNoPairs = !loadingPairs && sneakers.length === 0;

  const atLimit = status !== null && status.purchasedCount >= 2;

  const buttonLabel = buying
    ? "PROCESSING..."
    : paymentProcessing
    ? "AWAITING CONFIRMATION..."
    : status?.hold
    ? "PAY NOW (FAKE CHECKOUT)"
    : atLimit
    ? "LIMIT REACHED"
    : "HOLD THIS PAIR";

  return (
    <main className="drop-shell">
      <section className="drop-panel">
        <header className="drop-header">
          <div><p className="eyebrow">SNEAK / 001</p><p className="drop-meta">LIVE DROP <span className="live-dot" /> {availableCount} / {sneakers.length || 20} AVAILABLE</p></div>
          <p className="drop-date">AFTERGLOW 01<br />LIMITED EDITION</p>
        </header>
        <div className="hero-copy"><p className="eyebrow">THE PAIR IS THE TICKET</p><h1>Afterglow<br /><span>01</span></h1><p className="intro">Twenty individually numbered pairs. Pick yours, then stay close to the queue.</p></div>
        <section className="control-panel" aria-label="Drop controls">
          <label className="field-label">Your user ID<input value={userId} onChange={(event) => { setUserId(event.target.value); prevQueuePositionRef.current = undefined; }} placeholder="Paste your user ID" /></label>
          <div className="pair-heading"><div><p className="field-label">Choose a pair</p><p className="field-hint">Availability updates every three seconds.</p></div><span className="pair-count">{availableCount} available</span></div>
          {hasNoPairs ? <div className="empty-state">No pairs have been seeded yet. Run the seed command to open the drop.</div> : <div className="pair-list">{sneakers.map((sneaker, index) => <button key={sneaker.id} className={`pair-option ${sneaker.id === sneakerId ? "selected" : ""} ${sneaker.soldOut ? "sold" : ""}`} onClick={() => { setSneakerId(sneaker.id); setStatus(null); prevQueuePositionRef.current = undefined; }}><span className="pair-number">{String(index + 1).padStart(2, "0")}</span><span className="pair-name">{sneaker.name}</span><span className={`pair-state ${sneaker.available ? "available" : "held"}`}>{sneaker.soldOut ? "Sold out" : sneaker.userQueue ? `Queue #${sneaker.userQueue.position}` : sneaker.userHold ? "Your hold" : sneaker.available ? "Available" : `${sneaker.waitingCount} waiting`}</span></button>)}</div>}
        </section>
        <div className="stats"><div><span>Selected pair</span><strong>{selectedSneaker?.name.replace("Afterglow 01 - ", "") ?? "--"}</strong></div><div><span>Your purchases</span><strong>{status ? `${status.purchasedCount} / 2` : "-- / 2"}</strong></div></div>
        <button className="buy-button" onClick={paymentProcessing ? undefined : (status?.hold ? pay : buy)} disabled={!userId || !sneakerId || buying || hasNoPairs || selectedSneaker?.soldOut || paymentProcessing || atLimit}>{buttonLabel}<span>↗</span></button>
        <div className={`claim-state ${queuePosition ? "is-queued" : ""}`}><div><span className="state-label">{paymentProcessing ? "Payment status" : status?.hold ? "Payment window" : queuePosition ? "Waiting queue" : atLimit ? "Purchase limit" : selectedSneaker?.soldOut ? "Pair status" : selectedSneaker?.available ? "Pair status" : "Pair unavailable"}</span><strong>{paymentProcessing ? "Webhook pending…" : status?.hold ? `${formatted} remaining` : queuePosition ? `Position #${queuePosition}` : atLimit ? "Limit reached" : selectedSneaker?.soldOut ? "Sold out" : selectedSneaker?.available ? "Ready to hold" : "Join the queue"}</strong></div><p>{message}</p></div>
      </section>
    </main>
  );
}
