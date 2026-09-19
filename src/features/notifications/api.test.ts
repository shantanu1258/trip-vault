import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), getUser: vi.fn() }));
vi.mock("../../lib/supabase/client", () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from, auth: { getUser: mocks.getUser } }
}));
vi.mock("./config", async () => ({ ...(await vi.importActual("./config")), pushEnabled: true }));
import { disablePush, enablePush } from "./api";

const unsubscribe = vi.fn();
const subscribe = vi.fn();
const permission = vi.fn();
const originalWorker = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
afterEach(() => {
  vi.unstubAllGlobals();
  if (originalWorker) Object.defineProperty(navigator, "serviceWorker", originalWorker);
  else Reflect.deleteProperty(navigator, "serviceWorker");
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", { requestPermission: permission });
  const subscription = {
    endpoint: "https://fcm.googleapis.com/device",
    toJSON: () => ({ keys: { p256dh: "public", auth: "auth" } }),
    unsubscribe
  };
  subscribe.mockResolvedValue(subscription);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration: vi.fn().mockResolvedValue({
        active: {},
        pushManager: { subscribe, getSubscription: vi.fn().mockResolvedValue(null) }
      })
    }
  });
  permission.mockResolvedValue("granted");
  unsubscribe.mockResolvedValue(true);
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user" } }, error: null });
  mocks.rpc.mockResolvedValue({ data: "device-id", error: null });
});

describe("device subscription", () => {
  it("asks permission on click and registers only browser-generated subscription data", async () => {
    const result = await enablePush();
    expect(permission).toHaveBeenCalledOnce();
    expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(mocks.rpc).toHaveBeenCalledWith("register_push_subscription", {
      p_endpoint: "https://fcm.googleapis.com/device",
      p_p256dh: "public",
      p_auth: "auth"
    });
    expect(result.id).toBe("device-id");
  });
  it("does not subscribe when permission is denied", async () => {
    permission.mockResolvedValue("denied");
    await expect(enablePush()).rejects.toThrow("not allowed");
    expect(subscribe).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("unsubscribes again if secure server registration fails", async () => {
    mocks.rpc.mockResolvedValue({ error: new Error("RLS") });
    await expect(enablePush()).rejects.toThrow("Could not save");
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it("invalidates browser delivery even if deleting the server subscription fails", async () => {
    const getRegistration = vi.mocked(navigator.serviceWorker.getRegistration);
    getRegistration.mockResolvedValue({
      pushManager: {
        getSubscription: async () => ({
          endpoint: "https://fcm.googleapis.com/device",
          unsubscribe
        })
      }
    } as unknown as ServiceWorkerRegistration);
    mocks.from.mockReturnValue({
      delete: () => ({ eq: () => Promise.resolve({ error: new Error("offline") }) })
    });
    await disablePush();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(mocks.from).toHaveBeenCalledWith("push_subscriptions");
  });
});
