import { Navigate } from 'react-router-dom';
import { getAllowedStoredUser } from '../utils/currentUser';

export default function ProtectedRoute({ children }) {
  const user = getAllowedStoredUser();
  return user ? children : <Navigate to="/login" replace />;
}
