import { afterEach, expect, it, vi } from "vitest";
import { reloadWithServiceWorkerUpdate } from "./update";

function fakeWorker(initial: ServiceWorkerState) {
  const worker = Object.assign(new EventTarget(), { state: initial, postMessage: vi.fn() });
  const remove = vi.spyOn(worker, "removeEventListener");
  return {
    worker: worker as unknown as ServiceWorker,
    postMessage: worker.postMessage,
    remove,
    change: (state: ServiceWorkerState) => {
      worker.state = state;
      worker.dispatchEvent(new Event("statechange"));
    }
  };
}
afterEach(() => vi.useRealTimers());

it("activates a waiting update and reloads only after activation, then removes listeners", async () => {
  const sw = fakeWorker("installed");
  const reload = vi.fn();
  const work = reloadWithServiceWorkerUpdate({
    getRegistration: async () => ({ waiting: sw.worker }) as ServiceWorkerRegistration,
    reload
  });
  await vi.waitFor(() => expect(sw.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" }));
  sw.change("activating");
  expect(reload).not.toHaveBeenCalled();
  sw.change("activated");
  await work;
  expect(reload).toHaveBeenCalledOnce();
  expect(sw.remove).toHaveBeenCalled();
  sw.change("activated");
  expect(reload).toHaveBeenCalledOnce();
});

it("handles an installing worker and a stale prompt whose worker already activated", async () => {
  const sw = fakeWorker("installing");
  const reload = vi.fn();
  const registration = { installing: sw.worker } as ServiceWorkerRegistration;
  const getRegistration = vi.fn().mockResolvedValue(registration);
  const work = reloadWithServiceWorkerUpdate({ getRegistration, reload });
  await vi.waitFor(() => expect(getRegistration).toHaveBeenCalled());
  expect(sw.postMessage).not.toHaveBeenCalled();
  sw.change("installed");
  expect(sw.postMessage).toHaveBeenCalledOnce();
  sw.change("activated");
  await work;
  getRegistration.mockResolvedValue({ active: sw.worker });
  await reloadWithServiceWorkerUpdate({ getRegistration, reload });
  expect(reload).toHaveBeenCalledTimes(2);
  expect(sw.postMessage).toHaveBeenCalledOnce();
});

it("times out safely and ignores late activation; a retry can reload the active version", async () => {
  vi.useFakeTimers();
  const sw = fakeWorker("installed");
  const reload = vi.fn();
  const getRegistration = vi.fn().mockResolvedValue({ waiting: sw.worker });
  const work = reloadWithServiceWorkerUpdate({ getRegistration, reload });
  const rejected = expect(work).rejects.toThrow("Your saved data has not been cleared");
  await vi.advanceTimersByTimeAsync(12000);
  await rejected;
  expect(sw.remove).toHaveBeenCalled();
  sw.change("activated");
  expect(reload).not.toHaveBeenCalled();
  getRegistration.mockResolvedValue({ active: sw.worker });
  await reloadWithServiceWorkerUpdate({ getRegistration, reload });
  expect(reload).toHaveBeenCalledOnce();
});

it("reports lookup/activation failures and bounds registration lookup without a late reload", async () => {
  vi.useFakeTimers();
  const reload = vi.fn();
  await expect(
    reloadWithServiceWorkerUpdate({
      getRegistration: async () => {
        throw new Error("lookup failed");
      },
      reload
    })
  ).rejects.toThrow("try again");
  const sw = fakeWorker("redundant");
  await expect(
    reloadWithServiceWorkerUpdate({
      getRegistration: async () => ({ waiting: sw.worker }) as ServiceWorkerRegistration,
      reload
    })
  ).rejects.toThrow("try again");
  let resolveLookup!: (value: undefined) => void;
  const work = reloadWithServiceWorkerUpdate({
    getRegistration: () =>
      new Promise((resolve) => {
        resolveLookup = resolve;
      }),
    reload
  });
  const rejected = expect(work).rejects.toThrow("try again");
  await vi.advanceTimersByTimeAsync(12000);
  await rejected;
  resolveLookup(undefined);
  await Promise.resolve();
  expect(reload).not.toHaveBeenCalled();
});
