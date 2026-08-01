'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout, login, register } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', password: '' });
  const [authError, setAuthError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (isRegister) {
        await register(formData.name, formData.email, formData.phone, formData.password);
      } else {
        await login(formData.email, formData.password);
      }
      setShowAuthModal(false);
      setFormData({ name: '', email: '', phone: '', password: '' });
    } catch (err) {
      setAuthError(err.message || 'Authentication failed');
    }
  };

  return (
    <nav style={{
      position: 'sticky',
      top: 0,
      zIndex: 100,
      background: 'rgba(11, 15, 25, 0.85)',
      backdropFilter: 'blur(16px)',
      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      padding: '14px 28px',
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        {/* Brand Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #10b981, #06b6d4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: '800',
            color: '#fff',
            fontSize: '1.2rem',
            boxShadow: '0 0 15px rgba(16, 185, 129, 0.4)',
          }}>
            n
          </div>
          <span style={{ fontSize: '1.4rem', fontWeight: '800', letterSpacing: '-0.02em' }}>
            next<span style={{ color: '#10b981' }}>Booq</span>
          </span>
          <span style={{
            background: 'rgba(16, 185, 129, 0.12)',
            color: '#34d399',
            fontSize: '0.65rem',
            fontWeight: '700',
            padding: '2px 8px',
            borderRadius: '12px',
            border: '1px solid rgba(16, 185, 129, 0.2)',
          }}>
            SaaS v1.1
          </span>
        </Link>

        {/* Navigation Links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <Link href="/cafes/bistro-central" style={{ fontSize: '0.9rem', fontWeight: '500', color: 'var(--text-secondary)' }}>
            🍽️ Customer Booking
          </Link>
          <Link href="/dashboard" style={{ fontSize: '0.9rem', fontWeight: '500', color: 'var(--text-secondary)' }}>
            📊 Host Stand Dashboard
          </Link>

          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--accent-primary)', fontWeight: '600' }}>
                👤 {user.name}
              </span>
              <button onClick={logout} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                Logout
              </button>
            </div>
          ) : (
            <button onClick={() => setShowAuthModal(true)} className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
              Login / Sign Up
            </button>
          )}
        </div>
      </div>

      {/* Auth Modal */}
      {showAuthModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '28px' }}>
            <h3 style={{ fontSize: '1.3rem', marginBottom: '16px', color: 'var(--text-primary)' }}>
              {isRegister ? 'Create Account' : 'Welcome Back'}
            </h3>

            {authError && (
              <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', padding: '10px', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '14px' }}>
                {authError}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {isRegister && (
                <input
                  type="text"
                  placeholder="Full Name"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff' }}
                />
              )}
              <input
                type="email"
                placeholder="Email Address"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff' }}
              />
              {isRegister && (
                <input
                  type="text"
                  placeholder="Phone Number (+1...)"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff' }}
                />
              )}
              <input
                type="password"
                placeholder="Password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff' }}
              />

              <button type="submit" className="btn-primary" style={{ marginTop: '8px', width: '100%' }}>
                {isRegister ? 'Register' : 'Login'}
              </button>
            </form>

            <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                onClick={() => { setIsRegister(!isRegister); setAuthError(''); }}
                style={{ background: 'none', color: '#10b981', fontWeight: '600', padding: 0 }}
              >
                {isRegister ? 'Log in' : 'Sign up'}
              </button>
            </div>

            <button
              onClick={() => setShowAuthModal(false)}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', color: 'var(--text-muted)', fontSize: '1.2rem' }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
