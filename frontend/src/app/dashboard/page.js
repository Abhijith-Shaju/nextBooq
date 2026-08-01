'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  apiGetCafeBySlug,
  apiGetDailyManifest,
  apiUpdateReservationStatus,
  apiGetTables,
  apiCreateTable,
  apiUpdateTable,
} from '../../lib/api';

export default function HostDashboardPage() {
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState('manifest'); // 'manifest' | 'tables'
  const [cafe, setCafe] = useState(null);
  const [cafeSlug, setCafeSlug] = useState('bistro-central');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Manifest Filter State
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [manifest, setManifest] = useState([]);
  const [updatingId, setUpdatingId] = useState(null);

  // Table Inventory State
  const [tables, setTables] = useState([]);
  const [newTableNum, setNewTableNum] = useState('');
  const [newTableCap, setNewTableCap] = useState(2);

  useEffect(() => {
    loadDashboardData();
  }, [cafeSlug, selectedDate, activeTab]);

  const loadDashboardData = async () => {
    setLoading(true);
    setError('');
    try {
      // 1. Load Cafe Info
      const cafeRes = await apiGetCafeBySlug(cafeSlug);
      const currentCafe = cafeRes.data;
      setCafe(currentCafe);

      // Require staff auth token
      let currentToken = token;
      if (!currentToken) {
        // Fallback demo token token check
        setError('Please log in using an owner/host account in the top navbar.');
        setLoading(false);
        return;
      }

      if (activeTab === 'manifest') {
        const manifestRes = await apiGetDailyManifest(currentCafe._id, currentToken, selectedDate);
        setManifest(manifestRes.data || []);
      } else if (activeTab === 'tables') {
        const tablesRes = await apiGetTables(currentCafe._id, currentToken);
        setTables(tablesRes.data || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (resId, newStatus, currentVersion) => {
    if (!cafe || !token) return;
    setUpdatingId(resId);
    try {
      // OCC status transition passing current version __v
      await apiUpdateReservationStatus(cafe._id, resId, newStatus, currentVersion, token);
      await loadDashboardData(); // Refresh manifest
    } catch (err) {
      alert(`OCC Transition Failure: ${err.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCreateTable = async (e) => {
    e.preventDefault();
    if (!cafe || !token) return;
    try {
      await apiCreateTable(
        cafe._id,
        { table_number: newTableNum, capacity: parseInt(newTableCap, 10) },
        token
      );
      setNewTableNum('');
      setNewTableCap(2);
      await loadDashboardData();
    } catch (err) {
      alert(`Table Creation Failed: ${err.message}`);
    }
  };

  const handleToggleTableStatus = async (tableId, currentStatus) => {
    if (!cafe || !token) return;
    const nextStatus = currentStatus === 'active' ? 'out_of_service' : 'active';
    try {
      await apiUpdateTable(cafe._id, tableId, { status: nextStatus }, token);
      await loadDashboardData();
    } catch (err) {
      alert(`Failed to update table: ${err.message}`);
    }
  };

  const filteredManifest = statusFilter === 'ALL'
    ? manifest
    : manifest.filter((item) => item.status === statusFilter);

  return (
    <div style={{ maxWidth: '1280px', margin: '30px auto', padding: '0 20px' }} className="animate-fade-in">
      {/* Dashboard Top Navigation & Cafe Selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '2rem' }}>Host Stand Dashboard</h1>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '700' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
              LIVE SHIFT
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Real-time shift management, OCC table state transitions, and table inventory floor plan.
          </p>
        </div>

        {/* Tab Controls */}
        <div style={{ display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <button
            onClick={() => setActiveTab('manifest')}
            style={{ padding: '8px 18px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600', background: activeTab === 'manifest' ? 'var(--accent-primary)' : 'transparent', color: '#fff' }}
          >
            📋 Daily Manifest
          </button>
          <button
            onClick={() => setActiveTab('tables')}
            style={{ padding: '8px 18px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600', background: activeTab === 'tables' ? 'var(--accent-primary)' : 'transparent', color: '#fff' }}
          >
            🪑 Table Inventory
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '14px', borderRadius: '12px', marginBottom: '24px', fontSize: '0.9rem' }}>
          ⚠️ {error}
        </div>
      )}

      {/* MANIFEST TAB */}
      {activeTab === 'manifest' && (
        <div>
          {/* Controls Bar */}
          <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            {/* Status Filter Tabs */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {['ALL', 'CONFIRMED', 'CHECKED_IN', 'SEATED', 'COMPLETED', 'CANCELLED', 'HOLD'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '0.78rem',
                    fontWeight: '600',
                    background: statusFilter === status ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.03)',
                    color: statusFilter === status ? '#fff' : 'var(--text-secondary)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  {status}
                </button>
              ))}
            </div>

            {/* Date Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Shift Date:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{ padding: '8px 12px', background: '#1f2937', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          {/* Manifest Table */}
          <div className="glass-panel" style={{ padding: '24px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '12px 16px' }}>Time</th>
                  <th style={{ padding: '12px 16px' }}>Customer</th>
                  <th style={{ padding: '12px 16px' }}>Party</th>
                  <th style={{ padding: '12px 16px' }}>Tables</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px' }}>OCC Version</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Host Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Loading shift manifest...
                    </td>
                  </tr>
                ) : filteredManifest.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No reservations found for {selectedDate} with status: {statusFilter}.
                    </td>
                  </tr>
                ) : (
                  filteredManifest.map((res) => (
                    <tr key={res._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '16px', fontWeight: '700', color: '#34d399' }}>
                        {new Date(res.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ fontWeight: '600', color: '#fff' }}>{res.user_id?.name || 'Customer'}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{res.user_id?.phone || res.user_id?.email}</div>
                      </td>
                      <td style={{ padding: '16px', fontWeight: '600' }}>{res.party_size} Guests</td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {res.table_ids?.map((t) => (
                            <span key={t._id || t} style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.06)', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700' }}>
                              {t.table_number || 'T?'}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <span className={`badge badge-${res.status}`}>{res.status}</span>
                      </td>
                      <td style={{ padding: '16px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                        v{res.__v}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          {res.status === 'CONFIRMED' && (
                            <button
                              onClick={() => handleStatusChange(res._id, 'CHECKED_IN', res.__v)}
                              disabled={updatingId === res._id}
                              className="btn-primary btn-action-sm"
                              style={{ background: '#8b5cf6' }}
                            >
                              Check-In
                            </button>
                          )}
                          {(res.status === 'CONFIRMED' || res.status === 'CHECKED_IN') && (
                            <button
                              onClick={() => handleStatusChange(res._id, 'SEATED', res.__v)}
                              disabled={updatingId === res._id}
                              className="btn-primary btn-action-sm"
                              style={{ background: '#ec4899' }}
                            >
                              Seat
                            </button>
                          )}
                          {res.status === 'SEATED' && (
                            <button
                              onClick={() => handleStatusChange(res._id, 'COMPLETED', res.__v)}
                              disabled={updatingId === res._id}
                              className="btn-primary btn-action-sm"
                              style={{ background: '#10b981' }}
                            >
                              Complete
                            </button>
                          )}
                          {['CONFIRMED', 'CHECKED_IN'].includes(res.status) && (
                            <button
                              onClick={() => handleStatusChange(res._id, 'CANCELLED', res.__v)}
                              disabled={updatingId === res._id}
                              className="btn-secondary btn-action-sm"
                              style={{ color: '#ef4444' }}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TABLE INVENTORY TAB */}
      {activeTab === 'tables' && (
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '24px' }}>
          {/* Add Table Form */}
          <div className="glass-panel" style={{ padding: '24px', height: 'fit-content' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Add New Table</h3>
            <form onSubmit={handleCreateTable} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Table Number/Name</label>
                <input
                  type="text"
                  placeholder="e.g. T1, T2, Patio-1"
                  required
                  value={newTableNum}
                  onChange={(e) => setNewTableNum(e.target.value)}
                  style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Capacity (Seating)</label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  required
                  value={newTableCap}
                  onChange={(e) => setNewTableCap(e.target.value)}
                  style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff' }}
                />
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: '8px' }}>
                ➕ Create Table
              </button>
            </form>
          </div>

          {/* Table Floor Cards Grid */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '20px' }}>Floor Inventory ({tables.length} Tables)</h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
              {tables.map((t) => (
                <div
                  key={t._id}
                  style={{
                    background: t.status === 'active' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                    border: `1px solid ${t.status === 'active' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    borderRadius: '12px',
                    padding: '20px',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#fff' }}>Table {t.table_number}</div>
                    <span style={{ fontSize: '0.7rem', fontWeight: '700', padding: '2px 8px', borderRadius: '12px', background: t.status === 'active' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)', color: t.status === 'active' ? '#34d399' : '#f87171' }}>
                      {t.status}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                    👥 Capacity: <strong>{t.capacity} Guests</strong>
                  </div>

                  <button
                    onClick={() => handleToggleTableStatus(t._id, t.status)}
                    className="btn-secondary btn-action-sm"
                    style={{ width: '100%', fontSize: '0.75rem' }}
                  >
                    {t.status === 'active' ? 'Set Out of Service' : 'Activate Table'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
