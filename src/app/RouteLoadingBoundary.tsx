import { Component, Suspense, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

/** Failed/offline chunk loads should leave a way back, never a blank screen. */
export class RouteLoadingBoundary extends Component<
  { children: ReactNode; reloadHref: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="grid min-h-dvh place-items-center bg-canvas p-6 text-ink">
          <section role="alert" className="surface-card w-full max-w-sm p-5">
            <h1 className="font-display text-xl font-bold">This screen couldn’t open</h1>
            <p className="mt-2 text-sm text-muted">
              If you’re offline, reconnect and try again. Your saved data hasn’t been cleared.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a className="primary-button" href={this.props.reloadHref}>
                Reload this page
              </a>
              <a className="secondary-button" href="/">
                Go home
              </a>
            </div>
          </section>
        </main>
      );
    }

    return (
      <Suspense
        fallback={
          <div role="status" className="grid min-h-dvh place-items-center bg-canvas text-brand">
            <div className="flex items-center gap-3">
              <Loader2
                aria-hidden="true"
                className="size-6 animate-spin motion-reduce:animate-none"
              />
              <span>Opening screen…</span>
            </div>
          </div>
        }
      >
        {this.props.children}
      </Suspense>
    );
  }
}
