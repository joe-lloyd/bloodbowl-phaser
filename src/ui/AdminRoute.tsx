import { type ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { isAdminUser } from "../firebase/admin";

export function AdminRoute({ children }: { children: ReactElement }) {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return isAdminUser(user) ? children : <Navigate to="/" replace />;
}
