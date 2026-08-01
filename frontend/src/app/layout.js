import './globals.css';
import { AuthProvider } from '../context/AuthContext';
import Navbar from '../components/Navbar';

export const metadata = {
  title: 'nextBooq | SaaS Multi-Tenant Cafe Reservation Platform',
  description: 'Real-time table availability, best-fit table allocation, and host-stand management for modern cafes.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Navbar />
          <main style={{ minHeight: 'calc(100vh - 70px)' }}>{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
