import { StrictMode, useSyncExternalStore } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { AuthenticatedRoute } from "../components/AuthenticatedRoute";
import { SignedOutOnlyRoute } from "../components/SignedOutOnlyRoute";
import { authReturnPath, signInContinuation } from "../lib/auth/continuation";
import { JoinPage } from "./JoinPage";
import { SignInPage } from "./SignInPage";
import { InvitationContinuation } from "../components/InvitationContinuation";
import { pendingInvitationCode, rememberInvitation } from "../lib/auth/pendingInvitation";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  signIn: vi.fn(),
  redeem: vi.fn(),
  remember: vi.fn(),
  authenticated: false,
  listeners: new Set<() => void>()
}));
vi.mock("../lib/supabase/client", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      signUp: mocks.signUp,
      signInWithPassword: mocks.signIn
    }
  }
}));
vi.mock("../lib/auth/deviceSession", () => ({ rememberDeviceProfile: mocks.remember }));
vi.mock("../lib/auth/useDeviceAuthentication", () => ({
  useDeviceAuthentication: () =>
    useSyncExternalStore(
      (listener) => {
        mocks.listeners.add(listener);
        return () => {
          mocks.listeners.delete(listener);
        };
      },
      () => mocks.authenticated
    )
}));
vi.mock("../features/workspace/api", () => ({
  redeemInvitation: mocks.redeem,
  normalizeJoinCode: (code: string) => code.replace(/[^0-9A-Z]/gi, "").toUpperCase()
}));
vi.mock("../components/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock("../components/StoragePermissionPrompt", () => ({ StoragePermissionPrompt: () => null }));
vi.mock("../components/ThemeToggle", () => ({ ThemeToggle: () => null }));

const invite = "/join?code=ABCD-EFGH-JKMN-PQRS";
function Location() {
  return (
    <output aria-label="Current route">
      {useLocation().pathname}
      {useLocation().search}
    </output>
  );
}
function mount(path = invite) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <QueryClientProvider
          client={
            new QueryClient({
              defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
            })
          }
        >
          <Location />
          <InvitationContinuation>
            <Routes>
              <Route element={<AuthenticatedRoute />}>
                <Route path="/join" element={<JoinPage />} />
                <Route path="/add" element={<h1>Trips</h1>} />
                <Route path="/trips/:id" element={<h1>Joined trip</h1>} />
              </Route>
              <Route element={<SignedOutOnlyRoute />}>
                <Route path="/sign-in" element={<SignInPage />} />
              </Route>
              <Route
                path="/"
                element={
                  <>
                    <h1>Home</h1>
                    <Link to="/sign-in">Go to sign in</Link>
                  </>
                }
              />
              <Route path="/admin/sign-in" element={<SignInPage admin />} />
            </Routes>
          </InvitationContinuation>
        </QueryClientProvider>
      </MemoryRouter>
    </StrictMode>
  );
}
async function fillSignup() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /create an account/i }));
  await user.type(screen.getByLabelText("Your name"), "Sam Traveler");
  await user.type(screen.getByLabelText("Email address"), "sam@example.com");
  await user.type(screen.getByLabelText("Password"), "test-password-123");
  await user.type(screen.getByLabelText("Confirm password"), "test-password-123");
  await user.click(screen.getByRole("button", { name: "Create account" }));
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  mocks.authenticated = false;
  mocks.listeners.clear();
  mocks.redeem.mockResolvedValue("test-trip");
});

it("remembers an invitation across browsing, refresh and immediate signup without email confirmation", async () => {
  const user = userEvent.setup();
  mocks.signUp.mockImplementation(async () => {
    mocks.authenticated = true;
    mocks.listeners.forEach((listener) => listener());
    return { data: { session: { user: { id: "sam" } } }, error: null };
  });
  const view = mount();
  await screen.findByRole("heading", { name: "Welcome back" });
  expect(screen.getByLabelText("Current route")).toHaveTextContent(signInContinuation(invite));
  await user.click(screen.getByRole("link", { name: "Back" }));
  await screen.findByRole("heading", { name: "Home" });
  await user.click(screen.getByRole("link", { name: "Go to sign in" }));
  expect(screen.getByLabelText("Current route").textContent).toBe("/sign-in");
  view.unmount();
  mount("/sign-in");
  await fillSignup();
  await screen.findByRole("heading", { name: "Join a trip" });
  expect(mocks.signUp.mock.calls[0][0].options).toEqual({ data: { display_name: "Sam Traveler" } });
  expect(screen.getByRole("textbox")).toHaveValue("ABCDEFGHJKMNPQRS");
  expect(mocks.redeem).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Join trip" }));
  await screen.findByRole("heading", { name: "Joined trip" });
  expect(mocks.redeem).toHaveBeenCalledTimes(1);
  expect(mocks.redeem.mock.calls[0][0]).toBe("ABCDEFGHJKMNPQRS");
});

