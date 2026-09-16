import { Navigate, Route, Routes } from "react-router-dom";
import { AuthenticatedRoute } from "../components/AuthenticatedRoute";
import { AdminPage } from "../pages/AdminPage";
import { AlertsPage } from "../pages/AlertsPage";
import { BookingPage } from "../pages/BookingPage";
import { CreateTripPage } from "../pages/CreateTripPage";
import { DemoTripPage } from "../pages/DemoTripPage";
import { DocumentPage } from "../pages/DocumentPage";
import { FlightPage } from "../pages/FlightPage";
import { HomePage } from "../pages/HomePage";
import { JoinPage } from "../pages/JoinPage";
import { ProfilePage } from "../pages/ProfilePage";
import { QuickAddPage } from "../pages/QuickAddPage";
import { ReadinessPage } from "../pages/ReadinessPage";
import { SignInPage } from "../pages/SignInPage";
import { TripPage } from "../pages/TripPage";
import { TripDocumentsPage } from "../pages/TripDocumentsPage";
import { TripReservationsPage } from "../pages/TripReservationsPage";
import { TripsPage } from "../pages/TripsPage";
import { VaultPage } from "../pages/VaultPage";
import { WelcomePage } from "../pages/WelcomePage";
import { RootRoute } from "../components/RootRoute";
import { SignedOutOnlyRoute } from "../components/SignedOutOnlyRoute";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRoute />} />
      <Route element={<SignedOutOnlyRoute />}>
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/preview" element={<DemoTripPage />} />
        <Route path="/sign-in" element={<SignInPage />} />
      </Route>
      <Route path="/admin/sign-in" element={<SignInPage admin />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/admin/airlines" element={<AdminPage section="airlines" />} />
      <Route path="/admin/airports" element={<AdminPage section="airports" />} />
      <Route path="/admin/vendors" element={<AdminPage section="vendors" />} />
      <Route path="/admin/suggestions" element={<AdminPage section="suggestions" />} />
      <Route path="/admin/defaults" element={<AdminPage section="defaults" />} />
      <Route path="/admin/appearance" element={<AdminPage section="appearance" />} />
      <Route path="/admin/releases" element={<AdminPage section="releases" />} />
      <Route element={<AuthenticatedRoute />}>
        <Route path="/home" element={<HomePage />} />
        <Route path="/trips" element={<TripsPage />} />
        <Route path="/trips/new" element={<CreateTripPage />} />
        <Route path="/trips/:tripId" element={<TripPage />} />
        <Route path="/trips/:tripId/reservations" element={<TripReservationsPage />} />
        <Route path="/trips/:tripId/documents" element={<TripDocumentsPage />} />
        <Route path="/trips/:tripId/bookings/:bookingId" element={<BookingPage />} />
        <Route path="/trips/:tripId/flights/:flightLegId" element={<FlightPage />} />
        <Route path="/trips/:tripId/readiness" element={<ReadinessPage />} />
        <Route path="/trips/:tripId/documents/:documentId" element={<DocumentPage />} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/add" element={<QuickAddPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/vault" element={<VaultPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
