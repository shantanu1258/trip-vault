import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { UNSAFE_DataRouterContext, useBlocker } from "react-router-dom";
import { useConfirmDialog } from "./ConfirmDialogProvider";

/** Keep input in memory while the user decides; never persist sensitive form data. */
export function useUnsavedEventGuard(enabled: boolean, saving: boolean) {
  const confirm = useConfirmDialog();
  const dirtyRef = useRef(false);
  const pending = useRef<Promise<boolean> | null>(null);
  const [dirty, setDirty] = useState(false);
  const active = useRef(false);
  active.current = enabled && (dirty || saving);
  const clear = useCallback(() => {
    dirtyRef.current = false;
    active.current = false;
    setDirty(false);
  }, []);
  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    active.current = true;
    setDirty(true);
  }, []);
  const mayLeave = useCallback(async () => {
    // Do not leave a save in flight with an unknown result.
    if (saving) return false;
    if (!enabled || !dirtyRef.current) return true;
    if (!pending.current) {
      pending.current = confirm({
        title: "Discard unsaved event?",
        message:
          "Your event details and selected attachment haven’t been saved. Leave and discard these changes, or keep editing?",
        confirmLabel: "Discard and leave",
        cancelLabel: "Keep editing",
        tone: "danger",
        // The router owns a blocked Back navigation; do not add history entries.
        manageHistory: false
      }).finally(() => {
        pending.current = null;
      });
    }
    const accepted = await pending.current;
    if (accepted) clear();
    return accepted;
  }, [clear, confirm, enabled, saving]);
  const leave = useCallback(
    async (action: () => void) => {
      if (pending.current) return;
      if (await mayLeave()) action();
    },
    [mayLeave]
  );
  useEffect(() => {
    if (!enabled || (!dirty && !saving)) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!active.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, enabled, saving]);

  return { markDirty, clear, leave, active, mayLeave };
}

type Guard = ReturnType<typeof useUnsavedEventGuard>;

function RouterEventGuard({ guard }: { guard: Guard }) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      guard.active.current &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search)
  );
  const asking = useRef(false);
  useEffect(() => {
    if (blocker.state !== "blocked" || asking.current) return;
    asking.current = true;
    void guard.mayLeave().then((accepted) => {
      asking.current = false;
      if (accepted) blocker.proceed();
      else blocker.reset();
    });
  }, [blocker, guard.mayLeave]);
  return null;
}

export function UnsavedEventNavigationGuard({ guard }: { guard: Guard }) {
  // Standalone form/unit-test hosts may not have a data router. The production
  // app uses RouterProvider; local Back and beforeunload work in either host.
  const router = useContext(UNSAFE_DataRouterContext);
  return router ? <RouterEventGuard guard={guard} /> : null;
}
