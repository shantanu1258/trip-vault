// Imported by the existing generated Workbox worker. Keep its offline/update lifecycle.
self.addEventListener("push", (event) => {
  let payload;
  try {
    payload = event.data?.json();
  } catch {
    /* Show a safe generic notification. */
  }
  let destination = "/trips";
  try {
    const url = new URL(payload?.url || "/trips", self.location.origin);
    if (
      url.origin === self.location.origin &&
      /^\/(trips(?:\/|\?|$)|profile$)/.test(url.pathname + url.search)
    ) {
      destination = url.pathname + url.search;
    }
  } catch {
    /* Never navigate to untrusted external destinations. */
  }
  const bodies = {
    event: "A trip event was added or updated. Open Trip Vault to review it.",
    booking: "A booking was updated. Open Trip Vault to review it.",
    cost: "A trip expense was added or updated. Open Trip Vault to review it.",
    reminder: "A timed event starts within the next hour. Open your timeline for details.",
    test: "Notifications are working on this device."
  };
  const cleanText = (value, limit) =>
    typeof value === "string"
      ? value
          .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, limit)
      : "";
  event.waitUntil(
    self.registration.showNotification(cleanText(payload?.title, 200) || "Trip Vault", {
      body:
        cleanText(payload?.body, 360) ||
        bodies[payload?.kind] ||
        "You have a trip update. Open Trip Vault for details.",
      icon: "/icons/wallet-v2-192.png",
      tag: typeof payload?.tag === "string" ? payload.tag.slice(0, 180) : "trip-vault-update",
      data: { url: destination },
      // Replacement retries should not repeatedly make sound or vibrate.
      renotify: false
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const url = new URL(event.notification.data?.url || "/trips", self.location.origin);
      if (url.origin !== self.location.origin) return;
      // Open a separate destination; do not reload an existing tab with an unsaved form.
      await self.clients.openWindow(url.href);
    })()
  );
});
