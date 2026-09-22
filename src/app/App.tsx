import { lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthenticatedRoute } from "../components/AuthenticatedRoute";
import { SignInPage } from "../pages/SignInPage";
import { WelcomePage } from "../pages/WelcomePage";
import { RootRoute } from "../components/RootRoute";
import { SignedOutOnlyRoute } from "../components/SignedOutOnlyRoute";
import { RouteLoadingBoundary } from "./RouteLoadingBoundary";

// Keep the welcome/auth shell small; load feature screens only when visited.
// Workbox still precaches the emitted chunks for installed offline use.
const AdminPage = lazy(() => import("../pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const AlertsPage = lazy(() =>
  import("../pages/AlertsPage").then((m) => ({ default: m.AlertsPage }))
);
const BookingPage = lazy(() =>
  import("../pages/BookingPage").then((m) => ({ default: m.BookingPage }))
);
const CreateTripPage = lazy(() =>
  import("../pages/CreateTripPage").then((m) => ({ default: m.CreateTripPage }))
);
const DemoTripPage = lazy(() =>
  import("../pages/DemoTripPage").then((m) => ({ default: m.DemoTripPage }))
);
const DocumentPage = lazy(() =>
  import("../pages/DocumentPage").then((m) => ({ default: m.DocumentPage }))
);
const FlightPage = lazy(() =>
  import("../pages/FlightPage").then((m) => ({ default: m.FlightPage }))
);
const JoinPage = lazy(() => import("../pages/JoinPage").then((m) => ({ default: m.JoinPage })));
const ProfilePage = lazy(() =>
  import("../pages/ProfilePage").then((m) => ({ default: m.ProfilePage }))
);
const PlanningPage = lazy(() =>
  import("../pages/PlanningPage").then((m) => ({ default: m.PlanningPage }))
);
const ReadinessPage = lazy(() =>
  import("../pages/ReadinessPage").then((m) => ({ default: m.ReadinessPage }))
);
const TripPage = lazy(() => import("../pages/TripPage").then((m) => ({ default: m.TripPage })));
const TripDocumentsPage = lazy(() =>
  import("../pages/TripDocumentsPage").then((m) => ({ default: m.TripDocumentsPage }))
);
const TripReservationsPage = lazy(() =>
  import("../pages/TripReservationsPage").then((m) => ({ default: m.TripReservationsPage }))
);
const TripsPage = lazy(() => import("../pages/TripsPage").then((m) => ({ default: m.TripsPage })));
const VaultPage = lazy(() => import("../pages/VaultPage").then((m) => ({ default: m.VaultPage })));
const AddDocumentPage = lazy(() =>
  import("../pages/AddDocumentPage").then((m) => ({ default: m.AddDocumentPage }))
);

export function App() {
  const location = useLocation();
  return (
    <RouteLoadingBoundary
      key={location.pathname}
      reloadHref={`${location.pathname}${location.search}${location.hash}`}
    >
      <Routes>
        <Route path="/" element={<RootRoute />} />
        <Route path="/preview" element={<DemoTripPage />} />
        <Route element={<SignedOutOnlyRoute />}>
          <Route path="/welcome" element={<WelcomePage />} />
          <Route path="/sign-in" element={<SignInPage />} />
        </Route>
        <Route path="/admin/sign-in" element={<SignInPage admin />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/airlines" element={<AdminPage section="airlines" />} />
        <Route path="/admin/airports" element={<AdminPage section="airports" />} />
        <Route path="/admin/vendors" element={<AdminPage section="vendors" />} />
        <Route path="/admin/operators" element={<AdminPage section="operators" />} />
        <Route path="/admin/suggestions" element={<AdminPage section="suggestions" />} />
        <Route path="/admin/defaults" element={<AdminPage section="defaults" />} />
        <Route path="/admin/appearance" element={<AdminPage section="appearance" />} />
        <Route path="/admin/releases" element={<AdminPage section="releases" />} />
        <Route element={<AuthenticatedRoute />}>
          <Route path="/home" element={<Navigate to="/trips" replace />} />
          <Route path="/trips" element={<TripsPage />} />
          <Route path="/trips/new" element={<CreateTripPage />} />
          <Route path="/trips/:tripId" element={<TripPage />} />
          <Route path="/trips/:tripId/planning/:planningEventId" element={<PlanningPage />} />
          <Route path="/trips/:tripId/reservations" element={<TripReservationsPage />} />
          <Route path="/trips/:tripId/documents" element={<TripDocumentsPage />} />
          <Route path="/trips/:tripId/bookings/:bookingId" element={<BookingPage />} />
          <Route path="/trips/:tripId/flights/:flightLegId" element={<FlightPage />} />
          <Route path="/trips/:tripId/readiness" element={<ReadinessPage />} />
          <Route path="/trips/:tripId/documents/:documentId" element={<DocumentPage />} />
          <Route path="/join" element={<JoinPage />} />
          <Route path="/add" element={<Navigate to="/trips" replace />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/vault" element={<VaultPage />} />
          <Route path="/vault/add" element={<AddDocumentPage />} />
          <Route path="/receive-share" element={<AddDocumentPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </RouteLoadingBoundary>
  );
}
