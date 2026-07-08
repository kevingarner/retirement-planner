import { useEffect, useState } from 'react';

// Validated default palette from the dataviz reference (light + dark selected sets)
export interface Theme {
  mode: 'light' | 'dark';
  surface: string;
  page: string;
  ink: string;
  ink2: string;
  muted: string;
  grid: string;
  axis: string;
  series: string[]; // fixed categorical order — never cycled
  seqBand: string; // light sequential step for MC bands
  seqBandMid: string;
  seqLine: string; // dark sequential step for the median line
  good: string;
  critical: string;
}

export const lightTheme: Theme = {
  mode: 'light',
  surface: '#fcfcfb',
  page: '#f9f9f7',
  ink: '#0b0b0b',
  ink2: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  series: ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834'],
  seqBand: '#cde2fb',
  seqBandMid: '#86b6ef',
  seqLine: '#1c5cab',
  good: '#0ca30c',
  critical: '#d03b3b',
};

export const darkTheme: Theme = {
  mode: 'dark',
  surface: '#1a1a19',
  page: '#0d0d0d',
  ink: '#ffffff',
  ink2: '#c3c2b7',
  muted: '#898781',
  grid: '#2c2c2a',
  axis: '#383835',
  series: ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9', '#e66767', '#d55181', '#d95926'],
  seqBand: '#0d366b',
  seqBandMid: '#1c5cab',
  seqLine: '#86b6ef',
  good: '#0ca30c',
  critical: '#d03b3b',
};

export function useTheme(): Theme {
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const [dark, setDark] = useState(query.matches);
  useEffect(() => {
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }, [query]);
  return dark ? darkTheme : lightTheme;
}
