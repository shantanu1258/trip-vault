// Called only after the user explicitly accepts a reload. Never clear caches,
// registrations, IndexedDB or notification subscriptions to apply an update.
export function reloadWithServiceWorkerUpdate({
  getRegistration,
  reload,
  timeoutMs = 12000
}: {
  getRegistration: () => Promise<ServiceWorkerRegistration | undefined>;
  reload: () => void;
  timeoutMs?: number;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    let finished = false;
    let worker: ServiceWorker | undefined;
    let activationRequested = false;
    const cleanup = () => {
      clearTimeout(timer);
      worker?.removeEventListener("statechange", checkState);
    };
    const fail = () => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(
        new Error(
          "The update did not finish. Check your connection and try again. Your saved data has not been cleared."
        )
      );
    };
    const complete = () => {
      if (finished) return;
      try {
        reload();
        finished = true;
        cleanup();
        resolve();
      } catch {
        fail();
      }
    };
    function checkState() {
      if (finished || !worker) return;
      if (worker.state === "activated") complete();
      else if (worker.state === "redundant") fail();
      else if (worker.state === "installed" && !activationRequested) {
        activationRequested = true;
        try {
          worker.postMessage({ type: "SKIP_WAITING" });
        } catch {
          fail();
        }
      }
    }
    const timer = setTimeout(fail, timeoutMs);
    // Include registration lookup in the timeout, and ignore late results after failure.
    Promise.resolve()
      .then(getRegistration)
      .then((registration) => {
        if (finished) return;
        worker =
          registration?.waiting ?? registration?.installing ?? registration?.active ?? undefined;
        // Another tab may already have activated the update. The old prompt still
        // needs an actual navigation, even though there is no waiting worker to message.
        if (!worker) {
          complete();
          return;
        }
        worker.addEventListener("statechange", checkState);
        checkState();
      })
      .catch(fail);
  });
}
