'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { useCafeApplications } from '@/hooks/admin/use-cafe-applications';

export default function CafeApplicationsPage() {
  const { data: applications = [], isLoading } = useCafeApplications('pending');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Cafe applications</h2>
        <p className="text-sm text-slate-600">Applications waiting for review.</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-600">Loading…</p>
      ) : applications.length === 0 ? (
        <p className="text-sm text-slate-600">No applications waiting for review.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Cafe</th>
                <th className="px-4 py-3">Requested slug</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((application) => (
                <tr key={application.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/cafe-applications/${application.id}`}
                      className="font-mono text-slate-700 underline"
                    >
                      {application.application_ref}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium">{application.cafe_name}</td>
                  <td className="px-4 py-3 text-slate-600">/{application.cafe_slug}</td>
                  <td className="px-4 py-3 text-slate-600">{application.address?.city || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {format(new Date(application.created_at), 'MMM d, yyyy')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
