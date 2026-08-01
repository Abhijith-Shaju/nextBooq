'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiLogin, apiRegister } from '../lib/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load stored credentials on boot
    const storedToken = localStorage.getItem('nextbooq_token');
    const storedUser = localStorage.getItem('nextbooq_user');

    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch (err) {
        localStorage.removeItem('nextbooq_token');
        localStorage.removeItem('nextbooq_user');
      }
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const res = await apiLogin(email, password);
    const { token: jwtToken, user: userData } = res.data;

    setToken(jwtToken);
    setUser(userData);
    localStorage.setItem('nextbooq_token', jwtToken);
    localStorage.setItem('nextbooq_user', JSON.stringify(userData));

    return userData;
  };

  const register = async (name, email, phone, password) => {
    const res = await apiRegister(name, email, phone, password);
    const { token: jwtToken, user: userData } = res.data;

    setToken(jwtToken);
    setUser(userData);
    localStorage.setItem('nextbooq_token', jwtToken);
    localStorage.setItem('nextbooq_user', JSON.stringify(userData));

    return userData;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('nextbooq_token');
    localStorage.removeItem('nextbooq_user');
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
