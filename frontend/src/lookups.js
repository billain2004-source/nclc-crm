// Shared dropdown data for forms and filters, loaded once per firm.
import { useEffect, useState } from 'react';
import { api } from './api';
import { useAuth } from './auth';

export function useLookups(kinds = []) {
  const { firm } = useAuth();
  const [data, setData] = useState({ users: [], companies: [], contacts: [], deals: [], stages: [], currencies: [], countries: [] });
  const key = kinds.join(',');
  useEffect(() => {
    let alive = true;
    (async () => {
      const loaders = {
        users: () => api('/users/lookup'),
        companies: () => api('/companies', { params: { pageSize: 500, sort: 'name', dir: 'asc' } }).then((r) => r.data),
        contacts: () => api('/contacts', { params: { pageSize: 500 } }).then((r) => r.data),
        deals: () => api('/deals', { params: { pageSize: 500, sort: 'name', dir: 'asc' } }).then((r) => r.data),
        stages: () => api('/firm/stages'),
        currencies: () => api('/ref/currencies'),
        countries: () => api('/ref/countries'),
      };
      const out = {};
      await Promise.all(key.split(',').filter(Boolean).map(async (k) => { out[k] = await loaders[k]().catch(() => []); }));
      if (alive) setData((d) => ({ ...d, ...out }));
    })();
    return () => { alive = false; };
  }, [key, firm?.id]);
  return data;
}

export const opts = {
  users: (l) => l.map((u) => ({ value: u.id, label: u.name })),
  companies: (l) => l.map((c) => ({ value: c.id, label: c.name })),
  contacts: (l) => l.map((c) => ({ value: c.id, label: `${c.full_name}${c.company_name ? ' · ' + c.company_name : ''}` })),
  deals: (l) => l.map((d) => ({ value: d.id, label: d.name })),
  stages: (l) => l.map((s) => ({ value: s.id, label: `${s.name} (${s.probability}%)` })),
  currencies: (l) => l.filter((c) => c.is_active).map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` })),
  countries: (l) => l.map((c) => ({ value: c.code, label: c.name })),
  list: (arr) => arr.map((v) => (typeof v === 'string' ? { value: v, label: v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) } : v)),
};