it("survives an auth-state redirect before the signup promise resolves", async () => {
  mocks.signUp.mockImplementation(async () => {
    mocks.authenticated = true;
    mocks.listeners.forEach((listener) => listener());
    return { data: { session: { user: { id: "sam" } } }, error: null };
  });
  mount();
  await fillSignup();
  await screen.findByRole("heading", { name: "Join a trip" });
  await userEvent.click(screen.getByRole("button", { name: "Join trip" }));
  expect(await screen.findByRole("heading", { name: "Joined trip" })).toBeVisible();
  expect(mocks.redeem).toHaveBeenCalledTimes(1);
});

it("joins after existing-account sign-in and leaves used/expired codes editable without retry loops", async () => {
  mocks.signIn.mockImplementation(async () => {
    mocks.authenticated = true;
    mocks.listeners.forEach((listener) => listener());
    return { data: { user: { id: "sam" } }, error: null };
  });
  mocks.redeem.mockRejectedValueOnce(
    new Error("This code could not be used. Ask the organizer for a new one.")
  );
  const user = userEvent.setup();
  mount();
  await user.type(await screen.findByLabelText("Email address"), "sam@example.com");
  await user.type(screen.getByLabelText("Password"), "test-password-123");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  await user.click(await screen.findByRole("button", { name: "Join trip" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Ask the organizer");
  expect(mocks.redeem).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Current route")).not.toHaveTextContent("autoJoin");
  const code = screen.getByRole("textbox");
  await user.clear(code);
  await user.type(code, "QRST-UVWX-2345-6789");
  await user.click(screen.getByRole("button", { name: "Join trip" }));
  await screen.findByRole("heading", { name: "Joined trip" });
  expect(mocks.redeem).toHaveBeenCalledTimes(2);
});

it("keeps already-signed-in invite links as confirmation, not silent redemption", async () => {
  mocks.authenticated = true;
  mount();
  await screen.findByRole("heading", { name: "Join a trip" });
  await waitFor(() => expect(screen.getByRole("button", { name: "Join trip" })).toBeEnabled());
  expect(mocks.redeem).not.toHaveBeenCalled();
});

it("resumes on the ordinary home page after later login without requiring a callback query", async () => {
  rememberInvitation("ABCD-EFGH-JKMN-PQRS");
  mocks.authenticated = true;
  mount("/");
  await screen.findByRole("heading", { name: "Join a trip" });
  expect(screen.getByRole("textbox")).toHaveValue("ABCDEFGHJKMNPQRS");
  expect(pendingInvitationCode()).toBeNull();
  expect(mocks.redeem).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("link", { name: "Back" }));
  expect(mocks.redeem).not.toHaveBeenCalled();
});

it("does not consume trip invites or show signup verification in Admin", async () => {
  rememberInvitation("ABCD-EFGH-JKMN-PQRS");
  mocks.authenticated = true;
  mount("/admin/sign-in");
  await screen.findByRole("heading", { name: "Administrator sign in" });
  expect(pendingInvitationCode()).toBe("ABCDEFGHJKMNPQRS");
  expect(screen.queryByRole("heading", { name: "Verify your email" })).not.toBeInTheDocument();
});

it("rejects external and looping auth continuations", () => {
  for (const next of [
    "https://evil.invalid",
    "//evil.invalid",
    "/\\evil.invalid",
    "/sign-in?next=/join",
    "/SIGN-IN/",
    "/sign%2din",
    "/%invalid",
    "/welcome",
    "/admin/sign-in"
  ]) {
    expect(authReturnPath(`?${new URLSearchParams({ next })}`)).toBe("/");
  }
  expect(authReturnPath("", { from: "/vault?type=ticket" })).toBe("/vault?type=ticket");
  expect(signInContinuation("/join?code=bad")).not.toContain("autoJoin");
});
