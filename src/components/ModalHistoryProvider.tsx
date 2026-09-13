import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

const SESSION_KEY = "__tripVaultModalSession";
const DEPTH_KEY = "__tripVaultModalDepth";
type Registration = { id: symbol; close: () => void };
type RegisterModal = (close: () => void) => () => void;
const ModalHistoryContext = createContext<RegisterModal | null>(null);

const stateObject = () => history.state && typeof history.state === "object" ? history.state : {};
const historyDepth = (session: string) => history.state?.[SESSION_KEY] === session ? Number(history.state?.[DEPTH_KEY]) || 0 : 0;

export function ModalHistoryProvider({ children }: { children: ReactNode }) {
  const session = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const registrations = useRef<Registration[]>([]);
  const currentDepth = useRef(0);
  const traversalTarget = useRef<number | null>(null);
  const syncQueued = useRef(false);
  const reconcileRef = useRef<() => void>(() => undefined);

  const scheduleReconcile = useCallback(() => {
    if (syncQueued.current) return;
    syncQueued.current = true;
    queueMicrotask(() => { syncQueued.current = false; reconcileRef.current(); });
  }, []);

  reconcileRef.current = () => {
    if (traversalTarget.current !== null) return;
    const actual = historyDepth(session.current);
    const desired = registrations.current.length;
    currentDepth.current = actual;
    if (desired > actual) {
      for (let depth = actual + 1; depth <= desired; depth += 1) history.pushState({ ...stateObject(), [SESSION_KEY]: session.current, [DEPTH_KEY]: depth }, "", location.href);
      currentDepth.current = desired;
    } else if (desired < actual) {
      traversalTarget.current = desired;
      history.go(desired - actual);
    }
  };

  const register = useCallback<RegisterModal>((close) => {
    const registration = { id: Symbol("modal"), close };
    registrations.current.push(registration);
    scheduleReconcile();
    return () => { registrations.current = registrations.current.filter((item) => item.id !== registration.id); scheduleReconcile(); };
  }, [scheduleReconcile]);

  useEffect(() => {
    const handleBack = () => {
      const previous = currentDepth.current;
      const next = historyDepth(session.current);
      currentDepth.current = next;
      if (traversalTarget.current !== null) { traversalTarget.current = null; scheduleReconcile(); return; }
      if (next < previous) {
        registrations.current.slice(Math.max(0, registrations.current.length - (previous - next))).reverse().forEach((registration) => registration.close());
        return;
      }
      scheduleReconcile();
    };
    addEventListener("popstate", handleBack);
    return () => removeEventListener("popstate", handleBack);
  }, [scheduleReconcile]);

  return <ModalHistoryContext.Provider value={register}>{children}</ModalHistoryContext.Provider>;
}

export function useModalHistory(onClose: () => void) {
  const register = useContext(ModalHistoryContext);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => { closeRef.current = onClose; }, [onClose]);
  useLayoutEffect(() => register?.(() => closeRef.current()), [register]);
}
