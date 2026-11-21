// Dropdown values from Settings > Dropdown Values (GET /api/lookups), cached per firm.
//   const dd = useDropdowns();
//   dd.options('lead_status', currentValue)  -> active values (+ the current value if it was deactivated)
//   dd.filter('lead_status')                 -> every value, for list filters
//   dd.label('lead_status', code)            -> display label (falls back to a readable code)
import { useEffect, useState } from 'react';
import { api } from './api';
import { useAuth } from './auth';
import { label as prettify } from './format';

const cache = new Map(); // firm key -> Promise<{ lists, values }>
const listeners = new Set();

function load(key) {
  if (!cache.has(key)) cache.set(key, api('/lookups').catch((e) => { cache.delete(key); throw e; }));
  return cache.get(key);
}

// Call after editing values so every open form picks up the change.
export function invalidateDropdowns() {
  cache.clear();
  listeners.forEach((fn) => fn());
}

export function useDropdowns() {
  const { firm } = useAuth();
  const key = String(firm?.id || 0);
  const [data, setData] = useState(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const fn = () => setVersion((v) => v + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  useEffect(() => {
    let alive = true;
    load(key).then((d) => alive && setData(d)).catch(() => alive && setData({ lists: [], values: {} }));
    return () => { alive = false; };
  }, [key, version]);

  const values = (list) => data?.values?.[list] || [];
  return {
    loaded: !!data,
    lists: data?.lists || [],
    values,
    options: (list, current) => values(list)
      .filter((v) => v.is_active || (current != null && v.code === String(current)))
      .map((v) => ({ value: v.code, label: v.is_active ? v.label : `${v.label} (inactive)` })),
    filter: (list) => values(list).map((v) => ({ value: v.code, label: v.label })),
    label: (list, code) => {
      if (code == null || code === '') return '';
      return values(list).find((v) => v.code === String(code))?.label || prettify(String(code));
    },
  };
}
